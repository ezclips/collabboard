# PATCH-223 — A drawing hovers and clicks like other posts; "View full size" moves to its right-click menu

Status: AUTHORIZED (owner, 2026-09-30: "can you restore the mouse over like the other post on the canvas,
and move the zoom into the right click menu button below the show draw frame").
Author: CTO (PM)
Implementer: DeepSeek v4.1 Flash (opencode)
Branch: `feature/board-retrieval`
Depends on: PATCH-222 (`67f0a592`)

## Why (CTO, live findings)
On the Freeform board, hovering over a drawing differs from every other post:
- the cursor is a zoom-in magnifier (`cursor-zoom-in`), where other posts show the hand (`cursor-pointer`);
- a native tooltip "Click to view full size" appears (`title=` on the wrapper);
- a single click opens the full-size viewer (`onClick` + `stopPropagation`), so a click never
  selects the drawing the way it selects other posts.
All three live in `components/collabboard/PostCardContent.tsx`, in the drawing branch (~904-925).

## Design
1. **PostCardContent, drawing branch:** the zoom behaviour applies ONLY when `onView` is passed.
   - When `onView` is undefined: no `cursor-zoom-in` class, no `title`, no `onClick` on the wrapper,
     so the click reaches the card as for every other post.
   - When `onView` is passed: the behaviour is exactly as today (click → `onView`, drag guard,
     zoom cursor, tooltip). The column child (`RowColumnContainerCard.tsx` ~632) keeps passing it:
     column children have no right-click menu of their own, so a column keeps click-to-view. Do not
     change `RowColumnContainerCard`.
   - Keep everything else: `draggable={false}`, the fullView classes, `drawingPreviewSrc`, the empty-state
     placeholder.
2. **Freeform board** (`components/collabboard/canvas/ui/FreeformPadletCards.tsx`):
   - the "Drawing Card Display" (~4394-4398) stops passing `onView`;
   - the generic fallback wrapper (~5277-5280) that stops click propagation for
     `text`/`ai-component`/`file` also stops it for `drawing`. Without this, the click bubbles to the
     canvas's blank-space deselect and the drawing's selection ring vanishes right after mousedown sets
     it (the defect the comment above that wrapper describes). Add `drawing` to that list and extend the
     comment by one line saying why;
   - the `NotePostContextMenu` call (~5264) passes a new prop
     `onViewFullSize={padlet.type === 'drawing' ? () => setViewDrawingPadlet(padlet) : undefined}`.
3. **Menu** (`components/collabboard/menus/NotePostContextMenu.tsx`): a new optional prop
   `onViewFullSize?: () => void`. When it is passed, a **"View full size"** item appears DIRECTLY BELOW
   the frame toggle ("Hide draw frame"/"Show draw frame"), inside the same separator group. It calls
   `onViewFullSize` directly (no ActionRegistry id needed; do not add one). When not passed, nothing
   changes for any other post type.

## Tests
- `PostCardContent` (a new `PostCardContent.drawingView.test.tsx`, or extend an existing drawing test):
  - without `onView`: the drawing wrapper has no `cursor-zoom-in` class and no `title`; clicking it
    does not stop propagation (a parent `onClick` spy is called);
  - with `onView`: clicking calls `onView` and the parent spy is NOT called; the class and title are
    present (unchanged behaviour).
- Menu (`freeformHideFrame.behavior.test.tsx` or the menu's own test): for a drawing with
  `onViewFullSize`, the items read in order "Hide draw frame", then "View full size"; clicking
  "View full size" calls the handler; without the prop there is no "View full size" item.
- A source/census test for FreeformPadletCards is acceptable for the two wiring lines (no `onView` on
  the Drawing Card Display; `drawing` in the stopPropagation list; `onViewFullSize` passed for drawings),
  if a render test is impractical. Say which you chose.
- **Mutations:** put the unconditional `onClick` back → the "no onView" test fails; drop the menu item →
  the menu test fails.

## Allowed files
```
components/collabboard/PostCardContent.tsx                 (the drawing wrapper only)
components/collabboard/canvas/ui/FreeformPadletCards.tsx   (the three wiring points above only)
components/collabboard/menus/NotePostContextMenu.tsx       (the prop + the one item)
tests beside them (new, or extend freeformHideFrame.behavior.test.tsx)
```
Forbidden: `RowColumnContainerCard.tsx`, `CanvasClient.tsx`, the database, `package.json`. **Do not
touch the comments inside `isBlockingEditorModalOpen`.** If a census/characterization test pins the
drawing wrapper's classes, its `title`, or the fallback wrapper's type list, STOP and ask (spec line,
code at file:line, proposed resolution).

Use the Read/Grep/Edit tools; `rg` with `timeout 30` if you need bash. Every test command is
`timeout 600 npx vitest run …`. REAL tool calls only. No `ls` on the repo root, no curl of the dev
server, no git writes, no production build.

## Verification
```
timeout 600 npx tsc --noEmit
timeout 600 npx vitest run components/collabboard/PostCardContent components/collabboard/freeformHideFrame components/collabboard/freeformPostContextMenus components/collabboard/freeformFullViewFrame components/collabboard/RowColumnContainerCard
timeout 900 npx vitest run --reporter=json --outputFile=.opencode-vitest-223.json
```
The failing FILE set must equal the 26-file baseline. Compact report. Do not commit.

**Live (CTO):** on the owner's ellipse: the hover shows the hand cursor and no tooltip; a click selects
it (blue ring stays); right-click shows "Show draw frame" then "View full size", which opens the viewer.
Nothing about the owner's post is changed.

## Commit message (verbatim)
```
feat(canvas): a drawing hovers and clicks like other posts; "View full size" is in its menu

On the board a drawing showed a zoom cursor and a "Click to view full
size" tooltip, and a click opened the viewer instead of selecting it.
It now behaves like every other post: a hand cursor, no tooltip, and a
click selects it. "View full size" is in the drawing's right-click menu,
directly below "Hide draw frame" / "Show draw frame". Drawings inside a
column keep click-to-view, since column children have no menu of their own.
```
Addendum authorized: update ONLY knowledgePdfCard.test.tsx:35a (lines ~772-774) to the new four-type string; leave the two already-failing characterization pins untouched.

## Addendum 2 (CTO): read-only viewers keep click-to-view
`NotePostContextMenu` is `disabled={!canUseFreeformEditButton}`, so a viewer without edit rights has no
right-click menu and would lose "View full size" entirely. Fix: the Drawing Card Display passes
`onView={canUseFreeformEditButton ? undefined : () => setViewDrawingPadlet(padlet)}`, so a viewer keeps
click-to-view (the old behaviour), and an editor gets the menu item. Extend the source test to pin this.

## Addendum 3 (CTO, 2026-09-30): live result
On the owner's ellipse (editor): hover shows the hand cursor and no tooltip; a click selects it (ring,
no viewer); right-click shows "Show draw frame" then "View full size", which opens "View Drawing". No
writes to the post. Gate on `.opencode-vitest-223.json`: extra [] missing []; tsc clean; CTO mutation
(unconditional onClick) fails the drawingView test.
