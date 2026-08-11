import { describe, expect, it } from 'vitest';
import { computePopoverPlacement } from './useAnchoredPopover';

const viewport = { width: 1000, height: 800 };

describe('computePopoverPlacement', () => {
  it('opens to the right when there is room', () => {
    const result = computePopoverPlacement(
      { top: 100, left: 100, width: 20, height: 20 },
      { width: 240, height: 300 },
      viewport
    );
    expect(result.placement).toBe('right');
    expect(result.left).toBe(100 + 20 + 8);
  });

  it('flips to the left near the right edge of the viewport', () => {
    const result = computePopoverPlacement(
      { top: 100, left: 900, width: 20, height: 20 },
      { width: 240, height: 300 },
      viewport
    );
    expect(result.placement).toBe('left');
    expect(result.left).toBe(900 - 8 - 240);
  });

  it('clamps left inside the viewport when neither side has full room', () => {
    const result = computePopoverPlacement(
      { top: 100, left: 5, width: 20, height: 20 },
      { width: 900, height: 300 },
      viewport
    );
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.left + 900).toBeLessThanOrEqual(viewport.width + 1);
  });

  it('clamps top so a tall popover never renders below the viewport', () => {
    const result = computePopoverPlacement(
      { top: 780, left: 100, width: 20, height: 20 },
      { width: 240, height: 500 },
      viewport
    );
    expect(result.top).toBeLessThanOrEqual(viewport.height - 500 - 8 + 1);
    expect(result.top).toBeGreaterThanOrEqual(8);
  });

  it('clamps top so it never renders above the viewport', () => {
    const result = computePopoverPlacement(
      { top: -50, left: 100, width: 20, height: 20 },
      { width: 240, height: 100 },
      viewport
    );
    expect(result.top).toBe(8);
  });

  it('prefers the side with more room when neither fits fully', () => {
    // Trigger near center with a popover wider than either side alone.
    const result = computePopoverPlacement(
      { top: 100, left: 600, width: 20, height: 20 },
      { width: 500, height: 100 },
      viewport
    );
    // spaceRight = 1000 - 620 - 8 = 372; spaceLeft = 600 - 8 = 592 -> left wins
    expect(result.placement).toBe('left');
  });
});
