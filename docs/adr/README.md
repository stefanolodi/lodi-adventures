# Decisions

- [0001](0001-the-gate-is-a-deterrent.md): superseded by 0005. The gate is a deterrent, and its password ships in the bundle.
- [0002](0002-supabase-rls-enforces-privacy-and-ownership.md): Supabase row-level security enforces privacy and ownership, and the client filter only shapes the UI.
- [0003](0003-eslint-with-type-checked-rules-lints-src-and-api.md): ESLint with type-checked rules lints `src` and `api`, and the findings that predate it sit in `eslint-suppressions.json`.
- [0004](0004-ci-applies-supabase-migrations-on-merge.md): the schema lives in `supabase/migrations/`, CI applies it on merge to `main`, and agents never push to the live database.
- [0005](0005-guests-are-anonymous-users-who-know-the-guest-password.md): a guest is an anonymous Supabase user who has entered the guest password, and only `claim_guest` adds one.
