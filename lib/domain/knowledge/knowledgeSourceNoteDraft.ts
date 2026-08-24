import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';

/**
 * P6J-F5: one Knowledge source page, as the reader surface sees it. Deliberately
 * browser-safe -- no React, no Supabase, no fetch, no node builtins -- so the
 * Knowledge modal, the canvas controller and the tests all agree on one shape.
 */
export interface KnowledgeSourcePageRequest {
  readonly sourceDocumentId: string;
  readonly originalFilename: string;
  readonly pageNumber: number;
  readonly pageText: string;
}

/**
 * Transient provenance carried alongside a not-yet-created Note. It holds only
 * the four fields F4-B accepts from a client: quoteHash is server-computed, and
 * char offsets and locator stay unwritable until highlight capture exists.
 */
export interface KnowledgeSourceReferenceDraft {
  readonly sourceDocumentId: string;
  readonly pageStart: number;
  readonly pageEnd: number;
  readonly quoteText: string | null;
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
  return {
    title: request.originalFilename.length > 0 ? request.originalFilename : 'New Note',
    // Always blank: a source-created Note is an ordinary Note the user writes
    // themselves. The page text is evidence, not authorship, and lives only in
    // source_references.
    content: '',
    sourceReference: {
      sourceDocumentId: request.sourceDocumentId,
      pageStart: request.pageNumber,
      pageEnd: request.pageNumber,
      quoteText: quoteFromPageText(request.pageText),
    },
  };
}
