"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ExternalLink, FileText, PanelRight } from 'lucide-react';
import KnowledgeDocumentPageImage from '@/components/collabboard/KnowledgeDocumentPageImage';
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
  const showPreview = isReady && displayMode !== 'compact';

  return (
    <div className="select-none space-y-1.5" data-knowledge-pdf-surface="true" data-knowledge-document-id={documentId}>
      <div className="flex items-center gap-1.5">
        <FileText className="h-3.5 w-3.5 shrink-0 text-red-500" aria-hidden="true" />
        <span className="truncate text-[11px] font-medium text-gray-700" title={originalFilename}>
          {originalFilename}
        </span>
      </div>

      {showPreview ? (
        <div className="overflow-hidden rounded border border-gray-200 bg-white">
          {/* The ONE raster authority: authenticated same-origin route, worker
              output, safe failure. No Storage client, no signed URL. */}
          <KnowledgeDocumentPageImage
            boardId={boardId}
            documentId={documentId}
            pageNumber={1}
            originalFilename={originalFilename}
          />
        </div>
      ) : null}

      <div
        data-knowledge-pdf-status={status}
        className={`text-[10px] leading-none ${status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}
      >
        {STATUS_LABEL[status]}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {openDocument ? (
          <>
            <button
              type="button"
              data-knowledge-pdf-action="open"
              title="Open"
              aria-label="Open"
              className="rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
              onClick={(event) => { event.stopPropagation(); open(); }}
            >
              Open
            </button>
            {/* PDF-C1: deliberately the SAME reader as Open. One side-panel
                state machine, not two. */}
            <button
              type="button"
              data-knowledge-pdf-action="side-panel"
              title="Add to side panel"
              aria-label="Add to side panel"
              className="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
              onClick={(event) => { event.stopPropagation(); open(); }}
            >
              <PanelRight className="h-2.5 w-2.5" aria-hidden="true" />
              Side panel
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
            className="inline-flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-50"
            onClick={(event) => event.stopPropagation()}
          >
            <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
            New tab
          </a>
        ) : null}
      </div>
    </div>
  );
}
