# Task Checklist: Visual Unification to Drawing Canvas Look

## Hard Rules (check before EVERY phase)

- [ ] DrawingLayout.tsx has ZERO modifications
- [ ] CardShell.tsx has ZERO persistence/state/permission imports
- [ ] No save flow logic changed
- [ ] No placement flow logic changed
- [ ] No delete/reinsert behavior changed
- [ ] No drag mechanism changed (each layout keeps its own)
- [ ] No editor routing changed
- [ ] Freeform click-to-place-on-canvas behavior is intact
- [ ] Non-freeform placement/delete behavior is intact
- [ ] Edit pencil visibility is parent-controlled via callback, not shell-computed

---

## Phase 0: Create CardShell Component

### Build
- [ ] Create `components/collabboard/shells/CardShell.tsx`
- [ ] Outer div: `rounded-xl bg-white border border-gray-200 overflow-hidden flex flex-col`
- [ ] Support `cardColor` prop for background override
- [ ] Top strip: height `10px` (colored) / `28px` (container) / `14px` (post)
- [ ] Top strip: background from `topStripColor` or `rgba(0,0,0,0.04)` fallback
- [ ] Edit pencil button: render ONLY if `onEdit` prop provided
- [ ] Pencil position: `absolute right-1.5 top-1/2 -translate-y-1/2`
- [ ] Pencil size: `w-5 h-5` wrapper, `w-3 h-3` icon
- [ ] Expand/collapse button: render ONLY if `onExpandToggle` prop provided (left side of strip)
- [ ] Content area: `flex-1 overflow-hidden p-3` for posts
- [ ] Content area: `overflow-hidden p-2` for containers
- [ ] `children` slot in content area
- [ ] `className` escape hatch prop
- [ ] `onContextMenu` event prop
- [ ] `testId` prop → `data-testid`
- [ ] `padletId` prop → `data-padlet-id`

### Validate
- [ ] Renders identically to Drawing's renderEmbeddable wrapper (visual comparison)
- [ ] Works with `isContainer: false` (post mode)
- [ ] Works with `isContainer: true` (container mode)
- [ ] Works with `topStripColor` set (colored strip, 10px)
- [ ] Works with `topStripColor` null (gray strip, height by type)
- [ ] Pencil hidden when `onEdit` is undefined
- [ ] Pencil visible when `onEdit` is provided
- [ ] Expand button hidden when `onExpandToggle` is undefined
- [ ] Expand button visible when `onExpandToggle` is provided

### Lint Check
- [ ] No import of `@supabase`
- [ ] No import of `usePadletSave`
- [ ] No import of `useCanvasStore`
- [ ] No import of `usePadletStore`
- [ ] No import of `useWorkspaceRole` or `canEditWorkspace`
- [ ] No import of any database client or API handler

---

## Phase 1: Wall Migration

### Modify
- [ ] `WallContainerCard.tsx` — replace outer wrapper with CardShell
- [ ] Drop `shadow-md` and `hover:shadow-lg`
- [ ] Move expand/collapse into strip via `onExpandToggle` + `isExpanded`
- [ ] Keep wall `max-h` / `min-h` constraints INSIDE content area, not in shell
- [ ] Thread `onEdit` from parent only if user has edit permission
- [ ] Keep wall ordering logic untouched
- [ ] Keep wall placement logic untouched

### Regression: Wall Posts
- [ ] Post renders with correct content
- [ ] Post has rounded-xl border, no shadow
- [ ] Post has 14px gray top strip (or 10px colored)
- [ ] Edit pencil in strip for edit-role users
- [ ] No pencil for read-only users
- [ ] Context menu works
- [ ] Content matches before/after

### Regression: Wall Containers (Type B: Compact)
- [ ] Container renders with 28px strip
- [ ] Expand/collapse button in strip works
- [ ] Child count badge still shows
- [ ] Max-height constraint still works in collapsed state
- [ ] Children render correctly when expanded
- [ ] Edit pencil in strip for edit-role users
- [ ] No pencil for read-only users

### Regression: Wall General
- [ ] Wall ordering unchanged after refresh
- [ ] Wall placement of new posts unchanged
- [ ] Wall container actions (add child, remove) unchanged
- [ ] Refresh shows persisted content correctly

---

## Phase 2: Row/Grid Migration

### Modify
- [ ] `ColumnsCanvasRow.tsx` — replace outer card wrapper with CardShell
- [ ] Drop `rounded-2xl` (now `rounded-xl` from shell)
- [ ] Drop `shadow-xl` and `hover:shadow-2xl`
- [ ] Drop `border-gray-300/80` (now `border-gray-200` from shell)
- [ ] Drop `min-h-[160px]` from shell (move to content area if needed)
- [ ] `RowColumnContainerCard.tsx` — strip outer shell markup, become content-only
- [ ] Move edit button from `absolute top-3 right-3` into strip via `onEdit`
- [ ] `RowLane.tsx` — **FIX**: pass `onEditContainer` to RowColumnContainerCard when `isEditable`

### Regression: Row/Grid Posts
- [ ] Post renders with correct content
- [ ] Post has rounded-xl border, no shadow
- [ ] Post has top strip
- [ ] Edit pencil in strip for edit-role users
- [ ] No pencil for read-only users

### Regression: Row/Grid Containers (Type A: Inline)
- [ ] Container renders with 28px strip
- [ ] Expand/collapse in strip (when `childPadlets.length > 2`)
- [ ] Expanded: full child list scrollable
- [ ] Collapsed: truncated with `{n} items` count
- [ ] Edit pencil in strip for edit-role users
- [ ] No pencil for read-only users
- [ ] onEditContainer callback now properly threaded from RowLane

