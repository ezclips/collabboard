/**
 * Board AI Chat -- what a user may explicitly attach to a message.
 *
 * Two shapes live here and they are deliberately different. A REQUEST item is
 * what a browser asks for: identity only, never content. A PERSISTED item is
 * what the server decided to record afterwards: the same identity, plus a small
 * display excerpt it produced itself. A client can therefore name a source but
 * never describe one, which is the whole point -- BCHAT-A lets a user write
 * rows in their own private thread, so anything stored here is a claim, not a
 * capability.
 *
 * Nothing in this file reads, authorizes or resolves. The server resolver owns
 * that, and it re-does it from identity on every turn.
 */

/** Bumped only if the persisted shape changes incompatibly. */
export const BOARD_AI_CONTEXT_VERSION = 1;

export const BOARD_AI_CONTEXT_TYPES = [
  'knowledge-document',
  'knowledge-page',
  'knowledge-selection',
  'padlet',
  'padlet-image',
  // ADDITIVE, which is why BOARD_AI_CONTEXT_VERSION stays 1: an older client
  // reading a thread that contains one sees an item type it does not know and
  // drops it, exactly as it already drops anything malformed. Nothing about the
  // five existing shapes changes.
  'board-search',
] as const;

export type BoardAiContextType = (typeof BOARD_AI_CONTEXT_TYPES)[number];

export function isBoardAiContextType(value: unknown): value is BoardAiContextType {
  return typeof value === 'string' && (BOARD_AI_CONTEXT_TYPES as readonly string[]).includes(value);
}

/**
 * Budgets, chosen against the adapters' single text-in call and its 1500-token
 * reply allowance -- context has to leave room for an answer.
 *
 * Two independent caps for the same reason the history has two: a count says
 * nothing about size, and a character budget alone lets one attachment crowd
 * out the rest. The document page cap exists so attaching a 500-page PDF reads
 * a bounded prefix rather than the whole table.
 */
export const BOARD_AI_CONTEXT_MAX_ITEMS = 4;
export const BOARD_AI_CONTEXT_MAX_TOTAL_CHARS = 14_000;
export const BOARD_AI_CONTEXT_MAX_SINGLE_CHARS = 6_000;
export const BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES = 8;
/**
 * How many DISTINCT historical sources one request may re-resolve.
 *
 * The character budget is not enough on its own: it caps the prompt, but
 * resolution happens first, so an ever-growing thread would buy an
 * ever-growing pile of database reads for a payload that stays 14k. This cap
 * is applied to identities BEFORE any source is read, which is what keeps the
 * work per request constant instead of a function of thread length.
 */
export const BOARD_AI_CONTEXT_MAX_HISTORICAL_IDENTITIES = 8;
/** What a stored envelope may carry for display; never the source itself. */
export const BOARD_AI_CONTEXT_MAX_EXCERPT_CHARS = 300;
export const BOARD_AI_CONTEXT_MAX_LABEL_CHARS = 200;

/* ------------------------------------------------------------------ */
/* Request: identity only                                             */
/* ------------------------------------------------------------------ */

export interface KnowledgeDocumentContextRequest {
  readonly type: 'knowledge-document';
  readonly knowledgeDocumentId: string;
}

export interface KnowledgePageContextRequest {
  readonly type: 'knowledge-page';
  readonly knowledgeDocumentId: string;
  readonly pageNumber: number;
}

/**
 * The offsets are the claim the server checks, not information it trusts:
 * it slices its OWN stored page and compares, exactly as the source-reference
 * write command does, and keeps its own slice.
 */
export interface KnowledgeSelectionContextRequest {
  readonly type: 'knowledge-selection';
  readonly knowledgeDocumentId: string;
  readonly pageNumber: number;
  readonly charStart: number;
  readonly charEnd: number;
  readonly selectedText: string;
}

export interface PadletContextRequest {
  readonly type: 'padlet';
  readonly padletId: string;
}

