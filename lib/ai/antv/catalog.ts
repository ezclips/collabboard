/**
 * PATCH-241. Which AntV templates fit a given outline, best first. Pure, built
 * from the committed catalogue (`catalog.data.ts`, generated from the installed
 * package). Chart/relation templates are excluded: we have no numeric series or
 * graph edges to give them yet.
 */

import type { OutlineKind, VisualOutline } from '@/lib/ai/outline';
import { ANTV_TEMPLATES } from './catalog.data';

export interface AntvTemplateInfo {
  name: string;
  /** First segment, e.g. `list`. */
  category: string;
  /** First two segments, e.g. `list-grid`. */
  family: string;
}

const BY_NAME = new Map<string, AntvTemplateInfo>(ANTV_TEMPLATES.map((info) => [info.name, info]));

export function antvTemplateInfo(name: string): AntvTemplateInfo | undefined {
  return BY_NAME.get(name);
}

export function isKnownAntvTemplate(name: string): boolean {
  return BY_NAME.has(name);
}

/** A readable tile label from the template id: `list-grid-badge-card`. */
export function antvTemplateLabel(name: string): string {
  const spaced = name.replace(/-/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Lower number = better fit. Per-kind preferred name prefixes, in order. */
const PREFERRED: Record<OutlineKind, Array<(name: string) => boolean>> = {
  steps: [(n) => n.startsWith('sequence-'), (n) => n.startsWith('list-row')],
  levels: [(n) => n.startsWith('list-pyramid'), (n) => n.startsWith('hierarchy-')],
  cycle: [(n) => /circle|cycle|ring/.test(n)],
  parts: [(n) => n.startsWith('hierarchy-'), (n) => n.startsWith('list-grid')],
  comparison: [(n) => n.startsWith('compare-')],
  timeline: [(n) => n.startsWith('sequence-timeline')],
  list: [(n) => n.startsWith('list-grid'), (n) => n.startsWith('list-row')],
  cause_effect: [(n) => n.startsWith('sequence-'), (n) => n.startsWith('list-')],
};

function rankFor(prefs: Array<(name: string) => boolean>, name: string): number {
  for (let i = 0; i < prefs.length; i += 1) {
    if (prefs[i](name)) return i;
  }
  return prefs.length;
}

/**
 * The data shape a template can hold. Compare is only sensible for a two-sided
 * comparison; quadrant needs exactly four; lists/sequences hold 2..8 flat items;
 * hierarchy/mind-map templates need at least two items. PATCH-248: the chart
 * designs need numbers -- pie/bar/column/line fit when 2..8 items carry a
 * `value`; word clouds fit any 3+ item outline.
 */
function shapeAllows(name: string, outline: VisualOutline): boolean {
  const count = outline.items.length;
  if (name.startsWith('relation-')) return false;
  if (name.startsWith('chart-wordcloud')) return count >= 3;
  if (name.startsWith('chart-')) {
    const valued = outline.items.filter((item) => typeof item.value === 'number').length;
    return valued >= 2 && count >= 2 && count <= 8;
  }
  if (name.startsWith('quadrant-')) return count === 4;
  if (name.startsWith('compare-')) return outline.kind === 'comparison' && count === 2;
  if (name.startsWith('hierarchy-')) return count >= 2;
  if (name.startsWith('list-') || name.startsWith('sequence-')) return count >= 2 && count <= 8;
  return false;
}

/** Every catalogue template whose data shape fits this outline, best first. */
export function antvTemplatesFor(outline: VisualOutline): string[] {
  const prefs = PREFERRED[outline.kind] ?? PREFERRED.list;
  return ANTV_TEMPLATES.filter((info) => shapeAllows(info.name, outline))
    .map((info, index) => ({ name: info.name, index, rank: rankFor(prefs, info.name) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.name);
}

/** Templates in the same family, excluding the given one. */
export function similarTemplates(name: string): string[] {
  const info = BY_NAME.get(name);
  if (!info) return [];
  return ANTV_TEMPLATES.filter((candidate) => candidate.family === info.family && candidate.name !== name).map(
    (candidate) => candidate.name,
  );
}

export { ANTV_TEMPLATES };
