---
name: Row Canvas Development
description: Documentation and guidelines for working with the Row Canvas component, including architecture, context menus, and drag-and-drop logic.
---

# Row Canvas Development

This skill provides an overview of the Row Canvas architecture and specific details found during development.

## Architecture

The Row Canvas is built using a hierarchical component structure:

1.  **CanvasClient.tsx** (`app/dashboard/canvas/[id]/CanvasClient.tsx`):
    -   The main orchestrator.
    -   Manages state for sections (`board_sections` table) and padlets.
    -   Renders the `RowCanvasDnD` component when `isRowsLayout` is active.
    -   **Important**: Handles (or should handle) global actions like moving sections.

2.  **RowCanvasDnD.tsx** (`components/collabboard/row/RowCanvasDnD.tsx`):
    -   Handles the Drag-and-Drop context (`DndContext`) for the entire canvas.
    -   Maps sections to their posts.
    -   Renders a list of `RowLane` components.
    -   Passes callbacks from `CanvasClient` down to `RowLane`.

3.  **RowLane.tsx** (`components/collabboard/row/RowLane.tsx`):
    -   Represents a single horizontal section (row).
    -   Contains the "Section Header" with the title and the **Context Menu** (3-dots button).
    -   Renders the horizontal list of posts using `SortableContext`.

## Section Context Menu

The "Right Click Menu" (or 3-dots menu) on the section header in `RowLane.tsx` contains the following items:

-   **Add post**: Adds a new post to the section.
-   **Rename section**: Enables inline editing of the title.
-   **New section above**: Triggers `onAddSectionLeft` (in Row view, "left" often maps to "above" or "before" logic depending on orientation, but structurally it creates a sibling section).
-   **New section below**: Triggers `onAddSectionRight`.
-   **Move section up**: Triggers `onMoveLeft`.
-   **Move section down**: Triggers `onMoveRight`.
-   **Delete section**: Triggers `onDelete`.

### Known Issues (as of 2026-02-01)

-   **Unimplemented Move Handlers**: In `CanvasClient.tsx`, the props for moving sections are currently empty no-ops:
    ```tsx
    onMoveSectionLeft={() => { }}
    onMoveSectionRight={() => { }}
    ```
    This means "Move section up" and "Move section down" currently do nothing.

## Development Tasks

When working on Row Canvas:

1.  **To fix section reordering**: Implement `onMoveSectionLeft`/`Right` in `CanvasClient.tsx`. This likely involves swapping `position` values in the `board_sections` table and updating state.
2.  **To modify post rendering**: Check `RowLane.tsx` (for the container) and `PostCardContent` (for the inner content).
3.  **To adjust Drag-and-Drop**: `RowCanvasDnD.tsx` handles the cross-section logic.

## Key File Locations

-   `CanvasClient`: `app/dashboard/canvas/[id]/CanvasClient.tsx`
-   `RowCanvasDnD`: `components/collabboard/row/RowCanvasDnD.tsx`
-   `RowLane`: `components/collabboard/row/RowLane.tsx`

## UI Specifications

### Item Counters
-   **Requirement**: All canvas layouts (Row, Wall, Column, Timeline) must display an item counter.
-   **Location**: Bottom left of the canvas/section.
-   **Styling**: `<span className="text-[9px] font-medium bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">`
- Format: "1 item" or "X items".

## Resolved Issues & Notes

### Same-Column Drag to Top Position (Fixed)

**Problem:** Dragging a container to position 0 (top) within the **same column** did not work reliably — it worked once then stopped. Dragging from a neighbouring column to position 0 always worked.

**Root cause (two layers):**

1. **Wrong handler**: Same-column moves went through `onReorderPost` (`handleColumnReorder`), which uses arithmetic positioning (`firstItem.sectionPosition - 1000`) and fails at index 0. Cross-column used `onDropContainerToSection` (`moveContainerToSection`), which re-indexes the entire column (0, 1, 2…).

2. **`pointerWithin` collision detection unreliable for same-column drags**: When dragging within the same column, the active card's DOM placeholder blocks `pointerWithin` from detecting the lane as a droppable. `handleDragOver` fires only once (or not at all), so the `dropIndicator` ref captured a stale/wrong index. Reading it in `handleDragEnd` gave the wrong position.

**Fix:** For containers, bypass `handleDragOver`'s indicator entirely. In `handleDragEnd`, compute the drop target fresh from `pointerPositionRef.current` (the actual pointer position at release time) by scanning the DOM directly:

