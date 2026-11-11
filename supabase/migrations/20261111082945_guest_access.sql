-- Guest access, database side. A guest is an anonymous Supabase user who has entered the guest
-- password through claim_guest. This migration only adds things and changes no read policy.
-- See ADR 0005.

-- PostgREST exposes only the schemas in supabase/config.toml's [api] schemas, so nothing in
-- this schema is reachable from the browser. The revokes cover a grant added by mistake later.
CREATE SCHEMA IF NOT EXISTS "private";
ALTER SCHEMA "private" OWNER TO "postgres";
REVOKE ALL ON SCHEMA "private" FROM "anon", "authenticated", PUBLIC;


-- One row at most, holding a bcrypt hash of the guest password. With no row nobody can become a
-- guest. The owner sets the hash in the SQL editor with the snippet in ADR 0005.
CREATE TABLE IF NOT EXISTS "private"."guest_password" (
    "id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
    "hash" "text" NOT NULL,
    "set_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "private"."guests" (
    "user_id" "uuid" PRIMARY KEY REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
    "claimed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "private"."guest_attempts" (
    "user_id" "uuid" PRIMARY KEY REFERENCES "auth"."users" ("id") ON DELETE CASCADE,
    "wrong_attempts" integer DEFAULT 0 NOT NULL
);

ALTER TABLE "private"."guest_password" OWNER TO "postgres";
ALTER TABLE "private"."guests" OWNER TO "postgres";
ALTER TABLE "private"."guest_attempts" OWNER TO "postgres";

-- No policies, so a role other than the owning postgres role reads and writes nothing even if
-- it is granted the table. The SECURITY DEFINER functions below run as postgres.
ALTER TABLE "private"."guest_password" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."guests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "private"."guest_attempts" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA "private" FROM "anon", "authenticated", PUBLIC;


-- Returns 'guest', 'wrong' or 'locked'. The 5-try lock is per anonymous user, and a locked
-- device starts over as a new anonymous user. See ADR 0005 for the guessing rate that allows.
CREATE OR REPLACE FUNCTION "public"."claim_guest"("password" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  uid uuid := auth.uid();
  wrong integer;
  stored_hash text;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'claim_guest needs a signed-in user';
  END IF;

  IF EXISTS (SELECT 1 FROM private.guests WHERE user_id = uid) THEN
    RETURN 'guest';
  END IF;

  -- The row lock makes parallel calls from one user wait their turn, so they cannot all slip
  -- under the cap before any of them counts a wrong try.
  INSERT INTO private.guest_attempts (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
  SELECT wrong_attempts INTO wrong FROM private.guest_attempts WHERE user_id = uid FOR UPDATE;

  IF wrong >= 5 THEN
    RETURN 'locked';
  END IF;

  SELECT hash INTO stored_hash FROM private.guest_password;

  IF stored_hash IS NOT NULL AND extensions.crypt(claim_guest.password, stored_hash) = stored_hash THEN
    INSERT INTO private.guests (user_id) VALUES (uid) ON CONFLICT (user_id) DO NOTHING;
    RETURN 'guest';
  END IF;

  UPDATE private.guest_attempts SET wrong_attempts = wrong_attempts + 1 WHERE user_id = uid;
  RETURN 'wrong';
END; $$;

ALTER FUNCTION "public"."claim_guest"("password" "text") OWNER TO "postgres";

-- The default privileges in the first migration grant every new function in public to anon,
-- so the revoke has to name anon as well as PUBLIC.
REVOKE ALL ON FUNCTION "public"."claim_guest"("password" "text") FROM "anon", PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."claim_guest"("password" "text") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."claim_guest"("password" "text") TO "service_role";


CREATE OR REPLACE FUNCTION "public"."is_guest"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM private.guests WHERE user_id = auth.uid())
$$;

ALTER FUNCTION "public"."is_guest"() OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."is_guest"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."is_guest"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_guest"() TO "service_role";


-- The before_user_created auth hook. Signup stays on project-wide, because Supabase Auth
-- rejects anonymous sign-ins when it is off, so this hook is what keeps email signups closed.
-- See ADR 0005.
CREATE OR REPLACE FUNCTION "public"."allow_only_anonymous_signup"("event" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    SET "search_path" TO ''
    AS $$
  SELECT CASE
    WHEN event->'user'->>'is_anonymous' = 'true' THEN '{}'::jsonb
    ELSE '{"error": {"message": "Signups are closed", "http_code": 403}}'::jsonb
  END
$$;

ALTER FUNCTION "public"."allow_only_anonymous_signup"("event" "jsonb") OWNER TO "postgres";

GRANT USAGE ON SCHEMA "public" TO "supabase_auth_admin";
REVOKE ALL ON FUNCTION "public"."allow_only_anonymous_signup"("event" "jsonb") FROM "anon", "authenticated", PUBLIC;
GRANT EXECUTE ON FUNCTION "public"."allow_only_anonymous_signup"("event" "jsonb") TO "supabase_auth_admin";


-- Deletes anonymous users who never became guests within a day, and guests idle for 90 days.
-- Deleting the auth user cascades to private.guests and private.guest_attempts. A guest's last
-- activity is their newest session refresh, falling back to updated_at, then last_sign_in_at,
-- then created_at.
CREATE OR REPLACE FUNCTION "private"."delete_idle_anonymous_users"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  deleted integer;
BEGIN
  WITH idle AS (
    SELECT u.id
    FROM auth.users u
    LEFT JOIN private.guests g ON g.user_id = u.id
    WHERE u.is_anonymous
      AND (
        (g.user_id IS NULL AND u.created_at < now() - interval '1 day')
        OR (
          g.user_id IS NOT NULL
          AND coalesce(
            (SELECT max(coalesce(s.refreshed_at AT TIME ZONE 'UTC', s.updated_at))
               FROM auth.sessions s WHERE s.user_id = u.id),
            u.last_sign_in_at,
            u.created_at
          ) < now() - interval '90 days'
        )
      )
  )
  DELETE FROM auth.users WHERE id IN (SELECT id FROM idle) AND is_anonymous;
  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END; $$;

ALTER FUNCTION "private"."delete_idle_anonymous_users"() OWNER TO "postgres";

REVOKE ALL ON FUNCTION "private"."delete_idle_anonymous_users"() FROM "anon", "authenticated", PUBLIC;


-- As the Supabase Cron docs install it.
CREATE EXTENSION IF NOT EXISTS "pg_cron" WITH SCHEMA "pg_catalog";
GRANT USAGE ON SCHEMA "cron" TO "postgres";
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA "cron" TO "postgres";

-- Every Sunday at 03:00 UTC. A guest idle for 90 days sees the gate again within a week.
SELECT "cron"."schedule"(
  'delete-idle-anonymous-users',
  '0 3 * * 0',
  'SELECT private.delete_idle_anonymous_users()'
);
