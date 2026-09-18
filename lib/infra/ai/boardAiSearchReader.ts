// The two board-scoped text searches. SERVER ONLY.
//
// The second privileged read on the Board AI chat path, and deliberately the
// same narrow shape as the first (boardAiContextImageReader): it takes a board
// id, a tsquery expression and a limit, and returns rows. It has no user id, no
// session and no authorization logic, so it cannot answer -- or be tricked into
// answering -- any question about who may read what.
//
// WHY PRIVILEGED. `search_board_posts_text` and
// `search_board_knowledge_chunks_text` are granted to service_role only,
// mirroring the existing vector RPC. Granting them to `authenticated` would make
// them callable by any browser session with any board id, leaving the board
// filter inside the function as the only boundary. Keeping EXECUTE here means
// the board id was proved readable by `canReadBoardKnowledge` -- with the
// CALLER'S own client -- before this module was reached. searchBoardAiContext
// enforces that order and a test pins it.
//
// WHY IT IS NOT IN THE ROUTE. `app/api/boards/[id]/ai/chat/route.ts` carries a
// standing guard, asserted from three separate tests, that it contains no admin
// client at all. That guard is correct and stays untouched.
//
// THE FUNCTIONS ARE SECURITY INVOKER, which is worth stating because it looks
// like a contradiction next to a service_role call. It is not: INVOKER means the
// function does not escalate on its own, and the escalation here is explicit,
// auditable and confined to this file. A SECURITY DEFINER search taking a board
// id would be the dangerous shape.

import { getSupabaseAdmin } from '../../supabase/admin';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import type {
  BoardAiSearchChunkRow,
  BoardAiSearchPostRow,
  BoardAiSearchReader,
} from '../../server/ai/boardAiChatSearch';

export function createBoardAiSearchReader(): BoardAiSearchReader {
  return {
    async searchPosts(boardId: string, query: string, limit: number) {
      try {
        const { data, error } = await getSupabaseAdmin().rpc('search_board_posts_text', {
          p_board_id: boardId,
          // Already a tsquery expression, built and sanitised by
          // lib/domain/ai/boardAiSearchQuery.ts. Never a raw chat message.
          p_query: query,
          p_limit: limit,
        });
        if (error) return err(domainError('unavailable', 'Could not search this board'));
        return ok((data ?? []) as readonly BoardAiSearchPostRow[]);
      } catch {
        return err(domainError('unavailable', 'Could not search this board'));
      }
    },
    async searchChunks(boardId: string, query: string, limit: number) {
      try {
        const { data, error } = await getSupabaseAdmin().rpc('search_board_knowledge_chunks_text', {
          p_board_id: boardId,
          p_query: query,
          p_limit: limit,
        });
        if (error) return err(domainError('unavailable', 'Could not search this board'));
        return ok((data ?? []) as readonly BoardAiSearchChunkRow[]);
      } catch {
        return err(domainError('unavailable', 'Could not search this board'));
      }
    },
  };
}
