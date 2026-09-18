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

/**
 * Everything a user can ATTACH -- which is every context type except a board
 * search.
 *
 * A search is not an attachment: the user does not pick a source, they turn on
 * a toggle, and the server decides what it finds. Excluding it here is what
 * keeps the composer's four slots meaning "things you chose", and it makes the
 * payload switch below exhaustive by construction rather than by a default case
 * that would silently accept a shape this path cannot send.
 */
export type BoardAiDraftContextRequest = Exclude<BoardAiContextRequestItem, { type: 'board-search' }>;

/**
 * Why an attachment cannot be used YET, or ever.
 *
 * Absent means usable -- which is every attachment that comes from a source the
 * user was already reading, because those were ready long before they were
 * picked. Only a freshly uploaded document arrives unusable.
 *
 * It is a STATE, not a boolean, because ingestion has two ways of not being
 * ready and they need different words: 'pending' resolves itself, 'failed'
 * never will. A boolean would have made a permanently broken upload look like
 * it was still working.
 */
export type BoardAiDraftReadiness = 'pending' | 'failed';

export interface BoardAiDraftContextItem {
  /** Exactly what gets posted. Identity and provenance, nothing else. */
  readonly request: BoardAiDraftContextRequest;
  /** Local display only: the source's name as this browser already knew it. */
  readonly label: string;
  /** Local display only: a page number, or a short quote from a selection. */
  readonly detail?: string;
  /**
   * Local display and SEND GATING only. Never posted -- see the payload
   * builder, which rebuilds each item field by field.
   *
   * This exists because a just-uploaded PDF has no extracted text yet, and
   * every reader filters on `processing_status = 'ready'`. Sending it would
   * attach a source with nothing in it: the server would honestly answer from
   * an empty document, and the user would read a confident answer about a file
   * the model never saw. That is the failure this field prevents, and it is the
   * same shape as the other silent ones found this week -- a real reply, drawn
   * from less than the user believes it had.
   */
  readonly readiness?: BoardAiDraftReadiness;
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

/**
 * The attachments that are not usable yet, or never will be.
 *
 * The composer asks this rather than reading `readiness` itself, so "what
 * blocks a send" has exactly one definition. An empty result is the normal
 * case: nothing blocks unless something was uploaded moments ago.
 */
export function blockingBoardAiDraftContext(
  items: readonly BoardAiDraftContextItem[],
): readonly BoardAiDraftContextItem[] {
  return items.filter((item) => item.readiness !== undefined);
}

/**
 * Records what the server now says about an uploaded document.
 *
 * Takes the processing status verbatim rather than a boolean, because the
 * caller is relaying the server's word and must not be in the business of
 * interpreting it twice. Anything that is not a recognised in-progress or
 * failed state is treated as usable, which matches every reader: 'ready' is the
 * only status they accept, and an unknown one is not a reason to keep a chip
 * spinning forever.
 */
export function withBoardAiDraftReadiness(
  items: readonly BoardAiDraftContextItem[],
  knowledgeDocumentId: string,
  processingStatus: string,
): readonly BoardAiDraftContextItem[] {
  const readiness = boardAiDraftReadinessFor(processingStatus);
  let changed = false;
  const next = items.map((item) => {
    const request = item.request;
    // `padlet` and `padlet-image` name a card, not a document, so they never
    // match -- the narrowing is what says so rather than a type assertion.
    if (!('knowledgeDocumentId' in request) || request.knowledgeDocumentId !== knowledgeDocumentId) {
      return item;
    }
    if (item.readiness === readiness) return item;
    changed = true;
    // Rebuilt rather than mutated, and `readiness` is dropped entirely when the
    // document is usable so the common case carries no field at all.
    const { readiness: _previous, ...rest } = item;
    return readiness === undefined ? rest : { ...rest, readiness };
  });
  // THE SAME ARRAY WHEN NOTHING MOVED, and that is load-bearing rather than
  // tidy. A poller asks this on a timer and re-renders when the answer differs;
  // a map() that always allocates would differ every time, and the composer
  // would re-render -- and re-poll -- in a loop for as long as a document was
  // pending. Identity IS the "did anything change" signal.
  return changed ? next : items;
}

/** 'ready' is the only usable status; 'failed' is terminal; the rest are waiting. */
export function boardAiDraftReadinessFor(processingStatus: string): BoardAiDraftReadiness | undefined {
  if (processingStatus === 'ready') return undefined;
  if (processingStatus === 'failed') return 'failed';
  if (processingStatus === 'uploaded' || processingStatus === 'processing') return 'pending';
  // An unrecognised status is not a reason to block forever. The send will be
  // refused by the server if the document genuinely has no text.
  return undefined;
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
        case 'padlet-image':
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
  /**
   * True only for a validated PDF-area crop, computed by the caller.
   *
   * A boolean rather than the metadata itself, because this module may not
   * reach into canvas components or re-implement a parser. The caller runs
   * `parseKnowledgePdfAreaProvenance` -- the same function the image route uses
   * as its authorisation gate -- so client and server agree on what a crop is
   * by sharing the parser, not by both guessing from a type string.
   *
   * It is only a HINT about what to offer. The server re-parses the card's real
   * metadata on every turn and refuses anything that is not genuinely a crop,
   * so a browser setting this on an ordinary image buys nothing.
   */
  readonly isKnowledgePdfArea?: boolean;
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
      detail: 'text only',
    };
  }
  // A PDF-area crop attaches as an IMAGE, and is checked BEFORE the text-type
  // gate below. Its padlet type is 'image', which that gate rejects -- which is
  // exactly why a crop used to fall through to "nothing Board AI can use". The
  // crop is not an exception to that rule; it is a different kind of source,
  // whose substance is pixels rather than `content`.
  if (item.isKnowledgePdfArea) {
    const cropTitle = item.title?.trim();
    return {
      request: { type: 'padlet-image', padletId: item.id },
      label: cropTitle && cropTitle.length > 0 ? cropTitle : 'PDF area',
      detail: 'Image',
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

/**
 * `processingStatus` is optional because most callers attach a document the
 * user was already reading, which was ready long before they picked it. Only
 * the upload path knows otherwise, and it passes what the server just said.
 */
export function boardAiDraftFromDocument(
  knowledgeDocumentId: string,
  originalFilename: string,
  processingStatus?: string,
): BoardAiDraftContextItem {
  const readiness = processingStatus === undefined
    ? undefined
    : boardAiDraftReadinessFor(processingStatus);
  return {
    request: { type: 'knowledge-document', knowledgeDocumentId },
    label: originalFilename.trim().length > 0 ? originalFilename : 'PDF',
    detail: 'text only',
    ...(readiness === undefined ? {} : { readiness }),
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
    // A page attaches as TEXT. Its pictures do not travel -- only an area crop
    // does, through the `padlet-image` request above. Said on the chip because
    // a user who asks about a figure on the page otherwise reads the model's
    // honest "I have no image" as a failure.
    detail: `p. ${pageNumber} · text only`,
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
