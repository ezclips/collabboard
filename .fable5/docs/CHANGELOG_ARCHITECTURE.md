# Architecture Changelog

Dated record of every architectural decision, reversal, and milestone.
Newest first. One entry per decision — link the owning doc for detail.

## 2026-07-07 — Login flow hardened; auth-proxy scaling flaw identified

- **Incident:** logins failing with 429. Root cause was Supabase's per-IP auth rate
  limit (~30 sign-in requests/5 min) tripped by repeated attempts — not an app bug.
  Confirmed by hitting GoTrue directly (`over_request_rate_limit`).
- **Decision (accepted from implementation model):** login success is taken from the
  login response itself, not a follow-up `auth.getUser()` read; profile upsert after
  login is best-effort and can no longer block sign-in.
- **Decision (rejected from implementation model):** client-side
  `signInWithPassword` fallback when the server route is rate-limited. Rejected
  because it duplicates the login path (P6), bypasses the server's lockout
  bookkeeping, and doesn't help anyway when the IP itself is limited.
- **Flaw identified, patch pending:** ALL sign-ins proxy through the server route,
  so in production every user shares the server's egress IP against Supabase's
  per-IP auth limits — classroom-scale simultaneous logins will mass-fail.
  Direction: make client-side sign-in the primary path (per-user IPs) and keep
  app-level throttling as a server-side observer. Requires its own patch +
  security review; tracked on CURRENT_TASK.md.

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
