---
name: Freeform Graph Edge Routing
description: Guidelines and math for rendering arrow lines between nodes in the Freeform canvas, including context menu, gap logic, coordinate systems, and label boxes.
---

# Freeform Graph Edge Routing

## Overview
Edge routing uses pure center-to-center ray geometry. Every arrow points directly at the center of each connected card. No external library — just a ray-rect intersection + offset.

## Core Architecture

### 1. Center-to-Center Ray (`edgeRouting.ts`)
- Arrows go from center of source to center of target
- `rayExitFromCenter(rect, target)` → exact border exit point
- Visible line starts/ends `gap` px outside each border, along the ray
- **Close-card gap**: `effectiveGap = min(gap, availableGap/2)` — proportional, never hides arrows even when cards are close together. The old `hidden: true` threshold (`availableGap < gap * 2`) was removed because it silently suppressed arrows for nearby cards.

### 2. Coordinate System (`FreeformGraphLayer.tsx`)
- Rects measured via `getBoundingClientRect()` relative to scrollable container
- **Container padding subtracted** (`paddingLeft`, `paddingTop`) — fixes center offset
- **MutationObserver** watches `style`/`class` changes → rects update on drag (not just scroll/resize)
- **ResizeObserver** tracks card size changes
- **Zero-dimension fallback**: if a `data-padlet-id` wrapper reports 0×0 (e.g. card/icon posts whose inner wrapper uses `position: absolute`), the first child element is measured instead so arrows target the visible card center

### 3. Rendering
- **Path**: `M sx,sy L ex,ey` (straight line)
- **Arrowheads**: Rotated `<polygon>` (not SVG `<marker>`) → tip at `(0,0)`, body backward: `"-16,-8 0,0 -16,8"`
- **Hit area**: 12px transparent stroke behind visible 2px line → easy right-clicking
- **SVG layer**: `pointerEvents: 'none'` on SVG, but individual `<g>` groups override with `'auto'`

### 4. Label Box (movable along line)
- **Rendering**: `<foreignObject>` with styled `<div>` — white rounded box, shadow, border (matches line tool)
- **Position**: interpolated along the line at `t` (0→1), stored in `style.label_position`
- **Draggable**: `onMouseDown` sets `draggingLabel`, global `mousemove` projects cursor onto line via dot product, `mouseup` persists via `repo.upsertEdge()`
- **Clamped**: `t` stays between 0.05 and 0.95 so label never sits on a card

### 5. Context Menu (right-click)
- **Color** picker, **Style** (solid/dashed/dotted), **Label** (text + save), **Delete**
- Triggered via `onContextMenu` on each edge `<g>` wrapper
- Wrapper div in `CanvasClient.tsx` **must** have `pointerEvents: 'none'` — children override with `'auto'`

### 6. Layering (`CanvasClient.tsx`)
- Wrapper div: `z-index: 900`, `pointerEvents: 'none'` — transparent to clicks, arrows paint on top
- Posts underneath remain fully interactive
- Edge hit areas and label boxes opt in with `pointerEvents: 'auto'`

## Key Files
| File | Role |
|------|------|
| `lib/graph/edgeRouting.ts` | Ray-rect intersection, gap offset, hidden flag |
| `components/graph/FreeformGraphLayer.tsx` | SVG rendering, rect measurement, context menu, label drag |
| `app/dashboard/canvas/[id]/CanvasClient.tsx` | Edge creation, wrapper div with pointer-events layering |

---

## Supabase RLS — Critical Guardrails

### `freeform_graph_edges` policies must use simple ownership checks

The correct RLS policies gate access via `boards.user_id = auth.uid()` directly:

```sql
CREATE POLICY "Users can select freeform edges of their boards"
  ON freeform_graph_edges FOR SELECT
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid()));
-- same pattern for INSERT (WITH CHECK), UPDATE, DELETE
```

**Do NOT replace these with `can_access_board(board_id)`** unless you have verified that `boards.workspace_id` column exists in the DB. If `can_access_board()` runs and `boards.workspace_id` is missing, every read and write silently fails with code `42703` — no arrows are saved or displayed and no visible UI error appears (because `isMissingRelationError` in `graphRepo.ts` swallows errors whose message contains "does not exist").

### What broke it (2026-03-09 → 2026-03-14)

Migration `20260309_scope_boards_and_folders_to_workspaces.sql` was applied. It drops the simple policies and replaces them with `can_access_board()` variants. It also has `ALTER TABLE boards ADD COLUMN IF NOT EXISTS workspace_id` at the top. If that column addition fails or is skipped while the policy replacement succeeds, all freeform graph DB calls start returning `column "workspace_id" does not exist`.

### Recovery SQL

Run in Supabase SQL Editor to restore working policies:

```sql
DROP POLICY IF EXISTS "Users can select freeform edges of their boards" ON freeform_graph_edges;
DROP POLICY IF EXISTS "Users can insert freeform edges of their boards" ON freeform_graph_edges;
DROP POLICY IF EXISTS "Users can update freeform edges of their boards" ON freeform_graph_edges;
DROP POLICY IF EXISTS "Users can delete freeform edges of their boards" ON freeform_graph_edges;

CREATE POLICY "Users can select freeform edges of their boards"
  ON freeform_graph_edges FOR SELECT
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can insert freeform edges of their boards"
  ON freeform_graph_edges FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can update freeform edges of their boards"
  ON freeform_graph_edges FOR UPDATE
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid()));

CREATE POLICY "Users can delete freeform edges of their boards"
  ON freeform_graph_edges FOR DELETE
  USING (EXISTS (SELECT 1 FROM boards b WHERE b.id = board_id AND b.user_id = auth.uid()));
```

### Silent-failure trap in `graphRepo.ts`

`isMissingRelationError` catches any error whose message contains `"does not exist"` — not just missing-table errors (`42P01`). This means column errors (`42703`), policy function errors, etc. are all silently swallowed and `isTableUnavailable` is set to `true`, making all subsequent calls no-ops. When arrows stop appearing after a DB migration, always check the browser console for `[FreeformGraphRepo]` warnings first.

---

## 2026-02 Updates

### 1. Side-Click Connectivity (Freeform Graph)
- Source and target sides are captured from the exact side clicked (`left|right|top|bottom`).
- Persisted in `freeform_graph_edges.style` as `sourceSide` and `targetSide`.

### 2. Slot Distribution (Line Fan-out)
- Edge anchors are distributed along a side: `(i+1)/(n+1)` for `n` edges.
- Prevents ambiguous overlaps at the same anchor point.

### 3. Crossing Prevention
- New edges are blocked if they intersect existing edge segments.

### 4. Zoom Fix
- Post bounding rects are re-measured when `zoom` changes (added `zoom` to `useEffect` dependency array in `FreeformGraphLayer.tsx`).

### 5. Scheduler Library Drag-and-Drop
- **Capture-Phase Listeners**: Intercepts `dragover` and `drop` at document level to bypass `react-big-calendar`'s `stopPropagation()`.
- **Targeting**: Uses `e.target.closest('[data-scheduler-container-id]')` to identify scheduler containers.
- **Payloads**: Handles both `application/collabboard-library` and `application/collabboard-svg` (clipart).

### 6. Pen Button Standardization
- Standardized all edit actions to the `Edit2` icon (gray pen with circular background) at `top-1 right-1`.
- Layered at `z-30` to ensure visibility over card content.

---
