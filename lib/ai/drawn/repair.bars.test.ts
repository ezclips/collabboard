import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

import type { DrawnPicture } from './format';
import { repairPicture } from './repair';

/**
 * PATCH-283 Addendum 2, fixes 2b and 4. Value labels follow a rescaled bar; a bar
 * with no value is left exactly as drawn and only a BAR kind reports no-data.
 */

const OUTLINE: VisualOutline = {
  title: 'Budget',
  ordered: false,
  kind: 'parts',
  items: [
    { label: 'A', value: 24 },
    { label: 'B', value: 40 },
    { label: 'C', value: 26 },
    { label: 'D', value: 10 },
    { label: 'E', value: 12 },
  ],
};

const NO_VALUE_OUTLINE: VisualOutline = {
  title: 'Compare',
  ordered: false,
  kind: 'comparison',
  items: [{ label: 'A' }, { label: 'B' }],
};

function bar(item: number, y: number): DrawnPicture {
  return {
    version: 1,
    width: 800,
    height: 600,
    background: '#ffffff',
    elements: [
      { id: `bar${item}`, type: 'bar', item, x: 100, y, w: 60, h: 200, orient: 'v', fill: '#aabbcc' },
    ],
  };
}

describe('PATCH-283 addendum 2 fix 2b bar labels follow', () => {
  it('moves a value label with the rescaled bar it sits above', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 'bar0', type: 'bar', item: 0, x: 100, y: 100, w: 60, h: 200, orient: 'v', fill: '#aabbcc' },
        { id: 'bar1', type: 'bar', item: 1, x: 200, y: 100, w: 60, h: 200, orient: 'v', fill: '#aabbcc' },
        { id: 'value', type: 'text', text: '24', x: 120, y: 80, w: 30, size: 16, color: '#111111', item: 0 },
      ],
    };
    const { picture: repaired } = repairPicture(picture, OUTLINE);
    const bar0 = repaired.elements.find((element) => element.id === 'bar0');
    const label = repaired.elements.find((element) => element.id === 'value');
    if (bar0?.type !== 'bar' || label?.type !== 'text') throw new Error('bad fixture');
    // Bar 0 (24) shrinks from 200 to 120; its original top 100 returns at 180.
    expect(bar0.h).toBe(120);
    expect(bar0.y).toBe(180);
    expect(label.y).toBe(160);
  });

  it('leaves a value label that is far from the bar free end', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 'bar0', type: 'bar', item: 0, x: 100, y: 100, w: 60, h: 200, orient: 'v', fill: '#aabbcc' },
        { id: 'value', type: 'text', text: 'legend', x: 120, y: 400, w: 30, size: 16, color: '#111111', item: 0 },
      ],
    };
    const { picture: repaired } = repairPicture(picture, OUTLINE);
    const label = repaired.elements.find((element) => element.id === 'value');
    if (label?.type !== 'text') throw new Error('bad fixture');
    expect(label.y).toBe(400);
  });
});

describe('PATCH-283 addendum 2 fix 4 decorative bars', () => {
  it('keeps a bar with no value exactly as drawn and reports no no-data', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [{ id: 'deco', type: 'bar', item: 0, x: 100, y: 100, w: 60, h: 50, orient: 'v', fill: '#aabbcc' }],
    };
    const { picture: repaired, issues } = repairPicture(picture, NO_VALUE_OUTLINE, 'comparison');
    const bar = repaired.elements.find((element) => element.id === 'deco');
    if (bar?.type !== 'bar') throw new Error('bad fixture');
    expect(bar.h).toBe(50);
    expect(bar.y).toBe(100);
    expect(issues.some((issue) => issue.type === 'no-data')).toBe(false);
  });

  it('reports no-data for a bar kind with no item values', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [{ id: 'deco', type: 'bar', item: 0, x: 100, y: 100, w: 60, h: 50, orient: 'v', fill: '#aabbcc' }],
    };
    const { issues } = repairPicture(picture, NO_VALUE_OUTLINE, 'bar');
    expect(issues.some((issue) => issue.type === 'no-data')).toBe(true);
  });
});
