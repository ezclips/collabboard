import { createKnowledgeDocumentDeleteHandler } from '@/lib/server/knowledge/knowledgeDocumentDeleteRoute';
import { getKnowledgeDocumentDeleteSession } from '@/lib/server/knowledge/knowledgeDocumentDeleteSession';

export const runtime = 'nodejs';

/**
 * One Knowledge document: delete it.
 *
 * The first per-document write path this resource has ever had. Everything
 * under this segment until now was a read (`original`, `pages`,
 * `render-pages`), and the only way to remove one PDF was to delete the board
 * it lived on -- followups item 15.
 *
 * DELETE removes the document row and its Storage objects. The bound command
 * has no `board_ai_messages` write available to it, so an answer that cited
 * this document keeps its citations and its provenance signature; the reader
 * and Save-as-Note carry the gone state instead.
 */
export const DELETE = createKnowledgeDocumentDeleteHandler({
  getAuthenticatedSession: getKnowledgeDocumentDeleteSession,
});