/**
 * A PDF-area crop, attached as an IMAGE rather than as text.
 *
 * Identity only, exactly like every other request: the browser names a padlet
 * and nothing else. It never sends bytes, a storage path, a URL or a content
 * type -- the server derives all four from ids it has already validated. That
 * is what keeps this from becoming a way to ask the server to fetch an
 * arbitrary object and hand it to a model.
 *
 * The type is distinct from `padlet` on purpose. `padlet` promises text from
 * `content`; this promises pixels from a private derivative, and only the
 * server can tell whether a given card really is one.
 */
export interface PadletImageContextRequest {
  readonly type: 'padlet-image';
  readonly padletId: string;
}

/**
 * A board search, carrying WHAT TO SEARCH FOR and never what was found.
 *
 * The browser's whole contribution is a toggle; the server fills `query` from
 * the message it has already validated. That asymmetry is the same rule every
 * other variant follows -- identity in, content read by the server -- and it is
 * why a client cannot ask this to search a string the user never typed.
 *
 * CURRENT-TURN ONLY, like `padlet-image`. A stored one is not re-run on a later
 * turn: re-searching a three-day-old question against today's board would put
 * passages nobody asked for into an unrelated answer, and would make the
 * database work grow with thread length. The stored item survives for its chip.
 */
export interface BoardSearchContextRequest {
  readonly type: 'board-search';
  readonly query: string;
}

export type BoardAiContextRequestItem =
  | KnowledgeDocumentContextRequest
  | KnowledgePageContextRequest
  | KnowledgeSelectionContextRequest
  | PadletContextRequest
  | PadletImageContextRequest
  | BoardSearchContextRequest;

/* ------------------------------------------------------------------ */
/* Persisted: identity + server-authored display metadata             */
/* ------------------------------------------------------------------ */

/**
 * `label` and `excerpt` are produced by the server from authoritative content
 * and exist for a chip in the UI and for the citation slice later. They are
 * NEVER read back as source text: a later turn reloads the real thing from the
 * identity fields, so a user who edits this row changes what their own chip
 * says and nothing else.
 */
export interface BoardAiContextItem {
  readonly type: BoardAiContextType;
  readonly knowledgeDocumentId?: string;
  readonly pageNumber?: number;
  readonly padletId?: string;
  readonly charStart?: number;
  readonly charEnd?: number;
  /** The server's own verified slice for a selection; absent otherwise. */
  readonly selectedText?: string;
  /** The tsquery-source terms for a board-search item; absent otherwise. */
  readonly query?: string;
  readonly label?: string;
  readonly excerpt?: string;
}

export interface BoardAiContextEnvelope {
  readonly version: number;
  readonly items: readonly BoardAiContextItem[];
}

/* ------------------------------------------------------------------ */
/* Resolved: what actually reaches the model                          */
/* ------------------------------------------------------------------ */

/**
 * One authorized block. `text` came from the database on THIS turn; the
 * identity fields travel beside it so a later citation slice can say which
 * page an answer leaned on without re-deriving anything.
 */
/**
 * Image bytes for ONE provider call. Transient by construction.
 *
 * This shape exists only between resolution and the provider request. It is
 * never persisted, never put in the stored envelope, never returned to a
 * browser and never logged: the source is a private object in the Knowledge
 * bucket, and the whole reason the crop has no public URL is that a durable
 * address would outlive the authorisation that produced it. Base64 rather than
 * a URL for the same reason -- the provider cannot be sent somewhere to fetch.
 */
export interface BoardAiResolvedImage {
  readonly mediaType: string;
  readonly base64: string;
}

/**
 * The text a padlet-image block contributes. A fixed marker, never the bytes.
 *
 * The image travels as a separate part of the provider request; what goes into
 * the JSON payload -- and therefore into the stored envelope's excerpt -- is
 * this literal. That is what makes "bytes never reach `text`" a property of the
 * type rather than a rule someone has to remember.
 */
export const BOARD_AI_CONTEXT_IMAGE_MARKER = '[image attached]';

