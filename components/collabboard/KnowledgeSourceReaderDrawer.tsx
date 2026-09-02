"use client";

import React, { useMemo, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import KnowledgeDocumentDetails, {
  UsedInNotes,
  pageCountSummary,
  type KnowledgeDocumentDetailPage,
} from '@/components/collabboard/KnowledgeDocumentDetails';
import { useKnowledgeSourceBacklinksForDocument } from '@/components/collabboard/KnowledgeSourceReferenceContext';
import {
  useKnowledgePageCache,
  fetchKnowledgeReadyPages,
} from '@/components/collabboard/KnowledgePageCache';
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
   * Which host draws this reader. 'side-panel' is the docked drawer beside a
   * usable board; 'workspace' gives the document the whole surface. ONE reader
   * either way -- same content, same source, same panels -- so this changes
   * geometry and nothing else. The board stays mounted underneath a workspace,
   * which is what makes returning to it lossless.
   */
  presentation?: 'workspace' | 'side-panel';
  /**
   * The board's OWN blocking-editor authority (`isBlockingEditorModalOpen`),
   * forwarded unchanged. It is already the single generic answer to "does a
   * modal own the screen right now" for all fourteen editors, and the canvas
   * toolbar's z-[3000] wrapper already steps aside on exactly this flag.
   *
   * The focused workspace needs the same courtesy for the same reason. It is
   * `fixed inset-0` and opaque, so a Note created FROM it -- via Create Note or
   * the AI panel's Note Post -- would open at the shared editor tier underneath
   * a surface covering the whole viewport: open in state, invisible in fact.
   * Yielding is the same one-line answer the toolbar already gives, and it
   * leaves the shared editor tier and both reader bands exactly where they are.
   *
   * The docked drawer never yields: it occupies one edge of the viewport, so an
   * editor is already visible beside it -- reading a source next to the Note it
   * supports is the whole point of that host.
   */
  blockingEditorOpen?: boolean;
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
  /**
   * BCHAT-C. A monotonic id the board bumps when another right-side surface --
   * today Board AI Chat -- takes the dock. Two docked drawers must not stack,
   * and the board cannot reach this one's open state: `reader` lives here.
   *
   * Deliberately a REQUEST, not a boolean `closed` flag. A flag would fight
   * the reader for authority every render, and could not express "close once,
   * then leave the user free to reopen"; an id handled at most once is the
   * same contract the two open requests above already use.
   *
   * Scoped to the DOCKED presentation on purpose. The focused workspace owns
   * the whole surface, so nothing can be docked beside it -- closing it here
   * would discard a reading session for a conflict that cannot arise.
   */
  closeSidePanelRequestId?: number;
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
export default function KnowledgeSourceReaderDrawer({
  sourceOpenRequest = null,
  documentOpenRequest = null,
  presentation = 'side-panel',
  blockingEditorOpen = false,
  onCreateNoteFromPage,
  closeSidePanelRequestId,
  onOpenBacklinkTarget,
}: KnowledgeSourceReaderDrawerProps) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const [reader, setReader] = useState<KnowledgeReaderState | null>(null);
  /** The same shared page memory the canvas card reads. */
  const pageCache = useKnowledgePageCache();
  // Each request is acted on at most once, and the latch has the same lifetime
  // as this permanently-mounted drawer. That pairing is the fix for the old
  // replay: the latch used to unmount with the toolbar while CanvasClient kept
  // holding the request, so re-expanding the toolbar reopened the last source.
  const handledSourceRequestRef = useRef<number | null>(null);
  const handledDocumentRequestRef = useRef<number | null>(null);
  const handledCloseRequestRef = useRef<number | null>(null);
  // Two rapid picks are a race; only the newest read may commit.
  const readGenerationRef = useRef(0);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasOpenRef = useRef(false);
  const isOpen = reader !== null;

  const isWorkspace = presentation === 'workspace';
  /**
   * Yield only where covering is actually possible. Hidden and inert rather
   * than closed: the reader stays mounted, so the document, the scroll
   * position, the search and every other piece of reader state are still
   * there when the editor goes away -- nothing is restored because nothing
   * was torn down. Declared up here because the Escape handler below reads
   * it too, and hooks cannot sit behind the closed-reader early return.
   */
  const yieldsToEditor = isWorkspace && blockingEditorOpen;

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

    /**
     * Stale-while-revalidate. A document this session already read opens on its
     * known-good pages IMMEDIATELY -- no empty reader, no "Loading", because
     * closing a reader was only ever throwing away data the server had already
     * made permanent. Reopening is therefore instant and issues no request at
     * all while the entry is fresh.
     */
    const cached = pageCache?.read(documentId) ?? null;
    if (cached) {
      setReader({
        documentId,
        originalFilename: cached.originalFilename,
        pageCount: cached.pageCount,
        pages: cached.pages,
        loading: false, error: false, initialPageNumber, sourceTarget, aiSession: null,
      });
      // Fresh enough to trust: nothing further to do.
      if (!pageCache || !pageCache.isStale(cached)) return;
      // Stale: revalidate BEHIND the content already on screen, and keep the
      // last known-good pages if that quiet read fails.
      const revalidated = await pageCache.load(boardId, documentId);
      if (generation !== readGenerationRef.current) return;
      if (revalidated.status !== 'ready') return;
      setReader((current) => (current?.documentId === documentId
        ? {
          ...current,
          originalFilename: revalidated.entry.originalFilename,
          pageCount: revalidated.entry.pageCount,
          pages: revalidated.entry.pages,
        }
        : current));
      return;
    }

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
        // Shared with any identical request already open -- a card mounting at
        // the same moment and this reader now cost ONE `/pages` read between
        // them. The retry policy below is this reader's own and is unchanged.
        const result = pageCache
          ? await pageCache.load(boardId, documentId)
          : await fetchKnowledgeReadyPages(boardId, documentId);
        if (generation !== readGenerationRef.current) return;
        if (result.status === 'preparing' && attempt < READER_PAGES_RETRY_LIMIT) {
          await new Promise((resolve) => { window.setTimeout(resolve, READER_PAGES_RETRY_DELAY_MS); });
          if (generation !== readGenerationRef.current) return;
          continue;
        }
        if (result.status !== 'ready') throw new Error('details unavailable');
        setReader({
          documentId,
          originalFilename: result.entry.originalFilename,
          pageCount: result.entry.pageCount,
          pages: result.entry.pages,
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
   * BCHAT-C. Yield the dock, once per request id.
   *
   * Reuses `closeReader` rather than resetting anything itself, so there is
   * still exactly one way this drawer closes and the read-generation guard
   * that protects an in-flight fetch is not bypassed. Doing nothing is the
   * right answer three times over: for a repeated id (a rerender, not a new
   * intent), for an already-closed reader, and for the focused workspace,
   * which nothing can be docked beside.
   */
  useEffect(() => {
    if (closeSidePanelRequestId === undefined) return;
    if (handledCloseRequestRef.current === closeSidePanelRequestId) return;
    handledCloseRequestRef.current = closeSidePanelRequestId;
    if (presentation !== 'side-panel') return;
    if (reader === null) return;
    closeReader();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeSidePanelRequestId, presentation]);

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
      // Same precedence, one more topmost surface: while this host has yielded
      // it is invisible and inert, so Escape belongs to the editor that is
      // actually on screen. Without this a single Escape closes both at once
      // and there is no workspace left to come back to.
      if (yieldsToEditor) return;
      closeReader();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, yieldsToEditor]);

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
      data-knowledge-reader-presentation={presentation}
      data-knowledge-reader-yielded={yieldsToEditor ? 'true' : 'false'}
      className={`${isWorkspace
        // The focused workspace: the document owns the surface. The board is
        // covered rather than unmounted, so its camera, placements and every
        // other piece of live state survive the visit untouched.
        //
        // Above the toolbar's own z-[3000] wrapper, unlike the docked drawer
        // below. That is the difference between the two hosts: the board's
        // toolbar belongs to the board, and while the document owns the whole
        // surface the board is not the active workspace -- leaving the strip
        // floating on top would also let it swallow clicks meant for the
        // reader, including the Board tab that leads back.
        ? 'fixed inset-0 z-[3100] flex flex-col bg-white'
        : 'fixed inset-y-0 right-0 z-[1200] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl md:w-[420px] lg:w-[880px]'}${
        // The toolbar's own yield transition, so the two surfaces that
        // step aside for a modal do it the same way.
        isWorkspace ? ' transition-opacity duration-150' : ''}${
        yieldsToEditor ? ' pointer-events-none opacity-0' : ''}`}
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
        {isWorkspace ? (
          <button
            type="button"
            data-knowledge-reader-tab="board"
            title="Back to board"
            aria-label="Back to board"
            className="min-w-0 shrink-0 rounded-t-md px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-white hover:text-gray-800"
            onClick={closeReader}
          >
            Board
          </button>
        ) : null}
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
