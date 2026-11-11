# Guests are anonymous users who know the guest password

This replaces ADR 0001. Under it, the gate compared what a guest typed with `VITE_GUEST_PASSWORD`, which ships in the bundle, and the Supabase anon key read every public album without the password. On 2026-11-11 the anon key alone returned the 1 public album and its 56 photos. Issue #65 tracks the change.

Each guest device is its own anonymous Supabase user. The gate calls `signInAnonymously()`, then `claim_guest(password)`. The function compares the password with a bcrypt hash in `private.guest_password` and adds the user to `private.guests`. `is_guest()` returns true when that table has a row for `auth.uid()`. PostgREST does not expose the `private` schema, `anon` and `authenticated` hold no privilege on it, and its tables have row-level security with no policies. Only `claim_guest` adds a guest. The read policies `albums_public_read` and `photos_public_read` require `is_guest() OR is_owner()`, so a stranger with the anon key reads no album or photo rows. The pgTAP tests in `supabase/tests/` check all of this, and `.github/workflows/supabase-tests.yml` runs them on every pull request that touches `supabase/`.

`claim_guest` counts wrong passwords per user. After 5 it returns `'locked'` without checking the password. A locked device gets a new anonymous user on its next try, and Supabase allows 30 anonymous sign-ins per hour per IP, so the cap is about 150 guesses per hour per IP. The guest password is at least 12 characters.

Signup stays on for the whole project, because Supabase Auth (`internal/api/anonymous.go`) rejects anonymous sign-ins when signup is off. The `before_user_created` auth hook, `public.allow_only_anonymous_signup`, rejects every signup that is not anonymous, so nobody can create an email account.

A `pg_cron` job runs `private.delete_idle_anonymous_users()` every Sunday at 03:00 UTC. It deletes anonymous users who never became guests and are more than a day old. It also deletes guests whose newest session refresh is more than 90 days old, falling back to the session's `updated_at`, then the user's `last_sign_in_at`, then `created_at`. It never deletes a user who is not anonymous.

## Rejected

One shared guest Supabase user. Any guest could change its password with `updateUser`, because `user.go` skips reauthentication for sessions under 24 hours old. Any guest could also sign every guest out with the default global `signOut()`, or enroll MFA on the shared account.

A guest JWT signed by a Vercel function. The project signs tokens with an ES256 key pair, so we would have to import a private key and look after it. supabase-js also turns off `supabase.auth` on a client that uses `accessToken`.

Cloudinary signed delivery. The account is on the Free plan, and token-based access needs Advanced. The `authenticated` delivery type allows no on-the-fly transformations, and its signed URLs never expire, so they do not stop a guest sharing a photo either.

## Accepted

A guest can share a photo URL, and anyone with the URL sees the photo. A guest can save a photo from the browser. The guest UI offers no download control and no link to the original file, but it does not try to stop a save.

Access is all or nothing. Every guest sees every public album, and revoking one guest means revoking them all.

Cloudinary serves an `upload` asset to anyone who has its URL, so a URL read while the anon key could list photos keeps working after the gate change. `npm run rename-photos -- --apply` moves every photo and cover to a new random public id in the same folder, with `invalidate: true`, and points the rows at the new URL. Every URL handed out before the run then returns 404. The owner runs it again if a guest leaks a URL. It reads `SUPABASE_SERVICE_ROLE_KEY` from `.env.local` on the owner's Mac, and that key never goes to Vercel.

A guest who has not visited for 90 to 97 days sees the gate again, because the cleanup runs once a week.

While the gate shows, `GateLock` mounts nothing behind it, so a stranger loads no album data and no photos. Removing the overlay in dev tools reveals an empty page. The one exception is the gate backdrop, a 96-pixel copy of one public cover. See ADR 0006.

## Owner snippets

Set the guest password without the plaintext reaching git, the bundle or a saved Supabase SQL snippet. Compute the hash on the local stack, and send only the hash to the live project.

1. On the Mac, start the local stack and open psql in its database container:

   ```
   supabase start
   docker exec -it supabase_db_penny-portfolio psql -U postgres
   ```

2. In psql, type the password at the prompt. psql keeps the `\prompt` line in its history, but not what you type.

   ```
   \prompt 'Guest password: ' pw
   select extensions.crypt(:'pw', extensions.gen_salt('bf', 10));
   ```

3. In the live project's SQL editor, paste the hash into this query and run it without saving it:

   ```
   insert into private.guest_password (hash) values ('<hash>')
   on conflict (id) do update set hash = excluded.hash, set_at = now();
   ```

To revoke every guest, set a new hash with the steps above, then run this in the live SQL editor:

```
delete from private.guests;
```

`is_guest()` then returns false for every former guest until they enter the new password. The next cleanup run deletes the anonymous users who have not.
