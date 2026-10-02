import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import { OUTLINE_LIMITS } from '@/lib/ai/outline';
import {
  antvThemeFor,
  applyAntvButton,
  applyAntvChange,
  isMindmapTemplate,
  mapAntvButton,
  outlinesEqual,
  STABLE_MINDMAP_STRUCTURE,
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

describe('PATCH-248 toAntvOptions value', () => {
  it('carries each item value into the AntV datum', () => {
    const options = toAntvOptions(
      outline({ items: [{ label: 'Venue', value: 40 }, { label: 'Food', value: 30 }] }),
      'chart-pie-plain-text',
    );
    expect(options.data.items).toEqual([
      { label: 'Venue', value: 40 },
      { label: 'Food', value: 30 },
    ]);
  });

  it('omits value when the item has none', () => {
    const options = toAntvOptions(
      outline({ items: [{ label: 'A' }, { label: 'B' }] }),
      'chart-bar-plain-text',
    );
    expect(options.data.items[0].value).toBeUndefined();
  });
});

describe('PATCH-243 toAntvOptions mind map structure', () => {
  it('swaps in the side-stable structure for hierarchy-mindmap templates only', () => {
    expect(isMindmapTemplate('hierarchy-mindmap-branch-gradient-capsule-item')).toBe(true);
    expect(isMindmapTemplate('hierarchy-tree-basic')).toBe(false);

    const mindmap = toAntvOptions(
      outline(),
      'hierarchy-mindmap-branch-gradient-capsule-item',
    );
    expect(mindmap.design?.structure.type).toBe(STABLE_MINDMAP_STRUCTURE);
    expect(mindmap.design?.structure.colorMode).toBe('branch');
    expect(mindmap.design?.structure.edgeAlign).toBeUndefined();

    const level = toAntvOptions(outline(), 'hierarchy-mindmap-level-gradient-lined-palette');
    expect(level.design?.structure.colorMode).toBe('level');
    expect(level.design?.structure.edgeAlign).toBe('bottom');

    const tree = toAntvOptions(outline(), 'hierarchy-tree-basic');
    expect(tree.design).toBeUndefined();
  });

  it('carries each item side into the AntV data', () => {
    const options = toAntvOptions(
      outline({ items: [{ label: 'A', side: 'left' }, { label: 'B', side: 'right' }] }),
      'hierarchy-mindmap-branch-gradient-capsule-item',
    );
    expect(options.data.items[0].children?.[0].side).toBe('left');
    expect(options.data.items[0].children?.[1].side).toBe('right');
  });
});

describe('PATCH-243 AntV button mapping', () => {
  it('maps a flat list button to an item insert/remove', () => {
    expect(mapAntvButton([0], 'add', 'list-grid-badge-card')).toEqual({
      op: 'add',
      kind: 'item',
      itemIndex: 0,
      index: 0,
    });
    expect(mapAntvButton([2], 'add', 'list-grid-badge-card')).toEqual({
      op: 'add',
      kind: 'item',
      itemIndex: 2,
      index: 2,
    });
    expect(mapAntvButton([1], 'remove', 'list-grid-badge-card')).toEqual({
      op: 'remove',
      kind: 'item',
      itemIndex: 1,
      index: 1,
    });
  });

  it('inserts at 0, middle and end on a flat template', () => {
    const base = outline({ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
    expect(applyAntvButton(base, [0], 'add', 'list-row-simple').items.map((i) => i.label)).toEqual([
      'New item',
      'A',
      'B',
      'C',
    ]);
    expect(applyAntvButton(base, [1], 'add', 'list-row-simple').items.map((i) => i.label)).toEqual([
      'A',
      'New item',
      'B',
      'C',
    ]);
    expect(applyAntvButton(base, [3], 'add', 'list-row-simple').items.map((i) => i.label)).toEqual([
      'A',
      'B',
      'C',
      'New item',
    ]);
  });

  it('removes a flat item, freezing every remaining side', () => {
    const base = outline({ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
    const next = applyAntvButton(base, [1], 'remove', 'list-row-simple');
    expect(next.items.map((i) => i.label)).toEqual(['A', 'C']);
    expect(next.items.every((i) => i.side !== undefined)).toBe(true);
    expect(base.items.map((i) => i.side)).toEqual([undefined, undefined, undefined]);
  });

  it('maps a mind-map button through its single root', () => {
    const base = outline({ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] });
    const mm = 'hierarchy-mindmap-branch-gradient-capsule-item';
    expect(mapAntvButton([0, 2], 'add', mm)).toEqual({ op: 'add', kind: 'item', itemIndex: 2, index: 2 });
    expect(mapAntvButton([0, 1], 'remove', mm)).toEqual({ op: 'remove', kind: 'item', itemIndex: 1, index: 1 });
    expect(mapAntvButton([0, 0, 1], 'add', mm)).toEqual({ op: 'add', kind: 'child', itemIndex: 0, index: 1 });

    expect(applyAntvButton(base, [0, 2], 'add', mm).items.map((i) => i.label)).toEqual(['A', 'B', 'New item', 'C']);
    expect(applyAntvButton(base, [0, 1], 'remove', mm).items.map((i) => i.label)).toEqual(['A', 'C']);
  });

  it('uses the AntV mind-map rule (even -> left) when freezing sides on add and remove', () => {
    const mm = 'hierarchy-mindmap-branch-gradient-capsule-item';
    const base = outline({ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] });
    // A side-less mind map is DRAWN even->left by stableMindmap; freezing must match.
    expect(applyAntvButton(base, [0, 4], 'add', mm).items.map((i) => i.side)).toEqual([
      'left', 'right', 'left', 'right', 'right',
    ]);
    expect(applyAntvButton(base, [0, 1], 'remove', mm).items.map((i) => i.side)).toEqual([
      'left', 'left', 'right',
    ]);
  });

  it('maps a nested child button and returns unchanged for impossible edits', () => {
    const base = outline({
      items: [{ label: 'A', children: [{ label: 'A1' }] }, { label: 'B' }],
    });
    const next = applyAntvButton(base, [0, 1], 'add', 'list-row-simple');
    expect(next.items[0].children!.map((c) => c.label)).toEqual(['A1', 'New point']);

    const removed = applyAntvButton(next, [0, 0], 'remove', 'list-row-simple');
    expect(removed.items[0].children!.map((c) => c.label)).toEqual(['New point']);

    // The title/root is never edited, and impossible indexes are no-ops.
    expect(mapAntvButton([0], 'remove', 'hierarchy-mindmap-branch-gradient-capsule-item')).toBeNull();
    expect(applyAntvButton(base, [0], 'remove', 'hierarchy-mindmap-branch-gradient-capsule-item')).toBe(base);
    expect(applyAntvButton(base, [9], 'remove', 'list-row-simple')).toBe(base);
    expect(applyAntvButton(base, [0, 9], 'remove', 'list-row-simple')).toBe(base);
    expect(applyAntvButton(base, [], 'add', 'list-row-simple')).toBe(base);
    expect(mapAntvButton([1.5], 'add', 'list-row-simple')).toBeNull();
  });

  it('honours the item ceiling and floor', () => {
    const full = outline({
      items: Array.from({ length: OUTLINE_LIMITS.items }, (_, i) => ({ label: `P${i}` })),
    });
    expect(applyAntvButton(full, [0], 'add', 'list-row-simple')).toBe(full);
    const pair = outline({ items: [{ label: 'A' }, { label: 'B' }] });
    expect(applyAntvButton(pair, [0], 'remove', 'list-row-simple')).toBe(pair);
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

describe('PATCH-244 applyAntvChange text attributes', () => {
  const LIST = 'list-row-simple';
  const MINDMAP = 'hierarchy-mindmap-branch-gradient-capsule-item';

  it('merges a label fill into the right item', () => {
    const next = applyAntvChange(outline(), LIST, {
      op: 'update',
      path: 'data.items[1].attributes.label',
      indexes: [1],
      value: { attributes: { fill: '#ff0000' } },
    });
    expect(next.items[1].textStyle?.label?.fill).toBe('#ff0000');
    expect(next.items[0].textStyle).toBeUndefined();
  });

  it('maps a desc font-size onto the detail style', () => {
    const next = applyAntvChange(outline(), LIST, {
      op: 'update',
      path: 'data.items[0].attributes.desc',
      indexes: [0],
      value: { attributes: { 'font-size': 20 } },
    });
    expect(next.items[0].textStyle?.detail?.fontSize).toBe(20);
  });

  it('maps an icon fill onto the icon style', () => {
    const next = applyAntvChange(outline(), LIST, {
      op: 'update',
      path: 'data.items[1].attributes.icon',
      indexes: [1],
      value: { attributes: { fill: 'rgb(0, 255, 0)' } },
    });
    expect(next.items[1].textStyle?.icon).toEqual({ fill: 'rgb(0, 255, 0)' });
  });

  it('maps the title font-family from data.attributes.title', () => {
    const next = applyAntvChange(outline(), LIST, {
      op: 'update',
      path: 'data.attributes.title',
      value: { attributes: { 'font-family': 'Alibaba PuHuiTi' } },
    });
    expect(next.titleStyle).toEqual({ fontFamily: 'Alibaba PuHuiTi' });
  });

  it('maps a horizontal align and ignores the vertical one', () => {
    const next = applyAntvChange(outline(), LIST, {
      op: 'update',
      path: 'data.items[0].attributes.label',
      indexes: [0],
      value: { attributes: { 'data-horizontal-align': 'CENTER', 'data-vertical-align': 'TOP' } },
    });
    expect(next.items[0].textStyle?.label).toEqual({ align: 'center' });
  });

  it('merges into an existing style without dropping what is already there', () => {
    const withFill = applyAntvChange(outline(), LIST, {
      op: 'update',
      path: 'data.items[0].attributes.label',
      indexes: [0],
      value: { attributes: { fill: '#ff0000' } },
    });
    const next = applyAntvChange(withFill, LIST, {
      op: 'update',
      path: 'data.items[0].attributes.label',
      indexes: [0],
      value: { attributes: { 'font-size': 16 } },
    });
    expect(next.items[0].textStyle?.label).toEqual({ fill: '#ff0000', fontSize: 16 });
  });

  it('drops a hostile fill, leaving the outline structurally unchanged', () => {
    const base = outline();
    const next = applyAntvChange(base, LIST, {
      op: 'update',
      path: 'data.items[0].attributes.label',
      indexes: [0],
      value: { attributes: { fill: 'url(javascript:alert(1))' } },
    });
    expect(next.items[0].textStyle).toBeUndefined();
    expect(outlinesEqual(next, base)).toBe(true);
  });

  it('ignores an unknown role key', () => {
    const base = outline();
    const next = applyAntvChange(base, LIST, {
      op: 'update',
      path: 'data.items[0].attributes.value',
      indexes: [0],
      value: { attributes: { fill: '#ff0000' } },
    });
    expect(outlinesEqual(next, base)).toBe(true);
  });

  it('maps a mind-map item through its root and the root title to titleStyle', () => {
    const fromChild = applyAntvChange(outline(), MINDMAP, {
      op: 'update',
      path: 'data.items[0].children[1].attributes.label',
      indexes: [0, 1],
      value: { attributes: { fill: '#0000ff' } },
    });
    expect(fromChild.items[1].textStyle?.label?.fill).toBe('#0000ff');

    const fromRoot = applyAntvChange(outline(), MINDMAP, {
      op: 'update',
      path: 'data.items[0].attributes.label',
      indexes: [0],
      value: { attributes: { fill: '#0000ff' } },
    });
    expect(fromRoot.titleStyle).toEqual({ fill: '#0000ff' });
  });
});

describe('PATCH-244 toAntvOptions round-trip', () => {
  function styled(): VisualOutline {
    return outline({
      titleStyle: { fontFamily: 'Alibaba PuHuiTi' },
      items: [
        {
          label: 'Spring',
          textStyle: {
            label: { fill: '#ff0000' },
            detail: { fontSize: 20 },
            icon: { fill: '#00ff00' },
          },
        },
        { label: 'Summer' },
      ],
    });
  }

  it('passes a list item style back as AntV attributes and the title as data.attributes.title', () => {
    const options = toAntvOptions(styled(), 'list-row-simple');
    expect(options.data.items[0].attributes).toEqual({
      label: { fill: '#ff0000' },
      desc: { 'font-size': 20 },
      icon: { fill: '#00ff00' },
    });
    expect(options.data.items[1].attributes).toBeUndefined();
    expect(options.data.attributes?.title).toEqual({ 'font-family': 'Alibaba PuHuiTi' });
  });

  it('passes a mind-map item style into the root children and the title into the root label', () => {
    const options = toAntvOptions(styled(), 'hierarchy-mindmap-branch-gradient-capsule-item');
    expect(options.data.items[0].attributes?.label).toEqual({ 'font-family': 'Alibaba PuHuiTi' });
    expect(options.data.items[0].children?.[0].attributes?.label).toEqual({ fill: '#ff0000' });
    expect(options.data.items[0].children?.[1].attributes).toBeUndefined();
  });
});

describe('PATCH-244 outlinesEqual', () => {
  it('is true for a no-op change and false once a style is added', () => {
    const base = outline();
    expect(
      outlinesEqual(
        base,
        applyAntvChange(base, 'list-row-simple', {
          op: 'update',
          path: 'data.items[0].attributes.label',
          indexes: [0],
          value: { attributes: { fill: 'not-a-colour' } },
        }),
      ),
    ).toBe(true);

    const changed = applyAntvChange(base, 'list-row-simple', {
      op: 'update',
      path: 'data.items[0].attributes.label',
      indexes: [0],
      value: { attributes: { fill: '#ff0000' } },
    });
    expect(outlinesEqual(base, changed)).toBe(false);
  });
});
