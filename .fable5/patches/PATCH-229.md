# PATCH-229 — The Graph Line button shows every post's connect dot

Status: AUTHORIZED (owner, 2026-09-30: "We could keep the button and highlight all objects on the canvas with
the circle showing. Can we try that before we remove the button").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-228 (`d26f5165`)

## Why (CTO)
PATCH-227 put a connect dot on the ONE selected post. The owner wants the toolbar "Graph Line" button to stay
as a visible entry point: while it is on, EVERY connectable post shows its dot, so the user sees at once what
can be linked. The old click-FROM / click-TO flow of that mode (and its "select in reverse to delete" rule)
is replaced by the dots. This is a trial: the old mode effect in CanvasClient becomes unreachable but is NOT
deleted in this patch (the owner decides after trying it).

## Design
1. **Dots on all posts while the mode is on** (`components/collabboard/canvas/ui/FreeformPadletCards.tsx`, the
   PATCH-227 `GraphConnectHandle` render condition): today it requires `!isGraphConnectMode` and
   `singleSelectedId === padlet.id`. New rule:
   `isFreeformGraphMode && canUseFreeformEditButton && !isLineMode && !anyPostDragInProgress && top-level &&
   not locked && (isGraphConnectMode || singleSelectedId === padlet.id)`.
2. **In the mode, pressing a post does not start the old flow and does not move the post.** The wrapper's
   `onMouseDownCapture` graph branch (`if (isFreeformGraphMode && isGraphConnectMode) { … setGraphConnectSelection … }`,
   ~1466) becomes: select the post (`setSelectedPadletId(padlet.id)`), `preventDefault()`, `stopPropagation()`,
   return. It no longer calls `getClickedSide` or `setGraphConnectSelection`. The dot's own exclusion (PATCH-227)
   stays ABOVE this branch, so pressing a dot still starts a connect drag.
3. **The mode stays on after a connection**, so several lines can be drawn in a row. Escape turns the mode off
   (`app/dashboard/canvas/[id]/CanvasClient.tsx`: a keydown effect active only while `isGraphConnectMode`,
   ignoring input/textarea/select/contenteditable targets, calling the existing toggle's off path so the source/
   selection state is reset the same way). Clicking the button again also turns it off, as today.
4. **Words** (`CanvasClient.tsx`):
   - toast when turned on: "Graph Line on: drag a post's dot onto another post. Esc to finish." (off: unchanged
     "Graph Line mode off.");
   - the bottom hint bar in the mode (~9471-9476): "Drag a post's <kbd>dot</kbd> onto another post to connect.
     Click a line to select it, <kbd>Delete</kbd> removes it. <kbd>Esc</kbd> to finish".
5. Nothing else changes: the PATCH-227 dot behaviour, PATCH-228 line selection, the Edge Settings menu, the
   board right-click "New Graph Line" (it toggles the same mode, so it gets the new behaviour for free).

## Tests
- Wiring (extend `lib/infra/canvas/freeformDrawingViewWiring.source.test.ts`): the new render condition
  (`isGraphConnectMode ||` before `singleSelectedId === padlet.id`, and no `!isGraphConnectMode` term); the
  mousedown branch no longer references `setGraphConnectSelection` / `getClickedSide`; the dot exclusion still
  precedes it.
- CanvasClient: the new toast and hint strings; the Escape effect guarded by `isGraphConnectMode` and by the
  editable-target check (a source test is acceptable).
- If a census/characterization test pins the OLD toast, hint text, or the mousedown branch, that is expected:
  STOP and list each (file:line, the old string), with the proposed one-line update. Do not update them before
  the CTO answers.
- **Mutation:** put back `!isGraphConnectMode &&` in the render condition → the wiring test fails.

## Allowed files
```
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (the render condition + the mousedown graph branch)
app/dashboard/canvas/[id]/CanvasClient.tsx                 (the toast string, the hint text, one Escape effect)
lib/infra/canvas/*.source.test.ts                          (wiring pins)
```
Forbidden: deleting the old connect effect or its state (trial first), `GraphConnectHandle.tsx`,
`FreeformGraphLayer.tsx`, the database, package.json. **Do not touch the comments inside
`isBlockingEditorModalOpen`.**

Use the Read/Grep/Edit tools; `rg` with `timeout 30` if you need bash. Every test command is
`timeout 600 npx vitest run …`. REAL tool calls only. No `ls` on the repo root, no curl of the dev server,
no git writes, no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/graph components/graph lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-229.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** click Graph Line → every top-level post shows a dot, the hint bar shows the new text; drag one
dot to another post → a line, the mode stays on; press a post body → it is selected and does not move;
Esc → the mode ends and the dots disappear (except on the selected post). Test lines deleted.

## Commit message (verbatim)
```
feat(graph): the Graph Line button shows every post's connect dot

While Graph Line is on, every post that can be connected shows its dot,
so it is clear what can be linked; drag a dot onto another post to draw
a line, as many times as needed. Esc or the button ends it. The old
click-from, click-to steps are no longer used.
```

## Addendum (CTO, 2026-09-30): live result
Graph Line on → 24 dots on 25 posts (the one without is not connectable), the new hint text shows. Pressing and
dragging a post body in the mode: the post stays put, no padlet write. Dragging Trump Image Post's dot onto
"P10 step7 crop" → one edge write, the mode stays on (24 dots). Esc → 0 dots. The test edge `7927f0ca` was
deleted (click + Delete, no dialog). A fresh load shows 4 owner lines, none of the CTO's test ids.
Gate `.opencode-vitest-229.json`: extra [] missing []; tsc clean.
