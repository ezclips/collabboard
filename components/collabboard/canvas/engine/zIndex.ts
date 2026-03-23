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
