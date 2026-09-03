/**
 * R6F -- the Draw-on-top editor's undo/redo history, as data.
 *
 * Before R6F the history was `Array<'stroke' | 'rect'>` and undo simply dropped
 * the LAST rectangle. That is only correct while the only way to lose a
 * rectangle is to undo the one you just drew. Deleting a specific rectangle
 * breaks it twice over: the deleted one is usually not the last, and undoing
 * the deletion has to put it back where it was.
 *
 * So an action now carries the rectangle it acted on, and its index. Undo and
 * redo become pure functions of (rects, action) -- which is the whole reason
 * this lives here rather than inside the component: the ordering rules are the
 * part worth testing, and they need no DOM.
 *
 * Stroke actions stay opaque on purpose. react-sketch-canvas owns its own
 * stroke stack; this module only records THAT a stroke happened, so the two
 * histories stay interleaved in the right order, and the component forwards
 * stroke actions to the canvas.
 */

/** A completed rectangle. `id` is what makes a specific one addressable. */
export interface DrawnRect {
  readonly id: string;
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
  readonly color: string;
  readonly strokeWidth: number;
  /** Pre-computed hand-drawn SVG path, in display coordinates. */
  readonly path: string;
}

export type DrawingAction =
  /** A react-sketch-canvas stroke. The canvas owns the payload. */
  | { readonly type: 'stroke' }
  /** A rectangle was drawn. */
  | { readonly type: 'rect'; readonly rect: DrawnRect }
  /** A specific rectangle was deleted, from a specific position. */
  | { readonly type: 'rect-delete'; readonly rect: DrawnRect; readonly index: number };

/** Inserts `rect` at `index`, tolerating an index outside the current range. */
export function insertRectAt(
  rects: readonly DrawnRect[],
  rect: DrawnRect,
  index: number,
): DrawnRect[] {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(Math.trunc(index), rects.length)) : rects.length;
  return [...rects.slice(0, safeIndex), rect, ...rects.slice(safeIndex)];
}

function withoutRect(rects: readonly DrawnRect[], id: string): DrawnRect[] {
  return rects.filter((candidate) => candidate.id !== id);
}

/**
 * The rectangles after undoing `action`.
 *
 * A 'stroke' leaves rectangles alone -- the caller undoes it on the canvas.
 */
export function applyUndo(rects: readonly DrawnRect[], action: DrawingAction): DrawnRect[] {
  switch (action.type) {
    case 'rect':
      return withoutRect(rects, action.rect.id);
    case 'rect-delete':
      // Back to where it was, not appended to the end: a rectangle that
      // reappears on top of a later one has not really been restored.
      return insertRectAt(rects, action.rect, action.index);
    case 'stroke':
    default:
      return [...rects];
  }
}

/** The rectangles after redoing `action` -- the exact inverse of applyUndo. */
export function applyRedo(rects: readonly DrawnRect[], action: DrawingAction): DrawnRect[] {
  switch (action.type) {
    case 'rect':
      return insertRectAt(rects, action.rect, rects.length);
    case 'rect-delete':
      return withoutRect(rects, action.rect.id);
    case 'stroke':
    default:
      return [...rects];
  }
}

/** True when undoing/redoing this action has to reach the sketch canvas. */
export function isStrokeAction(action: DrawingAction): boolean {
  return action.type === 'stroke';
}
