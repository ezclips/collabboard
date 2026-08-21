import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { requireBoardPermission } from '@/lib/auth/permissions';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeDocumentReadRepository } from '@/lib/infra/knowledge/knowledgeReadAdapters';
import { createKnowledgeListGetHandler } from '@/lib/server/knowledge/knowledgeListRoute';
import { createKnowledgeUploadPostHandler } from '@/lib/server/knowledge/knowledgeUploadRoute';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export const GET = createKnowledgeListGetHandler({
  async getAuthenticatedSession() {
    const cookieStore = await cookies();
    const sessionClient = createKnowledgeRouteClient(cookieStore);
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;

    return {
      async canViewBoard(boardId) {
        const access = await requireBoardPermission(sessionClient, boardId, user.id, 'reader');
        return access.allowed;
      },
    };
  },

  createRepository() {
    const adminClient = getSupabaseAdmin();
    return new SupabaseKnowledgeDocumentReadRepository(adminClient as never);
  },
});

export const POST = createKnowledgeUploadPostHandler({
  async getAuthenticatedUserId() {
    const cookieStore = await cookies();
    const sessionClient = createKnowledgeRouteClient(cookieStore);
    const {
      data: { user },
      error,
    } = await sessionClient.auth.getUser();

    if (error || !user) return null;
    return user.id;
  },

  createIngestionDeps() {
    const adminClient = getSupabaseAdmin();
    return {
      authorizer: new SupabaseKnowledgeBoardAuthorizer(adminClient as never),
      repository: new SupabaseKnowledgeIngestionRepository(adminClient as never),
      storage: new SupabaseKnowledgeStorageGateway(adminClient as never),
      hasher: new NodeKnowledgeContentHasher(),
      ids: new RandomKnowledgeDocumentIdFactory(),
    };
  },
});
