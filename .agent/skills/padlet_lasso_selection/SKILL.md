---
name: Padlet Lasso Selection & Group Dragging
description: Guidelines and architecture for the custom Lasso tool and bulk drag operations for HTML Padlets on top of the Excalidraw canvas.
---

# Padlet Lasso Selection and Group Dragging

This skill documents how the custom Lasso selection tool is implemented for HTML Padlets (like Content cards and Comment pins) floating above the Excalidraw canvas in `DrawingLayout.tsx`.

## 1. The Core Problem
The native open-source Excalidraw package primarily manages its own internal SVG elements. It does not automatically provide a Lasso tool out-of-the-box in the UI, nor does its internal lasso logic know how to select external absolute-positioned React DOM nodes (our Padlets).

## 2. Custom Tool UI & SVG Overlay
To enable lasso selection for Padlets:
1. **Custom Toolbar Button:** A custom `LassoSelect` button is injected into the floating Pro-features toolbar (next to Comment and Library). When clicked, it sets the `activeTool` state to `'lasso'`.
2. **Visual Tracking:** When dragging the mouse in lasso mode, an SVG `<polygon>` with `strokeDasharray` is rendered over the canvas using a `lassoPoints` array in state. This provides immediate visual feedback.

## 3. Pointer Interception & Ray-Casting
Because `dnd-kit` manages dragging on the individual Padlets, we must intercept pointer events at the highest container level using **Capture Phase** event listeners:
- `onPointerDownCapture`
- `onPointerMoveCapture`
- `onPointerUpCapture`

When the user finishes drawing the lasso (`onPointerUpCapture`), a standard **Point-in-Polygon (Ray-Casting) Algorithm** determines overlaps:
```typescript
const pointInPolygon = (point: {x: number, y: number}, vs: {x: number, y: number}[]) => {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};
```
We project each padlet's logical `(position_x, position_y)` onto the current screen zoom/scroll bounds, calculate its center point, and test it against the `lassoPolygonRef`. Matches are added to a `selectedPadletIds` Set.

## 4. Bulk Dragging with `dnd-kit`
Our Padlets use `@dnd-kit/core` for drag-and-drop. Native `dnd-kit` only moves the *single active item* you are interacting with.

To move a whole lassoed group:
1. **Track `dragDelta`:** We monitor `onDragMove` in the `<DndContext>` to capture the live `{x, y}` translation of the active padlet being dragged.
2. **Sync Visuals (`groupDragDelta`):** This live delta is passed down as a prop (`groupDragDelta`) to *all other* Padlets currently in `selectedPadletIds`. The `DraggablePadlet` and `DraggableCommentPin` components apply this delta inside their inline `style.transform` string.
3. **Commit on Drop:** On `onDragEnd`, we calculate the final zoomed difference `dx` and `dy`. We then iterate over every ID in `selectedPadletIds` and update their real database coordinates (`savePadletPosition`) simultaneously, while also setting `optimisticPositions` to prevent visual snap-back.

## 5. Visual Selection State
Any padlet whose ID is in `selectedPadletIds` receives a distinct blue border (`ring-2 ring-blue-500`) to indicate its selected status. Clicking directly on the canvas without holding `Shift` clears the global selection Set.
