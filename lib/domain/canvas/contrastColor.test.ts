import { describe, expect, it } from 'vitest';
import { contrastIconColor } from './contrastColor';

describe('contrastIconColor (PATCH-295 extraction)', () => {
  it('returns near-white text for a dark strip', () => {
    expect(contrastIconColor('#4f46e5')).toBe('#f8fafc');
    expect(contrastIconColor('#000000')).toBe('#f8fafc');
  });

  it('returns near-black text for a light strip', () => {
    expect(contrastIconColor('#fde68a')).toBe('#1e293b');
    expect(contrastIconColor('#ffffff')).toBe('#1e293b');
  });

  it('expands 3-digit hex before measuring luminance', () => {
    expect(contrastIconColor('#fff')).toBe('#1e293b');
  });

  it('falls back to near-black for malformed input', () => {
    expect(contrastIconColor('not-a-color')).toBe('#1e293b');
  });
});
