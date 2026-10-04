// @vitest-environment jsdom
//
// PATCH-274. Codex F4: element override keys are positional, so removing or
// adding an item retargets the edit onto a different item. `remapOverridesForItems`
// makes every key follow its item's stable id, or orphan it when the item is gone.
import { describe, expect, it } from 'vitest';

import type { VisualOutline, VisualOutlineItem } from '@/lib/ai/outline';
import { parseOutline } from '@/lib/ai/outline';
import { applyElementOverrides, elementKey, outlineWithOverrides } from './elementOverrides';
import { overridesForTemplate } from './templateOverrides';
import { remapOverridesForItems } from './remapOverrides';

const A: VisualOutlineItem = { label: 'A', id: 'aaa111' };
const B: VisualOutlineItem = { label: 'B', id: 'bbb222' };
const C: VisualOutlineItem = { label: 'C', id: 'ccc333' };

function outline(items: VisualOutlineItem[], extra: Partial<VisualOutline> = {}): VisualOutline {
  return { title: 'T', ordered: false, kind: 'list', items, ...extra };
}

/** The UI keeps `elementOverrides` when it filters/inserts items. */
function restructure(prev: VisualOutline, items: VisualOutlineItem[]): VisualOutline {
  return { ...prev, items };
}

const TEMPLATE = 'list-grid-badge-card';
const RED = { fill: '#ff0000' };
const GREEN = { fill: '#00ff00' };

describe('PATCH-274 remapOverridesForItems (Codex F4)', () => {
  it("Codex's case: colour B@1, remove A@0 -> B's colour is at index 0 and C has none", () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'item-label@1': RED },
    });
    // Remove A: B and C shift down (ids preserved, overrides carried).
    const next = restructure(prev, [B, C]);
    const remapped = remapOverridesForItems(prev, next);

    const entry = overridesForTemplate(remapped, TEMPLATE)!;
    expect(entry.items['item-label@0']).toEqual(RED);
    expect(entry.items['item-label@1']).toBeUndefined();
    expect(entry.items['item-label@2']).toBeUndefined();
    expect(remapped.elementOverrides!.items).toEqual({ 'item-label@0': RED });
  });

  it('insert before B moves B\'s key to the new index (child indexes unchanged)', () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'item-label@1': RED, 'item-value@1#0': GREEN },
    });
    const inserted: VisualOutlineItem = { label: 'New item', id: 'ddd444' };
    const next = restructure(prev, [A, inserted, B, C]);
    const remapped = remapOverridesForItems(prev, next);
    expect(remapped.elementOverrides!.items['item-label@2']).toEqual(RED);
    expect(remapped.elementOverrides!.items['item-value@2#0']).toEqual(GREEN);
    expect(remapped.elementOverrides!.items['item-label@1']).toBeUndefined();
  });

  it('reorder (swap 1 and 2) follows the ids, not the positions', () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'item-label@1': RED, 'item-label@2': GREEN },
    });
    const next = restructure(prev, [A, C, B]);
    const remapped = remapOverridesForItems(prev, next);
    expect(remapped.elementOverrides!.items['item-label@2']).toEqual(RED);
    expect(remapped.elementOverrides!.items['item-label@1']).toEqual(GREEN);
  });

  it("remove B -> B's override goes to `orphaned`; C gets nothing", () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'item-label@1': RED },
    });
    const next = restructure(prev, [A, C]);
    const remapped = remapOverridesForItems(prev, next);
    const entry = remapped.elementOverrides!;
    expect(entry.items).toEqual({});
    expect(entry.orphaned).toEqual({ 'item-label@1': RED });
    // Never applied: C (now at index 1) has no live override.
    expect(entry.items['item-label@1']).toBeUndefined();
  });

  it('hierarchy design: the item index after the root moves; the child index stays', () => {
    const template = 'hierarchy-mindmap-branch-gradient-capsule-item';
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template,
      items: { 'item-label@0,1': RED, 'item-label@0,1,0': GREEN, 'item-label@0': GREEN },
    });
    const next = restructure(prev, [B, C]);
    const remapped = remapOverridesForItems(prev, next);
    const items = remapped.elementOverrides!.items;
    expect(items['item-label@0,0']).toEqual(RED);
    expect(items['item-label@0,0,0']).toEqual(GREEN);
    // The root key (`@0`) and a child-less root key are untouched.
    expect(items['item-label@0']).toEqual(GREEN);
    expect(items['item-label@0,1']).toBeUndefined();
  });

  it('ordinal keys with no item index are left unchanged', () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'title#0': RED, 'shape#1': GREEN, 'item-label@1': { dx: 4 } },
    });
    const next = restructure(prev, [B, C]);
    const remapped = remapOverridesForItems(prev, next);
    const items = remapped.elementOverrides!.items;
    expect(items['title#0']).toEqual(RED);
    expect(items['shape#1']).toEqual(GREEN);
    expect(items['item-label@0']).toEqual({ dx: 4 });
  });

  it('remaps a badge key like any other item key (PATCH-276)', () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'item-icon-group@1#0#badge': RED },
    });
    const next = restructure(prev, [B, C]);
    const remapped = remapOverridesForItems(prev, next);
    const items = remapped.elementOverrides!.items;
    expect(items['item-icon-group@0#0#badge']).toEqual(RED);
    expect(items['item-icon-group@1#0#badge']).toBeUndefined();
  });

  it('rewrites every template entry in the map and the mirrored flat slot', () => {
    const t2 = 'chart-pie-compact-card';
    const prev = outline([A, B, C], {
      elementOverridesByTemplate: {
        [TEMPLATE]: { template: TEMPLATE, items: { 'item-label@1': RED } },
        [t2]: { template: t2, items: { 'shape@1': GREEN } },
      },
      elementOverrides: { template: t2, items: { 'shape@1': GREEN } },
    });
    const next = restructure(prev, [B, C]);
    const remapped = remapOverridesForItems(prev, next);
    expect(remapped.elementOverridesByTemplate![TEMPLATE].items['item-label@0']).toEqual(RED);
    expect(remapped.elementOverridesByTemplate![t2].items['shape@0']).toEqual(GREEN);
    expect(remapped.elementOverrides!.items['shape@0']).toEqual(GREEN);
  });

  it('is identity when the item id sequence is unchanged', () => {
    const prev = outlineWithOverrides(outline([A, B]), { template: TEMPLATE, items: { 'item-label@0': RED } });
    const next = outline([A, B]);
    expect(remapOverridesForItems(prev, next)).toBe(next);
  });

  it('never mutates its inputs', () => {
    const prev = outlineWithOverrides(outline([A, B]), { template: TEMPLATE, items: { 'item-label@1': RED } });
    const next = restructure(prev, [B]);
    const before = JSON.stringify(prev);
    const nextBefore = next.elementOverrides;
    remapOverridesForItems(prev, next);
    expect(JSON.stringify(prev)).toBe(before);
    expect(next.elementOverrides).toBe(nextBefore);
    expect(next.elementOverrides!.items['item-label@1']).toEqual(RED);
  });
});

