# Current Task

> Living document. Update at the start and end of every working session. History goes to the log at the bottom; only ONE task is "Now".

## Now

**Phase 1 — Domain Layer & Characterization Net** (opened 2026-07-06).
Work flows through numbered patches in `.fable5/patches/` designed by the CTO model
and executed by implementation models (SKILL.md).

**Active patch:** `PATCH-001` (authenticated characterization harness + board
lifecycle test) — **drafted, awaiting owner approval.** Owner pre-work: create a
dedicated Supabase test user and set `E2E_EMAIL` / `E2E_PASSWORD` in `.env.local`.

**Planned next:** PATCH-002 ESLint boundary freeze (no new `@supabase/*` imports in
components) → PATCH-003 `lib/domain` skeleton → PATCH-004+ command extraction.

### Phase 0 carried items (do not block PATCH-001)

1. **Finish migration baseline** — blocked on Docker + DB password. Procedure documented in `supabase/BASELINE.md`. Until done, `supabase/baseline/schema_snapshot_2026-07-05.sql` is the schema reference.
2. **Git history purge (decision needed)** — `tmp/` Chrome profiles (Login Data, Cookies, third-party session storage; 10,726 files) are removed from tip but remain in git history. Repo has NO remote, so `git filter-repo --path tmp --invert-paths` is feasible and recommended. Full pre-purge backup exists: `c:/Users/rmeic/Projects/dev/starter-pre-phase0-20260706.bundle` (165 MB). **User approval required** — rewrites all commit hashes.
3. **Telemetry** — Sentry + web-vitals RUM + `board_open_ms` not yet added (SYSTEM_DESIGN.md §7).
4. **dhtmlx licensing decision** — still open (SECURITY.md §4).
5. **Lint burn-down** — 5,426 errors (mostly `no-explicit-any`, unused vars). Lint is decoupled from build (`next.config.ts eslint.ignoreDuringBuilds`) and advisory in CI. Remove the bypass when it reaches zero.
6. **Push to a remote** — CI workflow (`.github/workflows/ci.yml`) is inert until the repo has a GitHub remote. Also: only backup is one local bundle; an off-machine remote is the real fix.

### Phase 0 completed (2026-07-06)

- WIP work committed (`326bd09`), .fable5 docs committed (`1bb4c5a`).
- Hygiene: removed committed Chrome profiles/logs/artifacts (`bcba8fe`), backup copies + dead files (`7b1ed14`), root dev scripts (`edcd1fd`), Kopie CSS + component copies, orphan `CommentsPanel.jsx` with hardcoded anon key, debug routes (`/debug-db`, `/api/test`, `/api/test-db`); untracked `.claude/settings.local.json`; hardened `.gitignore`.
- DB: root SQL archived to `supabase/legacy/`, single snapshot kept at `supabase/baseline/`, `supabase/BASELINE.md` written.
- **Production build fixed** (was broken): lint decoupled, three `useSearchParams` pages wrapped in Suspense.
- Typecheck: **0 errors** (old tsc_output files were stale).
- Gates: `npm run typecheck` / `verify` / `test:e2e`; CI workflow ready; **4 Playwright smoke tests passing** against the production build (`e2e/smoke.spec.ts`).

## Blocked / Decisions Needed

| Decision | Owner | Needed by | Notes |
|---|---|---|---|
| Approve git history purge of `tmp/` | User | ASAP (credential material in history) | Bundle backup exists; no remote → safe window |
| dhtmlx buy-vs-replace | User | Phase 0 exit | GPL exposure; recommendation: replace |
| Surviving canvas system | CTO | Phase 1 | Needs feature diff first |
| Default branch `master` vs `main` | User | Before remote push | Work is on `master` |

## Context for a Fresh Session

- Read `.fable5/CLAUDE.md` first, then this file.
- Working tree is clean; all Phase 0 work is committed on `master`.
- `npm run verify` = typecheck + build; `npm run test:e2e` = smoke suite (builds must exist: run build first or let webServer reuse).
- Comment storage split (`metadata.comments` / `detachedComments` / `canvas_comments`) is a planned Phase 3 migration — do not fix opportunistically.
- Excalidraw fork has its own `node_modules` committed (major repo bloat); handle carefully in a later phase — it backs a `file:` dependency.

## Log

- **2026-07-06 (pm)** — Phase 0 executed: hygiene purge (~10.9k files removed from tip), secrets audit (no service keys; anon key orphan removed; Chrome profiles found in history — purge pending approval), SQL reorganized + baseline documented, production build repaired, CI gates + smoke tests added and passing.
- **2026-07-06 (am)** — Architecture audit completed; `.fable5/docs` documentation suite created (20 docs). Phase 0 defined.
