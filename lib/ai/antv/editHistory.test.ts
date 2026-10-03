//
// PATCH-270. The scoped, pure edit history for a picture. An entry describes
// ONLY what changed (both sides); applying one side touches only that field on
// the CURRENT outline, never another item and never the whole content.
import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

import {
  applyEntry,
  createEditHistory,
  diffContentEntries,
  diffOverrides,
  EDIT_HISTORY_MAX,
  type EditEntry,
} from './editHistory';

function outline(overrides: Partial<VisualOutline> = {}): VisualOutline {
  return {
    title: 'T',
    ordered: false,
    kind: 'list',
    items: [{ label: 'A' }, { label: 'B' }],
    ...overrides,
  };
}

describe('PATCH-270 applyEntry', () => {
  it('an overrides entry undo/redo replaces only elementOverrides, leaving content untouched', () => {
    const base = outline();
    const entry: EditEntry = {
      kind: 'overrides',
      template: 'list-grid-badge-card',
      items: { 'title#0': { before: undefined, after: { dx: 20, dy: 15 } } },
      additions: {},
    };

    const redone = applyEntry(base, entry, 'redo');
    expect(redone.elementOverrides).toEqual({
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 20, dy: 15 } },
    });
    expect(redone.title).toBe('T');
    expect(redone.items).toEqual(base.items);
    expect(redone.kind).toBe('list');

    const undone = applyEntry(redone, entry, 'undo');
    expect(undone.elementOverrides).toBeUndefined();
    expect(undone.items).toEqual(base.items);
    expect(undone.title).toBe('T');
  });

  it('an overrides entry for key A leaves key B and every addition untouched', () => {
    const circle = { id: 'abc123', kind: 'circle' as const, x: 1, y: 1, w: 2, h: 2 };
    const base = outline({
      elementOverrides: {
        template: 'list-grid-badge-card',
        items: { 'item-label@1': { dx: 5, dy: 6 } },
        additions: [circle],
      },
    });
    const entry: EditEntry = {
      kind: 'overrides',
      template: 'list-grid-badge-card',
      items: { 'item-label@0': { before: undefined, after: { dx: 9, dy: 9 } } },
      additions: {},
    };

    const redone = applyEntry(base, entry, 'redo');
    expect(redone.elementOverrides?.items['item-label@0']).toEqual({ dx: 9, dy: 9 });
    expect(redone.elementOverrides?.items['item-label@1']).toEqual({ dx: 5, dy: 6 });
    expect(redone.elementOverrides?.additions).toEqual([circle]);

    const undone = applyEntry(redone, entry, 'undo');
    expect(undone.elementOverrides?.items['item-label@0']).toBeUndefined();
    expect(undone.elementOverrides?.items['item-label@1']).toEqual({ dx: 5, dy: 6 });
    expect(undone.elementOverrides?.additions).toEqual([circle]);
  });

  it('an overrides entry that removes an addition leaves the item overrides untouched', () => {
    const circle = { id: 'abc123', kind: 'circle' as const, x: 1, y: 1, w: 2, h: 2 };
    const base = outline({
      elementOverrides: {
        template: 'list-grid-badge-card',
        items: { 'title#0': { dx: 4, dy: 4 } },
        additions: [circle],
      },
    });
    const entry: EditEntry = {
      kind: 'overrides',
      template: 'list-grid-badge-card',
      items: {},
      additions: { abc123: { before: circle, after: undefined } },
    };

    const undone = applyEntry(base, entry, 'undo');
    expect(undone.elementOverrides?.additions).toEqual([circle]);
    expect(undone.elementOverrides?.items['title#0']).toEqual({ dx: 4, dy: 4 });

    const redone = applyEntry(undone, entry, 'redo');
    expect(redone.elementOverrides?.additions ?? []).toEqual([]);
    expect(redone.elementOverrides?.items['title#0']).toEqual({ dx: 4, dy: 4 });
  });

  it('an item-field entry changes only that field and that item', () => {
    const base = outline();
    const entry: EditEntry = { kind: 'item-field', path: [1], field: 'label', before: 'B', after: 'Bee' };

    const next = applyEntry(base, entry, 'redo');
    expect(next.items[1].label).toBe('Bee');
    expect(next.items[0]).toEqual(base.items[0]);
    expect(next.title).toBe('T');

    const back = applyEntry(next, entry, 'undo');
    expect(back.items[1].label).toBe('B');
    expect(back.items[0]).toEqual(base.items[0]);
  });

  it('an item-field entry with before undefined deletes the field', () => {
    const base = outline({ items: [{ label: 'A', icon: 'sun' }, { label: 'B' }] });
    const entry: EditEntry = { kind: 'item-field', path: [0], field: 'icon', before: 'sun', after: undefined };
    const next = applyEntry(base, entry, 'redo');
    expect(next.items[0].icon).toBeUndefined();
    expect(applyEntry(next, entry, 'undo').items[0].icon).toBe('sun');
  });

  it('a stale path is skipped and never applied to another item', () => {
    const base = outline();
    const stale: EditEntry = { kind: 'item-field', path: [5], field: 'label', before: 'x', after: 'y' };
    expect(applyEntry(base, stale, 'redo')).toBe(base);
    expect(applyEntry(base, stale, 'undo')).toBe(base);
  });

  it('a title entry sets only the title', () => {
    const base = outline();
    const entry: EditEntry = { kind: 'title', before: 'T', after: 'Renamed' };
    const next = applyEntry(base, entry, 'redo');
    expect(next.title).toBe('Renamed');
    expect(next.items).toEqual(base.items);
    expect(applyEntry(next, entry, 'undo').title).toBe('T');
  });

  it('a group entry reverses its entries in reverse order on undo', () => {
    const base = outline({ items: [{ label: 'A' }, { label: 'B' }] });
    const group: EditEntry = {
      kind: 'group',
      entries: [
        { kind: 'item-field', path: [0], field: 'label', before: 'A', after: 'X' },
        { kind: 'item-field', path: [0], field: 'label', before: 'X', after: 'Y' },
      ],
    };
    const redone = applyEntry(base, group, 'redo');
    expect(redone.items[0].label).toBe('Y');
    const undone = applyEntry(redone, group, 'undo');
    expect(undone.items[0].label).toBe('A');
  });

  it('a child label is addressed by a two-part path', () => {
    const base = outline({ items: [{ label: 'A', children: [{ label: 'c0' }] }, { label: 'B' }] });
    const entry: EditEntry = { kind: 'item-field', path: [0, 0], field: 'label', before: 'c0', after: 'c1' };
    const next = applyEntry(base, entry, 'redo');
    expect(next.items[0].children?.[0].label).toBe('c1');
    expect(applyEntry(next, entry, 'undo').items[0].children?.[0].label).toBe('c0');
  });
});

