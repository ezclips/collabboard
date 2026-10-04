//
// PATCH-275. The pure text helpers behind the element panel: which fields the
// current selection has, and how a field edit rewrites the outline.
import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '../outline';
import { outlineWithTextField, outlineWithTextStyle, textFieldsForSelection } from './elementText';

const BASE: VisualOutline = {
  title: 'T',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'A', detail: 'Detail A', value: 5 },
    { label: 'B' },
  ],
};

function withAddedText(): VisualOutline {
  return {
    ...BASE,
    elementOverrides: {
      template: 'list-grid-badge-card',
      items: {},
      additions: [{ id: 'abc123', kind: 'text', x: 0, y: 0, w: 10, h: 10, label: 'Hello' }],
    },
  };
}

describe('PATCH-275 textFieldsForSelection', () => {
  it('a whole flat item yields label, detail and value', () => {
    const fields = textFieldsForSelection(BASE, 'list-grid-badge-card', [
      'shape@0#0',
      'item-icon@0',
      'item-label@0',
      'item-value@0',
    ]);
    expect(fields.map((field) => field.field)).toEqual(['label', 'detail', 'value']);
    expect(fields.map((field) => field.value)).toEqual(['A', 'Detail A', '5']);
    expect(fields[0].path).toEqual([0]);
  });

  it('a whole item without a detail or value draws only label', () => {
    const fields = textFieldsForSelection(BASE, 'list-grid-badge-card', [
      'shape@1#0',
      'item-label@1',
    ]);
    expect(fields.map((field) => field.field)).toEqual(['label']);
    expect(fields[0].value).toBe('B');
  });

  it('a single item-desc yields only detail', () => {
    const fields = textFieldsForSelection(BASE, 'list-grid-badge-card', ['item-desc@0']);
    expect(fields).toHaveLength(1);
    expect(fields[0].field).toBe('detail');
    expect(fields[0].value).toBe('Detail A');
    expect(fields[0].styleTarget).toEqual({ scope: 'item', index: 0, part: 'detail' });
  });

  it('a title selection yields the title', () => {
    const fields = textFieldsForSelection(BASE, 'list-grid-badge-card', ['title#0']);
    expect(fields).toHaveLength(1);
    expect(fields[0].field).toBe('title');
    expect(fields[0].path).toEqual([]);
    expect(fields[0].value).toBe('T');
    expect(fields[0].styleTarget).toEqual({ scope: 'title' });
  });

  it('a hierarchy item unwraps the root offset', () => {
    const fields = textFieldsForSelection(BASE, 'hierarchy-mindmap-lr-circular', [
      'item-label@0,1',
    ]);
    expect(fields[0].field).toBe('label');
    expect(fields[0].path).toEqual([1]);
    expect(fields[0].value).toBe('B');
  });

  it('a flat depth-2 path yields a child label', () => {
    const outline: VisualOutline = {
      ...BASE,
      items: [{ label: 'A', children: [{ label: 'Kid' }] }],
    };
    const fields = textFieldsForSelection(outline, 'list-grid-badge-card', ['item-label@0,0']);
    expect(fields).toHaveLength(1);
    expect(fields[0].field).toBe('child');
    expect(fields[0].path).toEqual([0, 0]);
    expect(fields[0].value).toBe('Kid');
  });

  it('a hierarchy depth-3 path yields a child label', () => {
    const outline: VisualOutline = {
      ...BASE,
      items: [{ label: 'A' }, { label: 'B', children: [{ label: 'Kid' }] }],
    };
    const fields = textFieldsForSelection(outline, 'hierarchy-mindmap-lr-circular', [
      'item-label@0,1,0',
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0].field).toBe('child');
    expect(fields[0].path).toEqual([1, 0]);
    expect(fields[0].value).toBe('Kid');
  });

  it('an added text yields its label', () => {
    const fields = textFieldsForSelection(withAddedText(), 'list-grid-badge-card', [
      'ai-addition@abc123',
    ]);
    expect(fields).toHaveLength(1);
    expect(fields[0].field).toBe('addition');
    expect(fields[0].additionKey).toBe('ai-addition@abc123');
    expect(fields[0].value).toBe('Hello');
  });
});

describe('PATCH-275 outlineWithTextField', () => {
  it('edits a label', () => {
    const next = outlineWithTextField(BASE, [0], 'label', 'A2');
    expect(next.items[0].label).toBe('A2');
    expect(BASE.items[0].label).toBe('A');
  });

  it('clears valueExample when a value is edited (an edited value is real)', () => {
    const outline: VisualOutline = { ...BASE, items: [{ label: 'A', value: 7, valueExample: true }] };
    const next = outlineWithTextField(outline, [0], 'value', '9');
    expect(next.items[0].value).toBe(9);
    expect(next.items[0].valueExample).toBeUndefined();
  });

  it('removes the value and the example flag when emptied', () => {
    const outline: VisualOutline = { ...BASE, items: [{ label: 'A', value: 7, valueExample: true }] };
    const next = outlineWithTextField(outline, [0], 'value', '');
    expect(next.items[0].value).toBeUndefined();
    expect(next.items[0].valueExample).toBeUndefined();
  });

  it('edits a child label and a title', () => {
    const outline: VisualOutline = { ...BASE, items: [{ label: 'A', children: [{ label: 'Kid' }] }] };
    const child = outlineWithTextField(outline, [0, 0], 'child', 'Kid2');
    expect(child.items[0].children?.[0].label).toBe('Kid2');

    const titled = outlineWithTextField(BASE, [], 'title', 'New');
    expect(titled.title).toBe('New');
  });

  it('never mutates its input', () => {
    const before = JSON.stringify(BASE);
    outlineWithTextField(BASE, [0], 'label', 'A2');
    expect(JSON.stringify(BASE)).toBe(before);
  });
});

describe('PATCH-275 outlineWithTextStyle', () => {
  it('sanitises a dropped size and applies an in-range one', () => {
    const dropped = outlineWithTextStyle(BASE, { scope: 'item', index: 0, part: 'label' }, { fontSize: 99 });
    expect(dropped.items[0].textStyle).toBeUndefined();

    const applied = outlineWithTextStyle(BASE, { scope: 'item', index: 0, part: 'label' }, { fontSize: 24 });
    expect(applied.items[0].textStyle?.label?.fontSize).toBe(24);
  });

  it('applies to the title and never mutates its input', () => {
    const before = JSON.stringify(BASE);
    const next = outlineWithTextStyle(BASE, { scope: 'title' }, { fontSize: 30 });
    expect(next.titleStyle?.fontSize).toBe(30);
    expect(JSON.stringify(BASE)).toBe(before);
  });
});
