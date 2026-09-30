# PATCH-228 — Click a line to select it; Delete removes it; drag an end to re-attach it

Status: AUTHORIZED (owner, 2026-09-30: "Yes go and improve our graph line tool and bring it up to standard as
a PM"; the CTO's two-step plan, step 2).
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-227 (`fb21a502`)

## Why (CTO)
After PATCH-227 a line is easy to create, but it can only be edited by right-clicking it, which nobody is
told. In Milanote, Miro and FigJam a left-click selects a line, the selection is visible, Delete removes it,
and the ends can be dragged onto another item. All of this lives in `components/graph/FreeformGraphLayer.tsx`
(the edge `<g>` at ~401-409 and its two paths).

## Design (all in `components/graph/FreeformGraphLayer.tsx` unless stated)
1. **Permission:** new optional prop `canEdit?: boolean` (default `true`, so existing tests and harnesses keep
   working). `FreeformPadletCards.tsx` passes `canEdit={canUseFreeformEditButton}` at the mount (~5471).
   Everything below applies only when `canEdit`. The right-click menu is NOT changed by this patch.
2. **Select:** a left-click on a line's hit path selects it (`selectedEdgeId` state). `onMouseDown` /
   `onPointerDown` on the hit path call `stopPropagation()` so the board does not start a pan/marquee or clear
   its own selection first. The hit path's cursor becomes `pointer` (it was `context-menu`).
3. **Show the selection:** a selected line draws, UNDER the visible path, a halo path (same `d`,
   stroke `#6366f1`, opacity 0.25, width 8, `pointerEvents="none"`), and its visible path becomes width 3.
   Two end handles appear at the route's start (`sx, sy`) and end (`ex, ey`): white circles, radius 6 in
   screen px (divide by `zoom` since the svg is inside the scaled world), 2px indigo stroke,
   `data-graph-edge-end="source"|"target"`, `cursor: grab`.
4. **Deselect:** a `window` mousedown whose target is not inside this line's `<g>` or its end handles, or
   Escape, clears `selectedEdgeId`. A zoom change clears it (same as the menu).
5. **Delete key:** while a line is selected, `Delete` or `Backspace` deletes it through the existing
   `deleteEdge`, EXCEPT when the key event's target is an `input`, `textarea`, `select` or
   `[contenteditable]`. Toast "Line deleted." On failure toast "Could not delete the line.".
6. **Re-attach an end:** pointerdown on an end handle starts an end drag (pointer capture, like
   `GraphConnectHandle`). While dragging, a portal to `document.body` shows a dashed indigo line from the
   OTHER end's screen position to the pointer and outlines the valid post under the pointer (reuse
   `findConnectTargetId` from `lib/graph/connectTarget.ts`; the excluded id is the post at the OTHER end, and
   the post the end is already on is also not a change). On pointerup over a valid post:
   - if that post is the one the end already attaches to → nothing;
   - if the new pair (either direction) already has another line → nothing, toast
     "These posts are already connected.";
   - else `updateEdge(edge.id, { source_post_id: newId })` (or `target_post_id`), toast "Line moved.".
   Over anything else, or Escape → nothing changes. Put the pure decision in `lib/graph/reattachEdge.ts`:
   `planReattach(edge, end, newPostId, allEdges) → { kind: 'noop' } | { kind: 'duplicate' } | { kind: 'update', patch }`.
7. **Board hint:** nothing new on screen besides the selection; the existing right-click menu and the
   PATCH-227 dot are unchanged. The Graph Line toolbar mode is unchanged.

## Tests
- `lib/graph/reattachEdge.test.ts`: same post → noop; duplicate either direction → duplicate; source end and
  target end each produce the right patch; the edge's own id is ignored in the duplicate check.
- `components/graph/freeformGraphEdgeSelect.test.tsx` (mock the repo as the existing graph tests do):
  - click the hit path → the halo path and two end handles render; `canEdit={false}` → none;
  - mousedown elsewhere → deselected; Escape → deselected;
  - Delete with a line selected → `repo.deleteEdge(id)`; Delete while an `<input>` has focus → not called;
  - an end drag dropped on another post (mock `elementsFromPoint`) → `upsertEdge` with the new
    `source_post_id`/`target_post_id` and everything else unchanged; dropped on empty → no write.
- The existing graph tests (zoom close, portal menu, label drag, measured rects) stay green.
- **Mutations:** skip the input/textarea guard → the "input focus" test fails; drop the `canEdit` check →
  the `canEdit={false}` test fails.

