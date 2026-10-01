import { describe, expect, it } from 'vitest';

import type { VisualOutline, VisualOutlineItem, VisualSide } from '@/lib/ai/outline';
import { ALL_TEMPLATES, layoutInfographic } from './index';
import { effectiveOutlineSides } from './edit';

/**
 * PATCH-242. A stored side must not move anything: with no side anywhere the
 * geometry is IDENTICAL to today's, with a side the item sits on that side in
 * outline order, and every other design ignores the field.
 */

function outline(items: VisualOutlineItem[], title = 'Seasons'): VisualOutline {
  return { title, ordered: false, kind: 'levels', items };
}

function plain(count: number): VisualOutlineItem[] {
  return Array.from({ length: count }, (_, i) => ({ label: `Item ${i + 1}` }));
}

describe('PATCH-242 effectiveOutlineSides', () => {
  it('defaults to even right / odd left, and keeps a stored side', () => {
    const items: VisualOutlineItem[] = [
      { label: 'A' },
      { label: 'B', side: 'right' },
      { label: 'C' },
      { label: 'D', side: 'left' },
    ];
    expect(effectiveOutlineSides(items)).toEqual(['right', 'right', 'right', 'left']);
  });
});

describe('PATCH-242 hub stored sides', () => {
  it('no side anywhere === today\u2019s geometry', () => {
    const bare = layoutInfographic('hub', outline(plain(4)));
    const explicit = layoutInfographic(
      'hub',
      outline(plain(4).map((item, i) => ({ ...item, side: (i % 2 === 0 ? 'right' : 'left') as VisualSide }))),
    );
    expect(explicit).toEqual(bare);
  });

  it('places items on their stored side, in outline order top to bottom', () => {
    const sides: VisualSide[] = ['right', 'right', 'left', 'left'];
    const layout = layoutInfographic(
      'hub',
      outline(plain(4).map((item, i) => ({ ...item, side: sides[i] }))),
    );
    const card = (i: number) => layout.shapes.find((s) => s.id === `card${i}`)!;
    // Right group (items 0,1) share an x and stack 0 above 1.
    expect(card(0).x).toBe(card(1).x);
    expect(card(0).y!).toBeLessThan(card(1).y!);
    // Left group (items 2,3) share an x, are left of the right group, stack 2 above 3.
    expect(card(2).x).toBe(card(3).x);
    expect(card(2).x!).toBeLessThan(card(0).x!);
    expect(card(2).y!).toBeLessThan(card(3).y!);
  });
});

describe('PATCH-242 every other design ignores side', () => {
  for (const template of ALL_TEMPLATES) {
    if (template === 'hub') continue;
    it(`${template}: a stored side changes nothing`, () => {
      const bare = layoutInfographic(template, outline(plain(4)));
      const withSides = layoutInfographic(
        template,
        outline(plain(4).map((item, i) => ({ ...item, side: (i % 2 === 0 ? 'left' : 'right') as VisualSide }))),
      );
      expect(withSides).toEqual(bare);
    });
  }
});
