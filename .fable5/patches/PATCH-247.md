# PATCH-247 — Scrolling in the AI window scrolls the window, not the picture

Status: AUTHORIZED (owner, 2026-10-02: "Visualizer is still causing the background to jolt when you scroll down the
diagram … this happened with PATCH-246 applied as well"; the owner delegates the fix).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-245 (`af885df1`) — PATCH-246 was reverted (`4f1e2fd4`)

## Why (CTO live reproduction, 2026-10-02)
Show options (AI window), mouse over the large preview, wheel down 6 notches: the window does NOT scroll; the
picture slides out of its frame (a word moved from y=418 to y=-782, then -1982), leaving an empty dotted box. Cause:
PATCH-245's `PictureStage` handles EVERY wheel event — plain wheel pans the picture and `preventDefault()` stops the
window from scrolling. That is right for a full-screen board, wrong for a picture inside a scrolling window.
Second risk: the AI window is rendered inside the canvas React tree, and the canvas viewport has an `onWheel` that
zooms the BOARD on Ctrl+wheel (`CanvasClient.tsx` ~9368). A Ctrl+wheel in the AI window must never reach it.

## Design
1. **`PictureStage` (`components/ai/renderers/PictureStage.tsx`):** a plain wheel (no Ctrl/⌘) is NOT handled: no
   pan, no `preventDefault` — the window/panel scrolls as normal. Only Ctrl/⌘+wheel (also trackpad pinch, which
   arrives as ctrl+wheel) zooms at the pointer, with `preventDefault()` AND `stopPropagation()`. Keep the listener
   non-passive (needed for the ctrl case). Panning stays: drag on empty space and Space+drag. Update the small
   on-stage hint/tooltip if one says "wheel to move".
2. **The AI windows never pass wheel events to the board:** the root of `AIComponentEditor`'s modal and of
   `AIContentEditModal` stop wheel propagation (React `onWheel={(e) => e.stopPropagation()}` on the modal root —
   NO `preventDefault`, so their own scrolling still works), the same isolation the minimap uses
   (`FreeformMinimap` `isolateEvent`).

## Tests
- `PictureStage.test.tsx`: a plain wheel is NOT `defaultPrevented` and leaves the transform/viewBox unchanged; a
  ctrl+wheel zooms (anchor test unchanged), is `defaultPrevented` and does not propagate to a parent listener; drag
  and Space+drag still pan. Update the PATCH-245 "plain wheel pans" tests (say which).
- Modals: a ctrl+wheel dispatched inside `AIComponentEditor` and inside `AIContentEditModal` does not reach a wheel
  listener on their parent (stand-in for the canvas); a plain wheel inside them is not `defaultPrevented`.
- **Mutations:** plain wheel pans again → the plain-wheel test fails; drop the modal-root isolation → the parent
  listener test fails.

## Allowed files
```
components/ai/renderers/PictureStage.tsx (+ test)
components/collabboard/editors/AIComponentEditor.tsx (+ tests)        (modal-root wheel isolation only)
components/ai/editors/AIContentEditModal.tsx (+ tests)                (modal-root wheel isolation only)
```
Forbidden: everything else, in particular `CanvasClient.tsx`, the database, `package.json`, AI routes. Real tool
calls only (never write a tool call as plain text); one test file at a time with `--reporter=dot`, never pipe vitest
into grep/head, no test files outside the repo; revert mutations with your Edit tool; no git writes; no production
build; no curl of the dev server.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/ai components/collabboard/editors
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-247.json
```
Failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** Show options → wheel over the picture scrolls the window, the picture stays in its frame; Ctrl+wheel
over the picture zooms it and the board behind keeps its zoom; same in the Edit window. Board zoom/scroll unchanged
after closing. No AI request beyond the first generation.

## Commit message (verbatim)
```
fix(ai): scrolling in the AI window no longer moves the picture

Scrolling down with the mouse over the picture in Show options or the
Edit window slid the picture out of its frame instead of scrolling the
window. The mouse wheel now scrolls the window as usual; Ctrl+wheel or
a pinch zooms the picture, and no wheel event reaches the board behind
the window.
```

## Addendum 1 (CTO, 2026-10-02): live result
Show options (one `generate-outline`): wheel ×6 over the large preview → the picture stays in its frame (word at
y=418 before and after; before the fix it went to −782); Ctrl+wheel over it → picture 156% → 208%, the board's
scroll container unchanged (4343); wheel over the design tiles → the gallery scrolls (0 → 1206) and the Colours row
is reachable; board unchanged. Nothing saved. Gate `.opencode-vitest-247.json`: extra [] missing []; tsc clean; no
mutation text. Note: the 4 `AntvInfographicRenderer.*` files time out only under the scoped parallel run and pass in
isolation (DeepSeek) — the full gate is clean.
