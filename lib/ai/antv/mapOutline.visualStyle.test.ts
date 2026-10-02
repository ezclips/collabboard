import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { fontStack } from '@/lib/ai/visualStyle';
import { toAntvOptions } from './mapOutline';

function outline(over: Partial<VisualOutline> = {}): VisualOutline {
  return {
    title: 'Seasons',
    ordered: false,
    kind: 'list',
    items: [{ label: 'Spring' }, { label: 'Summer' }],
    ...over,
  };
}

describe('PATCH-253 toAntvOptions style', () => {
  it('without a style is byte-identical to the pre-style call', () => {
    expect(toAntvOptions(outline(), 'list-row-simple')).toEqual({
      template: 'list-row-simple',
      theme: 'light',
      palette: 'patch241-classic',
      themeConfig: { palette: 'patch241-classic' },
      data: { title: 'Seasons', items: [{ label: 'Spring' }, { label: 'Summer' }] },
    });
  });

  it('sets colorBg, the palette array and the font attributes from a style', () => {
    const options = toAntvOptions(outline(), 'list-row-simple', 'ocean', {
      background: '#112233',
      colors: ['#ff0000', '#00ff00'],
      fonts: {
        title: { family: 'serif', weight: 700 },
        label: { family: 'mono', weight: 500 },
        desc: { family: 'hand', weight: 400 },
      },
    });
    expect(options.themeConfig.colorBg).toBe('#112233');
    expect(options.themeConfig.palette).toEqual(['#ff0000', '#00ff00']);
    expect(options.themeConfig.title).toEqual({ 'font-family': fontStack('serif'), 'font-weight': 700 });
    expect(options.themeConfig.item?.label).toEqual({ 'font-family': fontStack('mono'), 'font-weight': 500 });
    expect(options.themeConfig.desc).toEqual({ 'font-family': fontStack('hand'), 'font-weight': 400 });
    expect(options.themeConfig.item?.desc).toEqual({ 'font-family': fontStack('hand'), 'font-weight': 400 });
  });

  it('keeps the registered palette name when the style has no colours', () => {
    const options = toAntvOptions(outline(), 'list-row-simple', 'forest', { background: '#112233' });
    expect(options.themeConfig.palette).toBe('patch241-forest');
    expect(options.palette).toBe('patch241-forest');
    expect(options.themeConfig.colorBg).toBe('#112233');
  });

  it('lets a per-item text style from PATCH-244 win over the style', () => {
    const base = outline({
      items: [{ label: 'Spring', textStyle: { label: { fill: '#ff0000' } } }, { label: 'Summer' }],
    });
    const options = toAntvOptions(base, 'list-row-simple', undefined, {
      fonts: { label: { family: 'mono', weight: 500 } },
    });
    expect(options.data.items[0].attributes).toEqual({ label: { fill: '#ff0000' } });
  });
});
