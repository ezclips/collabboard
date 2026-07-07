# Architecture Changelog

Dated record of every architectural decision, reversal, and milestone.
Newest first. One entry per decision — link the owning doc for detail.

## 2026-07-07 — Remote repository live; risk register rebalanced

- **Resolved:** the #1 standing risk since Phase 0 — private GitHub remote
  (`ezclips/collabboard`), branch renamed master → `main`, in sync
  (CTO-verified). CI workflows are now live-capable.
- **Elevated as a consequence:** the Chrome-profile credential material in git
  history now has an off-machine copy on GitHub — the history purge
  (filter-repo + force-push) escalates from "when convenient" to "next owner
  action". Single collaborator, so force-push is safe; bundle backup exists.
- **New follow-up:** GitHub Actions secrets must be configured
  (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`) or CI's build/smoke steps run red.

## 2026-07-07 — PATCH-003 landed: domain layer seam open (75d7626)

- **Shipped (Codex GPT-5.4):** `lib/domain` foundation — `Result<T,E>`, closed
  `DomainError` taxonomy (8 codes), branded ids, `defineCommand` (zod-validated,
  throw-converting, callable with `entity.verb` name), `BoardRepository`
  exemplar interface, CONVENTIONS.md, 7 unit tests (vitest 3.2.7, first real
  unit tests in the repo), domain-purity lint block enforced from day one.
  `verify` now = typecheck → boundaries → unit tests → build; CI gains a
  blocking unit-test step.
- **One spec bug en route (CTO's):** `Object.assign(fn, { name })` throws —
  `Function.name` is writable:false. Fixed via `Object.defineProperty`
  (configurable:true); the Command interface deliberately unchanged.
- **Phase 1 state:** net (001) + freeze (002) + seam (003) complete. Next:
  PATCH-004 — first extraction consumes the seam and removes the first entry
  from the 24-file grandfather list.

## 2026-07-07 — PATCH-002.1 landed: React 19.2.7, npm installability restored (b5698b5)

- **Shipped (Codex GPT-5.4, attempt 2):** react/react-dom 19.1.0 → 19.2.7,
  satisfying react-chrono's peer contract that the lockfile had violated —
  every `npm install` was failing. Lockfile audit: 3 expected changes only.
  Full e2e net green on React 19.2. `--legacy-peer-deps`/`--force` were
  explicitly rejected as the fix.
- **Process decision (owner-proposed, adopted):** "warnings are observations;
  errors are blockers" — only non-zero exit codes or failed acceptance
  criteria stop a patch unless the spec names a specific warning as a blocker.
  Codified in SKILL.md + handoff template rule 10 after attempt 1 halted on
  accepted peer warnings.
- **Classified debt with named homes:** typescript-eslint peer-lag (TS 5.9.3
  vs <5.9 range) → lint-overhaul patch; react-twitter-embed React-19 peers →
  embed/dependency review.

## 2026-07-07 — PATCH-002 landed: UI boundary freeze (commit a7fe12c)

- **Shipped:** blocking `check:boundaries` gate (in `verify` + CI) — no new
  `@supabase/*` imports in UI code; 24 existing violators grandfathered on a
  shrink-only list. Server routes (`app/api/**`, `**/route.ts`) stay in scope
  of the domain-layer migration, not the freeze.
- **First delegated patch (Codex GPT-5.4):** implementation was spec-faithful;
  the spec itself had two defects caught in CTO review — Next.js dynamic-route
  folders (`[id]`) are glob character classes and must be escaped in ESLint
  ignore paths; inline eslint-disable comments referencing unloaded plugin rules
  error in a standalone config. Fix `--no-inline-config` doubles as hardening
  (the boundary cannot be eslint-disabled away). Codex skipped the verification
  and commit steps — delegation prompts now must demand pasted verification
  output and the commit itself.

## 2026-07-07 — PATCH-001 landed: characterization harness (Phase 1 net begins)

- **Shipped (commit 9b8bed2):** authenticated Playwright harness + wall board
  lifecycle test (create → add note → edit/persist → delete board). Projects:
  setup/smoke/characterization; `PW_BASE_URL` lets the suite run against a live
  dev server so we never build under a running dev server (SKILL.md guard).
- **Deviation (accepted):** standalone post-deletion via the wall card's
  right-click menu was deferred — on the wall layout that menu is unreliable to
  drive (right-click reopens the editor; items lack stable menuitem roles). Board
  deletion still exercises a delete path and removes the post. Queued as a
  follow-up once wall context-menu a11y is fixed.
- **Findings surfaced during execution (backlog, not fixed here):**
  1. Sidebar tools and canvas post cards are non-semantic `<div onClick>` with
     tooltip-span labels — no button/menuitem roles. Concrete first entry for the
     ACCESSIBILITY.md burn-down; also makes tests brittle.
  2. Board-create redirects to `/dashboard`, not into the new board — minor P2
     friction (extra click to start working). Product decision for later.
  3. Free-plan board limit + soft-delete means abandoned test/QA boards consume
     quota; e2e cleanup must hard-delete or run under a high-limit account.
- **Repo note:** more backup files found in `app/dashboard/create-canvas/`
  (`also no good...`, `long_but works_page.tsx`, `samepage.tsx`) — Phase 0-style
  cruft, queued for a hygiene sweep (not touched by this patch).

## 2026-07-07 — Login flow hardened; auth-proxy scaling flaw identified

- **Incident:** logins failing with 429. Root cause was Supabase's per-IP auth rate
  limit (~30 sign-in requests/5 min) tripped by repeated attempts — not an app bug.
  Confirmed by hitting GoTrue directly (`over_request_rate_limit`).
- **Patch implemented:** password sign-in is now client-primary. The browser calls
  `/api/auth/login` for app-level lockout preflight, signs in directly with Supabase
  so Supabase sees the user's IP, then reports success/failure back to the same route
  for rate-limit bookkeeping.
- **Decision (accepted from implementation model):** login success is taken from the
  login response itself, not a follow-up `auth.getUser()` read; profile upsert after
  login is best-effort and can no longer block sign-in.
- **Decision (rejected from implementation model):** client-side
  `signInWithPassword` fallback when the server route is rate-limited. Rejected
  because it duplicates the login path (P6), bypasses the server's lockout
  bookkeeping, and doesn't help anyway when the IP itself is limited.
- **Flaw resolved at app layer:** ALL sign-ins used to proxy through the server route,
  so in production every user shares the server's egress IP against Supabase's
  per-IP auth limits — classroom-scale simultaneous logins could mass-fail. The
  normal browser path now signs in directly against Supabase while keeping app-level
  throttling as a server-side observer. The legacy password-proxy branch remains
  as compatibility fallback and should be removed after a short soak.
- **CTO review of the above (accepted with notes):** the `success` phase correctly
  verifies the caller's real session cookie before clearing lockouts — good. Known
  limitation queued for the auth security patch: the unauthenticated `failure` phase
  lets an attacker inflate a victim email's lockout counter (bounded by the
  reporter's own IP throttle, and equivalent-cost attack existed before, but should
  be hardened — e.g., per-IP cap on failure reports).
- **Second root cause found:** `middleware.ts` ran `getSession()` (which can refresh
  tokens) on EVERY request including all `/api/*` calls; token refreshes count
  against the same per-IP Supabase auth limit, keeping it permanently exhausted in
  dev and blocking all sign-ins. Fix: middleware matcher now excludes `/api/*` and
  assets — session sync happens on page navigations only. Production corollary:
  many users behind one NAT (a school) share that per-IP budget; keep auth traffic
  frugal by design.
- **Attribution correction (from owner's dashboard, 2026-07-07):** sign-ins and
  token refreshes are SEPARATE per-IP buckets (30/5min vs 150/5min). The prolonged
  sign-in 429s were the 30/5min sign-in bucket being repeatedly refilled by retry
  attempts from all parties; the middleware refresh traffic pressured the separate
  refresh bucket. The middleware fix stands on its own merits (wasteful auth
  traffic), but calm retry discipline is what clears sign-in blocks.
- **New risk from the same dashboard: project email limit is 2/hour** (Supabase
  built-in SMTP default). Signup confirmations, password resets, and invitation
  emails will fail beyond 2 users/hour — this silently caps growth and breaks
  onboarding. Action queued: configure custom SMTP (Resend/Postmark/SES) before
  any beta. Also noted: anonymous sign-ins are 30/hour/IP — reinforces the
  PERMISSIONS.md decision to implement share-link visitors with signed cookies,
  NOT Supabase anonymous users (a classroom behind one NAT would exhaust 30/h
  instantly).

## 2026-07-06 — Phase 1 opened; patch system instituted

- **Decision:** All implementation work now flows through numbered patches in
  `.fable5/patches/`, designed by a CTO-level model and executed by implementation
  models. Governance docs added: SKILL.md (implementers), CTO_GUIDELINES.md (CTO models).
- **Decision:** Phase 1 begins with the characterization test harness (PATCH-001),
  before any domain-layer code. Rationale: no extraction from `CanvasClient.tsx` is
  safe without a behavior net (TESTING.md §1).
- **Carried risk (accepted, tracked):** Phase 0 exit criteria not 100% met — migration
  baseline blocked on Docker/DB access, telemetry not yet installed, repo has no
  remote. None block PATCH-001; all remain on CURRENT_TASK.md.

## 2026-07-06 — Phase 0 executed (hygiene, gates, build repair)

- Removed ~10.9k committed junk files from tip, including full Chrome browser profiles
  (`tmp/`) containing third-party session material. **History purge pending owner
  approval** (no remote exists; backup bundle at `../starter-pre-phase0-20260706.bundle`).
- **Decision:** Lint decoupled from production build (`eslint.ignoreDuringBuilds`)
  because 5,426 legacy lint errors made deploys impossible. Build now gates on
  compile + types (0 errors). Bypass is temporary; burn-down tracked in CURRENT_TASK.md.
- **Decision:** Hand-applied SQL archived to `supabase/legacy/`; single schema snapshot
  kept at `supabase/baseline/schema_snapshot_2026-07-05.sql`; migrations-only rule in
  force from now on (`supabase/BASELINE.md`).
- Debug/test routes removed from the app; orphan component with hardcoded anon key
  removed; `.claude/settings.local.json` untracked.
- CI gates defined (`.github/workflows/ci.yml`, inert until a remote exists);
  `npm run typecheck|verify|test:e2e` added; 4-test Playwright smoke suite green
  against the production build.
- Prerender fixes: three `useSearchParams` pages wrapped in Suspense (Next 15 requirement).

## 2026-07-06 — Architecture audit and target architecture adopted

- Full audit produced the `.fable5/docs` suite (20 documents). Headline findings:
  no domain layer (105 direct Supabase call sites in one 8,526-line component), two
  parallel canvas systems, kanban schema island, comments in three storage shapes,
  non-reproducible migrations, zero tests, GPL-licensed dhtmlx in a proprietary bundle.
- **Decision:** Strangler migration, not rewrite (ARCHITECTURE.md §4).
- **Decision:** Target = one board engine, layouts as plugins, op-based writes,
  blocks + placements data model, Broadcast-based realtime with per-property LWW +
  fractional indexes; Yjs scoped to rich text only.
- **Decision:** Supabase endorsed as platform through ~100k MAU with documented exit
  ramps (SYSTEM_DESIGN.md).
