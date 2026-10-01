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
