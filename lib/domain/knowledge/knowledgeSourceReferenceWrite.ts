import { domainError } from '../core/errors';
import type { DomainError } from '../core/errors';
import type { Result } from '../core/result';
import { err, ok } from '../core/result';
import type { BoardId, KnowledgeDocumentId, PostId, UserId } from '../core/ids';
import type { SourceReference } from './knowledgePersistence';

/** UTF-16 code units, matching `String.prototype.length`. */
export const MAX_SOURCE_REFERENCE_QUOTE_LENGTH = 100_000;

export interface CreateKnowledgeSourceReferenceInput {
  readonly boardId: BoardId;
  readonly userId: UserId;
  readonly targetPadletId: PostId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageStart: number;
  readonly pageEnd: number;
  /** Page-only snapshot quote. Must be null for an exact span. */
  readonly quoteText: string | null;
  /**
   * B4-B2A exact-span coordinates: page-relative, UTF-16 code units, half-open
   * [start, end), matching the B4-B1 read contract. Both null selects the
   * page-only mode every pre-B4 caller uses.
   */
  readonly charStart: number | null;
  readonly charEnd: number | null;
  /**
   * What the client believes it selected. VERIFICATION ONLY -- it is compared
   * against the server's own slice and then discarded. It is never stored, and
   * it never becomes the canonical quote.
   */
  readonly selectedText: string | null;
}

export interface KnowledgeSourceReferenceSourceDocument {
  readonly boardId: BoardId;
  readonly pageCount: number | null;
  readonly processingStatus: string;
}

export interface KnowledgeSourceReferenceTargetPadlet {
  readonly boardId: BoardId;
}

/**
 * The insert payload carries offsets from B4-B2A onward, but still no locator:
 * highlight geometry remains unwritable. `selectedText` is absent by design --
 * it is validation evidence and must stop before persistence.
 */
export interface KnowledgeSourceReferenceInsert {
  readonly targetPadletId: PostId;
  readonly sourceDocumentId: KnowledgeDocumentId;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly quoteHash: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
}

export interface KnowledgeSourceReferenceBoardWriteAuthorizer {
  canWriteBoard(boardId: BoardId, userId: UserId): Promise<Result<boolean, DomainError>>;
}

export interface KnowledgeSourceReferenceValidationRepository {
  findSourceDocument(
    id: KnowledgeDocumentId,
    boardId: BoardId,
  ): Promise<Result<KnowledgeSourceReferenceSourceDocument | null, DomainError>>;
  findTargetPadlet(
    id: PostId,
    boardId: BoardId,
  ): Promise<Result<KnowledgeSourceReferenceTargetPadlet | null, DomainError>>;
  /**
   * The stored text of one page, which is the ONLY authority on what an exact
   * span quotes. Read solely for exact spans, and only after the document has
   * been proven to belong to the authorized board.
   */
  findPageText(
    documentId: KnowledgeDocumentId,
    pageNumber: number,
  ): Promise<Result<string | null, DomainError>>;
}

export interface KnowledgeSourceReferenceWriter {
  insertSourceReference(
    row: KnowledgeSourceReferenceInsert,
  ): Promise<Result<SourceReference, DomainError>>;
}

export interface KnowledgeQuoteHasher {
  hashQuoteText(text: string): string;
}

export interface CreateKnowledgeSourceReferenceDependencies {
  readonly authorizer: KnowledgeSourceReferenceBoardWriteAuthorizer;
  readonly repository: KnowledgeSourceReferenceValidationRepository;
  readonly writer: KnowledgeSourceReferenceWriter;
  readonly hasher: KnowledgeQuoteHasher;
}

/**
 * Exactly two shapes are writable. Offsets arrive as a pair or not at all: a
 * half-pair is a malformed request, never a page-only row and never recovered.
 */
type SpanMode =
  | { readonly kind: 'page_only' }
  | { readonly kind: 'exact_span'; readonly charStart: number; readonly charEnd: number };

function classifyMode(input: CreateKnowledgeSourceReferenceInput): SpanMode | null {
  const { charStart, charEnd } = input;
  if (charStart === null && charEnd === null) return { kind: 'page_only' };
  if (charStart === null || charEnd === null) return null;
  return { kind: 'exact_span', charStart, charEnd };
}

function validatePageOnly(input: CreateKnowledgeSourceReferenceInput): DomainError | null {
  if (input.selectedText !== null) {
    // Selected text without offsets is a confused client, not a page-only save.
    return domainError('validation', 'Source reference selected text requires char offsets');
  }
  if (input.quoteText !== null) {
    // The quote is evidence: an empty snapshot proves nothing, and trimming it
    // would break the byte-for-byte correspondence with its hash.
    if (typeof input.quoteText !== 'string' || input.quoteText.length === 0) {
      return domainError('validation', 'Source reference quote must not be empty');
    }
    if (input.quoteText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) {
      return domainError('validation', 'Source reference quote is too long');
    }
  }
  return null;
}

/**
 * Everything checkable without the stored page. The upper bound needs the
 * canonical text and is therefore enforced later, against that text alone.
 */
