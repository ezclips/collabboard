import { describe, expect, it } from 'vitest';

import { OUTLINE_LIMITS, type VisualOutline } from '@/lib/ai/outline';
import { effectiveBranchSides, type MindmapTree } from '@/lib/ai/mindmapLayout';
import {
  addChild,
  addItemChild,
  effectiveOutlineSides,
  insertItem,
  recolorItem,
  removeItem,
  removeItemChild,
  removeNode,
  renameNode,
  renameOutline,
} from './edit';

/**
 * PATCH-240. Every edit helper is PURE: it returns a NEW object and never
 * touches its input. The inputs here are deep-frozen, so any in-place write
 * throws (ES modules are strict) and fails the test.
 */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function outline(): VisualOutline {
  return deepFreeze({
    title: 'Seasons',
    ordered: false,
    kind: 'levels',
    items: [
      { label: 'Spring', detail: 'warm' },
      { label: 'Summer', detail: 'hot' },
      { label: 'Autumn', detail: 'cool' },
    ],
  });
}

function tree(): MindmapTree {
  return deepFreeze({
    label: 'Water cycle',
    children: [
      { label: 'Evaporation', children: [{ label: 'Oceans' }, { label: 'Lakes' }] },
      { label: 'Condensation' },
    ],
  });
}

describe('PATCH-240 renameOutline', () => {
  it('renames the title, a label and a detail, returning new objects', () => {
    const base = outline();
    const titled = renameOutline(base, { field: 'title' }, 'The seasons');
    expect(titled.title).toBe('The seasons');
    expect(titled).not.toBe(base);
    expect(base.title).toBe('Seasons');

    const labelled = renameOutline(base, { field: 'label', item: 1 }, 'High summer');
    expect(labelled.items[1].label).toBe('High summer');
    expect(labelled.items[1]).not.toBe(base.items[1]);
    expect(base.items[1].label).toBe('Summer');

    const detailed = renameOutline(base, { field: 'detail', item: 2 }, 'crisp');
    expect(detailed.items[2].detail).toBe('crisp');
    expect(base.items[2].detail).toBe('cool');
  });

  it('caps the renamed text at the limit for its field', () => {
    const base = outline();
    expect(renameOutline(base, { field: 'title' }, 'T'.repeat(200)).title.length).toBe(OUTLINE_LIMITS.title);
    expect(renameOutline(base, { field: 'label', item: 0 }, 'L'.repeat(200)).items[0].label.length).toBe(OUTLINE_LIMITS.label);
    expect(renameOutline(base, { field: 'detail', item: 0 }, 'D'.repeat(400)).items[0].detail!.length).toBe(OUTLINE_LIMITS.detail);
  });
});

describe('PATCH-240 insertItem / removeItem', () => {
  it('inserts "New item" at the index and leaves the input untouched', () => {
    const base = outline();
    const next = insertItem(base, 1);
    expect(next.items.map((i) => i.label)).toEqual(['Spring', 'New item', 'Summer', 'Autumn']);
    expect(base.items.map((i) => i.label)).toEqual(['Spring', 'Summer', 'Autumn']);
  });

  it('refuses to grow past the max', () => {
    const full = deepFreeze({
      title: 'T',
      ordered: false,
      kind: 'list' as const,
      items: Array.from({ length: OUTLINE_LIMITS.items }, (_, i) => ({ label: `Item ${i}` })),
    });
    const next = insertItem(full, 0);
    expect(next.items.length).toBe(OUTLINE_LIMITS.items);
  });

  it('removes an item but never below the minimum', () => {
    const base = outline();
    const next = removeItem(base, 1);
    expect(next.items.map((i) => i.label)).toEqual(['Spring', 'Autumn']);
    expect(base.items.length).toBe(3);

    const pair = deepFreeze({
      title: 'T',
      ordered: false,
      kind: 'list' as const,
      items: [{ label: 'A' }, { label: 'B' }],
    });
    expect(removeItem(pair, 0).items.length).toBe(2);
  });
});

describe('PATCH-240 recolorItem', () => {
  it('sets a palette slot and null removes it, without mutating', () => {
    const base = outline();
    const coloured = recolorItem(base, 1, 3);
    expect(coloured.items[1].color).toBe(3);
    expect(base.items[1].color).toBeUndefined();

    const cleared = recolorItem(coloured, 1, null);
    expect(cleared.items[1].color).toBeUndefined();
    expect(coloured.items[1].color).toBe(3);
  });

  it('drops an out-of-range colour', () => {
    const base = outline();
    expect(recolorItem(base, 0, 9).items[0].color).toBeUndefined();
    expect(recolorItem(base, 0, -1).items[0].color).toBeUndefined();
  });
});

