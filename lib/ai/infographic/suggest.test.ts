import { describe, expect, it } from 'vitest';

import type { OutlineKind } from '@/lib/ai/outline';
import { suggestDesigns } from './suggest';

function outline(kind: OutlineKind, count: number) {
  return {
    title: 'T',
    ordered: kind === 'steps' || kind === 'timeline',
    kind,
    items: Array.from({ length: count }, (_, i) => ({ label: `I${i + 1}` })),
  };
}

const firstKey = (kind: OutlineKind, count: number) => suggestDesigns(outline(kind, count))[0].key;

describe('PATCH-236 suggestDesigns', () => {
  it('each kind picks its first choice', () => {
    expect(firstKey('levels', 4)).toBe('infographic:pyramid');
    expect(firstKey('steps', 5)).toBe('infographic:stairs');
    expect(firstKey('cycle', 4)).toBe('infographic:cycle');
    expect(firstKey('parts', 4)).toBe('infographic:hub');
    expect(firstKey('comparison', 3)).toBe('comparison');
    expect(firstKey('timeline', 4)).toBe('timeline');
    expect(firstKey('cause_effect', 4)).toBe('flow');
    expect(firstKey('list', 3)).toBe('mindmap');
  });

  it('excludes a template whose item range does not fit', () => {
    // pyramid needs 3-7; 2 items cannot be a pyramid.
    const keys = suggestDesigns(outline('levels', 2)).map((s) => s.key);
    expect(keys).not.toContain('infographic:pyramid');
    // funnel needs 3-6; 8 items cannot be a funnel.
    const keys8 = suggestDesigns(outline('parts', 8)).map((s) => s.key);
    expect(keys8).not.toContain('infographic:funnel');
  });

  it('the four old options still appear', () => {
    const keys = suggestDesigns(outline('list', 3)).map((s) => s.key);
    expect(keys).toContain('mindmap');
    expect(keys.some((k) => k.startsWith('comparison'))).toBe(true);
    expect(keys.some((k) => k.startsWith('flow'))).toBe(true);
  });

  it('each infographic option carries the outline', () => {
    const suggestions = suggestDesigns(outline('levels', 4));
    for (const suggestion of suggestions) {
      if (suggestion.envelopeData.subtype === 'infographic') {
        expect(suggestion.envelopeData.outline).toEqual(outline('levels', 4));
        expect(typeof suggestion.envelopeData.template).toBe('string');
      }
    }
  });
});

describe('PATCH-241 suggestDesigns AntV options', () => {
  it('adds antv: options with readable labels, a category and the outline', () => {
    const suggestions = suggestDesigns(outline('list', 3));
    const antv = suggestions.filter((s) => s.key.startsWith('antv:'));
    expect(antv.length).toBeGreaterThan(0);
    for (const suggestion of antv) {
      expect(suggestion.label.charAt(0)).toBe(suggestion.label.charAt(0).toUpperCase());
      expect(suggestion.category.length).toBeGreaterThan(0);
      expect(suggestion.envelopeData.subtype).toBe('infographic');
      if (suggestion.envelopeData.subtype === 'infographic') {
        expect(suggestion.envelopeData.template).toBe(suggestion.key);
      }
    }
  });

  it('keeps our first choice first', () => {
    expect(firstKey('levels', 4)).toBe('infographic:pyramid');
    expect(firstKey('steps', 5)).toBe('infographic:stairs');
  });

  it('never offers relation options; a value-less outline only gets word clouds (PATCH-248)', () => {
    const keys = suggestDesigns(outline('list', 4))
      .map((s) => s.key)
      .filter((k) => k.startsWith('antv:'));
    expect(keys.some((k) => k.includes('relation-'))).toBe(false);
    expect(keys.filter((k) => k.includes('chart-')).every((k) => k.includes('chart-wordcloud'))).toBe(true);
  });

  it('PATCH-260 carries elementOverrides into every option envelope', () => {
    const overrides = { template: 'list-grid-badge-card', items: { 'title#0': { dx: 4, dy: 2 } } };
    const base = { ...outline('list', 3), elementOverrides: overrides };
    const suggestions = suggestDesigns(base);
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      if (suggestion.envelopeData.subtype === 'infographic') {
        expect(suggestion.envelopeData.outline.elementOverrides).toEqual(overrides);
      }
    }
  });
});

describe('PATCH-237 suggestDesigns preferKey (Customize hint)', () => {
  const first = (outline: ReturnType<typeof makeOutline>, preferKey?: string) =>
    suggestDesigns(outline, preferKey ? { preferKey } : undefined)[0];

  function makeOutline(kind: OutlineKind, count: number) {
    return { title: 'T', ordered: false, kind, items: Array.from({ length: count }, (_, i) => ({ label: `I${i + 1}` })) };
  }

  it('a hint naming a design puts it first, marked Best match', () => {
    const o = makeOutline('list', 4); // list prefers mindmap; pyramid is not first
    const top = first(o, 'pyramid');
    expect(top.key).toBe('infographic:pyramid');
    expect(top.fit).toBe(0);
  });

  it('a hint naming nothing changes nothing', () => {
    const o = makeOutline('levels', 4);
    expect(first(o, 'zzz')).toEqual(first(o));
  });

  it('a preferred design that does not fit the count is not forced', () => {
    const o = makeOutline('list', 2); // pyramid needs 3-7
    expect(first(o, 'pyramid').key).not.toBe('infographic:pyramid');
  });
});