```typescript
// handleDragEnd — containers only
const pointer = pointerPositionRef.current;
for (const col of normalizedColumns) {
    const sectionId = String(col.section.id);
    const laneEl = document.querySelector(`[data-section-id="${sectionId}"]`);
    if (!laneEl) continue;
    const laneRect = laneEl.getBoundingClientRect();
    if (pointer.x < laneRect.left || pointer.x > laneRect.right) continue;

    // Exclude the active card from scan so index is clean
    const otherPosts = (postsBySection[sectionId] || []).filter(p => p.id !== activeIdStr);
    let bestIndex = otherPosts.length; // default: append
    for (let i = 0; i < otherPosts.length; i++) {
        const el = document.querySelector(`[data-section-id="${sectionId}"] [data-post-id="${otherPosts[i].id}"]`);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (pointer.y < rect.top + rect.height / 2) { bestIndex = i; break; }
    }
    finalSectionId = sectionId;
    finalIndex = bestIndex;
    break;
}
await onDropContainerToSection?.(activeIdStr, finalSectionId, finalIndex, fromSectionId);
```

**Guardrails:**
- Never use `handleColumnReorder` for container reordering. Use `moveContainerToSection` for all container moves regardless of source/target column.
- Never rely on `dropIndicator`/`dropIndicatorRef` for the actual container drop position — `pointerWithin` is unreliable for same-column drags. Always recompute from `pointerPositionRef.current` at drag-end time.
- Always exclude the active card (`p.id !== activeIdStr`) when scanning for the target index, otherwise you may "insert before yourself".

---


### Container Creation Behavior (Fixed 2026-02-01)
- **Issue**: `handleCreateContainerFromPrompt` was automatically opening the Note editor after creating a container.
- **Resolution**: Clicking the `+` button in Row Canvas now creates an empty container *without* triggering any post creation modal.

### Container 'Open Post' Context Menu Logic (Implemented Features)
**Summary of Changes:**
1.  **ColumnPostContextMenu.tsx**
    -   Added `ChevronRight` import.
    -   Added optional props: `openTargets`, `onOpenTarget`, `getOpenTargetLabel`.
    -   Updated "Open post":
        -   Direct open if 1 child.
        -   Submenu if multiple children.
        -   Fallback to `onOpen` if no targets.

2.  **RowLane.tsx**
    -   Added `onOpenTarget` prop.
    -   Added `getContainerChildren()` and `getOpenTargetLabel()` helpers.
    -   Updated `ColumnPostContextMenu` usage to pass new props.

3.  **WallCanvas.tsx**
    -   Added `onOpenTarget` to `WallCanvasProps` and `SortablePadletProps`.
    -   Added `getOpenTargetLabel()`.
    -   Updated `WallContainerContextMenu` usage.

4.  **RowCanvasDnD.tsx**
    -   Added `onOpenTarget` to interface and props.
    -   Passed `onOpenTarget` to `RowLane`.

5.  **CanvasClient.tsx**
    -   Added `onOpenTarget` handler to `WallCanvas` and `RowCanvasDnD` to open the correct editor based on post type (Note, Image, Todo, Link, etc.).
    -   **Column Canvas**: Propagated `onEditPost` as the smart target opener.

6.  **ColumnsCanvasRow.tsx** (Column Canvas)
    -   Implemented `openTargets` calculation.
    -   Passed props to `ColumnPostContextMenu` to enable smart "Edit post" (Direct Open / Submenu).




### Container & Rendering Refinements (2026-02-01)

**RowLane.tsx**
- `getContainerChildren()`:
    - Now uses `childPadletIds` when present (keeps the same order as the container list).
    - Falls back to `parentId` lookup if `childPadletIds` is empty (so the submenu still appears).
- `getOpenTargetLabel()`: Now shows type only (as requested), not titles.

**WallCanvas.tsx**
- `getChildren()`: Now uses `childPadletIds` order if available, fallback to `parentId`.
- `getOpenTargetLabel()`: Now shows type only.

**RowColumnContainerCard.tsx**
- Child cards now render with their own `cardColor` background and topStrip (so BG/TS changes are visible for child image posts).

**PostCardContent.tsx**
- Container child rendering (WallCanvas container view) now applies child `cardColor` + `topStrip` instead of the fixed `bg-white/50`, so color picker changes show there too.

### Context Menu Refinements (2026-02-02)

**Wall Canvas (`WallContainerContextMenu.tsx`)**
- "Edit post" (was "Open post") is now at the top with a pencil icon (`Edit2`).
- Removed "Copy link to post".

**Row Canvas, Column Canvas & Timeline Canvas (`ColumnPostContextMenu.tsx`)**
- "Edit post" is at the top with a pencil icon.
- **Color Picker** restored immediately below "Edit post".
- Restored actions below Color Picker:
    - Add post before
    - Add post after
    - Duplicate post
