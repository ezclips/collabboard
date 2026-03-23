# Kanban Virtualization Spike (#5)

Date: 2026-02-17
Status: **Fail (for current architecture)**
Decision: Use **column-level pagination** fallback for Phase 3.2/3.3.

## Scope
Evaluate whether `react-window` can be integrated with the current kanban board while preserving reliable `dnd-kit` behavior (drag ghost, drop targets, cross-column moves).

## Current Architecture Constraints
- Drag-and-drop uses `@dnd-kit/core` with `closestCorners` collision detection in `Board.tsx`.
- Card sorting uses `SortableContext` + `useSortable` (`Column.tsx`, `DraggableCard.tsx`).
- Columns and rows create a 2D board layout (column x swimlane cells), not a single 1D list.
- Cards have variable visual height (description clamp, optional cover image, badges, metadata), so fixed row virtualization is inaccurate.

## Spike Findings
1. `react-window` unmounts off-screen rows/items, but `dnd-kit` collision/over targets depend on mounted droppables.
2. With virtualized cards, many valid drop targets are absent from DOM during drag, producing incorrect `over` resolution.
3. Existing `closestCorners` strategy is not virtualization-aware; a custom collision strategy would be required.
4. Variable card heights mean `FixedSizeList` is not suitable; `VariableSizeList` would require continuous height measurement and cache invalidation during card edits/attachments.
5. Combining 2D board + row swimlanes + cross-column dragging with virtualized inner lists significantly increases complexity and regression risk.

## Decision
Treat virtualization as **not feasible right now** without a substantial DnD redesign.

## Recommended Fallback (Phase 3 path)
Implement **column-level pagination** instead:
- Load/render first `N` cards per column cell (e.g. 50).
- Add “Show more” per column/cell.
- Keep all rendered cards fully compatible with existing `dnd-kit` behavior.
- If drop lands into a column with partial data loaded, optimistically insert at position `0` and reconcile order after fetch.

## Why this is safer
- Preserves existing drag model and `SortableContext` assumptions.
- Lower implementation complexity than virtualization-aware collision + dynamic measurement.
- Good enough performance improvement for 500+ cards without destabilizing drag/drop.
