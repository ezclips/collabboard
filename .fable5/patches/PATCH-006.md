# PATCH-006 — Extraction (degenerate case): remove dead Supabase clients from ai + preferences pages

**Status:** draft (awaiting owner approval)
**Complexity:** trivial
**Assigned model:** **GPT-5.4**
**Canonical reference:** PATCH-004 — but this is the degenerate case: these
pages import Supabase and never use it.

## Goal
Delete the unused `@supabase` import and the unused client variable from
`app/dashboard/settings/ai/page.tsx` and
`app/dashboard/settings/preferences/page.tsx`; grandfather list 22 → 20.

## Reason / evidence (CTO-verified 2026-07-07)
In both files the ONLY references to Supabase are the import line and one
`const supabase = createClientComponentClient();` (ai: lines 4 + 35;
preferences: lines 4 + 33). No `.from`, no `.auth`, no storage, no channel —
grep-verified. Both pages persist via other means (their behavior does not
touch Supabase at all). Two files in one patch is acceptable because it is
ONE concern (dead-code removal) with ONE mechanical change.

## Files to Modify
- `app/dashboard/settings/ai/page.tsx` — delete the
  `import { createClientComponentClient } ...` line and the
  `const supabase = createClientComponentClient();` line. NOTHING else.
- `app/dashboard/settings/preferences/page.tsx` — same two deletions.
- `eslint.boundaries.config.mjs` — LAST, delete exactly these two lines:
  `'app/dashboard/settings/ai/page.tsx',` and
  `'app/dashboard/settings/preferences/page.tsx',`

## Files to Create
- `e2e/characterization/settings-pages-render.spec.ts` — minimal render net,
  written and green BEFORE the deletions: login → open
  `/dashboard/settings/ai` → assert the page's main heading/content renders
  (no error boundary, no blank page); same for
  `/dashboard/settings/preferences`. Two-pass discovery rule applies. This
  spec is intentionally shallow — these pages' data behavior does not involve
  Supabase, so render + no-crash is the correct net.

## MUST NOT touch
Anything else in those two files (state, handlers, JSX, other imports),
all other files, `.fable5/`, `.claude/`. If either file turns out to USE the
client anywhere (grep before editing to confirm the CTO's evidence), STOP
and report — do not adapt.

## Risks
Near-zero. Only failure mode: the variable is actually used somewhere this
spec missed — the mandatory pre-edit grep (below) catches that and stops.

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit evidence pasted: `grep -n "supabase\|Supabase" <file>` for both
      files shows ONLY the two lines this patch deletes (per file)
- [ ] New render spec green BEFORE deletions, green again AFTER
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with BOTH entries removed
- [ ] Existing e2e suite still green
- [ ] `grep -c "@supabase" <file>` → 0 for both files
- [ ] Grandfather list = 20 (exactly two entries fewer)
- [ ] Single atomic commit; hash reported

## Verification (in order; paste all output)
```bash
grep -n "supabase\|Supabase" app/dashboard/settings/ai/page.tsx
grep -n "supabase\|Supabase" app/dashboard/settings/preferences/page.tsx
# Phase A — net first, against CURRENT pages
PW_BASE_URL=http://localhost:3000 npx playwright test e2e/characterization/settings-pages-render.spec.ts
# Phase B — after deletions
npx tsc --noEmit
PW_BASE_URL=http://localhost:3000 npx playwright test
# Phase C — grandfather removal, then FINAL (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Estimated Difficulty
trivial — the cheapest grandfather shrink available (−2 for four deleted lines).