- Removed actions:
    - Copy to another padlet
    - Transfer to another padlet
    - Set as padlet cover
    - Pin post
    - Report post

### Timeline Canvas Refinements (2026-02-02)

**ChronoTimelineCanvas.tsx**
-   **Smart Edit Post**:
    -   Implemented `openTargets` logic similar to Row/Column canvas to support the "Edit post" submenu for containers with multiple children.
    -   Passed `onOpenTarget` to `ColumnPostContextMenu`.
-   **Add Before/After**: 
    -   Mapped `onAddBefore`/`onAddAfter` context menu actions to `onInsertContainerAt`.
    -   Ensures containers are inserted at the correct index relative to the selected container.

### Wall Canvas Layout Refinement (2026-02-02)

**WallCanvas.tsx**
-   **Responsive Center-Out Grid**: Implemented dynamic calculation of `postsPerRow` based on screen width.
-   **Eliminated Horizontal Scroll**: Removed fixed width constraints (`w-max`) and `overflow-x-auto`. The layout now centers itself and wraps posts naturally while maintaining the center-out filling logic.

### Timeline Hint & Sidebar Tooltip Fixes (2026-02-02)

**ChronoTimelineCanvas.tsx**
- **Vertical Timeline Layout**:
    -   Fixed "Drop library item here" buttons obscuring the sidebar by applying `pointer-events-none` to the container div.
    -   **Re-enabled "+" Button**: Removed the `disabled` attribute from the "+" button and added an `onClick` handler to allow adding new containers. Updated the tooltip to "Add container". The button itself is `pointer-events-auto`, so it remains clickable even though the container is transparent to clicks.

**CanvasClient.tsx (Sidebar)**
- **Tooltip Trigger Fix**: The sidebar tooltips (including "Back to Dashboard") were triggering on the entire button padding area, causing them to appear when hovering the canvas edge.
    -   Moved the `group` hover class from the outer button container to the inner icon container (or wrapper div for Dashboard button).
    -   Moved the tooltip `<span>` to be a child of the inner icon container.
    -   This restricts the hit-test area to the visual icon size (e.g., 8x8px or 16x16px), preventing accidental triggers from the canvas.

---

## Freeform Canvas — Post Editing Modals (2026-03-19)

### Architecture: Image Post Modal (`imageToolbarPadletId`)

Image posts (`padlet.type === 'image'`) open a fullscreen modal gated by `imageToolbarPadletId` (string | null). The modal overlays the canvas at `z-[60000]` with `backdrop-blur-sm`.

**Modal structure** (flex row, `items-start gap-6`):
1. `ImageActionsToolbar` — left column with Edit Image, Draw on Top, Color, Caption, Text Style, Reaction, Comment buttons
2. Card preview — 360px wide, shows top strip + image + reactions + `InlineCaption`
3. Sub-panels (appear to the right as extra flex items): TextStylePopup, EmojiPicker, comment popup, color picker

**Canvas suppression pattern**: Any canvas-side popup that shares state with modal handlers gets `&& !imageToolbarPadletId` on its render gate. Applied to:
- `InlineCaption` `isEditing` / `value` (lines ~1254–1257)
- `TextStylePopup` render gate (line ~1289)
- `cardCommentPopupPadletId` comment popup (line ~808)
- `cardCommentPopupPadletId` + `commentColorPopupId` popup (line ~766)

**State variables used** (all props from CanvasClient):
- `imageToolbarPadletId` / `setImageToolbarPadletId`
- `isImageColorPickerOpen` / `setIsImageColorPickerOpen`
- `isImageEmojiOpen` / `setIsImageEmojiOpen`
- `captionPopupPadletId` / `setCaptionPopupPadletId`
- `textStylePadletId` / `setTextStylePadletId`
- `cardCommentPopupPadletId` / `setCardCommentPopupPadletId`
- `editingCaption` / `setEditingCaption`

**Edit Image** → `setCropPadlet(padlet) + setIsCropMode(true)` (opens ImageCropLayer crop/flip editor). NOT `replaceImage()` which opens the upload editor.

---

### Architecture: Card Post Modal (`cardToolbarPadletId`)

Card/clipart posts (`padlet.type === 'card'`) open a modal gated by `cardToolbarPadletId`. Same z-index (`z-[60000]`) and structure as the image modal.

**Modal structure** (flex row, `items-start gap-6`):
1. `CardActionsToolbar` — Color, Icon, Card view, Reaction, Comment (Delete removed from modal)
2. `CardPreview` — 220px wide, readonly full card preview
3. Sub-panels: `CardColorPanel` (when `isCardColorPickerOpen`), `EmojiPicker` (when `isImageEmojiOpen`), comment popup (when `cardCommentPopupPadletId === activeCardToolbarPadlet.id`)

