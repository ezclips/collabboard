# Canvas Setup Page Specification

## Overview

The **Canvas Setup Page** (`/dashboard/create-canvas`) allows users to create a new canvas with customizable settings including title, description, layout, appearance, and engagement options.

**File Location:** `components/collabboard/canvas/CanvasSetupPage.tsx` (999 lines)

### User Flow

This interface is connected to the canvas and sets it up to the user's preference. There will be two access points via the button on the dashboard:

1. User clicks "Create Canvas" button on the dashboard
2. A lightbox pops up displaying this setup form
3. User configures their canvas preferences (title, layout, appearance, etc.)
4. Once saved, the user goes straight to the canvas with the settings they chose

---

## Page Structure

The page consists of 4 main configuration cards:

1. **Canvas Settings** - Title, Description, Icon
2. **Appearance** - Wallpaper (color/gradient/image)
3. **Layout** - Format selection with preview
4. **Engagement** - Comments toggle

---

## Components

### 1. Main Component: `CanvasSetupPage`

**State Management:**
```typescript
// Authentication & Loading
const [user, setUser] = useState<any>(null);
const [loading, setLoading] = useState(false);
const [error, setError] = useState<string | null>(null);
const [isMounted, setIsMounted] = useState(false);

// Canvas Settings
const [title, setTitle] = useState("My Canvas");
const [description, setDescription] = useState("A collaborative workspace");
const [selectedIcon, setSelectedIcon] = useState("🎨");
const [commentsEnabled, setCommentsEnabled] = useState(true);
const [selectedWallpaper, setSelectedWallpaper] = useState<WallpaperSelection>({
  type: 'color',
  value: '#ffffff'
});
const [newPostsAtTop, setNewPostsAtTop] = useState(true);
const [layout, setLayout] = useState<LayoutType>('wall');

// Modal States
const [iconDialogOpen, setIconDialogOpen] = useState(false);
const [wallpaperDialogOpen, setWallpaperDialogOpen] = useState(false);
const [showLayoutModal, setShowLayoutModal] = useState(false);
const [isEditorOpen, setIsEditorOpen] = useState(false);
const [editingPadlet, setEditingPadlet] = useState<Padlet | null>(null);
const [targetColumnId, setTargetColumnId] = useState<string | null>(null);

// Column Data (for preview)
const [columns, setColumns] = useState<ColumnData[]>([...]);
```

---

### 2. `LayoutSelectionModal`

**Purpose:** Full-screen modal for selecting canvas layout format with interactive previews.

**Props:**
```typescript
interface LayoutSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedLayout: LayoutType;
  onSelect: (layout: LayoutType) => void;
  columns: ColumnData[];
  newPostsAtTop: boolean;
  onPreviewEdit: (padlet: Padlet | null, columnId?: string) => void;
  onPreviewAddPost: (columnId: string) => void;
  onPreviewRename: (columnId: string, newTitle: string) => void;
  onPreviewDelete: (columnId: string) => void;
  onPreviewMove: (columnId: string, direction: 'left' | 'right') => void;
  onPreviewAddSection: (baseColumnId?: string, direction?: 'left' | 'right') => void;
  layoutTypes: any[];
}
```

**Features:**
- 4-column grid of layout cards
- Each card has: Icon, Name, Description, Select button, Preview button
- Preview opens a larger modal with interactive layout preview
- Supports all 7 layout types

---

### 3. `LayoutSection`

**Purpose:** Compact card showing currently selected layout with button to open modal.

**Props:**
```typescript
interface LayoutSectionProps {
  selectedLayout: LayoutType;
  newPostsAtTop: boolean;
  setNewPostsAtTop: (value: boolean) => void;
  onOpenLayoutModal: () => void;
  layoutTypes: any[];
}
```

---

### 4. `PadletEditorModal`

**Purpose:** Modal for creating/editing individual padlet items in preview.

**Props:**
```typescript
interface PadletEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: { title: string; content: string }) => void;
  padlet: Padlet | null;
}
```

---

## Layout Types (Canvas Selection Options) ⭐

**This is the core focus for the next iteration.**

