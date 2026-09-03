/**
 * Board AI Chat -- what the composer is holding before a message is sent.
 *
 * A DRAFT item is two things kept deliberately apart: the identity that will
 * travel to the server, and a label the browser drew for the user. Only the
 * first is ever sent. The second exists so a chip can say "A2.pdf · p. 6"
 * without the client ever claiming to know what page 6 says -- D1 reads that
 * for itself, on the server, on every turn.
 *
 * Nothing here authorizes anything. A draft is a request the user has queued;
 * whether it is allowed is decided by the route, and a draft that names a
 * source the user cannot read simply fails on send.
 */

import {
  BOARD_AI_CONTEXT_MAX_ITEMS,
  boardAiContextIdentityKey,
  type BoardAiContextRequestItem,
} from './boardAiChatContext';

/** The composer holds the same number of attachments the route accepts. */
export const BOARD_AI_DRAFT_CONTEXT_MAX = BOARD_AI_CONTEXT_MAX_ITEMS;

/** How much of a selection a chip may quote. Display only, never authority. */
export const BOARD_AI_DRAFT_PREVIEW_MAX = 60;

export interface BoardAiDraftContextItem {
  /** Exactly what gets posted. Identity and provenance, nothing else. */
  readonly request: BoardAiContextRequestItem;
  /** Local display only: the source's name as this browser already knew it. */
  readonly label: string;
  /** Local display only: a page number, or a short quote from a selection. */
  readonly detail?: string;
}

/** Two drafts are the same attachment when they name the same source. */
export function boardAiDraftKey(item: BoardAiDraftContextItem): string {
  return boardAiContextIdentityKey(item.request);
}

export type BoardAiDraftAddOutcome = 'added' | 'duplicate' | 'full';

export interface BoardAiDraftAddResult {
  readonly items: readonly BoardAiDraftContextItem[];
  readonly outcome: BoardAiDraftAddOutcome;
}

/**
 * Adds one attachment, or explains why it did not.
 *
 * Both refusals are silent-failure risks, so each has its own outcome the UI
 * can speak to: attaching the same page twice should not look broken, and
 * hitting the ceiling must never quietly replace something the user chose.
 */
export function addBoardAiDraftContext(
  current: readonly BoardAiDraftContextItem[],
  next: BoardAiDraftContextItem,
): BoardAiDraftAddResult {
  const key = boardAiDraftKey(next);
  if (current.some((item) => boardAiDraftKey(item) === key)) {
    return { items: current, outcome: 'duplicate' };
  }
  if (current.length >= BOARD_AI_DRAFT_CONTEXT_MAX) {
    return { items: current, outcome: 'full' };
  }
  return { items: [...current, next], outcome: 'added' };
}

export function removeBoardAiDraftContext(
  current: readonly BoardAiDraftContextItem[],
  key: string,
): readonly BoardAiDraftContextItem[] {
  return current.filter((item) => boardAiDraftKey(item) !== key);
}

/**
 * The request body's `context`, or nothing at all.
 *
 * This is the ONE place a draft becomes a payload, and it deliberately
 * rebuilds each item field by field rather than spreading it. A spread would
 * carry `label` and `detail` along the moment someone added a field to the
 * draft type, and the server would reject the request -- or worse, a later
 * contract change would start accepting a title the browser invented.
 */
export function boardAiDraftContextPayload(
  items: readonly BoardAiDraftContextItem[],
): { readonly items: readonly BoardAiContextRequestItem[] } | undefined {
  if (items.length === 0) return undefined;
  return {
    items: items.map((item) => {
      const request = item.request;
      switch (request.type) {
        case 'knowledge-document':
          return { type: request.type, knowledgeDocumentId: request.knowledgeDocumentId };
        case 'knowledge-page':
          return {
            type: request.type,
            knowledgeDocumentId: request.knowledgeDocumentId,
            pageNumber: request.pageNumber,
          };
        case 'knowledge-selection':
          return {
            type: request.type,
            knowledgeDocumentId: request.knowledgeDocumentId,
            pageNumber: request.pageNumber,
            charStart: request.charStart,
            charEnd: request.charEnd,
            selectedText: request.selectedText,
          };
        case 'padlet':
          return { type: request.type, padletId: request.padletId };
      }
    }),
  };
}

