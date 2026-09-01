"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, ExternalLink, FileText, Maximize2, PanelRight, Type } from 'lucide-react';
import KnowledgeDocumentPageImage from '@/components/collabboard/KnowledgeDocumentPageImage';
import type { KnowledgeDocumentDetailPage } from '@/components/collabboard/KnowledgeDocumentDetails';
import {
  listKnowledgePdfs,
  type KnowledgePdfProcessingStatus,
} from '@/components/collabboard/KnowledgePdfUploader';

/**
 * PDF-C1 -- the ONE canvas rendering of a Knowledge document placement.
 *
 * The board post is a REFERENCE. This component owns no PDF bytes, no page
 * text and no Storage authority: it knows a board id, a document id and a
 * status, and it delegates every heavier job to the system that already owns
 * it -- KnowledgeDocumentPageImage for the page raster, the shell-level
 * reader for reading, the existing `/original` route for the raw file.
 *
 * Presentation is a separate axis from identity. `displayMode` chooses how the
 * SAME document reference is drawn, which is why adding 'expanded' later is a
 * rendering change here and not a change to what a placement is. PDF-C1
 * deliberately implements only compact and preview.
 */

export type KnowledgePdfDisplayMode = 'compact' | 'preview' | 'expanded';

export interface KnowledgePdfOpenRequest {
  readonly documentId: string;
  readonly pageNumber?: number;
}

/**
 * Board-level capability carried by context rather than props, for exactly the
 * reason KnowledgeSourceReferenceContext states: PostCardContent has eleven
 * call sites, most of them in layout hosts this phase must not touch. A
 * surface rendered outside the provider simply has no Open affordance, which
 * is the same inert result as a board that never wired one.
 */
const KnowledgePdfOpenContext = createContext<((request: KnowledgePdfOpenRequest) => void) | null>(null);

/**
 * R1-B. The SAME transport, for the reverse direction: a surface that learns a
 * terminal status reports it to the board, which owns the durable write. The
 * surface never touches persistence itself, and both hosts (common card and
 * Freeform) therefore share one status contract rather than two.
 */
export type KnowledgePdfStatusReporter = (
  documentId: string,
  status: KnowledgePdfProcessingStatus,
) => void;

const KnowledgePdfStatusContext = createContext<KnowledgePdfStatusReporter | null>(null);

export function KnowledgePdfOpenProvider({
  onOpenDocument,
  onStatusResolved = null,
  children,
}: {
  onOpenDocument: ((request: KnowledgePdfOpenRequest) => void) | null;
  /** Optional so a host without durable posts stays inert, as before. */
  onStatusResolved?: KnowledgePdfStatusReporter | null;
  children: React.ReactNode;
}) {
  return (
    <KnowledgePdfOpenContext.Provider value={onOpenDocument}>
      <KnowledgePdfStatusContext.Provider value={onStatusResolved}>
        {children}
      </KnowledgePdfStatusContext.Provider>
    </KnowledgePdfOpenContext.Provider>
  );
}

export function useKnowledgePdfOpen() {
  return useContext(KnowledgePdfOpenContext);
}

export function useKnowledgePdfStatusReporter() {
  return useContext(KnowledgePdfStatusContext);
}

/** Reads a placement off any padlet-shaped value. Identity is the id alone. */
export function readKnowledgePdfPlacement(padlet: unknown): {
  documentId: string;
  originalFilename: string;
  processingStatus: KnowledgePdfProcessingStatus;
  displayMode: KnowledgePdfDisplayMode;
} | null {
  const metadata = (padlet as { metadata?: Record<string, unknown> } | null)?.metadata;
  const documentId = metadata?.knowledgeDocumentId;
  if (typeof documentId !== 'string' || documentId.trim().length === 0) return null;
  const status = metadata?.knowledgeProcessingStatus;
  const mode = metadata?.knowledgeDisplayMode;
  return {
    documentId,
    originalFilename: typeof metadata?.knowledgeOriginalFilename === 'string'
      ? metadata.knowledgeOriginalFilename
      : 'PDF',
    processingStatus: status === 'processing' || status === 'ready' || status === 'failed'
      ? status
      : 'uploaded',
    // 'expanded' is accepted from storage but PDF-C1 draws it as preview.
    displayMode: mode === 'compact' || mode === 'preview' || mode === 'expanded' ? mode : 'preview',
  };
}

/** Truthful backend state only. No percentage is derived from polls or time. */
const STATUS_LABEL: Record<KnowledgePdfProcessingStatus, string> = {
  uploaded: 'Uploading…', processing: 'Processing…', ready: 'Ready', failed: 'Processing failed',
};
const TERMINAL = (status: KnowledgePdfProcessingStatus) => status === 'ready' || status === 'failed';

export interface KnowledgePdfCanvasSurfaceProps {
  readonly boardId: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly processingStatus: KnowledgePdfProcessingStatus;
  readonly displayMode?: KnowledgePdfDisplayMode;
  readonly onStatusResolved?: (status: KnowledgePdfProcessingStatus) => void;
}

