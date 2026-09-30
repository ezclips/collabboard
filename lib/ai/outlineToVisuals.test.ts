import { describe, expect, it } from 'vitest';

import type { VisualOutline } from './outline';
import { mermaidLabel, outlineToVisuals } from './outlineToVisuals';

function outline(overrides: Partial<VisualOutline> = {}): VisualOutline {
  return {
    title: 'Water cycle',
    ordered: false,
    items: [{ label: 'A' }, { label: 'B' }],
    ...overrides,
  };
}

const keys = (o: VisualOutline) => outlineToVisuals(o).map((option) => option.key);

describe('PATCH-233 outlineToVisuals', () => {
  it('offers mind map, comparison and flow for a short unordered list', () => {
    expect(keys(outline())).toEqual(['mindmap', 'comparison', 'flow']);
    expect(keys(outline({ items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] })))
      .toEqual(['mindmap', 'comparison', 'flow']);
  });

  it('drops comparison above 4 items and flow above 6 items', () => {
    const six = outline({ items: Array.from({ length: 6 }, (_, i) => ({ label: `I${i}` })) });
    expect(keys(six)).toEqual(['mindmap', 'flow']);

    const eight = outline({ items: Array.from({ length: 8 }, (_, i) => ({ label: `I${i}` })) });
    expect(keys(eight)).toEqual(['mindmap']);
  });

  it('adds timeline only when the outline is ordered', () => {
    expect(keys(outline({ ordered: true, items: [{ label: 'A' }, { label: 'B' }, { label: 'C' }] })))
      .toEqual(['mindmap', 'comparison', 'flow', 'timeline']);
  });

  it('draws the mind map with a root title and two-space indentation', () => {
    const option = outlineToVisuals(outline({
      title: 'Water cycle',
      items: [{ label: 'Evaporation', children: [{ label: 'Oceans' }] }, { label: 'Condensation' }],
    })).find((o) => o.key === 'mindmap')!;
    const data = option.envelopeData;
    if (data.subtype !== 'mindmap') throw new Error('expected a mindmap');

    expect(data.code.startsWith('mindmap\n')).toBe(true);
    expect(data.code).toContain('  root(("Water cycle"))');
    expect(data.code).toContain('    i0["Evaporation"]');
    expect(data.code).toContain('      i0c0["Oceans"]');
    expect(data.code).toContain('    i1["Condensation"]');
  });

  it('renders hostile flowchart labels without unescaped syntax', () => {
    const hostile = 'a"b]c{d}|e';
    expect(mermaidLabel(hostile)).toBe('abcde');

    const option = outlineToVisuals(outline({
      items: [{ label: hostile }, { label: 'Safe' }],
    })).find((o) => o.key === 'flow')!;
    const data = option.envelopeData;
    if (data.subtype !== 'flowchart') throw new Error('expected a flowchart');

    expect(data.code).toContain('N0["abcde"]');
    expect(data.code).toContain('N0 --> N1');
    // The raw hostile characters never reach the diagram text.
    expect(data.code).not.toContain('a"b');
    expect(data.code).not.toContain(']c');
    expect(data.code).not.toContain('}');
  });

  it('builds comparison columns from children, else the detail', () => {
    const option = outlineToVisuals(outline({
      items: [
        { label: 'Cats', children: [{ label: 'Independent' }, { label: 'Quiet' }] },
        { label: 'Dogs', detail: 'Loyal' },
      ],
    })).find((o) => o.key === 'comparison')!;
    const data = option.envelopeData;
    if (data.subtype !== 'comparison') throw new Error('expected a comparison');

    expect(data.columns).toEqual([
      { heading: 'Cats', points: ['Independent', 'Quiet'] },
      { heading: 'Dogs', points: ['Loyal'] },
    ]);
  });

  it('builds timeline items with dateLabel and description', () => {
    const option = outlineToVisuals(outline({
      ordered: true,
      items: [
        { label: 'Kickoff', date: 'Jan', detail: 'Scope the work' },
        { label: 'Ship', date: 'Feb' },
      ],
    })).find((o) => o.key === 'timeline')!;
    const data = option.envelopeData;
    if (data.subtype !== 'timeline') throw new Error('expected a timeline');

    expect(data.items).toEqual([
      { title: 'Kickoff', description: 'Scope the work', dateLabel: 'Jan' },
      { title: 'Ship', description: undefined, dateLabel: 'Feb' },
    ]);
  });
});
