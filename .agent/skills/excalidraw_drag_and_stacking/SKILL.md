---
name: Excalidraw Embeddable Drag & Stacking Fix
description: Technical details on the Pointer Capture API implementation for moving embeddables and the horizontal offset logic to prevent container stacking.
---

# DrawingLayout: Embeddable Drag-to-Move & Container Stacking Fix

## Problem Summary

Three bugs were fixed in `DrawingLayout.tsx` + `CanvasClient.tsx`:

1. **"New Container" placed post inside existing container instead of creating standalone**
2. **Containers could not be moved by mouse drag on the strip/header**
3. **Multiple new containers stacked on top of each other at the same position**

---

## Root Cause: Why Pointer Events Don't Work Natively

### The Excalidraw Fork's CSS

`styles.scss`:
```css
.excalidraw__embeddable-container {
  position: absolute;
  z-index: 2;
  pointer-events: none;   /* outer wrapper = no events */
}
```

`App.tsx` (fork — line ~1698) sets INLINE style on the inner div:
```tsx
pointerEvents: (isActive || (el.link && el.link.startsWith("padlet://")))
  ? POINTER_EVENTS.enabled   // "auto"
  : POINTER_EVENTS.disabled  // "none"
```

**Critical insight**: All `padlet://` embeddables ALWAYS have `pointer-events: auto` on the
**inner** div — regardless of whether the element is selected/active.

### Why the Old Strip Approach Failed

The old strip was:
```tsx
<div style={{ pointerEvents: 'none', height: '10px' }} />
```

When user clicked/dragged on this strip:
- The strip (`pointer-events: none`) ignores the event
- Event propagates UP to its parent = the inner div with `pointer-events: auto`
- The inner div captures the event
- Event NEVER reaches the Excalidraw canvas (a sibling element, not an ancestor)
- Excalidraw never sees the drag => embeddable cannot be moved natively

---

## Solution: Custom Drag via Pointer Capture API

Instead of fighting the pointer-events hierarchy, implement drag-to-move directly
on the strip using the browser's Pointer Capture API + `excalidrawAPI.updateScene`.

### Step 1: Add excalidrawAPIRef

In `DrawingLayout.tsx`, alongside the `excalidrawAPI` state, add a ref:

```tsx
const excalidrawAPIRef = useRef<any>(null);
```

Update the Excalidraw component's `excalidrawAPI` prop setter to populate both:
```tsx
excalidrawAPI={(api) => {
  setExcalidrawAPI(api);
  excalidrawAPIRef.current = api;
}}
```

**Why a ref instead of using the state in renderEmbeddable?**
- `renderEmbeddable` is a `useCallback` — if `excalidrawAPI` (state) were in deps,
  it would recreate on every API set, causing Excalidraw to re-render all embeddables.
- Using `excalidrawAPIRef.current` reads the live value at call time without being a dep.

### Step 2: Replace the Passive Strip with Active Drag Handler

Replace the old `<div style={{ pointerEvents: 'none' }}>` strip with this:

