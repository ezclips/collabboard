import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

import type { DrawnPicture } from './format';
import { repairPicture } from './repair';

/**
 * PATCH-283 C. The deterministic repair pass: our code owns data geometry and
 * text fitting; issues are reported but not silently "fixed".
 */

function outlineWithValues(values: number[], labels?: string[]): VisualOutline {
  return {
    title: 'Chart',
    ordered: false,
    kind: 'parts',
    items: values.map((value, index) => ({
      label: labels?.[index] ?? `Item ${index + 1}`,
      value,
    })),
  };
}

const DEG = 180 / Math.PI;

describe('PATCH-283 repairPicture data', () => {
  it('recomputes wedge angles from item values in order', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [0, 1, 2, 3].map((item) => ({
        id: `w${item}`,
        type: 'wedge' as const,
        item,
        cx: 200,
        cy: 200,
        r: 100,
        inner: 50,
        fill: '#aabbcc',
      })),
    };
    const { picture: repaired } = repairPicture(picture, outlineWithValues([24, 40, 26, 10]));
    const wedges = repaired.elements.filter((element) => element.type === 'wedge');
    expect(wedges).toHaveLength(4);
    const spans = wedges.map((wedge) => {
      if (wedge.type !== 'wedge') throw new Error('expected wedge');
      return Math.round(((wedge.endAngle ?? 0) - (wedge.startAngle ?? 0)) * DEG * 10) / 10;
    });
    expect(spans).toEqual([86.4, 144, 93.6, 36]);
    const starts = wedges.map((wedge) => {
      if (wedge.type !== 'wedge') throw new Error('expected wedge');
      return Math.round((wedge.startAngle ?? 0) * DEG * 10) / 10;
    });
    expect(starts).toEqual([0, 86.4, 230.4, 324]);
  });

  it('drops wedges whose item has no positive value and reports no-data when none remain', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [{ id: 'w0', type: 'wedge', item: 0, cx: 100, cy: 100, r: 50, fill: '#aabbcc' }],
    };
    const { picture: repaired, issues, fixes } = repairPicture(picture, outlineWithValues([0]));
    expect(repaired.elements.filter((element) => element.type === 'wedge')).toHaveLength(0);
    expect(issues.some((issue) => issue.type === 'no-data')).toBe(true);
    expect(fixes.length).toBeGreaterThan(0);
  });

  it('scales bars proportionally to the largest drawn bar', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [24, 40, 26, 10].map((value, item) => ({
        id: `b${item}`,
        type: 'bar' as const,
        item,
        x: 40 + item * 80,
        y: 100,
        w: 60,
        h: 200,
        orient: 'v' as const,
        fill: '#aabbcc',
      })),
    };
    const { picture: repaired } = repairPicture(picture, outlineWithValues([24, 40, 26, 10]));
    const heights = repaired.elements
      .filter((element) => element.type === 'bar')
      .map((bar) => (bar.type === 'bar' ? bar.h : 0));
    expect(heights).toEqual([120, 200, 130, 50]);
    for (const height of heights) {
      expect(Math.abs(height - (height / 5) * 5)).toBeLessThan(0.5);
    }
  });
});

describe('PATCH-283 repairPicture text', () => {
  it('grows a container to fit a long label and centres the text inside', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 'card', type: 'rect', x: 50, y: 50, w: 100, h: 40, fill: '#aabbcc', stroke: '#000000' },
        {
          id: 'label',
          type: 'text',
          text: 'A rather long label that will not fit on one single line at all',
          x: 50,
          y: 50,
          w: 80,
          size: 16,
          color: '#111111',
          in: 'card',
        },
      ],
    };
    const { picture: repaired, fixes } = repairPicture(picture, outlineWithValues([10, 20]));
    const card = repaired.elements.find((element) => element.id === 'card');
    const label = repaired.elements.find((element) => element.id === 'label');
    if (card?.type !== 'rect' || label?.type !== 'text') throw new Error('expected card and label');
    expect(card.h).toBeGreaterThan(40);
    expect(fixes.length).toBeGreaterThan(0);
    expect(label.x).toBeGreaterThanOrEqual(card.x - 0.001);
    expect(label.y).toBeGreaterThanOrEqual(card.y - 0.001);
    expect(label.x + label.w).toBeLessThanOrEqual(card.x + card.w + 0.001);
    expect(label.y + (label.boxHeight ?? 0)).toBeLessThanOrEqual(card.y + card.h + 0.001);
  });

  it('widens free text whose longest word is wider than its box', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 't', type: 'text', text: 'WWWWWWWW', x: 10, y: 10, w: 5, size: 16, color: '#111111' },
      ],
    };
    const { picture: repaired, fixes } = repairPicture(picture, outlineWithValues([10, 20]));
    const text = repaired.elements[0];
    if (text.type !== 'text') throw new Error('expected text');
    expect(text.w).toBeGreaterThan(5);
    expect(fixes.some((fix) => fix.includes('widened'))).toBe(true);
  });
});

