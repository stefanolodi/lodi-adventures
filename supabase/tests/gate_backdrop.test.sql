-- Who reads and writes the gate backdrop. Anyone reads the image through gate_backdrop(), only
-- the owner reads the cover it came from, and only the owner writes it. See ADR 0006.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET LOCAL search_path = extensions, public;

SELECT plan(13);

INSERT INTO auth.users (id, is_anonymous, created_at, last_sign_in_at) VALUES
  ('00000000-0000-0000-0000-0000000000a2', true, now(), now());  -- guest
INSERT INTO private.guests (user_id) VALUES ('00000000-0000-0000-0000-0000000000a2');


-- With no row, the gate gets no image.
SET LOCAL ROLE anon;
SELECT is(public.gate_backdrop(), NULL, 'with no backdrop, gate_backdrop() returns null');
RESET ROLE;


-- The owner writes the backdrop.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "ccd77cb1-916c-426b-b2d2-b22e86fac61f", "role": "authenticated", "is_anonymous": false}';
SELECT lives_ok(
  $$INSERT INTO public.gate_backdrop (image, source_cover_url)
    VALUES ('data:image/jpeg;base64,/9j/AA==', 'https://res.cloudinary.com/demo/image/upload/cover.jpg')$$,
  'the owner writes the backdrop'
);
SELECT is(
  (SELECT source_cover_url FROM public.gate_backdrop),
  'https://res.cloudinary.com/demo/image/upload/cover.jpg',
  'the owner reads the cover the backdrop came from'
);
SELECT throws_ok(
  $$UPDATE public.gate_backdrop SET image = 'https://res.cloudinary.com/demo/image/upload/cover.jpg'$$,
  '23514', NULL,
  'the backdrop holds only a base64 JPEG'
);
SELECT throws_ok(
  $$UPDATE public.gate_backdrop SET image = 'data:image/jpeg;base64,' || repeat('A', 16384)$$,
  '23514', NULL,
  'the backdrop holds only a small image'
);
SELECT throws_ok(
  $$INSERT INTO public.gate_backdrop (id, image, source_cover_url) VALUES (false, 'data:image/jpeg;base64,AA==', 'x')$$,
  '23514', NULL,
  'the table holds one row at most'
);
RESET ROLE;


-- A stranger reads the image and nothing else.
SET LOCAL ROLE anon;
SELECT is(public.gate_backdrop(), 'data:image/jpeg;base64,/9j/AA==', 'a stranger reads the image through gate_backdrop()');
SELECT throws_ok('SELECT * FROM public.gate_backdrop', '42501', NULL, 'a stranger cannot read the table');
SELECT throws_ok(
  $$INSERT INTO public.gate_backdrop (image, source_cover_url) VALUES ('data:image/jpeg;base64,AA==', 'x')$$,
  '42501', NULL,
  'a stranger cannot write the table'
);
RESET ROLE;


-- A guest reads the image, but neither the source nor a write gets through.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "00000000-0000-0000-0000-0000000000a2", "role": "authenticated", "is_anonymous": true}';
SELECT is(public.gate_backdrop(), 'data:image/jpeg;base64,/9j/AA==', 'a guest reads the image through gate_backdrop()');
SELECT is((SELECT count(*) FROM public.gate_backdrop), 0::bigint, 'a guest reads no row of the table');
UPDATE public.gate_backdrop SET image = 'data:image/jpeg;base64,AA==';
DELETE FROM public.gate_backdrop;
RESET ROLE;
SELECT is(
  (SELECT image FROM public.gate_backdrop),
  'data:image/jpeg;base64,/9j/AA==',
  'a guest''s update and delete change nothing'
);


-- The owner clears it.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub": "ccd77cb1-916c-426b-b2d2-b22e86fac61f", "role": "authenticated", "is_anonymous": false}';
DELETE FROM public.gate_backdrop;
SELECT is(public.gate_backdrop(), NULL, 'once the owner clears the backdrop, gate_backdrop() returns null');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
