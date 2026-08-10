/**
 * Pure z-index ordering helpers for the canvas.
 * No React, no state, no Supabase, no DOM.
 */

import type { Padlet } from '@/types/collabboard';

export interface ZIndexUpdate {
  id: string;
  metadata: Record<string, unknown>;
}

/**
 * Pure sorting/reindexing logic extracted from `normalizeZIndexes` useCallback
 * in CanvasClient. Accepts the padlets array as a param and returns the list of
 * id+metadata updates. The useCallback wrapper in CanvasClient calls this
 * function and then applies local state + Supabase persistence.
 */
/**
 * The z-index a newly created padlet should get: one above whatever is
 * currently highest, in the same normalized range every other padlet's
 * z-index lives in (see computeNormalizedZIndexes/movePadletLayer). A
 * wall-clock value like Date.now() looks like the same idea ("newer sorts
 * higher") but permanently outranks this whole range by orders of
 * magnitude, so anything using it never loses a stacking fight again --
 * even against padlets created years later.
 */
export function nextZIndex(padlets: Padlet[]): number {
  const zValues = padlets.map((p) => (p.metadata as any)?.zIndex || 100);
  return (zValues.length > 0 ? Math.max(...zValues) : 100) + 1;
}

export function computeNormalizedZIndexes(padlets: Padlet[]): ZIndexUpdate[] {
  const sorted = [...padlets].sort((a, b) => {
    const zA = (a.metadata as any)?.zIndex || 100;
    const zB = (b.metadata as any)?.zIndex || 100;
    return zA - zB;
  });

  return sorted.map((padlet, index) => ({
    id: padlet.id,
    metadata: { ...padlet.metadata, zIndex: 10 + index * 10 },
  }));
}