/* ------------------------------------------------------------------ */
/* Building drafts from the surfaces that own the identities           */
/* ------------------------------------------------------------------ */

/** The board post types Board AI can use, matching the D1 resolver exactly. */
const ATTACHABLE_POST_TYPES = new Set(['text', 'note']);

/**
 * The minimum a board object must tell us to be attachable. Deliberately
 * primitives: this file may not reach into canvas components, and a caller
 * that already owns a Padlet can read these off it.
 */
export interface BoardAiAttachableBoardItem {
  readonly id: string;
  readonly type: string;
  readonly title?: string | null;
  /** Present only on a PDF placement, read by the canvas's own helper. */
  readonly knowledgeDocumentId?: string | null;
  readonly knowledgeOriginalFilename?: string | null;
}

/**
 * One selected board object as a draft, or null when it has nothing Board AI
 * can honestly use.
 *
 * A PDF placement attaches its DOCUMENT, not the card: the card is a placement
 * whose own `content` says nothing. Everything else must be a post type whose
 * text genuinely lives in `content` -- the D1 correction removed `card` and
 * `todo` for exactly that reason, so offering them here would promise
 * something the server will refuse.
 */
export function boardAiDraftFromBoardItem(
  item: BoardAiAttachableBoardItem,
): BoardAiDraftContextItem | null {
  const documentId = typeof item.knowledgeDocumentId === 'string' ? item.knowledgeDocumentId.trim() : '';
  if (documentId.length > 0) {
    const filename = item.knowledgeOriginalFilename?.trim();
    return {
      request: { type: 'knowledge-document', knowledgeDocumentId: documentId },
      label: filename && filename.length > 0 ? filename : 'PDF',
      detail: 'Document',
    };
  }
  if (!ATTACHABLE_POST_TYPES.has(item.type)) return null;
  const title = item.title?.trim();
  return {
    request: { type: 'padlet', padletId: item.id },
    label: title && title.length > 0 ? title : 'Note',
    detail: 'Note',
  };
}

export function boardAiDraftFromDocument(
  knowledgeDocumentId: string,
  originalFilename: string,
): BoardAiDraftContextItem {
  return {
    request: { type: 'knowledge-document', knowledgeDocumentId },
    label: originalFilename.trim().length > 0 ? originalFilename : 'PDF',
    detail: 'Document',
  };
}

export function boardAiDraftFromPage(
  knowledgeDocumentId: string,
  originalFilename: string,
  pageNumber: number,
): BoardAiDraftContextItem {
  return {
    request: { type: 'knowledge-page', knowledgeDocumentId, pageNumber },
    label: originalFilename.trim().length > 0 ? originalFilename : 'PDF',
    detail: `p. ${pageNumber}`,
  };
}

/**
 * A draft from an exact selection the reader ALREADY proved.
 *
 * The offsets and the text are passed straight through, unmodified: they are
 * the reader's own re-verified span, and the server slices its stored page and
 * compares against them. Returns null on an incomplete span rather than
 * repairing one, because a repaired selection is not the one the user made --
 * and the server would refuse it anyway.
 */
export function boardAiDraftFromSelection(
  knowledgeDocumentId: string,
  originalFilename: string,
  selection: {
    readonly pageNumber: number;
    readonly charStart: number;
    readonly charEnd: number;
    readonly selectedText: string;
  },
): BoardAiDraftContextItem | null {
  const { pageNumber, charStart, charEnd, selectedText } = selection;
  if (!Number.isInteger(pageNumber) || pageNumber < 1) return null;
  if (!Number.isInteger(charStart) || charStart < 0) return null;
  if (!Number.isInteger(charEnd) || charEnd <= charStart) return null;
  if (typeof selectedText !== 'string' || selectedText.length === 0) return null;
  const preview = selectedText.replace(/\s+/g, ' ').trim();
  return {
    request: { type: 'knowledge-selection', knowledgeDocumentId, pageNumber, charStart, charEnd, selectedText },
    label: originalFilename.trim().length > 0 ? originalFilename : 'PDF',
    detail: `p. ${pageNumber} · “${
      preview.length > BOARD_AI_DRAFT_PREVIEW_MAX
        ? `${preview.slice(0, BOARD_AI_DRAFT_PREVIEW_MAX - 1)}…`
        : preview
    }”`,
  };
}
