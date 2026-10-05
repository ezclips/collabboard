import { describe, expect, it } from 'vitest';

import {
  DRAWN_KIND_LABELS,
  drawnKindForSubtype,
  drawnOptionKey,
  pickBaseSeed,
  routeErrorMessage,
  seedsForBase,
  suggestionFromResponse,
} from './drawnOptionHelpers';

const outline = { title: 'Launch', ordered: false, kind: 'steps' as const, items: [{ label: 'A' }] };
const picture = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' }],
};

describe('PATCH-284 drawn option helpers', () => {
  it('maps a type button subtype to a drawn kind', () => {
    expect(drawnKindForSubtype('flowchart')).toBe('flowchart');
    expect(drawnKindForSubtype('mindmap')).toBe('mindmap');
    expect(drawnKindForSubtype('pie_chart')).toBe('pie');
    expect(drawnKindForSubtype('bar_chart')).toBe('bar');
    expect(drawnKindForSubtype('timeline')).toBe('timeline');
    expect(drawnKindForSubtype('comparison')).toBe('comparison');
    expect(drawnKindForSubtype('infographic')).toBeNull();
    expect(drawnKindForSubtype(undefined)).toBeNull();
  });

  it('produces three distinct seeds from a base', () => {
    expect(seedsForBase(10)).toEqual([10, 11, 12]);
    expect(new Set(seedsForBase(9997)).size).toBe(3);
  });

  it('picks a base whose seeds are all unseen', () => {
    const seen = new Set([0, 1, 2, 5, 6, 7]);
    const base = pickBaseSeed(() => 0, seen);
    expect(base).not.toBe(0);
    expect(seedsForBase(base).some((seed) => seen.has(seed))).toBe(false);
  });

  it('builds a drawn suggestion with a stable key, label and envelope', () => {
    const suggestion = suggestionFromResponse({
      picture,
      outline,
      kind: 'pie',
      seed: 12,
      label: 'Option 2',
      fit: 1,
    });
    expect(suggestion.key).toBe('drawn:pie:12');
    expect(suggestion.label).toBe('Option 2');
    expect(suggestion.category).toBe(DRAWN_KIND_LABELS.pie);
    expect(suggestion.envelopeData).toMatchObject({
      subtype: 'drawn',
      renderer: 'drawn',
      kind: 'pie',
      seed: 12,
      title: 'Launch',
    });
    expect(drawnOptionKey('pie', 12)).toBe(suggestion.key);
  });

  it('reads the route error message verbatim', () => {
    expect(routeErrorMessage({ error: 'Rate limit exceeded.' })).toBe('Rate limit exceeded.');
    expect(routeErrorMessage({ error: '  ' })).toBeNull();
    expect(routeErrorMessage(null)).toBeNull();
  });
});
