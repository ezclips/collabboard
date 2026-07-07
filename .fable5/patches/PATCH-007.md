# PATCH-007 — Extraction: activity logs page; introduce `getCurrentUser` infra helper

**Status:** **DONE — CTO review PASSED (2026-07-07, commit `9f0a72d`).**
**Complexity:** easy
**Assigned model:** **GPT-5.4**
**Canonical reference:** PATCH-004 (commit `5278468`).

## Goal
Move `app/dashboard/settings/logs/page.tsx` (246 lines) off direct Supabase;
grandfather list 20 → 19. The page's ONLY Supabase use is `auth.getUser()` —
but it consumes `user.email` (for the mock log entries it renders), so this
patch also adds the shared infra helper `getCurrentUser` (id + email) that
PATCH-009 will reuse.

## Bindings (the only decisions in this patch)

- **Extend (additive ONLY) `lib/infra/supabase/currentUser.ts`** with exactly:
  ```ts
  export interface CurrentUser {
    readonly id: UserId;
    readonly email: string | null;
  }

  export async function getCurrentUser(): Promise<Result<CurrentUser | null>> {
    try {
      const {
        data: { user },
        error,
      } = await createBrowserSupabaseClient().auth.getUser();

      if (error) {
        return err(domainError('unavailable', 'Could not load current user', { cause: error }));
      }

      return ok(user ? { id: asUserId(user.id), email: user.email ?? null } : null);
    } catch (cause: unknown) {
      return err(domainError('unavailable', 'Could not load current user', { cause }));
    }
  }
  ```
  Do not modify the existing `getCurrentUserId` in any way.
- **Page rewrite:** replace the `@supabase` import + client + `auth.getUser()`
  call with `getCurrentUser()`. Mapping: `!result.ok` → the existing
  catch/console-error path; `result.value === null` → the existing
  no-user early return; `result.value.email ?? ''` wherever the page used
  `user.email || ''`. The mock-log construction and ALL rendering stay
  byte-identical in behavior — this page intentionally shows mock data
  (`activity_logs` table does not exist yet); do NOT "improve" that.

## Files to Create
- `e2e/characterization/logs-page.spec.ts` — Phase A first: login → open
  `/dashboard/settings/logs` → assert the log list renders with the signed-in
  user's email visible in at least one entry (that is the observable behavior
  `getUser` feeds). Two-pass discovery rule applies.

## Files to Modify
- `lib/infra/supabase/currentUser.ts` (additive block above)
- `app/dashboard/settings/logs/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/logs/page.tsx',`

## MUST NOT touch
`getCurrentUserId` and every other existing export; `lib/domain/**`
(no domain code is needed — there is no data access to model);
all other pages/components; existing e2e specs; `.fable5/`; `.claude/`.
No new dependencies. No unit-test file for `getCurrentUser` — it binds the
real browser client (same reasoning as PATCH-004's `getCurrentUserId`,
which is likewise e2e-covered only).

## Risks
- Behavior drift in the email fallback: the page uses `user.email || ''` —
  preserve the empty-string fallback exactly.
- Scope creep temptation: no domain layer, no repository — this page has no
  table. Resist symmetry; the seam is only for data access.

## Commit
  Commit message:
  feat(settings): extract logs current-user access

## Rollback
Single `git revert`. (Note: PATCH-009 will DEPEND on `getCurrentUser` — once
009 lands, reverting 007 requires reverting 009 first. Within this patch's
own lifetime, one revert suffices.)

## Acceptance Criteria
- [ ] New e2e spec green against OLD page first, then NEW page (pasted)
- [ ] `npm run test:unit` green (unchanged count expected — state it)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" app/dashboard/settings/logs/page.tsx` → 0
- [ ] Grandfather list = 19
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# Phase A — net first, against the CURRENT page
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/logs-page.spec.ts
# Phase B — after helper + page rewrite
npm run test:unit
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test
grep -c "@supabase" app/dashboard/settings/logs/page.tsx   # 0
# Phase C — grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Estimated Difficulty
easy — one helper (code given verbatim), one call-site swap.

## CTO review verdict (2026-07-07) — PASSED

Independently re-verified (GPT-5.4):
- **Footprint:** exactly the 4 authorized files; single atomic commit
  `9f0a72d`; boundary entry removed as a clean single-line deletion.
- **Re-run by CTO:** unit 21 green (count unchanged, as the spec predicted);
  tsc 0; boundaries green; grandfather = 19; page greps 0 for `@supabase`;
  fresh production build; full e2e **11/11** including the new logs spec
  (signed-in email visible in entries) and all prior nets.
- **Helper:** `getCurrentUser` byte-faithful to the spec's verbatim code;
  `getCurrentUserId` untouched; additive-only honored. PATCH-009's
  dependency is now in place.
- **Mapping judgment call, accepted:** `!result.ok` → `throw
  userResult.error` into the page's existing try/catch — the spec's
  "existing catch/console-error path" honored via throw. Old code on auth
  error silently early-returned; new code logs to console — console-only
  difference, allowed. Mock-data rendering byte-identical (`??` vs `||`
  equivalent here and prescribed by the spec).
- **Governance note:** commit `288748f` added a commit-message section to
  this patch file before implementation — `.fable5/**` is CTO-only
  (AI_WORKFLOW). Content harmless; henceforth commit-message hints go in
  the handoff prompt, not the patch file.
