# PATCH-004 — First extraction: accessibility settings page onto the domain/infra seam

**Status:** in progress (GPT-5.5) — **Amendment 1 issued, resume below**
**Complexity:** medium (pattern-setting) · **Estimated implementation time:** 2–4 hours
**Assigned model (CTO recommendation):** **GPT-5.5 (senior engineer)** — see
"Why 5.5" at the bottom. PATCH-005+ repetitions of this pattern go to GPT-5.4
with this patch as the exemplar.

## Goal
Move `app/dashboard/settings/accessibility/page.tsx` off direct Supabase usage
and onto the domain/infra seam (repository + one command), then remove it from
the 24-file grandfather list — the first entry deleted, proof before removal.

## Reason
PATCH-003 opened the seam; nothing consumes it yet. This patch proves the
end-to-end pattern (domain interface → infra implementation → page consumption
→ tests → grandfather shrink) on the smallest possible surface, so the ~20
remaining extractions become mechanical repetitions.

## Why this target (CTO-measured, 2026-07-07)
Census of all grandfathered settings pages: accessibility is the smallest
(186 lines) with the simplest data usage — one table
(`accessibility_settings`), two operations (select-by-user, upsert), plus
`auth.getUser()`. No joins, no storage, no realtime, no cross-page state.

## Why this order
Extraction before more foundation (no speculative domain growth — playbook §7),
after the seam exists (003), under the net (001) and the freeze (002). No
CanvasClient involvement whatsoever.

