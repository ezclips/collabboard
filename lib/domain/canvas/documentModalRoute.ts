import type { Padlet } from '@/types/collabboard';
import { isDocumentPost } from './documentPost';
import { selectCardModalRoute } from './cardModalRoute';

export type DocumentModalDestination = 'document-editor' | 'document-viewer';

// PATCH-149B1b-ii §25.3: pure, computed fresh on every call -- a card can be
// promoted to clipart at runtime (PATCH-149 §26.2 C9), so the destination
// must never be cached against a stale post snapshot.
export function selectDocumentModalDestination(
  post: Pick<Padlet, 'type' | 'metadata'> | null | undefined,
  canEditWorkspace: boolean,
): DocumentModalDestination | null {
  if (!post || !isDocumentPost(post)) return null;
  return selectCardModalRoute(canEditWorkspace) === 'editor' ? 'document-editor' : 'document-viewer';
}