```typescript
const layoutTypes = [
  {
    id: 'wall',
    name: 'Wall',
    description: 'Pinterest-style masonry layout',
    icon: Layers3
  },
  {
    id: 'columns',
    name: 'Columns',
    description: 'Kanban-style columns',
    icon: Columns3
  },
  {
    id: 'grid',
    name: 'Grid',
    description: 'Uniform grid layout',
    icon: Grid3X3
  },
  {
    id: 'table',
    name: 'Table',
    description: 'Spreadsheet-like grid',
    icon: Table
  },
  {
    id: 'timeline',
    name: 'Timeline',
    description: 'Chronological timeline',
    icon: Clock
  },
  {
    id: 'freeform',
    name: 'Freeform',
    description: 'Free positioning layout',
    icon: Sparkles
  },
  {
    id: 'map',
    name: 'Map',
    description: 'Mind map layout',
    icon: Map
  }
];
```

### Layout Preview Components

Each layout has its own preview component imported from `@/lib/collabboard/layouts/`:

| Layout | Preview Component | File |
|--------|-------------------|------|
| Wall | `WallPreview` | `WallLayout.ts` |
| Columns | `ColumnsPreview` | `ColumnsLayout.ts` |
| Grid | `GridPreview` | `GridLayout.ts` |
| Table | `TablePreview` | `TableLayout.ts` |
| Timeline | `TimelinePreview` | `TimelineLayout.ts` |
| Freeform | `FreeformPreview` | `FreeformLayout.ts` |
| Map | `MapPreview` | `MapLayout.ts` |

### Layout-Specific Configuration

**Columns/Table:**
- Creates `board_sections` entries in database on save
- Supports column management (add, delete, rename, move)

**Freeform:**
```typescript
config: { 
  canvasWidth: 1200,
  canvasHeight: 800,
  showGrid: true,
  snapToGrid: false
}
```

**Map:**
```typescript
config: { 
  layoutMode: 'mindmap',
  showConnections: true,
  centerNode: true
}
```

---

## Data Types

```typescript
interface WallpaperSelection {
  type: 'color' | 'gradient' | 'image';
  value: string;
}

interface Padlet {
  id: string;
  title: string;
  content: string;
  board_id?: string;
}

interface ColumnData {
  id: string;
  title: string;
  items: Padlet[];
}

type LayoutType = 'wall' | 'columns' | 'grid' | 'table' | 'timeline' | 'freeform' | 'map';
```

---

## Key Functions

### `handleSaveCanvas()`
Saves canvas to Supabase database:

1. Validates user authentication
2. Prepares canvas data object
3. Inserts into `boards` table
4. For columns/table layouts: creates `board_sections` entries
5. Redirects to `/dashboard` on success

**Canvas Data Structure:**
```typescript
const canvasData = {
  title: title.trim(),
  description: description.trim(),
  layout: layout,                        // LayoutType
  background_type: selectedWallpaper.type,
  background_value: selectedWallpaper.value,
  comments_enabled: commentsEnabled,
  reactions_enabled: true,
  user_id: user.id,
  thumbnail: selectedIcon,               // Emoji icon
};
```

### Column Management Functions

```typescript
// Add new column at position
addColumn(baseColumnId?: string, direction: 'left' | 'right' = 'right')

// Delete a column
deleteColumn(columnId: string)

// Rename a column
renameColumn(columnId: string, newTitle: string)

// Move column left or right
moveColumn(columnId: string, direction: 'left' | 'right')
```

### Padlet/Post Management

```typescript
// Open editor modal for new or existing padlet
handleOpenEditor(padlet: Padlet | null, columnId?: string)

// Open editor for adding new post to column
handleAddPost(columnId: string, rowIndex?: number)

// Save padlet data (create or update)
handleSavePadlet(padletData: { title: string; content: string })
```

### Background/Wallpaper

```typescript
// Update wallpaper selection
handleWallpaperUpdate(type: string, value: string)

// Get CSS styles for current background
getCurrentBackground(): React.CSSProperties
```

---

## External Dependencies

### Components
- `IconSelector` - Emoji/icon picker dialog
- `WallpaperSelector` - Color/gradient/image picker dialog
- Layout preview components (7 total)

### UI Components (shadcn/ui)
- Card, CardHeader, CardTitle, CardContent
- Button, Input, Label, Switch
- Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription
- DropdownMenu and related components

### Icons (lucide-react)
- ChevronRight, ArrowLeft, Loader2, Plus, Edit2, Trash2
- MoveLeft, MoveRight, MoreVertical, ArrowRight
- Table, Layers3, Columns3, Grid3X3, Clock, Sparkles, Map

---

## Database Schema

