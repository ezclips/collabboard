# Post and Container Visual Unification Plan

## Goal

Make every post and container across all non-Drawing canvases look identical to the Drawing canvas shell:
rounded-xl card, thin top strip (colored or gray), edit pencil in strip, content below.

Drawing canvas is the **reference implementation**. It is already correct. It must not be touched.

---

## Reference Design (Drawing Canvas Shell)

This is the target look for ALL posts and containers everywhere:

```
┌─────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ✏️ │  ← top strip
│                                         │     14px post / 28px container / 10px if colored
│          [content area]                 │  ← p-3 post / p-2 container
│                                         │
└─────────────────────────────────────────┘
```

### Exact CSS spec (from DrawingLayout.tsx renderEmbeddable)

**Outer wrapper:**
- `rounded-xl` (12px)
- `bg-white` (or `cardColor` from metadata)
- `border border-gray-200`
- `overflow-hidden`
- `flex flex-col`
- NO shadow

**Top strip:**
- Full width, `flex-shrink-0`, `relative`
- Height: `10px` if `metadata.topStrip` color set, else `28px` container / `14px` post
- Background: `metadata.topStrip` color or `rgba(0,0,0,0.04)`
- Cursor: layout-specific (Drawing uses `cursor-grab`; others keep their own drag mechanism)

**Edit pencil button (in strip, right side):**
- Position: `absolute right-1.5 top-1/2 -translate-y-1/2`
- Size: `w-5 h-5` wrapper, `w-3 h-3` Pencil icon
- Style: `rounded flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-black/10 transition-colors`
- Visibility: controlled by parent via callback prop — NOT by shell
- Currently in Drawing: shown for containers only. **New rule: shown for BOTH posts and containers when parent provides `onEdit`**

**Expand/collapse button (in strip, left side — containers only):**
- Position: left side of strip
- Shown when container has children
- Controls expand/collapse of child content area
- This is a local UI action — no permission gating required

**Content area:**
- Post: `flex-1 overflow-hidden p-3`
- Container: `overflow-hidden p-2`

---

## Two Container Types

The outer shell is identical for both types. The difference is internal content rendering.

### Type A: Inline/Expanded Container (RowColumnContainerCard)
- Renders full child posts inline inside the content area
- Used in: Row/Grid, Timeline, Drawing (via AutoHeightContainer)
- Has expand/collapse toggle when `childPadlets.length > 2`
- Expanded state: scrollable list of all children fully rendered
- Collapsed state: truncated view with `{n} items` count badge

### Type B: Wall Compact Container (WallContainerCard)
- Shows preview with fixed `max-h` constraint
- Used in: Wall canvas
- Has expand/collapse toggle affecting `max-h` limits
- Always shows child count badge at bottom

**Rule:** The shared shell wraps BOTH types identically on the outside.
The shell does not know or care which container type is inside.
The internal content area renders whichever container type the layout requires.

---

## Scope

### Included layouts (migrate to Drawing look):
- Wall (closest to reference — migrate first)
- Row/Grid
- Timeline
- Freeform

### Explicitly excluded:
- **Drawing** — this is the reference. Zero modifications to DrawingLayout.tsx.
- **Map** — uses popup-based rendering and separate interaction model. Migrate only after shell is proven stable.

---

## Non-Negotiable Constraints

### DO change:
- Outer wrapper markup (border, radius, shadow → none, background)
- Top strip markup (height, color, structure)
- Edit pencil button placement (move into strip for all layouts)
- Expand/collapse button placement (move into strip for containers)
- Content area padding to match reference
- Freeform card width (increase from 300px for YouTube embed quality)

### DO NOT change:
- Save flow
- Placement flow
- Delete/reinsert flow
- Canvas click behavior after editing
- Drag/drop decisions or drag mechanism
- Editor open routing
- Section/container assignment logic
- Parent/child linkage persistence
- Any Excalidraw code

### DO NOT TOUCH these files:
- `components/collabboard/canvas/layouts/DrawingLayout.tsx`
- `hooks/canvas/usePadletSave.ts`
- Any Supabase/API files

---

## Role and Permission Rules for Edit Pencil Button

The shell is permission-blind. It never checks roles.

### Permission flow:

