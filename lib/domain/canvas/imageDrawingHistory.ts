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

/**
 * R6G. A text annotation, as the history needs to remember it.
 *
 * The editor's TextElement is an alias of this, so undoing an "add text" can
 * put the whole annotation back rather than a reference to something already
 * gone.
 */
export interface DrawnText {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly content: string;
  readonly fontSize: number;
  readonly color: string;
  readonly borderColor?: string;
  readonly bgOpacity?: number;
  /** Set once the user resizes the box; their width then wins over the default. */
  readonly width?: number;
}

export type DrawingAction =
  /** A react-sketch-canvas stroke. The canvas owns the payload. */
  | { readonly type: 'stroke' }
  /** A rectangle was drawn. */
  | { readonly type: 'rect'; readonly rect: DrawnRect }
  /** A specific rectangle was deleted, from a specific position. */
  | { readonly type: 'rect-delete'; readonly rect: DrawnRect; readonly index: number }
  /** R6G. A text annotation was added. */
  | { readonly type: 'text'; readonly text: DrawnText }
  /** R6G. A specific text annotation was deleted, from a specific position. */
  | { readonly type: 'text-delete'; readonly text: DrawnText; readonly index: number };

/**
 * R6G. Which list an action belongs to.
 *
 * The single stack is what makes Undo chronological ACROSS layers: a rectangle,
 * then a stroke, then a text all sit in one ordered history, and undo walks it
 * backwards regardless of which list each entry touches. Before R6G the visible
 * buttons only reached rectangles and the sketch canvas, so undoing a text
 * annotation silently did nothing -- which is what the user saw as "the buttons
 * are not wired".
 */
export function actionLayer(action: DrawingAction): 'stroke' | 'rect' | 'text' {
  switch (action.type) {
    case 'rect':
    case 'rect-delete':
      return 'rect';
    case 'text':
    case 'text-delete':
      return 'text';
    case 'stroke':
    default:
      return 'stroke';
  }
}

/** Inserts `item` at `index`, tolerating an index outside the current range. */
export function insertAt<T>(items: readonly T[], item: T, index: number): T[] {
  const safeIndex = Number.isFinite(index) ? Math.max(0, Math.min(Math.trunc(index), items.length)) : items.length;
  return [...items.slice(0, safeIndex), item, ...items.slice(safeIndex)];
}

/** Inserts `rect` at `index`, tolerating an index outside the current range. */
export function insertRectAt(
  rects: readonly DrawnRect[],
  rect: DrawnRect,
  index: number,
): DrawnRect[] {
  return insertAt(rects, rect, index);
}

function without<T extends { readonly id: string }>(items: readonly T[], id: string): T[] {
  return items.filter((candidate) => candidate.id !== id);
}

const withoutRect = without<DrawnRect>;

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

/** R6G. The text annotations after undoing `action`. */
export function applyTextUndo(texts: readonly DrawnText[], action: DrawingAction): DrawnText[] {
  switch (action.type) {
    case 'text':
      return without(texts, action.text.id);
    case 'text-delete':
      return insertAt(texts, action.text, action.index);
    default:
      return [...texts];
  }
}

/** R6G. The text annotations after redoing `action` -- the inverse of applyTextUndo. */
export function applyTextRedo(texts: readonly DrawnText[], action: DrawingAction): DrawnText[] {
  switch (action.type) {
    case 'text':
      return insertAt(texts, action.text, texts.length);
    case 'text-delete':
      return without(texts, action.text.id);
    default:
      return [...texts];
  }
}