### `boards` table
```sql
- id (primary key)
- title (text)
- description (text)
- layout (text) -- 'wall', 'columns', 'grid', 'table', 'timeline', 'freeform', 'map'
- background_type (text) -- 'color', 'gradient', 'image'
- background_value (text)
- comments_enabled (boolean)
- reactions_enabled (boolean)
- user_id (uuid, references auth.users)
- thumbnail (text) -- emoji icon
- created_at, updated_at (timestamps)
```

### `board_sections` table (for columns/table layouts)
```sql
- id (primary key)
- board_id (references boards)
- title (text)
- description (text)
- position (integer)
```

---

## Next Focus: Canvas/Layout Selection

The layout selection modal is the key UI for choosing canvas format. Key areas to consider:

1. **Visual Design** - Layout cards could have better visual previews
2. **Interactivity** - Preview mode allows testing before committing
3. **Default Selection** - Currently defaults to 'wall' layout
4. **Mobile Responsiveness** - 4-column grid may need adjustment
5. **Animation/Transitions** - Could add smoother selection feedback
6. **Layout Descriptions** - Could be more detailed/helpful
7. **Use Case Guidance** - Help users choose the right layout for their needs

### Current Layout Selection UI Flow:
1. User sees "Layout" card with current selection
2. Clicks to open `LayoutSelectionModal`
3. Sees 4-column grid of all 7 layout options
4. Can click "Select" to choose, or "Preview" to see interactive demo
5. Preview modal shows actual layout with sample data
6. Can select from preview or go back to grid

---

## File References

- Main component: `components/collabboard/canvas/CanvasSetupPage.tsx`
- Page route: `app/dashboard/create-canvas/page.tsx`
- Layout functions: `lib/collabboard/layouts/layout-functions.ts`
- Individual layouts: `lib/collabboard/layouts/[LayoutName]Layout.ts`
- Icon selector: `components/collabboard/canvas/IconSelector.tsx`
- Wallpaper selector: `components/collabboard/canvas/WallpaperSelector.tsx`

---

## ⭐ Layout Behavior Specifications

Detailed mechanics and AI prompt guidance for each canvas layout type.

---

### ⭐ 1. WALL — Brick-style Dynamic Layout

Use this when you want "Wall" behavior: cards of varied size, free ordering, drag anywhere.

**Implementation File:** `components/collabboard/canvas/WallCanvas.tsx`

**Mechanics:**
- Cards populate from the **top row, starting in the middle**
- Posts fill in a **center-out pattern**: 1st=center, 2nd=right of center, 3rd=left of center, etc.
- When a row is full, the next row starts filling from center
- Users can **drag and slide cards** to reorder positions
- **Numbered position badges** (1, 2, 3...) show the display order
- **Vertical scrolling only** - no horizontal scrolling as rows fill up
- Visual hierarchy established by position order, not grid lines

**Post Population Pattern (for 7 columns):**
```
Row 1:  [7] [5] [3] [1] [2] [4] [6]
         ←   ←   ←  ⬆   →   →   →
                  center
```
- Position 1: Column 4 (center)
- Position 2: Column 5 (right of center)
- Position 3: Column 3 (left of center)
- Position 4: Column 6 (right+1)
- Position 5: Column 2 (left+1)
- etc.

**Center-Out Algorithm:**
```typescript
const getCenterOutPositions = (columnsPerRow: number): number[] => {
  const positions: number[] = [];
  const center = Math.floor(columnsPerRow / 2);
  
  positions.push(center); // First position is center
  
  let offset = 1;
  while (positions.length < columnsPerRow) {
    if (center + offset < columnsPerRow) positions.push(center + offset); // right
    if (center - offset >= 0) positions.push(center - offset); // left
    offset++;
  }
  
  return positions;
};
```

**Canvas Settings Integration:**
- `background_type` & `background_value`: Applied as canvas background
- `comments_enabled`: Shows/hides comment buttons on cards
- `new_posts_at_top`: Determines sort order by creation date

**Key Components:**
- `SortablePadletCard`: Individual draggable post card with:
  - Author avatar and name
  - Relative timestamp
  - Position badge (yellow circle with number)
  - 3-dot menu (Edit, Pin, Delete)
  - Reactions and comments footer
- `WallCanvas`: Main container with DnD context

**Drag & Drop:**
- Uses `@dnd-kit/core` and `@dnd-kit/sortable`
- `rectSortingStrategy` for grid-based reordering
- Updates `metadata.wallPosition` on each padlet after reorder
- Persists order via `onReorder` callback

