# Canvas Refactor Behavior Checklist

Use this checklist to verify no regression before and after each refactor PR.
Run through all cases manually (or via automated tests when available).

---

## 1. Selection behavior
- [ ] Clicking a padlet selects it (`selectedPadletId` set)
- [ ] Clicking the canvas background deselects (`selectedPadletId` → null)
- [ ] Clicking a line selects it (`selectedLineId` set)
- [ ] Clicking background deselects line
- [ ] Graph connect mode: clicking padlet A then padlet B creates a line
- [ ] `graphRefreshToken` increments after graph layout

## 2. Drag / resize behavior
- [ ] Freeform padlet drag: padlet follows cursor, position saved on mouseup
- [ ] Drag does not start until `PADLET_DRAG_START_DISTANCE` px threshold crossed
- [ ] Locked padlet (`isLocked: true`) cannot be dragged
- [ ] Resize handles update width/height, saved on release
- [ ] Container drop: dragging padlet onto container adds it as a child
- [ ] Edge-scroll: dragging near viewport edge scrolls the container

## 3. Zoom / pan + wheel / trackpad behavior
- [ ] Zoom In button increments `canvasZoom`
- [ ] Zoom Out button decrements `canvasZoom`
- [ ] Zoom Reset returns to default zoom level
- [ ] Dragged padlet coordinates are correct at non-default zoom

## 4. Open / close editor modals
- [ ] Note editor: double-click padlet opens, Save/Close works
- [ ] Link editor: opens, saves URL/title/description
- [ ] Todo editor: opens, saves items
- [ ] Table editor: opens, edits cells, saves
- [ ] Container editor: opens, saves
- [ ] Comment editor: opens, posts comment
- [ ] Image editor: opens, uploads or searches image
- [ ] Drawing editor: opens, saves strokes
- [ ] Card editor: opens, saves card content
- [ ] `padletToEdit` is set on open, cleared on close

## 5. Comment popup behavior
- [ ] Comment popup opens on comment icon click
- [ ] Comment renders with correct position
- [ ] Posting a comment adds it to the list
- [ ] Closing popup hides it

## 6. Image editing overlays (crop / draw / color picker)
- [ ] Drawing mode: stroke layer renders over padlet image
- [ ] Crop mode: crop handles visible, crop applied on confirm
- [ ] Image color picker: opens, applies color overlay
- [ ] Caption mode: caption text editable, saved on blur/confirm

## 7. Autosave / persistence triggers
- [ ] Padlet position saved to DB on drag end
- [ ] Line position saved to DB on drag end (`saveLineToDb`)
- [ ] `updateLine` saves toolbar changes (color, dash, arrows)
- [ ] `deletePadletById` removes padlet from DB and local state
- [ ] `requestDeletePadlet` routes through correct delete path
- [ ] Section reorder persists via `handleGridSectionReorder`

## 8. Keyboard shortcuts
- [ ] Delete key on selected padlet → shows confirm or deletes
- [ ] Escape: closes open editor / deselects / exits line mode
- [ ] Layering shortcuts (if configured): move padlet layer up/down
- [ ] Line delete key: Delete on selected line removes it

## 9. Early-return layout paths
- [ ] Kanban layout (early return at L5113): renders `KanbanCanvas` correctly
- [ ] Gantt layout (early return at L5196): renders `GanttCanvas` correctly
- [ ] Switching between layouts does not leave stale state

---

## Additional Cases (from contracts)

### Remote update while local drag is active
- [ ] Start local drag on padlet A
- [ ] Trigger realtime update for padlet A from another client
- [ ] Verify: no flicker/jump during drag
- [ ] Verify: `locallyModifiedPadletsRef` skips the realtime update
- [ ] Verify: final position is consistent after drag end

### Camera / interaction contract stability
- [ ] Zoom in → start drag → zoom out mid-drag → release
- [ ] Verify: coordinates are correct throughout (no coordinate shift)

### High-frequency interaction performance
- [ ] Sustained mouse drag for 5+ seconds
- [ ] Verify: `CanvasClient` (orchestrator) does NOT rerender per raw pointer event
- [ ] Confirm: renders limited to dragged padlet layer only

### Early return layout paths (post-PR12)
- [ ] Load canvas with Kanban layout → early return at L5113 renders correctly
- [ ] Load canvas with Gantt layout → early return at L5196 renders correctly
- [ ] Both continue working after PR12 extracts them to separate shells

### Editor open/close cycle for each type
For each of the 9 editor types (Note, Link, Todo, Table, Container, Comment, Image, Drawing, Card):
- [ ] Open editor → `padletToEdit` is set
- [ ] Edit content → `usePadletSave` handler fires on save
- [ ] Close editor → `padletToEdit` cleared, editor state reset
