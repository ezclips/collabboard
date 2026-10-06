/**
 * PATCH-287. The chart data that travels with a drawing-library chart. Every
 * element of a chart item carries a copy in `customData.antvChart`, so the
 * editor can offer "Edit values" long after the conversion that drew it. The
 * shape is validated on the way in (never trust JSONB / a library file / a
 * loaded scene) and on the way out.
 */

import { z } from 'zod';

import type { VisualOutline } from '@/lib/ai/outline';

/** The 9 chart templates the values panel supports. */
export const ANTV_CHART_TEMPLATES = [
  'chart-pie-donut-pill-badge',
  'chart-pie-compact-card',
  'chart-pie-donut-plain-text',
  'chart-pie-pill-badge',
  'chart-pie-donut-compact-card',
  'chart-pie-plain-text',
  'chart-column-simple',
  'chart-bar-plain-text',
  'chart-line-plain-text',
] as const;

export type AntvChartTemplate = (typeof ANTV_CHART_TEMPLATES)[number];

/** True only for one of the 9 supported chart template ids. */
export function isAntvChartTemplate(id: unknown): id is AntvChartTemplate {
  return typeof id === 'string' && (ANTV_CHART_TEMPLATES as readonly string[]).includes(id);
}

/** True for a pie template, whose rows show their share of the total. */
export function isAntvPieTemplate(id: string): boolean {
  return id.startsWith('chart-pie-');
}

const iconPattern = /^[a-z0-9-]{1,40}$/;

const itemSchema = z.object({
  label: z.string().trim().min(1).max(60),
  value: z.number().finite().min(0).max(1e9),
  detail: z.string().trim().max(120).optional(),
  icon: z.string().regex(iconPattern).optional(),
});

export const antvChartDataSchema = z.object({
  v: z.literal(1),
  template: z.enum(ANTV_CHART_TEMPLATES),
  theme: z.string().min(1).max(40),
  title: z.string().trim().max(80),
  items: z.array(itemSchema).min(1).max(10),
  // PATCH-289. Optional so every chart drawn before this patch still parses.
  transparentBackground: z.boolean().optional(),
});

export type AntvChartData = z.infer<typeof antvChartDataSchema>;
export type AntvChartItem = AntvChartData['items'][number];

/**
 * Parse unknown data into `AntvChartData`, or `null`. Never throws: a loaded
 * scene or a library file may hold anything.
 */
export function parseAntvChartData(raw: unknown): AntvChartData | null {
  try {
    const parsed = antvChartDataSchema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The chart data as the outline the renderer draws (`list`, ordered, values). */
export function chartDataToOutline(data: AntvChartData): VisualOutline {
  return {
    title: data.title,
    ordered: true,
    kind: 'list',
    items: data.items.map((item) => ({
      label: item.label,
      ...(item.detail ? { detail: item.detail } : {}),
      ...(item.icon ? { icon: item.icon } : {}),
      value: item.value,
    })),
  };
}
