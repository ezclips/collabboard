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

export type BoardAiContextRequestItem =
  | KnowledgeDocumentContextRequest
  | KnowledgePageContextRequest
  | KnowledgeSelectionContextRequest
  | PadletContextRequest;

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
export interface ResolvedBoardAiContextBlock {
  readonly type: BoardAiContextType;
  readonly label: string;
  readonly knowledgeDocumentId?: string;
  readonly pageNumber?: number;
  readonly padletId?: string;
  readonly charStart?: number;
  readonly charEnd?: number;
  readonly text: string;
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
      label: boardAiContextLabel(block.label),
      excerpt: boardAiContextExcerpt(block.text),
    })),
  };
}

/**
 * Strictly reads a stored envelope back into request items.
 *
 * Deliberately returns REQUESTS, not the stored item: a later turn must go
 * back through the same authorization the original attachment did, from
 * identity alone. Anything malformed, unknown or out of range is dropped
 * rather than throwing -- one bad row a user wrote by hand must not brick the
 * rest of their conversation.
 */
export function boardAiContextRequestsFromStored(value: unknown): readonly BoardAiContextRequestItem[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const envelope = value as { version?: unknown; items?: unknown };
  if (envelope.version !== BOARD_AI_CONTEXT_VERSION) return [];
  if (!Array.isArray(envelope.items)) return [];

  const requests: BoardAiContextRequestItem[] = [];
  for (const raw of envelope.items) {
    // The cap counts ACCEPTED items, not scanned ones: applying it to the raw
    // list would let a few malformed rows at the front swallow the budget and
    // silently drop the valid attachments behind them.
    if (requests.length >= BOARD_AI_CONTEXT_MAX_ITEMS) break;
    const item = raw as Record<string, unknown>;
    if (!isBoardAiContextType(item.type)) continue;
    const documentId = typeof item.knowledgeDocumentId === 'string' ? item.knowledgeDocumentId : null;
    const padletId = typeof item.padletId === 'string' ? item.padletId : null;
    const page = item.pageNumber;
    const isPage = typeof page === 'number' && Number.isInteger(page) && page >= 1;

    if (item.type === 'knowledge-document' && documentId) {
      requests.push({ type: 'knowledge-document', knowledgeDocumentId: documentId });
    } else if (item.type === 'knowledge-page' && documentId && isPage) {
      requests.push({ type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber: page as number });
    } else if (item.type === 'knowledge-selection' && documentId && isPage) {
      const { charStart, charEnd, selectedText } = item;
      if (typeof charStart === 'number' && Number.isInteger(charStart) && charStart >= 0
        && typeof charEnd === 'number' && Number.isInteger(charEnd) && charEnd > charStart
        && typeof selectedText === 'string' && selectedText.length > 0) {
        // The stored slice is re-verified against the live page on this turn;
        // it is a claim carried forward, never accepted as text.
        requests.push({
          type: 'knowledge-selection',
          knowledgeDocumentId: documentId,
          pageNumber: page as number,
          charStart,
          charEnd,
          selectedText,
        });
      }
    } else if (item.type === 'padlet' && padletId) {
      requests.push({ type: 'padlet', padletId });
    }
  }
  return requests;
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
  for (const block of blocks) {
    if (kept.length >= BOARD_AI_CONTEXT_MAX_ITEMS) break;
    const text = block.text.length > BOARD_AI_CONTEXT_MAX_SINGLE_CHARS
      ? `${block.text.slice(0, BOARD_AI_CONTEXT_MAX_SINGLE_CHARS - 1)}…`
      : block.text;
    if (kept.length > 0 && characters + text.length > BOARD_AI_CONTEXT_MAX_TOTAL_CHARS) break;
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
  const requests = boardAiContextRequestsFromStored(value);
  if (requests.length === 0) return null;
  const stored = (value as { items?: unknown[] }).items ?? [];
  const items: BoardAiContextItem[] = requests.map((request, index) => {
    const raw = (stored[index] ?? {}) as Record<string, unknown>;
    const label = typeof raw.label === 'string' ? boardAiContextLabel(raw.label) : undefined;
    const excerpt = typeof raw.excerpt === 'string' ? boardAiContextExcerpt(raw.excerpt) : undefined;
    return {
      type: request.type,
      ...('knowledgeDocumentId' in request ? { knowledgeDocumentId: request.knowledgeDocumentId } : {}),
      ...('pageNumber' in request ? { pageNumber: request.pageNumber } : {}),
      ...('padletId' in request ? { padletId: request.padletId } : {}),
      ...('charStart' in request ? { charStart: request.charStart } : {}),
      ...('charEnd' in request ? { charEnd: request.charEnd } : {}),
      ...('selectedText' in request ? { selectedText: boardAiContextExcerpt(request.selectedText) } : {}),
      ...(label ? { label } : {}),
      ...(excerpt ? { excerpt } : {}),
    };
  });
  return { version: BOARD_AI_CONTEXT_VERSION, items };
}