function hub(): VisualOutline {
  return deepFreeze({
    title: 'Seasons',
    ordered: false,
    kind: 'levels',
    items: [
      { label: 'Spring' },
      { label: 'Summer' },
      { label: 'Autumn' },
      { label: 'Winter' },
    ],
  });
}

describe('PATCH-242 stored sides (outline)', () => {
  it('effectiveOutlineSides defaults to even right / odd left', () => {
    expect(effectiveOutlineSides(hub().items)).toEqual(['right', 'left', 'right', 'left']);
  });

  it('insert after a right hub item puts the new item right, and freezes every side', () => {
    const base = hub();
    const beforeSides = effectiveOutlineSides(base.items);
    const next = insertItem(base, 1, { side: 'right' });

    expect(base.items.length).toBe(4);
    expect(next.items.map((i) => i.label)).toEqual(['Spring', 'New item', 'Summer', 'Autumn', 'Winter']);
    expect(next.items.map((i) => i.side)).toEqual(['right', 'right', 'left', 'right', 'left']);
    // The new item sits directly below item 0 on the right side (index 1 of the
    // right group), and every original item keeps its effective side.
    const withoutNew = next.items.filter((_, i) => i !== 1);
    expect(effectiveOutlineSides(withoutNew)).toEqual(beforeSides);
  });

  it('new side defaults to the side of the item before it, else right', () => {
    const base = hub();
    expect(insertItem(base, 2, undefined).items[2].side).toBe('left'); // item 1 is left
    expect(insertItem(base, 0, undefined).items[0].side).toBe('right'); // no item before
  });

  it('removeItem freezes sides first, so no other item changes side', () => {
    const base = hub();
    const beforeSides = effectiveOutlineSides(base.items);
    const next = removeItem(base, 1);
    expect(next.items.map((i) => i.label)).toEqual(['Spring', 'Autumn', 'Winter']);
    expect(next.items.map((i) => i.side)).toEqual(['right', 'right', 'left']);
    expect(effectiveOutlineSides(next.items)).toEqual(
      beforeSides.filter((_, i) => i !== 1),
    );
    expect(base.items.some((i) => i.side !== undefined)).toBe(false);
  });
});

describe('PATCH-242 stored sides (tree)', () => {
  it('effectiveBranchSides defaults to first ceil(n/2) right', () => {
    expect(effectiveBranchSides([
      { label: 'A' },
      { label: 'B' },
      { label: 'C' },
    ])).toEqual(['right', 'right', 'left']);
  });

  it('adds a branch on the side asked for, after the last of that side, freezing the rest', () => {
    const base = tree();
    const withRight = addChild(base, [], { side: 'right' });
    expect(withRight.children!.map((b) => b.label)).toEqual(['Evaporation', 'New branch', 'Condensation']);
    expect(withRight.children!.map((b) => b.side)).toEqual(['right', 'right', 'left']);

    const withLeft = addChild(base, [], { side: 'left' });
    expect(withLeft.children!.map((b) => b.label)).toEqual(['Evaporation', 'Condensation', 'New branch']);
    expect(withLeft.children!.map((b) => b.side)).toEqual(['right', 'left', 'left']);

    // Nothing else moved: the original branches keep their effective side.
    const beforeSides = effectiveBranchSides(base.children!);
    const originals = withLeft.children!.filter((b) => b.label !== 'New branch');
    expect(effectiveBranchSides(originals)).toEqual(beforeSides);
    expect(base.children!.some((b) => b.side !== undefined)).toBe(false);
  });

  it('removeNode on a branch freezes the remaining sides first', () => {
    const base = tree();
    const beforeSides = effectiveBranchSides(base.children!);
    const next = removeNode(base, [0]);
    expect(next.children!.map((b) => b.label)).toEqual(['Condensation']);
    expect(next.children![0].side).toBe('left');
    expect(effectiveBranchSides(next.children!)).toEqual(beforeSides.filter((_, i) => i !== 0));
  });
});

