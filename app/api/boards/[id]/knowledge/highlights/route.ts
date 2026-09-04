import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  createCreateKnowledgeSourceHighlightCommand,
  createListKnowledgeSourceHighlightsQuery,
  createUpdateKnowledgeSourceHighlightColorCommand,
  createDeleteKnowledgeSourceHighlightCommand,
} from '@/lib/domain/knowledge/knowledgeSourceHighlightWrite';
import {
  SupabaseKnowledgeSourceHighlightAuthorizer,
  SupabaseKnowledgeSourceHighlightRepository,
  nodeKnowledgeHighlightQuoteHasher,
} from '@/lib/infra/knowledge/knowledgeSourceHighlightAdapters';
import type { KnowledgeSourceHighlightSupabaseClient } from '@/lib/infra/knowledge/knowledgeSourceHighlightAdapters';
import {
  createKnowledgeSourceHighlightGetHandler,
  createKnowledgeSourceHighlightPostHandler,
} from '@/lib/server/knowledge/knowledgeSourceHighlightRoute';
import type { KnowledgeSourceHighlightSession } from '@/lib/server/knowledge/knowledgeSourceHighlightRoute';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

/**
 * PDF-R6K-H2A. The session the highlight handlers are given.
 *
 * Deliberately NOT an admin client. The same authenticated authority that
 * proved the user's identity performs every lookup and every write, so
 * knowledge_source_highlights RLS still evaluates behind the explicit
 * owner/editor check rather than being bypassed by elevated credentials.
 */
export async function getKnowledgeHighlightSession(): Promise<KnowledgeSourceHighlightSession | null> {
  const cookieStore = await cookies();
  const sessionClient = createKnowledgeRouteClient(cookieStore);
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser();

  if (error || !user) return null;

  const client = sessionClient as unknown as KnowledgeSourceHighlightSupabaseClient;
  const authorizer = new SupabaseKnowledgeSourceHighlightAuthorizer(client);
  const repository = new SupabaseKnowledgeSourceHighlightRepository(client);

  return {
    userId: user.id,
    listHighlights: createListKnowledgeSourceHighlightsQuery({ authorizer, repository }),
    createHighlight: createCreateKnowledgeSourceHighlightCommand({
      authorizer,
      repository,
      hasher: nodeKnowledgeHighlightQuoteHasher,
    }),
    updateHighlightColor: createUpdateKnowledgeSourceHighlightColorCommand({
      authorizer,
      repository,
    }),
    deleteHighlight: createDeleteKnowledgeSourceHighlightCommand({ authorizer, repository }),
  };
}

export const GET = createKnowledgeSourceHighlightGetHandler({
  getAuthenticatedSession: getKnowledgeHighlightSession,
});

export const POST = createKnowledgeSourceHighlightPostHandler({
  getAuthenticatedSession: getKnowledgeHighlightSession,
});
