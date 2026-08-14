import { describe, expect, it } from 'vitest';
import { FREEFORM_WORLD_WIDTH_PX, FREEFORM_WORLD_HEIGHT_PX } from './freeformStageGeometry';

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
});
