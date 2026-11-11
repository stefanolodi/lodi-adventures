-- The guest access tables, claim_guest, is_guest, the signup hook and the idle-user cleanup.
-- These tests cover rule 6 in docs/agents/coding-standards.md. See ADR 0005.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(46);

-- Fixtures, as postgres. Each user is anonymous unless its name says otherwise.
INSERT INTO auth.users (id, is_anonymous, created_at, last_sign_in_at) VALUES
  ('00000000-0000-0000-0000-00000000000a', true, now(), now()),        -- right password
  ('00000000-0000-0000-0000-00000000000b', true, now(), now()),        -- wrong password
  ('00000000-0000-0000-0000-00000000000c', true, now(), now()),        -- locked out
  ('00000000-0000-0000-0000-00000000000d', true, now(), now()),        -- no hash row
  ('00000000-0000-0000-0000-000000000011', true, now() - interval '2 days', now() - interval '2 days'),
  ('00000000-0000-0000-0000-000000000012', true, now() - interval '1 hour', now() - interval '1 hour'),
  ('00000000-0000-0000-0000-000000000013', true, now() - interval '200 days', now() - interval '200 days'),
  ('00000000-0000-0000-0000-000000000014', true, now() - interval '200 days', now() - interval '200 days'),
  ('00000000-0000-0000-0000-000000000015', false, now() - interval '400 days', now() - interval '400 days'),
  ('00000000-0000-0000-0000-000000000016', false, now() - interval '400 days', now() - interval '400 days');

-- 13 is a guest idle for 91 days, 14 a guest active yesterday, 16 a non-anonymous user in guests.
INSERT INTO private.guests (user_id) VALUES
  ('00000000-0000-0000-0000-000000000013'),
  ('00000000-0000-0000-0000-000000000014'),
  ('00000000-0000-0000-0000-000000000016');
INSERT INTO auth.sessions (id, user_id, created_at, updated_at, refreshed_at) VALUES
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000013',
   now() - interval '200 days', now() - interval '91 days', (now() - interval '91 days') AT TIME ZONE 'UTC'),
  (gen_random_uuid(), '00000000-0000-0000-0000-000000000014',
   now() - interval '200 days', now() - interval '1 day', (now() - interval '1 day') AT TIME ZONE 'UTC');


-- Browsers cannot reach the private tables.
SET LOCAL ROLE anon;
SELECT throws_ok($$ SELECT * FROM private.guest_password $$, '42501', NULL, 'anon cannot select guest_password');
SELECT throws_ok($$ SELECT * FROM private.guests $$, '42501', NULL, 'anon cannot select guests');
SELECT throws_ok($$ SELECT * FROM private.guest_attempts $$, '42501', NULL, 'anon cannot select guest_attempts');
SELECT throws_ok($$ INSERT INTO private.guest_password (hash) VALUES ('x') $$, '42501', NULL, 'anon cannot insert guest_password');
SELECT throws_ok($$ INSERT INTO private.guests (user_id) VALUES (gen_random_uuid()) $$, '42501', NULL, 'anon cannot insert guests');
SELECT throws_ok($$ INSERT INTO private.guest_attempts (user_id) VALUES (gen_random_uuid()) $$, '42501', NULL, 'anon cannot insert guest_attempts');
SELECT throws_ok($$ UPDATE private.guest_password SET hash = 'x' $$, '42501', NULL, 'anon cannot update guest_password');
SELECT throws_ok($$ UPDATE private.guests SET claimed_at = now() $$, '42501', NULL, 'anon cannot update guests');
SELECT throws_ok($$ UPDATE private.guest_attempts SET wrong_attempts = 0 $$, '42501', NULL, 'anon cannot update guest_attempts');
SELECT throws_ok($$ DELETE FROM private.guest_password $$, '42501', NULL, 'anon cannot delete guest_password');
SELECT throws_ok($$ DELETE FROM private.guests $$, '42501', NULL, 'anon cannot delete guests');
SELECT throws_ok($$ DELETE FROM private.guest_attempts $$, '42501', NULL, 'anon cannot delete guest_attempts');
RESET ROLE;

