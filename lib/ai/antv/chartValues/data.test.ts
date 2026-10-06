// PATCH-287. The chart data that travels with a drawing-library chart. The
// schema is the only gate into customData, so it is asserted directly (unknown
// template, item count, empty label, negative/NaN value) and
// `parseAntvChartData` must never throw on junk.
import { describe, expect, it } from 'vitest';

import {
  ANTV_CHART_TEMPLATES,
  antvChartDataSchema,
  chartDataToOutline,
  isAntvChartTemplate,
  isAntvPieTemplate,
  parseAntvChartData,
  type AntvChartData,
} from './data';

function sample(overrides: Partial<AntvChartData> = {}): unknown {
  return {
    v: 1,
    template: 'chart-pie-donut-pill-badge',
    theme: 'classic',
    title: 'Seasonal plan',
    items: [
      { label: 'Spring', value: 24, detail: 'Planting and first blooms', icon: 'sprout' },
      { label: 'Summer', value: 40, detail: 'Peak growth and long days', icon: 'sun' },
      { label: 'Autumn', value: 26, detail: 'Harvest and colour', icon: 'leaf' },
      { label: 'Winter', value: 10, detail: 'Rest and planning', icon: 'snowflake' },
      { label: 'Every season', value: 12, detail: 'Steady care', icon: 'heart' },
    ],
    ...overrides,
  };
}

describe('PATCH-287: isAntvChartTemplate', () => {
  it('knows the 9 chart templates and rejects others', () => {
    expect(ANTV_CHART_TEMPLATES).toHaveLength(9);
    expect(isAntvChartTemplate('chart-pie-donut-pill-badge')).toBe(true);
    expect(isAntvChartTemplate('chart-column-simple')).toBe(true);
    expect(isAntvChartTemplate('chart-pie-donut-compact-card')).toBe(true);
    expect(isAntvChartTemplate('chart-pie-plain-text')).toBe(true);
    expect(isAntvChartTemplate('chart-wordcloud')).toBe(false);
    expect(isAntvChartTemplate('chart-wordcloud-rotate')).toBe(false);
    expect(isAntvChartTemplate('list-grid-badge-card')).toBe(false);
    expect(isAntvChartTemplate(undefined)).toBe(false);
    expect(isAntvChartTemplate(7)).toBe(false);
  });

  it('accepts the two new pies in the schema and flags them as pies', () => {
    const template = 'chart-pie-donut-compact-card' as AntvChartData['template'];
    const plain = 'chart-pie-plain-text' as AntvChartData['template'];
    expect(antvChartDataSchema.safeParse(sample({ template })).success).toBe(true);
    expect(antvChartDataSchema.safeParse(sample({ template: plain })).success).toBe(true);
    expect(isAntvPieTemplate('chart-pie-donut-compact-card')).toBe(true);
    expect(isAntvPieTemplate('chart-pie-plain-text')).toBe(true);
    expect(isAntvPieTemplate('chart-wordcloud-rotate')).toBe(false);
  });
});

describe('PATCH-287: antvChartDataSchema', () => {
  it('accepts the library-shaped data', () => {
    const parsed = antvChartDataSchema.safeParse(sample());
    expect(parsed.success).toBe(true);
  });

  it('rejects 0 or 11 items', () => {
    expect(antvChartDataSchema.safeParse(sample({ items: [] })).success).toBe(false);
    const eleven = Array.from({ length: 11 }, (_, i) => ({ label: `Item ${i}`, value: i }));
    expect(antvChartDataSchema.safeParse(sample({ items: eleven })).success).toBe(false);
  });

  it('rejects an empty / whitespace label', () => {
    expect(
      antvChartDataSchema.safeParse(sample({ items: [{ label: '   ', value: 1 }] })).success,
    ).toBe(false);
  });

  it('rejects a negative or non-finite value', () => {
    expect(
      antvChartDataSchema.safeParse(sample({ items: [{ label: 'x', value: -1 }] })).success,
    ).toBe(false);
    expect(
      antvChartDataSchema.safeParse(sample({ items: [{ label: 'x', value: Number.NaN }] })).success,
    ).toBe(false);
    expect(
      antvChartDataSchema.safeParse(sample({ items: [{ label: 'x', value: Infinity }] })).success,
    ).toBe(false);
  });

  it('rejects an unknown template', () => {
    expect(antvChartDataSchema.safeParse(sample({ template: 'chart-wordcloud' as never })).success).toBe(
      false,
    );
  });

  it('rejects an over-long title and an over-long detail', () => {
    expect(antvChartDataSchema.safeParse(sample({ title: 'x'.repeat(81) })).success).toBe(false);
    expect(
      antvChartDataSchema.safeParse(sample({ items: [{ label: 'x', value: 1, detail: 'd'.repeat(121) }] }))
        .success,
    ).toBe(false);
  });

  it('rejects an icon with an illegal character', () => {
    expect(
      antvChartDataSchema.safeParse(sample({ items: [{ label: 'x', value: 1, icon: 'Bad Icon' }] }))
        .success,
    ).toBe(false);
  });
});

describe('PATCH-289: transparentBackground', () => {
  it('parses old data without the flag and accepts a boolean flag', () => {
    const old = parseAntvChartData(sample());
    expect(old).not.toBeNull();
    expect(old?.transparentBackground).toBeUndefined();

    const parsed = parseAntvChartData(sample({ transparentBackground: true }));
    expect(parsed?.transparentBackground).toBe(true);
  });

  it('rejects a non-boolean flag', () => {
    expect(antvChartDataSchema.safeParse(sample({ transparentBackground: 'yes' as never })).success).toBe(false);
  });
});

describe('PATCH-287: parseAntvChartData', () => {
  it('returns the data for a valid payload', () => {
    const parsed = parseAntvChartData(sample());
    expect(parsed).not.toBeNull();
    expect(parsed?.items).toHaveLength(5);
    expect(parsed?.template).toBe('chart-pie-donut-pill-badge');
  });

  it('returns null and never throws on junk', () => {
    const junk: unknown[] = [
      null,
      undefined,
      0,
      'nope',
      [],
      {},
      { v: 2, template: 'chart-pie-donut-pill-badge', theme: 'classic', title: 't', items: [] },
      { v: 1, template: 'chart-wordcloud', theme: 'classic', title: 't', items: [{ label: 'a', value: 1 }] },
    ];
    for (const value of junk) {
      expect(() => parseAntvChartData(value)).not.toThrow();
      expect(parseAntvChartData(value)).toBeNull();
    }
  });
});

describe('PATCH-287: chartDataToOutline', () => {
  it('turns the chart data into a list outline with values', () => {
    const data = parseAntvChartData(sample());
    if (!data) throw new Error('expected data');
    const outline = chartDataToOutline(data);
    expect(outline.kind).toBe('list');
    expect(outline.ordered).toBe(true);
    expect(outline.title).toBe('Seasonal plan');
    expect(outline.items).toHaveLength(5);
    expect(outline.items[0]).toMatchObject({ label: 'Spring', value: 24, detail: 'Planting and first blooms', icon: 'sprout' });
    expect(outline.items.every((item) => item.children === undefined)).toBe(true);
  });
});