describe('PATCH-274 through the real generator: DOM fill follows the item', () => {
  function flatDom(): SVGSVGElement {
    const host = document.createElement('div');
    host.innerHTML = `
      <svg viewBox="0 0 400 300">
        <g data-element-type="shape" data-indexes="0" fill="#111111"><rect width="10" height="10"/></g>
        <g data-element-type="shape" data-indexes="1" fill="#111111"><rect width="10" height="10"/></g>
      </svg>`;
    return host.querySelector('svg') as SVGSVGElement;
  }

  it("colour B (element editor), remove A -> B's shape keeps its fill, C's does not", () => {
    // Element editor colour of B: its key in the flat design is `shape@1`.
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'shape@1': RED },
    });
    // Sanity: the key really addresses item B in the current order.
    expect(prev.items[1].id).toBe('bbb222');

    // Edit text removes A; the remap runs as the wiring does.
    const next = restructure(prev, [B, C]);
    const remapped = remapOverridesForItems(prev, next);

    // The preview is redrawn with B at index 0 and C at index 1.
    const svg = flatDom();
    applyElementOverrides(svg, overridesForTemplate(remapped, TEMPLATE), TEMPLATE);

    const [bShape, cShape] = Array.from(svg.querySelectorAll('[data-element-type="shape"]')) as SVGElement[];
    expect(elementKey(bShape, svg)).toBe('shape@0');
    expect(elementKey(cShape, svg)).toBe('shape@1');
    expect(bShape.getAttribute('fill')).toBe('#ff0000');
    expect(cShape.getAttribute('fill')).toBe('#111111');
  });
});

describe('PATCH-274 save + reload keeps ids and remapped keys', () => {
  it('a stored round-trip preserves item ids, the shifted key and the orphan', () => {
    const prev = outlineWithOverrides(outline([A, B, C]), {
      template: TEMPLATE,
      items: { 'item-label@1': RED, 'item-label@2': GREEN },
    });
    const next = restructure(prev, [B, { label: 'D', id: 'ddd444' }]); // remove A and C
    const remapped = remapOverridesForItems(prev, next);

    const stored = parseOutline(JSON.parse(JSON.stringify(remapped)), { source: 'stored' });
    expect(stored.items[0].id).toBe('bbb222');
    expect(stored.elementOverrides!.items['item-label@0']).toEqual(RED);
    expect(stored.elementOverrides!.orphaned!['item-label@2']).toEqual(GREEN);
  });
});
