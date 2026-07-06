# Testing

Current state: **zero committed tests** (Playwright is installed but unused; root-level `test-*.js` files are ad-hoc scripts, not a suite). The repo standard demands 80% coverage and TDD; this doc reconciles that with reality: for the refactor ahead, tests are not optional polish — they are the *enabling mechanism* (you cannot strangle an 8,526-line component safely without a characterization net).

## 1. Strategy — pyramid inverted for our situation, then righted

**Phase 1 (now): characterization E2E first.** Before touching `CanvasClient.tsx`, lock current behavior with Playwright flows. These tests assert *what is*, not *what should be* — they exist so refactors are provably behavior-preserving.

Priority characterization flows:
1. Auth → dashboard → create board (each layout type) → post → edit → delete
2. Comments: add/edit/delete in each of the three current comment surfaces (they must keep working until unified)
3. Share link → anonymous view/post; invite → member access
4. Layout switch on a seeded board (the P1 promise)
5. Kanban core: create card, move card, reorder column
6. Billing: pricing page → checkout stub → entitlement change (Stripe test mode)

**Phase 2+: unit tests for the new layers as they're built (TDD applies here):**
- `lib/domain` commands & reducers: every op type — apply, invert (undo), reject/rollback. Pure functions; fast; this is where the 80% target is real and cheap.
- `placementCodec` per layout: zod schema round-trips, `defaultFor` correctness.
- Permission resolver: full capability-matrix table test (matrix in PERMISSIONS.md *is* the fixture).
- Fractional ordering: property-based tests (fast-check) — no collisions/reordering anomalies under random concurrent inserts.

**Realtime convergence (the moat test, REALTIME_ARCHITECTURE.md §7):**
- Two-context Playwright: concurrent move, concurrent same-field edit, offline-queue replay, version-gap recovery.
- Headless op fuzzer: N simulated clients × random op streams → assert all replicas converge. Runs nightly; failures are P0 bugs.

## 2. Tooling

| Layer | Tool |
|---|---|
| Unit/component | **Vitest** + React Testing Library (add; repo has none) |
| E2E | Playwright (`@playwright/test` already installed) |
| DB/RLS | Supabase local (`supabase start`) + pgTAP-style SQL tests for policies: every table × role × verb matrix |
| Property | fast-check for ordering/merge logic |
| A11y | axe-core inside Playwright (ACCESSIBILITY.md §6) |
| Perf | Playwright perf suite on seeded boards (PERFORMANCE.md §4) |

Test data: one seeding module (`test/seed.ts`) creating deterministic workspaces/boards/posts via the domain layer (never raw SQL inserts, so seeds stay schema-valid). Fixtures: 5-post, 50-post, 500-post, 2,000-post boards.

## 3. CI Gates (in order of adoption)

1. **Week 1:** typecheck + lint + build must pass (repo currently carries `tsc_output.txt` files suggesting known type errors — burn to zero and gate).
2. **Phase 1:** characterization E2E green on PRs touching board code; RLS matrix tests green on migration PRs.
3. **Phase 2:** unit coverage on `lib/domain` ≥ 80% (repo standard applied where it's meaningful — we do *not* chase 80% across legacy UI that's scheduled for deletion).
4. **Phase 3:** axe + bundle-size + perf budgets as gates.

## 4. Rules

- Bug fix ⇒ regression test in the same PR (no exceptions — this is how the net grows).
- New domain logic ⇒ test-first (repo TDD standard applies fully to `lib/domain`).
- Flaky test = quarantined same day, fixed or deleted within a week; a red-but-ignored suite is worse than no suite.
- Tests use the public surface (ops, commands, rendered UI) — never reach into store internals; refactors shouldn't break tests unless behavior changed.
- Delete the root `test-*.js` / `check_*.js` / `audit_frames.js` scripts as their subjects gain real tests (CODING_STANDARDS.md §3).
