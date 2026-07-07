# PATCH-005 — Extraction: notification settings page onto the domain/infra seam

**Status:** **DONE — CTO review PASSED (2026-07-07, commit `06e40b4`).**
**Complexity:** easy (mechanical repetition of PATCH-004)
**Assigned model:** **GPT-5.4** — first repetition of the canonical template.
**Canonical reference:** `PATCH-004` (commit `5278468`). Imitate it
file-for-file; this spec provides the exact bindings. Where this spec and
your own judgment differ, this spec wins; where this spec is silent, copy
PATCH-004's shape exactly. Any remaining ambiguity: STOP and report.

## Goal
Move `app/dashboard/settings/notifications/page.tsx` (342 lines, one table
`notification_settings`, select + upsert) off direct Supabase onto the seam;
grandfather list 23 → 22.

## Reason
Purest same-shape repetition of the accessibility extraction — it validates
that the template transfers to GPT-5.4 before the batch continues.

## Bindings (CTO-measured 2026-07-07 — the only decisions in this patch)

- **Domain file:** `lib/domain/settings/notifications.ts`
  - Types lifted from the page verbatim: `NotificationSetting`
    (`id: string; label: string; description: string; push: boolean;
    email: boolean; roleRestriction?: string`), `NotificationCategory`
    (`title: string; settings: NotificationSetting[]`),
    `TabType = 'general' | 'scenes' | 'accounts'`,
    `NotificationSettingsData = Record<TabType, NotificationCategory[]>`.
  - zod: explicit object, not `z.record`:
    `z.object({ general: z.array(categorySchema), scenes: z.array(categorySchema), accounts: z.array(categorySchema) })`
    with `settingSchema` mirroring `NotificationSetting`
    (`roleRestriction: z.string().optional()`).
  - `NotificationSettingsRepository` interface:
    `load(userId): Promise<Result<NotificationSettingsData | null, DomainError>>`,
    `save(userId, settings): Promise<Result<void, DomainError>>`.
  - ONE command via DI factory (copy PATCH-004's shape):
    `createSaveNotificationsCommand(repository)` →
    `defineCommand({ name: 'settings.saveNotifications', ... })`;
    missing `ctx.userId` → `permission_denied`.
- **Infra file:** `lib/infra/settings/notificationSettingsRepository.ts` —
  copy PATCH-004's structure (narrow structural client interface, injected
  client, factory bound to `createBrowserSupabaseClient`). Differences from
  PATCH-004, both deliberate:
  1. load selects `'settings'` (not `'*'`) and uses **`.maybeSingle()`**
     (the page does today): no row → `data` is `null` with NO error, so
     there is **no PGRST116 branch** — `data?.settings ?? null`, cast like
     PATCH-004, unvalidated on load (the page's `mergeSavedNotifications`
     tolerates drift by design — keep it in the page, untouched).
  2. Any non-null error → `err(unavailable)` with `cause`.
  - upsert payload exactly: `{ user_id, settings, updated_at: new Date().toISOString() }`.
- **Page rewrite:** same moves as PATCH-004 — drop the `@supabase` import,
  `useMemo` repository + command, `getCurrentUserId()` from
  `lib/infra/supabase/currentUser`, load keeps `mergeSavedNotifications` and
  `registerPushIfNeeded` exactly where they are (they are page logic, not
  data access); save error → the existing `console.warn` path. Push
  registration, tabs, and ALL rendering are untouched.

## Files to Create
- `lib/domain/settings/notifications.ts`
- `lib/domain/settings/notifications.test.ts` — same three tests as
  PATCH-004's domain tests (rejects missing userId; validates shape —
  use one full valid `NotificationSettingsData` fixture; passes ctx userId
  to a fake repository).
- `lib/infra/settings/notificationSettingsRepository.test.ts` — fake client
  for `from('notification_settings').select('settings').eq().maybeSingle()`
  and `.upsert()`: row-found, **no-row (data null, error null) → ok(null)**,
  db-error → `unavailable`.
- `e2e/characterization/notification-settings.spec.ts` — Phase A FIRST
  (against the current page): login → open `/dashboard/settings/notifications`
  → toggle one email checkbox → reload → assert persisted → toggle back.
  Two-pass rule applies (discovery dump before assertions).

## Files to Modify
- `app/dashboard/settings/notifications/page.tsx`
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'app/dashboard/settings/notifications/page.tsx',`

## MUST NOT touch
Everything else — in particular `lib/domain/core/**`, `lib/domain/settings/accessibility*`,
`lib/infra/supabase/**` (read-only reuse), all other pages/components,
existing e2e specs, `.fable5/`, `.claude/`. No new dependencies.
Doc updates are CTO-only and happen at review.

## Risks
- The settings JSONB is deeply nested — the zod schema must match the page's
  interfaces EXACTLY as written above; do not add constraints.
- Push-permission side effects (`registerPushIfNeeded`) must remain
  behaviorally identical — it is called from load and from push-toggles only.
- `.maybeSingle()` vs `.single()`: do NOT copy PATCH-004's PGRST116 branch.

## Rollback
Single `git revert` (implementation + grandfather line in one atomic commit).

## Acceptance Criteria
- [ ] New e2e spec green against OLD page first, then against NEW page (pasted)
- [ ] `npm run test:unit` green; output LISTS both new test files
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] Existing e2e suite still green (smoke + board lifecycle + accessibility)
- [ ] `grep -c "@supabase" app/dashboard/settings/notifications/page.tsx` → 0
- [ ] Grandfather list = 22
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
# Phase A — net first, against the CURRENT page
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/notification-settings.spec.ts
# Phase B — after domain+infra+tests
npm run test:unit
npx tsc --noEmit
# Phase C — after the page rewrite (dev server still running)
PW_BASE_URL=http://localhost:3000 npx playwright test
grep -c "@supabase" app/dashboard/settings/notifications/page.tsx   # 0
# Phase D — grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0 — never grep netstat for 'LISTENING' (localized)
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies.

## Estimated Difficulty
easy — every decision is bound above; the reference implementation exists.

## CTO review verdict (2026-07-07) — PASSED

Independently re-verified:
- **Footprint:** exactly the 7 authorized files; single atomic commit `06e40b4`.
- **Re-run by CTO:** 21 unit tests / 6 files green, BOTH new test files
  listed; tsc 0; boundaries green; page grep 0; grandfather = 22; fresh
  production build; full e2e 8/8 (after the net repair below).
- **Pattern compliance: exemplary.** Both spec traps avoided (explicit
  z.object, `maybeSingle` with no PGRST116 branch); types verbatim; DI
  command factory; narrow structural client; select('settings'); merge +
  push logic untouched in the page. First GPT-5.4 execution of the template
  — clean. Delegation shift to 5.4 for Pattern A validated.
- **Review incident (NOT this patch's defect):** the accessibility
  characterization spec (PATCH-004) failed deterministically during review.
  Diagnosis: the spec reloads immediately after toggling while the page's
  save is fire-and-forget — navigation aborts the in-flight POST. Probe
  proved the save path healthy (row updates given 3s). Root cause was the
  CTO's PATCH-004 spec outline (no persistence barrier); it had passed by
  timing luck. Fixed in `8636bd1` with a `waitForResponse` barrier
  (deterministic; spec now 714ms). Notable: GPT-5.4's new notifications spec
  had already guarded this with a 1s wait — the implementer out-guarded the
  spec author.
- **Watchlist (minor, queued):** "Multiple GoTrueClient instances" console
  warning — `createBrowserSupabaseClient()` constructs a new client per
  call. Queue a micro-patch to memoize a singleton in `browserClient.ts`.
