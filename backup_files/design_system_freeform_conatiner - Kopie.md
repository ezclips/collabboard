# Freeform Container Post Design System (Source of Truth)

This document defines the intended behavior and UI rules for the **Container Post in freeform canvas**. If the behavior drifts, use this file to restore it.

Scope:
- Applies to **freeform canvas Container Post** only.
- Do **not** change layout container behavior based on this doc.

## Core Behavior (Must Hold)

1) Drag into open editor must work
- When a Container Post editor is open, the user can drag a post from the canvas and drop it into the dashed drop zone.
- The drop must add the post to the container.

2) No detach/remove from container on canvas
- In freeform canvas view, container children must NOT show an `X` remove/detach control.
- Removing a child is only allowed inside the editor.

3) Removing inside editor must not auto-place
- When removing a child from a container in freeform:
  - Remove the child ID from the container's `childPadletIds`
  - Clear the child's `parentId`
  - Do NOT auto-position the child on the canvas
- Containers are allowed to have zero children.

## Visual Rules (Must Hold)

1) Drop zone uses gray, not blue
- Drag-over state should be gray:
  - Border: gray
  - Background: light gray
- Avoid blue highlight in the container editor drop zone.

2) Freeform container card top spacing
- Freeform container cards on the canvas need extra top padding so the title/count does not clip.

## Implementation References (Where to Restore)

These are the primary places where the rules above are implemented.

1) Container editor drop zone (drag into open editor)
- File: `components/collabboard/editors/ContainerEditor.tsx`
- Expected:
  - Drop zone has `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop`
  - Drop uses `onDropPadlet(readPadletIdFromDrop(e))`
  - Drag-over styling is gray, not blue

2) Add-to-container logic for open editor
- File: `app/dashboard/canvas/[id]/CanvasClient.tsx`
- Function: `addPadletToOpenContainer`
- Expected:
  - Updates container `childPadletIds`
  - Sets dropped padlet `parentId`
  - Calls `fetchData()` after persistence
- Important:
  - `addPadletToOpenContainer` must be defined AFTER `fetchData` (to avoid "Cannot access 'fetchData' before initialization")

3) Editor wiring
- File: `app/dashboard/canvas/[id]/CanvasClient.tsx`
- Container editor props must include:
  - `onDropPadlet={addPadletToOpenContainer}`

4) No canvas detach `X`
- File: `app/dashboard/canvas/[id]/CanvasClient.tsx`
- In the freeform container card display, there must NOT be a small `X` remove/detach button on child cards.

5) Remove child inside editor does not auto-place
- File: `app/dashboard/canvas/[id]/CanvasClient.tsx`
- Function: `handleDetachChildFromFreeformContainer`
- Expected:
  - Removes child from `childPadletIds`
  - Clears child's `parentId`
  - Does NOT set `position_x`/`position_y`

6) Freeform container top padding
- File: `app/dashboard/canvas/[id]/CanvasClient.tsx`
- Expected:
  - Container card content wrapper applies extra top padding when `padlet.type === 'container'`

## Quick Restore Checklist (If Broken)

Use this in order:

1) Open editor drop zone
- Verify the drop zone in `ContainerEditor.tsx` has drag/drop handlers.
- Verify drag-over styles are gray, not blue.

2) Add handler exists and is wired
- In `CanvasClient.tsx`, confirm:
  - `const fetchData = useCallback(...)` appears before:
  - `const addPadletToOpenContainer = useCallback(...)`
- Confirm `ContainerEditor` receives:
  - `onDropPadlet={addPadletToOpenContainer}`

3) No detach on canvas
- In the freeform container card display, remove any child-level `X` control.

4) Removal does not auto-place
- In `handleDetachChildFromFreeformContainer`, remove any forced positioning of the child.

## Anti-Patterns (Do Not Reintroduce)

- Do not remove drag/drop handlers from the open container editor drop zone.
- Do not add a detach/remove `X` button in the freeform canvas container card view.
- Do not auto-position a child when it is removed from a container.
- Do not define `addPadletToOpenContainer` before `fetchData`.

## Notes for Future Changes

- If drag/drop is refactored, keep the behavior identical to this file.
- If design changes are needed, update this document first, then update the code.

