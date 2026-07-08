# PATCH-016 — Deletion: orphaned AddPadletMenu component

**Status:** draft (awaiting owner approval — first patch of batch 016–019)
**Complexity:** trivial (deletion-only; the discipline is in the census)
**Assigned model:** **GPT-5.4**
**Pattern:** orphan removal (census-gated deletion; orphan-proof discipline
from PATCH-012, deletion precedent from Phase 0 hygiene + PATCH-006).
**Depends on:** nothing (independent; runs while 017–019 specs are authored).

## CTO note — why DELETE here when PATCH-012 (Navbar) chose extraction
Navbar was kept compiling because moving it onto the already-existing
Pattern F helpers cost two import swaps. AddPadletMenu is different:
keeping it compiling on the new architecture would require building TWO
seams that do not exist yet (a storage-upload helper AND a canvas-write
command) — real architecture spent on code nothing mounts. CTO-verified
2026-07-08: zero importers across `*.ts, *.tsx, *.js, *.jsx` in `app/`,
`components/`, `lib/` (the only hit is the file itself); the full 19-spec
e2e net never renders it. Deleting costs one `git revert` to undo; keeping
costs two seams. Delete. (git history retains the file if a menu like this
is ever wanted again — it must come back as ops-seam consumer, not as-is.)

## Goal
Delete `components/canvas/AddPadletMenu.tsx` (372 lines, orphaned, direct
`supabase.storage` upload + `padlets` insert); grandfather list 10 → 9.

## Pre-edit census (paste output; STOP if ANY importer appears)
```bash
grep -rln "AddPadletMenu" --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" app/ components/ lib/ | grep -v "components/canvas/AddPadletMenu.tsx"
# expected: no output, exit code 1 (zero importers — the orphan proof)
grep -rn "AddPadletMenu" e2e/ 2>/dev/null
# expected: no output (nothing in the e2e net references it)
wc -l components/canvas/AddPadletMenu.tsx
# expected: 372
```
If any importer OR any e2e reference appears: STOP, report, change nothing.

## Files to Delete
- `components/canvas/AddPadletMenu.tsx` — the whole file, nothing else.

## Files to Modify
- `eslint.boundaries.config.mjs` — LAST, delete exactly
  `'components/canvas/AddPadletMenu.tsx',`

## MUST NOT touch
Every other file — explicitly including all other `components/canvas/**`
files (the canvas-stack duality is quarantined; this patch is ONE orphan,
not a cleanup pass); `lib/**`; `app/**`; `e2e/**` (no new spec — deleted
unmounted code has no runtime surface to characterize); `.fable5/`;
`.claude/`. No new dependencies.

## Risks
- A dynamic import via computed string would evade the census grep. Judged
  no-risk here: the codebase's dynamic imports use literal paths (grep-able,
  none found), and `tsc` + full e2e green after deletion are the backstop.
- Do NOT generalize: other files in `components/canvas/**` look equally
  dusty but ARE imported (PostCardContent has 22 importers). One file only.

## Commit
  Commit message:
  refactor(canvas): delete orphaned AddPadletMenu component

## Rollback
Single `git revert`.

## Acceptance Criteria
- [ ] Pre-edit census pasted: zero importers (exit 1), zero e2e references
- [ ] File deleted; NO other source file changed
- [ ] `npx tsc --noEmit` 0 errors
- [ ] `npm run check:boundaries` green with the entry removed
- [ ] `npm run test:unit` green (43 — count unchanged, state it)
- [ ] Full e2e suite green (19/19) against the running dev server
- [ ] Grandfather list = 9 (count the entries, state the number)
- [ ] Single atomic commit (deletion + boundaries line together); hash reported

## Verification (in order; paste all output)
```bash
# (pre-edit census above first)
npx tsc --noEmit
npm run check:boundaries
npm run test:unit
PW_BASE_URL=http://localhost:3000 npx playwright test   # full suite, 19/19
# grandfather removal already done (atomic with the deletion), then FINAL
# (dev server STOPPED by owner first):
powershell -Command "(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count"   # must print 0
npm run verify
git status --porcelain
```
Then commit (atomic), report hash; owner deletes `.next` and restarts dev.
Warning Policy / handoff rule 10 applies. Docs are CTO-only, updated at review.

## Handoff (owner: paste this to GPT-5.4)
Use `.fable5/docs/CODER_HANDOFF_TEMPLATE.md` with `{{NUMBER}}` = 016,
`{{TITLE}}` = delete orphaned AddPadletMenu component. Add: "Read
`.fable5/docs/PATCH_REFERENCE.md` §0 and §6. This is a DELETION-ONLY patch:
one file + its grandfather line, atomic. If the orphan census shows even one
importer, STOP and report — do not adapt. Do not touch any other file in
components/canvas/**. Local e2e runs are capped at 2 workers by config — do
not override with --workers. Run every verification command and paste real
output; not done until the commit exists."

## Estimated Difficulty
trivial — the entire risk is skipping the census or deleting more than one
file.
