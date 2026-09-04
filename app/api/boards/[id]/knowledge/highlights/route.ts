import {
  createKnowledgeSourceHighlightGetHandler,
  createKnowledgeSourceHighlightPostHandler,
} from '@/lib/server/knowledge/knowledgeSourceHighlightRoute';
import { getKnowledgeHighlightSession } from '@/lib/server/knowledge/knowledgeHighlightSession';

export const runtime = 'nodejs';

/**
 * PDF-R6K-H2A. Listing and creating standalone highlights.
 *
 * The session factory lives in lib/server: a Next route module may export only
 * its handlers and route config, and both this route and the item route bind
 * the SAME factory so their authority can never diverge.
 */
export const GET = createKnowledgeSourceHighlightGetHandler({
  getAuthenticatedSession: getKnowledgeHighlightSession,
});

export const POST = createKnowledgeSourceHighlightPostHandler({
  getAuthenticatedSession: getKnowledgeHighlightSession,
});
