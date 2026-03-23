/**
 * Pure hit-test helpers for the canvas.
 * No React, no state, no Supabase, no DOM.
 */

import type { GraphSide } from '@/lib/graph/edgeRouting';

/**
 * Given an element's bounding-rect dimensions and a local click position,
 * returns the closest side of the rect.
 *
 * Pure logic extracted from `getClickedSide` useCallback in CanvasClient.
 * The useCallback wrapper in CanvasClient calls this function and passes
 * the values from `event.currentTarget.getBoundingClientRect()`.
 */
export function computeClickedSide(
  rect: { width: number; height: number },
  x: number,
  y: number
): GraphSide {
  const band = Math.max(16, Math.min(rect.width, rect.height) * 0.18);

  const nearLeft = x <= band;
  const nearRight = x >= rect.width - band;
  const nearTop = y <= band;
  const nearBottom = y >= rect.height - band;

  if (nearLeft && !nearTop && !nearBottom) return 'left';
  if (nearRight && !nearTop && !nearBottom) return 'right';
  if (nearTop && !nearLeft && !nearRight) return 'top';
  if (nearBottom && !nearLeft && !nearRight) return 'bottom';

  const distances: Array<{ side: GraphSide; value: number }> = [
    { side: 'left', value: x },
    { side: 'right', value: rect.width - x },
    { side: 'top', value: y },
    { side: 'bottom', value: rect.height - y },
  ];
  distances.sort((a, b) => a.value - b.value);
  return distances[0].side;
}
