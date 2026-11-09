# Lodi Adventures

A private, personal photo portfolio app. The owner browses and curates their photo albums; guests view shared content in read-only mode. No social features — purely a memory archive.

## Stack

- **React 19** + **Vite 7** + **TypeScript 5**
- **Tailwind CSS v4** (via the `@tailwindcss/vite` plugin, configured in CSS, with no `tailwind.config.js`)
- **react-router-dom v7** for routing
- **@tanstack/react-query** for reading and writing Supabase data
- **Supabase** (`@supabase/supabase-js`) for the database and the owner's sign-in
- **Cloudinary** for photo files
- **Vercel** hosts the Vite build and the functions in `api/`, as the `lodi-adventures` project at lodiadventures.com
- **@dnd-kit** (core + sortable + utilities) for drag-and-drop reordering
- **Lenis** for smooth scroll (`window.__lenis` global)
- **lucide-react** for icons
- **vitest + @testing-library/react** for tests
- **Puppeteer** for screenshot capture (`npm run screenshot`)

## Path alias

`@/` maps to `src/` (configured in `vite.config.ts`).

## Architecture

The browser reads and writes the `albums` and `photos` tables in Supabase directly, with the public anon key. Supabase row-level security hides private albums from guests and lets only the owner write. The client filter only shapes the UI. Photo files live in Cloudinary. The browser uploads a photo straight to Cloudinary with a signature from `api/sign-cloudinary-upload`, and `api/delete-cloudinary-asset` deletes a list of them. Both functions hold the Cloudinary secret and check the owner's user id in `api/_lib/authorizeOwner.ts`.

The reasons for these choices are in `docs/adr/README.md`.

```
src/
  main.tsx         # Providers: router, react-query, AuthProvider
  App.tsx          # The gate and the routes
  pages/           # One file per route: HomePage, AlbumPage, LoginPage
  components/      # Shared components, one per file
  components/ui/   # Theme toggle
  context/         # AuthContext and AuthProvider: the Supabase session and isOwner
  hooks/           # useAlbums and usePhotos (react-query over Supabase), useAuth, useTheme
  lib/             # Supabase client, Cloudinary calls, row mappers, queryClient, cn
  test/            # fakeSupabase and renderWithProviders for tests
  types.ts         # Album and Photo
  styles.css       # All styles (CSS custom props + Tailwind utilities)
  useSmoothScroll.ts
  data.ts          # Seed albums from the in-memory version. Nothing imports it.
api/
  sign-cloudinary-upload.ts
  delete-cloudinary-asset.ts
  _lib/authorizeOwner.ts
supabase/
  config.toml      # Local stack settings for the Supabase CLI
  migrations/      # The schema. CI applies new files on merge to main
```

### Routing

- `/` is HomePage: hero, album grid, year filter and the all-photos feed.
- `/album/:albumId` is AlbumPage: hero, masonry photo grid and lightbox.
- `/login` is LoginPage, where the owner signs in with Supabase email and password.

### Owner and guest

The owner is the Supabase user whose id matches `VITE_OWNER_USER_ID` in the client and `OWNER_USER_ID` in the functions. Everyone else is a guest. Components read `isOwner` from `useAuth()`.

The owner sees private albums, creates, edits and deletes albums, switches an album between private and public, uploads photos, reorders albums and photos by drag and drop, and writes notes. A guest sees public albums only and reads notes.

### Gate

`GateLock` in `App.tsx` covers every page except `/login`. A guest unlocks it with `VITE_GUEST_PASSWORD`, and `sessionStorage` keeps it unlocked for the tab. The owner skips it. The password ships in the bundle, so the gate keeps strangers out and protects nothing. See ADR 0001.

### Environment variables

- Client: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OWNER_USER_ID`, `VITE_GUEST_PASSWORD`.
- Functions in `api/`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `OWNER_USER_ID`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_CLOUD_NAME` (falls back to `VITE_CLOUDINARY_CLOUD_NAME`).
- Supabase CLI, for `supabase link` and `supabase db pull` on the owner's Mac: `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`. GitHub Actions reads them, and `SUPABASE_ACCESS_TOKEN`, from repo secrets.

`.env.example` lists every variable with a comment saying what it is.

## Dev commands

```bash
npm run dev       # Vite dev server
npm run build     # tsc + vite build
npm run test      # vitest run (single pass)
npm run test:watch
npm run screenshot
npm run lint      # eslint, fails on any warning
npm run verify    # lint, then build, then test. CI runs the same
```

## Styling conventions

- All styles live in `src/styles.css` — BEM-ish class names, no CSS modules
- CSS custom properties for theming: `--bg`, `--ink`, `--brand`, `--accent-orange`, `--panel`, `--line`, `--shadow`
- Dark mode via `[data-theme='dark']` on `<html>`; theme persisted in `localStorage` under key `penny-theme`
- Fonts: **Manrope** (body), **Instrument Serif** (hero headings)
- Responsive breakpoints: `max-width: 1024px` and `max-width: 760px`
- Animations: `fade-in-up` keyframe; respect `prefers-reduced-motion`

## Key rules

- **UI tasks**: invoke the `frontend-design` skill before implementing
- **Non-UI tasks** (data, refactor, tests): skip `frontend-design`
- Desktop-first responsive design
- No social features: no comments, likes, follows, DMs, or feeds
- Default new albums to private
- No photo downloads for guests
- Preserve accessibility: semantic HTML, keyboard focus states, color contrast
- Keep state predictable; no hidden side effects
- Run `npm run verify` before finishing any task; fix failures

## Visual references

Design references are in `references/`:
- `website reference 2.png` — home page editorial grid feel
- `website reference 3.png` — album page large hero + masonry feel
- `Brand 1.png`, `Brand 2.jpg` — brand direction

## Planned features (not yet built)

- Shareable links, with an optional password

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `stefanolodi/lodi-adventures`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

<!-- stefanolodi-setup-repo -->
## Workflow

### Coding standards

How code is written here, the commands for install and verify, and the definition of done. See `docs/agents/coding-standards.md`.

### Database schema

Every schema change is a new migration in `supabase/migrations/`, and only CI pushes it to the live database. See "Database schema" in `docs/agents/coding-standards.md` and ADR 0004.

### Git workflow

Feature branches, declarative conventional commits, PR bodies from the `pr` skill, squash merges only. See `docs/agents/git-workflow.md`.

### AFK pipeline

`afk-run` takes `ready-for-agent` issues through `afk-implement`, `afk-code-review` and `afk-pr`, one fresh subagent per stage, handing off through files under `.git/afk/<n>/`. See `docs/agents/afk.md`.

### ADRs

When `docs/adr/README.md` exists, read it and not the `docs/adr/` directory. It holds one line per decision. Open a single ADR only when you are changing what it governs. Every new ADR adds its line to the index in the same commit, and the first ADR creates the index.

### Handoff notes

`docs/handoff/` holds one file per investigation that outlived its PR, such as a platform bug we work around or a diagnosis the code does not explain. Name it `<issue>-<slug>.md` and list it here with one line. Read one only when the code points you at it. A comment that depends on a handoff names the file.