```
CanvasClient.tsx
  → resolves currentWorkspaceRole
  → computes canEdit = canEditWorkspace(role)
  → passes onEditPadlet callback ONLY if canEdit is true
    → Layout component (RowLane, WallCanvas, FreeformPadletCards, etc.)
      → passes onEdit callback to CardShell ONLY if received from parent
        → CardShell renders pencil ONLY if onEdit prop exists
```

### What each role sees:

| Action | Owner/Admin/Member | Read-only/Viewer |
|---|---|---|
| Edit pencil | Visible (onEdit callback provided) | Hidden (onEdit is undefined) |
| Expand/collapse | Visible (local UI, no permission needed) | Visible (local UI) |
| Context menu | Visible with full actions | Visible with read-only actions only |
| Drag | Enabled | Disabled (parent does not attach drag handlers) |

### Current gap to fix:
`RowLane.tsx` does NOT pass `onEditContainer` to `RowColumnContainerCard` even though the prop exists. This must be fixed during Row/Grid migration by threading the callback through when `isEditable` is true.

### Forbidden in shell:
The shell must NEVER import or reference: `canEditWorkspace`, `useWorkspaceRole`, `currentWorkspaceRole`, or any permission hook.

---

## Freeform Width Change

### Problem
Current freeform cards use `width: 300px` fixed. YouTube thumbnails render poorly at this width.

### Solution
Increase freeform card width to `360px` (or `400px` — test with YouTube embeds to decide).

### Rules
- Change ONLY in `FreeformPadletCards.tsx`
- Change the inline style `width: '300px'` and the fallback `padlet.width || 300`
- If padlet has a stored `width` in metadata, respect it over default
- Do NOT change Drawing embeddable widths (Excalidraw-controlled)
- Do NOT change Row/Grid/Wall card widths (layout-controlled via grid/flex)

---

## Shell Props Contract

One component for both posts and containers:

```typescript
interface CardShellProps {
  // Identity
  padletId: string;
  testId?: string;

  // Visual
  topStripColor?: string | null;    // metadata.topStrip or null
  cardColor?: string;               // metadata.cardColor or '#ffffff'
  isContainer: boolean;             // controls strip height and content padding
  className?: string;               // escape hatch for layout-specific needs

  // Edit button (permission-gated by parent)
  onEdit?: () => void;              // if provided → pencil shows; if undefined → hidden

  // Container expand/collapse (no permission gating)
  onExpandToggle?: () => void;      // container only: if provided → expand button shows
  isExpanded?: boolean;             // container only: current expand state

  // Events (shell emits, parent handles)
  onContextMenu?: (e: React.MouseEvent) => void;

  // Content
  children: React.ReactNode;
}
```

**Forbidden props:** No `role`, `permissionLevel`, `canEdit`, `isReadOnly`, `userId`, or any persistence callback.

---

## File-by-File Isolation Boundary

### Files to CREATE

| File | Purpose | May contain |
|---|---|---|
| `components/collabboard/shells/CardShell.tsx` | Single shared shell for posts AND containers | Visual markup, slot-based, callback props only |

One component, not two. `isContainer` prop controls strip height and content padding.

### Files to MODIFY (visual markup only)

| File | What changes | What must NOT change |
|---|---|---|
| `FreeformPadletCards.tsx` | Outer card wrapper → CardShell, width 300→360+ | Canvas click behavior, save flow, dnd-kit drag, editor routing |
| `ColumnsCanvasRow.tsx` | Outer card wrapper → CardShell | Section logic, placement, drag, edit callbacks |
| `RowColumnContainerCard.tsx` | Remove own outer shell markup, become content-only inside CardShell | Expand/collapse state, child rendering, drop zone logic |
| `WallContainerCard.tsx` | Outer wrapper → CardShell | Expand/collapse max-h, wall ordering, placement |
| `ChronoTimelineCanvas.tsx` | Post/container card wrapper → CardShell | Timeline ordering, chronology, placement |

### Files to MODIFY (permission threading)

| File | What changes | What must NOT change |
|---|---|---|
| `RowLane.tsx` | Pass `onEditContainer` when `isEditable` | Row layout logic, section assignments |
| `CanvasClient.tsx` | Ensure `canEdit` is threaded to all layout paths | Role resolution, workspace fetch |

### Files that MUST NOT be modified

