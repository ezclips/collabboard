import type { InfographicTemplate } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';
import { fitLayout, type InfographicLayout } from './shared';
import { layoutStack } from './stack';
import { layoutPyramid } from './pyramid';
import { layoutStairs } from './stairs';
import { layoutCycle } from './cycle';
import { layoutFunnel } from './funnel';
import { layoutHub } from './hub';

export type { InfographicLayout, InfographicShape, InfographicText, InfographicIcon } from './shared';

const LAYOUTS: Record<InfographicTemplate, (outline: VisualOutline) => InfographicLayout> = {
  stack: layoutStack,
  pyramid: layoutPyramid,
  stairs: layoutStairs,
  cycle: layoutCycle,
  funnel: layoutFunnel,
  hub: layoutHub,
};

export function layoutInfographic(template: InfographicTemplate, outline: VisualOutline): InfographicLayout {
  // PATCH-236 Addendum 4: shift every design so all anchor-aware text boxes fit.
  return fitLayout(LAYOUTS[template](outline));
}

/** The item-count range each template can hold. */
export const TEMPLATE_RANGE: Record<InfographicTemplate, { min: number; max: number }> = {
  stack: { min: 2, max: 8 },
  pyramid: { min: 3, max: 7 },
  stairs: { min: 3, max: 7 },
  cycle: { min: 3, max: 8 },
  funnel: { min: 3, max: 6 },
  hub: { min: 3, max: 8 },
};

export const TEMPLATE_LABELS: Record<InfographicTemplate, string> = {
  stack: 'Layered stack',
  pyramid: 'Pyramid',
  stairs: 'Stairs',
  cycle: 'Cycle',
  funnel: 'Funnel',
  hub: 'Hub',
};

export const ALL_TEMPLATES: InfographicTemplate[] = ['stack', 'pyramid', 'stairs', 'cycle', 'funnel', 'hub'];
