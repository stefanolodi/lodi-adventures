-- The gate backdrop: a 40-pixel JPEG of the featured album's cover, which the gate shows blurred to
-- strangers. The owner's browser makes it and writes it here. See ADR 0006.
--
-- This migration only adds things, so it is safe in either deploy order. See ADR 0004.

-- One row at most. With no row the gate shows no image. source_cover_url is the cover the image
-- came from, and only the owner reads it, because a stranger who had it could load the cover
-- itself from Cloudinary.
CREATE TABLE IF NOT EXISTS "public"."gate_backdrop" (
    "id" boolean PRIMARY KEY DEFAULT true CHECK ("id"),
    -- The pattern keeps anything but a small base64 JPEG out, so the gate can put the value in a CSS url().
    "image" "text" NOT NULL CHECK (
      "image" ~ '^data:image/jpeg;base64,[A-Za-z0-9+/]+={0,2}$' AND length("image") <= 16384
    ),
    "source_cover_url" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

ALTER TABLE "public"."gate_backdrop" OWNER TO "postgres";
ALTER TABLE "public"."gate_backdrop" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gate_backdrop_owner_all" ON "public"."gate_backdrop" FOR ALL
  USING ("public"."is_owner"()) WITH CHECK ("public"."is_owner"());

-- The default privileges in the first migration grant every new table in public to anon. A
-- stranger reads the image through gate_backdrop() and never needs the table.
REVOKE ALL ON TABLE "public"."gate_backdrop" FROM "anon", PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."gate_backdrop" TO "authenticated";
GRANT ALL ON TABLE "public"."gate_backdrop" TO "service_role";


-- Returns the image alone, or null when there is none. SECURITY DEFINER lets a stranger read it
-- past the owner-only policy, and it returns no other column.
CREATE OR REPLACE FUNCTION "public"."gate_backdrop"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT image FROM public.gate_backdrop
$$;

ALTER FUNCTION "public"."gate_backdrop"() OWNER TO "postgres";

GRANT EXECUTE ON FUNCTION "public"."gate_backdrop"() TO "anon";
GRANT EXECUTE ON FUNCTION "public"."gate_backdrop"() TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."gate_backdrop"() TO "service_role";
