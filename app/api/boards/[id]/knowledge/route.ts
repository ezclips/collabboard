import { createHash } from 'node:crypto';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import {
  NodeKnowledgeContentHasher,
  RandomKnowledgeDocumentIdFactory,
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeIngestionRepository,
  SupabaseKnowledgeStorageGateway,
} from '@/lib/infra/knowledge/knowledgeIngestionAdapters';
import { SupabaseKnowledgeTextRepository } from '@/lib/infra/knowledge/knowledgeTextIngestionAdapters';
import { SupabaseKnowledgeDocumentReadRepository } from '@/lib/infra/knowledge/knowledgeReadAdapters';
import { createKnowledgeListGetHandler } from '@/lib/server/knowledge/knowledgeListRoute';
import { createKnowledgeUploadPostHandler } from '@/lib/server/knowledge/knowledgeUploadRoute';
import { canReadBoardKnowledge } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '@/lib/server/knowledge/knowledgeBoardReadAuthorization';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';

// Read authorization is shared; its fallback is client.rpc('is_board_member', { board_uuid: boardId, user_uuid: userId }).

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
        return canReadBoardKnowledge(sessionClient as unknown as KnowledgeBoardReadAuthorizationClient, boardId, user.id);
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

  createTextIngestionDeps() {
    const adminClient = getSupabaseAdmin();
    return {
      deps: {
        // The SAME authorizer, storage gateway, hasher and id factory as the
        // PDF path. None of them varies by source kind, and a second copy of
        // the board-permission predicate is exactly the kind of drift that
        // ends with one upload path enforcing a rule the other forgot.
        authorizer: new SupabaseKnowledgeBoardAuthorizer(adminClient as never),
        repository: new SupabaseKnowledgeTextRepository(adminClient as never),
        storage: new SupabaseKnowledgeStorageGateway(adminClient as never),
        hasher: new NodeKnowledgeContentHasher(),
        ids: new RandomKnowledgeDocumentIdFactory(),
      },
      hashChunk: (text: string) => createHash('sha256').update(text, 'utf8').digest('hex'),
    };
  },
});
