import type {
  KnowledgeSourcePageRequest,
  KnowledgeSourceTextSelection,
} from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from '@/lib/domain/knowledge/knowledgeSourceReferenceWrite';

/**
 * PDF-C1 Text -- the reader's exact-span selection contract, extracted so a
 * SECOND surface can obey it instead of re-deriving it.
 *
 * Moved here verbatim from KnowledgeDocumentDetails, which now imports it:
 * same coordinate space, same refusals, same request shape. Nothing was
 * relaxed in the move, because the server repeats every one of these
 * comparisons against its own stored page and a surface that disagreed with
 * the reader would simply have its writes rejected.
 *
 * Deliberately NOT in lib/domain: this reads a live DOM Range. It stays free
 * of React, Supabase, fetch and node builtins, so both callers -- the reader
 * and the canvas card -- can use it unchanged.
 */

/**
 * The minimum a page must be for these functions. Structural on purpose: the
 * reader's `KnowledgeDocumentDetailPage` and the canvas card's cached pages
 * both satisfy it, and neither module has to import the other to say so.
 */
export interface KnowledgeSelectablePage {
  readonly pageNumber: number;
  readonly text: string;
}

/** Marks the one element whose text is the exact-span coordinate space. */
export const PAGE_TEXT_ROOT = 'data-knowledge-page-text-root';

/**
 * P6J-F6-B4-B2B. One page's captured browser selection, already proved against
 * that page's canonical text. Transient UI state only: it is never persisted,
 * never put in the URL, never sent to Supabase, and never highlight geometry.
 */
export type CapturedPageSelection = KnowledgeSourceTextSelection & { readonly pageNumber: number };

export function pageTextRootOf(node: Node | null, container: HTMLElement): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const root = element?.closest(`[${PAGE_TEXT_ROOT}]`) ?? null;
  // Inside this surface, and inside a page paragraph -- headings, labels,
  // buttons and backlink rows are not part of any coordinate space.
  return root instanceof HTMLElement && container.contains(root) ? root : null;
}

/**
 * Maps a DOM Range onto page-relative UTF-16 offsets, and refuses anything it
 * cannot prove.
 *
 * The local search renderer splits a page across plain text nodes and <mark>
 * elements, so Range.startOffset/endOffset are NODE-local and meaningless as
 * page coordinates. Measuring a range that begins at the paragraph's own start
 * is what makes the result page-relative, and `String.length` is UTF-16 by
 * definition -- a surrogate pair counts as the two units the server indexes by.
 */
export function captureExactSelection(
  container: HTMLElement | null,
  pages: readonly KnowledgeSelectablePage[],
): CapturedPageSelection | null {
  if (!container) return null;
  const selection = typeof window === 'undefined' ? null : window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  // Always ordered start-to-end, so a backwards drag yields the same range.
  const range = selection.getRangeAt(0);
  if (range.collapsed) return null;

  // BOTH endpoints must sit in the SAME page. A cross-page or partly-outside
  // selection is not an exact span and is never salvaged into one.
  const root = pageTextRootOf(range.startContainer, container);
  if (root === null || pageTextRootOf(range.endContainer, container) !== root) return null;

  const pageNumber = Number(root.getAttribute(PAGE_TEXT_ROOT));
  const page = pages.find((candidate) => candidate.pageNumber === pageNumber);
  if (!page) return null;
  // Fail closed if anything visible was injected into the paragraph: the
  // offsets below index this exact string and nothing else.
  if (root.textContent !== page.text) return null;

  const measure = root.ownerDocument.createRange();
  measure.selectNodeContents(root);
  measure.setEnd(range.startContainer, range.startOffset);
  const charStart = measure.toString().length;
  // Defensive, not a fix: `setEnd` moves `start` only when the new end precedes
  // it, and this range always starts at the paragraph while both boundaries lie
  // inside it -- so the hazard cannot arise here. Re-anchoring keeps the two
  // measurements independent of each other regardless.
  measure.selectNodeContents(root);
  measure.setEnd(range.endContainer, range.endOffset);
  const charEnd = measure.toString().length;
  const selectedText = range.toString();

  // Half-open [start, end), inside the page, and not empty.
  if (charStart < 0 || charStart >= charEnd || charEnd > page.text.length) return null;
  // Refused here rather than sent and rejected: the server caps the quote too.
  if (selectedText.length > MAX_SOURCE_REFERENCE_QUOTE_LENGTH) return null;
  // The check that matters. The coordinates must already describe exactly what
  // the user selected, with no trimming or normalisation on either side --
  // the server repeats this comparison against its own stored page.
  if (page.text.slice(charStart, charEnd) !== selectedText) return null;
  return { pageNumber, charStart, charEnd, selectedText };
}

/**
 * PDF Source AI Phase 1. The ONE builder for an exact-selection request,
 * shared by Note Post and the AI activation button so the two can never
 * drift into two different request shapes for the same captured selection.
 *
 * PDF-C1 Text: and now by the canvas card, for the same reason.
 */
export function buildSelectionSourceRequest(
  documentId: string,
  originalFilename: string,
  pages: readonly KnowledgeSelectablePage[],
  selection: CapturedPageSelection,
  topStripColor: string | null,
): KnowledgeSourcePageRequest {
  return {
    sourceDocumentId: documentId,
    originalFilename,
    pageNumber: selection.pageNumber,
    pageText: pages.find((page) => page.pageNumber === selection.pageNumber)?.text ?? '',
    selection: {
      charStart: selection.charStart,
      charEnd: selection.charEnd,
      selectedText: selection.selectedText,
    },
    topStripColor,
  };
}
