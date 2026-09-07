import { isKnowledgeBacklinkNote, type KnowledgeBacklinkPost } from './knowledgeSourceBacklinks';

export const SOURCE_NOTE_PLACEMENT_MIME = 'application/collabboard-source-note-placement';

export function serializeKnowledgeSourceNotePlacementDrag(targetPadletId: string): string {
  return JSON.stringify({ targetPadletId });
}

export function parseKnowledgeSourceNotePlacementDrag(raw: string): { targetPadletId: string } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const id = (value as Record<string, unknown>).targetPadletId;
    if (typeof id !== 'string' || !id.trim()) return null;
    return { targetPadletId: id };
  } catch {
    return null;
  }
}

interface PlacementPost extends KnowledgeBacklinkPost {
  readonly metadata?: { readonly isLocked?: unknown; readonly parentId?: unknown; readonly childPadletIds?: unknown } | null;
}

/** V1 never extracts children, including legacy membership held only by the owner. */
export function canPlaceKnowledgeSourceNote(
  target: PlacementPost,
  posts: readonly PlacementPost[],
): boolean {
  return isKnowledgeBacklinkNote(target)
    && !target.metadata?.isLocked
    && !target.metadata?.parentId
    && !posts.some((post) => post.type === 'container'
      && Array.isArray(post.metadata?.childPadletIds)
      && post.metadata.childPadletIds.includes(target.id));
}