describe('PATCH-243 item child helpers', () => {
  it('adds a child at the given position, appending when omitted, capped at the limit', () => {
    const base = deepFreeze({
      title: 'T',
      ordered: false,
      kind: 'list' as const,
      items: [
        { label: 'A', children: [{ label: 'A1' }, { label: 'A2' }] },
        { label: 'B' },
      ],
    });
    expect(addItemChild(base, 0, 1).items[0].children!.map((c) => c.label)).toEqual(['A1', 'New point', 'A2']);
    expect(addItemChild(base, 1).items[1].children!.map((c) => c.label)).toEqual(['New point']);
    expect(base.items[0].children!.length).toBe(2);

    const full = deepFreeze({
      title: 'T',
      ordered: false,
      kind: 'list' as const,
      items: [
        { label: 'A', children: Array.from({ length: OUTLINE_LIMITS.children }, (_, i) => ({ label: `C${i}` })) },
        { label: 'B' },
      ],
    });
    expect(addItemChild(full, 0).items[0].children!.length).toBe(OUTLINE_LIMITS.children);
  });

  it('removes a child, and drops the children array when the last one goes', () => {
    const base = deepFreeze({
      title: 'T',
      ordered: false,
      kind: 'list' as const,
      items: [
        { label: 'A', children: [{ label: 'A1' }, { label: 'A2' }] },
        { label: 'B' },
      ],
    });
    expect(removeItemChild(base, 0, 0).items[0].children!.map((c) => c.label)).toEqual(['A2']);
    expect(removeItemChild(base, 0, 1).items[0].children!.map((c) => c.label)).toEqual(['A1']);
    expect(removeItemChild(base, 0, 9).items[0].children!.length).toBe(2);
    expect(base.items[0].children!.length).toBe(2);
  });
});

describe('PATCH-240 tree helpers', () => {
  it('renames root, branch and leaf by path, returning new objects', () => {
    const base = tree();
    const renamedRoot = renameNode(base, [], 'The cycle');
    expect(renamedRoot.label).toBe('The cycle');
    expect(base.label).toBe('Water cycle');

    const renamedBranch = renameNode(base, [0], 'Evap');
    expect(renamedBranch.children![0].label).toBe('Evap');
    expect(base.children![0].label).toBe('Evaporation');

    const renamedLeaf = renameNode(base, [0, 1], 'Seas');
    expect(renamedLeaf.children![0].children![1].label).toBe('Seas');
    expect(base.children![0].children![1].label).toBe('Lakes');
  });

  it('caps renamed labels at the title/label limits', () => {
    const base = tree();
    expect(renameNode(base, [], 'T'.repeat(200)).label.length).toBe(OUTLINE_LIMITS.title);
    expect(renameNode(base, [0], 'L'.repeat(200)).children![0].label.length).toBe(OUTLINE_LIMITS.label);
  });

  it('adds a branch on the root and a leaf on a branch, respecting the limits', () => {
    const base = tree();
    const withBranch = addChild(base, []);
    expect(withBranch.children!.map((c) => c.label)).toEqual(['Evaporation', 'Condensation', 'New branch']);
    expect(base.children!.length).toBe(2);

    const withLeaf = addChild(base, [0]);
    expect(withLeaf.children![0].children!.map((c) => c.label)).toEqual(['Oceans', 'Lakes', 'New point']);

    const eight = deepFreeze({
      label: 'Root',
      children: Array.from({ length: OUTLINE_LIMITS.items }, (_, i) => ({ label: `B${i}` })),
    });
    expect(addChild(eight, []).children!.length).toBe(OUTLINE_LIMITS.items);

    const six = deepFreeze({
      label: 'Root',
      children: [{ label: 'B', children: Array.from({ length: OUTLINE_LIMITS.children }, (_, i) => ({ label: `L${i}` })) }],
    });
    expect(addChild(six, [0]).children![0].children!.length).toBe(OUTLINE_LIMITS.children);
  });

  it('removes a branch or a leaf by path, never the root and never the last branch', () => {
    const base = tree();
    expect(removeNode(base, [0, 1]).children![0].children!.map((c) => c.label)).toEqual(['Oceans']);
    expect(removeNode(base, [0]).children!.map((c) => c.label)).toEqual(['Condensation']);
    expect(removeNode(base, []).children!.length).toBe(2);

    const single = deepFreeze({ label: 'Root', children: [{ label: 'Only' }] });
    expect(removeNode(single, [0]).children!.length).toBe(1);
    expect(base.children!.length).toBe(2);
  });
});
