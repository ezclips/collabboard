# Design System & Interaction Mechanics

## Drag and Drop Behavior

### 1. Canvas <-> Container Interaction

**Goal**: Seamless movement of items between the free-form canvas and structured containers.

#### Dragging OUT of a Container
- **Trigger**: User drags a child card from a container (using the grip handle or card body).
- **Data Transfer**: Sets `text/container-child-id` and `text/padlet-id` to the padlet's ID.
- **Drop Target**: The main Canvas background (`div#canvas-container`).
- **Effect**:
  1. Detects drop on canvas.
  2. Calculates `x, y` position relative to the canvas origin (accounting for scroll).
  3. **Database Update**:
     - Sets `parentId` to `null`.
     - Updates `position_x` / `position_y`.
     - Removes ID from the old container's `childPadletIds` list.
  4. **Visual**: Card "pops" out of the list and becomes a free-floating padlet.

#### Dragging INTO a Container
- **Trigger**: User drags a free-floating padlet (or a child from another container) over a container.
- **Visual Feedback**: Container highlights with a blue dashed border (`border-blue-500 bg-blue-50`).
- **Drop Target**: `ContainerEditor` drop zone or `ContainerCardPreview`.
- **Effect**:
  1. **Database Update**:
     - Sets `parentId` to the target Container's ID.
     - Appends ID to the target container's `childPadletIds`.
     - (Optional) Clears `position_x/y` as they are irrelevant inside a list.
  2. **Visual**: Card disappears from canvas/old container and appends to the new list.

### 2. Internal Container Reordering
- **Mechanism**: Vertical list reordering.
- **Feedback**: A blue horizontal line indicator shows the exact insertion point between items.
- **Logic**: Updates the order of the `childPadletIds` array in the container's metadata.

### 3. Canvas Positioning
- **Grid Snapping**: (Currently free-form, but logic exists for potential grid alignment).
- **Collision**: No strict collision physics; items can overlap.

## Component Architecture for "Live" Posts

To maintain visual fidelity between the Canvas and Containers, we use a shared renderer:

- **`PostCardContent.tsx`**: The source of truth for rendering post content.
  - Used by `page.tsx` (Canvas free-floating pads).
  - Used by `ContainerEditor.tsx` (Expanded edit view).
  - Used by `ContainerCardPreviewFull.tsx` (Canvas container view).
  - **Key Prop**: `padlet` (The full data object).
  - **Interactive Elements**: Checkboxes (Todos) and Links are interactive.
  - **Styles**: Shared Tailwind classes ensure 1:1 match across all views.

## Comment System & Collapse Functionality

### 1. Comment Interface (WhatsApp-style)
- **Editor Integration**: Accessible via the "Comment" button in the toolbar.
- **Features**:
  - Link integration inside comments.
  - Rich text support (strikethrough, colors).
  - User avatars and timestamps.

### 2. Post Collapse (Pointer Mode)
- **Goal**: De-clutter the canvas by turning full posts into small interactive markers.
- **Trigger**: "Collapse" button in the Editor's left toolbar.
- **Visual Representation**:
  - A small colored pointer/marker on the canvas.
  - Displays the count of comments (e.g., "2").
  - The pointer color matches the padlet's `cardColor` or `badgeColor`.
- **Interaction**:
  - **Click Pointer**: Opens the list of comments as a popup.
  - **Toggle Collapsed**: Clicking the Collapse icon in the toolbar again expands it back to a full post.
- **Metadata State**: Stored in `metadata.isCollapsed` (boolean).
