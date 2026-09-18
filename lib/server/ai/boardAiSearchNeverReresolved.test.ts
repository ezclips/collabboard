import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  resolveBoardAiChatContext,
  resolveHistoricalBoardAiChatContext,
  type BoardAiContextSupabaseClient,
} from './boardAiChatContext';
import { domainError } from '../../domain/core/errors';
import { err } from '../../domain/core/result';

const ROOT = path.resolve(__dirname, '../../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
/**
 * Comments stripped, because these assertions are about what the code DOES.
 * The reader's header legitimately explains that authorization happened
 * upstream, and naming it there must not read as performing it here.
 */
const executable = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const BOARD = '11111111-1111-1111-1111-111111111111';

/** Any read through this is a failure of the rule under test. */
function forbiddenClient(onRead: () => void): BoardAiContextSupabaseClient {
  return {
    from() {
      onRead();
      throw new Error('the resolver must not read anything for a board-search item');
    },
  } as unknown as BoardAiContextSupabaseClient;
}

describe('a stored board search is a record, never a standing instruction', () => {
  it('the historical path drops it without reading anything', async () => {
    const read_ = vi.fn();
    const blocks = await resolveHistoricalBoardAiChatContext(
      forbiddenClient(read_),
      BOARD,
      [{ type: 'board-search', query: 'oil headlines' }],
    );

    // RE-RUNNING IT WOULD ANSWER A QUESTION NOBODY IS ASKING. The query was
    // built from a message asked on some earlier turn; passages found for it
    // today would land in an unrelated answer, and the database work would grow
    // with thread length.
    expect(blocks).toEqual([]);
    expect(read_).not.toHaveBeenCalled();
  });

  it('the current path refuses it outright rather than searching', async () => {
    const read_ = vi.fn();
    const result = await resolveBoardAiChatContext(
      forbiddenClient(read_),
      BOARD,
      [{ type: 'board-search', query: 'oil headlines' }],
      { download: async () => err(domainError('unavailable', 'never')) },
    );

    // A search is performed ONCE, by boardAiChatSearch, on the turn the user
    // asked for it. A future caller that forgets gets an error, not a second
    // silent search.
    expect(result.ok).toBe(false);
    expect(read_).not.toHaveBeenCalled();
  });

  it('the chat route still holds no admin client, search included', () => {
    // The standing guard. The search functions are service_role-only, so the
    // privileged call lives in lib/infra/ai/boardAiSearchReader.ts -- not here.
    const route = executable(read('app/api/boards/[id]/ai/chat/route.ts'));
    expect(route).not.toContain('getSupabaseAdmin');
    expect(route).not.toContain('SUPABASE_SERVICE_ROLE');
    // It reaches the reader only through the named factory.
    expect(route).toContain('createBoardAiSearchReader()');
  });

  it('the search reader is the only place the two RPCs are named', () => {
    const reader = executable(read('lib/infra/ai/boardAiSearchReader.ts'));
    expect(reader).toContain('search_board_posts_text');
    expect(reader).toContain('search_board_knowledge_chunks_text');
    // And it holds no authorization logic of its own -- that is upstream, on
    // the caller's client, and searchBoardAiContext pins the order.
    expect(reader).not.toContain('canReadBoardKnowledge');
    expect(reader).not.toContain('is_board_member');
  });
});
