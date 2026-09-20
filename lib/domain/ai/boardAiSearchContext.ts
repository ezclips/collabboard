/**
 * Board search results, from two sources, inside one budget.
 *
 * Pure shaping: no database, no client, no I/O. The server reads the passages
 * and calls in here to decide which survive and what the user is told.
 *
 * THE RULE THAT SHAPES EVERYTHING BELOW (R4): explicit user intent outranks
 * automatic enrichment. Search yields, and it yields LOUDLY -- a passage is
 * dropped whole and counted, never halved, and the count reaches the chip and
 * the model rather than disappearing.
 */

import {
  BOARD_AI_CONTEXT_MAX_SINGLE_CHARS,
  type ResolvedBoardAiContextBlock,
} from './boardAiChatContext';
import { boardAiCitationSourceToken } from './boardAiChatCitation';

/** Which index a passage came from. Never merged away; every passage keeps it. */
/**
 * Which SEARCH a passage came from -- the board's posts, or its knowledge
 * corpus. Not which file format it happens to be.
 *
 * This was 'pdf', and a text source admitted under Stage 1 would have claimed
 * to be one. It could not simply be told the truth instead: the shared
 * retrieval function does not return `knowledge_documents.kind`, and adding it
 * would mean changing a RETURNS TABLE -- which CREATE OR REPLACE cannot do, so
 * it would mean dropping and recreating the function both Board AI and the
 * wiki compiler retrieve through. Inferring the kind from a null page_start
 * would be a guess dressed as a fact.
 *
 * So the discriminator stops naming a format. It only ever meant "which of the
 * two searches produced this", which is what the merge step uses it for, and
 * that meaning is true for every kind the corpus will hold.
 */
export type BoardAiSearchSource = 'post' | 'knowledge';

/**
 * One passage, already read and already authorized, with its origin attached.
 *
 * `rank` is the `ts_rank` of its own source and is NOT comparable across
 * sources -- see mergeBoardAiSearchPassages for why that matters.
 */
export interface BoardAiSearchPassage {
  readonly source: BoardAiSearchSource;
  /** Human label: the post's title, or the filename and page. */
  readonly label: string;
  readonly text: string;
  readonly rank: number;
  readonly padletId?: string;
  readonly knowledgeDocumentId?: string;
  readonly pageNumber?: number;
  /** The chunk's own page span, which the de-duplication rule compares. */
  readonly pageStart?: number;
  readonly pageEnd?: number;
  /**
   * A post that matched on its TITLE and has no body at all.
   *
   * It is a result, not noise: for "what does the Trump note post say?", the
   * true answer is that a post called Trump Note Post exists and is empty. The
   * title IS that post's content.
   *
   * It can only have matched on its title, and that is a property of the index
   * rather than a guess: the indexed vector is title-then-body, so with an empty
   * body there is nothing else in it that could have matched.
   */
  readonly titleOnly?: boolean;
}

/**
 * What the user's own attachments already put in front of the model.
 *
 * Built from the RESOLVED blocks, so it describes what was actually sent rather
 * than what was asked for.
 */
export interface BoardAiSearchCoverage {
  /** Posts sent as text. */
  readonly padletIds: ReadonlySet<string>;
  /** `${documentId}:${pageNumber}` for every page sent WHOLE. */
  readonly documentPages: ReadonlySet<string>;
}

const documentPageKey = (documentId: string, pageNumber: number): string =>
  `${documentId}:${pageNumber}`;

/**
 * What the attachments cover, by SPAN rather than by id.
 *
 * THE DISTINCTION IS THE WHOLE POINT. "This document is attached" and "this page
 * was sent" are different claims: a `knowledge-document` attachment reads a
 * bounded PREFIX -- BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES pages -- so a chunk from
 * page nine of a forty-page PDF is not a duplicate of anything, it is the only
 * evidence in the request. Skipping it because the document id matched would
 * silently delete real material, which is a worse bug than the duplicate it set
 * out to fix.
 *
 * A SELECTION COVERS NOTHING. It sent part of a page deliberately; a passage
 * from that page may hold exactly the part the user did not select.
 *
 * An IMAGE covers nothing either: it carries pixels, and a text passage about
 * the same card is not the same material.
 */
