import { NORMALIZED_REGION_EPSILON } from './knowledgePageRegionGeometry';

/**
 * P6J-F9-C1 -- a normalised DISPLAY region plus a decoded raster's pixel size,
 * turned into an integer crop rectangle. Pure: no image library, no Buffer, no
 * route. `sourceRegionToDisplayRegion` already applied rotation; this is the
 * one remaining step, pixels.
 */

export interface IntegerPixelCropBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

interface NormalizedDisplayRegionLike {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

/** Real decoded raster dimensions are always positive integers; anything else
 * did not come from a decoder and must not reach one. */
const isUsableRasterDimension = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/**
 * `left`/`top` FLOOR and `right`/`bottom` CEIL, so every pixel the normalised
 * rectangle touches -- even one only partially covered -- is included. Flooring
 * both edges would shave the selected right/bottom pixel; ceiling both would
 * over-expand left/top. The clamp after ceil is what makes the epsilon
 * overhang a valid transform can leave (`x + width` a hair past 1) land back
 * on the raster edge instead of one pixel beyond it.
 */
export function integerPixelCropBox(
  region: NormalizedDisplayRegionLike,
  rasterWidth: unknown,
  rasterHeight: unknown,
): IntegerPixelCropBox | null {
  if (!isUsableRasterDimension(rasterWidth) || !isUsableRasterDimension(rasterHeight)) return null;

  const { x, y, width, height } = region;
  if (![x, y, width, height].every(isFiniteNumber)) return null;
  if (width <= 0 || height <= 0) return null;
  // The same edge-to-edge tolerance the domain transform already uses -- a
  // hair of float overhang is expected; a grossly out-of-range rectangle is not.
  if (x < -NORMALIZED_REGION_EPSILON || y < -NORMALIZED_REGION_EPSILON) return null;
  if (x + width > 1 + NORMALIZED_REGION_EPSILON) return null;
  if (y + height > 1 + NORMALIZED_REGION_EPSILON) return null;

  const left = clamp(Math.floor(x * rasterWidth), 0, rasterWidth - 1);
  const top = clamp(Math.floor(y * rasterHeight), 0, rasterHeight - 1);
  const right = clamp(Math.ceil((x + width) * rasterWidth), left + 1, rasterWidth);
  const bottom = clamp(Math.ceil((y + height) * rasterHeight), top + 1, rasterHeight);

  return { left, top, width: right - left, height: bottom - top };
}
