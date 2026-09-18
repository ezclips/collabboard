// Board AI Chat -- searching the board's own text. SERVER ONLY.
//
// THE ORDER IN THIS FILE IS THE SECURITY PROPERTY, and it is pinned by a test.
// The caller's OWN client answers "may this user read this board's knowledge"
// FIRST; only then does the privileged reader run the two scoped searches. The
// reverse order would mean a board id from a request reached a service_role
// query before anyone checked who was asking -- which is the entire class of bug
// `canReadBoardKnowledge` exists to prevent.
//
// WHY THERE IS A PRIVILEGED READER AT ALL. The two search functions are granted
// to service_role only, exactly like the vector RPC they mirror. That is not a
// convenience: an RPC granted to `authenticated` is an RPC any browser session
// can call with any board id it likes, and the board filter inside it is then
// the only thing standing between a user and another board's text. Keeping
// EXECUTE with the server means the board id is one this module already proved
// the caller may read.
//
// The reader is the same isolation `boardAiContextImageReader` has and for the
// same reason: the chat route carries a standing guard, asserted from three
// separate tests, that it contains no admin client at all. This module takes a
// reader as a parameter and never constructs one.

import { domainError } from '../../domain/core/errors';
import type { DomainError } from '../../domain/core/errors';
import type { Result } from '../../domain/core/result';
import { err, ok } from '../../domain/core/result';
import { buildBoardAiSearchQuery } from '../../domain/ai/boardAiSearchQuery';
import {
  boardAiSearchContextBlock,
  boundBoardAiSearchPassages,
  mergeBoardAiSearchPassages,
  type BoardAiSearchPassage,
  type BoardAiSearchResult,
} from '../../domain/ai/boardAiSearchContext';
import type { ResolvedBoardAiContextBlock } from '../../domain/ai/boardAiChatContext';
import { canReadBoardKnowledge } from '../knowledge/knowledgeBoardReadAuthorization';
import type { KnowledgeBoardReadAuthorizationClient } from '../knowledge/knowledgeBoardReadAuthorization';

/**
 * The two searches, and ONLY the two searches.
 *
 * Narrow on purpose, like the image reader: it takes a board id and a tsquery
 * expression and returns rows. It holds no authorization logic, so it cannot be
 * tricked into answering a question about who may read what. By the time it is
 * called, that question has already been answered above it.
 */
export interface BoardAiSearchReader {
  searchPosts(boardId: string, query: string, limit: number): Promise<Result<readonly BoardAiSearchPostRow[], DomainError>>;
  searchChunks(boardId: string, query: string, limit: number): Promise<Result<readonly BoardAiSearchChunkRow[], DomainError>>;
}

export interface BoardAiSearchPostRow {
  readonly padlet_id: string;
  readonly title: string | null;
  readonly text: string | null;
  readonly rank: number;
}

export interface BoardAiSearchChunkRow {
  readonly chunk_id: string;
  readonly document_id: string;
  readonly original_filename: string | null;
  readonly page_start: number | null;
  readonly page_end: number | null;
  readonly chunk_index: number;
  readonly text: string | null;
  readonly rank: number;
}

/**
 * How many passages one SOURCE may contribute.
 *
 * Passed to the database as its limit and used again as the merge's K, so there
 * is one number rather than two that can disagree. Four matches the attachment
 * slot count by coincidence of scale, not by rule -- it is not a ratio, and the
 * merge bakes none in.
 */
export const BOARD_AI_SEARCH_LIMIT_PER_SOURCE = 4;

/** The post's own title, or an honest stand-in. Never the body's first line. */
function postLabel(row: BoardAiSearchPostRow): string {
  const title = (row.title ?? '').trim();
  return title.length > 0 ? title : 'Untitled note';
}

/**
 * The filename and the page, so a citation can point somewhere.
 *
 * `page_start` and `page_end` are the chunk's span. When they differ the label
 * says so rather than picking one, because a passage that straddles a page
 * break genuinely is on both and naming one would be a small lie in a citation.
 */
