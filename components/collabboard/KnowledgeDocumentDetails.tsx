"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type {
  KnowledgeSourcePageRequest,
  KnowledgeSourceTextSelection,
} from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from '@/lib/domain/knowledge/knowledgeSourceReferenceWrite';
import { useKnowledgeSourceBacklinksForDocument } from '@/components/collabboard/KnowledgeSourceReferenceContext';
import {
  knowledgeSourceBacklinkDocumentRows,
  knowledgeSourceBacklinkPageRows,
} from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import type { KnowledgeSourceBacklinkRow } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';

export interface KnowledgeDocumentDetailPage {
  pageNumber: number;
  text: string;
}

export interface KnowledgeDocumentDetailsProps {
  /**
   * Optional only so the pre-F5 render tests still compile; the live list
   * always supplies it. The Create Note action fails closed without it rather
   * than emitting a request with no real source identity.
   */
  documentId?: string;
  originalFilename: string;
  pageCount: number | null;
  pages: readonly KnowledgeDocumentDetailPage[];
  loading: boolean;
  error: boolean;
  onBack: () => void;
  /**
   * Absent for readers who cannot create posts on this board. The action is
   * then not rendered at all rather than rendered disabled -- the same
   * capability the canvas toolbar itself is gated on decides this.
   */
  onCreateNoteFromPage?: (request: KnowledgeSourcePageRequest) => void;
  /**
   * P6J-F6-B2. Page-level navigation only -- scroll the page into view once,
   * when the reader was opened from a Note's source. No highlight, no
   * geometry, no char offsets.
   */
  initialPageNumber?: number;
  /**
   * P6J-F6-B3N. Asks the canvas to open one citing Note, by padlet id. Absent
   * outside a canvas, which is what keeps the rows non-interactive there.
   */
  onOpenBacklinkTarget?: (targetPadletId: string) => void;
}

type TextMatch = { pageIndex: number; start: number; end: number };

/**
 * P6J-F6-B4-B2B. One page's captured browser selection, already proved against
 * that page's canonical text. Transient UI state only: it is never persisted,
 * never put in the URL, never sent to Supabase, and never highlight geometry.
 */
type CapturedPageSelection = KnowledgeSourceTextSelection & { readonly pageNumber: number };

/** Marks the one element whose text is the exact-span coordinate space. */
const PAGE_TEXT_ROOT = 'data-knowledge-page-text-root';

