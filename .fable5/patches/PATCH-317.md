# PATCH-317 — "Click to view full size" opens the drawing in every layout

## Why
Owner report: in the Scheduler's posts list, a drawing post shows the tooltip
"Click to view full size", but clicking does nothing.

Cause: `RowColumnContainerCard` always passes
`onView={() => onViewDrawing?.(child)}` to a drawing child, so the tooltip and
zoom cursor appear even when the host never wired `onViewDrawing`. Only
`FreeformPadletCards` wires it. Every other host shows a dead promise:
ChronoTimelineCanvas, ColumnsCanvasRow, WallCanvas, DrawingLayout, RowLane,
map PostPopup, and the Scheduler popover in CanvasClient.

The viewer itself already exists: `setViewDrawingPadlet(p)` in CanvasClient
opens the read-only DrawingEditor rendered by `CanvasModals` (z-[1000]).

## Design
1. `components/collabboard/RowColumnContainerCard.tsx`: pass
   `onView={onViewDrawing ? () => onViewDrawing(child) : undefined}`, so a host
   that cannot open the viewer never shows the tooltip or zoom cursor.
2. Thread `onViewDrawing?: (padlet: Padlet) => void` from CanvasClient to every
   `<RowColumnContainerCard>` host listed above, following exactly the path
   `onOpenDocument` already takes through each of them (same props, same
   intermediate components). The value at CanvasClient is
   `(p) => setViewDrawingPadlet(p)`.
3. Scheduler popover (CanvasClient ~line 11387): its overlay is z-[9999], above
   the viewer. Pass
   `onViewDrawing={(p) => { setSchedulerPopoverPadletId(null); setViewDrawingPadlet(p); }}`
   — the same close-then-open pattern `onEditContainer` uses there.
4. Do not change FreeformPadletCards, PostCardContent, DrawingEditor or CanvasModals.

## Tests
- RowColumnContainerCard: with `onViewDrawing`, clicking a drawing child's
  preview calls it with that child; without it, the drawing child has no
  `title="Click to view full size"` and no `cursor-zoom-in`.
- A source/architecture test: every non-test file that renders
  `<RowColumnContainerCard` passes `onViewDrawing` (FreeformPadletCards already does).
- Scheduler popover source test: its `onViewDrawing` closes the popover
  (`setSchedulerPopoverPadletId(null)`) and calls `setViewDrawingPadlet`.

## Verification
- Focused tests pass; `npx tsc --noEmit` clean.
- Report the full list of files changed.

## Allowed files
RowColumnContainerCard.tsx, CanvasClient.tsx, ChronoTimelineCanvas.tsx,
ColumnsCanvasRow.tsx, WallCanvas.tsx, DrawingLayout.tsx, RowLane.tsx,
PostPopup.tsx, any intermediate component that already forwards
`onOpenDocument` to one of them, and their test files. No git writes.
