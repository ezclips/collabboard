// PATCH-292. The drawing library ships every still AntV design (256), not only
// the 74 PATCH-282 picks. These assertions guard the exact set, the picks-first
// ordering, the category->section map, the name rule and the serialiser, so the
// generated `.excalidrawlib` cannot silently drift from the catalogue.
import { describe, expect, it } from 'vitest';

import { ANTV_TEMPLATES } from '../catalog';
import {
  ANTV_LIBRARY_PICKS,
  ANTV_LIBRARY_TEMPLATES,
  exportLibraryElement,
  libraryTemplateName,
  serializeAntvLibrary,
  type AntvLibrarySection,
} from './libraryTemplates';

const SECTION_ORDER: readonly AntvLibrarySection[] = [
  'Charts',
  'Lists',
  'Steps & timelines',
  'Hierarchies & mind maps',
  'Comparisons',
  'Relations',
];

const SECTION_BY_CATEGORY: Readonly<Record<string, AntvLibrarySection>> = {
  chart: 'Charts',
  list: 'Lists',
  sequence: 'Steps & timelines',
  hierarchy: 'Hierarchies & mind maps',
  compare: 'Comparisons',
  quadrant: 'Comparisons',
  relation: 'Relations',
};

const CATALOGUE_BY_NAME = new Map(ANTV_TEMPLATES.map((t) => [t.name, t]));
const CATALOGUE_ORDER = ANTV_TEMPLATES.map((t) => t.name);
const isAnimated = (name: string): boolean => name.includes('-animated-');
const picksFor = (section: AntvLibrarySection): readonly string[] =>
  ANTV_LIBRARY_PICKS.find(([s]) => s === section)?.[1] ?? [];

describe('PATCH-292: ANTV_LIBRARY_TEMPLATES', () => {
  it('has exactly 256 entries, one per non-animated catalogue template', () => {
    const nonAnimated = CATALOGUE_ORDER.filter((name) => !isAnimated(name));
    expect(nonAnimated).toHaveLength(256);
    expect(ANTV_LIBRARY_TEMPLATES).toHaveLength(256);
    const listed = new Set(ANTV_LIBRARY_TEMPLATES.map((e) => e.template));
    expect(listed.size).toBe(256);
    expect([...listed].sort()).toEqual([...nonAnimated].sort());
  });

  it('lists no animated template', () => {
    expect(ANTV_LIBRARY_TEMPLATES.filter((e) => isAnimated(e.template))).toEqual([]);
  });

  it('keeps the 74 picks, section by section, ahead of the rest in catalogue order', () => {
    const pickCount = ANTV_LIBRARY_PICKS.reduce((total, [, names]) => total + names.length, 0);
    expect(pickCount).toBe(74);

    for (const section of SECTION_ORDER) {
      const picks = picksFor(section);
      const entries = ANTV_LIBRARY_TEMPLATES.filter((e) => e.section === section).map(
        (e) => e.template,
      );
      expect(entries.slice(0, picks.length), `${section} picks`).toEqual(picks);

      const rest = entries.slice(picks.length);
      const expectedRest = CATALOGUE_ORDER.filter(
        (name) =>
          !isAnimated(name) &&
          SECTION_BY_CATEGORY[CATALOGUE_BY_NAME.get(name)!.category] === section &&
          !picks.includes(name),
      );
      expect(rest, `${section} rest`).toEqual(expectedRest);
    }
  });

  it('derives every entry section from its catalogue category', () => {
    for (const entry of ANTV_LIBRARY_TEMPLATES) {
      const info = CATALOGUE_BY_NAME.get(entry.template);
      expect(info, entry.template).toBeDefined();
      expect(entry.section).toBe(SECTION_BY_CATEGORY[info!.category]);
    }
  });

  it('lists the six sections in the documented order, contiguous', () => {
    const order: AntvLibrarySection[] = [];
    for (const entry of ANTV_LIBRARY_TEMPLATES) {
      if (order[order.length - 1] !== entry.section) order.push(entry.section);
    }
    expect(order).toEqual([...SECTION_ORDER]);
  });

  it('has unique names and unique templates', () => {
    const names = ANTV_LIBRARY_TEMPLATES.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    const templates = ANTV_LIBRARY_TEMPLATES.map((e) => e.template);
    expect(new Set(templates).size).toBe(templates.length);
  });

  it('derives a name by dropping the first word, dashes to spaces, capitalising', () => {
    expect(libraryTemplateName('chart-pie-donut-pill-badge')).toBe('Pie donut pill badge');
    expect(libraryTemplateName('compare-swot')).toBe('Swot');
    expect(libraryTemplateName('chart-wordcloud')).toBe('Wordcloud');
    const stored = ANTV_LIBRARY_TEMPLATES.find((e) => e.template === 'chart-pie-donut-pill-badge');
    expect(stored?.name).toBe('Pie donut pill badge');
  });

  it('starts with the Charts picks and ends with the Relations section', () => {
    expect(ANTV_LIBRARY_TEMPLATES[0].section).toBe('Charts');
    expect(ANTV_LIBRARY_TEMPLATES[0].template).toBe('chart-pie-donut-pill-badge');
    expect(ANTV_LIBRARY_TEMPLATES[7].template).toBe('chart-wordcloud');
    expect(ANTV_LIBRARY_TEMPLATES[ANTV_LIBRARY_TEMPLATES.length - 1].section).toBe('Relations');
  });
});

// PATCH-282 Addendum 1: the generated file must fit the size budget, so the
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