function pageTextRootOf(node: Node | null, container: HTMLElement): HTMLElement | null {
  const element = node instanceof Element ? node : node?.parentElement ?? null;
  const root = element?.closest(`[${PAGE_TEXT_ROOT}]`) ?? null;
  // Inside this reader, and inside a page paragraph -- headings, labels,
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
function captureExactSelection(
  container: HTMLElement | null,
  pages: readonly KnowledgeDocumentDetailPage[],
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
  // Re-anchored at the paragraph start: both offsets are measured from there.
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
 * A source opened from a semantic result arrives with no pageCount, so counting
 * the not-yet-loaded pages would claim "0 pages" about a document we simply have
 * not read yet. Absent knowledge is rendered as no claim at all.
 */
function pageCountSummary(pageCount: number | null, pageLength: number, loading: boolean): string | null {
  if (pageCount !== null) return pageCount === 1 ? '1 page' : `${pageCount} pages`;
  if (loading || pageLength === 0) return null;
  return pageLength === 1 ? '1 page' : `${pageLength} pages`;
}

function findMatches(pages: readonly KnowledgeDocumentDetailPage[], query: string): TextMatch[] {
  const needle = query.toLowerCase();
  if (!needle) return [];
  return pages.flatMap((page, pageIndex) => {
    const source = page.text.toLowerCase();
    const matches: TextMatch[] = [];
    let offset = 0;
    while (offset < source.length) {
      const start = source.indexOf(needle, offset);
      if (start < 0) break;
      matches.push({ pageIndex, start, end: start + needle.length });
      offset = start + needle.length;
    }
    return matches;
  });
}

function highlightedText(
  text: string,
  pageIndex: number,
  pageMatches: readonly TextMatch[],
  activeMatch: TextMatch | undefined,
  activeRef: React.MutableRefObject<HTMLElement | null>,
) {
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  pageMatches.forEach((match) => {
    if (match.start > cursor) nodes.push(<React.Fragment key={`text-${cursor}`}>{text.slice(cursor, match.start)}</React.Fragment>);
    const active = match === activeMatch;
    nodes.push(
      <mark
        key={`match-${match.start}`}
        ref={active ? activeRef : undefined}
        data-active-match={active ? 'true' : undefined}
        className={active ? 'rounded bg-blue-300 text-gray-900 ring-2 ring-blue-500' : 'rounded bg-yellow-200 text-gray-900'}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  });
  if (cursor < text.length) nodes.push(<React.Fragment key={`text-${cursor}`}>{text.slice(cursor)}</React.Fragment>);
  return nodes;
}

/**
 * P6J-F6-B3 reverse provenance, made navigable by B3N.
 *
 * A row is a real button only where the surface was handed a navigation
 * callback; without one it stays B3's plain text, so a reader mounted outside
 * a canvas never offers an action that cannot work. Either way the target id
 * rides on the row as a data attribute -- the visible text is never looked up.
 */
function UsedInNotes({ scope, rows, onOpen }: {
  scope: 'document' | 'page';
  rows: readonly KnowledgeSourceBacklinkRow[];
  onOpen?: (targetPadletId: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <div data-knowledge-used-in-notes={scope} className="mt-1">
      <p className="text-[11px] font-medium text-gray-500">Used in Notes · {rows.length}</p>
      <ul className="mt-0.5 space-y-0.5">
        {rows.map((row) => (
          <li key={row.targetPadletId} data-knowledge-backlink-target={row.targetPadletId} className="min-w-0">
            {onOpen ? (
              <button
                type="button"
                // The id, never the row's text: two Notes can read identically.
                onClick={() => onOpen(row.targetPadletId)}
                title={row.displayText}
                className="block w-full cursor-pointer truncate rounded pl-2 text-left text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300"
              >
                {row.displayText}
              </button>
            ) : (
              <span className="block truncate pl-2 text-[11px] text-gray-600" title={row.displayText}>
                {row.displayText}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function KnowledgeDocumentDetails({
  documentId,
  originalFilename,
  pageCount,
  pages,
  loading,
  error,
  onBack,
  onCreateNoteFromPage,
  initialPageNumber,
  onOpenBacklinkTarget,
}: KnowledgeDocumentDetailsProps) {
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const [capturedSelection, setCapturedSelection] = useState<CapturedPageSelection | null>(null);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  const pagesContainerRef = useRef<HTMLDivElement | null>(null);
  // The source page is scrolled to once per request. Re-running it on every
  // render would fight the search-match scroll below, which stays authoritative
  // for whatever the reader is doing after arrival.
  const scrolledToPageRef = useRef<number | null>(null);
  const matches = useMemo(() => findMatches(pages, query), [pages, query]);
  const pageSummary = pageCountSummary(pageCount, pages.length, loading);
  // Identity is the document id, never the filename: two documents may share a
  // filename, and a name-keyed lookup would attribute one's Notes to the other.
  // Read from the board index CanvasClient owns -- no request of its own.
  const documentBacklinks = useKnowledgeSourceBacklinksForDocument(documentId);
  const documentRows = useMemo(
    () => knowledgeSourceBacklinkDocumentRows(documentBacklinks),
    [documentBacklinks],
  );

  /**
   * Re-proved against the CURRENT page text on every render, so replaced or
   * refreshed page data can never emit coordinates mapped against text that is
   * no longer on screen. Staleness degrades to "no selection", never to a wrong
   * span.
   */
  const activeSelection = useMemo(() => {
    if (capturedSelection === null) return null;
    const page = pages.find((candidate) => candidate.pageNumber === capturedSelection.pageNumber);
    if (!page) return null;
    const stillExact = page.text.slice(capturedSelection.charStart, capturedSelection.charEnd)
      === capturedSelection.selectedText;
    return stillExact ? capturedSelection : null;
  }, [capturedSelection, pages]);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query]);

  // A different document is a different coordinate space entirely.
  useEffect(() => {
    setCapturedSelection(null);
  }, [documentId]);

  useEffect(() => {
    activeMatchRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeMatchIndex, matches]);

  // A different request resets the latch so the same page can be targeted again.
  useEffect(() => {
    scrolledToPageRef.current = null;
  }, [initialPageNumber]);

  useEffect(() => {
    // Integer-only, which is both a correctness check and what keeps the
    // selector below free of anything that needs escaping.
    if (initialPageNumber === undefined || !Number.isInteger(initialPageNumber)) return;
    if (loading || pages.length === 0) return;
    if (scrolledToPageRef.current === initialPageNumber) return;
    // An active search is the more specific intent; let its own scroll win.
    if (matches.length > 0) return;
    const target = pagesContainerRef.current?.querySelector(
      `[data-page-number="${initialPageNumber}"]`,
    );
    // A page the document does not have simply leaves the reader where it
    // opened -- never an error, never a jump to an unrelated page.
    scrolledToPageRef.current = initialPageNumber;
    if (target instanceof HTMLElement) target.scrollIntoView?.({ block: 'start' });
  }, [initialPageNumber, loading, pages, matches.length]);

  /**
   * The selection is captured when the user finishes making it, NOT when they
   * click the action: a click's own mousedown collapses the browser selection,
   * so reading it in the click handler would find nothing. Buttons are excluded
   * for the same reason -- mouseup runs before click, and consuming the
   * selection there would clear it exactly when the action is about to use it.
   */
  const handleSelectionSettled = (event: React.SyntheticEvent) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    setCapturedSelection(captureExactSelection(pagesContainerRef.current, pages));
  };

  const moveMatch = (delta: number) => {
    if (matches.length === 0) return;
    setActiveMatchIndex((current) => (current + delta + matches.length) % matches.length);
  };

  return (
    <div className="min-w-0">
      <button
        type="button"
        className="mb-3 text-xs font-medium text-blue-700 hover:text-blue-900"
        onClick={onBack}
      >
        ← Back to PDFs
      </button>
      <div className="mb-3 border-b border-gray-100 pb-2">
        <h2 className="truncate text-sm font-medium text-gray-800" title={originalFilename}>
          {originalFilename}
        </h2>
        {pageSummary !== null ? (
          <p className="text-[11px] text-gray-500">{pageSummary}</p>
        ) : null}
        <UsedInNotes scope="document" rows={documentRows} onOpen={onOpenBacklinkTarget} />
      </div>

      <div className="mb-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          placeholder="Search in this PDF…"
          aria-label="Search in this PDF"
          className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
        />
        {query ? (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
            <span>{matches.length === 0 ? 'No matches' : `${matches.length} ${matches.length === 1 ? 'match' : 'matches'}`}</span>
            {matches.length > 1 ? (
              <>
                <button type="button" className="underline hover:text-gray-900" onClick={() => moveMatch(-1)}>Previous</button>
                <button type="button" className="underline hover:text-gray-900" onClick={() => moveMatch(1)}>Next</button>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {loading ? (
        <p className="text-[11px] text-gray-500">Loading extracted text…</p>
      ) : error ? (
        <p className="text-[11px] text-gray-500">Extracted text unavailable.</p>
      ) : pages.length === 0 ? (
        <p className="text-[11px] text-gray-500">No extracted text available.</p>
      ) : (
        <div
          ref={pagesContainerRef}
          onMouseUp={handleSelectionSettled}
          onKeyUp={handleSelectionSettled}
          className="max-h-[60vh] space-y-4 overflow-y-auto pr-1"
        >
          {pages.map((page, pageIndex) => {
            // Only the page the selection actually lives on offers the exact
            // action; every other page keeps its ordinary one.
            const pageSelection = activeSelection?.pageNumber === page.pageNumber ? activeSelection : null;
            return (
            <section key={page.pageNumber} data-page-number={page.pageNumber}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[11px] font-semibold text-gray-500">Page {page.pageNumber}</h3>
                  {/* Citations covering THIS page (pageStart <= n <= pageEnd). */}
                  <UsedInNotes
                    scope="page"
                    rows={knowledgeSourceBacklinkPageRows(documentBacklinks, page.pageNumber)}
                    onOpen={onOpenBacklinkTarget}
                  />
                </div>
                {onCreateNoteFromPage && documentId ? (
                  <button
                    type="button"
                    aria-label={pageSelection
                      ? `Create Note from selection on page ${page.pageNumber}`
                      : `Create Note from page ${page.pageNumber}`}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    onClick={() => onCreateNoteFromPage({
                      // The document's real identity, never its filename.
                      sourceDocumentId: documentId,
                      originalFilename,
                      pageNumber: page.pageNumber,
                      pageText: page.text,
                      // Read from validated state, never from the browser here.
                      selection: pageSelection === null ? null : {
                        charStart: pageSelection.charStart,
                        charEnd: pageSelection.charEnd,
                        selectedText: pageSelection.selectedText,
                      },
                    })}
                  >
                    {pageSelection ? 'Create Note from selection' : 'Create Note'}
                  </button>
                ) : null}
              </div>
              <p
                {...{ [PAGE_TEXT_ROOT]: page.pageNumber }}
                className="select-text whitespace-pre-wrap text-xs leading-5 text-gray-700"
              >
                {highlightedText(page.text, pageIndex, matches.filter((match) => match.pageIndex === pageIndex), matches[activeMatchIndex], activeMatchRef)}
              </p>
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
