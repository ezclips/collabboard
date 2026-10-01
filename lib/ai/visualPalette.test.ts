import { describe, expect, it } from 'vitest';

import { VISUAL_PALETTE, paletteAt } from './visualPalette';

describe('PATCH-234 visualPalette', () => {
  it('exposes six stroke/fill/text/detail sets', () => {
    expect(VISUAL_PALETTE).toHaveLength(6);
    for (const color of VISUAL_PALETTE) {
      expect(color.stroke).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(color.fill).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(color.text).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(color.detail).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
    expect(VISUAL_PALETTE[0]).toEqual({ stroke: '#E9A23B', fill: '#FCEFD9', text: '#5A3B06', detail: '#374151' });
  });

  it('cycles by index, wrapping both directions', () => {
    expect(paletteAt(0)).toBe(VISUAL_PALETTE[0]);
    expect(paletteAt(5)).toBe(VISUAL_PALETTE[5]);
    expect(paletteAt(6)).toBe(VISUAL_PALETTE[0]);
    expect(paletteAt(7)).toBe(VISUAL_PALETTE[1]);
    expect(paletteAt(-1)).toBe(VISUAL_PALETTE[5]);
  });
});
