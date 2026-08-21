import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
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

type KnowledgeRouteClient = ReturnType<typeof createKnowledgeRouteClient>;

/**
 * Read access for Knowledge documents, mirroring the `knowledge_documents_select`
 * policy created by 20260820_create_knowledge_data_foundation.sql:
 *
 *   board_id IN (SELECT id FROM public.boards WHERE user_id = auth.uid())
 *   OR public.is_board_member(board_id, auth.uid())
 *
 * Two deliberate non-choices:
 *
 * - NOT `requireBoardPermission` / `get_board_permission`. That RPC belongs to
 *   the legacy `canvases` permission model and selects `canvases.workspace_id`,
 *   a column the current schema does not have, so it raises 42703. Knowledge V1
 *   is board-scoped; authorizing it through the canvas model was the wrong
 *   boundary regardless of that failure.
 * - NOT `SupabaseKnowledgeBoardAuthorizer.canMutateBoard`. That intentionally
 *   requires `role = 'editor'`, which is correct for POST and wrong for GET:
 *   `is_board_member` applies no role filter, so read-only collaborators are
 *   admitted by the SELECT policy and must be admitted here too.
 *
 * `is_board_member` is called rather than reproduced so that this check and the
 * RLS policy governing the same rows resolve through one definition.
 *
 * Runs as the authenticated user (RLS applies); lookup failures throw, which the
 * list handler turns into 503. Access is never granted on error.
 */
async function canReadBoardKnowledge(
  client: KnowledgeRouteClient,
  boardId: string,
  userId: string,
): Promise<boolean> {
  const owner = await client
    .from('boards')
    .select('id')
    .eq('id', boardId)
    .eq('user_id', userId)
    .maybeSingle();

  if (owner.error) throw owner.error;
  if (owner.data) return true;

  const member = await client.rpc('is_board_member', {
    board_uuid: boardId,
    user_uuid: userId,
  });

  if (member.error) throw member.error;
  return member.data === true;
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
        return canReadBoardKnowledge(sessionClient, boardId, user.id);
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
