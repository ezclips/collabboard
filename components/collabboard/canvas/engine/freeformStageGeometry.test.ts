import { describe, expect, it } from 'vitest';
import {
  clampGroupDragDeltaToFreeformBounds,
  clampRectPositionToFreeformBounds,
  FREEFORM_SIGNED_WORLD_HEIGHT,
  FREEFORM_SIGNED_WORLD_WIDTH,
  FREEFORM_WORLD_HEIGHT_PX,
  FREEFORM_WORLD_MAX_X,
  FREEFORM_WORLD_MAX_Y,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
  FREEFORM_WORLD_ORIGIN_OFFSET_X,
  FREEFORM_WORLD_ORIGIN_OFFSET_Y,
  FREEFORM_WORLD_WIDTH_PX,
} from './freeformStageGeometry';

// PATCH 9J -- single source of truth for the Freeform world-stage size,
// shared by the post stage (FreeformPadletCards.tsx) and the Line
// interaction layers (CanvasClient.tsx). See freeformLineWorldStage
// .architecture.test.tsx for the proof that both files actually import
// and use these exact constants.
describe('freeformStageGeometry', () => {
  it('exposes positive, finite world-stage dimensions', () => {
    expect(FREEFORM_WORLD_WIDTH_PX).toBe(10000);
    expect(FREEFORM_WORLD_HEIGHT_PX).toBe(10000);
    expect(Number.isFinite(FREEFORM_WORLD_WIDTH_PX)).toBe(true);
    expect(Number.isFinite(FREEFORM_WORLD_HEIGHT_PX)).toBe(true);
  });

  it('defines the finite signed world independently from the original logical region', () => {
    expect([FREEFORM_WORLD_MIN_X, FREEFORM_WORLD_MIN_Y]).toEqual([-5000, -5000]);
    expect([FREEFORM_WORLD_MAX_X, FREEFORM_WORLD_MAX_Y]).toEqual([15000, 15000]);
    expect([FREEFORM_SIGNED_WORLD_WIDTH, FREEFORM_SIGNED_WORLD_HEIGHT]).toEqual([20000, 20000]);
    expect([FREEFORM_WORLD_ORIGIN_OFFSET_X, FREEFORM_WORLD_ORIGIN_OFFSET_Y]).toEqual([5000, 5000]);
  });

  it.each([
    [-5000, -5000, true],
    [-4500, -4500, true],
    [-1000, -500, true],
    [-100, -100, true],
    [14900, 14900, true],
    [15000, 15000, true],
    [-5001, -5001, false],
    [15001, 15001, false],
  ])('characterizes signed-stage point (%s,%s)', (x, y, inside) => {
    const isInside = x >= FREEFORM_WORLD_MIN_X && x <= FREEFORM_WORLD_MAX_X
      && y >= FREEFORM_WORLD_MIN_Y && y <= FREEFORM_WORLD_MAX_Y;
    expect(isInside).toBe(inside);
  });
});