export function boardAiSearchCoverageOf(
  blocks: readonly ResolvedBoardAiContextBlock[],
): BoardAiSearchCoverage {
  const padletIds = new Set<string>();
  const documentPages = new Set<string>();
  for (const block of blocks) {
    if (block.type === 'padlet' && block.padletId) padletIds.add(block.padletId);
    if (!block.knowledgeDocumentId) continue;
    for (const pageNumber of block.pageNumbers ?? []) {
      documentPages.add(documentPageKey(block.knowledgeDocumentId, pageNumber));
    }
  }
  return { padletIds, documentPages };
}

/**
 * Is this passage already in front of the model?
 *
 * A chunk counts as covered only when EVERY page it spans was sent. A chunk
 * straddling pages 8 and 9, with a document attachment that stopped at 8, is
 * kept -- half of it is new, and dropping it would lose that half.
 */
export function isBoardAiSearchPassageCovered(
  passage: BoardAiSearchPassage,
  coverage: BoardAiSearchCoverage,
): boolean {
  if (passage.source === 'post') {
    return passage.padletId !== undefined && coverage.padletIds.has(passage.padletId);
  }
  const documentId = passage.knowledgeDocumentId;
  if (documentId === undefined) return false;
  const start = passage.pageStart;
  const end = passage.pageEnd ?? start;
  // A passage with no page span cannot be proved covered, so it is kept. Keeping
  // a possible duplicate costs characters; dropping possible evidence costs the
  // answer.
  if (start === undefined || end === undefined) return false;
  for (let page = start; page <= end; page += 1) {
    if (!coverage.documentPages.has(documentPageKey(documentId, page))) return false;
  }
  return true;
}

/**
 * The room a request must still have before a search is worth running.
 *
 * THE SKIP RULE. A user with four attachments has spent the budget, and running
 * the search anyway buys a database round trip to report "used 0 of 6", which
 * reads worse than not searching and costs more. So if fewer than this many
 * characters remain, the search does not run and the chip says why.
 *
 * FOUR HUNDRED, and the number is smaller than it looks. Passages on this
 * corpus are small -- the observed median PDF chunk is 56 characters -- so this
 * is room for several of them plus their origin lines, not room for one. A
 * larger threshold would skip searches that would comfortably have fitted.
 */
export const BOARD_AI_SEARCH_MIN_ROOM_CHARS = 400;

/** What became of the search on this turn. The prompt branches on exactly this. */
export type BoardAiSearchOutcome =
  /** The toggle was off. No search, and the prompt says nothing about one. */
  | 'off'
  /** It ran. It may still have matched nothing -- that is a result, not a failure. */
  | 'ran'
  /** Not run: the user's own attachments left no room. */
  | 'skipped-no-room'
  /**
   * It was attempted and could not run -- the database refused, or the two
   * functions are not deployed yet.
   *
   * R4 SAYS SEARCH YIELDS LOUDLY, AND THAT INCLUDES YIELDING TO A FAILURE. The
   * first cut of this feature reported nothing at all here: the user turned the
   * toggle on, nothing happened, and no chip said so. Silence is the one
   * outcome the rule forbids, because it is indistinguishable from "searched
   * and found nothing" -- which would let a user conclude their board holds no
   * answer when in fact nothing was ever looked at.
   *
   * It maps to the OFF prompt, not to a fourth prompt state: no search ran, so
   * the model must claim none. The user is the one who needs to know why.
   */
  | 'failed';

