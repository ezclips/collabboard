# Current Task

> Living document. Update at the start and end of every working session. History goes to the log at the bottom; only ONE task is "Now".

## Now

**Phase 1 — Domain Layer & Characterization Net** (opened 2026-07-06).
Work flows through numbered patches in `.fable5/patches/` designed by the CTO model
and executed by implementation models (SKILL.md).

**Last patch:** `PATCH-001` — **DONE (2026-07-07, commit 9b8bed2).** Authenticated
characterization harness + wall board lifecycle test. `npm run test:e2e` = 6 pass
with credentials; skips cleanly without. Run against a live dev server with
`PW_BASE_URL=http://localhost:3000` (never build under a running dev server).

**Last patch:** `PATCH-002` — **DONE (2026-07-07, commit a7fe12c).** Blocking UI
boundary check live: `npm run check:boundaries` (in `verify` + CI) fails on any
new `@supabase/*` import in UI code; 24 grandfathered files (shrink-only list in
`eslint.boundaries.config.mjs`). Implemented by Codex GPT-5.4; two spec defects
fixed in CTO review (glob escaping of `[id]` routes; `--no-inline-config`).

**Active patch:** `PATCH-003` (domain layer foundation: `lib/domain` skeleton —
Result, error taxonomy, branded ids, `defineCommand`, `BoardRepository`
interface, conventions, unit tests via vitest, domain-purity lint) —
**DONE (2026-07-07, commit 75d7626) — CTO review PASSED.** Domain seam open:
Result/errors/ids/defineCommand/BoardRepository + conventions + purity lint +
7 unit tests; verify chain and CI extended. Full independent re-verification
green (lockfile audit +139 vitest tree / 0 removed / 4 transitive bumps;
canary proof live).

**Last patch:** `PATCH-003.5` — **DONE (2026-07-07).** History purge executed
and proven: filter-repo across all refs (HEAD tree-identical before/after),
pack 166 → 38.8 MiB, GitHub repo deleted + recreated with purged history only
(pre-rewrite SHA fetch fails), all branches/tags pushed. Remaining owner
follow-ups: Actions secrets (below), recommended Supabase session revocation
(PATCH-003.5 §4). Bundles retained until PATCH-004 verified on new remote.
**All commit hashes changed** — hashes in docs older than this line refer to
pre-rewrite history; map via commit messages if needed.

**Active patch:** `PATCH-004` (first extraction: accessibility settings page →
domain/infra seam; target chosen by census — smallest page, 186 lines, one
table, two ops; net-first phase order; grandfather list 24 → 23 only after
proof) — **DRAFTED, awaiting owner approval.** CTO recommends **GPT-5.5**
(pattern-setting extraction needs senior latitude); PATCH-005+ repetitions go
to GPT-5.4 with this as exemplar.

**Prerequisite `PATCH-002.1`: DONE (2026-07-07, commit b5698b5) — CTO review
PASSED.** react/react-dom 19.1.0 → 19.2.7; lockfile audit clean (3 expected
changes only); install idempotent; vitest dry-run exit 0; typecheck 0;
boundaries green; dev server restarted; **e2e net 6/6 green on React 19.2.**
Two warning families remain as classified debt (typescript-eslint peer-lag →
lint-overhaul patch; react-twitter-embed React-19 peers → embed/dependency
review).

**Delegation lesson (2026-07-07):** Codex implemented faithfully but skipped the
spec's verification and commit steps. Future delegation prompts must state:
"run every verification command and paste real output; the patch is not done
until the commit exists."

**Backlog from PATCH-001 execution:**
- Deferred: standalone post-delete e2e step (wall context-menu a11y/selectors).
- a11y: sidebar tools + post cards are non-semantic `<div onClick>` — first
  concrete ACCESSIBILITY.md burn-down item.
- Hygiene: more backup files in `app/dashboard/create-canvas/` to sweep.
- e2e board quota: cleanup must hard-delete or use a high-limit test account.

**Completed urgent patch (2026-07-07):** auth sign-in path redesign — password login
is now client-primary with `/api/auth/login` used for app-level lockout preflight
and success/failure bookkeeping. This avoids all users sharing the server egress IP
against Supabase's per-IP auth limit. Follow-up: remove the legacy password-proxy
branch after a short soak (see CHANGELOG_ARCHITECTURE.md 2026-07-07).

