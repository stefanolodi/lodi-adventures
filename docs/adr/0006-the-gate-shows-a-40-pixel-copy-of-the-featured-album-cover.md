# The gate shows a 40-pixel copy of the featured album's cover

Before #66 the gate blurred the live home page behind it, so a stranger saw the featured album's cover through the overlay. Since #66 the gate mounts nothing behind it, and since #74 a stranger reads no album rows, so the overlay blurred an empty page. The owner wants the blurred cover back, and it should follow the featured album when that changes.

The backdrop is the cover of the album a guest's home page opens with. That is `chooseHeroAlbum(albums, false)`: the featured album if it is public, otherwise the first public album. A private album's cover never reaches the gate. With no public album there is no backdrop.

The backdrop lives in `public.gate_backdrop`, one row holding a base64 JPEG data URL and the cover URL it came from. A check keeps the image a JPEG data URL of at most 16384 characters. Only the owner reads or writes the table. `gate_backdrop()` is `SECURITY DEFINER`, anyone may call it, and it returns the image alone, so a stranger never learns the cover URL. The pgTAP tests in `supabase/tests/gate_backdrop.test.sql` check all of this.

The owner's browser writes the row. `useSyncGateBackdrop` in `App.tsx` watches the albums query whenever the owner is signed in. When the cover a guest's home page opens with differs from the stored one, it asks Cloudinary for the cover at 40 pixels wide (`c_fill,g_auto,ar_16:10,w_40,q_60,f_jpg`, about 1 KB), reads it as a data URL and upserts the row. Featuring an album, changing a cover, making an album private, reordering and deleting all change the albums query, so each one moves the backdrop. A change made outside the app, such as in the SQL editor or by `npm run rename-photos`, moves it the next time the owner opens the app.

The gate calls `gate_backdrop()` and shows the image under the overlay with `background-size: cover` and a 24-pixel CSS blur.

## Accepted

A stranger sees a 40 by 25 pixel copy of one public cover. That is enough for its colours and rough shapes, not for faces or text. The detail is gone from the file, so removing the CSS blur in dev tools shows a blocky version of the same thing.

The backdrop updates only when the owner's browser runs the sync. After this change merges, the gate shows no image until the owner next opens the app.

## Rejected

A blurred Cloudinary URL, such as the cover with `e_blur:2000`. Cloudinary serves every variant of an `upload` asset, so a stranger could delete the transformation from the URL and load the full cover. The URL would also have to reach strangers, who read no album rows, and `npm run rename-photos` would break it.

A Vercel function that makes the image on each request. The functions hold only the anon key, which reads no albums for a stranger, and giving them the service-role key breaks ADR 0005's rule that it never goes to Vercel.

A fixed image in the bundle. It would not follow the featured album.
