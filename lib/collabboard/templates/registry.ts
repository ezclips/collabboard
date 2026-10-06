import type { LayoutType } from '@/types/collabboard';
import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import { PROJECT_PLAN } from './freeform/projectPlan';
import { MOODBOARD } from './freeform/moodboard';
import { CREATIVE_BRIEF } from './freeform/creativeBrief';
import { CHARACTER_PROFILE } from './freeform/characterProfile';
import { WEEKLY_PLAN } from './freeform/weeklyPlan';
import { TRIP_PLANNER } from './freeform/tripPlanner';
import { EVENT_PLAN } from './freeform/eventPlan';
import { PRODUCT_LAUNCH } from './freeform/productLaunch';

/**
 * PATCH-293/294. The board-template registry. One group per layout; later
 * layouts add a group and nothing else changes. The picker asks
 * `templatesForLayout` and renders nothing when the answer is null.
 */
export interface BoardTemplateGroup {
  readonly layout: LayoutType;
  readonly label: string;
  readonly templates: readonly BoardTemplate[];
}

export const BOARD_TEMPLATE_GROUPS: readonly BoardTemplateGroup[] = [
  {
    layout: 'freeform',
    label: 'Freeform canvas',
    templates: [
      PROJECT_PLAN,
      MOODBOARD,
      CREATIVE_BRIEF,
      CHARACTER_PROFILE,
      WEEKLY_PLAN,
      TRIP_PLANNER,
      EVENT_PLAN,
      PRODUCT_LAUNCH,
    ],
  },
];

export function templatesForLayout(
  layout: LayoutType | null | undefined,
): BoardTemplateGroup | null {
  if (!layout) return null;
  return BOARD_TEMPLATE_GROUPS.find((group) => group.layout === layout) ?? null;
}
