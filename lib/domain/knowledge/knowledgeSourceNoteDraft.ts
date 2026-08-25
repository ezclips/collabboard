import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';

/**
 * P6J-F5: one Knowledge source page, as the reader surface sees it. Deliberately
 * browser-safe -- no React, no Supabase, no fetch, no node builtins -- so the
 * Knowledge modal, the canvas controller and the tests all agree on one shape.
 */
/**
 * P6J-F6-B4-B2B. One exact selection inside ONE page, in the coordinate system
 * B4-B1 read and B4-B2A writes: page-relative, UTF-16 code units, half-open
 * [charStart, charEnd). The three fields travel together as one object so a
 * half-specified pair -- which the server rejects outright -- cannot be built.
 *
 * `selectedText` is verification evidence, never the stored quote: the server
 * re-derives the canonical text from its own page and compares.
 */
export interface KnowledgeSourceTextSelection {
  readonly charStart: number;
  readonly charEnd: number;
  readonly selectedText: string;
}

export interface KnowledgeSourcePageRequest {
  readonly sourceDocumentId: string;
  readonly originalFilename: string;
  readonly pageNumber: number;
  readonly pageText: string;
  /**
   * Absent or null means the reader captured no valid exact selection, which is
   * the page-only behaviour every pre-B4 caller already has.
   */
  readonly selection?: KnowledgeSourceTextSelection | null;
}

/**
 * Transient provenance carried alongside a not-yet-created Note. Offsets and
 * their selected text joined the client-supplied set at B4-B2A; quoteHash is
 * still server-computed and locator is still unwritable.
 */
export interface KnowledgeSourceReferenceDraft {
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
  readonly charStart: number | null;
  readonly charEnd: number | null;
  readonly selectedText: string | null;
}

export interface KnowledgeSourceNoteDraft {
  readonly title: string;
  readonly content: string;
  readonly sourceReference: KnowledgeSourceReferenceDraft;
}

/**
 * A page longer than the domain limit yields no quote at all rather than a
 * truncated one: a partial snapshot would hash to something that describes text
 * nobody ever read. Absent evidence beats wrong evidence, and the page range
 * still records exactly where the Note came from.
 */
function quoteFromPageText(pageText: string): string | null {
  if (pageText.length === 0) return null;
  if (pageText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;
  // Never trimmed or normalised -- the quote must match its server-side hash byte for byte.
  return pageText;
}

export function buildKnowledgeSourceNoteDraft(
  request: KnowledgeSourcePageRequest,
): KnowledgeSourceNoteDraft {
  // Exactly two shapes, chosen by one test, so an exact span can never carry a
  // page quote and a page-only draft can never carry half an offset pair.
  const selection = request.selection ?? null;
  return {
    title: request.originalFilename.length > 0 ? request.originalFilename : 'New Note',
    // Always blank: a source-created Note is an ordinary Note the user writes
    // themselves. The page text is evidence, not authorship, and lives only in
    // source_references. An exact selection is evidence too -- it is not
    // pasted into the body either.
    content: '',
    sourceReference: {
      sourceDocumentId: request.sourceDocumentId,
      pageStart: request.pageNumber,
      pageEnd: request.pageNumber,
      // An exact span sends no client quote at all: the server derives the
      // canonical one by slicing its own stored page.
      quoteText: selection === null ? quoteFromPageText(request.pageText) : null,
      // Forwarded verbatim. The reader already proved these coordinates against
      // the rendered page; re-deriving them here would be a second coordinate
      // algorithm, and trimming would break the server's exact comparison.
      charStart: selection === null ? null : selection.charStart,
      charEnd: selection === null ? null : selection.charEnd,
      selectedText: selection === null ? null : selection.selectedText,
    },
  };
}
