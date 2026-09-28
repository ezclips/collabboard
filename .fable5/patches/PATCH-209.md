# PATCH-209 — A section heading's resize saves whole numbers

Status: AUTHORIZED (bug fix, 2026-09-28). Owner: added a section heading ("H") with a title, and
got an error. Console:
```
Failed to load resource: the server responded with a status of 400
Failed to persist section heading size: { code: "22P02",
  message: 'invalid input syntax for type integer: "-2995.9999999999995"' }   (FreeformPadletCards.tsx:775)
```
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`

## Root cause (CTO)
`commitSectionHeadingRect` (`components/collabboard/canvas/ui/FreeformPadletCards.tsx` ~760-780)
writes `position_x: rect.x, width: rect.width` straight from the resize geometry. At a zoom that is
not 100% (the owner is at 80%), screen deltas divided by the zoom give fractions (`-2995.9999999999995`),
and the `position_x` / `width` columns are integers, so PostgREST refuses the write (22P02). The
code then rolls back to the old rect and shows "Failed to resize section heading". Every other
geometry write rounds:
- dragging: `useCanvasInteractions.ts` ~733 and ~792 (`Math.round`, or grid snap);
- box resize: `lib/domain/canvas/postResizeBox.ts`.
The Section Heading resize is the odd one out.

Read first: `commitSectionHeadingRect` and `previewSectionHeadingRect` (FreeformPadletCards ~750-790),
where the `SectionHeadingRect` is computed during the drag (find the domain helper with `rg
SectionHeadingRect`), and `postResizeBox.ts` for how box resize rounds.

## Fix
- Round the rect where it is COMPUTED (the domain helper that produces `SectionHeadingRect` from the
  pointer), with `Math.round` on x and width, exactly as `postResizeBox` does. Then the preview, the
  optimistic state and the write all agree. Keep any minimum width the helper already enforces
  (round first, then clamp, so the clamp still holds).
- If rounding in the helper is impossible without a wider change, round in
  `commitSectionHeadingRect` for BOTH the optimistic `setPadlets` and the write, and say why.
- Audit (report only, do not change): any other `updatePostFieldsOrThrow` / post update in
  `FreeformPadletCards.tsx` or the canvas hooks that writes `position_x`, `position_y`, `width` or
  `height` without rounding. List each at file:line. Do NOT fix them in this patch unless one is on
  the same Section Heading path.

## Tests
- Domain helper (or the commit): a resize at zoom 0.8 that yields a fractional x/width produces
  integers (e.g. -2996 and the rounded width); the minimum width still holds.
- The write sends integers (mock `updatePostFieldsOrThrow` and assert `Number.isInteger`).
- **Mutation:** remove the rounding → the integer test fails.

## Allowed files
```
the SectionHeadingRect geometry helper (+ its test)
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (only commitSectionHeadingRect / previewSectionHeadingRect, if needed)
```
Forbidden: the database, migrations, the columns' types, `package.json`. **Do not touch the comments
inside `isBlockingEditorModalOpen`.** If a census pins the helper's output, STOP and ask (spec line,
code at file:line, proposed resolution).

Use `rg` or `timeout 30` on every search. Every test command is `timeout 600 npx vitest run …`.
Delete temporary diagnostic files (and never leave a `nul` file: in bash use `/dev/null`). No
stash/reset/restore/checkout/clean/commit/push; no production build. Real tool calls only.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run <the helper's test> components/collabboard/sectionHeading
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-209.json
```
The failing FILE set must equal the 26-file baseline. Compact report, including the audit list. Do
not commit.

## Commit message (verbatim)
```
fix(canvas): a section heading's resize saves whole numbers

Resizing a Section Heading at a zoom other than 100% produced
fractional x/width (e.g. -2995.9999999999995), which the integer
columns refuse, so the resize was rolled back with an error. The
geometry is now rounded where it is computed, as dragging and box
resize already do.
```
