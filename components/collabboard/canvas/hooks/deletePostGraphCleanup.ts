import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';

/**
 * PATCH 9Q: a permanently deleted post can no longer be a Graph endpoint.
 * Deletes every persisted edge touching each given postId so no orphan
 * freeform_graph_edges row survives the post's deletion. Reuses the SAME
 * FreeformGraphRepo.deleteEdgesForPost primitive PATCH 9P introduced for the
 * root -> Container transition (see attachPostToContainer.ts's
 * cleanupGraphEdgesForContainerChild) -- this is the analogous single
 * cleanup boundary for the post-delete lifecycle, called from every real
 * (non-rollback) post-delete entry point in CanvasClient.tsx, post-type
 * agnostic. Takes an array so both single-post and bulk/cascade deletes
 * (multi-select, container-child cascade, Drawing overlay bulk delete) share
 * the exact same call shape -- no separate batch repository method needed.
 * Best-effort: a failure here is reported but never blocks or rolls back a
 * post deletion that already succeeded (no transaction exists across the two
 * tables, matching PATCH 9P's cleanupGraphEdgesForContainerChild).
 */
export async function cleanupGraphEdgesForDeletedPosts(
  boardId: string | undefined,
  postIds: readonly string[],
): Promise<void> {
  if (!boardId || postIds.length === 0) return;
  const repo = createFreeformGraphRepo(boardId);
  await Promise.all(
    postIds.map(async (postId) => {
      try {
        await repo.deleteEdgesForPost(postId);
      } catch (err) {
        console.error('Failed to clean up Graph edges for deleted post:', err);
      }
    }),
  );
}
