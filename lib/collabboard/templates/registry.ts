import type { LayoutType } from '@/types/collabboard';
import type { BoardTemplate } from '@/lib/domain/canvas/boardTemplates';
import { RESEARCH } from './freeform/research';
import { PROJECT_PLAN } from './freeform/projectPlan';
import { MOODBOARD } from './freeform/moodboard';
import { CREATIVE_BRIEF } from './freeform/creativeBrief';
import { CHARACTER_PROFILE } from './freeform/characterProfile';
import { WEEKLY_PLAN } from './freeform/weeklyPlan';
import { TRIP_PLANNER } from './freeform/tripPlanner';
import { EVENT_PLAN } from './freeform/eventPlan';
import { PRODUCT_LAUNCH } from './freeform/productLaunch';
import { BRAINSTORMING } from './columns/brainstorming';
import { FROGS_AND_TOADS } from './columns/frogsAndToads';
import { SCIENCE_VOCABULARY } from './grid/scienceVocabulary';
import { BOOK_REVIEWS } from './grid/bookReviews';
import { BIRTHDAY_WALL } from './wall/birthdayWall';
import { STUDENT_ART_GALLERY } from './wall/artGallery';
import { WORLD_VOLCANOES } from './map/worldVolcanoes';
import { TRADITIONS_AROUND_THE_WORLD } from './map/traditionsAroundTheWorld';
import { HISTORY_OF_FLIGHT } from './timeline/historyOfFlight';
import { MARIE_CURIE } from './timeline/marieCurie';

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
      RESEARCH,
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
  {
    layout: 'columns',
    label: 'Columns canvas',
    templates: [BRAINSTORMING, FROGS_AND_TOADS],
  },
  {
    layout: 'grid',
    label: 'Grid canvas',
    templates: [SCIENCE_VOCABULARY, BOOK_REVIEWS],
  },
  {
    layout: 'wall',
    label: 'Wall canvas',
    templates: [BIRTHDAY_WALL, STUDENT_ART_GALLERY],
  },
  {
    layout: 'map',
    label: 'Map canvas',
    templates: [WORLD_VOLCANOES, TRADITIONS_AROUND_THE_WORLD],
  },
  {
    layout: 'timeline',
    label: 'Timeline canvas',
    templates: [HISTORY_OF_FLIGHT, MARIE_CURIE],
  },
];

export function templatesForLayout(
  layout: LayoutType | null | undefined,
): BoardTemplateGroup | null {
  if (!layout) return null;
  return BOARD_TEMPLATE_GROUPS.find((group) => group.layout === layout) ?? null;
}