```tsx
<div
  className="w-full flex-shrink-0 cursor-grab active:cursor-grabbing"
  style={{
    height: stripColor ? '10px' : (isContainer ? '28px' : '14px'),
    backgroundColor: stripColor ?? (isContainer ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.04)'),
    userSelect: 'none',
  }}
  onPointerDown={(e) => {
    e.stopPropagation();
    const excAPI = excalidrawAPIRef.current;
    if (!excAPI) return;

    // Find the Excalidraw scene element linked to this padlet
    const sceneEl = excAPI.getSceneElements().find(
      (el: any) => el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
    );
    if (!sceneEl) return;

    // Capture starting positions
    const startClientX = e.clientX;
    const startClientY = e.clientY;
    const startElX = sceneEl.x;
    const startElY = sceneEl.y;
    const target = e.currentTarget as HTMLElement;

    // Capture all future pointer events on this element
    target.setPointerCapture(e.pointerId);

    const handleMove = (me: PointerEvent) => {
      const zoom = appStateRef.current?.zoom?.value || 1;
      excAPI.updateScene({
        elements: excAPI.getSceneElements().map((el2: any) =>
          el2.id === sceneEl.id
            ? {
                ...el2,
                x: startElX + (me.clientX - startClientX) / zoom,
                y: startElY + (me.clientY - startClientY) / zoom,
              }
            : el2
        ),
        commitToHistory: false,   // no undo entries during drag
      });
    };

    const handleUp = (ue: PointerEvent) => {
      target.removeEventListener('pointermove', handleMove);
      target.releasePointerCapture(ue.pointerId);
      const zoom = appStateRef.current?.zoom?.value || 1;
      const newX = startElX + (ue.clientX - startClientX) / zoom;
      const newY = startElY + (ue.clientY - startClientY) / zoom;
      // Commit final position to Excalidraw history
      excAPI.updateScene({
        elements: excAPI.getSceneElements().map((el2: any) =>
          el2.id === sceneEl.id ? { ...el2, x: newX, y: newY } : el2
        ),
        commitToHistory: true,
      });
      // Persist to DB
      onUpdatePadlet(padlet.id, { position_x: newX, position_y: newY });
    };

    target.addEventListener('pointermove', handleMove);
    target.addEventListener('pointerup', handleUp, { once: true });
    target.addEventListener('pointercancel', handleUp, { once: true });
  }}
/>
```

### Key Details

| Detail | Why |
|--------|-----|
| `e.stopPropagation()` on pointerDown | Prevents Excalidraw's own pointer handler from firing |
| `setPointerCapture(e.pointerId)` | All future pointermove/pointerup go to this element even if cursor leaves it |
| `commitToHistory: false` during move | No undo spam while dragging |
| `commitToHistory: true` on release | One undo entry for the complete drag |
| Divide by zoom | Client pixel delta must be divided by zoom to get canvas coordinate delta |
| `appStateRef.current?.zoom` | Reads zoom at drag time — `appStateRef` is always current (set in handleChange) |
| `onUpdatePadlet(padlet.id, ...)` on pointerup | Persists new position to DB |

### renderEmbeddable Dependency Array

`excalidrawAPI` state must NOT be in the deps — use ref instead:

```tsx
}, [fetchData, handleContextMenu, padlets, onUpdatePadlet, onAddPadlet, canvasId]);
//  ^ excalidrawAPI intentionally excluded — read from excalidrawAPIRef.current instead
```

---

## Root Cause: Container Stacking

When user clicks "New Container" from the library/PlacementPrompt, `handleDrawingNewContainer`
in `CanvasClient.tsx` used:

```ts
const posX = (drawingPendingDraft as any).position_x ?? 100;
const posY = (drawingPendingDraft as any).position_y ?? 100;
```

Library panel clicks compute `canvasX, canvasY` from screen center:
```ts
const canvasX = (centerClientX / zoom) - scrollX;
const canvasY = (centerClientY / zoom) - scrollY;
```

Result: every "New Container" was placed at the exact same canvas coordinates.
The user saw new containers stacked invisibly behind existing ones.

---

## Solution: Position Offset Loop

In `handleDrawingNewContainer` (`CanvasClient.tsx`), after computing initial `posX/posY`,
add a loop that steps right until no existing container overlaps:

```ts
let posX = (drawingPendingDraft as any).position_x ?? 100;
let posY = (drawingPendingDraft as any).position_y ?? 100;

// Prevent new containers from stacking on top of existing ones
const containerW = 380; // approx container width (360) + gap (20)
const containerH = 320; // approx container height (300) + gap (20)
const existingContainers = padlets.filter(
  p => p.type === 'container' || (p.metadata as any)?.isContainer
);
let attempts = 0;
while (
  attempts < 20 &&
  existingContainers.some(
    p =>
      Math.abs(p.position_x - posX) < containerW &&
      Math.abs(p.position_y - posY) < containerH
  )
) {
  posX += containerW;
  attempts++;
}
```

Then use `posX` / `posY` when calling `insertPadlet` for the container.

**Also**: Add `padlets` to the `useCallback` deps array so the loop sees current data:
```ts
}, [drawingPendingDraft, canvasId, setPadlets, insertPadlet, padlets]);
```
