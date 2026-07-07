# PATCH-001 — Authenticated characterization harness + board lifecycle test

**Status:** DONE (2026-07-07, commit 9b8bed2). Verified: 6 pass with credentials;
smoke pass + auth/characterization skip cleanly without. One accepted deviation
(below): standalone post-deletion deferred due to wall context-menu fragility.

## Goal
Extend the existing Playwright setup with an authenticated session and one
characterization test covering the core board lifecycle (create board → add post →
edit post → delete post → delete board), asserting **current** behavior.

## Reason
Phase 1 extracts data access out of `app/dashboard/canvas/[id]/CanvasClient.tsx`
(8,526 lines, 105 Supabase call sites). No extraction is safe without a behavior net
(TESTING.md §1). Today only 4 unauthenticated smoke tests exist; nothing exercises a
logged-in board.

## Why now / why this order
- Before PATCH-002 (ESLint boundary freeze) because the net validates that the app
  and test login actually work end-to-end — every later patch relies on this suite.
- Before any domain-layer code because characterization must lock behavior *prior*
  to the first refactor; a net written after a refactor proves nothing.

## Expected Outcome
`npm run test:e2e` runs: (a) existing smoke suite, (b) an auth setup step that logs in
once and saves storage state, (c) `board-lifecycle.spec.ts` green against the
production build. Suite self-skips (with a visible warning) when E2E credentials are
not configured.

## Files to Create
- `e2e/auth.setup.ts` — logs in via the `/auth` UI using `E2E_EMAIL` / `E2E_PASSWORD`
  env vars; saves storage state to `e2e/.auth/user.json` (gitignored).
- `e2e/characterization/board-lifecycle.spec.ts` — the lifecycle test (details below).
- `e2e/helpers/env.ts` — reads env vars; exports `hasE2ECredentials`; test files call
  `test.skip(!hasE2ECredentials, 'E2E_EMAIL/E2E_PASSWORD not set')`.
- `.env.e2e.example` — documents the two variables (no real values).

## Files to Modify
- `playwright.config.ts` — add a `setup` project (runs `auth.setup.ts`) and make the
  `chromium` project depend on it with `storageState: 'e2e/.auth/user.json'` for tests
  under `e2e/characterization/`; smoke tests keep running unauthenticated.
- `.gitignore` — add `e2e/.auth/`.

## Files that MUST NOT be touched
- Anything under `app/`, `components/`, `lib/`, `supabase/`, `types/`
- `next.config.ts`, `package.json`, `middleware.ts`
- Existing `e2e/smoke.spec.ts` (do not weaken or restructure it)

## Architecture Notes
- Characterization = assert what the app DOES. If the UI shows quirky behavior, assert
  the quirk (with a comment), don't "fix" the assertion to what seems right.
- Selectors: prefer `getByRole` / `getByPlaceholder` / visible text. Read the relevant
  components to find stable selectors before writing the test — do not guess. The board
  creation flow starts at `/dashboard` (create-canvas flow); pick the **wall** layout.
- The test must create its own board (name it `e2e-lifecycle-<timestamp>`), operate only
  on that board, and delete it in `afterAll`/`finally` even when assertions fail.
  Never touch pre-existing boards.
- Credentials come from env only. Use a dedicated test account (owner creates it;
  see Migration Notes). Never hardcode emails/passwords/URLs.

## Migration Notes
Owner one-time action before running: create a test user in the Supabase project
(email+password auth), put credentials in `.env.local` as `E2E_EMAIL` / `E2E_PASSWORD`.
No schema changes. No data migrations.

## Potential Risks
- **Selector fragility** — mitigated by role/text selectors and by reading the actual
  components first.
- **Test-data pollution** — mitigated by timestamped board names + guaranteed cleanup;
  worst case is an orphan `e2e-lifecycle-*` board, harmless and identifiable.
- **Auth flow surprises** (email confirmation, rate limiting on `/auth`) — if login
  cannot complete via UI, stop and report; do not script around Supabase auth directly.

## Rollback Plan
`git revert` the patch commit. No product code, schema, or config beyond
`playwright.config.ts` is touched; reverting restores the previous smoke-only setup.

## Acceptance Criteria
- [ ] `npm run build && npm run test:e2e` green locally with credentials set
- [ ] Same command green (characterization skipped, smoke still runs) with credentials unset
- [ ] `git diff --stat` touches only the listed files
- [ ] Created board is deleted at the end of the run (verify in the dashboard)
- [ ] No product source files modified; smoke suite unmodified

## Required Tests
This patch IS tests. Run the full e2e suite twice: with and without credentials.
Paste both outputs in the report.

## Estimated Difficulty
Medium — the code is small; the work is discovering the real UI flow and stable selectors.
