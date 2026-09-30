/**
 * PATCH-228 -- decides what a dropped line-end should do.
 *
 * Pure so the re-attach policy is unit-tested rather than inferred from the
 * pointer handler. The edge's OWN id is ignored in the duplicate check: moving
 * an end onto the post the other end already points at is the only "same"
 * case, and that is a noop, not a duplicate.
 */
import type { FreeformGraphEdge } from '@/types/graphTypes';

export type EdgeEnd = 'source' | 'target';

export type ReattachPlan =
  | { kind: 'noop' }
  | { kind: 'duplicate' }
  | { kind: 'update'; patch: Partial<FreeformGraphEdge> };

export function planReattach(
  edge: FreeformGraphEdge,
  end: EdgeEnd,
  newPostId: string,
  allEdges: FreeformGraphEdge[],
): ReattachPlan {
  const currentId = end === 'source' ? edge.source_post_id : edge.target_post_id;
  if (newPostId === currentId) return { kind: 'noop' };

  const otherId = end === 'source' ? edge.target_post_id : edge.source_post_id;
  const duplicate = allEdges.some(
    (e) =>
      e.id !== edge.id &&
      ((e.source_post_id === newPostId && e.target_post_id === otherId) ||
        (e.source_post_id === otherId && e.target_post_id === newPostId)),
  );
  if (duplicate) return { kind: 'duplicate' };

  return {
    kind: 'update',
    patch: end === 'source' ? { source_post_id: newPostId } : { target_post_id: newPostId },
  };
}