function validateExactSpan(
  input: CreateKnowledgeSourceReferenceInput,
  mode: { readonly charStart: number; readonly charEnd: number },
): DomainError | null {
  if (input.quoteText !== null) {
    return domainError('validation', 'Exact source spans derive their quote from the stored page');
  }
  if (typeof input.selectedText !== 'string' || input.selectedText.length === 0) {
    return domainError('validation', 'Exact source spans require the selected text');
  }
  if (input.selectedText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) {
    return domainError('validation', 'Source reference quote is too long');
  }
  if (input.pageStart !== input.pageEnd) {
    return domainError('validation', 'An exact source span must not cross pages');
  }
  if (!Number.isInteger(mode.charStart) || !Number.isInteger(mode.charEnd)) {
    return domainError('validation', 'Source reference char offsets must be integers');
  }
  // Half-open [start, end): an empty span is not a selection.
  if (mode.charStart < 0 || mode.charStart >= mode.charEnd) {
    return domainError('validation', 'Source reference char offsets must be a non-empty range');
  }
  return null;
}

function validateInput(
  input: CreateKnowledgeSourceReferenceInput,
  mode: SpanMode,
): DomainError | null {
  if (!Number.isInteger(input.pageStart) || input.pageStart < 1) {
    return domainError('validation', 'Source reference page start must be a positive integer');
  }
  if (!Number.isInteger(input.pageEnd) || input.pageEnd < input.pageStart) {
    return domainError('validation', 'Source reference page end must not precede page start');
  }
  return mode.kind === 'page_only' ? validatePageOnly(input) : validateExactSpan(input, mode);
}

/**
 * Page-level citation write. Every check runs before the insert, and the board
 * is re-derived from the stored document and padlet rather than trusted from
 * the caller, so a cross-board pairing cannot be fabricated even by a client
 * that supplies a consistent-looking boardId.
 */
export function createCreateKnowledgeSourceReferenceCommand(
  dependencies: CreateKnowledgeSourceReferenceDependencies,
) {
  return async function createKnowledgeSourceReference(
    input: CreateKnowledgeSourceReferenceInput,
  ): Promise<Result<SourceReference, DomainError>> {
    const mode = classifyMode(input);
    if (mode === null) {
      return err(domainError('validation', 'Source reference char offsets must be supplied together'));
    }
    const invalid = validateInput(input, mode);
    if (invalid) return err(invalid);

    const authorized = await dependencies.authorizer.canWriteBoard(input.boardId, input.userId);
    if (!authorized.ok) return authorized;
    if (!authorized.value) {
      return err(domainError('permission_denied', 'You cannot add sources to this board'));
    }

    const document = await dependencies.repository.findSourceDocument(input.sourceDocumentId, input.boardId);
    if (!document.ok) return document;
    if (document.value === null) {
      return err(domainError('not_found', 'Source document was not found on this board'));
    }
    if (document.value.boardId !== input.boardId) {
      return err(domainError('validation', 'Source document belongs to another board'));
    }
    if (document.value.processingStatus !== 'ready') {
      return err(domainError('validation', 'Source document is not ready'));
    }
    if (document.value.pageCount === null) {
      return err(domainError('validation', 'Source document page count is unknown'));
    }
    if (input.pageEnd > document.value.pageCount) {
      return err(domainError('validation', 'Source reference page range exceeds the document'));
    }

    const padlet = await dependencies.repository.findTargetPadlet(input.targetPadletId, input.boardId);
    if (!padlet.ok) return padlet;
    if (padlet.value === null) {
      return err(domainError('not_found', 'Target post was not found on this board'));
    }
    if (padlet.value.boardId !== input.boardId) {
      return err(domainError('validation', 'Target post belongs to another board'));
    }

    if (mode.kind === 'page_only') {
      return dependencies.writer.insertSourceReference({
        targetPadletId: input.targetPadletId,
        sourceDocumentId: input.sourceDocumentId,
        pageStart: input.pageStart,
        pageEnd: input.pageEnd,
        quoteText: input.quoteText,
        // Never read from the caller: the hash must describe the stored snapshot.
        quoteHash: input.quoteText === null ? null : dependencies.hasher.hashQuoteText(input.quoteText),
        charStart: null,
        charEnd: null,
      });
    }

    // Exact span. The stored page is the only authority on what was quoted, so
    // it is read here -- after authorization and after both the document and
    // the target have been proven to sit on this board, never before.
    const page = await dependencies.repository.findPageText(input.sourceDocumentId, input.pageStart);
    if (!page.ok) return page;
    if (page.value === null) {
      return err(domainError('not_found', 'Source page was not found on this document'));
    }

    const pageText = page.value;
    // UTF-16 code units, the same measure `slice` uses on the next line.
    if (mode.charEnd > pageText.length) {
      return err(domainError('validation', 'Source reference char offsets exceed the page'));
    }

    const canonicalQuote = pageText.slice(mode.charStart, mode.charEnd);
    if (canonicalQuote.length === 0) {
      return err(domainError('validation', 'Source reference quote must not be empty'));
    }
    if (canonicalQuote.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) {
      return err(domainError('validation', 'Source reference quote is too long'));
    }
    // The client's string only answers "did we select the same characters?".
    // It is compared, never copied: what gets stored is the server's own slice.
    if (input.selectedText !== canonicalQuote) {
      return err(domainError('validation', 'Selected text does not match the stored source text'));
    }

    return dependencies.writer.insertSourceReference({
      targetPadletId: input.targetPadletId,
      sourceDocumentId: input.sourceDocumentId,
      pageStart: input.pageStart,
      pageEnd: input.pageEnd,
      quoteText: canonicalQuote,
      quoteHash: dependencies.hasher.hashQuoteText(canonicalQuote),
      charStart: mode.charStart,
      charEnd: mode.charEnd,
    });
  };
}