| File | Reason |
|---|---|
| `DrawingLayout.tsx` | Reference implementation; Excalidraw owns rendering |
| `usePadletSave.ts` | Persistence — outside visual scope |
| `PostCardContent.tsx` | Inner content renderer — not a shell concern |
| Any Supabase/API files | Persistence — outside visual scope |

---

## Import Boundary Rule (Lint-Level)

CardShell.tsx must NEVER import:

```
@supabase/...
usePadletSave
useCanvasStore
usePadletStore
useWorkspaceRole
canEditWorkspace
any database client
any API route handler
```

If any of these appear in the shell file, the isolation boundary has been violated.

---

## Migration Phases

### Phase 0: Create CardShell component

Create `components/collabboard/shells/CardShell.tsx` matching the Drawing reference spec exactly.

**What to build:**
- Outer div: `rounded-xl bg-white border border-gray-200 overflow-hidden flex flex-col`
- Top strip div: height based on `isContainer` and `topStripColor`
- Edit pencil button: rendered if `onEdit` prop exists
- Expand/collapse button: rendered if `onExpandToggle` prop exists (left side of strip)
- Content area div: `flex-1 overflow-hidden p-3` for posts, `overflow-hidden p-2` for containers
- `children` slot in content area

**Acceptance gate:**
- CardShell renders identically to Drawing's renderEmbeddable outer wrapper in isolation
- Zero persistence/state imports
- Works for both `isContainer: true` and `isContainer: false`

**Lint check:** Verify no forbidden imports.

### Phase 1: Wall migration (smallest visual delta)

Wall already uses `rounded-xl` and `border-gray-200`. Closest to reference.

**Target:** `WallContainerCard.tsx`
- Replace outer wrapper with CardShell
- Drop `shadow-md` / `hover:shadow-lg`
- Move expand/collapse button into strip via `onExpandToggle` / `isExpanded`
- Keep wall `max-h` constraints inside content area (not in shell)
- Thread `onEdit` from parent if user has edit permission

**Regression checks:**
- Wall container expand/collapse works
- Wall post renders correctly
- Wall container child count shows
- Wall ordering unchanged
- Wall placement unchanged
- Context menu works
- Read-only user sees no pencil
- Editor user sees pencil in strip

**Rollback:** Revert WallContainerCard.tsx only.

### Phase 2: Row/Grid migration

**Targets:** `ColumnsCanvasRow.tsx`, `RowColumnContainerCard.tsx`, `RowLane.tsx`
- Replace outer card wrapper in ColumnsCanvasRow with CardShell
- Drop `rounded-2xl` → gets `rounded-xl` from shell
- Drop `shadow-xl` / `hover:shadow-2xl`
- Drop `border-gray-300/80` → gets `border-gray-200` from shell
- RowColumnContainerCard: strip own outer shell, become content-only inside CardShell
- RowLane.tsx: **fix** — pass `onEditContainer` callback when `isEditable` is true
- Move edit button from absolute top-right into strip via `onEdit`
- Both container types (Type A inline) work correctly inside shell

**Regression checks:**
- Row/grid layout unchanged
- Container Type A expand/collapse works
- Child posts render inside container
- Drag/drop between containers works
- Section assignments unchanged
- Edit button respects permission
- New posts save correctly

**Rollback:** Revert ColumnsCanvasRow.tsx, RowColumnContainerCard.tsx, RowLane.tsx.

### Phase 3: Timeline migration

**Target:** `ChronoTimelineCanvas.tsx`
- Post/container card wrappers → CardShell
- Timeline ordering logic stays untouched
- Timeline placement behavior stays untouched

**Regression checks:**
- Timeline chronological order correct
- Timeline placement unchanged
- Posts/containers visually match reference
- Expand/collapse works for containers

**Rollback:** Revert ChronoTimelineCanvas.tsx only.

### Phase 4: Freeform migration (most behavioral risk)

**Target:** `FreeformPadletCards.tsx`
- Replace outer card div with CardShell
- Drop `shadow-lg` / `hover:shadow-xl` / `shadow-2xl`
- `rounded-lg` → gets `rounded-xl` from shell
- Remove `ring-2 ring-blue-500` selected state — replace with shell `className` override for selection ring
- **Change width** from `300px` to `360px` (test YouTube embeds; may go to `400px`)
- Keep dnd-kit drag on outer wrapper — CardShell `className` prop for drag handle classes
- Keep `zIndex` logic for selected cards via `className`/`style`
- Do NOT change freeform click-to-place behavior
- Do NOT change freeform editor close behavior and canvas click behavior

