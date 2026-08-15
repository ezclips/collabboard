import { describe, expect, it } from 'vitest';
import {
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