-- These read the privilege instead of calling the function as anon. On the local image
-- (supabase/postgres 17.6.1.104), a postgres session that switches role and then calls a
-- function it may not execute crashes the server. Over the REST API the same call returns
-- 401 permission denied.
SELECT ok(NOT has_function_privilege('anon', 'public.claim_guest(text)', 'execute'), 'anon cannot call claim_guest');
SELECT ok(has_function_privilege('authenticated', 'public.claim_guest(text)', 'execute'), 'a signed-in user can call claim_guest');
SELECT ok(NOT has_function_privilege('anon', 'public.allow_only_anonymous_signup(jsonb)', 'execute'), 'anon cannot call the signup hook');
SELECT ok(NOT has_function_privilege('authenticated', 'public.allow_only_anonymous_signup(jsonb)', 'execute'), 'a signed-in user cannot call the signup hook');
SELECT ok(has_function_privilege('supabase_auth_admin', 'public.allow_only_anonymous_signup(jsonb)', 'execute'), 'Supabase Auth can call the signup hook');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "is_anonymous": true}';
SELECT throws_ok($$ SELECT * FROM private.guest_password $$, '42501', NULL, 'an anonymous user cannot select guest_password');
SELECT throws_ok($$ SELECT * FROM private.guests $$, '42501', NULL, 'an anonymous user cannot select guests');
SELECT throws_ok($$ SELECT * FROM private.guest_attempts $$, '42501', NULL, 'an anonymous user cannot select guest_attempts');
SELECT throws_ok($$ INSERT INTO private.guest_password (hash) VALUES ('x') $$, '42501', NULL, 'an anonymous user cannot insert guest_password');
SELECT throws_ok($$ INSERT INTO private.guests (user_id) VALUES ('00000000-0000-0000-0000-00000000000b') $$, '42501', NULL, 'an anonymous user cannot insert guests');
SELECT throws_ok($$ INSERT INTO private.guest_attempts (user_id) VALUES ('00000000-0000-0000-0000-00000000000b') $$, '42501', NULL, 'an anonymous user cannot insert guest_attempts');
SELECT throws_ok($$ UPDATE private.guest_password SET hash = 'x' $$, '42501', NULL, 'an anonymous user cannot update guest_password');
SELECT throws_ok($$ UPDATE private.guests SET claimed_at = now() $$, '42501', NULL, 'an anonymous user cannot update guests');
SELECT throws_ok($$ UPDATE private.guest_attempts SET wrong_attempts = 0 $$, '42501', NULL, 'an anonymous user cannot update guest_attempts');
SELECT throws_ok($$ DELETE FROM private.guest_password $$, '42501', NULL, 'an anonymous user cannot delete guest_password');
SELECT throws_ok($$ DELETE FROM private.guests $$, '42501', NULL, 'an anonymous user cannot delete guests');
SELECT throws_ok($$ DELETE FROM private.guest_attempts $$, '42501', NULL, 'an anonymous user cannot delete guest_attempts');
SELECT throws_ok($$ SELECT private.delete_idle_anonymous_users() $$, '42501', NULL, 'an anonymous user cannot run the cleanup');
RESET ROLE;


-- With no hash row, even the right password is wrong.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000d", "role": "authenticated", "is_anonymous": true}';
SELECT is(public.claim_guest('correct horse battery'), 'wrong', 'with no hash row the right password returns wrong');
RESET ROLE;

INSERT INTO private.guest_password (hash) VALUES (extensions.crypt('correct horse battery', extensions.gen_salt('bf')));

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "is_anonymous": true}';
SELECT is(public.claim_guest('wrong horse'), 'wrong', 'a wrong password returns wrong');
SELECT is(public.is_guest(), false, 'a wrong password does not make a guest');

SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated", "is_anonymous": true}';
SELECT is(public.is_guest(), false, 'an anonymous user is not a guest before claiming');
SELECT is(public.claim_guest('correct horse battery'), 'guest', 'the right password returns guest');
SELECT is(public.is_guest(), true, 'the right password makes that user a guest');
SELECT is(public.claim_guest('wrong horse'), 'guest', 'a guest stays a guest whatever they type');

SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000b", "role": "authenticated", "is_anonymous": true}';
SELECT is(public.is_guest(), false, 'another user is still not a guest');

SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-00000000000c", "role": "authenticated", "is_anonymous": true}';
SELECT is(
  (SELECT array_agg(public.claim_guest('wrong horse')) FROM generate_series(1, 5)),
  ARRAY['wrong', 'wrong', 'wrong', 'wrong', 'wrong'],
  '5 wrong passwords each return wrong'
);
SELECT is(public.claim_guest('correct horse battery'), 'locked', 'after 5 wrong passwords the right one returns locked');
SELECT is(public.is_guest(), false, 'a locked user is not a guest');
RESET ROLE;

SET LOCAL ROLE anon;
SELECT is(public.is_guest(), false, 'anon is not a guest');
RESET ROLE;


-- The signup hook.
SELECT is(
  public.allow_only_anonymous_signup('{"user": {"is_anonymous": true}}'),
  '{}'::jsonb,
  'the hook accepts an anonymous signup'
);
SELECT is(
  public.allow_only_anonymous_signup('{"user": {"is_anonymous": false}}'),
  '{"error": {"message": "Signups are closed", "http_code": 403}}'::jsonb,
  'the hook rejects a signup that is not anonymous'
);


-- The idle-user cleanup, run as postgres the way pg_cron runs it.
SELECT is(private.delete_idle_anonymous_users(), 2, 'the cleanup deletes 2 users');
SELECT is(
  ARRAY(SELECT id::text FROM auth.users WHERE id::text LIKE '00000000-0000-0000-0000-0000000000%' ORDER BY id),
  ARRAY[
    '00000000-0000-0000-0000-00000000000a',
    '00000000-0000-0000-0000-00000000000b',
    '00000000-0000-0000-0000-00000000000c',
    '00000000-0000-0000-0000-00000000000d',
    '00000000-0000-0000-0000-000000000012',
    '00000000-0000-0000-0000-000000000014',
    '00000000-0000-0000-0000-000000000015',
    '00000000-0000-0000-0000-000000000016'
  ],
  'the cleanup deletes the 2-day-old unclaimed user and the 91-day-idle guest, and keeps the rest'
);

SELECT * FROM finish();
ROLLBACK;
