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
  dropDuplicateBoardAiSearchPassages,
  isBoardAiSearchPassageCovered,
  mergeBoardAiSearchPassages,
  type BoardAiSearchCoverage,
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

/**
 * How long the two searches together may take.
 *
 * SEPARATE FROM THE GENERATION CLOCK, AND DELIBERATELY SO. `executeBoardAiChat`
 * starts its own 20,000ms timer AFTER this returns, so without a bound here the
 * total request time was unbounded: a slow or seq-scanning search added however
 * long it took and only then did the generation budget begin. One clock must not
 * eat the other, so this is three seconds and the total is bounded at about 23.
 *
 * THREE SECONDS IS GENEROUS FOR WHAT THIS IS. Two GIN index probes on one board,
 * each capped at ten rows. If they take longer than this the index is not being
 * used, and the right outcome is a reported failure rather than a chat that
 * hangs while a sequential scan finishes.
 *
 * WHAT IT DOES AND DOES NOT DO: it stops US WAITING. The statement may continue
 * on the database, because PostgREST gives no cancellation handle here. That is
 * acceptable -- the query is a bounded read -- and it is stated rather than
 * implied, because "timeout" usually suggests the work stopped.
 */
export const BOARD_AI_SEARCH_TIMEOUT_MS = 3_000;

/** A sentinel distinct from any result, so a slow search cannot be read as an empty one. */
const TIMED_OUT = Symbol('board-ai-search-timeout');

async function withinSearchBudget<T>(work: Promise<T>): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), BOARD_AI_SEARCH_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

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
  /** What the user's own attachments already sent, for the span rule. */
  coverage: BoardAiSearchCoverage = { padletIds: new Set(), documentPages: new Set() },
  /**
   * Where the search block will sit in the array the model is given, so its
   * passages can carry the sub-token a citation resolves against. The route
   * appends the block after the attachments, so this is `currentContext.length`.
   * Passed through untouched -- this module decides nothing about it.
   */
  blockIndex = 0,
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
    // No passages, so no sub-tokens; the index is passed anyway for one shape.
    return ok({ block: boardAiSearchContextBlock([], '', result, blockIndex), result });
  }

  // STEP 3. Only now, and only reads. Both sources, independently, under one
  // bounded clock that is NOT the generation clock.
  const searched = await withinSearchBudget(Promise.all([
    reader.searchPosts(boardId, query.expression, BOARD_AI_SEARCH_LIMIT_PER_SOURCE),
    reader.searchChunks(boardId, query.expression, BOARD_AI_SEARCH_LIMIT_PER_SOURCE),
  ]));
  if (searched === TIMED_OUT) {
    // Refused, not treated as empty: "the search was too slow" and "the board
    // holds nothing" are different answers, and the caller turns this one into
    // the `failed` outcome the user is actually shown.
    return err(domainError('unavailable', 'Could not search this board'));
  }
  const [posts, chunks] = searched;
  // One source failing does not lose the other: a board with no PDFs and a
  // broken chunk search should still find its own notes.
  const postPassages: readonly BoardAiSearchPassage[] = posts.ok
    ? posts.value.map((row) => {
      const text = (row.text ?? '').trim();
      return {
        source: 'post' as const,
        label: postLabel(row),
        text,
        // With an empty body the indexed vector holds only the title, so a row
        // that came back matched on it. That is a result worth keeping, and the
        // origin line will say what kind of result it is.
        ...(text.length === 0 ? { titleOnly: true } : {}),
        rank: row.rank,
        padletId: row.padlet_id,
      };
    })
    : [];
  const chunkPassages: readonly BoardAiSearchPassage[] = chunks.ok
    ? chunks.value.map((row) => ({
      source: 'pdf' as const,
      label: chunkLabel(row),
      text: (row.text ?? '').trim(),
      rank: row.rank,
      knowledgeDocumentId: row.document_id,
      ...(row.page_start !== null ? { pageNumber: row.page_start, pageStart: row.page_start } : {}),
      ...(row.page_end !== null ? { pageEnd: row.page_end } : {}),
    }))
    : [];
  if (!posts.ok && !chunks.ok) {
    return err(domainError('unavailable', 'Could not search this board'));
  }

  // A passage the user ALREADY ATTACHED is not new material. It is dropped by
  // SPAN, not by id: a chunk from a page a document attachment never reached is
  // the only evidence in the request, and must survive.
  //
  // AN EMPTY BODY IS NOT AN EMPTY RESULT, for a post. An earlier version of this
  // dropped every passage with no text, reasoning that it "contributes a heading
  // and nothing else". That was wrong in the one case it mattered: a post's
  // TITLE is its content, and the rank normalization correctly puts a short
  // exact title match FIRST -- so the rule deleted the best-ranked row. For
  // "what does the Trump note post say?" the true answer is that such a post
  // exists and is empty, and six of the nine text posts on the reference board
  // are shaped that way.
  //
  // A CHUNK IS DIFFERENT and still guarded: a chunk IS its text, it has no title
  // of its own, and an empty one could not have matched in the first place.
  const usable = (passage: BoardAiSearchPassage) => {
    if (isBoardAiSearchPassageCovered(passage, coverage)) return false;
    if (passage.source === 'pdf') return passage.text.length > 0;
    return passage.text.length > 0 || passage.label.length > 0;
  };
  // DE-DUPLICATE AFTER THE MERGE, WHICH IS WHERE THE BATTERY MEASURED IT.
  //
  // The reader asks each source for BOARD_AI_SEARCH_LIMIT_PER_SOURCE rows, so a
  // duplicate has already spent one of those slots by the time this runs. That
  // is deliberate: the stronger variant -- fetch to the database clamp, drop
  // duplicates, then cut to K -- would return MORE distinct material, and it is
  // not what the battery measured. Shipping the measured rule and noting the
  // stronger one is the honest order; it goes in the followups rather than in
  // this commit.
  const merged = dropDuplicateBoardAiSearchPassages(mergeBoardAiSearchPassages(
    postPassages.filter(usable),
    chunkPassages.filter(usable),
    BOARD_AI_SEARCH_LIMIT_PER_SOURCE,
  ));

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
  return ok({ block: boardAiSearchContextBlock(kept, terms, result, blockIndex), result });
}
