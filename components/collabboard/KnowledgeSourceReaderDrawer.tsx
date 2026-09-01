"use client";

import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import KnowledgeDocumentDetails, {
  UsedInNotes,
  pageCountSummary,
  type KnowledgeDocumentDetailPage,
} from '@/components/collabboard/KnowledgeDocumentDetails';
import { useKnowledgeSourceBacklinksForDocument } from '@/components/collabboard/KnowledgeSourceReferenceContext';
import { knowledgeSourceBacklinkDocumentRows } from '@/lib/domain/knowledge/knowledgeSourceBacklinks';
import KnowledgeSourceNotesPanel from '@/components/collabboard/KnowledgeSourceNotesPanel';
import KnowledgeSourceAIPanel from '@/components/collabboard/KnowledgeSourceAIPanel';
import type { KnowledgeSourcePageRequest } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';
import type {
  KnowledgeDocumentOpenRequest,
  KnowledgeSourceOpenRequest,
} from '@/lib/domain/knowledge/knowledgeSourceNavigation';

/**
 * P6J-F7-B1 -- the board-adjacent Knowledge reader.
 *
 * Mounted as a CanvasClient shell-level sibling, NOT under CanvasSidebar. The
 * sidebar lives in a `z-[3000]` stacking context, which confines everything it
 * renders -- the old modal's own `z-[1000]` included -- above the editor tier.
 * From there no reader can coexist with an open Note editor no matter what
 * z-index it asks for. This drawer sits in the root stacking context at
 * `z-[1200]`: above the editor tier (1000) and below the toolbar (3000).
 *
 * It owns reader presentation and the page fetch, and nothing else. Span
 * resolution, canonical text, provenance and every write stay exactly where
 * B4 left them: this file renders KnowledgeDocumentDetails unchanged and
 * forwards its callbacks verbatim.
 */

/** The library modal's own marker. Read ONLY to yield Escape to it. */
const KNOWLEDGE_LIBRARY_SELECTOR = '[data-knowledge-documents="true"]';

/**
 * How long the reader will wait out a still-extracting document before it
 * reports the source unavailable. Bounded on both sides deliberately: long
 * enough to cover the normal extraction window, short enough that a document
 * which never becomes readable stops spinning and says so.
 */
const READER_PAGES_RETRY_LIMIT = 12;
const READER_PAGES_RETRY_DELAY_MS = 2000;

export interface KnowledgeSourceReaderDrawerProps {
  /**
   * A Note asking for its exact citation. Handled at most once per requestId,
   * so a re-render -- or a toolbar collapse -- never replays the last source.
   */
  sourceOpenRequest?: KnowledgeSourceOpenRequest | null;
  /** A library or semantic-result pick. Same once-per-requestId contract. */
  documentOpenRequest?: KnowledgeDocumentOpenRequest | null;
  /**
   * Forwarded verbatim for an ordinary Note Post. PDF Source AI Phase 1 adds
   * the optional second argument ONLY for the AI panel's own Note Post -- the
   * canvas still owns placement and every write; this only lets it seed the
   * new Note's initial body with the AI result instead of the raw selection.
   */
  onCreateNoteFromPage?: (request: KnowledgeSourcePageRequest, options?: { initialContentText?: string }) => void;
  /**
   * Forwarded verbatim, and deliberately WITHOUT closing this drawer: reading
   * the source beside the Note it supports is the whole point of F7. The old
   * modal had to close first only because it painted over the editor.
   */
  onOpenBacklinkTarget?: (targetPadletId: string) => void;
}

/**
 * The citation an arriving Note asked for, carried only as far as the reader.
 * `requestId` travels with it because a second click on the same source is a
 * genuinely new intent, not a repeat of a handled one.
 */
interface KnowledgeSourceTarget {
  readonly referenceId: string;
  readonly requestId: number;
}

interface KnowledgeReaderState {
  documentId: string;
  originalFilename: string;
  pageCount: number | null;
  pages: readonly KnowledgeDocumentDetailPage[];
  loading: boolean;
  error: boolean;
  /** Navigation state only -- never written back to source_references. */
  initialPageNumber?: number;
  /** Null for every library and semantic-result open, so neither inherits one. */
  sourceTarget: KnowledgeSourceTarget | null;
  /**
   * PDF Source AI Phase 1. An IMMUTABLE snapshot of the exact selection that
   * activated AI, taken once at click time -- later DOM/selection changes in
   * the source pane can never retarget it. Always starts null on a fresh
   * `KnowledgeReaderState`, which is what invalidates any prior AI session for
   * free on both a document switch and a reader close: neither carries this
   * object over, they build a brand new one.
   */
  aiSession: KnowledgeSourceAiSession | null;
}

