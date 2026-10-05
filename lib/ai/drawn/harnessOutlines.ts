/**
 * PATCH-283 I. The fixed outlines the dev harness draws: one per DrawnKind, no
 * outline AI call, so runs are comparable.
 */

import type { VisualOutline } from '@/lib/ai/outline';

import type { DrawnKind } from './prompt';

const VALUES = [24, 40, 26, 10, 12];
const CHART_LABELS = ['Venue', 'Catering', 'Travel', 'Printing', 'Contingency'];

const valuedOutline = (kind: VisualOutline['kind']): VisualOutline => ({
  title: 'Budget split',
  ordered: false,
  kind,
  items: VALUES.map((value, index) => ({ label: CHART_LABELS[index], value })),
});

export const HARNESS_DRAWN_OUTLINES: Record<DrawnKind, VisualOutline> = {
  pie: valuedOutline('parts'),
  bar: valuedOutline('parts'),
  timeline: {
    title: 'Launch timeline',
    ordered: true,
    kind: 'timeline',
    items: [
      { label: 'Research', date: 'Jan', detail: 'Interviews and surveys' },
      { label: 'Prototype', date: 'Mar', detail: 'First clickable build' },
      { label: 'Beta', date: 'Jun', detail: 'Closed beta with ten teams' },
      { label: 'Launch', date: 'Sep', detail: 'Public release' },
    ],
  },
  flowchart: {
    title: 'Publishing flow',
    ordered: true,
    kind: 'steps',
    items: [
      { label: 'Draft' },
      { label: 'Review' },
      { label: 'Revise' },
      { label: 'Approve' },
      { label: 'Publish' },
    ],
  },
  mindmap: {
    title: 'Marketing plan',
    ordered: false,
    kind: 'levels',
    items: [
      { label: 'Product', children: [{ label: 'Roadmap' }, { label: 'Pricing' }] },
      { label: 'Brand', children: [{ label: 'Voice' }, { label: 'Visuals' }] },
      { label: 'Channels', children: [{ label: 'Social' }, { label: 'Email' }] },
      { label: 'Metrics', children: [{ label: 'Reach' }, { label: 'Signups' }] },
    ],
  },
  comparison: {
    title: 'Plan A vs Plan B',
    ordered: false,
    kind: 'comparison',
    items: [
      { label: 'Plan A', detail: 'Cheaper but slower to ship' },
      { label: 'Plan B', detail: 'Faster but costs more up-front' },
    ],
  },
};

export const HARNESS_DRAWN_KINDS: readonly DrawnKind[] = ['flowchart', 'mindmap', 'pie', 'bar', 'timeline', 'comparison'];
export const HARNESS_DRAWN_SEEDS: readonly number[] = [0, 1, 2];