describe('PATCH-270 diffContentEntries', () => {
  it('finds title/label/detail/icon/textStyle changes and nothing else', () => {
    const prev: VisualOutline = {
      title: 'T',
      ordered: false,
      kind: 'list',
      items: [
        { label: 'A', detail: 'd', icon: 'sun', textStyle: { label: { fill: '#111111' } }, value: 1, color: 2 },
        { label: 'B', value: 10, color: 3 },
      ],
    };
    const next: VisualOutline = {
      ...prev,
      title: 'T2',
      items: [
        { ...prev.items[0], label: 'A2', detail: 'd2', icon: 'moon', textStyle: { label: { fill: '#222222' } }, value: 9 },
        { ...prev.items[1], value: 99, color: 5 },
      ],
    };

    const entries = diffContentEntries(prev, next);
    const fields = entries.map((entry) =>
      entry.kind === 'title' ? 'title' : entry.kind === 'item-field' ? entry.field : 'group',
    );
    expect(new Set(fields)).toEqual(new Set(['title', 'label', 'detail', 'icon', 'textStyle']));
    // A value or colour change is not part of a content edit.
    expect(fields).not.toContain('value');
    expect(fields).not.toContain('color');
  });

  it('returns no entries for identical content', () => {
    expect(diffContentEntries(outline(), outline())).toEqual([]);
  });

  it('reports a child label change at its two-part path', () => {
    const prev = outline({ items: [{ label: 'A', children: [{ label: 'c0' }] }, { label: 'B' }] });
    const next = outline({ items: [{ label: 'A', children: [{ label: 'c1' }] }, { label: 'B' }] });
    const entries = diffContentEntries(prev, next);
    expect(entries).toEqual([
      { kind: 'item-field', path: [0, 0], field: 'label', before: 'c0', after: 'c1' },
    ]);
  });
});

describe('PATCH-270 diffOverrides', () => {
  it('reports only the changed key and addition, with both sides', () => {
    const circle = { id: 'abc123', kind: 'circle' as const, x: 1, y: 1, w: 2, h: 2 };
    const moved = { ...circle, x: 50 };
    const before = {
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 1 }, 'item-label@1': { dx: 2 } },
      additions: [circle],
    };
    const after = {
      template: 'list-grid-badge-card',
      items: { 'title#0': { dx: 9 }, 'item-label@1': { dx: 2 } },
      additions: [moved],
    };

    const entry = diffOverrides('list-grid-badge-card', before, after);
    expect(entry).not.toBeNull();
    expect(entry!.items).toEqual({ 'title#0': { before: { dx: 1 }, after: { dx: 9 } } });
    expect(entry!.additions).toEqual({ abc123: { before: circle, after: moved } });
  });

  it('returns null when nothing changed', () => {
    const same = { template: 't', items: { 'a#0': { dx: 1 } } };
    expect(diffOverrides('t', same, { ...same, items: { 'a#0': { dx: 1 } } })).toBeNull();
  });
});

describe('PATCH-270 createEditHistory', () => {
  it('records, undoes and redoes in order, keeping entries on the opposite stack', () => {
    const history = createEditHistory();
    const first: EditEntry = { kind: 'title', before: 'T', after: 'T1' };
    const second: EditEntry = { kind: 'title', before: 'T1', after: 'T2' };
    history.record(first);
    history.record(second);

    expect(history.undoEntry()).toBe(second);
    expect(history.undoEntry()).toBe(first);
    expect(history.undoEntry()).toBeUndefined();

    expect(history.redoEntry()).toBe(first);
    expect(history.redoEntry()).toBe(second);
    expect(history.redoEntry()).toBeUndefined();
  });

  it('caps the past stack and clears the future on a new edit', () => {
    const history = createEditHistory();
    for (let i = 0; i < EDIT_HISTORY_MAX + 10; i += 1) {
      history.record({ kind: 'title', before: `t${i}`, after: `t${i + 1}` });
    }
    expect(history.past).toHaveLength(EDIT_HISTORY_MAX);

    history.undoEntry();
    expect(history.future).toHaveLength(1);
    history.record({ kind: 'title', before: 'x', after: 'y' });
    expect(history.future).toHaveLength(0);
  });
});
