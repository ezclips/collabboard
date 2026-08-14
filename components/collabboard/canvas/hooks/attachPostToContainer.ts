import { createUpdatePostMetadataBestEffortCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
import type { Padlet } from '@/types/collabboard';

export interface AttachPostToContainerParams {
  padlets: Padlet[];
  containerId: string;
  postId: string;
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  fetchData: (showLoading?: boolean) => Promise<void>;
  markPadletLocallyModified?: (padletId: string) => void;
  /** PATCH 9P: called after Graph edge cleanup runs, so the caller can bump
   * FreeformGraphLayer's refreshToken and refetch. Optional -- boards without
   * Freeform Graph enabled simply never wire this. */
  onGraphEdgesChanged?: () => void;
}

/**
 * PATCH 9P: a root post that becomes a Container child is no longer a valid
 * Graph endpoint -- Graph Line connects root posts only (PATCH 9N). Deletes
 * every persisted edge touching this post so no stale/fallback Line survives
 * the transition. This is the ONE place that logic lives: both
 * attachPostToContainer below (drag-and-drop, and "Group into Column" onto an
 * existing container) and CanvasClient's "Group into Column -> brand new
 * container" branch call this same function, so the rule applies identically
 * regardless of how or for which post type the post entered a Container.
 * Best-effort and post-type agnostic: a failure here is reported but never
 * rolls back the reparenting that already succeeded (no transaction exists
 * across the two tables).
 */
export async function cleanupGraphEdgesForContainerChild(
  boardId: string | undefined,
  postId: string,
): Promise<void> {
  if (!boardId) return;
  try {
    await createFreeformGraphRepo(boardId).deleteEdgesForPost(postId);
  } catch (err) {
    console.error('Failed to clean up Graph edges for post entering a Container:', err);
  }
}

/**
 * The single post -> Column/Container reparenting mutation, shared by
 * useCanvasInteractions.ts's drag-end handler and the "Group into Column"
 * menu action so both paths write the exact same childPadletIds/parentId
 * shape through the exact same persistence channel. A no-op if the post is
 * already a member of the target container (same-container safety).
 */
export async function attachPostToContainer({
  padlets,
  containerId,
  postId,
  setPadlets,
  fetchData,
  markPadletLocallyModified,
  onGraphEdgesChanged,
}: AttachPostToContainerParams): Promise<void> {
  const container = padlets.find((p) => p.id === containerId);
  const post = padlets.find((p) => p.id === postId);
  if (!container || !post) return;

  const childIds: string[] = (container.metadata as any)?.childPadletIds || [];
  if (childIds.includes(postId)) return;

  const newChildIds = [...childIds, postId];
  try {
    markPadletLocallyModified?.(containerId);
    markPadletLocallyModified?.(postId);

    const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
    const containerResult = await updatePostMetadataBestEffort(
      { postId: containerId, metadata: { ...container.metadata, childPadletIds: newChildIds } },
      { userId: null },
    );
    if (!containerResult.ok) throw containerResult.error.cause ?? containerResult.error;

    const newMetadata = { ...post.metadata, parentId: containerId };
    const draggedResult = await updatePostMetadataBestEffort(
      { postId, metadata: newMetadata },
      { userId: null },
    );
    if (!draggedResult.ok) throw draggedResult.error.cause ?? draggedResult.error;

    // Post is now officially a child -- delete every Graph edge touching it
    // before syncing local state, so the UI never has a tick where the post
    // is a child but a stale edge is still considered valid.
    await cleanupGraphEdgesForContainerChild(post.board_id, postId);
    onGraphEdgesChanged?.();

    setPadlets((prev) => prev.map((p) => {
      if (p.id === containerId) return { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } };
      if (p.id === postId) return { ...p, metadata: newMetadata };
      return p;
    }));

    fetchData();
  } catch (err) {
    console.error('Failed to add padlet to container:', err);
  }
}