export interface BoardAiSearchResult {
  readonly outcome: BoardAiSearchOutcome;
  /** How many passages the database returned, before the budget was applied. */
  readonly returned: number;
  /** How many reached the model. */
  readonly used: number;
  /** returned - used. Stated, never silent. */
  readonly dropped: number;
  /** The terms searched for, joined for display. Empty when nothing was searched. */
  readonly query: string;
}

/**
 * Is there room to bother searching?
 *
 * Called BEFORE the database round trip, which is the whole point of it.
 */
export function boardAiSearchHasRoom(attachmentChars: number, totalBudget: number): boolean {
  return totalBudget - attachmentChars >= BOARD_AI_SEARCH_MIN_ROOM_CHARS;
}

/**
 * Top-K from each source independently, then concatenated.
 *
 * THERE IS NO CROSS-SOURCE RANKING, AND THAT IS THE DECISION. `ts_rank` over a
 * short post title and `ts_rank` over a PDF fragment are different scales, so
 * sorting the two together would present an arithmetic coincidence as a
 * judgement about relevance. Each source is ordered within itself -- the
 * database already did that -- and the caller's K bounds each.
 *
 * NO RATIO IS BAKED IN. K is the caller's, one value per source, because six
 * fragments do not equal one post today and will not after segmentation is
 * revisited. Posts lead only because a board's own notes are the thing a user
 * is least likely to have attached by hand.
 */
export function mergeBoardAiSearchPassages(
  posts: readonly BoardAiSearchPassage[],
  chunks: readonly BoardAiSearchPassage[],
  limitPerSource: number,
): readonly BoardAiSearchPassage[] {
  return [...posts.slice(0, limitPerSource), ...chunks.slice(0, limitPerSource)];
}

/**
 * Admit whole passages until the budget is spent, and count what was dropped.
 *
 * NEVER HALF A PASSAGE. A split passage that is still cited claims a source the
 * model never fully saw, and the citation would point at a page whose relevant
 * sentence was the part that got cut. Truncating is the failure mode that looks
 * like it worked.
 *
 * A single passage longer than the per-block ceiling is bounded by that ceiling
 * rather than dropped -- that is the same rule every other context block lives
 * under, and dropping the one passage that matched would be worse.
 */
/**
 * The same passage text, returned more than once, is one passage.
 *
 * MEASURED, NOT GUESSED: the tuning battery
 * (scripts/db/boardSearchTuningBattery.ts) found this removes **29% of all
 * retrieved characters** across eleven questions while losing no
 * human-rated-relevant text — the only candidate rule that separated volume from
 * value without a tuned constant. This board carries identical text in more than
 * one document (a bicycle guide and a chess guide each also live inside a
 * combined PDF; one test document appears three times), so on some questions
 * half of everything retrieved is a second copy.
 *
 * FIRST COPY IN LIST ORDER WINS, which is rank order within each source, posts
 * ahead of chunks. That is exactly what the battery measured; picking a
 * different survivor would be shipping something the table does not cover.
 *
 * EMPTY TEXT IS EXCLUDED, AND THAT IS A REAL BUG THIS AVOIDS RATHER THAN A
 * TIDINESS RULE. Every title-only post has the same empty body, so keying on
 * text alone would collapse two DIFFERENT title-only posts — different titles,
 * different sources, both genuine results — into one. No battery question
 * returns two title-only posts, so the battery could never have caught it; in
 * production it would silently delete a result.
 */
export function dropDuplicateBoardAiSearchPassages(
  passages: readonly BoardAiSearchPassage[],
): readonly BoardAiSearchPassage[] {
  const seen = new Set<string>();
  const kept: BoardAiSearchPassage[] = [];
  for (const passage of passages) {
    // A title-only post carries its content in its LABEL, so it is identified by
    // nothing this rule can compare. It is never a duplicate here.
    if (passage.text.length === 0) { kept.push(passage); continue; }
    if (seen.has(passage.text)) continue;
    seen.add(passage.text);
    kept.push(passage);
  }
  return kept;
}

