import { describe, expect, it } from 'vitest';

import type { DrawnElement } from './format';
import { fitTexts } from './textFit';

/**
 * PATCH-283 Addendum 2, fix 1. Several `in` texts in one card are stacked in
 * order, not centred on top of each other; the card grows to fit the stack.
 */

function cardAndTexts(): DrawnElement[] {
  return [
    { id: 'card', type: 'rect', x: 50, y: 50, w: 160, h: 40, fill: '#aabbcc', stroke: '#000000' },
    {
      id: 'label',
      type: 'text',
      text: 'Spring',
      x: 50,
      y: 50,
      w: 140,
      size: 18,
      color: '#111111',
      in: 'card',
    },
    {
      id: 'detail',
      type: 'text',
      text: 'Planting and first blooms',
      x: 50,
      y: 50,
      w: 140,
      size: 14,
      color: '#333333',
      in: 'card',
    },
  ];
}

describe('PATCH-283 addendum 2 fix 1 fitTexts', () => {
  it('stacks texts sharing one card in element order', () => {
    const elements = cardAndTexts();
    const fixes: string[] = [];
    fitTexts(elements, fixes);
    const label = elements.find((element) => element.id === 'label');
    const detail = elements.find((element) => element.id === 'detail');
    const card = elements.find((element) => element.id === 'card');
    if (label?.type !== 'text' || detail?.type !== 'text' || card?.type !== 'rect') throw new Error('bad fixture');
    expect(label.y).toBeLessThan(detail.y);
    expect((label.y + (label.boxHeight ?? 0))).toBeLessThanOrEqual(detail.y);
    expect(detail.y + (detail.boxHeight ?? 0)).toBeLessThanOrEqual(card.y + card.h + 0.001);
    expect(fixes.length).toBeGreaterThan(0);
  });

  it('centres each text horizontally in its card', () => {
    const elements = cardAndTexts();
    fitTexts(elements, []);
    const card = elements.find((element) => element.id === 'card');
    if (card?.type !== 'rect') throw new Error('bad fixture');
    for (const id of ['label', 'detail']) {
      const text = elements.find((element) => element.id === id);
      if (text?.type !== 'text') throw new Error('bad fixture');
      expect(text.x).toBeCloseTo(card.x + (card.w - text.w) / 2, 5);
    }
  });

  it('is idempotent', () => {
    const once = cardAndTexts();
    fitTexts(once, []);
    const snapshot = JSON.stringify(once);
    fitTexts(once, []);
    expect(JSON.stringify(once)).toBe(snapshot);
  });

  it('still widens free text whose longest word is wider than its box', () => {
    const elements: DrawnElement[] = [
      { id: 't', type: 'text', text: 'WWWWWWWW', x: 10, y: 10, w: 5, size: 16, color: '#111111' },
    ];
    const fixes: string[] = [];
    fitTexts(elements, fixes);
    const text = elements[0];
    if (text.type !== 'text') throw new Error('bad fixture');
    expect(text.w).toBeGreaterThan(5);
    expect(fixes.some((fix) => fix.includes('widened'))).toBe(true);
  });
});
