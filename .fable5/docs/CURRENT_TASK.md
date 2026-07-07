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

**Last patch:** `PATCH-004` — **DONE (2026-07-07, commit `5278468`) — CTO
review PASSED.** First extraction landed: accessibility settings page on the
domain/infra seam (repository read + `settings.saveAccessibility` command);
grandfather list **24 → 23**; unit tests 7 → 14; new page-level
characterization spec in the e2e net. Two spec contradictions en route (both
CTO's, both correctly blocked by GPT-5.5 — Amendments 1+2 in the patch file).
**PATCH-004 is now the canonical extraction example** (AI_WORKFLOW): similar
single-table extractions go to GPT-5.4 with it as reference; joins/storage/
realtime/cross-page pages still go to GPT-5.5. Note: owner must RESTART the
dev server (CTO stopped it and cleaned `.next` during review — see
LESSONS_LEARNED netstat-locale record).

**Next: extraction batch PATCH-005 → 009 — DRAFTED (2026-07-07), awaiting
owner approval.** All GPT-5.4, all bound to the PATCH-004 template, executed
strictly in sequence (one at a time, CTO review between). Grandfather
trajectory 23 → 17:

| Patch | Target | Shape | Shrink |
|---|---|---|---|
| 005 | notifications page | purest 004 clone (`maybeSingle` variant) | 23→22 ✅ **DONE** (06e40b4, review PASSED; e2e net race fixed in 8636bd1) |
| 006 | ai + preferences pages | dead Supabase client removal (verified unused) | 22→20 ✅ **DONE** (b813ce9, review PASSED; blank-line residue cleaned 61d54dc; executed by Gemini 3.1 Pro) |
| 007 | logs page | auth-only; adds shared `getCurrentUser` (id+email) helper | 20→19 ✅ **DONE** (9f0a72d, review PASSED) |
| 008 | achievements page | read-only repository variant (no command) | 19→18 ✅ **DONE** (7ba48e2; message-only amend from 1b3c49c, review PASSED) |
| 009 | dashboard page | two repositories + joined read; **depends on 007** | 18→17 |

**Second batch PATCH-010 → 015 — DRAFTED (2026-07-07), awaiting owner
approval.** All GPT-5.4, strictly sequential after 005–009 complete.
Grandfather trajectory 17 → 10:

| Patch | Target | Pattern | Shrink |
|---|---|---|---|
| 010 | CanvasModals + OverlayLayer | type-only `AuthUser` swap (new) | 17→15 |
| 011 | ProtectedRoute | F: auth-state observer (new; adds `authState.ts` helper incl. signOut) | 15→14 |
| 012 | Navbar | F repetition (session-state mapping, census-gated) | 14→13 |
| 013 | app/page.tsx (landing) | F repetition (+ first signOut consumer; event branches preserved) | 13→12 |
| 014 | delete-account page | C (+ signOut); **exclusion reversed** — re-census proved deletion is server-side, client is a form + fetch; `app/api/**` hard-forbidden | 12→11 |
| 015 | share/[token] (server page) | G: server-page read (new; adds `serverClient.ts` — first server seam) | 11→10 |

Dependencies: 011←010; 012/013/014←011; 015 independent (runs last for
novelty, not dependency). New patterns (type-swap, F, G) enter
PATCH_REFERENCE at each review, per the catalog's reviewed-reference rule.

Still EXCLUDED (GPT-5.5 ± security review, later): password (auth.updateUser
+ MFA ×6), integrations (getSession/refreshSession token semantics), profile
+ settings-root (storage uploads), members (1,817 lines, invitations/roles),
PostCardContent (real canvas write — belongs to the ops-migration path, not
a one-off command), AddPadletMenu (storage + canvas writes), the two canvas
pages (the monolith itself).

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

**Backlog from PATCH-005 review:** memoize the browser Supabase client
(`browserClient.ts` returns a new client per call → "Multiple GoTrueClient
instances" console warning). One-line micro-patch, queue after the current
batches.

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
resolved by the push, default is `main` (was `master`); Gemini 3.1 Pro
roster — RESOLVED 2026-07-07: experimental implementer, trivial/easy
mechanical patches only (deletion-only cleanup, shallow characterization),
no architecture-bearing extractions without explicit per-patch approval;
GPT-5.4 stays the preferred economical Pattern A implementer (AI_WORKFLOW).

## Context for a Fresh Session

- Read `.fable5/CLAUDE.md` first, then this file.
- Default branch is `main`, tracking `origin/main`
  (`github.com/ezclips/collabboard`, private). Keep it pushed.
- `npm run verify` = typecheck + build; `npm run test:e2e` = smoke suite (builds must exist: run build first or let webServer reuse).
- Comment storage split (`metadata.comments` / `detachedComments` / `canvas_comments`) is a planned Phase 3 migration — do not fix opportunistically.
- Excalidraw fork has its own `node_modules` committed (major repo bloat); handle carefully in a later phase — it backs a `file:` dependency.

## Log

- **2026-07-07** — PATCH-008 DONE (7ba48e2), CTO review PASSED — Pattern D
  (read-only repository) validated; stale-belt bug preserved as specified;
  grandfather 19→18; unit 25; e2e 12/12. Commit message named the wrong page
  (stale handoff title) — message-only amend on the unpushed tip
  (1b3c49c→7ba48e2); handoff template rule 11 added (copy titles verbatim).
- **2026-07-07** — PATCH-007 DONE (9f0a72d), CTO review PASSED — logs page
  extracted (Pattern C); `getCurrentUser` helper live (009 dependency met);
  grandfather 20→19; full e2e 11/11. Clean GPT-5.4 execution. Governance
  note: commit-message hints go in handoffs, not patch files (.fable5 is
  CTO-only).
- **2026-07-07** — PATCH-006 DONE (b813ce9), CTO review PASSED — dead clients
  verified gone at SOURCE level (parent: 2 refs/page; HEAD: 0). Grandfather
  22→20. Executed by Gemini 3.1 Pro (new implementer, owner-assigned): craft
  deviations only (blank-line residue instead of deletions — cleaned in
  labeled fix 61d54dc; non-conventional commit message). Full e2e 10/10.
  Roster question raised: formalize Gemini's role in AI_WORKFLOW?
- **2026-07-07** — PATCH-005 DONE (06e40b4), CTO review PASSED — first GPT-5.4
  extraction, pattern-compliant on both spec traps. Grandfather 23→22, unit
  tests 14→21. Review surfaced a race in PATCH-004's accessibility spec
  (fire-and-forget save vs. immediate reload; passed by luck before) — fixed
  with a waitForResponse barrier (8636bd1), rule added to PATCH_REFERENCE §6.
  Backlog: browserClient singleton (GoTrueClient warning).
- **2026-07-07** — Second batch PATCH-010…015 drafted from a census of ALL
  remaining grandfathered files. Finds: CanvasModals/OverlayLayer are
  type-only `import type { User }` (trivial −2); ProtectedRoute/Navbar/
  landing share the getSession+onAuthStateChange shape (new Pattern F with
  one bound helper); delete-account's deletion is server-side (exclusion
  reversed, API route hard-forbidden); share/[token] is a server component
  reading share_links with a service-role fallback (new Pattern G, first
  server seam; security question about RLS-scoped lookup queued, behavior
  preserved). PostCardContent stays excluded: its write belongs to the
  future ops path, not a one-off command.
- **2026-07-07** — Extraction batch PATCH-005…009 drafted from a fresh census
  of all 12 grandfathered settings pages (sizes, tables, exact supabase API
  usage per page). Sequenced: template validation → free wins → helper
  introduction → read-only variant → composite page. Notable census finds:
  ai + preferences import Supabase but never use it (dead client); logs
  renders mock data and only needs the user's email; achievements is
  read-only with a pre-existing stale-state belt bug (preserved, queued).
- **2026-07-07** — PATCH-004 Amendment 2: flat "no build" contradicted
  `verify`; guard restored to conditional form, build sequenced after dev
  server stops. Verify gate NOT weakened. Lesson: never restate a
  conditional rule without its condition.
- **2026-07-07** — PATCH-004 Amendment 1: GPT-5.5 blocked correctly on a spec
  contradiction (vitest include vs. config-freeze); CTO authorized the
  one-line vitest.config.ts widening; acceptance criteria hardened (test file
  names must appear in pasted run output). Lesson recorded.
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