/** The separator and origin line each passage costs beyond its own characters. */
/**
 * The characters an origin line costs beyond the text and the label.
 *
 * WAS 16, for `[board post: ]` plus the newlines. The citation sub-token added
 * up to about nine more -- `S10.12 | ` -- so the budget would have under-counted
 * every passage and let the block overrun the room it was given. Raised to 25,
 * which covers the widest token this can produce at the four-slot and
 * ten-passage ceilings.
 */
const BOARD_AI_SEARCH_PASSAGE_OVERHEAD = 25;

export function boundBoardAiSearchPassages(
  passages: readonly BoardAiSearchPassage[],
  availableChars: number,
): { readonly kept: readonly BoardAiSearchPassage[]; readonly dropped: number } {
  const kept: BoardAiSearchPassage[] = [];
  let spent = 0;
  for (const passage of passages) {
    const text = passage.text.length > BOARD_AI_CONTEXT_MAX_SINGLE_CHARS
      ? `${passage.text.slice(0, BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 1)}…`
      : passage.text;
    // The label travels into the block too, so it is measured with the text.
    const cost = text.length + passage.label.length + BOARD_AI_SEARCH_PASSAGE_OVERHEAD;
    if (spent + cost > availableChars) continue;
    kept.push({ ...passage, text });
    spent += cost;
  }
  return { kept, dropped: passages.length - kept.length };
}

/** The label the chip and the payload both use for the one search block. */
export const BOARD_AI_SEARCH_BLOCK_LABEL = 'Board search';

/**
 * The single context block a search contributes.
 *
 * ONE BLOCK, not one per passage. Every passage keeps its own origin line
 * inside, so a citation still resolves, but the four-slot rule stays a rule
 * about what the USER attached -- a search that matched six things must not
 * evict two of their four attachments by occupying six slots.
 *
 * The block's label says it is a search result, and the prompt's claim depends
 * on that being true: the model is told these came from a search of the board,
 * so a block that did not would make the prompt a lie.
 */
export function boardAiSearchContextBlock(
  passages: readonly BoardAiSearchPassage[],
  query: string,
  result: BoardAiSearchResult,
  /**
   * This block's own position in the array the model will be given, so the
   * origin lines can carry the sub-token the citation layer parses back.
   *
   * THE CALLER KNOWS THIS AND THIS FUNCTION CANNOT. The route appends the
   * search block after the user's attachments, so the index is
   * `currentContext.length` -- and it stays correct through bounding because
   * `boundResolvedContext` only ever drops a SUFFIX: once the character budget
   * is spent every later text block is skipped, so a surviving search block
   * still has every predecessor in front of it. That is an invariant of the
   * bounder, not of this block, so a route test pins it.
   *
   * Defaults to 0 only so the "nothing matched" and skipped blocks -- which
   * have no passages and therefore no sub-tokens -- need not supply one.
   */
  blockIndex = 0,
): ResolvedBoardAiContextBlock {
  const body = passages.length === 0
    // LOAD-BEARING. Without this the model sees an empty block and infers the
    // search failed, or worse, that it was never run -- and answers as if it
    // had read the board. Saying "nothing matched" is a result.
    ? 'No passages on this board matched this search.'
    : passages
      .map((passage, index) => {
        // The sub-token this passage is known by. Position is the only mapping,
        // exactly as it is for a block: the server reads the returned token
        // back against this same array, so a model can only ever name a passage
        // it was actually given.
        const token = `${boardAiCitationSourceToken(blockIndex)}.${index + 1}`;
        // THE ORIGIN LINE MUST NOT LET THE MODEL IMPLY IT READ A BODY THAT DOES
        // NOT EXIST. A title-only post is a real result, and saying so in the
        // line is what keeps it from reading as a source whose text went
        // missing -- the difference between "this post is empty" and "I was
        // given this post" is the whole reason the row is worth keeping.
        if (passage.titleOnly) return `[${token} | board post, title only and no body: ${passage.label}]`;
        return `[${token} | ${passage.source === 'post' ? 'board post' : 'PDF text'}: ${passage.label}]\n${passage.text}`;
      })
      .join('\n\n');
  return {
    type: 'board-search',
    // THE COUNTS TRAVEL IN THE LABEL, and that is one decision serving two
    // requirements. The persisted envelope keeps a block's label, so the chip
    // can say what was found and dropped after a reload without a second stored
    // shape; and the label is in the payload, so the model can honestly answer
    // "I searched and used two of six" rather than implying it saw all six.
    label: boardAiSearchChipText(result),
    query,
    // Identity only, in the SAME ORDER as the origin lines above, because the
    // sub-token's number is an index into this array.
    ...(passages.length === 0 ? {} : {
      passages: passages.map((passage) => ({
        source: passage.source,
        label: passage.label,
        ...(passage.padletId ? { padletId: passage.padletId } : {}),
        ...(passage.knowledgeDocumentId ? { knowledgeDocumentId: passage.knowledgeDocumentId } : {}),
        // A chunk may span pages; the page it BEGINS on is located, not
        // invented. `pageNumber` is the post-side field and is absent here.
        ...(passage.pageStart !== undefined ? { pageStart: passage.pageStart } : {}),
      })),
    }),
    text: body,
  };
}