### Regression: Row/Grid General
- [ ] Section assignments unchanged
- [ ] Drag/drop between containers works
- [ ] Child posts render inside container
- [ ] Add post to container works
- [ ] Save and refresh works
- [ ] New post placement unchanged

---

## Phase 3: Timeline Migration

### Modify
- [ ] `ChronoTimelineCanvas.tsx` — post/container wrappers → CardShell
- [ ] Keep timeline chronological ordering untouched
- [ ] Keep timeline placement behavior untouched
- [ ] Keep timeline expand/collapse behavior untouched

### Regression: Timeline
- [ ] Chronological order correct
- [ ] Placement of new posts unchanged
- [ ] Posts have rounded-xl, no shadow, top strip
- [ ] Containers have 28px strip with expand/collapse
- [ ] Edit pencil gated by permission
- [ ] Expand/collapse works for containers
- [ ] Refresh and persistence unchanged

---

## Phase 4: Freeform Migration

### Modify
- [ ] `FreeformPadletCards.tsx` — replace outer card div with CardShell
- [ ] Drop `shadow-lg` / `hover:shadow-xl` / `shadow-2xl`
- [ ] Drop `rounded-lg` (now `rounded-xl` from shell)
- [ ] Replace `ring-2 ring-blue-500` selected state with shell `className` override
- [ ] **Change width** from `300px` to `360px` (or `400px` — test YouTube embeds)
- [ ] Update fallback: `padlet.width || 360` (match new default)
- [ ] Keep dnd-kit drag — attach via CardShell `className` prop
- [ ] Keep `zIndex` logic for selected cards via `className`/`style`
- [ ] DO NOT change canvas click-to-place behavior
- [ ] DO NOT change editor close behavior

### Regression: Freeform Posts (CRITICAL — behavior variant)
- [ ] **Post stays on canvas after edit** (MOST IMPORTANT CHECK)
- [ ] **Canvas click after edit does NOT remove post**
- [ ] YouTube thumbnails render at improved width
- [ ] Image content renders correctly at new width
- [ ] Text content renders correctly at new width
- [ ] Drag/drop works
- [ ] Selected card has visible highlight
- [ ] Context menu works
- [ ] Edit pencil in strip for edit-role users
- [ ] No pencil for read-only users

### Regression: Freeform Containers
- [ ] Container renders with 28px strip
- [ ] Expand/collapse works
- [ ] Children render inside container
- [ ] Edit pencil gated by permission

### Regression: Arrow Binding Math (CRITICAL)
- [ ] `data-padlet-id` attribute is on CardShell outer div (measurement selector depends on this)
- [ ] Arrows connect to card edges correctly after shell migration
- [ ] Drag a connected card — arrow endpoints track the card border, no jump or offset
- [ ] Arrow recalculates when card resizes to new width (300→360)
- [ ] FreeformGraphLayer `firstElementChild` fallback still picks correct rect (outer shell ≥ inner content)
- [ ] Overlapping connected cards — arrows still route correctly
- [ ] Zoom in/out — arrows remain aligned to card edges
- [ ] Comment post arrows still work (fallback measurement chain)

### Regression: Freeform General
- [ ] New post creation works
- [ ] Save persistence works
- [ ] Multiple cards on canvas render correctly
- [ ] Overlapping cards z-index works
- [ ] Refresh loads all cards at correct positions

---

## Permission Verification (run after ALL phases)

### Read-only / Viewer role
- [ ] No edit pencil visible on any layout
- [ ] Expand/collapse still works (local UI action)
- [ ] Context menu shows read-only actions only
- [ ] Cannot drag posts
- [ ] Cannot trigger any mutating action from shell

### Member / Editor role
- [ ] Edit pencil visible in strip on all layouts
- [ ] Clicking pencil opens correct editor
- [ ] Edit pencil works for both posts and containers
- [ ] All other edit actions still work

### Owner / Admin role
- [ ] Same as member plus admin context menu actions

---

## Both Container Types Verification

### Type A: Inline Container (RowColumnContainerCard)
- [ ] Renders inside CardShell correctly in Row/Grid
- [ ] Renders inside CardShell correctly in Timeline
- [ ] Expand/collapse toggle in strip works
- [ ] Full child list visible when expanded
- [ ] `{n} items` count when collapsed
- [ ] Edit pencil in strip

### Type B: Wall Compact Container (WallContainerCard)
- [ ] Renders inside CardShell correctly in Wall
- [ ] Max-height constraint works in content area
- [ ] Expand/collapse toggle in strip works
- [ ] Child count badge visible
- [ ] Edit pencil in strip

---

## Final Acceptance

- [ ] All non-Drawing posts: `rounded-xl`, `border border-gray-200`, no shadow, top strip
- [ ] All non-Drawing containers: same shell, 28px strip, expand + pencil buttons
- [ ] Both container types work inside shared shell
- [ ] Edit pencil in strip, gated by parent permission
- [ ] Freeform width improved, YouTube embeds render well
- [ ] Zero layout/save/placement regressions
- [ ] Zero permission regressions
- [ ] Freeform-vs-other behavior split intact
- [ ] DrawingLayout.tsx unchanged
- [ ] CardShell.tsx has zero forbidden imports
- [ ] Backups can be deleted: `post-container-visual-unification-plan.backup.md`, `task.backup.md`