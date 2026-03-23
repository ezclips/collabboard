/**
 * Pure graph/edge helpers for the canvas.
 * No React, no state, no Supabase, no DOM.
 */

import type { GraphSide } from '@/lib/graph/edgeRouting';

export function isGraphSide(value: unknown): value is GraphSide {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom';
}
