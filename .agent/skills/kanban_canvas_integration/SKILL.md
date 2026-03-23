---
description: Guide for integrating and maintaining the Scalable Kanban Layout (Kanboard 1.2 Architecture).
---

# Scalable Kanban Layout Architecture

This guide documents the architecture, database schema, and integration steps for the Kanban layout. It reflects the "Clean Reset" strategy using standardized UUIDs.

## 1. Core Architecture

The Kanban layout uses a **surgical integration** approach:
- **Frontend**: dhtmlx-inspired React components (`components/kanban-canvas/`).
- **Backend Data**: Fully relational PostgreSQL tables (not JSONB) inspired by Kanboard 1.2.
- **IDs**: **Strict UUIDs** for all entities (`canvases`, `cards`, `columns`, `swimlanes`, `users`).
- **State**: React Context (`store.tsx`) + Supabase Adapter (`supabaseAdapter.ts`) + Optimistic Updates.

## 2. Integration Points

### A. Layout Registration
- **Type Definition**: `components/collabboard/settings/types.ts` (`LayoutType` union).
- **Settings UI**: `components/collabboard/canvas/LayoutComponents.tsx`.
- **Creation UI**: `components/collabboard/canvas/CanvasSetupPage.tsx` (Critical for "Create New" flow).

### B. CanvasClient Rendering
**File**: `app/dashboard/canvas/[id]/CanvasClient.tsx`

The Kanban layout uses an **early return** strategy to isolate its complex drag-and-drop logic from the standard Freeform/Wall canvas:

```typescript
// Detect Layout
const isKanbanLayout = canvas?.layout === 'kanban';

// ...

// Render isolated Kanban
if (isKanbanLayout) {
  return (
    <div className="h-screen w-screen flex overflow-hidden min-w-0">
      {/* Minimal Sidebar (Back button only) */}
      <div className="w-14 bg-white border-r flex flex-col items-center py-6...">
        {/* ... */}
      </div>

      {/* Kanban Provider & Canvas */}
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden">
        <KanbanProvider canvasId={canvas.id}>
          <KanbanCanvas />
        </KanbanProvider>
      </div>
    </div>
  );
}
```

> **Note**: We removed `getMockData` imports. The `KanbanProvider` now loads directly from Supabase.

## 3. Database Schema (UUID Standardized)

All primary and foreign keys are `UUID`.

### ⚠️ Critical: Table Name is `boards`, not `canvases`

The application uses the **`boards`** table (not `canvases`) for storing canvas/board data. This was discovered during migration debugging when the app code showed `.from('boards').insert()` in `CanvasSetupPage.tsx`.

**Migration Fix Applied**: `20260213_kanban_CORRECTED.sql` successfully converted `boards.id` from `bigint` → `UUID` and updated all 16+ dependent tables.

### Tables
| Table | PK | FKs | Description |
|---|---|---|---|
| `boards` | `id` (UUID) | - | The main canvas/board entity (was bigint, now UUID). |
| `kanban_swimlanes` | `id` (UUID) | `canvas_id` → `boards(id)` | Horizontal rows. |
| `kanban_columns` | `id` (UUID) | `canvas_id` → `boards(id)` | Vertical stacks. |
| `kanban_cards` | `id` (UUID) | `canvas_id` → `boards(id)`, `column_id`, `swimlane_id` | Tasks/Items. |
| `kanban_links` | `id` (UUID) | `canvas_id` → `boards(id)`, `from_card_id` → `kanban_cards(id)`, `to_card_id` → `kanban_cards(id)` | Card-to-card relationships. |
| `kanban_board_members`| `id` (UUID) | `canvas_id` → `boards(id)`, `user_id` | RBAC (Manager/Member/Viewer). |

### Auto-Seeding for New Boards

When a board is created with columns but no cards, the system automatically seeds it with 28 predefined task cards in the first column:

