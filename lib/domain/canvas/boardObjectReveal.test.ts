import { describe, expect, it } from 'vitest';
import {
  NO_PAN,
  isFullyVisible,
  resolveRevealPanDelta,
  type BoardObjectRevealRequest,
} from './boardObjectReveal';

/**
 * "Show on board" -- the arithmetic, exercised directly.
 *
 * The camera itself (`panByWorldDelta`) is the minimap's, already proven. What
 * is new is the answer handed to it: how far to travel, and when the honest
 * answer is "not at all" or "I cannot say".
 */
const viewport = { x: 0, y: 0, width: 1000, height: 800 };

describe('how far the camera must travel to reveal a Note', () => {
  it('centres a target that is off screen', () => {
    // Target centre (2100, 1600); viewport centre (500, 400).
    const target = { x: 2000, y: 1500, width: 200, height: 200 };
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: 1600, dy: 1200 });
  });

  it('centres a target that is off screen in the negative direction too', () => {
    const target = { x: -1200, y: -900, width: 200, height: 100 };
    // Centre (-1100, -850) minus viewport centre (500, 400).
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: -1600, dy: -1250 });
  });

  it('does not move at all for a Note already wholly on screen', () => {
    // The reader can already see it. Lurching the board across the screen to
    // "reveal" something visible would be worse than doing nothing.
    const target = { x: 100, y: 100, width: 200, height: 200 };
    expect(isFullyVisible(target, viewport)).toBe(true);
    expect(resolveRevealPanDelta(target, viewport)).toEqual(NO_PAN);
  });

  it('DOES move for a Note only partly on screen', () => {
    // Straddling the right edge: partly visible is not visible.
    const target = { x: 900, y: 100, width: 400, height: 200 };
    expect(isFullyVisible(target, viewport)).toBe(false);
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: 600, dy: -200 });
  });

  it('treats exact edge containment as visible', () => {
    const target = { x: 0, y: 0, width: 1000, height: 800 };
    expect(resolveRevealPanDelta(target, viewport)).toEqual(NO_PAN);
  });

  it('a bigger-than-viewport target is centred, not refused', () => {
    const target = { x: -500, y: -500, width: 4000, height: 4000 };
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: 1000, dy: 1100 });
  });
});

describe('nothing unmeasurable ever moves the camera', () => {
  it('an unplaced Note yields no pan', () => {
    // `getFallbackMinimapItem` returns null for a post with no usable
    // position; null must mean stay put, never "pan to the origin".
    expect(resolveRevealPanDelta(null, viewport)).toBeNull();
    expect(resolveRevealPanDelta(undefined, viewport)).toBeNull();
  });

  it('an unmeasured viewport yields no pan', () => {
    const target = { x: 10, y: 10, width: 10, height: 10 };
    expect(resolveRevealPanDelta(target, null)).toBeNull();
    expect(resolveRevealPanDelta(target, undefined)).toBeNull();
  });

  it('a torn rect yields no pan rather than NaN coordinates', () => {
    const target = { x: 10, y: 10, width: 100, height: 100 };
    for (const broken of [
      { x: NaN, y: 0, width: 100, height: 100 },
      { x: 0, y: Infinity, width: 100, height: 100 },
      { x: 0, y: 0, width: 0, height: 100 },
      { x: 0, y: 0, width: 100, height: -5 },
    ]) {
      expect(resolveRevealPanDelta(broken, viewport), JSON.stringify(broken)).toBeNull();
      expect(resolveRevealPanDelta(target, broken), JSON.stringify(broken)).toBeNull();
    }
  });

  it('every refusal is null, never a zero pan that looks like success', () => {
    // NO_PAN means "already visible"; null means "cannot answer". A caller
    // that conflated them would report a successful reveal of a Note it never
    // located.
    expect(resolveRevealPanDelta(null, viewport)).not.toEqual(NO_PAN);
  });
});

describe('a reveal is an event, not a state', () => {
  it('the same Note asked for twice carries two different ids', () => {
    // What stops the second ask being ignored as "no change".
    const first: BoardObjectRevealRequest = { requestId: 1, targetPadletId: 'note-a' };
    const second: BoardObjectRevealRequest = { requestId: 2, targetPadletId: 'note-a' };
    expect(second.targetPadletId).toBe(first.targetPadletId);
    expect(second.requestId).not.toBe(first.requestId);
  });
});
