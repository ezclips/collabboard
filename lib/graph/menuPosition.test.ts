import { describe, expect, it } from 'vitest';

import { clampMenuPosition } from './menuPosition';

const VW = 1600;
const VH = 1000;
const W = 260;
const H = 320;

describe('PATCH-226 clampMenuPosition', () => {
  it('leaves an in-viewport position unchanged', () => {
    expect(clampMenuPosition(300, 200, W, H, VW, VH)).toEqual({ left: 300, top: 200 });
  });

  it('pulls a position past the right edge back to the margin', () => {
    // 1600 - 260 - 8 = 1332
    const { left, top } = clampMenuPosition(1580, 200, W, H, VW, VH);
    expect(left).toBe(1332);
    expect(top).toBe(200);
  });

  it('pulls a position past the bottom edge back to the margin', () => {
    // 1000 - 320 - 8 = 672
    const { left, top } = clampMenuPosition(300, 980, W, H, VW, VH);
    expect(left).toBe(300);
    expect(top).toBe(672);
  });

  it('clamps a negative position to the 8px margin', () => {
    expect(clampMenuPosition(-50, -10, W, H, VW, VH)).toEqual({ left: 8, top: 8 });
  });

  it('still returns the margin when the viewport is smaller than the menu', () => {
    expect(clampMenuPosition(500, 500, W, H, 100, 100)).toEqual({ left: 8, top: 8 });
  });
});
