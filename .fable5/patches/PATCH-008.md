# PATCH-008 — Extraction: achievements page (read-only repository variant)

**Status:** draft (awaiting owner approval)
**Complexity:** easy
**Assigned model:** **GPT-5.4**
**Canonical reference:** PATCH-004 (commit `5278468`) — minus the command:
this page never writes, so this patch establishes the READ-ONLY variant of
the pattern (repository only, no command). That absence is deliberate; do
not invent a command.

## Goal
Move `app/dashboard/settings/achievements/page.tsx` (264 lines, one table
`user_achievements`, one read) onto the seam; grandfather list 19 → 18.

## Bindings (the only decisions in this patch)

- **Domain file:** `lib/domain/achievements/achievements.ts`
  - The page consumes exactly ONE field of the row: `points`
    (`data.points || 0`). The domain type is therefore just:
    `export interface UserAchievements { readonly points: number; }`
  - `UserAchievementsRepository` interface:
    `load(userId): Promise<Result<UserAchievements | null, DomainError>>`
  - NO zod schema, NO command — there is no external input and no write.
- **Infra file:** `lib/infra/achievements/userAchievementsRepository.ts` —
  PATCH-004's structure (narrow structural client interface, injected client,
  factory). Query exactly as the page does today:
  `from('user_achievements').select('*').eq('user_id', userId).single()`.
  Error mapping identical to PATCH-004: `PGRST116` → `ok(null)`; other error
  → `err(unavailable, { cause })`. Row → `ok({ points: data?.points ?? 0 })`
  — note `?? 0` mirrors the page's `data.points || 0` for null/undefined;
  if `points` could be `0` the page's `|| 0` and `?? 0` agree, and for any
  other falsy the repository must produce `0` exactly as the page would.
- **Page rewrite:** `getCurrentUserId()` + repository via `useMemo`;
  load result `ok(null)` / `err` → the existing defaults path (0 points);
  `ok(value)` → `setCurrentPoints(value.points)`.
- **Known pre-existing bug — PRESERVE IT:** the page computes
  `beltIndex` from the STALE `currentPoints` state immediately after
  `setCurrentPoints` (React state hasn't updated yet), so the belt shown on
  first load can lag the points. This is characterized behavior. Do NOT fix
  it, do NOT reorder the computation. (CTO note: queued as a product bug for
  a later patch, deliberately not this one — extraction patches change zero
  behavior, including buggy behavior.)

## Files to Create
- `lib/domain/achievements/achievements.ts`
- `lib/infra/achievements/userAchievementsRepository.ts`
- `lib/infra/achievements/userAchievementsRepository.test.ts` — fake client:
  row-found (points mapped), row with `points: null` → `ok({points: 0})`,
  no-row PGRST116 → `ok(null)`, db-error → `unavailable`.
- `e2e/characterization/achievements-page.spec.ts` — Phase A first: login →
  open `/dashboard/settings/achievements` → assert the points/belt display
  renders (assert on structure, not on a specific number — points vary by
  account). Two-pass discovery rule applies.

## Files to Modify
- `app/dashboard/settings/achievements/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/achievements/page.tsx',`

## MUST NOT touch
`lib/domain/core/**`, `lib/domain/settings/**`, `lib/infra/supabase/**`
(read-only reuse), `lib/infra/settings/**`, all other pages/components,
existing e2e specs, `.fable5/`, `.claude/`. No new dependencies.
No domain unit-test file — there is no domain logic (no command, no schema);
the infra repository test above is the coverage. Do not add one for symmetry.

## Risks
- The stale-state belt bug (above) — the temptation to fix it is the risk.
- `select('*')` returns more columns than `points`; the repository maps ONLY
  `points` — that narrowing is intended (the page never used anything else).

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] New e2e spec green against OLD page first, then NEW page (pasted)
- [ ] `npm run test:unit` green; output LISTS the new infra test file
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" app/dashboard/settings/achievements/page.tsx` → 0
- [ ] Grandfather list = 18
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# Phase A — net first, against the CURRENT page
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/achievements-page.spec.ts
# Phase B — after domain+infra+tests
npm run test:unit
npx tsc --noEmit
# Phase C — after the page rewrite
PW_BASE_URL=http://localhost:3000 npx playwright test
grep -c "@supabase" app/dashboard/settings/achievements/page.tsx   # 0
# Phase D — grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Estimated Difficulty
easy — smaller than PATCH-004 (no command, no write path).
