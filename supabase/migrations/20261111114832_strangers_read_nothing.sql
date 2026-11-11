-- Strangers read no albums or photos. A public album and its photos are readable only by a guest
-- or the owner. See ADR 0005.
--
-- This migration takes access away, which ADR 0004 forbids by default. It is safe here because
-- the client that makes guests (#69) is already live, so every visitor who passes the gate is a
-- guest before they read a row. A tab still running the old client sees the gate after a reload.
--
-- The policies keep their names, so the owner policies and anything that names them are unchanged.

DROP POLICY IF EXISTS "albums_public_read" ON "public"."albums";

CREATE POLICY "albums_public_read" ON "public"."albums" FOR SELECT USING (
  ("is_private" = false) AND ("public"."is_guest"() OR "public"."is_owner"())
);


DROP POLICY IF EXISTS "photos_public_read" ON "public"."photos";

CREATE POLICY "photos_public_read" ON "public"."photos" FOR SELECT USING (
  ("public"."is_guest"() OR "public"."is_owner"())
  AND (EXISTS (
    SELECT 1 FROM "public"."albums"
    WHERE ("albums"."id" = "photos"."album_id") AND ("albums"."is_private" = false)
  ))
);
