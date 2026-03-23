---
name: Image Drawing Editor
description: Architecture, bug history, and patterns for ImageDrawingLayer.tsx — the full-screen image annotation editor that overlays drawing tools on a photo. Also covers the ImageEditor modal wiring for freeform canvas image posts.
updated_at: 2026-03-18
---

# Image Drawing Editor — ImageDrawingLayer.tsx

**File:** `components/collabboard/editors/ImageDrawingLayer.tsx`

## Architecture Overview

Full-screen modal that composites three layers on top of a `<img>`:

1. **`ReactSketchCanvas`** — freehand pencil, eraser, highlighter strokes (SVG-based library)
2. **Native SVG layer** — completed rectangles rendered as `<path>` elements (instant, no async lag)
3. **Text element div layer** — draggable floating `<textarea>` overlays

Save flattens all three layers onto a single `<canvas>` and exports a data URL.

## Tools

| Tool | How it draws |
|---|---|
| `pencil` | `react-sketch-canvas` freehand |
| `highlighter` | Same, `color + '80'` (50% alpha) + 2× stroke width |
| `eraser` | `canvasRef.eraseMode(true)` |
| `text` | Position stored in `textElements[]`, rendered as `<textarea>` divs |
| `square` | **Native SVG path** (NOT react-sketch-canvas) — see below |

## Square Tool — Critical Design Decision

### Problem (do not revert)
`react-sketch-canvas.loadPaths()` is async — it updates React internal state over multiple render cycles. Drawing a rectangle via `loadPaths()` causes it to appear only after several more draws or a tool switch. Using 4 separate edge paths or dense 2px-interpolated points does NOT fix this; the root cause is the async state update cycle.

### Solution
Rectangles are stored in `completedRects: CompletedRect[]` state and rendered as a **permanent native SVG layer** (`<path strokeLinecap="round" strokeLinejoin="round" />`). They appear instantly on pointer-up with zero lag.

### Artistic Hand-Drawn Style
Each completed rect uses `makeWobblyRectPath()` which applies a small random jitter (±`strokeWidth * 0.9 / 2`) to each of the 4 corners, mimicking a natural hand-drawn marker stroke. The live preview while dragging uses a dashed `<rect>` at 70% opacity.

### `CompletedRect` interface
```ts
interface CompletedRect {
    x1: number; y1: number; x2: number; y2: number;
    color: string; strokeWidth: number;
    path: string; // pre-computed wobbly SVG path string
}
```

### Save / Export
At save time each rect is re-generated with `makeWobblyRectPath()` scaled to the actual image pixel dimensions (via `scaleX = canvas.width / container.clientWidth`) and drawn with `ctx.stroke(new Path2D(scaledPath))`. `lineCap` and `lineJoin` are `'round'` to match the SVG appearance.

## Undo / History

A unified `actionHistory: Array<'stroke' | 'rect'>` stack tracks the draw order across both tools:
- Drawing a freehand stroke appends `'stroke'` (via `ReactSketchCanvas`'s `onChange` callback, comparing path count).
- Drawing a rect appends `'rect'`.
- Undo pops the last action: `'rect'` → `setCompletedRects(prev => prev.slice(0, -1))`, `'stroke'` → `canvasRef.current?.undo()`.
- Redo still delegates to `canvasRef.current?.redo()` (strokes only).

## Pointer Events — Important

`ReactSketchCanvas` must have `pointerEvents: 'none'` **only** when `tool === 'text'`. It must **not** be disabled for `tool === 'square'` — doing so breaks SVG repaint and prevented rendered rects from being visible until a tool switch (the bug that triggered this investigation). The square tool z-50 overlay intercepts events naturally without needing to disable the canvas below.

## Initial Paths Loading

Saved paths are loaded via a retry loop on mount (up to 10 attempts × 100 ms) to handle canvas not being mounted on first render.

## Save Flow

1. `canvasRef.exportImage('png')` — strokes only, transparent background
2. Create `<canvas>`, draw original image
3. Draw strokes PNG on top
4. Draw each `completedRect` re-scaled to image resolution via `Path2D`
5. Draw `textElements` via `ctx.fillText` / `ctx.roundRect`
6. `canvas.toDataURL()` → `onSave(dataUrl, paths, textElements)`

---

## Freeform Canvas — Image Post Pencil Button → ImageEditor Modal

### Problem (Fixed 2026-03-18)

On the freeform canvas, clicking the pencil (Edit) button on an **image post** was calling `setImageToolbarPadletId(padlet.id)` instead of opening the `ImageEditor` modal. Note posts correctly opened their modal via `openFreeformPadletModal`. Image posts were inconsistent.

### The Correct Wiring

Three files must all be in sync for the pencil button on an image post to open the `ImageEditor` modal:

#### 1. `CanvasClient.tsx` — Pass the setter as a prop

```tsx
<FreeformPadletCards
  ...
  setIsImageEditorOpen={setIsImageEditorOpen}   // ← required
  ...
/>
```

#### 2. `FreeformPadletCards.tsx` — Interface + destructure

```tsx
export interface FreeformPadletCardsProps {
  ...
  setIsImageEditorOpen: (v: boolean) => void;   // ← in the interface
  ...
}

function FreeformPadletCards(props: FreeformPadletCardsProps) {
  const {
    ...
    setIsImageEditorOpen,                        // ← destructured
    ...
  } = props;
```

#### 3. `FreeformPadletCards.tsx` — `openFreeformPadletModal` handles `'image'` type

```tsx
const openFreeformPadletModal = React.useCallback((padlet: Padlet) => {
  closeAllToolbars();
  setPadletToEdit(padlet);
  if (padlet.type === 'table') {
    setIsTableEditorOpen(true);
  } else if (padlet.type === 'link') {
    setIsLinkEditorOpen(true);
  } else if (padlet.type === 'todo') {
    setIsTodoEditorOpen(true);
  } else if (padlet.type === 'comment' || padlet.type === 'Comment') {
    setIsCommentEditorOpen(true);
  } else if (padlet.type === 'image') {
    setIsImageEditorOpen(true);   // ← image opens ImageEditor, NOT crop mode
  } else if (padlet.type === 'drawing') {
    setIsDrawingEditorOpen(true);
  } else if (padlet.type === 'card') {
    setIsCardEditorOpen(true);
  } else {
    setIsNoteEditorOpen(true);
  }
}, [
  closeAllToolbars, setPadletToEdit,
  setIsTableEditorOpen, setIsLinkEditorOpen, setIsTodoEditorOpen,
  setIsCommentEditorOpen, setIsImageEditorOpen, setIsDrawingEditorOpen,
  setIsCardEditorOpen, setIsNoteEditorOpen,
]);
```

#### 4. Image pencil button calls `openFreeformPadletModal`

The pencil button in the image post top strip (around line 1130) must call `openFreeformPadletModal`, not `setImageToolbarPadletId`:

```tsx
{canUseFreeformEditButton && (
  <button
    data-no-drag="true"
    onClick={(e) => {
      e.stopPropagation();
      setDetachedPopupOpen(false);
      openFreeformPadletModal(padlet);   // ← not setImageToolbarPadletId!
    }}
    ...
  >
    <Edit2 size={12} />
  </button>
)}
```

### Key Rule

> **Never** call `setImageToolbarPadletId` from the pencil button. That opens the `ImageActionsToolbar` (crop/draw overlay toolbar), not the full editing modal. The pencil button should ALWAYS call `openFreeformPadletModal(padlet)` for all padlet types including image.