```typescript
// store.tsx - Seed labels (28 total)
const defaultSeedCardLabels = [
  'Real-time Monitoring',
  'User Data Collection',
  'ML Framework Selection for Cat Recognition System',
  // ... 25 more task labels
];

// Auto-seeding logic runs on initial load
if (mappedData.cards.length === 0 && mappedData.columns.length > 0) {
  const firstColumn = [...mappedData.columns].sort(
    (a, b) => (a.order || 0) - (b.order || 0)
  )[0];
  
  const seedCards = defaultSeedCardLabels.map((label, index) => ({
    id: crypto.randomUUID(),
    label,
    columnId: firstColumn.id,
    order: index,
    priority: 'medium',
    progress: 0,
  }));
  
  // Persist and only include successfully saved cards
  const persistedFlags = await Promise.all(
    seedCards.map(card => saveCard(card))
  );
  const persistedSeedCards = seedCards.filter((_, idx) => persistedFlags[idx]);
}
```

**Behavior**: Existing boards with cards are unchanged; only truly empty boards get seeded once.

### Schema Reference (SQL)

```sql
CREATE TABLE kanban_cards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    canvas_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,  -- Note: boards, not canvases
    column_id UUID NOT NULL REFERENCES kanban_columns(id) ON DELETE CASCADE,
    swimlane_id UUID REFERENCES kanban_swimlanes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT,
    color_id TEXT,
    priority INTEGER DEFAULT 0,
    order_index INTEGER DEFAULT 0,
    -- ... other Kanboard fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 4. Frontend Data Flow & Types

### Type Definitions (`lib/kanban/types.ts`)
We force `string` types for all IDs to match the UUIDs from the DB.

```typescript
export interface KanbanDBCard {
    id: string;           // UUID string
    canvas_id: string;    // UUID string
    column_id: string;    // UUID string
    swimlane_id?: string; // UUID string
    title: string;
    // ...
}
```

### ID Generation (`store.tsx`)
When creating optimistic items on the frontend, we use `crypto.randomUUID()` to ensure ID collision safety before the DB responds.

```typescript
// Example: Duplicating a card
const newCard: Card = {
  ...cardToDuplicate,
  id: crypto.randomUUID(), // ✅ DO NOT use Date.now()
  label: `${cardToDuplicate.label} (Copy)`,
};
```

## 5. Persistence Patterns & FK Constraint Handling

### Critical: Always Use `useKanbanPersistence()` for Card/Link Operations

> [!WARNING]
> **FK Violation Prevention**: All card and link operations must persist to the database before updating UI state. Using non-persistent actions (`useKanbanActions`) can cause foreign key constraint violations when links reference cards that only exist in local state.

```typescript
// ✅ CORRECT - Board.tsx
import { useKanbanPersistence } from './store.tsx';

const actions = useKanbanPersistence();

// ❌ WRONG - This will cause FK errors
// const actions = useKanbanActions();
```

**Files that must use persistent actions**:
- `Board.tsx` - Card creation, drag-and-drop operations
- `CardMenu.tsx` - Move, duplicate, delete operations
- `ColumnMenu.tsx` - Column rename, move, delete
- `RowMenu.tsx` - Row rename, move, delete
- `Editor.tsx` - Link creation, deletion

### Link Persistence Pattern

Links in the `kanban_links` table have foreign key constraints to `kanban_cards`. To prevent FK violations, **links must only be added to UI state after successful database insertion**.

```typescript
// ✅ CORRECT - store.tsx (useKanbanPersistence)
addLink: async (link: Link) => {
  const ok = await saveLink({
    id: link.id,
    canvas_id: canvasId,
    from_card_id: link.masterId,
    to_card_id: link.slaveId,
    relation: link.relation || 'Relates to'
  });
  
  // Only update state if DB insert succeeded
  if (ok) actions.addLink(link);
},
```

**Why this matters**: If a card exists only in optimistic UI state but hasn't been persisted to `kanban_cards`, attempting to insert a link referencing it will fail with:
```
ERROR: insert or update on table "kanban_links" violates foreign key constraint 
"kanban_links_from_card_id_fkey"
```

### Card Creation with Await

When creating cards that will be immediately used (e.g., opening editor, creating links), **always await** the persistence call:

```typescript
// ✅ CORRECT - Board.tsx
const handleAddCard = async (columnId: string, rowId?: string) => {
  const newCard: CardType = {
    id: crypto.randomUUID(),
    label: 'New Card',
    columnId,
    rowId,
    order: getCardsForCell(columnId, rowId).length,
  };
  
  // Wait for DB save before opening editor
  await actions.addCard(newCard);
  actions.setActiveCard(newCard.id);
};
```

### Duplicate Card Persistence

Duplicate operations must persist the new card to ensure DB consistency:

```typescript
// ✅ CORRECT - store.tsx (useKanbanPersistence)
duplicateCard: async (id: string) => {
  const source = data.cards.find((card) => card.id === id);
  if (!source) return;

  const duplicated: Card = {
    ...source,
    id: crypto.randomUUID(),
    label: `${source.label} (Copy)`,
    order: (source.order || 0) + 1,
  };

  // Add to UI state
  actions.addCard(duplicated);

  // Persist to database
  await saveCard({
    id: duplicated.id,
    canvas_id: canvasId,
    title: duplicated.label,
    column_id: duplicated.columnId,
    // ... full card data
  });
},
```

### Relation Dropdown Implementation

The relation dropdown in `Editor.tsx` follows DHTMLX Kanban specification:

1. **No default value** - Users must explicitly select a relation
2. **Placeholder option** - "Select a relation" with empty value
3. **Both fields required** - Relation and target card must be selected

```typescript
// Editor.tsx - State initialization
const [linkRelation, setLinkRelation] = useState('');
const [linkTargetId, setLinkTargetId] = useState('');