export interface ResolvedBoardAiContextBlock {
  readonly type: BoardAiContextType;
  readonly label: string;
  readonly knowledgeDocumentId?: string;
  readonly pageNumber?: number;
  readonly padletId?: string;
  readonly charStart?: number;
  readonly charEnd?: number;
  /** Present only on a board-search block: the terms that were searched for. */
  readonly query?: string;
  /**
   * The page numbers this block ACTUALLY sent, when it sent whole pages.
   *
   * Server-authored and transient: it is not persisted, because nothing reads it
   * on a later turn. It exists so board search can tell a genuine duplicate from
   * a passage it must keep. A `knowledge-document` attachment is capped at
   * BOARD_AI_CONTEXT_MAX_DOCUMENT_PAGES, so "this document is attached" is NOT
   * the same claim as "this page was sent", and conflating the two would drop
   * real evidence from page nine onwards.
   *
   * Absent on a selection, deliberately: a selection sent PART of a page, so no
   * page is covered by it and a passage from that page is not a duplicate.
   */
  readonly pageNumbers?: readonly number[];
  readonly text: string;
  /**
   * Present ONLY on a padlet-image block. `text` stays the marker above, so
   * nothing that serializes this block can accidentally carry the payload:
   * buildBoardAiContextEnvelope and serializeBoardAiChatPayload both read
   * `text`, and neither reads this field.
   */
  readonly image?: BoardAiResolvedImage;
}

const clamp = (value: string, max: number): string =>
  value.length <= max ? value : `${value.slice(0, max - 1)}…`;

export function boardAiContextLabel(value: string): string {
  return clamp(value.trim(), BOARD_AI_CONTEXT_MAX_LABEL_CHARS);
}

export function boardAiContextExcerpt(value: string): string {
  return clamp(value.trim().replace(/\s+/g, ' '), BOARD_AI_CONTEXT_MAX_EXCERPT_CHARS);
}

/** The envelope stored on a user message, built from resolved blocks only. */
export function buildBoardAiContextEnvelope(
  blocks: readonly ResolvedBoardAiContextBlock[],
): BoardAiContextEnvelope | null {
  if (blocks.length === 0) return null;
  return {
    version: BOARD_AI_CONTEXT_VERSION,
    items: blocks.map((block) => ({
      type: block.type,
      ...(block.knowledgeDocumentId ? { knowledgeDocumentId: block.knowledgeDocumentId } : {}),
      ...(block.pageNumber !== undefined ? { pageNumber: block.pageNumber } : {}),
      ...(block.padletId ? { padletId: block.padletId } : {}),
      ...(block.charStart !== undefined ? { charStart: block.charStart } : {}),
      ...(block.charEnd !== undefined ? { charEnd: block.charEnd } : {}),
      ...(block.type === 'knowledge-selection' ? { selectedText: block.text } : {}),
      ...(block.query !== undefined ? { query: boardAiContextExcerpt(block.query) } : {}),
      label: boardAiContextLabel(block.label),
      excerpt: boardAiContextExcerpt(block.text),
    })),
  };
}

/**
 * One stored item that parsed: its identity, plus the display strings written
 * on THAT SAME raw item.
 *
 * Carrying the two together is what stops a dropped neighbour from lending its
 * label to a survivor. Neither string is authority -- `request` is what gets
 * re-resolved; `label` and `excerpt` only redraw a chip.
 */
export interface ParsedBoardAiContextItem {
  readonly request: BoardAiContextRequestItem;
  readonly label?: string;
  readonly excerpt?: string;
}

/**
 * Strictly reads a stored envelope back, item by item.
 *
 * Each raw item is parsed on its own and keeps its own display strings, so a
 * malformed item is dropped whole rather than shifting the ones behind it.
 * Anything malformed, unknown or out of range is dropped rather than thrown --
 * one bad row a user wrote by hand must not brick the rest of their
 * conversation.
 */