describe('PATCH-283 repairPicture issues', () => {
  it('reports overlapping filled shapes that de-overlap does not move (bars)', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 'a', type: 'bar', item: 0, x: 0, y: 0, w: 100, h: 100, orient: 'v', fill: '#aabbcc' },
        { id: 'b', type: 'bar', item: 1, x: 20, y: 20, w: 100, h: 100, orient: 'v', fill: '#aabbcc' },
      ],
    };
    const { issues } = repairPicture(picture, outlineWithValues([10, 20]));
    expect(issues.some((issue) => issue.type === 'overlap')).toBe(true);
  });

  it('does not report a card fully inside another', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 'a', type: 'rect', x: 0, y: 0, w: 200, h: 200, fill: '#aabbcc', stroke: '#000000' },
        { id: 'b', type: 'rect', x: 20, y: 20, w: 50, h: 50, fill: '#aabbcc', stroke: '#000000' },
      ],
    };
    const { issues } = repairPicture(picture, outlineWithValues([10, 20]));
    expect(issues.some((issue) => issue.type === 'overlap')).toBe(false);
  });

  it('reports a missing label', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [
        { id: 't', type: 'text', text: 'Something else', x: 10, y: 10, w: 100, size: 16, color: '#111111' },
        { id: 's', type: 'rect', x: 10, y: 40, w: 100, h: 40, fill: '#aabbcc', stroke: '#000000' },
      ],
    };
    const { issues } = repairPicture(picture, outlineWithValues([10, 20], ['Venue', 'Food']));
    expect(issues.some((issue) => issue.type === 'missing-label')).toBe(true);
  });

  it('translates off-canvas content and keeps a 24px margin', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 400,
      height: 300,
      background: '#ffffff',
      elements: [
        { id: 'a', type: 'rect', x: -50, y: -30, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' },
      ],
    };
    const { picture: repaired, fixes } = repairPicture(picture, outlineWithValues([10, 20]));
    const rect = repaired.elements[0];
    if (rect.type !== 'rect') throw new Error('expected rect');
    expect(rect.x).toBeCloseTo(24, 5);
    expect(rect.y).toBeCloseTo(24, 5);
    expect(fixes.length).toBeGreaterThan(0);
  });

  it('is idempotent', () => {
    const picture: DrawnPicture = {
      version: 1,
      width: 500,
      height: 400,
      background: '#ffffff',
      elements: [
        { id: 'card', type: 'rect', x: 30, y: 30, w: 100, h: 40, fill: '#aabbcc', stroke: '#000000' },
        {
          id: 'label',
          type: 'text',
          text: 'A long label that needs two whole lines to fit here',
          x: 30,
          y: 30,
          w: 80,
          size: 16,
          color: '#111111',
          in: 'card',
        },
        { id: 'w0', type: 'wedge', item: 0, cx: 350, cy: 200, r: 80, fill: '#ffcc00' },
        { id: 'w1', type: 'wedge', item: 1, cx: 350, cy: 200, r: 80, fill: '#00ccff' },
      ],
    };
    const outline = outlineWithValues([40, 60], ['Alpha', 'Beta']);
    const once = repairPicture(picture, outline).picture;
    const twice = repairPicture(once, outline).picture;
    expect(twice).toEqual(once);
  });
});