export default function KnowledgePdfCanvasSurface({
  boardId,
  documentId,
  originalFilename,
  processingStatus,
  displayMode = 'preview',
  onStatusResolved,
}: KnowledgePdfCanvasSurfaceProps) {
  const openDocument = useKnowledgePdfOpen();
  const reportStatus = useKnowledgePdfStatusReporter();
  const [status, setStatus] = useState<KnowledgePdfProcessingStatus>(processingStatus);

  useEffect(() => setStatus(processingStatus), [processingStatus]);

  /**
   * A board reopened while a document was still processing has a stale
   * placement. Converge against the existing list authority and stop for good
   * on a terminal state -- a Ready document never polls.
   */
  useEffect(() => {
    if (TERMINAL(status) || !boardId) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const documents = await listKnowledgePdfs(boardId);
        const found = documents.find((item) => item.id === documentId);
        if (cancelled || !found || !TERMINAL(found.processingStatus)) return;
        setStatus(found.processingStatus);
        // Exactly once per resolution: this runs only while `status` is
        // non-terminal, and setStatus re-runs the effect straight into the
        // terminal early-return above, so the interval is gone before a second
        // tick. `cancelled` additionally blocks any report after unmount.
        onStatusResolved?.(found.processingStatus);
        reportStatus?.(documentId, found.processingStatus);
      } catch {
        // Status is optional enhancement; a failed poll leaves the last state.
      }
    }, 4000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [boardId, documentId, status, onStatusResolved, reportStatus]);

  const open = useCallback(() => {
    openDocument?.({ documentId });
  }, [openDocument, documentId]);

  const isReady = status === 'ready';

  /**
   * Card-local view state. NEITHER is persisted: collapsing a card or switching
   * to parsed text changes nothing on the board, writes no padlet metadata and
   * issues no request. That is deliberate -- it keeps both controls usable by a
   * read-only viewer without inventing a permission rule for them, and it is
   * why this surface still performs no mutation of any kind.
   */
  const [collapsed, setCollapsed] = useState(false);
  const [view, setView] = useState<'page' | 'text'>('page');

  /**
   * The canonical page text, from the SAME endpoint the reader uses. Fetched
   * once per ready document and only while expanded, so a collapsed card costs
   * nothing. It serves two jobs: the parsed-content view, and the per-page
   * fallback whenever a page has no rendered image.
   */
  const [pages, setPages] = useState<readonly KnowledgeDocumentDetailPage[] | null>(null);
  const [pagesFailed, setPagesFailed] = useState(false);
  const [imagelessPages, setImagelessPages] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    if (!isReady || collapsed || pages || pagesFailed || !boardId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/pages`,
        );
        const payload = await response.json().catch(() => null) as { pages?: unknown } | null;
        if (!response.ok || !payload || !Array.isArray(payload.pages)) throw new Error('pages unavailable');
        if (!cancelled) setPages(payload.pages as readonly KnowledgeDocumentDetailPage[]);
      } catch {
        // Text is enhancement over the status the card already shows truthfully.
        if (!cancelled) setPagesFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isReady, collapsed, pages, pagesFailed, boardId, documentId]);

  const markImageless = useCallback((pageNumber: number) => {
    setImagelessPages((current) => {
      if (current.has(pageNumber)) return current;
      const next = new Set(current);
      next.add(pageNumber);
      return next;
    });
  }, []);

  /**
   * Loading is deliberately NOT a percentage.
   *
   * The reference design shows a faint number, but the only page-load authority
   * this client has is a single all-or-nothing `/pages` request, and page
   * images load lazily -- an off-screen page never settles, so "loaded of
   * total" would stall short of 100 and never clear. A number derived from
   * elapsed time or poll count would be invented. So the truthful narrow form
   * is a non-numeric state that disappears the moment content is available.
   */
  const documentLoading = isReady && !collapsed && !pages && !pagesFailed;

  const snippet = pages?.find((page) => page.text.trim().length > 0)?.text.trim().slice(0, 90) ?? null;

  const headerButton = 'inline-flex h-5 w-5 items-center justify-center rounded text-gray-500 '
    + 'hover:bg-gray-200 hover:text-gray-700 focus-visible:outline focus-visible:outline-1';

  return (
    <div
      /* One frame only: the Freeform host already draws the card's border and
         background, so this surface contributes neither. Square corners are
         deliberate -- a radius here would read as a second nested card. */
      className="flex h-full flex-col overflow-hidden rounded-none bg-white"
      data-knowledge-pdf-surface="true"
      data-knowledge-document-id={documentId}
      data-knowledge-pdf-collapsed={collapsed ? 'true' : 'false'}
    >
      {/*
        Permanent header. Never hover-revealed and never drawn over the page:
        the controls have their own band, so nothing ever covers the document.
        This strip is also the card's drag handle -- the body below stops
        pointer events so scrolling a long PDF cannot move the card.
      */}
      <div
        data-knowledge-pdf-header="true"
        className="flex select-none items-center gap-1 border-b border-gray-200 bg-gray-100 px-1.5 py-1"
      >
        <button
          type="button"
          data-knowledge-pdf-action="collapse"
          title={collapsed ? 'Expand' : 'Collapse'}
          aria-label={collapsed ? 'Expand' : 'Collapse'}
          aria-expanded={!collapsed}
          className={headerButton}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); setCollapsed((value) => !value); }}
        >
          {collapsed
            ? <ChevronRight className="h-3 w-3" aria-hidden="true" />
            : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
        </button>

        <FileText className="h-3 w-3 shrink-0 text-red-500" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-gray-700" title={originalFilename}>
          {originalFilename}
        </span>

        {documentLoading ? (
          <span data-knowledge-pdf-loading="true" className="shrink-0 text-[9px] italic text-gray-400">
            Loading…
          </span>
        ) : null}

        <span
          data-knowledge-pdf-status={status}
          className={`shrink-0 text-[9px] ${status === 'failed' ? 'text-red-600' : 'text-gray-400'}`}
        >
          {STATUS_LABEL[status]}
        </span>

        {isReady ? (
          <button
            type="button"
            data-knowledge-pdf-action="parsed-content"
            data-knowledge-pdf-view={view}
            title={view === 'page' ? 'Show parsed content' : 'Show pages'}
            aria-label={view === 'page' ? 'Show parsed content' : 'Show pages'}
            aria-pressed={view === 'text'}
            className={headerButton}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setView((value) => (value === 'page' ? 'text' : 'page'));
            }}
          >
            <Type className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : null}

        {openDocument ? (
          <>
            <button
              type="button"
              data-knowledge-pdf-action="open"
              title="Open"
              aria-label="Open"
              className={headerButton}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); open(); }}
            >
              <Maximize2 className="h-3 w-3" aria-hidden="true" />
            </button>
            {/* PDF-C1: deliberately the SAME reader as Open. One side-panel
                state machine, not two. */}
            <button
              type="button"
              data-knowledge-pdf-action="side-panel"
              title="Add to side panel"
              aria-label="Add to side panel"
              className={headerButton}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => { event.stopPropagation(); open(); }}
            >
              <PanelRight className="h-3 w-3" aria-hidden="true" />
            </button>
          </>
        ) : null}

        {isReady ? (
          <a
            data-knowledge-pdf-action="new-tab"
            title="Open in new tab"
            aria-label="Open in new tab"
            href={`/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/original`}
            target="_blank"
            rel="noopener noreferrer"
            className={headerButton}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        ) : null}
      </div>

      {collapsed ? (
        <div data-knowledge-pdf-collapsed-body="true" className="min-w-0 px-2 py-1.5">
          <div className="truncate text-[10px] text-gray-600">{originalFilename}</div>
          {snippet ? (
            <div data-knowledge-pdf-snippet="true" className="truncate text-[9px] text-gray-400">
              {snippet}
            </div>
          ) : null}
        </div>
      ) : (
        /*
          The document itself, and the only scrolling region. Wheel and pointer
          events stop here so a long PDF scrolls in place instead of panning the
          canvas or dragging the card -- the header above stays the drag handle.
        */
        <div
          data-knowledge-pdf-body="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-1.5 py-1.5"
          onWheel={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          {!isReady ? (
            <div className="px-1 py-2 text-[10px] text-gray-500">{STATUS_LABEL[status]}</div>
          ) : documentLoading ? (
            <div className="px-1 py-2 text-[10px] italic text-gray-400">Loading document…</div>
          ) : pages && pages.length > 0 ? (
            pages.map((page) => (
              <section
                key={page.pageNumber}
                data-knowledge-pdf-page={page.pageNumber}
                className="mb-1.5 border-b border-gray-100 pb-1.5 last:mb-0 last:border-b-0 last:pb-0"
              >
                <div className="mb-0.5 select-none text-[8px] uppercase tracking-wider text-gray-400">
                  Page {page.pageNumber}
                </div>
                {view === 'page' && !imagelessPages.has(page.pageNumber) ? (
                  <KnowledgeDocumentPageImage
                    boardId={boardId}
                    documentId={documentId}
                    pageNumber={page.pageNumber}
                    originalFilename={originalFilename}
                    widthPoints={page.widthPoints}
                    heightPoints={page.heightPoints}
                    rotation={page.rotation}
                    onUnavailable={() => markImageless(page.pageNumber)}
                  />
                ) : null}
                {view === 'text' || imagelessPages.has(page.pageNumber) ? (
                  <p
                    data-knowledge-pdf-page-text="true"
                    className="whitespace-pre-wrap break-words text-[9px] leading-snug text-gray-700"
                  >
                    {page.text}
                  </p>
                ) : null}
              </section>
            ))
          ) : (
            <div className="px-1 py-2 text-[10px] text-gray-500">
              Page content is not available for this document.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
