//
// PATCH-273. Per-design presentation edits: one `ElementOverrides` map per
// design, keyed by template, with the legacy flat slot seeded/mirrored. Split
// out of `elementOverrides.test.ts` alongside the code (PATCH-273 cleanup).
import { describe, expect, it } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';

import { outlineWithOverrides } from './elementOverrides';
import {
  ELEMENT_OVERRIDES_BY_TEMPLATE_MAX,
  outlineWithTemplateOverrides,
  overridesForTemplate,
  sanitizeElementOverridesByTemplate,
  withoutElementOverrides,
} from './templateOverrides';

describe('PATCH-273 overridesForTemplate / outlineWithTemplateOverrides', () => {
  const base: VisualOutline = { title: 'T', ordered: false, kind: 'list', items: [{ label: 'A' }, { label: 'B' }] };
  const A = { template: 'design-a', items: { 'title#0': { dx: 1 } } };
  const B = { template: 'design-b', items: { 'title#0': { fill: '#ff0000' } } };

  it('overridesForTemplate reads the map hit, the legacy fallback, and a miss', () => {
    const mapped = outlineWithTemplateOverrides(base, 'design-a', A);
    expect(overridesForTemplate(mapped, 'design-a')).toEqual(A);
    expect(overridesForTemplate(mapped, 'design-b')).toBeUndefined();

    // Legacy post: only the flat `elementOverrides` slot exists.
    const legacy = outlineWithOverrides(base, A);
    expect(overridesForTemplate(legacy, 'design-a')).toEqual(A);
    expect(overridesForTemplate(legacy, 'design-b')).toBeUndefined();
  });

  it('outlineWithTemplateOverrides sets one entry and mirrors the legacy slot, purely', () => {
    const next = outlineWithTemplateOverrides(base, 'design-a', A);
    expect(next.elementOverridesByTemplate).toEqual({ 'design-a': A });
    expect(next.elementOverrides).toEqual(A);
    // The input is never mutated.
    expect(base.elementOverridesByTemplate).toBeUndefined();
    expect(base.elementOverrides).toBeUndefined();
  });

  it('sets a SECOND template without losing the first, and mirrors the last edited', () => {
    const withA = outlineWithTemplateOverrides(base, 'design-a', A);
    const withB = outlineWithTemplateOverrides(withA, 'design-b', B);
    expect(withB.elementOverridesByTemplate).toEqual({ 'design-a': A, 'design-b': B });
    expect(overridesForTemplate(withB, 'design-a')).toEqual(A);
    expect(overridesForTemplate(withB, 'design-b')).toEqual(B);
    // `elementOverrides` mirrors the most recently edited design.
    expect(withB.elementOverrides).toEqual(B);
  });

  it('seeds the legacy slot into the map before it is overwritten', () => {
    const legacy = outlineWithOverrides(base, A);
    const withB = outlineWithTemplateOverrides(legacy, 'design-b', B);
    expect(withB.elementOverridesByTemplate).toEqual({ 'design-a': A, 'design-b': B });
    expect(overridesForTemplate(withB, 'design-a')).toEqual(A);
  });

  it('removes an entry when the overrides are empty, and drops the legacy mirror', () => {
    const withA = outlineWithTemplateOverrides(base, 'design-a', A);
    const removed = outlineWithTemplateOverrides(withA, 'design-a', undefined);
    expect(removed.elementOverridesByTemplate).toBeUndefined();
    expect(removed.elementOverrides).toBeUndefined();
  });

  it('re-inserting an edited key keeps insertion order = recency', () => {
    let outline = base;
    for (const name of ['d1', 'd2', 'd3']) {
      outline = outlineWithTemplateOverrides(outline, name, { template: name, items: { 'title#0': { dx: 1 } } });
    }
    // Edit d1 again: it moves to the end.
    outline = outlineWithTemplateOverrides(outline, 'd1', { template: 'd1', items: { 'title#0': { dx: 2 } } });
    expect(Object.keys(outline.elementOverridesByTemplate!)).toEqual(['d2', 'd3', 'd1']);
  });

  it('enforces the 12-entry cap by dropping the least recently written', () => {
    let outline = base;
    for (let i = 0; i < ELEMENT_OVERRIDES_BY_TEMPLATE_MAX + 2; i += 1) {
      outline = outlineWithTemplateOverrides(outline, `d${i}`, { template: `d${i}`, items: { 'title#0': { dx: i } } });
    }
    const map = outline.elementOverridesByTemplate!;
    expect(Object.keys(map)).toHaveLength(ELEMENT_OVERRIDES_BY_TEMPLATE_MAX);
    expect(map.d0).toBeUndefined();
    expect(map.d1).toBeUndefined();
    expect(map[`d${ELEMENT_OVERRIDES_BY_TEMPLATE_MAX + 1}`]).toBeDefined();
  });

  it('a mismatched key/entry template is dropped by the sanitizer', () => {
    const out = sanitizeElementOverridesByTemplate({
      'design-a': { template: 'design-b', items: { 'title#0': { dx: 1 } } },
      'design-c': { template: 'design-c', items: { 'title#0': { dx: 1 } } },
      bad: 'nope',
    });
    expect(out).toEqual({ 'design-c': { template: 'design-c', items: { 'title#0': { dx: 1 } } } });
  });

  it('withoutElementOverrides strips BOTH fields', () => {
    const withBoth = outlineWithTemplateOverrides(base, 'design-a', A);
    const stripped = withoutElementOverrides(withBoth);
    expect(stripped.elementOverrides).toBeUndefined();
    expect(stripped.elementOverridesByTemplate).toBeUndefined();
  });
});
