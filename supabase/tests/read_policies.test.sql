-- Who reads albums and photos. A stranger reads nothing, a guest reads public albums and their
-- photos, and the owner reads everything. These tests cover rule 1 in
-- docs/agents/coding-standards.md. See ADR 0005.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(14);

-- Fixtures, as postgres. One public and one private album, each with one photo.
INSERT INTO auth.users (id, is_anonymous, created_at, last_sign_in_at) VALUES
  ('00000000-0000-0000-0000-0000000000a1', true, now(), now()),  -- unclaimed
  ('00000000-0000-0000-0000-0000000000a2', true, now(), now());  -- guest
INSERT INTO private.guests (user_id) VALUES ('00000000-0000-0000-0000-0000000000a2');

INSERT INTO public.albums (id, title, event_date, is_private) VALUES
  ('00000000-0000-0000-0000-0000000000b1', 'Public album', '2026-01-01', false),
  ('00000000-0000-0000-0000-0000000000b2', 'Private album', '2026-01-01', true);
INSERT INTO public.photos (id, album_id, url, public_id) VALUES
  ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'https://example.test/c1.jpg', 'c1'),
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b2', 'https://example.test/c2.jpg', 'c2');


-- A stranger with the anon key alone.
SET LOCAL ROLE anon;
SELECT is((SELECT count(*) FROM public.albums), 0::bigint, 'anon reads no albums');
SELECT is((SELECT count(*) FROM public.photos), 0::bigint, 'anon reads no photos');
RESET ROLE;


-- An anonymous user who has not entered the guest password.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "is_anonymous": true}';
SELECT is((SELECT count(*) FROM public.albums), 0::bigint, 'an unclaimed anonymous user reads no albums');
SELECT is((SELECT count(*) FROM public.photos), 0::bigint, 'an unclaimed anonymous user reads no photos');
RESET ROLE;


-- A guest.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated", "is_anonymous": true}';
SELECT is(
  ARRAY(SELECT id::text FROM public.albums ORDER BY id),
  ARRAY['00000000-0000-0000-0000-0000000000b1'],
  'a guest reads the public album'
);
SELECT is(
  ARRAY(SELECT id::text FROM public.photos ORDER BY id),
  ARRAY['00000000-0000-0000-0000-0000000000c1'],
  'a guest reads the public album''s photo'
);
SELECT is((SELECT count(*) FROM public.albums WHERE is_private), 0::bigint, 'a guest reads no private album');
SELECT is(
  (SELECT count(*) FROM public.photos WHERE album_id = '00000000-0000-0000-0000-0000000000b2'),
  0::bigint,
  'a guest reads no photo of a private album'
);
RESET ROLE;


-- The owner, whose id public.is_owner() names.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "ccd77cb1-916c-426b-b2d2-b22e86fac61f", "role": "authenticated", "is_anonymous": false}';
SELECT is(
  ARRAY(SELECT id::text FROM public.albums ORDER BY id),
  ARRAY['00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000b2'],
  'the owner reads every album'
);
SELECT is(
  ARRAY(SELECT id::text FROM public.photos ORDER BY id),
  ARRAY['00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000c2'],
  'the owner reads every photo'
);
RESET ROLE;


-- Becoming a guest is what opens the rows, and losing it closes them again.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "is_anonymous": true}';
SELECT is((SELECT count(*) FROM public.albums), 0::bigint, 'before claiming, the user reads no albums');
RESET ROLE;
INSERT INTO private.guests (user_id) VALUES ('00000000-0000-0000-0000-0000000000a1');
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a1", "role": "authenticated", "is_anonymous": true}';
SELECT is((SELECT count(*) FROM public.albums), 1::bigint, 'after claiming, the user reads the public album');
RESET ROLE;
DELETE FROM private.guests;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated", "is_anonymous": true}';
SELECT is((SELECT count(*) FROM public.albums), 0::bigint, 'once the guests table is emptied, a former guest reads no albums');
SELECT is((SELECT count(*) FROM public.photos), 0::bigint, 'once the guests table is emptied, a former guest reads no photos');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
