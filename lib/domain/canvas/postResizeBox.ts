// PATCH POST-RESIZE-B1: pure bottom-right box-resize math. No DOM, no camera,
// no repository. The host supplies a client->world converter to the shared
// handle; this module turns world deltas into canonical width/height.

export interface PostResizeBoxInput {
  startWidth: number;
  startHeight: number;
  deltaX: number;
  deltaY: number;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  lockAspect?: boolean;
}

export interface PostResizeBoxResult {
  width: number;
  height: number;
}

function finiteOr(value: number | null | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Bottom-right resize: top-left is fixed, so only width/height change. The
 * starting rectangle is the gesture origin captured at pointerdown; deltas are
 * absolute world-unit differences of the pointer's world position (never
 * zoom-scaled client deltas -- the converter already normalizes them).
 *
 * Safety: every input is sanitized through `finiteOr`, so a converter that
 * returns NaN/Infinity can never produce a non-finite result. Rounding to
 * integer world units also makes sub-pixel movements collapse onto the start
 * size, which is what lets callers treat `result === start` as a no-op.
 */
export function resizePostBox(input: PostResizeBoxInput): PostResizeBoxResult {
  const startWidth = Math.max(0, finiteOr(input.startWidth, 0));
  const startHeight = Math.max(0, finiteOr(input.startHeight, 0));
  const deltaX = finiteOr(input.deltaX, 0);
  const deltaY = finiteOr(input.deltaY, 0);
  const minWidth = Math.max(0, finiteOr(input.minWidth, 0));
  const minHeight = Math.max(0, finiteOr(input.minHeight, 0));
  const maxWidth = finiteOr(input.maxWidth, Number.POSITIVE_INFINITY);
  const maxHeight = finiteOr(input.maxHeight, Number.POSITIVE_INFINITY);

  let width = Math.round(startWidth + deltaX);
  let height = Math.round(startHeight + deltaY);

  if (input.lockAspect && startWidth > 0 && startHeight > 0) {
    const ratio = startWidth / startHeight;
    // Two candidate rectangles -- one driven by the width delta, one by the
    // height delta. The candidate whose primary axis moved further wins, so
    // the pointer's dominant direction decides the scale.
    const fromWidth = { width, height: Math.max(minHeight, Math.round(width / ratio)) };
    const fromHeight = { width: Math.max(minWidth, Math.round(height * ratio)), height };
    if (Math.abs(width - startWidth) >= Math.abs(height - startHeight)) {
      width = fromWidth.width;
      height = fromWidth.height;
    } else {
      width = fromHeight.width;
      height = fromHeight.height;
    }
  }

  width = Math.max(minWidth, Math.min(maxWidth, width));
  height = Math.max(minHeight, Math.min(maxHeight, height));

  return { width, height };
}

/**
 * True when a computed size differs from the gesture origin. Because
 * `resizePostBox` rounds to integer world units, sub-epsilon movement yields
 * the exact start size and this returns false -- the commit gate.
 */
export function isMeaningfulPostResize(
  startWidth: number,
  startHeight: number,
  next: PostResizeBoxResult
): boolean {
  return next.width !== startWidth || next.height !== startHeight;
}
