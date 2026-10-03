import { describe, expect, it } from 'vitest';

import { isValidItemId, parseOutline, withItemIds, type VisualOutline } from './outline';

/**
 * PATCH-274. Stable item ids. `withItemIds` assigns/keeps/de-duplicates; the
 * model path of `parseOutline` drops ids and the stored path keeps valid ones.
 */

function outline(items: VisualOutline['items']): VisualOutline {
  return { title: 'T', ordered: false, kind: 'list', items };
}

function ids(next: VisualOutline): Array<string | undefined> {
  return next.items.map((item) => item.id);
}

describe('PATCH-274 withItemIds', () => {
  it('assigns a valid id to every item without one', () => {
    const next = withItemIds(outline([{ label: 'A' }, { label: 'B' }, { label: 'C' }]));
    for (const id of ids(next)) expect(isValidItemId(id)).toBe(true);
    expect(new Set(ids(next)).size).toBe(3);
    // It never mutates the input.
    expect(outline([{ label: 'A' }]).items[0].id).toBeUndefined();
  });

  it('keeps existing valid ids and is identity when every id is valid and unique', () => {
    const base = outline([
      { label: 'A', id: 'abc123' },
      { label: 'B', id: 'xyz789' },
    ]);
    const next = withItemIds(base);
    expect(next).toBe(base);
    expect(ids(next)).toEqual(['abc123', 'xyz789']);
  });

  it('replaces an invalid id and gives later duplicates new ids (first kept)', () => {
    const next = withItemIds(
      outline([
        { label: 'A', id: 'ABC' },
        { label: 'B', id: 'dup123' },
        { label: 'C', id: 'dup123' },
      ]),
    );
    expect(isValidItemId(next.items[0].id)).toBe(true);
    expect(next.items[0].id).not.toBe('ABC');
    expect(next.items[1].id).toBe('dup123');
    expect(next.items[2].id).not.toBe('dup123');
    expect(isValidItemId(next.items[2].id)).toBe(true);
    expect(new Set(ids(next)).size).toBe(3);
  });
});

describe('PATCH-274 parseOutline ids: model drops, stored keeps', () => {
  const RAW = {
    title: 'T',
    ordered: false,
    kind: 'list',
    items: [
      { label: 'A', id: 'abc123' },
      { label: 'B', id: 'NOT VALID' },
    ],
  };

  it('the model path drops ids entirely', () => {
    const out = parseOutline(RAW);
    expect(out.items[0].id).toBeUndefined();
    expect(out.items[1].id).toBeUndefined();
  });

  it('the stored path keeps a valid id and drops an invalid one', () => {
    const out = parseOutline(RAW, { source: 'stored' });
    expect(out.items[0].id).toBe('abc123');
    expect(out.items[1].id).toBeUndefined();
  });
});
