# Coding standards: lodi-adventures

A rule here is one sentence and a pointer. If it needs an argument, the argument is an ADR. An amendment goes in the ADR, never here. `/code-review` and `afk-code-review` judge every change against this file.

## Stack

- Install dependencies: `npm ci`
- Verify: `npm run verify`, which runs lint, then build, then test.
- `package.json` is the fact. When this section disagrees with it, this section is wrong.
- No new dependency without an ADR naming the need, the pick and the alternative rejected.
- A dependency considered and rejected is listed here with its ADR.
- Rejected: oxlint and Biome, in favour of ESLint. See ADR 0003.
- New code adds no lint suppressions. A change that fixes a suppressed finding runs `npx eslint src api --prune-suppressions`. See ADR 0003.

## Modules

- Design modules with the vocabulary of Matt's `codebase-design` skill.
- One job per module, split by domain concern. No catch-all `utils` module.
- Logic modules hold no I/O and no UI. Code is pure by default, with side effects at the edges.
- One primary export per file, and the file is named for it.

## Rules that must not regress

Words in these rules are defined in `GLOSSARY.md`.

1. A guest never sees a private album or any of its photos. The Supabase policies enforce it, and the client filter only shapes the UI. See ADR 0002.
2. A new album is private until the owner makes it public. See "Key rules" in `CLAUDE.md`.
3. Only the owner creates, edits, reorders or deletes albums and photos. The Supabase policies and every function in `api/` check the owner's user id, not only that someone is signed in. See ADR 0002.
4. The guest UI has no download control and no link to the original file. See "Key rules" in `CLAUDE.md` and ADR 0005.
5. The gate covers every page except `/login`, and the owner skips it. See ADR 0005.
6. Only `claim_guest` adds a guest. Browsers cannot write to the `guests` table or read the guest password hash. See ADR 0005.

## Database schema

- The schema lives in `supabase/migrations/`, and `.github/workflows/supabase-migrations.yml` applies it to the live project on merge to `main`. See ADR 0004.
- Every schema change is a new file from `supabase migration new <name>`. Never edit a migration that has already been applied.
- A migration only adds things, such as a column with a default or a new function. Vercel and the Action deploy separately, so for a short time the old client runs against the new schema, or the new client against the old one. See ADR 0004.
- After a migration, regenerate the types locally with `supabase start && supabase db reset && supabase gen types typescript --local > src/lib/database.types.ts`.
- Never run `supabase db push` or `supabase migration repair` outside CI.

## Testing

- Tests run on vitest with jsdom and Testing Library. `npm run test` runs them all once.
- A test sits next to the file it covers, named `<file>.test.ts` or `<file>.test.tsx`.
- Every test mocks `./lib/supabase` with `vi.mock`, and no test touches the network.
- Database tests are pgTAP files in `supabase/tests/`. `supabase test db` runs them on a running local stack, and `.github/workflows/supabase-tests.yml` runs them on pull requests that touch `supabase/`.
- Each rule under "Rules that must not regress" has a test that fails when the rule breaks. Rule 6's test is the pgTAP suite.

## Comments and docs

- A comment says why, when the code cannot. It never restates what the code does.
- A comment that depends on a handoff note or an ADR names the file.
- Domain words live in `GLOSSARY.md`, decisions in `docs/adr/`, agent workflow in `docs/agents/`, and long investigations in `docs/handoff/`. `CLAUDE.md` points at them.

## Definition of done

Before a PR opens:

1. The verify command is green. CI runs the same steps in the same order.
2. New logic and every bug fix come with a test.
3. No client data or secrets are committed.
4. The glossary, ADR and handoff updates the change implies are in the same PR.
