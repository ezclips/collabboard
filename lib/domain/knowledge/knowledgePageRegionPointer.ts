/**
 * P6J-F9-B2 -- pointer coordinates to normalised DISPLAY coordinates.
 *
 * Pure: no React, no DOM, no browser globals -- the caller reads the numbers
 * off the element, as `freeformMinimapGeometry` is split from its hook.
 *
 * The box is the image CONTENT box, never its bounding rectangle: the page
 * image carries a 1px border inside a `border-box`, so
 * `getBoundingClientRect()` is two pixels wider and one pixel offset from the
 * pixels the user sees, and normalising against it skews every selection
 * outward, worst at the edges.
 *
 * Rotation lives in `knowledgePageRegionGeometry` and never here: these are
 * the coordinates the user pointed at, before any page algebra.
 */

/** `left/top` are `rect.left + img.clientLeft` and `rect.top + img.clientTop`; `width/height` are `img.clientWidth/clientHeight`. */
export interface PageImageContentBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface NormalizedDisplayPoint { readonly x: number; readonly y: number }

/**
 * Smallest drag that counts, in CSS pixels, in BOTH dimensions: a stray click
 * carries a pixel or two of travel and must not arm a region nobody drew. UI
 * only -- the domain validator and the database still accept any positive
 * normalised extent, because what is too small on a 500px preview is not too
 * small on the page itself.
 */
export const MINIMUM_REGION_CSS_PIXELS = 8;

/** A box with no area cannot normalise anything, so selection is refused. */
export function isContentBoxUsable(box: PageImageContentBox): boolean {
  const { left, top, width, height } = box;
  if (!Number.isFinite(left) || !Number.isFinite(top)) return false;
  if (!Number.isFinite(width) || !Number.isFinite(height)) return false;
  return width > 0 && height > 0;
}

/**
 * Clamped to the page: a captured drag continues outside the image, and the
 * part beyond the edge selects the edge rather than producing coordinates the
 * domain would reject.
 */
export function normalizedPointInContentBox(
  clientX: number,
  clientY: number,
  box: PageImageContentBox,
): NormalizedDisplayPoint | null {
  if (!isContentBoxUsable(box)) return null;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const clamp = (value: number): number => Math.min(1, Math.max(0, value));
  return { x: clamp((clientX - box.left) / box.width), y: clamp((clientY - box.top) / box.height) };
}

/** Measured from the CLAMPED corners, so an overshooting drag is judged by what landed. */
export function meetsMinimumRegionExtent(
  start: NormalizedDisplayPoint,
  end: NormalizedDisplayPoint,
  box: PageImageContentBox,
): boolean {
  if (!isContentBoxUsable(box)) return false;
  return Math.abs(end.x - start.x) * box.width >= MINIMUM_REGION_CSS_PIXELS
    && Math.abs(end.y - start.y) * box.height >= MINIMUM_REGION_CSS_PIXELS;
}
