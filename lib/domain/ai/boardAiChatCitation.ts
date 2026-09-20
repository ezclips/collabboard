/**
 * Grounded citations for a Board AI answer.
 *
 * The rule this module exists to enforce: a citation is ALWAYS a server-held
 * context block the user already attached and the server already authorized.
 * The model never supplies identity. It is handed opaque tokens -- S1, S2 --
 * for the blocks it was given, and may name those tokens in one machine
 * footer; the server maps a token back to its own block, or drops it. Nothing
 * a model writes in prose can become a document id, a page number or a
 * navigation target.
 *
 * Browser-safe: identity plus a server-authored label, and never source text.
 */

import { boardAiContextLabel, isBoardAiContextType } from './boardAiChatContext';
import type {
  BoardAiCitablePassage,
  BoardAiContextType,
  ResolvedBoardAiContextBlock,
} from './boardAiChatContext';

export const BOARD_AI_CITATION_VERSION = 1;

/**
 * A ceiling on what one answer may cite. The model can only name tokens it was
 * given, and the context itself is already capped, so this is the belt to that
 * brace -- a stored envelope stays small however it was written.
 */
export const BOARD_AI_CITATION_MAX_ITEMS = 8;

/** The one footer shape the server will read. Anything else is prose. */
export const BOARD_AI_CITATION_FOOTER_PREFIX = '[[COLLABBOARD_CITATIONS:';
export const BOARD_AI_CITATION_NONE = 'NONE';

/** The token a context block is known by, by its position in the request. */
export function boardAiCitationSourceToken(index: number): string {
  return `S${index + 1}`;
}

/**
 * The token grammar, in one place because two readers must agree on it: the
 * footer's shape check and the resolver below.
 *
 * `S3` names a block. `S3.2` names the second passage inside the block at S3 --
 * which only a board search has. The plain form is unchanged, so every footer
 * written before sub-tokens existed still parses exactly as it did.
 */
export const BOARD_AI_CITATION_TOKEN_PATTERN = /^S([1-9][0-9]*)(?:\.([1-9][0-9]*))?$/;

/**
 * The citation a token names, or null. Position is the only mapping, at both
 * levels: a block by its index in the array the model was given, and a passage
 * by its index within that block's own passage list.
 */
function citationForToken(
  token: string,
  blocks: readonly ResolvedBoardAiContextBlock[],
): BoardAiCitationItem | null {
  const match = BOARD_AI_CITATION_TOKEN_PATTERN.exec(token);
  if (!match) return null;
  const block = blocks[Number(match[1]) - 1];
  if (!block) return null;
  // A sub-token is a claim about a passage; an absent one falls to null rather
  // than silently citing the block it was written against.
  if (match[2] !== undefined) return citationItemFromPassage(block, Number(match[2]) - 1);
  return citationItemFromBlock(block);
}

/**
 * The footer contract, stated to the model.
 *
 * Deliberately phrased as "which of the sources you were given", never "write
 * the document id": the model has no identity to write, and the server would
 * not read it if it did.
 */
export const BOARD_AI_CITATION_INSTRUCTIONS: readonly string[] = [
  'Each entry in `explicitContext` carries a `sourceId` such as "S1". Those ids exist only so you can say which of the sources you were given you actually used.',
  `When your answer relies on one or more of them, end your reply with exactly one final line of the form ${BOARD_AI_CITATION_FOOTER_PREFIX}S1,S3]] naming those ids, newest first is not required.`,
  'A board search result contains several passages, and each is introduced by an id of the form "S3.2". When your answer relies on a search, name the passages you actually used rather than the search as a whole.',
  `If your answer uses none of them, end with ${BOARD_AI_CITATION_FOOTER_PREFIX}${BOARD_AI_CITATION_NONE}]] instead.`,
  'That line is machine-read and removed before the user sees your reply, so write nothing else on it, and never mention source ids, document identifiers or page numbers as a way of citing anything in your prose.',
];

export interface BoardAiCitationParseResult {
  /** The answer with a valid final footer removed; otherwise unchanged. */
  readonly content: string;
  /** Tokens the model named, in order, de-duplicated. Empty when none. */
  readonly tokens: readonly string[];
}

/**
 * Reads ONLY a well-formed final footer.
 *
 * Final, because a footer anywhere else is text the model wrote into its
 * answer, and stripping mid-prose would edit what the user reads. Malformed or
 * missing is not a failure: the answer stands and simply cites nothing --
 * losing a citation is a small loss, losing the answer is not.
 */
