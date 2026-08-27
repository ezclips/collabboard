/**
 * P6J-F9-B1 -- the single authority for PDF page region coordinates.
 *
 * Pure by construction: no React, no DOM, no PDF.js, no browser globals, no
 * persistence. F9-B selection, F9-C server cropping and F9-D arrival overlays
 * all transform through this file, so the rotation algebra exists exactly once.
 *
 * A region is normalised 0..1 with a TOP-LEFT origin in the page's INTRINSIC
 * UNROTATED coordinate system -- deliberately independent of CSS size, reader
 * width, raster resolution, device pixel ratio and zoom, so a stored rectangle
 * survives every one of those changing.
 *
 * The DISPLAY system is the rotation-applied derivative the reader shows: A1
 * bakes the page rotation into the WebP (pdfjs `rotation: 90` renders the page
 * CLOCKWISE, verified against pdfjs-dist 4.10.38's PageViewport matrix), and no
 * client-side CSS rotation exists. Only `rotation` enters the transforms; the
 * page's point dimensions cancel out of a normalised mapping entirely.
 */

export interface NormalizedPageRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type KnowledgePageRotation = 0 | 90 | 180 | 270;

/**
 * Float tolerance for the closed edges. A selection dragged exactly to the page
 * edge computes `x + width` as 1 plus a few ULPs, and rejecting that would make
 * whole-page selections randomly unsaveable.
 */
export const NORMALIZED_REGION_EPSILON = 1e-9;

export function isCanonicalPageRotation(value: unknown): value is KnowledgePageRotation {
  return value === 0 || value === 90 || value === 180 || value === 270;
}

/**
 * The one place a rectangle becomes storable. Validates, then trims ONLY the
 * epsilon overhang so `x + width <= 1` holds exactly for the database CHECK --
 * legitimate values are never rounded, because `Math.min` leaves any width that
 * already fits untouched.
 */
function finalizeRegion(
  x: number,
  y: number,
  width: number,
  height: number,
): NormalizedPageRegion | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  // A transform of an edge-touching rectangle can land a hair below zero.
  const left = x < 0 && x > -NORMALIZED_REGION_EPSILON ? 0 : x;
  const top = y < 0 && y > -NORMALIZED_REGION_EPSILON ? 0 : y;
  if (left < 0 || top < 0 || left > 1 || top > 1) return null;
  if (width <= 0 || height <= 0) return null;
  if (left + width > 1 + NORMALIZED_REGION_EPSILON) return null;
  if (top + height > 1 + NORMALIZED_REGION_EPSILON) return null;
  const trimmedWidth = Math.min(width, 1 - left);
  const trimmedHeight = Math.min(height, 1 - top);
  // A rectangle whose whole area was epsilon overhang is not a selection.
  if (trimmedWidth <= 0 || trimmedHeight <= 0) return null;
  return { x: left, y: top, width: trimmedWidth, height: trimmedHeight };
}

/**
 * Accepts anything -- a parsed request body included -- and yields a storable
 * region or null. `Number.isFinite` is type-strict, so "0.5", null and objects
 * all fail closed rather than coercing.
 */
export function normalizeStorableRegion(value: unknown): NormalizedPageRegion | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const region = value as Record<string, unknown>;
  return finalizeRegion(
    region.x as number,
    region.y as number,
    region.width as number,
    region.height as number,
  );
}

/** Validity and storability are one question, so there is one implementation. */
export function isValidNormalizedRegion(value: unknown): value is NormalizedPageRegion {
  return normalizeStorableRegion(value) !== null;
}

/**
 * Two drag corners in any order become a positive rectangle clamped to the
 * page. The UI's minimum-drag threshold is deliberately NOT here: it is a CSS
 * pixel concern that must never reach persistence.
 */
export function normalizeDragRectangle(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): NormalizedPageRegion | null {
  const clamp = (value: number): number =>
    (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : Number.NaN);
  const x0 = clamp(startX);
  const y0 = clamp(startY);
  const x1 = clamp(endX);
  const y1 = clamp(endY);
  return finalizeRegion(
    Math.min(x0, x1),
    Math.min(y0, y1),
    Math.abs(x1 - x0),
    Math.abs(y1 - y0),
  );
}

/**
 * Displayed (rotation-applied) rectangle -> intrinsic unrotated page rectangle.
 * This is the direction F9-B persists in.
 */
export function displayRegionToSourceRegion(
  region: unknown,
  rotation: unknown,
): NormalizedPageRegion | null {
  if (!isCanonicalPageRotation(rotation)) return null;
  const d = normalizeStorableRegion(region);
  if (d === null) return null;
  switch (rotation) {
    case 0:
      return finalizeRegion(d.x, d.y, d.width, d.height);
    case 90:
      return finalizeRegion(d.y, 1 - d.x - d.width, d.height, d.width);
    case 180:
      return finalizeRegion(1 - d.x - d.width, 1 - d.y - d.height, d.width, d.height);
    default:
      return finalizeRegion(1 - d.y - d.height, d.x, d.height, d.width);
  }
}

/**
 * The exact inverse. F9-C maps a stored region onto the derivative's pixels to
 * crop it, and F9-D maps it onto the reader's image box to draw an overlay --
 * both must land on the same pixels the user originally dragged over.
 */
export function sourceRegionToDisplayRegion(
  region: unknown,
  rotation: unknown,
): NormalizedPageRegion | null {
  if (!isCanonicalPageRotation(rotation)) return null;
  const s = normalizeStorableRegion(region);
  if (s === null) return null;
  switch (rotation) {
    case 0:
      return finalizeRegion(s.x, s.y, s.width, s.height);
    case 90:
      return finalizeRegion(1 - s.y - s.height, s.x, s.height, s.width);
    case 180:
      return finalizeRegion(1 - s.x - s.width, 1 - s.y - s.height, s.width, s.height);
    default:
      return finalizeRegion(s.y, 1 - s.x - s.width, s.height, s.width);
  }
}
