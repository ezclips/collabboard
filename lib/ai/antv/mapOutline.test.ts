import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { OUTLINE_LIMITS } from '@/lib/ai/outline';
import {
  antvThemeFor,
  applyAntvChange,
  toAntvOptions,
  type AntvChangeEvent,
} from './mapOutline';

function outline(over: Partial<VisualOutline> = {}): VisualOutline {
  return {
    title: 'Seasons',
    ordered: false,
    kind: 'list',
    items: [
      { label: 'Spring', detail: 'blossom', icon: 'flower-2', children: [{ label: 'April' }] },
      { label: 'Summer', icon: 'sun' },
    ],
    ...over,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('PATCH-241 toAntvOptions', () => {
  it('maps a flat outline with label/detail/icon and no children', () => {
    const options = toAntvOptions(outline(), 'list-grid-badge-card');
    expect(options.template).toBe('list-grid-badge-card');
    expect(options.data.title).toBe('Seasons');
    expect(options.data.items).toEqual([
      { label: 'Spring', desc: 'blossom', icon: 'lucide/flower-2' },
      { label: 'Summer', icon: 'lucide/sun' },
    ]);
  });

  it('maps a hierarchy outline to one root holding the items', () => {
    const options = toAntvOptions(outline(), 'hierarchy-tree-basic');
    expect(options.data.items).toHaveLength(1);
    expect(options.data.items[0].label).toBe('Seasons');
    expect(options.data.items[0].children?.map((child) => child.label)).toEqual(['Spring', 'Summer']);
    expect(options.data.items[0].children?.[0].children).toEqual([{ label: 'April' }]);
  });

  it('keeps each side children for a compare template', () => {
    const options = toAntvOptions(outline(), 'compare-swot');
    expect(options.data.items[0]).toEqual({
      label: 'Spring',
      desc: 'blossom',
      icon: 'lucide/flower-2',
      children: [{ label: 'April' }],
    });
  });

  it('omits icons the item does not have', () => {
    const options = toAntvOptions(
      outline({ items: [{ label: 'Plain' }, { label: 'Also plain' }] }),
      'list-row-simple',
    );
    expect(options.data.items[0].icon).toBeUndefined();
  });

  it('maps themes to AntV themes and registered palette names', () => {
    expect(antvThemeFor('midnight')).toEqual({ theme: 'dark', palette: 'patch241-midnight' });
    expect(antvThemeFor('ocean')).toEqual({ theme: 'light', palette: 'patch241-ocean' });
    expect(antvThemeFor('hand-drawn')).toEqual({ theme: 'hand-drawn', palette: 'patch241-classic' });
    expect(antvThemeFor(undefined)).toEqual({ theme: 'light', palette: 'patch241-classic' });
  });

  it('carries the palette into themeConfig (AntV reads it there)', () => {
    const options = toAntvOptions(outline(), 'list-row-simple', 'forest');
    expect(options.palette).toBe('patch241-forest');
    expect(options.themeConfig.palette).toBe('patch241-forest');
  });
});

describe('PATCH-241 applyAntvChange', () => {
  it('updates a label by index, trims whitespace and newlines, returns new objects', () => {
    const original = outline();
    const next = applyAntvChange(original, 'list-grid-badge-card', {
      op: 'update',
      path: 'data.items',
      indexes: [1],
      value: { label: '  Hot summer\n' },
    });
    expect(next).not.toBe(original);
    expect(next.items[1]).not.toBe(original.items[1]);
    expect(next.items[1].label).toBe('Hot summer');
    expect(original.items[1].label).toBe('Summer');
  });

  it('slices a label to the outline limit and sets/removes the detail', () => {
    const next = applyAntvChange(outline(), 'list-row-simple', {
      op: 'update',
      path: 'data.items',
      indexes: [1],
      value: { label: 'x'.repeat(100), desc: '  a detail  ' },
    });
    expect(next.items[1].label).toHaveLength(OUTLINE_LIMITS.label);
    expect(next.items[1].detail).toBe('a detail');

    const cleared = applyAntvChange(next, 'list-row-simple', {
      op: 'update',
      path: 'data.items',
      indexes: [1],
      value: { desc: '   ' },
    });
    expect(cleared.items[1].detail).toBeUndefined();
  });

  it('adds an item at the given index and respects the item ceiling', () => {
    const added = applyAntvChange(outline(), 'list-row-simple', {
      op: 'add',
      path: 'data.items',
      indexes: [1],
      value: [{ label: 'Monsoon' }],
    });
    expect(added.items.map((item) => item.label)).toEqual(['Spring', 'Monsoon', 'Summer']);

    const full = outline({
      items: Array.from({ length: OUTLINE_LIMITS.items }, (_, i) => ({ label: `P${i}` })),
    });
    const unchanged = applyAntvChange(full, 'list-row-simple', {
      op: 'add',
      path: 'data.items',
      indexes: [0],
      value: [{ label: 'Extra' }],
    });
    expect(unchanged.items).toHaveLength(OUTLINE_LIMITS.items);
  });

  it('removes an item but never below the minimum', () => {
    const three = outline({
      items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }],
    });
    const removed = applyAntvChange(three, 'list-row-simple', {
      op: 'remove',
      path: 'data.items',
      indexes: [2],
    });
    expect(removed.items.map((item) => item.label)).toEqual(['A', 'B']);

    const two = outline();
    const kept = applyAntvChange(two, 'list-row-simple', {
      op: 'remove',
      path: 'data.items',
      indexes: [0],
    });
    expect(kept.items).toHaveLength(2);
  });

  it('maps hierarchy indexes back through the root', () => {
    const base = outline();
    const renamed = applyAntvChange(base, 'hierarchy-tree-basic', {
      op: 'update',
      path: 'data.items',
      indexes: [0, 1],
      value: { label: 'Summer!' },
    });
    expect(renamed.items[1].label).toBe('Summer!');
    expect(renamed.title).toBe('Seasons');

    const retitled = applyAntvChange(base, 'hierarchy-tree-basic', {
      op: 'update',
      path: 'data.items',
      indexes: [0],
      value: 'Seasons of the year',
    });
    expect(retitled.title).toBe('Seasons of the year');
  });

  it('updates a compare side child', () => {
    const next = applyAntvChange(outline(), 'compare-swot', {
      op: 'update',
      path: 'data.items',
      indexes: [0, 0],
      value: { label: 'April showers' },
    });
    expect(next.items[0].children?.[0].label).toBe('April showers');
  });

  it('handles a full options:change event and ignores unknown changes', () => {
    const event: AntvChangeEvent = {
      type: 'options:change',
      changes: [
        { op: 'update', path: 'data.items', indexes: [0], value: { label: 'Springtime' } },
        { op: 'update', path: 'data.attributes', indexes: [0], value: { color: 'red' } },
        { op: 'frobnicate', path: 'data.items', indexes: [1], value: {} },
      ],
    };
    const next = applyAntvChange(outline(), 'list-row-simple', event);
    expect(next.items[0].label).toBe('Springtime');
    expect(next.items[1].label).toBe('Summer');
  });

  it('never mutates a frozen outline', () => {
    const frozen = deepFreeze(outline());
    expect(() =>
      applyAntvChange(frozen, 'list-row-simple', {
        op: 'update',
        path: 'data.items',
        indexes: [0],
        value: { label: 'Springtime' },
      }),
    ).not.toThrow();
    expect(frozen.items[0].label).toBe('Spring');
  });
});
