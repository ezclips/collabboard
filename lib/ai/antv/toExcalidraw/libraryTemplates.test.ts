// PATCH-282. The curated AntV library list the drawing editor ships. These
// assertions guard the exact 74-template set, the catalogue membership, the
// per-family cap and the name rule, so the generated `.excalidrawlib` cannot
// silently drift from the catalogue.
import { describe, expect, it } from 'vitest';

import { ANTV_TEMPLATES } from '../catalog';
import {
  ANTV_LIBRARY_TEMPLATES,
  exportLibraryElement,
  libraryTemplateName,
  serializeAntvLibrary,
} from './libraryTemplates';

describe('PATCH-282: ANTV_LIBRARY_TEMPLATES', () => {
  it('has exactly 74 entries', () => {
    expect(ANTV_LIBRARY_TEMPLATES).toHaveLength(74);
  });

  it('only lists templates that exist in the catalogue', () => {
    const known = new Set(ANTV_TEMPLATES.map((t) => t.name));
    const missing = ANTV_LIBRARY_TEMPLATES.filter((e) => !known.has(e.template)).map((e) => e.template);
    expect(missing).toEqual([]);
  });

  it('has unique names and unique templates', () => {
    const names = ANTV_LIBRARY_TEMPLATES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    const templates = ANTV_LIBRARY_TEMPLATES.map((e) => e.template);
    expect(new Set(templates).size).toBe(templates.length);
  });

  it('has at most 6 entries per AntV family, except sequence-* families', () => {
    const byName = new Map(ANTV_TEMPLATES.map((t) => [t.name, t]));
    const counts = new Map<string, number>();
    for (const entry of ANTV_LIBRARY_TEMPLATES) {
      const family = byName.get(entry.template)?.family ?? '';
      if (family.startsWith('sequence-')) continue;
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    for (const [family, count] of counts) {
      expect(count, `${family} has ${count} entries`).toBeLessThanOrEqual(6);
    }
  });

  it('gives every section at least one entry', () => {
    const sections = new Set(ANTV_LIBRARY_TEMPLATES.map((e) => e.section));
    expect(sections.size).toBe(6);
    for (const section of sections) {
      expect(
        ANTV_LIBRARY_TEMPLATES.filter((e) => e.section === section).length,
        `${section} is empty`,
      ).toBeGreaterThan(0);
    }
  });

  it('derives a name by dropping the first word, dashes to spaces, capitalising', () => {
    expect(libraryTemplateName('chart-pie-donut-pill-badge')).toBe('Pie donut pill badge');
    expect(libraryTemplateName('compare-swot')).toBe('Swot');
    expect(libraryTemplateName('chart-wordcloud')).toBe('Wordcloud');
    const stored = ANTV_LIBRARY_TEMPLATES.find((e) => e.template === 'chart-pie-donut-pill-badge');
    expect(stored?.name).toBe('Pie donut pill badge');
  });

  it('starts with the Charts section in the documented order', () => {
    expect(ANTV_LIBRARY_TEMPLATES[0].section).toBe('Charts');
    expect(ANTV_LIBRARY_TEMPLATES[0].template).toBe('chart-pie-donut-pill-badge');
    expect(ANTV_LIBRARY_TEMPLATES[7].template).toBe('chart-wordcloud');
    expect(ANTV_LIBRARY_TEMPLATES[8].section).toBe('Lists');
  });
});

// PATCH-282 Addendum 1: the generated file must fit the 2.5 MB budget, so the
// serialiser drops indentation and converter bookkeeping and rounds float noise.
describe('PATCH-282 Addendum 1: compact library serialiser', () => {
  const element: Record<string, unknown> = {
    id: 'e0',
    type: 'rectangle',
    x: 1.2345,
    y: -2.3456,
    width: 10,
    height: 3.987,
    angle: 0.049,
    seed: 123456789,
    versionNonce: 987654321,
    version: 42,
    updated: 1700000000000,
    customData: { antvId: 'e0', antvKind: 'rect' },
    points: [[0.1234, 4.5678], [9.8765, 0.4321]],
    bound: { gap: 0.5678, focus: 1.2345 },
  };

  it('rounds floats to one decimal, recursively', () => {
    const out = exportLibraryElement(element);
    expect(out.x).toBe(1.2);
    expect(out.y).toBe(-2.3);
    expect(out.height).toBe(4);
    expect(out.angle).toBe(0);
    expect(out.points).toEqual([[0.1, 4.6], [9.9, 0.4]]);
    expect((out.bound as Record<string, unknown>).gap).toBe(0.6);
    expect((out.bound as Record<string, unknown>).focus).toBe(1.2);
  });

  it('drops customData from the exported element', () => {
    const out = exportLibraryElement(element);
    expect('customData' in out).toBe(false);
    expect(out.id).toBe('e0');
  });

  it('keeps seed, versionNonce, version and updated as integers', () => {
    const out = exportLibraryElement(element);
    expect(out.seed).toBe(123456789);
    expect(out.versionNonce).toBe(987654321);
    expect(out.version).toBe(42);
    expect(out.updated).toBe(1700000000000);
  });

  it('serialises compact, with no indentation and no customData', () => {
    const json = serializeAntvLibrary([
      { id: 'antv:x', status: 'published', created: 0, name: 'Charts · X', elements: [element] },
    ]);
    expect(json).not.toContain('\n');
    expect(json).not.toContain(': ');
    expect(json).not.toContain('customData');
    expect(json).toContain('"type":"excalidrawlib"');
    expect(json).toContain('"source":"antv"');
  });
});