// PATCH 9V.2B -- the placement contract itself. Everything that may write a
// root post's world position (drag, create, drop, detach, paste, duplicate,
// synced copy, new column) resolves through these two functions, so their
// behaviour IS the product rule "objects live in the signed world, never in
// the outer camera gutter".
describe('PATCH 9V.2B: clampRectPositionToFreeformBounds [matrix 1-10]', () => {
  const NOTE = { width: 180, height: 220 };

  it('leaves a point that is already inside the signed world untouched [1]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 1200, y: 640, ...NOTE })).toEqual({ x: 1200, y: 640 });
  });

  it('accepts a negative x [2]', () => {
    expect(clampRectPositionToFreeformBounds({ x: -300, y: 640, ...NOTE })).toEqual({ x: -300, y: 640 });
  });

  it('accepts a negative y [3]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 1200, y: -300, ...NOTE })).toEqual({ x: 1200, y: -300 });
  });

  it('accepts both coordinates negative [4]', () => {
    expect(clampRectPositionToFreeformBounds({ x: -4500, y: -4500, ...NOTE })).toEqual({ x: -4500, y: -4500 });
  });

  it('clamps a left underflow to the world minimum [5]', () => {
    expect(clampRectPositionToFreeformBounds({ x: -6000, y: 0, ...NOTE }).x).toBe(FREEFORM_WORLD_MIN_X);
  });

  it('clamps a top underflow to the world minimum [6]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 0, y: -6000, ...NOTE }).y).toBe(FREEFORM_WORLD_MIN_Y);
  });

  it('bounds the RIGHT edge, not the left corner, at the max side [7]', () => {
    // A 180-wide post's top-left may only reach 15000 - 180 = 14820.
    expect(clampRectPositionToFreeformBounds({ x: 14950, y: 0, ...NOTE }).x).toBe(14820);
    expect(clampRectPositionToFreeformBounds({ x: 14820, y: 0, ...NOTE }).x).toBe(14820);
    expect(clampRectPositionToFreeformBounds({ x: 14819, y: 0, ...NOTE }).x).toBe(14819);
  });

  it('bounds the BOTTOM edge, not the top corner, at the max side [8]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 0, y: 14950, ...NOTE }).y).toBe(15000 - 220);
  });

  it('anchors an over-wide object at the world minimum instead of inverting the range [9]', () => {
    const oversized = clampRectPositionToFreeformBounds({
      x: 0,
      y: 0,
      width: FREEFORM_SIGNED_WORLD_WIDTH + 5000,
      height: 220,
    });
    expect(oversized.x).toBe(FREEFORM_WORLD_MIN_X);
    expect(oversized.y).toBe(0);
  });

  it('anchors an over-tall object at the world minimum instead of inverting the range [10]', () => {
    const oversized = clampRectPositionToFreeformBounds({
      x: 0,
      y: 0,
      width: 180,
      height: FREEFORM_SIGNED_WORLD_HEIGHT + 5000,
    });
    expect(oversized.y).toBe(FREEFORM_WORLD_MIN_Y);
    expect(oversized.x).toBe(0);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', Number.NaN],
    ['negative', -50],
    ['zero', 0],
  ])('treats a %s dimension as a zero span rather than poisoning the clamp', (_label, size) => {
    expect(clampRectPositionToFreeformBounds({ x: 14950, y: -6000, width: size, height: size }))
      .toEqual({ x: 14950, y: FREEFORM_WORLD_MIN_Y });
  });

  it('falls back to 0 for a non-finite coordinate instead of emitting NaN', () => {
    expect(clampRectPositionToFreeformBounds({ x: Number.NaN, y: Number.NaN, ...NOTE }))
      .toEqual({ x: 0, y: 0 });
  });
});

describe('PATCH 9V.2B: clampGroupDragDeltaToFreeformBounds [matrix 26-30, 38]', () => {
  // Two posts 500 apart; the group spans x 200..1080 (rightmost is 180 wide).
  const GROUP = { minX: 200, minY: 200, maxX: 1080, maxY: 920 };

  it('passes an unobstructed delta through unchanged [26]', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: -1500, dy: -900 }))
      .toEqual({ dx: -1500, dy: -900 });
  });

  it('clamps the delta ONCE at the left edge, by the group minimum [27]', () => {
    // minX 200 may travel to -5000, i.e. dx >= -5200.
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: -9000, dy: 0 }).dx).toBe(-5200);
  });

  it('clamps the delta at the right edge, by the group MAXIMUM [28]', () => {
    // maxX 1080 may travel to 15000, i.e. dx <= 13920.
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: 99999, dy: 0 }).dx).toBe(13920);
  });

  it('clamps the delta at the top edge [29]', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: 0, dy: -9000 }).dy).toBe(-5200);
  });

  it('clamps the delta at the bottom edge [30]', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: 0, dy: 99999 }).dy).toBe(15000 - 920);
  });

  it('reproduces the specification worked example (group minX -4900, dx -500 -> -100)', () => {
    const bounds = { minX: -4900, minY: 0, maxX: -4720, maxY: 220 };
    expect(clampGroupDragDeltaToFreeformBounds(bounds, { dx: -500, dy: 0 }).dx).toBe(-100);
  });

  it('anchors an oversized group at the world minimum rather than inverting the range', () => {
    const huge = { minX: -4000, minY: -4000, maxX: 25000, maxY: 25000 };
    // Lower bound (-1000) exceeds the upper bound (-10000): min-side wins.
    expect(clampGroupDragDeltaToFreeformBounds(huge, { dx: 0, dy: 0 }))
      .toEqual({ dx: -1000, dy: -1000 });
  });

  it('substitutes 0 for a non-finite requested delta', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: Number.NaN, dy: Number.NaN }))
      .toEqual({ dx: 0, dy: 0 });
  });
});
