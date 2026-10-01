import { describe, expect, it } from 'vitest';

import { VISUAL_ICON_NAMES } from '@/lib/ai/visualIcons';
import { iconSymbolSvg } from './icons';

const UNKNOWN = iconSymbolSvg('definitely-not-an-icon');

describe('PATCH-241 icon symbols', () => {
  it('builds a stroke symbol with the icon geometry', () => {
    const svg = iconSymbolSvg('sun');
    expect(svg.startsWith('<symbol')).toBe(true);
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('<circle');
    expect(svg).not.toContain('key=');
  });

  it('falls back to a neutral dot for unknown names, never empty', () => {
    expect(UNKNOWN).toContain('<symbol');
    expect(UNKNOWN).toContain('<circle cx="12" cy="12" r="3"');
  });

  it('resolves every name in VISUAL_ICON_NAMES to real geometry', () => {
    for (const name of VISUAL_ICON_NAMES) {
      const svg = iconSymbolSvg(name);
      expect(svg, `${name} must build`).toContain('<symbol');
      expect(svg, `${name} must not be the fallback`).not.toBe(UNKNOWN);
    }
  });
});
