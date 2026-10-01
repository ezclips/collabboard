import { describe, expect, it } from 'vitest';

import { findVisualizeSpot, type VisualizeRect } from './visualizePlacement';

const source: VisualizeRect = { x: 0, y: 0, width: 180, height: 120 };
const size = { width: 500, height: 400 };
const rect = (x: number, y: number, width = 500, height = 400): VisualizeRect => ({ x, y, width, height });

describe('PATCH-235 findVisualizeSpot', () => {
  it('a free right side places the picture to the right at the same y', () => {
    expect(findVisualizeSpot({ source, size, others: [] })).toEqual({ x: 260, y: 0 });
  });

  it('a blocked right side steps down to the next free slot', () => {
    // Block the right at y=0; the next slot down that clears the 400-tall
    // neighbour (y=0..400 + margin) is y=480 (a multiple of the 60px step).
    const blocked = [rect(260, 0)];
    expect(findVisualizeSpot({ source, size, others: blocked })).toEqual({ x: 260, y: 480 });
  });

  it('right blocked at every step falls to the left', () => {
    const blocked = Array.from({ length: 16 }, (_, i) => rect(260, i * 60));
    const spot = findVisualizeSpot({ source, size, others: blocked });
    expect(spot.x).toBe(-580); // 0 - 80 - 500
    expect(spot.y).toBe(0);
  });

  it('everything blocked returns the first candidate (right, same y)', () => {
    const others: VisualizeRect[] = [];
    for (const x of [260, -580]) {
      for (let i = 0; i <= 15; i += 1) others.push(rect(x, i * 60));
    }
    others.push(rect(0, 200)); // below
    expect(findVisualizeSpot({ source, size, others })).toEqual({ x: 260, y: 0 });
  });

  it('respects the margin: a neighbour just inside it still blocks', () => {
    // A 500x400 neighbour at x=290 overlaps the x=260 candidate's margin, so
    // the next free step down (y=480) is chosen.
    const near = [rect(290, 0)];
    expect(findVisualizeSpot({ source, size, others: near, margin: 24 })).toEqual({ x: 260, y: 480 });

    // A neighbour clear of the margin (x=790, right of x=260..760) leaves the
    // first candidate free.
    const far = [rect(790, 0)];
    expect(findVisualizeSpot({ source, size, others: far, margin: 24 })).toEqual({ x: 260, y: 0 });
  });
});
