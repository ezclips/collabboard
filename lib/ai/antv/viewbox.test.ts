import { describe, expect, it } from 'vitest';

import {
  clampZoom,
  fitScale,
  panViewBox,
  parseViewBox,
  scaleViewBox,
  viewBoxToString,
} from './viewbox';

describe('PATCH-245 antv viewBox helpers', () => {
  it('parses a viewBox string and rejects malformed ones', () => {
    expect(parseViewBox('0 0 100 50')).toEqual({ x: 0, y: 0, width: 100, height: 50 });
    expect(parseViewBox('-10, -20, 30, 40')).toEqual({ x: -10, y: -20, width: 30, height: 40 });
    expect(parseViewBox(null)).toBeNull();
    expect(parseViewBox('0 0 nope')).toBeNull();
    expect(parseViewBox('0 0 10')).toBeNull();
  });

  it('round-trips a viewBox', () => {
    expect(viewBoxToString({ x: 1, y: 2, width: 3, height: 4 })).toBe('1 2 3 4');
  });

  it('fits a wide and a tall picture, clamped to 25%–200%', () => {
    // Wide picture in a square-ish stage: height-limited.
    expect(fitScale(800, 600, 1600, 300)).toBeCloseTo(0.5);
    // Tall picture: width-limited.
    expect(fitScale(800, 600, 300, 1200)).toBeCloseTo(0.5);
    // A tiny picture is drawn BIG, but never past 200%.
    expect(fitScale(800, 600, 200, 150)).toBe(2);
    // A giant picture shrinks, but never below 25%.
    expect(fitScale(800, 600, 8000, 6000)).toBe(0.25);
  });

  it('clamps manual zoom to 25%–400%', () => {
    expect(clampZoom(0.1)).toBe(0.25);
    expect(clampZoom(5)).toBe(4);
    expect(clampZoom(1.5)).toBe(1.5);
    expect(clampZoom(Number.NaN)).toBe(1);
  });

  it('zooms around the pointer (the pivot stays fixed)', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const pivot = { x: 25, y: 75 };
    const next = scaleViewBox(box, 0.5, pivot);
    // The pivot's relative position in the box is unchanged.
    expect((pivot.x - next.x) / next.width).toBeCloseTo((pivot.x - box.x) / box.width);
    expect((pivot.y - next.y) / next.height).toBeCloseTo((pivot.y - box.y) / box.height);
  });

  it('pans against the drag, like AntV DragCanvas', () => {
    expect(panViewBox({ x: 0, y: 0, width: 100, height: 100 }, 10, -5)).toEqual({
      x: -10,
      y: 5,
      width: 100,
      height: 100,
    });
  });
});
