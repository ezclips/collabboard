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

/**
 * Freeform root posts render in an outer wrapper whose zIndex is the sole
 * sibling-stacking-context authority for that post (see FreeformPadletCards.tsx).
 * Dragging already elevates that wrapper to Number.MAX_SAFE_INTEGER so the
 * dragged post always wins. Selection previously did nothing at this level --
 * only inner, type-local z-index bumps (e.g. an Image's selected content/grip)
 * existed, and those can never outrank a DIFFERENT overlapping post's own
 * outer wrapper, which is why a selected post's resize grip could lose
 * pointer hit-testing to an overlapping unselected neighbor.
 *
 * FREEFORM_SELECTED_INTERACTION_Z_INDEX gives a selected-but-not-dragging
 * post the same kind of outer-wrapper elevation, one tier below dragging.
 * It is deliberately kept below FreeformGraphLayer's EDGE_DEFAULT_Z (999999)
 * so a merely-selected post does not change the established "lines render
 * above ordinary posts by default" Graph semantic -- only dragging (which
 * already exceeds it) does that. It comfortably exceeds the realistic
 * persisted post zIndex ceiling (posts self-normalize back under 9000 once
 * bringToFront pushes them past it, see movePadletLayer/computeNormalizedZIndexes).
 */
export const FREEFORM_DRAGGING_Z_INDEX = Number.MAX_SAFE_INTEGER;
export const FREEFORM_SELECTED_INTERACTION_Z_INDEX = 500_000;

export interface FreeformPostRenderZIndexInput {
  persistedZIndex: number;
  isSelected: boolean;
  isDragging: boolean;
}

/**
 * Render-only precedence for a Freeform root post's outer stacking-context
 * wrapper. Never mutates or reads padlet.metadata.zIndex itself -- callers
 * pass the already-resolved persisted value through unchanged when neither
 * selected nor dragging, so persisted board z-order (Bring to Front/Send to
 * Back) is untouched by selection.
 */
export function resolveFreeformPostRenderZIndex({
  persistedZIndex,
  isSelected,
  isDragging,
}: FreeformPostRenderZIndexInput): number {
  if (isDragging) return FREEFORM_DRAGGING_Z_INDEX;
  if (isSelected) return FREEFORM_SELECTED_INTERACTION_Z_INDEX;
  return persistedZIndex;
}
