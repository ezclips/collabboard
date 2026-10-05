import { describe, expect, it } from 'vitest';

import type { DrawnElement } from './format';
import { deoverlap, fixSwatches } from './layoutFix';

/**
 * PATCH-283 Addendum 2, fixes 5 and 6. Deterministic de-overlap of filled cards
 * (carrying their texts and connectors), and moving a legend text off a small
 * swatch.
 */

const CARD = '#fcf4e7';
const STROKE = '#f3cc93';

describe('PATCH-283 addendum 2 fix 5 deoverlap', () => {
  it('moves the later stacked card down by the overlap plus 16px, carrying its texts and connectors', () => {
    const elements: DrawnElement[] = [
      { id: 'a', type: 'rect', x: 0, y: 0, w: 120, h: 60, fill: CARD, stroke: STROKE },
      { id: 'b', type: 'rect', x: 10, y: 20, w: 120, h: 60, fill: CARD, stroke: STROKE },
      { id: 'tb', type: 'text', text: 'Child', x: 10, y: 20, w: 100, size: 16, color: '#111111', in: 'b' },
      { id: 'conn', type: 'line', points: [[0, 0], [10, 20]], stroke: '#333333' },
    ];
    const fixes: string[] = [];
    deoverlap(elements, fixes);
    const b = elements.find((element) => element.id === 'b');
    const text = elements.find((element) => element.id === 'tb');
    const line = elements.find((element) => element.id === 'conn');
    if (b?.type !== 'rect' || text?.type !== 'text' || line?.type !== 'line') throw new Error('bad fixture');
    expect(b.y).toBe(76);
    expect(text.y).toBe(76);
    expect(line.points[1]).toEqual([10, 76]);
    expect(fixes.some((fix) => fix.includes('b'))).toBe(true);
  });

  it('moves the later card right when they sit side by side', () => {
    const elements: DrawnElement[] = [
      { id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 100, fill: CARD, stroke: STROKE },
      { id: 'b', type: 'rect', x: 50, y: 0, w: 100, h: 100, fill: CARD, stroke: STROKE },
    ];
    deoverlap(elements, []);
    const b = elements.find((element) => element.id === 'b');
    if (b?.type !== 'rect') throw new Error('bad fixture');
    expect(b.x).toBe(116);
    expect(b.y).toBe(0);
  });

  it('does not move a card fully inside another', () => {
    const elements: DrawnElement[] = [
      { id: 'a', type: 'rect', x: 0, y: 0, w: 200, h: 200, fill: CARD, stroke: STROKE },
      { id: 'b', type: 'rect', x: 20, y: 20, w: 50, h: 50, fill: CARD, stroke: STROKE },
    ];
    const fixes: string[] = [];
    deoverlap(elements, fixes);
    const b = elements.find((element) => element.id === 'b');
    if (b?.type !== 'rect') throw new Error('bad fixture');
    expect(b.x).toBe(20);
    expect(b.y).toBe(20);
    expect(fixes).toEqual([]);
  });

  it('is deterministic and leaves no overlap after a chain of moving cards', () => {
    const build = (): DrawnElement[] => [
      { id: 'a', type: 'rect', x: 0, y: 0, w: 100, h: 60, fill: CARD, stroke: STROKE },
      { id: 'b', type: 'rect', x: 10, y: 20, w: 100, h: 60, fill: CARD, stroke: STROKE },
      { id: 'c', type: 'rect', x: 20, y: 40, w: 100, h: 60, fill: CARD, stroke: STROKE },
    ];
    const first = build();
    deoverlap(first, []);
    const second = build();
    deoverlap(second, []);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('PATCH-283 addendum 2 fix 6 fixSwatches', () => {
  it('moves a free left-aligned text to the right of a small filled swatch', () => {
    const elements: DrawnElement[] = [
      { id: 'swatch', type: 'rect', x: 100, y: 50, w: 12, h: 12, fill: '#e9a23b', stroke: 'none' },
      { id: 'label', type: 'text', text: '24', x: 104, y: 52, w: 30, size: 16, color: '#111111', align: 'left' },
    ];
    const fixes: string[] = [];
    fixSwatches(elements, fixes);
    const label = elements.find((element) => element.id === 'label');
    if (label?.type !== 'text') throw new Error('bad fixture');
    expect(label.x).toBe(120);
    expect(fixes.length).toBeGreaterThan(0);
  });

  it('leaves a text that starts outside the swatch alone', () => {
    const elements: DrawnElement[] = [
      { id: 'swatch', type: 'rect', x: 100, y: 50, w: 12, h: 12, fill: '#e9a23b', stroke: 'none' },
      { id: 'label', type: 'text', text: '24', x: 200, y: 52, w: 30, size: 16, color: '#111111' },
    ];
    fixSwatches(elements, []);
    const label = elements.find((element) => element.id === 'label');
    if (label?.type !== 'text') throw new Error('bad fixture');
    expect(label.x).toBe(200);
  });

  it('does not treat a large card as a swatch', () => {
    const elements: DrawnElement[] = [
      { id: 'card', type: 'rect', x: 0, y: 0, w: 300, h: 200, fill: CARD, stroke: STROKE },
      { id: 'label', type: 'text', text: 'Title', x: 10, y: 10, w: 100, size: 16, color: '#111111' },
    ];
    fixSwatches(elements, []);
    const label = elements.find((element) => element.id === 'label');
    if (label?.type !== 'text') throw new Error('bad fixture');
    expect(label.x).toBe(10);
  });
});