function chunkLabel(row: BoardAiSearchChunkRow): string {
  const filename = (row.original_filename ?? '').trim() || 'PDF';
  const start = row.page_start;
  const end = row.page_end;
  if (start === null) return filename;
  if (end !== null && end !== start) return `${filename} — pages ${start}–${end}`;
  return `${filename} — page ${start}`;
}

/**
 * Authorize, then search, then bound. In that order.
 *
 * `availableChars` is what the user's own attachments left. The caller decides
 * whether there is room to call this at all (the skip rule lives in the domain,
 * beside the number it compares against); by the time this runs, the decision to
 * search has been made.
 *
 * A FAILED SEARCH IS NOT A FAILED CHAT. Every error path below returns a result
 * rather than throwing: the question the user asked is still a question, and
 * refusing to answer it because an enrichment they toggled on could not run
 * would be the feature taking the conversation hostage.
 */
export async function searchBoardAiContext(
  client: KnowledgeBoardReadAuthorizationClient,
  reader: BoardAiSearchReader,
  boardId: string,
  userId: string,
  message: string,
  availableChars: number,
): Promise<Result<{ block: ResolvedBoardAiContextBlock; result: BoardAiSearchResult }, DomainError>> {
  // STEP 1. The caller's own client, before anything privileged exists. Owner
  // or is_board_member, re-checked on this turn and never cached.
  let allowed: boolean;
  try {
    allowed = await canReadBoardKnowledge(client, boardId, userId);
  } catch {
    return err(domainError('unavailable', 'Could not search this board'));
  }
  if (!allowed) return err(domainError('not_found', 'Could not search this board'));

  // STEP 2. The query. An all-stopword message legitimately reduces to nothing,
  // and that is a RESULT -- the block says nothing matched -- not an error and
  // not a reason to call the database.
  const query = buildBoardAiSearchQuery(message);
  if (query.isEmpty) {
    const result: BoardAiSearchResult = {
      outcome: 'ran', returned: 0, used: 0, dropped: 0, query: '',
    };
    return ok({ block: boardAiSearchContextBlock([], '', result), result });
  }

  // STEP 3. Only now, and only reads. Both sources, independently.
  const [posts, chunks] = await Promise.all([
    reader.searchPosts(boardId, query.expression, BOARD_AI_SEARCH_LIMIT_PER_SOURCE),
    reader.searchChunks(boardId, query.expression, BOARD_AI_SEARCH_LIMIT_PER_SOURCE),
  ]);
  // One source failing does not lose the other: a board with no PDFs and a
  // broken chunk search should still find its own notes.
  const postPassages: readonly BoardAiSearchPassage[] = posts.ok
    ? posts.value.map((row) => ({
      source: 'post' as const,
      label: postLabel(row),
      text: (row.text ?? '').trim(),
      rank: row.rank,
      padletId: row.padlet_id,
    }))
    : [];
  const chunkPassages: readonly BoardAiSearchPassage[] = chunks.ok
    ? chunks.value.map((row) => ({
      source: 'pdf' as const,
      label: chunkLabel(row),
      text: (row.text ?? '').trim(),
      rank: row.rank,
      knowledgeDocumentId: row.document_id,
      ...(row.page_start !== null ? { pageNumber: row.page_start } : {}),
    }))
    : [];
  if (!posts.ok && !chunks.ok) {
    return err(domainError('unavailable', 'Could not search this board'));
  }

  // A passage with no text is not a passage. The database can return one for a
  // post whose title matched and whose body is empty; its title is already the
  // label, so the row would contribute a heading and nothing else.
  const merged = mergeBoardAiSearchPassages(
    postPassages.filter((passage) => passage.text.length > 0),
    chunkPassages.filter((passage) => passage.text.length > 0),
    BOARD_AI_SEARCH_LIMIT_PER_SOURCE,
  );

  // STEP 4. Whole passages only, and the dropped count is kept.
  const { kept, dropped } = boundBoardAiSearchPassages(merged, availableChars);
  const terms = query.terms.join(' ');
  const result: BoardAiSearchResult = {
    outcome: 'ran',
    returned: merged.length,
    used: kept.length,
    dropped,
    query: terms,
  };
  return ok({ block: boardAiSearchContextBlock(kept, terms, result), result });
}