**Derived constants** (in `FreeformPadletCards.tsx`):
```tsx
const activeCardToolbarPadlet = cardToolbarPadletId
  ? padlets.find((p) => p.id === cardToolbarPadletId) ?? null
  : null;
```

**Canvas suppression** (`&& !cardToolbarPadletId` added to):
- `isCardColorPickerOpen && padletToEdit?.id === padlet.id` (card color picker)
- `selectedPadletId === padlet.id && isImageEmojiOpen` (emoji picker — shared state)
- `cardCommentPopupPadletId === padlet.id && commentColorPopupId` (comment color popup)
- `cardCommentPopupPadletId === padlet.id` (comment popup)

**Inline `CardActionsToolbar`** on canvas is disabled with `{false && cardToolbarPadletId === padlet.id && (` — the modal is the only active toolbar.

**Icon (replace clipart)**: does NOT close modal (`setCardToolbarPadletId(null)` removed). Library panel slides in on top. Z-index stack:
- Card/image modal: `z-[60000]`
- LibraryPanel sidebar: `z-[70000]`
- ExcalidrawBrowseModal ("Add icons from web"): `z-[80000]`
- ExternalClipartBrowserModal: `z-[80000]`

**Modal close** also calls `setIsLibraryOpen(false)` so the library panel closes with it.

**Delete**: Removed from `CardActionsToolbar` in modal. `onDelete` prop made optional in `CardActionsToolbar.tsx` — button only renders when prop is provided.

---

### CardActionsToolbar (`CardActionsToolbar.tsx`)

- `onDelete` is optional — omit it to hide the Delete button
- Color picker uses `CardColorPanel` which has its own built-in X button (only shown when `onClose` prop is passed)
- `CardColorPanel` header layout: `grid grid-cols-[1fr_auto_1fr]` — title left, tabs centered, X right

### Hint Banner in LibraryPanel

"Click a clipart below to replace the icon" hint (`isIconReplaceMode`) was moved from above Personal Library to **above External Library** (below the dividing line between the two sections).

## Investigation Log


The following steps were taken to uncover these details:

1.  Searching for the Row Canvas context menu implementation
2.  Searching for RowCanvas related files
3.  Examining WallContainerContextMenu implementation
4.  Searching for 'Move section' in codebase
5.  Searching for 'New section' again locally
6.  Examining RowLane implementation
7.  Searching for usages of RowLane
8.  Examining RowCanvasDnD implementation
9.  Searching for usages of RowCanvasDnD
10. Examining CanvasClient implementation
11. Searching for onMoveSectionLeft in CanvasClient
12. Finding line numbers for onMoveSectionLeft
13. Searching for RowCanvasDnD in CanvasClient directory
14. Reading RowCanvasDnD props in CanvasClient

### Comment Post Components & DnD Fixes (2026-02-05)

There are three distinct "comment post" components in use across the application, each requiring specific handling to ensure text selection works without triggering the drag-and-drop system.

#### 1. EmbeddedCommentList (`EmbeddedCommentList.tsx`)
-   **Usage**: Inside **Containers** across Row, Column, Wall, and Freeform layouts. It appears when a container child is a "comment" type post.
-   **Component**: The "Add a comment..." input field at the bottom of the list.
-   **Fix Applied**: Added both `onPointerDown={(e) => e.stopPropagation()}` and `onMouseDown={(e) => e.stopPropagation()}` to the input field.

#### 2. CommentPost (`CommentPost.tsx`)
-   **Usage**: Standalone comment cards, primarily in **Freeform Canvas** (Type 2).
-   **Component**: The input field for adding new comments.
-   **Fix Applied**: Added both `onPointerDown` and `onMouseDown` propagation stops to the input.

#### 3. CommentRow (`CommentRow.tsx`)
-   **Usage**: Individual comment rows within the list.
-   **Component**: The editing interface (TipTap editor) when a user double-clicks to edit a comment.
-   **Fix Applied**: Added `onPointerDown={(e) => e.stopPropagation()}` and `onMouseDown={(e) => e.stopPropagation()}` to the wrapper `div` around `EditorContent`. This ensures that selecting text inside the editor (e.g., waiting for the "h" key press or click-drag) doesn't accidentally start dragging the parent container.

**Core Principle**:
`dnd-kit` attaches sensors (PointerSensor, MouseSensor) to draggable parent elements. When interacting with child inputs, stopping event propagation for both `PointerDown` and `MouseDown` is critical to prevent the drag system from capturing the event.