export function parseBoardAiCitationFooter(text: string): BoardAiCitationParseResult {
  const trimmed = text.trim();
  const match = /\[\[COLLABBOARD_CITATIONS:([^\]\r\n]*)\]\]$/.exec(trimmed);
  if (!match) return { content: trimmed, tokens: [] };

  const content = trimmed.slice(0, match.index).trim();
  const payload = match[1].trim();
  if (payload === '' || payload.toUpperCase() === BOARD_AI_CITATION_NONE) {
    return { content, tokens: [] };
  }

  const tokens: string[] = [];
  for (const raw of payload.split(',')) {
    const token = raw.trim().toUpperCase();
    // Shape only. Whether it names a real block is decided against the
    // server's own array, never here.
    if (!BOARD_AI_CITATION_TOKEN_PATTERN.test(token)) continue;
    if (tokens.includes(token)) continue;
    tokens.push(token);
  }
  return { content, tokens };
}

/**
 * One cited source: identity the reader can navigate to, plus the server's own
 * label. No text, no excerpt -- a citation says WHERE, never WHAT.
 */
export interface BoardAiCitationItem {
  readonly type: BoardAiContextType;
  readonly knowledgeDocumentId?: string;
  readonly pageNumber?: number;
  readonly padletId?: string;
  readonly charStart?: number;
  readonly charEnd?: number;
  readonly label: string;
}

export interface BoardAiCitationEnvelope {
  readonly version: number;
  readonly items: readonly BoardAiCitationItem[];
}

/**
 * A stable key for "the same source, cited twice".
 *
 * Identity alone, exactly as the context envelope de-duplicates: two mentions
 * of one page are one citation however they are labelled.
 */
export function boardAiCitationIdentityKey(item: BoardAiCitationItem): string {
  switch (item.type) {
    case 'knowledge-document':
      return `knowledge-document:${item.knowledgeDocumentId}`;
    case 'knowledge-page':
      return `knowledge-page:${item.knowledgeDocumentId}:${item.pageNumber}`;
    case 'knowledge-selection':
      return `knowledge-selection:${item.knowledgeDocumentId}:${item.pageNumber}:${item.charStart}:${item.charEnd}`;
    case 'padlet':
      return `padlet:${item.padletId}`;
    // Keyed by the card, matching the context identity key. A crop cited twice
    // in one answer is one citation, and a crop is never the same source as the
    // same card attached as text.
    case 'padlet-image':
      return `padlet-image:${item.padletId}`;
    // Unreachable in practice -- citationItemFromBlock refuses a search block,
    // because a search is not a place a reader can be taken to. Present so the
    // switch stays exhaustive over BoardAiContextType, and keyed by nothing
    // finer than the type: two searches in one answer are one non-citation.
    case 'board-search':
      return 'board-search';
  }
}

