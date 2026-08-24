"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { KnowledgeSourcePageRequest } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';

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
}

type TextMatch = { pageIndex: number; start: number; end: number };

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

export default function KnowledgeDocumentDetails({
  documentId,
  originalFilename,
  pageCount,
  pages,
  loading,
  error,
  onBack,
  onCreateNoteFromPage,
}: KnowledgeDocumentDetailsProps) {
  const [query, setQuery] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);
  const activeMatchRef = useRef<HTMLElement | null>(null);
  const matches = useMemo(() => findMatches(pages, query), [pages, query]);
  const pageSummary = pageCountSummary(pageCount, pages.length, loading);

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query]);

  useEffect(() => {
    activeMatchRef.current?.scrollIntoView?.({ block: 'nearest' });
  }, [activeMatchIndex, matches]);

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
        <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
          {pages.map((page, pageIndex) => (
            <section key={page.pageNumber}>
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <h3 className="text-[11px] font-semibold text-gray-500">Page {page.pageNumber}</h3>
                {onCreateNoteFromPage && documentId ? (
                  <button
                    type="button"
                    aria-label={`Create Note from page ${page.pageNumber}`}
                    className="shrink-0 rounded border border-gray-200 px-1.5 py-0.5 text-[11px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    onClick={() => onCreateNoteFromPage({
                      // The document's real identity, never its filename.
                      sourceDocumentId: documentId,
                      originalFilename,
                      pageNumber: page.pageNumber,
                      pageText: page.text,
                    })}
                  >
                    Create Note
                  </button>
                ) : null}
              </div>
              <p className="select-text whitespace-pre-wrap text-xs leading-5 text-gray-700">
                {highlightedText(page.text, pageIndex, matches.filter((match) => match.pageIndex === pageIndex), matches[activeMatchIndex], activeMatchRef)}
              </p>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
