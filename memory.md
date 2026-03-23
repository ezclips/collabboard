# Session Memory

Date: 2026-03-10

## Main outcome

Implemented workspace-aware permission normalization for the live collabboard stack and propagated readonly behavior into the active canvas UI surfaces.

## Backend and data model changes

- Added workspace-scoping migrations:
  - `supabase/migrations/20260309_normalize_workspace_roles.sql`
  - `supabase/migrations/20260309_scope_boards_and_folders_to_workspaces.sql`
  - `supabase/migrations/20260309_scope_collabboard_canvases_to_workspaces.sql`
- Normalized workspace roles around `owner`, `admin`, `member`, and `readonly`.
- Scoped boards, folders, and collabboard canvases to explicit workspaces.
- Updated live collabboard API routes to resolve and enforce workspace-aware access:
  - `app/api/collabboard/canvases/route.ts`
  - `app/api/collabboard/canvases/[id]/route.ts`
  - `app/api/collabboard/canvases/[id]/sections/route.ts`
  - `app/api/collabboard/canvases/[id]/sections/[sectionId]/route.ts`
  - `app/api/collabboard/canvases/[id]/collaborators/route.ts`
  - `app/api/collabboard/canvases/[id]/comments/route.ts`
  - `app/api/collabboard/canvases/[id]/comments/[commentId]/route.ts`
  - `app/api/collabboard/canvases/[id]/comments/[commentId]/replies/route.ts`

## Canvas permission work

- Central edit gate is `canUseFreeformEditButton` in `app/dashboard/canvas/[id]/CanvasClient.tsx`.
- Propagated that gate through active layouts so readonly users no longer receive edit callbacks or mutation UI.

### Freeform

- `components/collabboard/canvas/ui/FreeformPadletCards.tsx`
  - Only passes toolbar openers when editing is allowed.
- `components/collabboard/CardPreview.tsx`
  - Hides the small edit button unless an edit toolbar callback exists.

### Wall

- `components/canvas/WallCanvas.tsx`
  - Gates container edit buttons and mutation context-menu actions on `isEditable`.

### Map

- `components/map/MapCanvas.tsx`
  - Added explicit edit capability flow for map posts.
- `components/map/PostPopup.tsx`
  - Gates edit, child-post edit, delete, color change, and location edit actions behind `canEdit`.

### Drawing

- `components/collabboard/canvas/layouts/DrawingLayout.tsx`
  - Now driven by the workspace readonly flag passed from `CanvasClient.tsx`.

### Timeline / Chrono

- `components/canvas/ChronoTimelineCanvas.tsx`
  - Defaults to non-editable unless explicitly enabled.
  - Gates hover edit buttons, plus insert controls, date-label menus, rename/date dialogs, container drops, and mutation context-menu actions.

### Scheduler

- `components/canvas/StandaloneSchedulerCanvas.tsx`
  - Added `readOnly` prop.
  - Disables drag/resize, slot creation, event editing, mutation context-menu actions, and external mutation drops in readonly mode.

### Columns

- `components/canvas/layouts/ColumnsLayout.tsx`
  - Added `isEditable` prop and disables DnD handlers when false.
- `components/canvas/layouts/ColumnsCanvasRow.tsx`
  - Hides section menu, rename button, add-container button, edit buttons, child-post edit entry points, drag behavior, and mutation menu actions in readonly mode.

### Row / Grid

- `components/collabboard/row/RowCanvasDnD.tsx`
  - Added `isEditable` prop and disables DnD handlers when false.
- `components/collabboard/row/RowLane.tsx`
  - Hides section menu, quick-add controls, edit buttons, drag behavior, child-post edit entry points, and mutation actions in readonly mode.

## Validation status

Validated clean after the permission changes:

- `components/collabboard/CardPreview.tsx`
- `components/map/MapCanvas.tsx`
- `components/map/PostPopup.tsx`
- `components/canvas/WallCanvas.tsx`
- `components/canvas/ChronoTimelineCanvas.tsx`
- `components/canvas/StandaloneSchedulerCanvas.tsx`
- `components/canvas/layouts/ColumnsLayout.tsx`
- `components/canvas/layouts/ColumnsCanvasRow.tsx`
- `components/collabboard/row/RowCanvasDnD.tsx`
- `components/collabboard/row/RowLane.tsx`

## Known remaining issues

- `app/dashboard/canvas/[id]/CanvasClient.tsx` still has many unrelated pre-existing type errors.
- `components/collabboard/canvas/ui/FreeformPadletCards.tsx` has pre-existing type issues unrelated to the last permission-gating change.
- Runtime readonly verification could not be completed because the local app only exposed the landing page publicly and there was no accessible public canvas/demo route.

## Next sensible step

- If an authenticated readonly canvas URL is available, run a real UI verification pass across freeform, wall, map, drawing, chrono, scheduler, columns, and row/grid.