export function boardAiContextItemsFromStored(value: unknown): readonly ParsedBoardAiContextItem[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const envelope = value as { version?: unknown; items?: unknown };
  if (envelope.version !== BOARD_AI_CONTEXT_VERSION) return [];
  if (!Array.isArray(envelope.items)) return [];

  const parsed: ParsedBoardAiContextItem[] = [];
  for (const raw of envelope.items) {
    // The cap counts ACCEPTED items, not scanned ones: applying it to the raw
    // list would let a few malformed rows at the front swallow the budget and
    // silently drop the valid attachments behind them.
    if (parsed.length >= BOARD_AI_CONTEXT_MAX_ITEMS) break;
    const item = raw as Record<string, unknown>;
    if (!isBoardAiContextType(item.type)) continue;
    const documentId = typeof item.knowledgeDocumentId === 'string' ? item.knowledgeDocumentId : null;
    const padletId = typeof item.padletId === 'string' ? item.padletId : null;
    const page = item.pageNumber;
    const isPage = typeof page === 'number' && Number.isInteger(page) && page >= 1;

    let request: BoardAiContextRequestItem | null = null;
    if (item.type === 'knowledge-document' && documentId) {
      request = { type: 'knowledge-document', knowledgeDocumentId: documentId };
    } else if (item.type === 'knowledge-page' && documentId && isPage) {
      request = { type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber: page as number };
    } else if (item.type === 'knowledge-selection' && documentId && isPage) {
      const { charStart, charEnd, selectedText } = item;
      if (typeof charStart === 'number' && Number.isInteger(charStart) && charStart >= 0
        && typeof charEnd === 'number' && Number.isInteger(charEnd) && charEnd > charStart
        && typeof selectedText === 'string' && selectedText.length > 0) {
        // The stored slice is re-verified against the live page on this turn;
        // it is a claim carried forward, never accepted as text.
        request = {
          type: 'knowledge-selection',
          knowledgeDocumentId: documentId,
          pageNumber: page as number,
          charStart,
          charEnd,
          selectedText,
        };
      }
    } else if (item.type === 'padlet' && padletId) {
      request = { type: 'padlet', padletId };
    } else if (item.type === 'board-search') {
      // A stored search keeps its query so the chip can say what was searched
      // for. It is never re-run -- resolveHistorical drops it -- so this is a
      // display record, not a standing instruction.
      const query = typeof item.query === 'string' ? item.query : '';
      request = { type: 'board-search', query };
    } else if (item.type === 'padlet-image' && padletId) {
      // Identity only, exactly as stored. Nothing about the image survives a
      // round trip: the stored item carries a label and the marker excerpt, and
      // the bytes are re-derived or -- for history -- deliberately not.
      request = { type: 'padlet-image', padletId };
    }
    if (request === null) continue;

    // Read at the same moment the identity is accepted, so a display string
    // can never travel further than the item it was written on.
    const label = typeof item.label === 'string' ? boardAiContextLabel(item.label) : undefined;
    const excerpt = typeof item.excerpt === 'string' ? boardAiContextExcerpt(item.excerpt) : undefined;
    parsed.push({
      request,
      ...(label ? { label } : {}),
      ...(excerpt ? { excerpt } : {}),
    });
  }
  return parsed;
}

/** Identity only, for callers that re-resolve rather than display. */
export function boardAiContextRequestsFromStored(value: unknown): readonly BoardAiContextRequestItem[] {
  return boardAiContextItemsFromStored(value).map((item) => item.request);
}

/**
 * A stable key for "the same source, named the same way".
 *
 * Built from identity alone. A label or an excerpt would be the wrong basis:
 * both are user-writable display strings, so two rows pointing at one page
 * could dodge de-duplication just by disagreeing about what to call it.
 */
export function boardAiContextIdentityKey(item: BoardAiContextRequestItem): string {
  switch (item.type) {
    case 'knowledge-document':
      return `knowledge-document:${item.knowledgeDocumentId}`;
    case 'knowledge-page':
      return `knowledge-page:${item.knowledgeDocumentId}:${item.pageNumber}`;
    case 'knowledge-selection':
      return `knowledge-selection:${item.knowledgeDocumentId}:${item.pageNumber}:${item.charStart}:${item.charEnd}`;
    case 'padlet':
      return `padlet:${item.padletId}`;
    // Distinct from `padlet:` on purpose: the same card attached as text and as
    // an image are two different sources, and collapsing them would silently
    // drop one of the two.
    case 'padlet-image':
      return `padlet-image:${item.padletId}`;
    case 'board-search':
      return `board-search:${item.query}`;
  }
}

/**
 * Chooses WHICH historical sources are worth reading, before any are read.
 *
 * `envelopes` arrives newest message first. The walk keeps the newest
 * occurrence of each distinct identity and stops at the cap, so the database
 * work a request can buy is fixed no matter how long the thread grows -- a
 * thread with two hundred messages costs exactly what one with ten does.
 *
 * De-duplication matters as much as the cap: a source re-attached every turn
 * would otherwise fill all eight slots by itself and crowd out everything
 * else the user referred to.
 */