/** One authorized block, reduced to what a citation may carry. */
function citationItemFromBlock(block: ResolvedBoardAiContextBlock): BoardAiCitationItem | null {
  const label = boardAiContextLabel(block.label);
  if (!label) return null;
  const page = typeof block.pageNumber === 'number' && Number.isInteger(block.pageNumber) && block.pageNumber >= 1
    ? block.pageNumber
    : undefined;
  switch (block.type) {
    case 'knowledge-page':
      // A page citation without a page is not a page citation.
      return block.knowledgeDocumentId && page !== undefined
        ? { type: block.type, knowledgeDocumentId: block.knowledgeDocumentId, pageNumber: page, label }
        : null;
    case 'knowledge-selection':
      if (!block.knowledgeDocumentId || page === undefined) return null;
      return {
        type: block.type,
        knowledgeDocumentId: block.knowledgeDocumentId,
        pageNumber: page,
        ...(typeof block.charStart === 'number' && block.charStart >= 0 ? { charStart: block.charStart } : {}),
        ...(typeof block.charEnd === 'number' && block.charEnd > (block.charStart ?? -1) ? { charEnd: block.charEnd } : {}),
        label,
      };
    case 'knowledge-document':
      // Truthful identity, and no page: this source was attached whole, so
      // inventing one to make the chip look richer would be a lie.
      return block.knowledgeDocumentId
        ? { type: block.type, knowledgeDocumentId: block.knowledgeDocumentId, label }
        : null;
    case 'padlet':
      return block.padletId ? { type: block.type, padletId: block.padletId, label } : null;
    case 'padlet-image':
      // The CARD is what the reader navigates to -- it is the thing on the
      // board. The document and page come along when the crop's provenance
      // carried them, so "which page was this cut from" is answerable from the
      // citation itself; both are omitted rather than invented when absent.
      return block.padletId
        ? {
          type: block.type,
          padletId: block.padletId,
          ...(block.knowledgeDocumentId ? { knowledgeDocumentId: block.knowledgeDocumentId } : {}),
          ...(page !== undefined ? { pageNumber: page } : {}),
          label,
        }
        : null;
    case 'board-search':
      // A SEARCH IS STILL NOT A PLACE, and this refusal is NARROWED, not
      // lifted. The block holds passages from several posts and pages, so
      // "open the citation" has no single destination, and inventing one --
      // the first passage, say -- would take the reader somewhere the answer
      // may not have leaned on. A bare S-token on a search block therefore
      // still cites nothing.
      //
      // What changed is that a passage can now be named individually, as
      // `S3.2`, and THAT resolves -- through citationItemFromPassage below,
      // which is reached only with an in-range passage index. The obstacle the
      // earlier note described (one block per passage, colliding with the
      // four-slot rule) was avoided rather than paid: the block stays one
      // block, and the passage identity travels beside it.
      return null;
  }
}

/**
 * One passage inside a board-search block, as a citation.
 *
 * A SEARCH PASSAGE IS NOT A NEW KIND OF SOURCE. A post passage IS the board
 * post; a PDF passage IS a page of the document. So this emits the ordinary
 * `padlet` and `knowledge-page` items the rest of the system already knows,
 * which is why nothing downstream needed changing: the identity keys already
 * de-duplicate them against the same source attached explicitly, the stored
 * envelope needs no new field, the provenance canonicalization is unchanged,
 * and the reader already knows how to open both.
 */
function citationItemFromPassage(
  block: ResolvedBoardAiContextBlock,
  passageIndex: number,
): BoardAiCitationItem | null {
  // Only a search block has passages, so a sub-token on anything else is
  // refused here rather than being quietly read as its parent.
  if (block.type !== 'board-search') return null;
  const passage = block.passages?.[passageIndex];
  if (!passage) return null;
  return boardAiCitationItemFromPassage(passage);
}

/**
 * ONE PASSAGE, ONE CITATION -- the rule, in one place.
 *
 * Exported because the wiki compiles from the same passages the chat cites,
 * and it was building its own item: a pageless passage became a
 * knowledge-page with no page number, which is the Decision 0 collapse (every
 * passage of one document sharing a single citation identity, pointing at a
 * page that does not exist). Two copies of this rule meant one of them was
 * always going to be the old one.
 */
export function boardAiCitationItemFromPassage(
  passage: BoardAiCitablePassage,
): BoardAiCitationItem | null {
  const label = boardAiContextLabel(passage.label);
  if (!label) return null;

  if (passage.source === 'post') {
    return passage.padletId ? { type: 'padlet', padletId: passage.padletId, label } : null;
  }
  if (!passage.knowledgeDocumentId) return null;

  // A PAGELESS SOURCE IS CITED BY ITS RANGE. This is Decision 0: keying a text
  // passage as knowledge-page with a synthetic or null page would collapse
  // every passage of one document to a single citation identity, so the two
  // paragraphs an answer leaned on would arrive as one citation pointing
  // nowhere in particular. A character range is what that document has, and
  // knowledge-selection is the item type that carries one.
  //
  // Checked BEFORE the page arm, and on the range's own presence: a passage
  // with neither a page nor a range is not citable at all and falls through to
  // null, rather than being routed by the absence of one of them.
  if (passage.charStart !== undefined && passage.charEnd !== undefined) {
    if (!Number.isInteger(passage.charStart) || !Number.isInteger(passage.charEnd)) return null;
    if (passage.charStart < 0 || passage.charEnd <= passage.charStart) return null;
    return {
      type: 'knowledge-selection',
      knowledgeDocumentId: passage.knowledgeDocumentId,
      charStart: passage.charStart,
      charEnd: passage.charEnd,
      // No pageNumber. Not omitted as an oversight: this source has no pages,
      // and the resolver now refuses a page cited in a text source outright.
      label,
    };
  }

  // A chunk may span pages. `pageStart` is where this passage actually begins,
  // so it is located rather than invented -- the same standard the
  // knowledge-document arm applies when it refuses to guess a page at all.
  const page = passage.pageStart;
  if (typeof page !== 'number' || !Number.isInteger(page) || page < 1) return null;
  return {
    type: 'knowledge-page',
    knowledgeDocumentId: passage.knowledgeDocumentId,
    pageNumber: page,
    label,
  };
}

