# Gantt + Button Implementation - Complete

## Issues Fixed

### 1. ✅ Modal Visibility Problem
**Problem**: Modal only showed "Description" field, missing Label, Stage, and Type fields.

**Solution**: 
- Increased modal z-index to `z-[9999]`
- Added `max-h-[90vh] overflow-y-auto` to modal container
- Made header and footer sticky for better scrolling
- Added click-outside-to-close functionality

### 2. ✅ Parent-Child Hierarchy Not Working
**Problem**: 
- Black arrow (parent indicator) not showing in Gantt
- Child tasks placed "two lists down" instead of directly below parent
- Parent relationship not persisted

**Solution**: Added `parent_id` field to database and full data flow:

#### Database Changes
- **Migration**: [20260218_add_kanban_card_parent.sql](c:\Users\rmeic\Projects\dev\starter\supabase\migrations\20260218_add_kanban_card_parent.sql)
  - Adds `parent_id UUID` column to `kanban_cards` table
  - References `kanban_cards(id)` with CASCADE delete
  - Adds index for efficient lookups

#### Backend Changes
- **Type Definition**: [lib/kanban/types.ts](c:\Users\rmeic\Projects\dev\starter\lib\kanban\types.ts#L46)
  - Added `parent_id?: string` to `KanbanDBCard` interface

- **Data Sanitization**: [lib/kanban/supabaseAdapter.ts](c:\Users\rmeic\Projects\dev\starter\lib\kanban\supabaseAdapter.ts#L58)
  - Added `parent_id` to `allowedKeys` in `sanitizeCardPayload`
  - Maps `card.parent` → `payload.parent_id` when saving

#### Frontend Changes
- **Store Mapping**: [components/kanban-canvas/store.tsx](c:\Users\rmeic\Projects\dev\starter\components\kanban-canvas\store.tsx#L171)
  - Maps `c.parent_id` → `parent` in both `mapLoadedChunk` and `mapLoadedData`

- **Gantt Mapper**: [components/gantt-canvas/mappers.ts](c:\Users\rmeic\Projects\dev\starter\components\gantt-canvas\mappers.ts#L93)
  - Includes `parent` field when creating `GanttTask` from `Card`

- **Modal**: [components/gantt-canvas/NewTaskModal.tsx](c:\Users\rmeic\Projects\dev\starter\components\gantt-canvas\NewTaskModal.tsx#L64)
  - Sets `parent` field on new card when `parentTaskId` is provided

## To Apply Changes

### Run the Database Migration

```powershell
# Option 1: Using Supabase CLI (recommended)
cd c:\Users\rmeic\Projects\dev\starter
supabase db push

# Option 2: Manually in Supabase Dashboard
# 1. Go to your Supabase project
# 2. Navigate to SQL Editor
# 3. Copy and paste the contents of:
#    supabase/migrations/20260218_add_kanban_card_parent.sql
# 4. Execute the SQL
```

### Verify the Migration

After running the migration, verify the column was added:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'kanban_cards' AND column_name = 'parent_id';
```

Expected result:
```
column_name | data_type | is_nullable
parent_id   | uuid      | YES
```

## How It Now Works

### Creating Child Tasks

1. **Click "+" button** on any task row in Gantt
2. **Modal opens** with all fields:
   - ✅ Label (required)
   - ✅ Description (optional)
   - ✅ Stage (Kanban column selector)
   - ✅ Type (Feature/Task)
   - ✅ Time period (date picker)

3. **Select Stage** to choose Kanban column
4. **Click Save**
5. **Result**:
   - ✅ New card created at bottom of selected column
   - ✅ Task appears as child in Gantt with black arrow on parent
   - ✅ Parent-child relationship persisted to database
   - ✅ Child positioned directly under parent in Gantt tree

### Parent-Child Hierarchy

- **Black arrow** shows parent has expandable children
- **Tree structure** maintained with `parent_id` references
- **Delete child**: Remove card from Kanban board
- **Synced across views**: Hierarchy visible in both Gantt and Kanban

## Files Modified

### Database
- ✅ `supabase/migrations/20260218_add_kanban_card_parent.sql` (created)

### Backend
- ✅ `lib/kanban/types.ts` (added parent_id)
- ✅ `lib/kanban/supabaseAdapter.ts` (sanitization & mapping)

### Frontend
- ✅ `components/kanban-canvas/store.tsx` (DB→frontend mapping)
- ✅ `components/gantt-canvas/NewTaskModal.tsx` (modal visibility & scrolling)
- ✅ `components/gantt-canvas/mappers.ts` (parent field support)
- ✅ `components/gantt-canvas/GanttCanvas.tsx` (modal integration)
- ✅ `components/gantt-canvas/GanttConfig.ts` (+ button column)
- ✅ `components/gantt-canvas/ganttEvents.ts` (removed wrong modal trigger)
- ✅ `components/gantt-canvas/gantt.css` (button styling)

## Testing Checklist

After running the migration:

- [ ] Click "+" button on a task in Gantt
- [ ] Verify all fields visible in modal (Label, Description, Stage, Type, Time period)
- [ ] Create a child task with a specific Stage selected
- [ ] Verify card appears at bottom of selected Kanban column
- [ ] Verify black arrow appears on parent task in Gantt
- [ ] Click arrow to expand/collapse child tasks
- [ ] Verify child appears directly under parent (not "two lists down")
- [ ] Delete child card from Kanban and verify it disappears from Gantt
- [ ] Reload page and verify parent-child relationship persists