## Files to Create
- `lib/domain/settings/accessibility.ts` — settings type (lifted from the
  page's existing shape), zod schema, `AccessibilitySettingsRepository`
  interface (`load(userId)`, `save(userId, settings)`), and ONE command
  `settings.saveAccessibility` built with `defineCommand` (requires
  `ctx.userId`, else `permission_denied`; delegates to the repository).
- `lib/domain/settings/accessibility.test.ts` — unit tests: command rejects
  missing userId; command validates settings shape; command calls repository
  with the ctx user's id (fake repository).
- `lib/infra/supabase/browserClient.ts` — single place that creates/exports
  the browser Supabase client for infra use (wraps
  `createClientComponentClient`). Infra MAY import `@supabase/*`.
- `lib/infra/supabase/currentUser.ts` — `getCurrentUserId(): Promise<Result<UserId | null>>`
  wrapping `auth.getUser()` (null = signed out, not an error).
- `lib/infra/settings/accessibilityRepository.ts` — `SupabaseAccessibilitySettingsRepository`
  implementing the domain interface; constructor takes the client (injected —
  testable); plus `createAccessibilitySettingsRepository()` factory bound to
  the browser client.
- `lib/infra/settings/accessibilityRepository.test.ts` — unit tests with a
  minimal fake client implementing exactly the query chains used
  (`from().select().eq().single()`, `from().upsert()`): row-found, no-row
  (PGRST116 → `ok(null)`, NOT an error), db-error → `unavailable`.
- `e2e/characterization/accessibility-settings.spec.ts` — behavior net for
  this page BEFORE the rewrite lands: login → open the page → toggle one
  setting → reload → assert persisted → toggle back (restore state). Written
  and verified green against the CURRENT implementation first, then must stay
  green after the rewrite (that is the whole point).

## Files to Modify
- `app/dashboard/settings/accessibility/page.tsx` — remove the
  `@supabase/auth-helpers-nextjs` import; consume `getCurrentUserId`,
  repository `load`, and the `settings.saveAccessibility` command. Preserve
  ALL observable behavior including the current silent-failure semantics
  (load errors → defaults; save errors → `console.warn`-equivalent no-op —
  map `err` results to the same outcomes). No UI changes, no copy changes,
  no new features.
- `vitest.config.ts` — **[Amendment 1]** widen the include list so the new
  infra tests actually execute. Exact change, nothing else in the file:
  ```ts
  include: ['lib/domain/**/*.test.ts', 'lib/infra/**/*.test.ts'],
  ```
- `eslint.boundaries.config.mjs` — LAST step, only after all verification is
  green: delete the single line
  `'app/dashboard/settings/accessibility/page.tsx',` from
  `GRANDFATHERED_UI_FILES` (list header says shrink-only; this is the first
  shrink).

## Files that MUST NOT be touched
- `app/dashboard/canvas/**` (CanvasClient explicitly out of scope), every
  other page under `app/`, everything under `components/`, `supabase/`,
  `types/`, `lib/domain/core/**` (the foundation is frozen for this patch —
  if it seems insufficient, STOP and report), `lib/collabboard/**`,
  existing e2e specs, all config files except the one-line grandfather
  removal and the Amendment-1 vitest include line, `.fable5/`, `.claude/`.
- No new dependencies.

## Architecture Notes (binding)
- Reads go through the repository directly; the write goes through the
  command — this is the house pattern being established.
- The page becomes free of BOTH `@supabase/*` imports and raw table names.
  It may import from `lib/infra/**` (composition) and `lib/domain/**` (types,
  command) — the target architecture's composition-root pattern will formalize
  this later; for now page→infra factory is the sanctioned shape.
- Error mapping in infra: supabase error with code `PGRST116` (no rows) on
  `.single()` → `ok(null)`; other db errors → `err(unavailable)` with the
  supabase error as `cause`. Never leak supabase error objects to the page.
- The domain settings type must mirror the page's existing shape exactly —
  this is an extraction, not a redesign. If the page's shape is looser than
  expected (untyped JSONB), the zod schema is `z.record(...)` matching
  reality, with a note; do not invent stricter validation that could reject
  existing stored rows.
- GPT-5.5 latitude: internal naming, test organization, and the page's exact
  hook structure are yours; record every choice in the report's
  "Decisions made". The interfaces, error mapping, and step order are NOT
  latitude.

## Migration Notes
No schema changes. No data changes. Existing `accessibility_settings` rows
must load unchanged (the no-stricter-validation rule above exists for this).

## Potential Risks
- **Silent-failure semantics drift** — the current page swallows errors; the
  rewrite must too (verified by the e2e reload test plus code review).
- **E2E selector fragility on an unexplored page** — mitigated by the standing
  two-pass rule (LESSONS_LEARNED): discovery dump first, then assertions.
- **`.single()` no-row behavior** — first-visit users have no row; treat as
  defaults, not error (explicit test required).
- **Auth session absent** (signed-out edge) — `getCurrentUserId` returns
  `ok(null)`; page behavior must match current behavior in that state
  (whatever it is — characterize first, preserve it).

## Rollback
Single `git revert` restores the old page and the grandfather entry together
(they land in one commit — the list removal is only valid while the rewrite
exists, so they must be atomic).

## Acceptance Criteria
- [ ] New e2e spec green against the OLD page first (pasted run), then green
      against the NEW page (pasted run) — behavior preserved
- [ ] `npm run test:unit` green — and the pasted output must LIST both new
      test files (`lib/domain/settings/accessibility.test.ts` and
      `lib/infra/settings/accessibilityRepository.test.ts`) as executed.
      A green run that doesn't show the infra file means the include glob is
      still wrong (Amendment 1's original failure mode: silent non-execution)
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green WITH the grandfather entry removed —
      the mechanical proof the page is clean
- [ ] Existing e2e suite (smoke + board lifecycle) still green
- [ ] `git diff` touches only the listed files; no `@supabase` string remains
      in the page (`grep -c "@supabase" app/dashboard/settings/accessibility/page.tsx` → 0)
- [ ] Grandfather list is exactly one entry shorter (23)
- [ ] Commit exists; hash reported

## Verification Steps (in this order; paste all output)
```bash
# Phase A — net first, against the CURRENT page (no product changes yet)
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/accessibility-settings.spec.ts
# Phase B — after domain+infra+tests
npm run test:unit
npx tsc --noEmit
# Phase C — after the page rewrite
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite
grep -c "@supabase" app/dashboard/settings/accessibility/page.tsx   # must print 0
# Phase D — remove the grandfather entry, then:
npm run check:boundaries
git status --porcelain
```
Dev-server rule applies: no `npm run build`, no Playwright-with-webServer;
use `PW_BASE_URL` against the running dev server. Warning Policy / handoff
rule 10 applies.

## Estimated Difficulty
medium — small surface, but it sets the pattern ~20 future patches copy, and
it includes real-page adaptation plus e2e discovery on an unexplored page.

## Why GPT-5.5 (CTO recommendation)
This patch requires judgment Codex is deliberately denied: adapting live page
code while preserving undocumented behavior, e2e selector discovery, and
local design decisions (hook structure, test fakes) that must be made and
*recorded* rather than escalated one at a time. AI_WORKFLOW assigns exactly
this profile to the senior engineer. The deliverable doubles as the exemplar
for GPT-5.4's future repetitions — worth senior quality once.

## Amendment 1 (2026-07-07) — vitest include scope · CTO decision

**Blockage (GPT-5.5, correct stop):** the spec requires infra tests to run in
`npm run test:unit`, but `vitest.config.ts` (created in PATCH-003) includes
only `lib/domain/**/*.test.ts` — `lib/infra/settings/accessibilityRepository.test.ts`
would silently never execute — while this patch listed all config files as
out of scope. A genuine spec contradiction; escalating instead of expanding
scope was the right call per AI_WORKFLOW.

**Decision: authorize `vitest.config.ts`** (added to Files to Modify above).
Rejected alternatives: moving infra tests under `lib/domain/` (breaks layer
cohesion and the tests-colocate-with-code convention; the domain tree stays
free of infra concerns even in tests), and a separate infra test
script/config (second mechanism for one concern, P6). The include list is
deliberately explicit per layer — do NOT widen to `lib/**` (that would
silently sweep future legacy dirs into the unit gate; each new tested layer
gets added consciously).

**Resume instructions (GPT-5.5):**
1. Keep your current worktree — do not restart or re-create anything.
2. Apply exactly the Amendment-1 change to `vitest.config.ts` (one line).
3. Run `npm run test:unit`; confirm the output lists BOTH new test files
   (see the strengthened acceptance criterion) and paste it.
4. Continue the patch from wherever you stopped, phase order unchanged
   (Phase A net evidence must already exist from before the block — if you
   never ran it, do Phase A first).
5. Everything else in the spec is unchanged; the MUST-NOT list still applies
   with the single vitest exception. Record this in your "Decisions made"
   report as "Amendment 1 applied, CTO-authorized".

## Handoff instructions (owner: paste this)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 004,
`{{TITLE}}` = First extraction: accessibility settings page. Optional block:
"E2E credentials are in `.env.local` (E2E_EMAIL/E2E_PASSWORD) — never print
them. Dev server runs on :3000; use PW_BASE_URL as the spec shows. You have
the senior-engineer latitude defined in the patch's Architecture Notes —
record every decision. Phase order is mandatory: the e2e net must be green
against the OLD page before you change it."
