import { createUpdatePostMetadataBestEffortCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import type { Padlet } from '@/types/collabboard';

export interface AttachPostToContainerParams {
  padlets: Padlet[];
  containerId: string;
  postId: string;
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  fetchData: (showLoading?: boolean) => Promise<void>;
  markPadletLocallyModified?: (padletId: string) => void;
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
