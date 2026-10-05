/**
 * PATCH-282. The curated list of AntV designs shipped as the drawing editor's
 * built-in library. The order is the CTO's pick from the 276-design audit
 * (PATCH-282): at most 6 designs per AntV family, no "animated" variants.
 *
 * The list is pure data: the export view (`AntvExcalidrawHarness` with
 * `?export=library`) renders exactly these, in this order, into
 * `public/libraries/antv-diagrams.excalidrawlib`.
 */

import { parseAntvChartData } from '../chartValues/data';

export type AntvLibrarySection =
  | 'Charts'
  | 'Lists'
  | 'Steps & timelines'
  | 'Hierarchies & mind maps'
  | 'Comparisons'
  | 'Relations';

export interface AntvLibraryTemplate {
  /** The AntV template id (`chart-pie-donut-pill-badge`). */
  template: string;
  /** The library item label (template id without its first word). */
  name: string;
  /** The Excalidraw library section (suffixed onto the name at export). */
  section: AntvLibrarySection;
}

/**
 * The name rule from PATCH-282: drop the first word (the category), turn the
 * remaining dashes into spaces and upper-case the first letter.
 * `chart-pie-donut-pill-badge` -> `Pie donut pill badge`;
 * `compare-swot` -> `Swot`; `chart-wordcloud` -> `Wordcloud`.
 */
export function libraryTemplateName(template: string): string {
  const words = template.split('-').slice(1).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const BY_SECTION: ReadonlyArray<readonly [AntvLibrarySection, readonly string[]]> = [
  [
    'Charts',
    [
      'chart-pie-donut-pill-badge',
      'chart-pie-compact-card',
      'chart-pie-donut-plain-text',
      'chart-pie-pill-badge',
      'chart-column-simple',
      'chart-bar-plain-text',
      'chart-line-plain-text',
      'chart-wordcloud',
    ],
  ],
  [
    'Lists',
    [
      'list-grid-badge-card',
      'list-grid-candy-card-lite',
      'list-grid-circular-progress',
      'list-grid-compact-card',
      'list-grid-done-list',
      'list-grid-ribbon-card',
      'list-row-horizontal-icon-arrow',
      'list-row-circular-progress',
      'list-row-simple-illus',
      'list-column-vertical-icon-arrow',
      'list-column-done-list',
      'list-pyramid-badge-card',
      'list-sector-plain-text',
      'list-waterfall-badge-card',
      'list-zigzag-down-compact-card',
    ],
  ],
  [
    'Steps & timelines',
    [
      'sequence-steps-badge-card',
      'sequence-steps-simple',
      'sequence-timeline-simple',
      'sequence-timeline-rounded-rect-node',
      'sequence-timeline-done-list',
      'sequence-roadmap-vertical-badge-card',
      'sequence-roadmap-vertical-simple',
      'sequence-snake-steps-compact-card',
      'sequence-snake-steps-pill-badge',
      'sequence-stairs-front-pill-badge',
      'sequence-ascending-steps',
      'sequence-funnel-simple',
      'sequence-pyramid-simple',
      'sequence-zigzag-pucks-3d-simple',
      'sequence-horizontal-zigzag-simple',
      'sequence-circular-simple',
      'sequence-cylinders-3d-simple',
      'sequence-color-snake-steps-horizontal-icon-line',
      'sequence-mountain-underline-text',
      'sequence-filter-mesh-simple',
      'sequence-circle-arrows-indexed-card',
      'sequence-interaction-default-badge-card',
      'sequence-interaction-default-compact-card',
    ],
  ],
  [
    'Hierarchies & mind maps',
    [
      'hierarchy-mindmap-branch-gradient-capsule-item',
      'hierarchy-mindmap-branch-gradient-compact-card',
      'hierarchy-mindmap-level-gradient-rounded-rect',
      'hierarchy-mindmap-branch-gradient-lined-palette',
      'hierarchy-mindmap-level-gradient-circle-progress',
      'hierarchy-structure',
      'hierarchy-structure-mirror',
      'hierarchy-tree-curved-line-compact-card',
      'hierarchy-tree-dashed-arrow-badge-card',
      'hierarchy-tree-lr-curved-line-badge-card',
      'hierarchy-tree-tech-style-capsule-item',
      'hierarchy-tree-distributed-origin-rounded-rect-node',
    ],
  ],
  [
    'Comparisons',
    [
      'compare-binary-horizontal-badge-card-vs',
      'compare-binary-horizontal-compact-card-arrow',
      'compare-binary-horizontal-simple-fold',
      'compare-binary-horizontal-underline-text-vs',
      'compare-swot',
      'compare-quadrant-quarter-simple-card',
      'compare-quadrant-simple-illus',
      'compare-hierarchy-left-right-circle-node-pill-badge',
      'compare-hierarchy-row-letter-card-compact-card',
      'quadrant-quarter-circular',
    ],
  ],
  [
    'Relations',
    [
      'relation-dagre-flow-lr-badge-card',
      'relation-dagre-flow-tb-compact-card',
      'relation-dagre-flow-lr-simple-circle-node',
      'relation-network-icon-badge',
      'relation-circle-icon-badge',
      'relation-circle-circular-progress',
    ],
  ],
];

export const ANTV_LIBRARY_TEMPLATES: readonly AntvLibraryTemplate[] = BY_SECTION.flatMap(
  ([section, templates]) =>
    templates.map((template) => ({
      template,
      name: libraryTemplateName(template),
      section,
    })),
);

/**
 * PATCH-282 Addendum 1. The generated file blew past the 2.5 MB budget because
 * of pretty-printing and float noise; the export view serialises compact through
 * this helper. These element keys hold integers and are never rounded.
 */
const VERBATIM_INTEGER_KEYS = new Set(['seed', 'versionNonce', 'version', 'updated']);

function roundNumber(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundDeep(value: unknown): unknown {
  if (typeof value === 'number') return roundNumber(value);
  if (Array.isArray(value)) return value.map(roundDeep);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) out[key] = roundDeep(nested);
    return out;
  }
  return value;
}

