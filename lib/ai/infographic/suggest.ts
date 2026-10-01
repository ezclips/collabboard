import type { DiagramData, InfographicDiagramData, InfographicTemplate } from '@/lib/ai/contracts';
import type { OutlineKind, VisualOutline } from '@/lib/ai/outline';
import { outlineToVisuals } from '@/lib/ai/outlineToVisuals';
import { ALL_TEMPLATES, TEMPLATE_LABELS, TEMPLATE_RANGE } from './index';

/**
 * PATCH-236. Which designs fit a given outline, best first. Built from the four
 * existing options (outlineToVisuals, unchanged) plus every infographic
 * template whose item count fits. Pure.
 */

export interface DesignSuggestion {
  key: string;
  label: string;
  category: string;
  fit: number;
  envelopeData: DiagramData;
}

const TEMPLATE_CATEGORY: Record<InfographicTemplate, string> = {
  stack: 'Hierarchy',
  pyramid: 'Hierarchy',
  stairs: 'Process',
  cycle: 'Cycle',
  funnel: 'Process',
  hub: 'Mindmap',
};

// Lower number = better fit. Per-kind preferred keys, in order.
const PREFERRED: Record<OutlineKind, string[]> = {
  levels: ['infographic:pyramid', 'infographic:stack', 'infographic:funnel'],
  steps: ['infographic:stairs', 'flow', 'infographic:funnel'],
  cycle: ['infographic:cycle'],
  parts: ['infographic:hub', 'mindmap'],
  comparison: ['comparison'],
  timeline: ['timeline', 'infographic:stairs'],
  cause_effect: ['flow', 'infographic:stairs'],
  list: ['mindmap', 'infographic:hub', 'infographic:stack'],
};

function fitRank(preferred: string[], key: string, fallback: number): number {
  const index = preferred.indexOf(key);
  return index === -1 ? fallback : index;
}

/**
 * PATCH-237. Maps a "make it a <hint>" phrase to a design key. Whole-word,
 * case-insensitive; returns the matching suggestion key or null.
 */
export function preferKeyFromHint(hint: string): string | null {
  const text = hint.toLowerCase();
  const aliases: Array<[string[], string]> = [
    [['pyramid'], 'infographic:pyramid'],
    [['stack', 'layers'], 'infographic:stack'],
    [['stairs', 'steps'], 'infographic:stairs'],
    [['cycle'], 'infographic:cycle'],
    [['funnel'], 'infographic:funnel'],
    [['hub'], 'infographic:hub'],
    [['mind map', 'mindmap'], 'mindmap'],
    [['flow', 'flowchart'], 'flow'],
    [['timeline'], 'timeline'],
    [['comparison'], 'comparison'],
  ];
  for (const [words, key] of aliases) {
    for (const word of words) {
      const re = new RegExp(`(^|[^a-z])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
      if (re.test(text)) return key;
    }
  }
  return null;
}

export function suggestDesigns(outline: VisualOutline, options?: { preferKey?: string }): DesignSuggestion[] {
  const count = outline.items.length;
  const preferred = PREFERRED[outline.kind] ?? PREFERRED.list;
  // A user-named design ranks first (fit 0) when it is actually offered.
  const hintedKey = options?.preferKey ? preferKeyFromHint(options.preferKey) : null;

  const suggestions: DesignSuggestion[] = [];

  // The four existing options first (keys + categories pinned here so the
  // Suggestions panel can group them alongside the infographics).
  const BASE_CATEGORY: Record<string, string> = {
    mindmap: 'Mindmap',
    comparison: 'Comparison',
    flow: 'Process',
    timeline: 'Timelines',
  };
  for (const option of outlineToVisuals(outline)) {
    suggestions.push({
      key: option.key,
      label: option.label,
      category: BASE_CATEGORY[option.key] ?? 'Other',
      fit: fitRank(preferred, option.key, 50),
      envelopeData: option.envelopeData,
    });
  }

  for (const template of ALL_TEMPLATES) {
    const range = TEMPLATE_RANGE[template];
    if (count < range.min || count > range.max) continue;
    const envelopeData: InfographicDiagramData = {
      type: 'diagram',
      subtype: 'infographic',
      renderer: 'infographic',
      title: outline.title,
      template,
      outline,
    };
    suggestions.push({
      key: `infographic:${template}`,
      label: TEMPLATE_LABELS[template],
      category: TEMPLATE_CATEGORY[template],
      fit: hintedKey === `infographic:${template}` ? 0 : fitRank(preferred, `infographic:${template}`, 50),
      envelopeData,
    });
  }

  // Stable sort by fit, with a user-hinted design ranked first.
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((a, b) => {
      const aHint = hintedKey && a.suggestion.key === hintedKey ? 0 : 1;
      const bHint = hintedKey && b.suggestion.key === hintedKey ? 0 : 1;
      return (aHint - bHint) || (a.suggestion.fit - b.suggestion.fit) || (a.index - b.index);
    })
    .map((entry) => entry.suggestion);
}
