import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  createCreateKnowledgeSourceHighlightCommand,
  createDeleteKnowledgeSourceHighlightCommand,
  createListKnowledgeSourceHighlightsQuery,
  createUpdateKnowledgeSourceHighlightColorCommand,
} from '../../domain/knowledge/knowledgeSourceHighlightWrite';
import {
  SupabaseKnowledgeSourceHighlightAuthorizer,
  SupabaseKnowledgeSourceHighlightRepository,
  nodeKnowledgeHighlightQuoteHasher,
} from '../../infra/knowledge/knowledgeSourceHighlightAdapters';
import type { KnowledgeSourceHighlightSupabaseClient }
  from '../../infra/knowledge/knowledgeSourceHighlightAdapters';
import type { KnowledgeSourceHighlightSession } from './knowledgeSourceHighlightRoute';

/**
 * PDF-R6K-H2A/H2B -- the authenticated session the highlight handlers are given.
 *
 * Lives here rather than in the route file because a Next route module may
 * export only its handlers and route config; anything else fails the generated
 * route type check. Both the collection and the item route bind THIS factory,
 * so the two paths can never diverge in the authority they run under.
 *
 * Deliberately NOT an admin client. The same authenticated authority that
 * proved the user's identity performs every lookup and every write, so
 * knowledge_source_highlights RLS and the H2A-C1 column grants still evaluate
 * behind the explicit owner/editor check rather than being bypassed.
 */
type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

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