/**
 * PATCH-287. The only `customData` a chart element keeps: its role and its
 * parseable chart data. Everything else is converter bookkeeping and is
 * dropped, as before.
 */
function keptChartCustomData(value: unknown): { antvRole: unknown; antvChart: unknown } | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as { antvRole?: unknown; antvChart?: unknown };
  const chart = parseAntvChartData(raw.antvChart);
  if (!chart) return null;
  return { antvRole: raw.antvRole, antvChart: chart };
}

/**
 * One element as it is written into the library file: every float is rounded to
 * one decimal, recursively. A chart element keeps ONLY its role and chart data;
 * every other `customData` is dropped.
 */
export function exportLibraryElement(element: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(element)) {
    if (key === 'customData') {
      const kept = keptChartCustomData(value);
      if (kept) out.customData = kept;
      continue;
    }
    out[key] = VERBATIM_INTEGER_KEYS.has(key) ? value : roundDeep(value);
  }
  return out;
}

export interface AntvLibraryItemInput {
  id: string;
  status: 'published';
  created: number;
  name: string;
  elements: ReadonlyArray<Record<string, unknown>>;
}

export interface AntvLibraryFile {
  type: 'excalidrawlib';
  version: 2;
  source: 'antv';
  libraryItems: AntvLibraryItemInput[];
}

/** The whole library file, with every element passed through the export transform. */
export function buildAntvLibraryFile(
  libraryItems: ReadonlyArray<AntvLibraryItemInput>,
): AntvLibraryFile {
  return {
    type: 'excalidrawlib',
    version: 2,
    source: 'antv',
    libraryItems: libraryItems.map((item) => ({
      id: item.id,
      status: item.status,
      created: item.created,
      name: item.name,
      elements: item.elements.map(exportLibraryElement),
    })),
  };
}

/** Compact (no indentation) JSON for the library file. */
export function serializeAntvLibrary(libraryItems: ReadonlyArray<AntvLibraryItemInput>): string {
  return JSON.stringify(buildAntvLibraryFile(libraryItems));
}