**Freeform behavior variant rule:**
After editing, clicking canvas keeps the post on canvas. This MUST still work after migration.
If it breaks, revert immediately — do not attempt to fix placement behavior in the same change.

**Regression checks:**
- Freeform post stays on canvas after edit (CRITICAL)
- YouTube thumbnails render at improved width
- Drag/drop works
- Selected card highlight works (via className)
- **Arrow binding still correct** (see Arrow Binding section below)
- Canvas click behavior unchanged
- Right-click context menu works
- Read-only user sees no pencil
- Editor user sees pencil in strip

**Rollback:** Revert FreeformPadletCards.tsx only.

---

## Dangerous Logic Boundaries — DO NOT CROSS

These functions/patterns must not be modified, moved, or called by the shell:

```
setPadletToEdit(...)
closeEditor()
createRealPostFromDraft(...)
handleDrawingLayoutAddPadletWithContainerCheck(...)
onDropDraftIntoContainer(...)
onDropExistingPadlet(...)
canEditWorkspace(...)          ← parent calls this, not shell
updateScene(...)               ← Excalidraw only
padlet://... link resolution   ← Drawing only
```

If shell code references any of these, the isolation has been violated.

---

## Freeform Arrow Binding Dependency

The freeform canvas has an arrow/connector system (`FreeformGraphLayer.tsx` + `lib/graph/edgeRouting.ts`) that calculates connection lines between cards. This took considerable effort to get right.

### How arrows measure cards
- `FreeformGraphLayer` finds cards via `[data-padlet-id]` selector
- Measures actual rendered dimensions using `getBoundingClientRect()`
- Feeds `{ x, y, width, height }` rect to `edgeRouting.ts`
- Arrow endpoints calculated via ray-exit-from-center intersection with card border

### What arrows do NOT depend on
- CSS class names, border radius, shadow — pure visual, never enters math
- Component hierarchy or div nesting depth

### What arrows DO depend on
- `data-padlet-id` attribute on the outermost card element (measurement selector)
- Actual rendered width/height (from `getBoundingClientRect()`)
- `firstElementChild` fallback heuristic: if outer wrapper has zero/tiny size, arrows try the first child element

### Why shell migration is safe
- `CardShell` must put `data-padlet-id` on its outer div → measurement continues to work
- Arrows auto-recalculate via `ResizeObserver` + `MutationObserver` → width change from 300→360 triggers recalc
- Shell outer div will always be ≥ inner content → `firstElementChild` fallback heuristic still correct

### Mandatory rule for CardShell
The outer div of `CardShell` MUST include `data-padlet-id={padletId}`. If this is missing, arrow binding breaks silently (arrows won't connect to the card).

### Mandatory regression check
After freeform migration: drag a connected card, verify arrow endpoints track the card border with no jump or offset. Test at multiple zoom levels.

---

## Rollback Strategy

Each phase is independently revertable:

- Phase 0: Delete CardShell.tsx
- Phase 1: Revert WallContainerCard.tsx
- Phase 2: Revert ColumnsCanvasRow.tsx, RowColumnContainerCard.tsx, RowLane.tsx
- Phase 3: Revert ChronoTimelineCanvas.tsx
- Phase 4: Revert FreeformPadletCards.tsx

No phase depends on a previous phase's file changes (all consume CardShell independently).
If regression detected in any phase, revert ONLY that phase's files.

---

## Done When

- [ ] All non-Drawing posts use CardShell: `rounded-xl`, `border border-gray-200`, no shadow, top strip
- [ ] All non-Drawing containers use CardShell with 28px strip, expand button, edit pencil
- [ ] Both container types (inline + wall-compact) render correctly inside shared shell
- [ ] Edit pencil appears in strip for all layouts, gated by parent permission callback
- [ ] Freeform cards render at improved width with better YouTube embed quality
- [ ] No layout/render/save/placement logic regression in any layout
- [ ] No permission regression (read-only users cannot access edit)
- [ ] Freeform-vs-other behavior split remains intact
- [ ] DrawingLayout.tsx has exactly zero modifications
- [ ] CardShell.tsx has zero persistence/permission imports