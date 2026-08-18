/**
 * Single source of truth for the Freeform layout's world-stage geometry.
 *
 * The Freeform post stage (FreeformPadletCards.tsx) and the Freeform Line
 * interaction layers (CanvasClient.tsx's back/front SimpleLineRenderer
 * wrappers) must both size their unscaled box to this same world stage
 * before applying `transform: scale(canvasZoom)` -- otherwise a wrapper
 * sized to the viewport instead of the world stage stays reachable only up
 * to the viewport's own pixel size, regardless of zoom (PATCH 9I/9J).
 */

/** Original logical region retained byte-for-byte for existing content. */
export const FREEFORM_WORLD_WIDTH_PX = 10000;
export const FREEFORM_WORLD_HEIGHT_PX = 10000;

/** Finite signed world bounds introduced by PATCH 9V.2A. */
export const FREEFORM_WORLD_MIN_X = -5000;
export const FREEFORM_WORLD_MIN_Y = -5000;
export const FREEFORM_WORLD_MAX_X = 15000;
export const FREEFORM_WORLD_MAX_Y = 15000;

/** Physical signed-stage dimensions. */
export const FREEFORM_SIGNED_WORLD_WIDTH = FREEFORM_WORLD_MAX_X - FREEFORM_WORLD_MIN_X;
export const FREEFORM_SIGNED_WORLD_HEIGHT = FREEFORM_WORLD_MAX_Y - FREEFORM_WORLD_MIN_Y;

/** Logical world (0,0) measured from the signed-stage start. */
export const FREEFORM_WORLD_ORIGIN_OFFSET_X = -FREEFORM_WORLD_MIN_X;
export const FREEFORM_WORLD_ORIGIN_OFFSET_Y = -FREEFORM_WORLD_MIN_Y;

export interface FreeformRectPlacement {
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
}

export interface FreeformPoint {
  x: number;
  y: number;
}

/**
 * Normalizes a possibly-missing/garbage dimension to a non-negative span.
 * Posts routinely carry null/undefined width or height (auto-sized types),
 * and a NaN here would otherwise poison the whole clamp.
 */
function safeSpan(size: number | null | undefined): number {
  const value = Number(size);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Clamps ONE axis so the whole span [value, value + size] stays inside
 * [min, max].
 *
 * Oversized policy (PATCH 9V.2B Phase 3): when the object is wider/taller
 * than the world itself, `upper` falls below `min` and there is no valid
 * position at all. Rather than invert the range (which would silently snap
 * the object to a max-side coordinate that is itself out of bounds), the
 * object is anchored at the world minimum -- the `Math.max(min, ...)` outer
 * bound deliberately wins over `Math.min(upper, ...)` for exactly this case.
 */
function clampSpanToBounds(value: number, size: number, min: number, max: number): number {
  const span = safeSpan(size);
  const upper = max - span;
  const safe = Number.isFinite(value) ? value : 0;
  return Math.max(min, Math.min(upper, safe));
}

/**
 * PATCH 9V.2B: the ONE placement contract for root Freeform posts.
 *
 * Screen->world conversion (see CanvasClient's getCanvasPointFromClient) is
 * deliberately NOT clamped -- it reports the true signed world coordinate the
 * pointer is over, even out in the camera gutter beyond the world edge. This
 * helper is the separate, later question: "where may this rectangle legally
 * be stored?". Objects live in the signed world; they are never persisted
 * into the outer camera gutter.
 *
 * Note the WHOLE rectangle is bounded, not just its top-left corner, so a
 * 350px-wide container can never be committed with its right edge past
 * FREEFORM_WORLD_MAX_X.
 */
export function clampRectPositionToFreeformBounds({ x, y, width, height }: FreeformRectPlacement): FreeformPoint {
  return {
    x: clampSpanToBounds(x, safeSpan(width), FREEFORM_WORLD_MIN_X, FREEFORM_WORLD_MAX_X),
    y: clampSpanToBounds(y, safeSpan(height), FREEFORM_WORLD_MIN_Y, FREEFORM_WORLD_MAX_Y),
  };
}

export interface FreeformGroupDragBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * PATCH 9V.2B Phase 7: multi-selection drag clamps the DELTA, never the
 * individual posts.
 *
 * Clamping each selected post independently would let posts that reach the
 * edge stop while the rest keep travelling, collapsing the group's spacing.
 * Instead the group's combined bounds decide how far the whole selection may
 * move, and every member then receives that identical delta -- relative
 * positions, spacing and alignment survive contact with all four edges.
 *
 * Oversized groups follow the same anchor-at-minimum policy as single rects.
 */
export function clampGroupDragDeltaToFreeformBounds(
  bounds: FreeformGroupDragBounds,
  delta: { dx: number; dy: number }
): { dx: number; dy: number } {
  const dx = Number.isFinite(delta.dx) ? delta.dx : 0;
  const dy = Number.isFinite(delta.dy) ? delta.dy : 0;
  return {
    dx: Math.max(FREEFORM_WORLD_MIN_X - bounds.minX, Math.min(FREEFORM_WORLD_MAX_X - bounds.maxX, dx)),
    dy: Math.max(FREEFORM_WORLD_MIN_Y - bounds.minY, Math.min(FREEFORM_WORLD_MAX_Y - bounds.maxY, dy)),
  };
}

/**
 * PATCH SNAP-GRID-B: drag-movement snap spacing, in WORLD units -- independent
 * of the dot grid's own 20 (CanvasClient's canvasBackgroundStyle), which is a
 * rendering-only concern scaled by canvasZoom and deliberately not touched by
 * this patch. The two happen to share the same value today by design intent,
 * not by a shared constant.
 */
export const FREEFORM_SNAP_GRID_SIZE = 20;

/**
 * Rounds one WORLD-space coordinate to the nearest grid line. Never scaled by
 * canvasZoom -- callers must apply this AFTER screen-to-world conversion
 * (zoom already divided out), on the stored/committed value, never on screen
 * pixels.
 */
export function snapWorldValueToGrid(value: number): number {
  return Math.round(value / FREEFORM_SNAP_GRID_SIZE) * FREEFORM_SNAP_GRID_SIZE;
}