/**
 * The record of a search that was NOT run, for the stored envelope only.
 *
 * NEVER SENT TO THE MODEL. The prompt's third branch already tells it that the
 * attachments took the room, and adding a block to say so again would spend the
 * very budget the skip existed to protect -- while occupying one of the four
 * slots the user's own attachments just filled.
 *
 * It exists because the chip has to survive a reload: without a stored item the
 * user sees "search on" and no explanation the next time they open the thread.
 */
export function boardAiSearchSkippedBlock(
  outcome: 'skipped-no-room' | 'failed' = 'skipped-no-room',
): ResolvedBoardAiContextBlock {
  return {
    type: 'board-search',
    label: boardAiSearchChipText({ outcome, returned: 0, used: 0, dropped: 0, query: '' }),
    query: '',
    text: outcome === 'failed'
      ? 'Board search could not run, so nothing on this board was searched.'
      : 'Board search was not run: the attachments on this message took all the available room.',
  };
}

/**
 * Which prompt branch an outcome selects.
 *
 * THERE ARE THREE PROMPT STATES AND FOUR OUTCOMES, and the collapse is the
 * point: a search that could not run and a search that was never asked for are
 * the same thing TO THE MODEL -- no passages, no claim. They differ only to the
 * user, who is told which happened by the chip.
 */
export function boardAiSearchPromptState(
  outcome: BoardAiSearchOutcome,
): 'off' | 'ran' | 'skipped-no-room' {
  if (outcome === 'ran') return 'ran';
  if (outcome === 'skipped-no-room') return 'skipped-no-room';
  return 'off';
}

/**
 * What the chip says. Server-authored, and it must never imply an image
 * travelled -- a search returns text from posts and PDF text, and nothing on
 * this path carries pixels.
 */
export function boardAiSearchChipText(result: BoardAiSearchResult): string {
  const prefix = BOARD_AI_SEARCH_BLOCK_LABEL;
  if (result.outcome === 'skipped-no-room') {
    return `${prefix} — not run, your attachments took the room`;
  }
  // Distinct from "no text matched", deliberately. Telling a user their board
  // holds nothing when nothing was looked at is the worse of the two errors.
  if (result.outcome === 'failed') return `${prefix} — could not run, nothing was searched`;
  // "text" in every branch, deliberately: this path carries words from posts and
  // from PDF text and never pixels, and a chip that read "3 results" beside the
  // image chip would invite exactly the wrong inference.
  if (result.returned === 0) return `${prefix} — no text matched`;
  if (result.dropped > 0) {
    return `${prefix} — ${result.returned} text passages found, ${result.used} used, ${result.dropped} dropped for room`;
  }
  return `${prefix} — ${result.used} text passages used`;
}
