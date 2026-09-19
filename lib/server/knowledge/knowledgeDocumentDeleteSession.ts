import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { asKnowledgeDocumentId, asUserId } from '../../domain/core/ids';
import { domainError } from '../../domain/core/errors';
import { err } from '../../domain/core/result';
import { deleteKnowledgeDocument } from '../../domain/knowledge/knowledgeDeletion';
import {
  SupabaseKnowledgeDeletionRepository,
} from '../../infra/knowledge/knowledgeDeletionAdapters';
import {
  SupabaseKnowledgeBoardAuthorizer,
  SupabaseKnowledgeStorageGateway,
} from '../../infra/knowledge/knowledgeIngestionAdapters';
import { getSupabaseAdmin } from '../../supabase/admin';
import type { KnowledgeDocumentDeleteSession } from './knowledgeDocumentDeleteRoute';

/**
 * The authenticated session the delete handler is given.
 *
 * Lives here rather than in the route file because a Next route module may
 * export only its handlers and route config -- the same reason
 * `knowledgeHighlightSession` lives beside its route rather than inside it.
 *
 * THE AUTHORITY SPLIT, which differs from the highlight session and is
 * deliberate. Identity is proved by the user's OWN authenticated client, and
 * the board permission is then checked explicitly through
 * `SupabaseKnowledgeBoardAuthorizer` (owner, or a collaborator whose role is
 * exactly 'editor'). The row and Storage work runs on the admin client, as
 * board deletion already does -- removing Storage objects is not an operation
 * a user's own client can perform, and the cascade must not be half-applied
 * because a policy hid one child row from the caller.
 */
type ResolvedNextCookieStore = Awaited<ReturnType<typeof cookies>>;

function createKnowledgeRouteClient(cookieStore: ResolvedNextCookieStore) {
  return createRouteHandlerClient({
    // Next 15 cookies() is awaited first; auth-helper runtime requires the resolved synchronous store.
    cookies: () => cookieStore as unknown as ReturnType<typeof cookies>,
  });
}

export async function getKnowledgeDocumentDeleteSession(): Promise<KnowledgeDocumentDeleteSession | null> {
  const cookieStore = await cookies();
  const sessionClient = createKnowledgeRouteClient(cookieStore);
  const {
    data: { user },
    error,
  } = await sessionClient.auth.getUser();

  if (error || !user) return null;

  return {
    userId: user.id,
    async deleteDocument({ boardId, documentId, userId }) {
      const adminClient = getSupabaseAdmin();

      // THE DOCUMENT MUST BELONG TO THE BOARD IN THE PATH.
      //
      // `deleteKnowledgeDocument` authorizes against the document's OWN board,
      // which is what makes it safe -- but without this check the URL's board
      // would be decoration, and an editor of board A could delete a document
      // of board B by addressing it through A. Nothing would be granted that
      // the authorizer does not already allow, and the request would still be
      // a lie about what it was doing. A mismatch is not_found rather than
      // forbidden: the document does not exist AT THIS ADDRESS, and saying
      // "forbidden" would confirm the id exists somewhere else.
      const { data, error: lookupError } = await adminClient
        .from('knowledge_documents')
        .select('id, board_id')
        .eq('id', documentId)
        .maybeSingle();

      if (lookupError) {
        return err(domainError('unavailable', 'Could not load the Knowledge document', {
          cause: lookupError,
        }));
      }
      if (!data || String((data as { board_id?: unknown }).board_id) !== boardId) {
        return err(domainError('not_found', 'Knowledge document was not found'));
      }

      return deleteKnowledgeDocument(
        {
          authorizer: new SupabaseKnowledgeBoardAuthorizer(adminClient as never),
          repository: new SupabaseKnowledgeDeletionRepository(adminClient as never),
          storage: new SupabaseKnowledgeStorageGateway(adminClient as never),
        },
        {
          documentId: asKnowledgeDocumentId(documentId),
          userId: asUserId(userId),
        },
      );
    },
  };
}
