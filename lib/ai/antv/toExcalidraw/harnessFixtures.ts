/**
 * PATCH-277. The fixed inputs for the developer harness: one sample outline and
 * the list of real design names (from `catalog.data.ts`) to render against it.
 * No AI, no database -- the same outline everywhere, so designs are comparable.
 */

import type { VisualOutline } from '@/lib/ai/outline';
import type { VisualThemeId } from '@/lib/ai/visualThemes';

/** A 5-item outline with detail, value, icon, date and children on two items. */
export const HARNESS_OUTLINE: VisualOutline = {
  title: 'Seasonal plan',
  ordered: true,
  kind: 'list',
  items: [
    {
      label: 'Spring',
      detail: 'Planting and first blooms',
      value: 24,
      icon: 'sprout',
      date: 'Mar–May',
      children: [{ label: 'Greenhouse' }, { label: 'Seedbeds' }],
    },
    {
      label: 'Summer',
      detail: 'Peak growth and long days',
      value: 40,
      icon: 'sun',
      date: 'Jun–Aug',
    },
    {
      label: 'Autumn',
      detail: 'Harvest and colour',
      value: 26,
      icon: 'leaf',
      date: 'Sep–Nov',
      children: [{ label: 'Orchard' }, { label: 'Cellar' }],
    },
    {
      label: 'Winter',
      detail: 'Rest and planning',
      value: 10,
      icon: 'snowflake',
      date: 'Dec–Feb',
    },
    { label: 'Every season', detail: 'Steady care', value: 12, icon: 'heart', date: 'All year' },
  ],
};

/** One design per family, using real template ids from the catalogue. */
export const HARNESS_TEMPLATES: readonly string[] = [
  'list-grid-badge-card',
  'list-row-horizontal-icon-arrow',
  'sequence-timeline-simple',
  'sequence-roadmap-vertical-simple',
  'sequence-steps-simple',
  'sequence-funnel-simple',
  'sequence-pyramid-simple',
  'hierarchy-structure',
  'compare-binary-horizontal-simple-vs',
  'compare-swot',
  'compare-quadrant-simple-illus',
  'hierarchy-mindmap-branch-gradient-capsule-item',
  'chart-pie-donut-pill-badge',
  'chart-column-simple',
  'chart-line-plain-text',
];

/** Dark-background designs, shown on `midnight` as well as `classic`. */
export const HARNESS_DARK_TEMPLATES: readonly string[] = [
  'list-grid-badge-card',
  'hierarchy-mindmap-branch-gradient-capsule-item',
  'chart-pie-donut-pill-badge',
];

export interface HarnessRow {
  template: string;
  theme: VisualThemeId;
}

/** Every row: `classic` for all, plus `midnight` for the dark-background set. */
export function harnessRows(): HarnessRow[] {
  const rows: HarnessRow[] = HARNESS_TEMPLATES.map((template) => ({ template, theme: 'classic' }));
  for (const template of HARNESS_DARK_TEMPLATES) {
    rows.push({ template, theme: 'midnight' });
  }
  return rows;
}

/** Resolve `?t=&theme=&pill=` into the rows to show. */
export function selectedRows(
  template?: string | null,
  theme?: string | null,
): HarnessRow[] {
  if (template) {
    const dark = HARNESS_DARK_TEMPLATES.includes(template);
    const resolvedTheme = (theme as VisualThemeId | null) ?? (dark ? 'midnight' : 'classic');
    return [{ template, theme: resolvedTheme }];
  }
  return harnessRows();
}
