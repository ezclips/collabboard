import { describe, expect, it } from 'vitest';
import { integerPixelCropBox } from './knowledgeRasterCropGeometry';

/**
 * P6J-F9-C1. Every expected box is hand-computed from the locked
 * floor-left/top, ceil-right/bottom rule -- never by calling the helper under
 * test. P13/P14 use the B1 display regions the B2 rotation runtime already
 * proved by hand, so a raster of the same aspect exercises real numbers.
 */

describe('P6J-F9-C1 integer pixel crop box', () => {
  it('P1: the full page crops the whole raster', () => {
    expect(integerPixelCropBox({ x: 0, y: 0, width: 1, height: 1 }, 500, 700))
      .toEqual({ left: 0, top: 0, width: 500, height: 700 });
  });

  it('P2: the top-left quadrant', () => {
    expect(integerPixelCropBox({ x: 0, y: 0, width: 0.5, height: 0.5 }, 400, 300))
      .toEqual({ left: 0, top: 0, width: 200, height: 150 });
  });

  it('P3: the bottom-right quadrant', () => {
    expect(integerPixelCropBox({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 }, 400, 300))
      .toEqual({ left: 200, top: 150, width: 200, height: 150 });
  });

  it('P4: the exact right edge lands on the raster width', () => {
    const box = integerPixelCropBox({ x: 0.8, y: 0, width: 0.2, height: 1 }, 500, 100)!;
    expect(box).toEqual({ left: 400, top: 0, width: 100, height: 100 });
    expect(box.left + box.width).toBe(500);
  });

  it('P5: the exact bottom edge lands on the raster height', () => {
    const box = integerPixelCropBox({ x: 0, y: 0.75, width: 1, height: 0.25 }, 100, 400)!;
    expect(box).toEqual({ left: 0, top: 300, width: 100, height: 100 });
    expect(box.top + box.height).toBe(400);
  });

  it('P6: a tiny positive region still crops at least one pixel', () => {
    const box = integerPixelCropBox({ x: 0.001, y: 0.001, width: 0.0001, height: 0.0001 }, 100, 100)!;
    expect(box.width).toBeGreaterThanOrEqual(1);
    expect(box.height).toBeGreaterThanOrEqual(1);
  });

  it('P7: float overhang from a valid transform clamps to the raster edge, never past it', () => {
    // 1 + 1e-12 is the exact kind of overhang sourceRegionToDisplayRegion can
    // leave on an edge-to-edge selection; it must not become a 258th pixel.
    const box = integerPixelCropBox({ x: 0, y: 0, width: 1 + 1e-12, height: 1 }, 257, 257)!;
    expect(box).toEqual({ left: 0, top: 0, width: 257, height: 257 });
  });

  it('P8: a 1x1 raster crops to exactly 1x1', () => {
    expect(integerPixelCropBox({ x: 0, y: 0, width: 1, height: 1 }, 1, 1))
      .toEqual({ left: 0, top: 0, width: 1, height: 1 });
  });

  it('P9: a landscape raster', () => {
    expect(integerPixelCropBox({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 800, 200))
      .toEqual({ left: 200, top: 50, width: 400, height: 100 });
  });

  it('P10: a portrait raster', () => {
    expect(integerPixelCropBox({ x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 200, 800))
      .toEqual({ left: 50, top: 200, width: 100, height: 400 });
  });

  it.each([
    ['zero width', 0, 100], ['zero height', 100, 0],
    ['negative width', -500, 100], ['fractional width', 500.5, 100],
    ['NaN width', Number.NaN, 100], ['infinite width', Number.POSITIVE_INFINITY, 100],
  ])('P11: refuses an invalid raster dimension (%s)', (_label, w, h) => {
    expect(integerPixelCropBox({ x: 0, y: 0, width: 0.5, height: 0.5 }, w, h)).toBeNull();
  });

  it.each([
    ['NaN x', { x: Number.NaN, y: 0, width: 0.5, height: 0.5 }],
    ['infinite width', { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 0.5 }],
    ['zero width', { x: 0.2, y: 0.2, width: 0, height: 0.5 }],
    ['negative height', { x: 0.2, y: 0.2, width: 0.5, height: -0.1 }],
    ['grossly out of bounds', { x: 2, y: 0, width: 0.1, height: 0.1 }],
  ])('P12: refuses an invalid region (%s)', (_label, region) => {
    expect(integerPixelCropBox(region, 100, 100)).toBeNull();
  });

  it('P13: a 90-degree hand-computed display region on a landscape raster', () => {
    // Source (0.1,0.1,0.4,0.5) at rotation 90 -> display (0.1,0.5,0.5,0.4).
    expect(integerPixelCropBox({ x: 0.1, y: 0.5, width: 0.5, height: 0.4 }, 800, 600))
      .toEqual({ left: 80, top: 300, width: 400, height: 240 });
  });

  it('P14: a 270-degree hand-computed display region on a landscape raster', () => {
    // Source (0.1,0.1,0.4,0.5) at rotation 270 -> display (0.4,0.1,0.5,0.4).
    expect(integerPixelCropBox({ x: 0.4, y: 0.1, width: 0.5, height: 0.4 }, 800, 600))
      .toEqual({ left: 320, top: 60, width: 400, height: 240 });
  });

  it('right/bottom round UP (ceil), not down: a floor there would shave the selected pixel', () => {
    // Not a boundary multiple on purpose: floor and ceil disagree here, and
    // neither result gets rescued by the left/top clamp.
    const box = integerPixelCropBox({ x: 0, y: 0, width: 0.333, height: 0.667 }, 300, 300)!;
    expect(box.width).toBe(100); // ceil(99.9) = 100, not floor's 99
    expect(box.height).toBe(201); // ceil(200.1) = 201, not floor's 200
  });

  it('P15: every valid box stays inside the raster bounds', () => {
    const rasters = [[500, 700], [800, 200], [1, 1], [2000, 2000]] as const;
    const regions = [
      { x: 0, y: 0, width: 1, height: 1 },
      { x: 0.1, y: 0.1, width: 0.4, height: 0.5 },
      { x: 0.99, y: 0.99, width: 0.01, height: 0.01 },
      { x: 0, y: 0.5, width: 0.5, height: 0.5 },
      { x: 0.3333, y: 0.6667, width: 0.3333, height: 0.3333 },
    ];
    for (const [w, h] of rasters) {
      for (const region of regions) {
        const box = integerPixelCropBox(region, w, h)!;
        expect(box.left, `left @ ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(box.top, `top @ ${w}x${h}`).toBeGreaterThanOrEqual(0);
        expect(box.width, `width @ ${w}x${h}`).toBeGreaterThanOrEqual(1);
        expect(box.height, `height @ ${w}x${h}`).toBeGreaterThanOrEqual(1);
        expect(box.left + box.width, `right @ ${w}x${h}`).toBeLessThanOrEqual(w);
        expect(box.top + box.height, `bottom @ ${w}x${h}`).toBeLessThanOrEqual(h);
      }
    }
  });
});