export function selectHistoricalContextIdentities(
  envelopes: readonly unknown[],
  limit: number = BOARD_AI_CONTEXT_MAX_HISTORICAL_IDENTITIES,
): readonly BoardAiContextRequestItem[] {
  const seen = new Set<string>();
  const selected: BoardAiContextRequestItem[] = [];
  for (const envelope of envelopes) {
    for (const request of boardAiContextRequestsFromStored(envelope)) {
      if (selected.length >= limit) return selected;
      const key = boardAiContextIdentityKey(request);
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(request);
    }
  }
  return selected;
}

/**
 * One budget across the whole request, newest first.
 *
 * The caller passes current-message blocks ahead of historical ones, so the
 * attachment the user just made can never be squeezed out by things they
 * attached ten turns ago -- and when the budget runs out it is the oldest
 * history that goes.
 */
export function boundResolvedContext(
  blocks: readonly ResolvedBoardAiContextBlock[],
): readonly ResolvedBoardAiContextBlock[] {
  const kept: ResolvedBoardAiContextBlock[] = [];
  let characters = 0;
  // Once the character budget is spent, no further TEXT block is admitted --
  // identical to the `break` this replaces for a request with no image in it.
  // An image is still admitted after that point, which is the one difference
  // and the reason this is a flag rather than a break: a block ahead of the
  // image can exhaust the budget on its own, and ending the loop there would
  // discard the very thing the user attached this turn. An image costs ONE
  // item slot and the sixteen characters of its marker; its payload is not
  // text, is never measured as text, and does not compete for a budget that
  // exists to leave room for an answer.
  let textBudgetSpent = false;
  for (const block of blocks) {
    if (kept.length >= BOARD_AI_CONTEXT_MAX_ITEMS) break;
    const isImage = block.image !== undefined;
    if (textBudgetSpent && !isImage) continue;
    const text = block.text.length > BOARD_AI_CONTEXT_MAX_SINGLE_CHARS
      ? `${block.text.slice(0, BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 1)}…`
      : block.text;
    if (!isImage && kept.length > 0
      && characters + text.length > BOARD_AI_CONTEXT_MAX_TOTAL_CHARS) {
      textBudgetSpent = true;
      continue;
    }
    kept.push({ ...block, text });
    characters += text.length;
  }
  return kept;
}

/** What a browser may see of its own stored context. Identity + display only. */
export interface BoardAiContextView {
  readonly version: number;
  readonly items: readonly BoardAiContextItem[];
}

/**
 * Re-derives the public view from stored JSON rather than forwarding it.
 * A row a user hand-wrote can hold anything; this returns only fields the
 * contract defines, so nothing unexpected reaches a browser.
 */
export function boardAiContextViewFromStored(value: unknown): BoardAiContextView | null {
  const parsed = boardAiContextItemsFromStored(value);
  if (parsed.length === 0) return null;
  // Each surviving item carries the label and excerpt from its OWN raw entry.
  // Zipping parsed identities against raw indexes would hand a dropped item's
  // label to whichever item happened to follow it.
  const items: BoardAiContextItem[] = parsed.map(({ request, label, excerpt }) => {
    return {
      type: request.type,
      ...('knowledgeDocumentId' in request ? { knowledgeDocumentId: request.knowledgeDocumentId } : {}),
      ...('pageNumber' in request ? { pageNumber: request.pageNumber } : {}),
      ...('padletId' in request ? { padletId: request.padletId } : {}),
      ...('charStart' in request ? { charStart: request.charStart } : {}),
      ...('charEnd' in request ? { charEnd: request.charEnd } : {}),
      ...('selectedText' in request ? { selectedText: boardAiContextExcerpt(request.selectedText) } : {}),
      ...('query' in request ? { query: boardAiContextExcerpt(request.query) } : {}),
      ...(label ? { label } : {}),
      ...(excerpt ? { excerpt } : {}),
    };
  });
  return { version: BOARD_AI_CONTEXT_VERSION, items };
}