**E2E credentials:** test user exists; `E2E_EMAIL` / `E2E_PASSWORD` are set in
`.env.local` — PATCH-001 owner pre-work is DONE.

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
| Configure GitHub Actions secrets (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | User | **Now** (repo recreated; do once) | PATCH-003.5 §6; E2E creds deliberately NOT added to CI |
| Revoke Supabase sessions for e2e user + any account used in the old automation profiles | User | Soon (recommended, not blocking) | PATCH-003.5 §4 — "sign out everywhere"; kills refresh tokens that survive password changes |
| Approve PATCH-004 delegation to GPT-5.5 | User | Next | Patch drafted + approved-to-draft; ready for handoff |
| dhtmlx buy-vs-replace | User | Phase 0 exit | GPL exposure; recommendation: replace |
| Surviving canvas system | CTO | Phase 1 | Needs feature diff first |
| Raise Supabase sign-in limit 30→100/5min (dev convenience + school-NAT headroom) | User | Anytime (dashboard, 1 min) | Auth → Rate Limits |
| Configure custom SMTP (email limit is 2/h on built-in) | User | Before ANY beta/invites | Breaks signup/reset/invites beyond 2 users/h |

**Resolved decisions:** remote repository — DONE 2026-07-07 (private
`github.com/ezclips/collabboard`, `origin/main` in sync); branch question —
resolved by the push, default is `main` (was `master`).

## Context for a Fresh Session

- Read `.fable5/CLAUDE.md` first, then this file.
- Default branch is `main`, tracking `origin/main`
  (`github.com/ezclips/collabboard`, private). Keep it pushed.
- `npm run verify` = typecheck + build; `npm run test:e2e` = smoke suite (builds must exist: run build first or let webServer reuse).
- Comment storage split (`metadata.comments` / `detachedComments` / `canvas_comments`) is a planned Phase 3 migration — do not fix opportunistically.
- Excalidraw fork has its own `node_modules` committed (major repo bloat); handle carefully in a later phase — it backs a `file:` dependency.

## Log

- **2026-07-07** — PATCH-003.5 EXECUTED: history purge complete and proven
  (all-refs filter-repo, tree-identical, 166→38.8 MiB; GitHub repo replaced,
  old SHAs unfetchable; branches+tags pushed). All commit hashes rewritten.
  Standing risk #1 resolved; secrets + session revocation queued to owner.
- **2026-07-07** — PATCH-003.5 drafted (history purge runbook) after the
  GitHub push escalated the credential-history risk. Scope verified: GitHub
  holds only main; local tags/agent branch also carry the profiles and are
  cleaned by the same rewrite. Health rubric written into CTO_PLAYBOOK §13;
  pre-push gate + operational-patch rules added to AI_WORKFLOW.
- **2026-07-07** — CTO_PLAYBOOK.md created (succession doc: patch evaluation/
  rejection, split/refactor/abstraction judgment, debt prioritization,
  philosophies, if-this-then-that table).
- **2026-07-07** — Knowledge-extraction pass: LESSONS_LEARNED.md,
  AI_WORKFLOW.md (roles: Fable 5 CTO / GPT-5.5 senior / GPT-5.4 implementer),
  CODER_HANDOFF_TEMPLATE.md, `extract-approach` skill; CLAUDE.md rule 11
  (learning note after every non-trivial solved problem).
- **2026-07-07** — PATCH-001 DONE (commit 9b8bed2): characterization harness +
  board lifecycle test green (6 pass w/ creds, clean skips w/o). Phase 1 behavior
  net is live. Backlog items recorded above.
- **2026-07-07** — Login incident RESOLVED (owner-confirmed in browser). Causes:
  Supabase per-IP sign-in limit (30/5min) kept warm by retries; middleware was
  additionally refreshing tokens on every API call (fixed, `f64dd76`). Auth is now
  client-primary with server lockout bookkeeping (`51db5a8`, CTO-reviewed).
  Owner follow-ups queued: raise sign-in limit 30→100/5min, custom SMTP (email
  cap is 2/h), auth hardening items for a later security patch.
- **2026-07-06 (pm)** — Phase 0 executed: hygiene purge (~10.9k files removed from tip), secrets audit (no service keys; anon key orphan removed; Chrome profiles found in history — purge pending approval), SQL reorganized + baseline documented, production build repaired, CI gates + smoke tests added and passing.
- **2026-07-06 (am)** — Architecture audit completed; `.fable5/docs` documentation suite created (20 docs). Phase 0 defined.