**Content Guidelines:**
- Allow cards to be re-ordered by dragging
- Each card is self-contained; context doesn't depend on order
- Use short labels, punchy titles, visual attachments
- Avoid strict sequencing language ("first" etc.)

**Example Prompt:**
> "Drag any idea card anywhere on the wall; the wall auto-flows to fill gaps. Focus on visual clustering and concept proximity."

---

### ⭐ 2. COLUMNS — Vertical Categorization

For multi-column workflows — slide cards vertically and between columns.

**Mechanics:**
- Cards can be **dragged up/down within a column**
- Cards can be **dragged horizontally between columns**
- Columns represent distinct concepts/stages

**Content Guidelines:**
- Users are expected to move cards between columns
- Column headers stay fixed
- Provide a short legend so columns have semantic meaning

**Example Prompt:**
> "Users should be able to drag cards up and down to reorder; drag cards horizontally to move them to a different column."

---

### ⭐ 3. GRID — Uniform Rows & Boxes

Cards are equal size, aligned in a visual grid.

**Mechanics:**
- Fixed grid cells; all cards same size
- Users can **drag to reorder positions in the grid**
- Grid enforces equal width/height

**Content Guidelines:**
- Cards are visually equal and aligned
- Maintain uniform content weight
- Grid placement uses strict rows and columns

**Example Prompt:**
> "Items should snap to grid slots and be comparable at a glance; avoid long text blocks."

---

### ⭐ 4. TABLE — Spreadsheet Behavior

Rows are records; fields are columns like a spreadsheet.

**Mechanics:**
- Rows represent records/entities
- Columns are fields
- Users can reorder rows
- Users can add/remove fields
- Cells accept text, attachments, tags, reactions

**Content Guidelines:**
- Name fields clearly
- Column headers stay fixed
- Allow drag to reorder rows

**Example Prompt:**
> "Each row is an independent record. Users should be able to drag rows up/down to reorder, click column headings to view fields."

---

### ⭐ 5. FREEFORM — Spatial Canvas

Content can be placed anywhere; visual grouping through space.

**Mechanics:**
- Users can place cards absolutely anywhere
- Use space intentionally to show connections
- Allow overlapping if conceptually related

**Content Guidelines:**
- Treat position as meaning
- Encourage non-linear visual organization

**Example Prompt:**
> "Place related items near each other; use space to show groupings and relationships."

---

### ⭐ 6. TIMELINE — Chronological Order

Sequential horizontal units with time axis semantics.

**Mechanics:**
- Users place events along a left-to-right time axis
- Drag items right/left to adjust sequence
- Include clear timestamps

**Content Guidelines:**
- Explicit time labels
- Cards align by time

**Example Prompt:**
> "Each card has a date/time; dragging left/right changes its position on the timeline."

---

### ⭐ 7. MAP — Mind Map Layout

Spatial organization with node connections.

**Mechanics:**
- Central node with branching connections
- Users can drag nodes to reposition
- Visual connections show relationships

**Content Guidelines:**
- Center node is the main concept
- Child nodes branch out hierarchically
- Connections indicate relationships

**Example Prompt:**
> "Place the main concept at center; related ideas branch outward with visible connections."

---

### 🚀 Dragging Posts Between Positions

Standard drag-and-drop behavior phrases to include in prompts:

| Phrase | Use Case |
|--------|----------|
| "Cards may be dragged left/right to reorder them." | Horizontal reordering |
| "Users can slide posts between columns." | Column-based layouts |
| "Allow drag and drop to reposition cards anywhere." | Freeform/Wall layouts |
| "Items must be draggable to reorder vertical or horizontal." | Grid/Table layouts |
| "Drag a post from one section to another." | Cross-section movement |

---

## Additional Layout Types (Future)

### ROWS — Horizontal Story Flow

Sequential horizontal units (not currently implemented).

**Mechanics:**
- Items are arranged horizontally
- Users can add, reorder, and drag rows left/right
- Each row is a section of the narrative

**Example Prompt:**
> "Tell the story step by step from left to right; users may slide rows to change order."

---

### STREAM — Top-Down Feed

Vertical feed like a notification/log (not currently implemented).

**Mechanics:**
- Content flows top-to-bottom
- Users read in order
- New items appear at top or bottom

**Example Prompt:**
> "Items appear top to bottom like a social feed; subsequent items build context."
