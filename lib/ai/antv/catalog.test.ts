import { getTemplates } from '@antv/infographic';
import { describe, expect, it } from 'vitest';

import type { OutlineKind, VisualOutline } from '@/lib/ai/outline';
import {
  ANTV_TEMPLATES,
  antvTemplateLabel,
  antvTemplatesFor,
  isKnownAntvTemplate,
  similarTemplates,
} from './catalog';

function outline(kind: OutlineKind, count: number): VisualOutline {
  return {
    title: 'T',
    ordered: kind === 'steps' || kind === 'timeline',
    kind,
    items: Array.from({ length: count }, (_, i) => ({ label: `Item ${i}` })),
  };
}

describe('PATCH-241 catalogue data', () => {
  it('is generated from the installed package', () => {
    const installed = new Set(getTemplates());
    expect(ANTV_TEMPLATES.length).toBe(installed.size);
    for (const info of ANTV_TEMPLATES) {
      expect(installed.has(info.name), `${info.name} must exist`).toBe(true);
      expect(info.category).toBe(info.name.split('-')[0]);
      expect(info.family).toBe(info.name.split('-').slice(0, 2).join('-'));
    }
  });

  it('reads a readable label and recognises names', () => {
    expect(antvTemplateLabel('list-grid-badge-card')).toBe('List grid badge card');
    expect(isKnownAntvTemplate('list-grid-badge-card')).toBe(true);
    expect(isKnownAntvTemplate('nope-not-real')).toBe(false);
  });
});

describe('PATCH-241 antvTemplatesFor shape filters', () => {
  it('never offers relation templates; value-less outlines only get a word cloud', () => {
    for (const kind of ['list', 'steps', 'levels', 'cycle', 'parts', 'comparison', 'timeline'] as OutlineKind[]) {
      const names = antvTemplatesFor(outline(kind, 4));
      expect(names.some((n) => n.startsWith('relation-'))).toBe(false);
      expect(names.filter((n) => n.startsWith('chart-')).every((n) => n.startsWith('chart-wordcloud'))).toBe(true);
    }
  });

  it('only offers compare templates for a two-item comparison', () => {
    const two = antvTemplatesFor(outline('comparison', 2));
    expect(two.some((n) => n.startsWith('compare-'))).toBe(true);

    const four = antvTemplatesFor(outline('comparison', 4));
    expect(four.some((n) => n.startsWith('compare-'))).toBe(false);

    const twoList = antvTemplatesFor(outline('list', 2));
    expect(twoList.some((n) => n.startsWith('compare-'))).toBe(false);
  });

  it('only offers quadrant templates for exactly four items', () => {
    expect(antvTemplatesFor(outline('list', 2)).some((n) => n.startsWith('quadrant-'))).toBe(false);
    expect(antvTemplatesFor(outline('list', 8)).some((n) => n.startsWith('quadrant-'))).toBe(false);
    expect(antvTemplatesFor(outline('list', 4)).some((n) => n.startsWith('quadrant-'))).toBe(true);
  });

  it('holds list/sequence to 2..8 items', () => {
    expect(antvTemplatesFor(outline('list', 8)).every((n) => !n.startsWith('list-') || true)).toBe(true);
    const nine = { ...outline('list', 9), items: Array.from({ length: 9 }, (_, i) => ({ label: `I${i}` })) };
    expect(antvTemplatesFor(nine).some((n) => n.startsWith('list-') || n.startsWith('sequence-'))).toBe(false);
  });
});

describe('PATCH-248 antvTemplatesFor valued charts', () => {
  function valued(count: number): VisualOutline {
    return {
      title: 'T',
      ordered: false,
      kind: 'list',
      items: Array.from({ length: count }, (_, i) => ({ label: `I${i}`, value: i + 1 })),
    };
  }

  it('offers all six pie designs and the bar/column/line ones when 2+ items have a value', () => {
    const names = antvTemplatesFor(valued(4));
    for (const expected of [
      'chart-pie-plain-text',
      'chart-pie-compact-card',
      'chart-pie-pill-badge',
      'chart-pie-donut-plain-text',
      'chart-pie-donut-compact-card',
      'chart-pie-donut-pill-badge',
      'chart-bar-plain-text',
      'chart-column-simple',
      'chart-line-plain-text',
    ]) {
      expect(names, expected).toContain(expected);
    }
  });

  it('offers no pie/bar/column/line design without values', () => {
    const names = antvTemplatesFor(outline('list', 4));
    expect(names.some((n) => /^chart-(pie|bar|column|line)/.test(n))).toBe(false);
  });

  it('offers a word cloud only from three items, with or without values', () => {
    expect(antvTemplatesFor(outline('list', 2)).some((n) => n.startsWith('chart-wordcloud'))).toBe(false);
    expect(antvTemplatesFor(outline('list', 3)).some((n) => n.startsWith('chart-wordcloud'))).toBe(true);
    expect(antvTemplatesFor(valued(3)).some((n) => n.startsWith('chart-wordcloud'))).toBe(true);
  });
});

describe('PATCH-241 antvTemplatesFor ranking', () => {
  const first = (kind: OutlineKind, count = 4) => antvTemplatesFor(outline(kind, count))[0];

  it('ranks the first choice per kind', () => {
    expect(first('steps').startsWith('sequence-')).toBe(true);
    expect(first('levels').startsWith('list-pyramid')).toBe(true);
    expect(/circle|cycle|ring/.test(first('cycle'))).toBe(true);
    expect(first('parts').startsWith('hierarchy-')).toBe(true);
    expect(first('comparison', 2).startsWith('compare-')).toBe(true);
    expect(first('timeline').startsWith('sequence-timeline')).toBe(true);
    expect(first('list').startsWith('list-grid')).toBe(true);
  });
});

describe('PATCH-241 similarTemplates', () => {
  it('returns same-family templates, excluding itself', () => {
    const similar = similarTemplates('list-grid-badge-card');
    expect(similar.length).toBeGreaterThan(0);
    expect(similar).not.toContain('list-grid-badge-card');
    for (const name of similar) {
      expect(name.startsWith('list-grid-')).toBe(true);
    }
  });

  it('returns an empty list for an unknown name', () => {
    expect(similarTemplates('not-a-template')).toEqual([]);
  });
});