// Reset when card changes
useEffect(() => {
  if (card) {
    setLinkRelation('');  // No default
    setLinkTargetId('');
  }
}, [card]);

// UI - Dropdown with placeholder
<select value={linkRelation} onChange={(e) => setLinkRelation(e.target.value)}>
  <option value="">Select a relation</option>
  {relationOptions.map((option) => (
    <option key={option} value={option}>{option}</option>
  ))}
</select>

// Button disabled until both fields populated
<button
  onClick={handleAddLink}
  disabled={!linkTargetId || !linkRelation}
>
  Add link
</button>
```

## 6. Maintenance Guidelines

### Adding New Fields
1. **DB**: Add column to `kanban_cards` (e.g., `ALTER TABLE kanban_cards ADD COLUMN tags TEXT[]`).
2. **Type**: Update `KanbanDBCard` in `lib/kanban/types.ts`.
3. **Adapter**: Update `saveCard` in `lib/kanban/supabaseAdapter.ts` to include the field in the `upsert`.
4. **Store**: Update `useKanbanPersistence` in `components/kanban-canvas/store.tsx` to pass the field from action to adapter.

### Debugging "Invalid UUID" Errors
If you see `invalid input syntax for type uuid`, it means an integer ID (e.g., "59") is being passed where a UUID is expected.
- **Check**: `CanvasClient.tsx` passing `canvas.id`.
- **Fix**: Ensure the `canvases` table uses UUIDs (run `20260213_kanban_clean_reset.sql` if needed).

## 6. Critical Isolation Boundaries

To protect the rest of the app:
1. **Do not modify** `components/canvas/WallCanvas.tsx` or `FreeformLayout` logic for Kanban features.
2. **Do not reuse** the `padlets` table for Kanban cards. Use `kanban_cards`.
3. **Do not mix** `dnd-kit` contexts. Kanban implements its own drag-and-drop system.

---

## 7. UI/UX Improvements & Fixes

### Context Menu Styling (Transparency Fix)

**Issue**: Context menus (column menu, card menu, row menu) were rendering with transparent backgrounds due to external CSS file not loading reliably.

**Solution**: Migrated from external `context-menu.css` to inline Tailwind classes + fallback inline styles in `ContextMenu.tsx`:

```typescript
// ContextMenu.tsx
<div
  className="context-menu fixed z-50 min-w-[200px] bg-white border border-gray-200 rounded-lg shadow-xl p-1"
  style={{
    left: `${adjustedPosition.x}px`,
    top: `${adjustedPosition.y}px`,
    backgroundColor: '#ffffff', // Explicit inline fallback
  }}
>
```

**Menu Items**:
```typescript
<button
  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-gray-100 ${
    item.danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-900'
  }`}
>
```

> [!IMPORTANT]
> Always use Tailwind utilities + inline `backgroundColor` for critical UI elements that must be opaque. External CSS may not load in all contexts due to Next.js bundling behavior.

### Global Header Row Standardization

**Issue**: New canvases (with no swimlanes) were missing the top column header bar, reverting to per-column headers.

**Solution**: Refactored `Board.tsx` to use the **Global Header Row** layout universally:

```typescript
// Board.tsx - Standard view (no rows)
<div className="kanban-board has-rows">
  {/* Global Header Row */}
  <div className="kanban-header-row">
    <div className="kanban-columns-headers">
      {sortedColumns.map((column) => (
        <Column
          variant="header-only"
          hideAddButton
          // ... props
        />
      ))}
    </div>
  </div>

  {/* Body */}
  <div className="kanban-columns kanban-columns-body">
    {sortedColumns.map((column) => (
      <Column
        variant="body-only"
        // ... props
      />
    ))}
  </div>
</div>
```

**CSS**: Reused existing `.has-rows` class to enable `flex-direction: column` layout.

**Result**: Consistent header appearance for all views (with or without swimlanes).

### Card Hover Effects

**Default Behavior**: Cards had `transform: translateY(-2px)` and shadow change on hover.

**User Preference**: Removed movement and shadow to prevent distracting visual effects.

**Implementation**:
```css
/* kanban-canvas.css */
.kanban-card:hover {
  background: var(--kanban-card-hover-bg); /* Subtle background change only */
}
```

Removed:
- `transform: translateY(-2px);`
- `box-shadow: var(--kanban-card-shadow-hover);`

---

## 8. Troubleshooting

### "Invalid UUID" Errors After Migration

**Symptom**: `invalid input syntax for type uuid: "60"` in browser console.

**Root Cause**: The `boards` table still has integer IDs, but Kanban tables expect UUIDs.

**Solution**: Run the corrected migration `20260213_kanban_CORRECTED.sql` which:
- Converts `boards.id` from `bigint` → `UUID`
- Updates all dependent tables (board_sections, padlets, etc.)
- Recreates Kanban tables with UUID foreign keys

**Key Lessons Learned**:
1. The app uses `boards` table, not `canvases` (check `.from('boards')` in CanvasSetupPage.tsx)
2. PostgreSQL uses `bigint` for auto-increment IDs, not `integer`
3. RLS policies must be dropped before modifying columns they depend on
4. Dropping a column automatically drops its sequence (no need to `DROP SEQUENCE` separately)

### Verifying Migration Success

Run this query in Supabase SQL Editor:

```sql
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('boards', 'kanban_cards', 'kanban_columns', 'kanban_swimlanes')
  AND column_name IN ('id', 'canvas_id')
ORDER BY table_name, column_name;
```

Expected result: All should show `uuid` type.

---

## 9. Extended Implementation Details & Bug Fixes

### Kanban Migration: Integer to UUID

**Root Cause**: Legacy code used integer-based IDs (`card-123`), which conflicted with the relational UUID requirement in the new PostgreSQL schema.
**Resolution**: Migration `20260213_kanban_CORRECTED.sql` converted `boards.id` and all dependents to UUID. All frontend creation logic switched to `crypto.randomUUID()`.

### CamelCase vs Snake_case Mismatch
**Problem**: Frontend used `columnId`, DB used `column_id`. Spreading updates `{...updates}` sent invalid columns to Supabase.
**Solution**: Implemented `supabaseAdapter.ts` with `sanitizeCardPayload()` allowlist and explicit field mapping in `store.tsx`.

### Progress UI & Slider Fixes
- Card progress now shows for `0%` (visible gray track).
- Modal slider includes `@range-progress` CSS variable for blue fill feedback in all browsers.

### Card Top Strip Color wiring
- Switched to `.kanban-card-top-strip` element.
- Normalized color values before persistence (`color_id`).

### Multi-User Assignees
- Join table `kanban_card_assignees` allows multiple users per card.
- Adapter groups these into `card.assigned: string[]` on load.

### Gantt Milestone Support
- Mapped Kanban `task_type` -> Gantt `type` (`"milestone"`).
- **Monkey-patch**: Overrode `gantt.getTaskType` because the npm ES module had a broken stub.
- Forced `duration: 0` and `end_date = start_date` for milestones to ensure diamond rendering.

### Kanban Status & Grouping UX
- Added real `status` field (preset + custom).
- Enabled `Group by -> Status`.
- Refactored `Move to Column` context menu into nested submenus (`Row -> Column`) for scalability.

### Grouping UX Consolidation
- Moved grouping/filter controls under `Add Group` popup.
- Centralized filtering logic in `Board.tsx` to handle search + group-filter + sorting consistently.

---
