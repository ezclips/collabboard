# PATCH-225 — No dividing line under a drawing whose post frame is hidden

Status: AUTHORIZED (owner, 2026-09-30: "there is a white dividing line visible below the drawing which puts
the emoji and caption below it. Please remove it also in the hide post frame view").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-224 (`007bc275`)

## Why (CTO)
The generic card's Reactions Row (`components/collabboard/canvas/ui/FreeformPadletCards.tsx` ~4584-4587)
renders under a post that has reactions OR is selected, with `border-t border-gray-100` as a divider.
Since PATCH-223 a click selects a drawing, so a frameless drawing now shows that line across the board
beneath it. A divider separates content INSIDE a frame; with the frame hidden there is nothing to divide.

## Design
- In that row's className, the non-overlay branch drops `border-t border-gray-100` when `isFullView`
  (the variable already computed at ~3422 in the same generic branch). Keep `flex items-center gap-1.5
  pt-1.5 mt-1.5` so the emoji row and caption keep their spacing. Write it so the existing literal
  `"flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100"` still appears verbatim for the
  framed case, e.g.
  `: isFullView ? "flex items-center gap-1.5 pt-1.5 mt-1.5" : "flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100"`.
- The drawing caption below (~4612-4625) already has no border: confirm, change nothing.
- The ai-component overlay branch, the show/hide condition and the container exclusion: unchanged.
- Framed posts: unchanged.

## Tests
- **Authorized pin update:** `components/collabboard/freeformFullViewFrame.test.tsx` ~94-98 pins the exact
  ternary. Update ONLY that expected string to the new ternary. The ~100-102 literal pin must still pass
  unchanged. (That file is a baseline-failing file: its baseline failing test must stay the only failure.)
- A source test (extend `lib/infra/canvas/freeformDrawingViewWiring.source.test.ts`, or a new one beside it):
  the Reactions Row's non-overlay className is border-free when `isFullView`, and keeps `border-t` otherwise.
- **Mutation:** drop the `isFullView ?` arm → the new test fails.

## Allowed files
```
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (that one className only)
components/collabboard/freeformFullViewFrame.test.tsx      (the one pin string only)
lib/infra/canvas/freeformDrawingViewWiring.source.test.ts  (or a new source test beside it)
```
Forbidden: everything else. Any other test pinning that className → STOP and ask.
Real tool calls only; `timeout 600 npx vitest run …`; no git writes; no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/freeformFullViewFrame lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-225.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** click the owner's ellipse (selected, frame hidden) → the emoji row shows with no line;
nothing on the post is written.

## Commit message (verbatim)
```
fix(canvas): no dividing line under a drawing whose post frame is hidden
```