/**
 * Turns the tokens a model named into citations of the SERVER's own blocks.
 *
 * Unknown tokens, out-of-range tokens and blocks that cannot form a truthful
 * citation are dropped. An answer that cited nothing usable stores null rather
 * than an empty envelope, so "no citations" has one representation.
 */
export function buildBoardAiCitationEnvelope(
  tokens: readonly string[],
  blocks: readonly ResolvedBoardAiContextBlock[],
): BoardAiCitationEnvelope | null {
  const items: BoardAiCitationItem[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    if (items.length >= BOARD_AI_CITATION_MAX_ITEMS) break;
    const item = citationForToken(token, blocks);
    if (!item) continue;
    const key = boardAiCitationIdentityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items.length === 0 ? null : { version: BOARD_AI_CITATION_VERSION, items };
}

/**
 * Reads a stored envelope back, item by item, and refuses anything else.
 *
 * The row is JSONB a determined user could hand-write, so nothing in it is
 * trusted: unknown types, missing identity, absurd pages and stray fields are
 * dropped, and a single bad item never takes the conversation with it.
 */
export function boardAiCitationsFromStored(value: unknown): BoardAiCitationEnvelope | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const envelope = value as { version?: unknown; items?: unknown };
  if (envelope.version !== BOARD_AI_CITATION_VERSION) return null;
  if (!Array.isArray(envelope.items)) return null;

  const items: BoardAiCitationItem[] = [];
  const seen = new Set<string>();
  for (const raw of envelope.items) {
    if (items.length >= BOARD_AI_CITATION_MAX_ITEMS) break;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const stored = raw as Record<string, unknown>;
    if (!isBoardAiContextType(stored.type)) continue;
    const label = typeof stored.label === 'string' ? boardAiContextLabel(stored.label) : '';
    if (!label) continue;
    const documentId = typeof stored.knowledgeDocumentId === 'string' ? stored.knowledgeDocumentId : undefined;
    const padletId = typeof stored.padletId === 'string' ? stored.padletId : undefined;
    const page = typeof stored.pageNumber === 'number' && Number.isInteger(stored.pageNumber) && stored.pageNumber >= 1
      ? stored.pageNumber
      : undefined;
    const charStart = typeof stored.charStart === 'number' && Number.isInteger(stored.charStart) && stored.charStart >= 0
      ? stored.charStart
      : undefined;
    const charEnd = typeof stored.charEnd === 'number' && Number.isInteger(stored.charEnd)
      && charStart !== undefined && stored.charEnd > charStart
      ? stored.charEnd
      : undefined;

    let item: BoardAiCitationItem | null = null;
    if (stored.type === 'knowledge-page' && documentId && page !== undefined) {
      item = { type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber: page, label };
    } else if (
      stored.type === 'knowledge-selection'
      && documentId
      // A selection is readable back if it names a PAGE (a PDF selection, as
      // before) or a RANGE (a text selection, which has no page to name).
      // Neither alone is weakened: a stored selection with neither locator
      // still names nowhere and is still dropped.
      && (page !== undefined || (charStart !== undefined && charEnd !== undefined))
    ) {
      item = {
        type: 'knowledge-selection',
        knowledgeDocumentId: documentId,
        ...(page !== undefined ? { pageNumber: page } : {}),
        ...(charStart !== undefined ? { charStart } : {}),
        ...(charEnd !== undefined ? { charEnd } : {}),
        label,
      };
    } else if (stored.type === 'knowledge-document' && documentId) {
      item = { type: 'knowledge-document', knowledgeDocumentId: documentId, label };
    } else if (stored.type === 'padlet' && padletId) {
      item = { type: 'padlet', padletId, label };
    }
    if (item === null) continue;

    const key = boardAiCitationIdentityKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items.length === 0 ? null : { version: BOARD_AI_CITATION_VERSION, items };
}