## Allowed files
```
components/graph/FreeformGraphLayer.tsx
lib/graph/reattachEdge.ts (+ test)                                  (new)
components/graph/*.test.tsx                                         (new / extend)
components/collabboard/canvas/ui/FreeformPadletCards.tsx            (ONLY the canEdit prop at the layer mount)
lib/infra/canvas/*.source.test.ts                                   (a wiring pin for that prop, if useful)
```
Forbidden: CanvasClient.tsx, the database, package.json, `GraphConnectHandle.tsx` (reuse its helper, do not
change it), the Edge Settings menu contents. **Do not touch the comments inside `isBlockingEditorModalOpen`.**
If a census test pins the layer mount line or the hit path's cursor, STOP and ask (spec line, code at
file:line, proposed resolution).

Use the Read/Grep/Edit tools; `rg` with `timeout 30` if you need bash. Every test command is
`timeout 600 npx vitest run …`. REAL tool calls only. No `ls` on the repo root, no curl of the dev server,
no git writes, no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run lib/graph components/graph lib/infra/canvas
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-228.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** the CTO creates a test line with the dot, clicks it (halo + end handles), drags its target
end onto a third post (the line moves), presses Delete (it is gone). Clicking one of the owner's lines and
pressing Escape changes nothing. Every test line is removed.

## Commit message (verbatim)
```
feat(graph): click a line to select it, Delete removes it, drag an end to move it

A line can now be selected with a normal click: it is highlighted and
shows a handle at each end. Delete or Backspace removes it, and dragging
an end onto another post moves that end there. Escape or clicking
elsewhere clears the selection. The right-click menu is unchanged.
```

Addendum 1 (CTO): authorized - update ONLY the expected mount string in components/collabboard/canvas/hooks/cameraZoomArchitecture.test.ts:365-367 to include canEdit={canUseFreeformEditButton}.
Addendum 2 (CTO): authorized - freeformGraphLabelDrag.test.tsx:391 deleteEdge( count 2 -> 3 (the Delete-key call site), with a comment naming PATCH-228. Nothing else in that file.

## Addendum 3 (CTO): the line's Delete must not also reach the post Delete shortcut
`components/collabboard/canvas/hooks/useCanvasShortcuts.ts:68` opens the post delete confirm on `Delete` while
a post is selected. Clicking a line does not clear the post selection, so one Delete would delete the line
AND ask to delete the post. Fix in `FreeformGraphLayer.tsx` only: register the selected-line keydown listener
in the CAPTURE phase (`window.addEventListener('keydown', onKey, true)` and the matching remove), and when it
handles Delete/Backspace call `event.preventDefault()` and `event.stopPropagation()` so the bubble-phase board
shortcut never sees it. The input/textarea/select/contenteditable guard stays first (those keys are left alone
and NOT stopped). Test: with a line selected, a second window `keydown` bubble listener registered by the test
is NOT called for Delete; with an `<input>` focused it IS called.

## Addendum 4 (CTO, live): the end drag never finishes in the real board
Live probe: pointerdown and pointerup both target the end `circle` (pointer capture), then `lostpointercapture`;
but the layer's `window` BUBBLE-phase `pointerup` listener never runs (no write, and the
`data-graph-edge-reattach-preview` portal stays on screen after release). Something between the circle and
`window` stops propagation on the board. Fix in `FreeformGraphLayer.tsx` only: register the end-drag
`pointermove`, `pointerup` and `keydown` window listeners in the CAPTURE phase (`addEventListener(type, fn,
true)` + matching remove), and also finish the drag on `pointercancel` and on `lostpointercapture` of the
circle (release without a target → no write). Test: a test-registered ancestor listener that calls
`stopPropagation()` on `pointerup` in the bubble phase must NOT prevent the re-attach write.

## Addendum 5 (CTO, 2026-09-30): live result
Test line (ellipse → Trump Image Post, created with the PATCH-227 dot): click → halo + two end handles; target
end dragged onto "P10 step7 crop" → one upsert with only `target_post_id` changed, toast "Line moved."; click +
Delete → DELETE by that id, no post-delete dialog; the owner's line clicked + Escape → no write, handles gone.
All test lines deleted; the owner's 3 lines remain. Full gate `.opencode-vitest-228b.json` (after addenda 3-4):
extra [] missing []; tsc clean.