/** PDF Source AI Phase 1. `requestId` distinguishes activation B from A even
 * when both snapshot the exact same page/selection coordinates. */
interface KnowledgeSourceAiSession {
  readonly requestId: number;
  readonly request: KnowledgeSourcePageRequest;
}

/**
 * The document's own response is the authority on its display metadata: the
 * pages endpoint returns filename and page count, so opening by id alone is
 * fully supported. Identity is never taken from the payload -- the id we asked
 * for is the id we show.
 */
function documentMetadata(value: unknown): { originalFilename: string; pageCount: number | null } {
  if (!value || typeof value !== 'object') return { originalFilename: '', pageCount: null };
  const record = value as Record<string, unknown>;
  return {
    originalFilename: typeof record.originalFilename === 'string' ? record.originalFilename : '',
    pageCount: typeof record.pageCount === 'number' && Number.isInteger(record.pageCount) && record.pageCount > 0
      ? record.pageCount
      : null,
  };
}

function isDetailPage(value: unknown): value is KnowledgeDocumentDetailPage {
  return !!value
    && typeof value === 'object'
    && typeof (value as KnowledgeDocumentDetailPage).pageNumber === 'number'
    && typeof (value as KnowledgeDocumentDetailPage).text === 'string';
}

export default function KnowledgeSourceReaderDrawer({
  sourceOpenRequest = null,
  documentOpenRequest = null,
  onCreateNoteFromPage,
  onOpenBacklinkTarget,
}: KnowledgeSourceReaderDrawerProps) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const [reader, setReader] = useState<KnowledgeReaderState | null>(null);
  // Each request is acted on at most once, and the latch has the same lifetime
  // as this permanently-mounted drawer. That pairing is the fix for the old
  // replay: the latch used to unmount with the toolbar while CanvasClient kept
  // holding the request, so re-expanding the toolbar reopened the last source.
  const handledSourceRequestRef = useRef<number | null>(null);
  const handledDocumentRequestRef = useRef<number | null>(null);
  // Two rapid picks are a race; only the newest read may commit.
  const readGenerationRef = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const isOpen = reader !== null;

  /**
   * Opens a source by DOCUMENT ID. Identity is the id and only the id: two
   * documents can share a filename, so a name-based lookup would open the
   * wrong one.
   */
  const openDocumentById = async (
    documentId: string,
    initialPageNumber?: number,
    // Defaulted rather than optional at the call site: a library pick must
    // arrive with no exact target, and forgetting it would inherit one.
    sourceTarget: KnowledgeSourceTarget | null = null,
  ) => {
    if (!boardId) return;
    const generation = ++readGenerationRef.current;
    setReader({
      documentId, originalFilename: '', pageCount: null, pages: [],
      loading: true, error: false, initialPageNumber, sourceTarget, aiSession: null,
    });
    // A 409 means extraction has not finished, which is a normal state for a
    // freshly uploaded document -- not a failure. Treating it as one is what
    // used to strand the reader on "Extracted text unavailable" (and, because
    // the metadata never arrived, on the filename fallback) until it was
    // closed and reopened. The generation check is the cancellation: a newer
    // pick, or a close, retires this loop at every await boundary.
    for (let attempt = 0; attempt <= READER_PAGES_RETRY_LIMIT; attempt += 1) {
      try {
        const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/pages`);
        if (generation !== readGenerationRef.current) return;
        if (response.status === 409 && attempt < READER_PAGES_RETRY_LIMIT) {
          await new Promise((resolve) => { window.setTimeout(resolve, READER_PAGES_RETRY_DELAY_MS); });
          if (generation !== readGenerationRef.current) return;
          continue;
        }
        const payload = await response.json().catch(() => null) as { pages?: unknown; document?: unknown } | null;
        if (!response.ok || !payload || !Array.isArray(payload.pages)) throw new Error('details unavailable');
        if (generation !== readGenerationRef.current) return;
        setReader({
          documentId,
          ...documentMetadata(payload.document),
          pages: payload.pages.filter(isDetailPage),
          loading: false, error: false, initialPageNumber, sourceTarget, aiSession: null,
        });
        return;
      } catch {
        if (generation !== readGenerationRef.current) return;
        setReader((current) => (current?.documentId === documentId
          ? { ...current, loading: false, error: true }
          : current));
        return;
      }
    }
  };

  useEffect(() => {
    if (!boardId || !sourceOpenRequest) return;
    if (handledSourceRequestRef.current === sourceOpenRequest.requestId) return;
    handledSourceRequestRef.current = sourceOpenRequest.requestId;
    void openDocumentById(sourceOpenRequest.sourceDocumentId, sourceOpenRequest.pageStart, {
      referenceId: sourceOpenRequest.sourceReferenceId,
      requestId: sourceOpenRequest.requestId,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, sourceOpenRequest]);

  useEffect(() => {
    if (!boardId || !documentOpenRequest) return;
    if (handledDocumentRequestRef.current === documentOpenRequest.requestId) return;
    handledDocumentRequestRef.current = documentOpenRequest.requestId;
    void openDocumentById(documentOpenRequest.sourceDocumentId, documentOpenRequest.pageNumber, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, documentOpenRequest]);

  const closeReader = () => {
    readGenerationRef.current += 1;
    setReader(null);
  };

  /**
   * PDF Source AI Phase 1. A monotonic id, never reused, so a session B
   * always differs from session A even when both snapshot identical page/
   * selection coordinates -- `key={requestId}` on the AI panel below is what
   * turns that into an actual remount, aborting whatever A had in flight.
   */
  const aiRequestIdRef = useRef(0);

  /** Snapshots the request at the moment AI was clicked; never re-reads it. */
  const activateAiFromSelection = (request: KnowledgeSourcePageRequest) => {
    const requestId = ++aiRequestIdRef.current;
    setReader((current) => (current ? { ...current, aiSession: { requestId, request } } : current));
  };

  /** Returns the right pane to Source Notes. Never closes the reader itself. */
  const closeAiSession = () => {
    setReader((current) => (current ? { ...current, aiSession: null } : current));
  };

  /**
   * The AI panel's own Note Post: forwards the ORIGINAL, unmodified snapshot
   * request plus the AI result as an initial-content override. CanvasClient
   * derives sourceReference/topStrip from `request` alone, exactly as an
   * ordinary Note Post would -- the AI result can only ever replace the
   * editable body seed, never the provenance.
   */
  const handleAiNotePost = (resultText: string) => {
    const session = reader?.aiSession;
    if (!session || !onCreateNoteFromPage) return;
    onCreateNoteFromPage(session.request, { initialContentText: resultText });
    closeAiSession();
  };

  /**
   * Non-modal, so focus is moved rather than trapped, and handed back to
   * whatever opened the drawer -- usually the Note's own Source control, which
   * is still on screen because this drawer no longer closes anything.
   */
  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      wasOpenRef.current = true;
      const active = document.activeElement;
      openerRef.current = active instanceof HTMLElement ? active : null;
      closeButtonRef.current?.focus?.();
      return;
    }
    if (!isOpen && wasOpenRef.current) {
      wasOpenRef.current = false;
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener?.isConnected) opener.focus?.();
    }
  }, [isOpen]);

  /**
   * Escape precedence. The library modal is the topmost Knowledge surface
   * whenever it is mounted, so this handler stands down for it rather than
   * racing it -- listener order on `document` is registration order, which
   * would otherwise close the panel underneath first. Read-only detection: the
   * library knows nothing about this drawer and owns its own state throughout.
   */
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(KNOWLEDGE_LIBRARY_SELECTOR)) return;
      closeReader();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Library data for the right pane. Read BEFORE the closed-reader early return
  // below, because hooks cannot sit behind a conditional -- the hook reads the
  // SAME board-level index the workspace reads, in the same direction, so it
  // issues no request and holds no second notion of what a backlink row is.
  const libraryBacklinks = useKnowledgeSourceBacklinksForDocument(reader?.documentId ?? null);
  const libraryBacklinkRows = useMemo(
    () => knowledgeSourceBacklinkDocumentRows(libraryBacklinks),
    [libraryBacklinks],
  );

  if (!boardId || reader === null) return null;

  const libraryPageSummary = pageCountSummary(reader.pageCount, reader.pages.length, reader.loading);

  return (
    <aside
      data-knowledge-reader="true"
      role="complementary"
      aria-label="Knowledge reader"
      // Overlay, never a layout reservation: the board keeps its full width and
      // no layout implementation learns that this drawer exists. `lg:w-[760px]`
      // is the SAME overlay, merely wide enough to also fit the Source Notes
      // pane beside the unchanged 420px reading experience.
      className="fixed inset-y-0 right-0 z-[1200] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl md:w-[420px] lg:w-[880px]"
    >
      {/*
        The open document, named as a tab. Deliberately the smallest useful
        form of one: it identifies what the workspace is showing and carries
        the existing close action. No tab strip, no reordering, no persistence
        -- the reader still holds exactly one document at a time, and pretending
        otherwise would be chrome with nothing behind it.
      */}
      <div
        data-knowledge-reader-tabs="true"
        className="flex flex-none items-center gap-3 border-b border-gray-100 bg-gray-50 px-3 pt-2"
      >
        <div
          data-knowledge-reader-tab="active"
          title={reader.originalFilename}
          className="min-w-0 max-w-[60%] truncate rounded-t-md border border-b-0 border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800"
        >
          {reader.originalFilename || 'Document'}
        </div>
        <span className="flex-1" />
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close Knowledge reader"
          className="mb-1 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          onClick={closeReader}
        >
          ×
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        {/* The document workspace: the majority of the drawer, and the only
            place the document itself is read and worked with. */}
        <div
          data-knowledge-reader-workspace="true"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden px-4 py-3"
        >
          <KnowledgeDocumentDetails
            documentId={reader.documentId}
            boardId={boardId}
            originalFilename={reader.originalFilename}
            pageCount={reader.pageCount}
            pages={reader.pages}
            loading={reader.loading}
            error={reader.error}
            initialPageNumber={reader.initialPageNumber}
            initialSourceReferenceId={reader.sourceTarget?.referenceId}
            initialSourceRequestId={reader.sourceTarget?.requestId}
            onBack={closeReader}
            // The Library panel owns the document's identity -- but only when
            // it is actually rendered. Without it (no backlink target, or below
            // `lg`) the workspace keeps its own header, so Back to PDFs and the
            // filename can never disappear entirely.
            hostRendersDocumentHeader={!!onOpenBacklinkTarget}
            onCreateNoteFromPage={onCreateNoteFromPage}
            onOpenBacklinkTarget={onOpenBacklinkTarget}
            // PDF Source AI Phase 1. Only offered when there both IS a
            // Note-creating capability AND somewhere for the AI mode to
            // render (the pane below is itself gated on `onOpenBacklinkTarget`)
            // -- otherwise activating AI would switch the right pane into a
            // mode a read-only viewer, or one with no visible pane at all,
            // could never complete.
            onAiFromSelection={onCreateNoteFromPage && onOpenBacklinkTarget ? activateAiFromSelection : undefined}
          />
        </div>
        {/*
          Source Notes Panel -- Phase 1. A SIBLING of the reading pane above,
          never nested inside KnowledgeDocumentDetails: it owns its own
          vertical scroll and reads its data straight from the SAME board-
          level context every other Knowledge surface already uses, so
          opening it never issues a second fetch. Hidden below `lg`, exactly
          like the reading pane's own width, stays untouched there. Only
          rendered when there is somewhere to send a click: with no
          `onOpenBacklinkTarget`, the panel could show Notes it can never open.

          PDF Source AI Phase 1 -- the SAME 340px column now has two modes:
          Source Notes (default) or AI, chosen by whether `reader.aiSession`
          is set. Swapping modes never touches `KnowledgeSourceNotesPanel`'s
          own data source, so returning to it issues no new fetch. Keying the
          AI panel by `requestId` is what makes activating AI on a NEW
          selection a genuine remount -- the previous panel's own cleanup
          effect aborts whatever it had in flight, so a stale response can
          never land on the new session.
        */}
        {onOpenBacklinkTarget ? (
          <div
            data-knowledge-source-notes-pane="true"
            data-knowledge-library-panel="true"
            className="hidden min-h-0 w-[300px] flex-none overflow-y-auto overscroll-contain border-l border-gray-100 px-4 py-3 lg:block"
          >
            {reader.aiSession && onCreateNoteFromPage ? (
              <KnowledgeSourceAIPanel
                key={reader.aiSession.requestId}
                selectedText={reader.aiSession.request.selection?.selectedText ?? ''}
                onNotePost={handleAiNotePost}
                onClose={closeAiSession}
              />
            ) : (
              <>
                {/*
                  What is this source, where did it come from, and where is it
                  used -- answered once, here. The workspace beside it shows the
                  document and nothing about it, so no metadata is duplicated.
                  Both the rows and the page phrasing are the reader's existing
                  ones, imported rather than reimplemented.
                */}
                <button
                  type="button"
                  data-knowledge-library-back="true"
                  className="mb-3 text-xs font-medium text-blue-700 hover:text-blue-900"
                  onClick={closeReader}
                >
                  ← Back to PDFs
                </button>
                <div className="mb-3 border-b border-gray-100 pb-2">
                  <h2
                    data-knowledge-library-filename="true"
                    className="truncate text-sm font-medium text-gray-800"
                    title={reader.originalFilename}
                  >
                    {reader.originalFilename}
                  </h2>
                  {libraryPageSummary !== null ? (
                    <p data-knowledge-library-pagecount="true" className="text-[11px] text-gray-500">
                      {libraryPageSummary}
                    </p>
                  ) : null}
                  <UsedInNotes scope="document" rows={libraryBacklinkRows} onOpen={onOpenBacklinkTarget} />
                </div>
                <KnowledgeSourceNotesPanel documentId={reader.documentId} onOpenNote={onOpenBacklinkTarget} />
              </>
            )}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
