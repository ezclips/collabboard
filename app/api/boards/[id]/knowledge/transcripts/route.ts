import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseKnowledgeTranscriptIndexRepository } from '@/lib/infra/knowledge/knowledgeTranscriptIndexAdapters';
import { createKnowledgeTranscriptIndexGetHandler } from '@/lib/server/knowledge/knowledgeTranscriptIndexRoute';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createTranscriptIndexRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; the auth helper needs the resolved
    // synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export const GET = createKnowledgeTranscriptIndexGetHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createTranscriptIndexRouteClient(cookieStore);
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;

    return {
      async canViewBoard(boardId) {
        // THE SAME read predicate as the document list. A second copy of the
        // board-permission rule is exactly the drift that ends with one path
        // enforcing what another forgot.
        return canReadBoardKnowledge(
          sessionClient as unknown as KnowledgeBoardReadAuthorizationClient,
          boardId,
          user.id,
        );
      },
    };
  },

  createRepository() {
    return new SupabaseKnowledgeTranscriptIndexRepository(getSupabaseAdmin() as never);
  },
});
