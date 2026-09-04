import {
  createKnowledgeSourceHighlightDeleteHandler,
  createKnowledgeSourceHighlightPatchHandler,
} from '@/lib/server/knowledge/knowledgeSourceHighlightRoute';
import { getKnowledgeHighlightSession } from '@/lib/server/knowledge/knowledgeHighlightSession';

export const runtime = 'nodejs';

/**
 * PDF-R6K-H2A. One highlight: recolour it, or delete it.
 *
 * The session factory is shared with the collection route rather than rebuilt,
 * so both paths bind the SAME commands under the same authenticated authority.
 * It lives in lib/server because a route module may export only handlers.
 * DELETE removes one highlight row; the bound command has no citation, padlet
 * or Note write available to it, so a Note, its source_reference, "Used in
 * Notes" and the Library backlink all survive by construction.
 */
export const PATCH = createKnowledgeSourceHighlightPatchHandler({
  getAuthenticatedSession: getKnowledgeHighlightSession,
});

export const DELETE = createKnowledgeSourceHighlightDeleteHandler({
  getAuthenticatedSession: getKnowledgeHighlightSession,
});
