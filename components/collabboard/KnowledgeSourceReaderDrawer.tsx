"use client";

import React, { useCallback, useMemo, useEffect, useRef, useState } from 'react';
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
import BoardAiChatDrawer, {
  type BoardAiAssistantNoteSaveRequest,
  type BoardAiDocumentScopedSession,
} from '@/components/collabboard/BoardAiChatDrawer';
import PdfWorkspaceLibraryPanel from '@/components/collabboard/PdfWorkspaceLibraryPanel';
import PdfReaderDock, { type PdfReaderPanel } from '@/components/collabboard/PdfReaderDock';
import PdfWorkspaceChrome, {
  type PdfWorkspaceRightPanel,
  type PdfWorkspaceTab,
} from '@/components/collabboard/PdfWorkspaceChrome';
import type {
  KnowledgePdfPlacementSource,
  KnowledgePdfProcessingStatus,
  KnowledgePdfUploadResult,
} from '@/components/collabboard/KnowledgePdfUploader';
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

/** A stable empty default, so an absent draft is not a new array each render. */
const NO_BOARD_AI_DRAFT_CONTEXT: readonly BoardAiDraftContextItem[] = [];

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

import {
  addBoardAiDraftContext,
  type BoardAiDraftContextItem,
} from '@/lib/domain/ai/boardAiChatDraftContext';

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
  canDragSourceNote?: (targetPadletId: string) => boolean;
  /**
   * Reports whether a document is open in this reader, in either host.
   *
   * The board cannot derive it -- the reader owns its own open state and can
   * be closed from inside -- and one board rule needs it: while a PDF is being
   * read, the PDF's own AI dock is the single AI entry point, so the board's
   * floating Board AI shortcut stands down instead of floating over the
   * reader's chrome as a second one.
   */
  onOpenChange?: (open: boolean) => void;
  /**
   * The board's canonical "open this Knowledge document, at this page".
   *
   * Used by a Board AI citation, which is identity the server authorized. It
   * is the SAME request a Library pick or a semantic result builds, so a
   * citation opens a document exactly as every other navigation does -- one
   * reader, one navigation authority, and a fresh intent on every click.
   */
  onOpenKnowledgeDocument?: (request: {
    readonly documentId: string;
    readonly pageNumber?: number;
    readonly presentation?: 'workspace' | 'side-panel';
    /** This open must end with the document visible. See the request type. */
    readonly revealSource?: boolean;
  }) => void;
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
   * PDF_SELECTION_TO_NOTE_1. Forwarded untouched to the reader, which is where
   * the selection toolbar lives. The drawer neither builds the request nor
   * writes anything: both hosts hand the board the same one action.
   */
  onSaveSelectionAsNote?: (request: KnowledgeSourcePageRequest) => Promise<void>;
  /**
   * Forwarded verbatim, and deliberately WITHOUT closing this drawer: reading
   * the source beside the Note it supports is the whole point of F7. The old
   * modal had to close first only because it painted over the editor.
   */
  /**
   * Move the board to this Note, when the board can do that.
   *
   * Optional on purpose: a layout that cannot reveal spatially is handed
   * nothing, so the action is absent rather than present-but-dead. Navigation
   * only -- it never edits, and read authority is all it needs.
   */
  onRevealBacklinkTargetOnBoard?: (targetPadletId: string) => void;
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
  /** Board-owned tab state for the focused PDF workspace. */
  workspaceTabs?: readonly PdfWorkspaceTab[];
  activeWorkspacePdfId?: string | null;
  workspaceRightPanel?: PdfWorkspaceRightPanel;
  onWorkspaceTabActivate?: (documentId: string) => void;
  onWorkspaceTabClose?: (documentId: string) => void;
  onWorkspaceClose?: () => void;
  onWorkspaceRightPanelChange?: (panel: PdfWorkspaceRightPanel) => void;
  onWorkspaceDocumentResolved?: (document: PdfWorkspaceTab) => void;
  onWorkspaceActivePageChange?: (documentId: string, pageNumber: number) => void;
  onWorkspacePdfUploaded?: (document: KnowledgePdfUploadResult) => void;
  onWorkspaceExistingPdfOpen?: (document: KnowledgePdfPlacementSource) => Promise<boolean> | boolean;
  onWorkspacePdfSettled?: (documentId: string, status: KnowledgePdfProcessingStatus) => void;
  /**
   * Board AI draft context, keyed by the DOCUMENT it belongs to.
   *
   * A map rather than one list because both hosts hand off into the same
   * place: a page or an exact selection attached in the docked reader is the
   * same attachment the focused workspace shows for that PDF, and keying it by
   * anything host-specific would split one conversation's attachments in two.
   * Its absence is also the Board AI availability signal -- with no way to
   * attach, no AI dock button is mounted at all.
   */
  boardAiDraftContextByDocumentId?: Record<string, readonly BoardAiDraftContextItem[]>;
  onBoardAiDraftContextChange?: (
    documentId: string,
    items: readonly BoardAiDraftContextItem[],
  ) => void;
  workspaceActivePageNumber?: number | null;
  canSaveAssistantAsNote?: boolean;
  onSaveAssistantAsNote?: (request: BoardAiAssistantNoteSaveRequest) => Promise<void>;
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
  /** Request id for same-page workspace jumps from Library image provenance. */
  pageNavigationRequestId?: number;
  /** Null for every library and semantic-result open, so neither inherits one. */
  sourceTarget: KnowledgeSourceTarget | null;
  /**
   * True when this open exists to SHOW the document -- a Board AI citation.
   *
   * Held on the reader state rather than read from the request, because the
   * panel decision is made when the document CHANGES, which is one render
   * after the request was handled.
   */
  revealSource?: boolean;
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
  canDragSourceNote,
  onOpenChange,
  onOpenKnowledgeDocument,
  blockingEditorOpen = false,
  onCreateNoteFromPage,
  onSaveSelectionAsNote,
  closeSidePanelRequestId,
  onOpenBacklinkTarget,
  onRevealBacklinkTargetOnBoard,
  workspaceTabs = [],
  activeWorkspacePdfId = null,
  workspaceRightPanel = 'closed',
  onWorkspaceTabActivate,
  onWorkspaceTabClose,
  onWorkspaceClose,
  onWorkspaceRightPanelChange,
  onWorkspaceDocumentResolved,
  onWorkspaceActivePageChange,
  onWorkspacePdfUploaded,
  onWorkspaceExistingPdfOpen,
  onWorkspacePdfSettled,
  boardAiDraftContextByDocumentId,
  onBoardAiDraftContextChange,
  workspaceActivePageNumber = null,
  canSaveAssistantAsNote = false,
  onSaveAssistantAsNote,
}: KnowledgeSourceReaderDrawerProps) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const [reader, setReader] = useState<KnowledgeReaderState | null>(null);
  /**
   * The document-scoped Board AI sessions, owned HERE and by nothing else.
   *
   * One store for both hosts, which is what stops the same PDF from acquiring
   * a second conversation when the user moves between the focused workspace
   * and the docked reader: this drawer instance serves both, so the thread,
   * its messages and its saved-Note state simply stay put across the switch.
   */
  const [boardAiSessionsByDocumentId, setBoardAiSessionsByDocumentId] =
    useState<Record<string, BoardAiDocumentScopedSession>>({});
  /** The docked reader's own right panel: Library first, AI on request. */
  const [sidePanelRightPanel, setSidePanelRightPanel] = useState<PdfReaderPanel>('library');
  /** Which page the reader is actually on, in either host. */
  const [readerActivePage, setReaderActivePage] =
    useState<{ readonly documentId: string; readonly pageNumber: number } | null>(null);
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
  /**
   * The reader's monotonic page-navigation intent, minted for EVERY deliberate
   * arrival: a source click, a document open, a Library image or highlight.
   *
   * It exists because the viewer scrolls on a CHANGED intent, not on a page
   * number: without it, clicking the same citation twice handed the viewer
   * identical props, its own "already scrolled there" latch stayed closed, and
   * the second click did nothing -- even though the user had scrolled the
   * reader somewhere else in between. Never reused, so a repeat is a repeat.
   */
  const pageNavigationRequestIdRef = useRef(0);
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
   * The docked drawer's half of the same rule.
   *
   * The workspace steps aside by disappearing, because it owns the whole
   * surface. The side panel deliberately stays visible -- reading a source
   * beside the Note it supports is the point of that host -- but it sat at
   * z-[1200], ABOVE the z-[1000] editor tier, so a Note modal opened behind
   * it and the panel swallowed clicks meant for the editor.
   *
   * So it steps aside in the only way that keeps it useful: it drops below
   * the editor tier while a blocking editor is open, and returns the moment
   * that editor closes. It stays above ordinary board UI (the z-[700] heading
   * toolbar and the z-[800] library drawer) either way, and the modal's own
   * inset-0 backdrop then dims it exactly as it dims the board.
   *
   * Applied inline rather than by swapping the class: the class string is a
   * pinned stacking contract, and an inline z-index beats it deterministically
   * instead of depending on which rule the generated CSS happens to emit last.
   */
  const sidePanelBelowEditor = !isWorkspace && blockingEditorOpen;

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
    // Same rule: an ordinary open must arrive as an ordinary open.
    revealSource = false,
  ) => {
    if (!boardId) return;
    const generation = ++readGenerationRef.current;
    // One click, one intent -- even when the document, the page and the cited
    // row are all exactly what the last click asked for.
    const navigationRequestId = ++pageNavigationRequestIdRef.current;

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
        loading: false, error: false, initialPageNumber, sourceTarget, revealSource,
        pageNavigationRequestId: navigationRequestId,
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
      loading: true, error: false, initialPageNumber, sourceTarget, revealSource,
      pageNavigationRequestId: navigationRequestId,
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
          loading: false, error: false, initialPageNumber, sourceTarget, revealSource,
          pageNavigationRequestId: navigationRequestId,
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
    void openDocumentById(
      sourceOpenRequest.sourceDocumentId,
      sourceOpenRequest.pageStart,
      {
        referenceId: sourceOpenRequest.sourceReferenceId,
        requestId: sourceOpenRequest.requestId,
      },
      sourceOpenRequest.revealSource === true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, sourceOpenRequest]);

  useEffect(() => {
    if (!boardId || !documentOpenRequest) return;
    if (handledDocumentRequestRef.current === documentOpenRequest.requestId) return;
    handledDocumentRequestRef.current = documentOpenRequest.requestId;
    void openDocumentById(
      documentOpenRequest.sourceDocumentId,
      documentOpenRequest.pageNumber,
      null,
      documentOpenRequest.revealSource === true,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, documentOpenRequest]);

  const closeReader = useCallback(() => {
    readGenerationRef.current += 1;
    setReader(null);
    if (presentation === 'workspace') onWorkspaceClose?.();
  }, [presentation, onWorkspaceClose]);

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
   * Sends the reader to one page of the document it already has open.
   *
   * Both hosts, one path: a Library image and a Library highlight are the same
   * kind of jump, and the docked reader is as capable of making it as the
   * focused workspace. The document guard is what keeps it honest -- a row for
   * another document navigates nothing.
   *
   * This is an ordinary jump, so it says so: `revealSource` describes the
   * purpose of ONE arrival, not a mode the reader stays in. Carrying an
   * earlier reveal forward would make this navigation look like another source
   * click and close the panel the user had just reopened to click from.
   */
  const navigateReaderToPage = useCallback((request: {
    readonly documentId: string;
    readonly pageNumber: number;
  }) => {
    if (!Number.isInteger(request.pageNumber) || request.pageNumber < 1) return;
    setReader((current) => {
      if (!current) return current;
      if (current.documentId !== request.documentId) return current;
      if (!current.pages.some((page) => page.pageNumber === request.pageNumber)) return current;
      const requestId = ++pageNavigationRequestIdRef.current;
      onWorkspaceActivePageChange?.(current.documentId, request.pageNumber);
      return {
        ...current,
        initialPageNumber: request.pageNumber,
        pageNavigationRequestId: requestId,
        revealSource: false,
      };
    });
  }, [onWorkspaceActivePageChange]);

  /**
   * The page the reader is actually on, recorded for both hosts.
   *
   * Board AI's mandatory PDF context is a PAGE identity, so the docked reader
   * needs this exactly as much as the workspace does -- without it a question
   * asked from page 4 would carry the whole document instead.
   */
  const handleActivePageChange = useCallback((documentId: string, pageNumber: number) => {
    setReaderActivePage((current) => (
      current?.documentId === documentId && current.pageNumber === pageNumber
        ? current
        : { documentId, pageNumber }
    ));
    onWorkspaceActivePageChange?.(documentId, pageNumber);
  }, [onWorkspaceActivePageChange]);

  /**
   * A Board AI citation, sent to the board's own navigation authority.
   *
   * The docked host's panel COVERS the document below `lg`, so a navigation
   * the user cannot see would be no navigation at all: that panel steps aside
   * once the request is made. The focused workspace keeps its panel, because
   * there the document stays beside it at every width.
   */
  const openCitation = useCallback((request: {
    readonly knowledgeDocumentId: string;
    readonly pageNumber?: number;
  }) => {
    if (!onOpenKnowledgeDocument) return;
    onOpenKnowledgeDocument({
      documentId: request.knowledgeDocumentId,
      ...(request.pageNumber === undefined ? {} : { pageNumber: request.pageNumber }),
      presentation,
      // Whichever document this lands on -- this one or another -- the reader
      // must end up showing it, not presenting it behind a panel.
      revealSource: true,
    });
    if (presentation !== 'workspace') setSidePanelRightPanel('closed');
  }, [onOpenKnowledgeDocument, presentation]);

  /**
   * What the docked reader presents when a document arrives.
   *
   * A newly opened document normally starts on Library -- that is the reader's
   * existing default and it stays. The exception is an arrival whose whole
   * point was to SHOW the source: a Board AI citation, a Note's own "Source ·
   * p. N". Below `lg` this panel is an opaque overlay over the reading pane,
   * so defaulting it open there would load the cited page and then cover it,
   * which is the one thing those clicks must not do.
   *
   * The key is what decides it. An ordinary open is keyed by DOCUMENT, so
   * reopening the same one changes nothing. A reveal is keyed by its own
   * navigation id, so clicking a source again closes the panel again -- even
   * when the document is the one already open and the user has since reopened
   * Library over it. A page jump that is neither -- a Library image, a
   * highlight -- states `revealSource: false` and so keys back to its own
   * document, leaving the panel exactly as the user left it.
   *
   * That last part is why the flag belongs to one arrival rather than to the
   * reader: a sticky reveal would turn the next ordinary jump into a reveal it
   * never was.
   */
  const panelArrivalKey = reader === null
    ? 'none'
    : reader.revealSource
      ? `reveal:${reader.pageNavigationRequestId ?? 0}`
      : `open:${reader.documentId}`;

  useEffect(() => {
    if (panelArrivalKey === 'none') return;
    setSidePanelRightPanel(panelArrivalKey.startsWith('reveal:') ? 'closed' : 'library');
  }, [panelArrivalKey]);

  useEffect(() => {
    onOpenChange?.(isOpen);
  }, [isOpen, onOpenChange]);

  useEffect(() => {
    if (!isWorkspace || reader === null || reader.loading || reader.error) return;
    onWorkspaceDocumentResolved?.({
      documentId: reader.documentId,
      originalFilename: reader.originalFilename || 'Document',
      pageCount: reader.pageCount,
    });
  }, [
    isWorkspace,
    reader?.documentId,
    reader?.originalFilename,
    reader?.pageCount,
    reader?.loading,
    reader?.error,
    onWorkspaceDocumentResolved,
  ]);

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
  /**
   * Every explicit Board AI handoff, in either host, goes through here.
   *
   * A page or an exact selection becomes explicit context on THIS document's
   * draft and the AI panel comes forward beside the PDF, which stays visible
   * and readable. Nothing is sent: the user still writes the question. This is
   * also why the PDF reader needs no "add this document to AI" action of its
   * own -- the open PDF is already the conversation's mandatory context.
   */
  const handOffToBoardAi = useCallback((item: BoardAiDraftContextItem) => {
    const documentId = reader?.documentId;
    if (!documentId || !onBoardAiDraftContextChange) return;
    const current = boardAiDraftContextByDocumentId?.[documentId] ?? NO_BOARD_AI_DRAFT_CONTEXT;
    onBoardAiDraftContextChange(documentId, addBoardAiDraftContext(current, item).items);
    if (presentation === 'workspace') {
      onWorkspaceRightPanelChange?.('ai');
      return;
    }
    setSidePanelRightPanel('ai');
  }, [
    boardAiDraftContextByDocumentId,
    onBoardAiDraftContextChange,
    onWorkspaceRightPanelChange,
    presentation,
    reader?.documentId,
  ]);

  const libraryBacklinks = useKnowledgeSourceBacklinksForDocument(reader?.documentId ?? null);
  const libraryBacklinkRows = useMemo(
    () => knowledgeSourceBacklinkDocumentRows(libraryBacklinks),
    [libraryBacklinks],
  );

  if (!boardId || reader === null) return null;

  const libraryPageSummary = pageCountSummary(reader.pageCount, reader.pages.length, reader.loading);
  // Board AI is offered only where the board can actually accept an
  // attachment; with no such authority no dock button is mounted at all.
  const boardAiAvailable = !!onBoardAiDraftContextChange;
  const boardAiDraftContext = boardAiDraftContextByDocumentId?.[reader.documentId]
    ?? NO_BOARD_AI_DRAFT_CONTEXT;
  const changeBoardAiDraftContext = (items: readonly BoardAiDraftContextItem[]) => {
    onBoardAiDraftContextChange?.(reader.documentId, items);
  };
  const readerActivePageNumber = readerActivePage?.documentId === reader.documentId
    ? readerActivePage.pageNumber
    : reader.initialPageNumber ?? 1;
  if (isWorkspace) {
    const effectiveTabs = workspaceTabs.length > 0
      ? workspaceTabs
      : [{
        documentId: reader.documentId,
        originalFilename: reader.originalFilename || 'Document',
        pageCount: reader.pageCount,
      }];
    const activeDocumentId = activeWorkspacePdfId ?? reader.documentId;
    const readerMatchesActiveDocument = reader.documentId === activeDocumentId;
    const activePageNumber = Number.isInteger(workspaceActivePageNumber) && (workspaceActivePageNumber ?? 0) >= 1
      ? workspaceActivePageNumber
      : reader.initialPageNumber ?? 1;
    const openBacklinkTarget = (targetPadletId: string) => onOpenBacklinkTarget?.(targetPadletId);
    const rightPanelContent = !readerMatchesActiveDocument ? (
      <p data-pdf-workspace-panel-loading="true" className="text-xs text-gray-500">
        Opening document context…
      </p>
    ) : workspaceRightPanel === 'library' ? (
      <PdfWorkspaceLibraryPanel
        documentId={reader.documentId}
        onOpenNote={openBacklinkTarget}
        /* Passed straight through, exactly as the docked Library site does:
           its ABSENCE is the layout gate, so an unsupported layout still
           renders no Show on board here either. */
        onShowNoteOnBoard={onRevealBacklinkTargetOnBoard}
        onNavigateToPage={navigateReaderToPage}
        onNavigateToImagePage={navigateReaderToPage}
      />
    ) : workspaceRightPanel === 'ai' && boardAiAvailable ? (
      <BoardAiChatDrawer
        boardId={boardId}
        isOpen
        onClose={() => onWorkspaceRightPanelChange?.('closed')}
        presentation="embedded"
        documentScope={{
          knowledgeDocumentId: reader.documentId,
          originalFilename: reader.originalFilename || 'Document',
          pageNumber: activePageNumber,
        }}
        draftContext={boardAiDraftContext}
        onDraftContextChange={changeBoardAiDraftContext}
        documentSessions={boardAiSessionsByDocumentId}
        onDocumentSessionsChange={setBoardAiSessionsByDocumentId}
        onOpenCitation={openCitation}
        canSaveAssistantAsNote={canSaveAssistantAsNote}
        onSaveAssistantAsNote={onSaveAssistantAsNote}
        selectedBoardItem={null}
      />
    ) : null;

    return (
      <PdfWorkspaceChrome
        boardId={boardId}
        tabs={effectiveTabs}
        activeDocumentId={activeDocumentId}
        rightPanel={workspaceRightPanel}
        aiAvailable={boardAiAvailable}
        yieldsToEditor={yieldsToEditor}
        rightPanelContent={rightPanelContent}
        onActivateTab={onWorkspaceTabActivate ?? (() => {})}
        onCloseTab={(documentId) => {
          if (effectiveTabs.length <= 1) {
            closeReader();
            return;
          }
          onWorkspaceTabClose?.(documentId);
        }}
        onCloseWorkspace={closeReader}
        onRightPanelChange={onWorkspaceRightPanelChange ?? (() => {})}
        onUploadedDocument={onWorkspacePdfUploaded ?? (() => {})}
        onOpenExistingDocument={onWorkspaceExistingPdfOpen ?? (() => false)}
        onDocumentSettled={onWorkspacePdfSettled}
      >
        <div
          data-knowledge-reader-workspace="true"
          className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 py-3"
        >
          {readerMatchesActiveDocument ? (
            <KnowledgeDocumentDetails
              documentId={reader.documentId}
              boardId={boardId}
              originalFilename={reader.originalFilename}
              pageCount={reader.pageCount}
              pages={reader.pages}
              loading={reader.loading}
              error={reader.error}
              initialPageNumber={reader.initialPageNumber}
              pageNavigationRequestId={reader.pageNavigationRequestId}
              initialSourceReferenceId={reader.sourceTarget?.referenceId}
              initialSourceRequestId={reader.sourceTarget?.requestId}
              onBack={closeReader}
              hostRendersDocumentHeader
              onCreateNoteFromPage={onCreateNoteFromPage}
              onSaveSelectionAsNote={onSaveSelectionAsNote}
              onOpenBacklinkTarget={onOpenBacklinkTarget}
            onRevealBacklinkTargetOnBoard={onRevealBacklinkTargetOnBoard}
              onAddBoardAiContext={boardAiAvailable ? handOffToBoardAi : undefined}
              onActivePageChange={handleActivePageChange}
            />
          ) : (
            <div data-knowledge-reader-workspace-loading="true" className="flex h-full items-center justify-center text-sm text-gray-500">
              Opening document…
            </div>
          )}
        </div>
      </PdfWorkspaceChrome>
    );
  }

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
      data-knowledge-reader-below-editor={sidePanelBelowEditor ? 'true' : 'false'}
      style={sidePanelBelowEditor ? { zIndex: 900 } : undefined}
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
        {/* No "Add to Board AI" here any more. The open PDF is already the AI
            panel's mandatory context, so a header action that attached the
            same document was a second entry point saying nothing new -- the
            dock in this row is the one way in.

            Available at EVERY width. It used to be withheld below `lg`, where
            the panel it opens was hidden -- but the page and selection AI
            actions inside the document could still activate that panel, and
            the board's own AI shortcut correctly stands down while a reader is
            open, so a narrow viewport ended up with a live AI panel and no way
            to see it. The panel below is visible at every width instead. */}
        {onOpenBacklinkTarget ? (
          <div className="mb-1 flex items-center">
            <PdfReaderDock
              panel={sidePanelRightPanel}
              aiAvailable={boardAiAvailable}
              onPanelChange={setSidePanelRightPanel}
            />
          </div>
        ) : null}
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
      <div className="relative flex min-h-0 flex-1">
        {/* The document workspace: the majority of the drawer, and the only
            place the document itself is read and worked with. Below `lg` an
            open panel covers it rather than squeezing it; it is never
            unmounted, so nothing about the document is rebuilt on the way
            back. */}
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
            pageNavigationRequestId={reader.pageNavigationRequestId}
            initialSourceReferenceId={reader.sourceTarget?.referenceId}
            initialSourceRequestId={reader.sourceTarget?.requestId}
            onBack={closeReader}
            // The right panel owns the document's identity while it is open --
            // and it is on screen at every width now, so this follows the panel
            // alone. With it closed (or with no backlink target at all) the
            // reading pane keeps its own header, so Back to PDFs and the
            // filename can never disappear.
            hostRendersDocumentHeader={!!onOpenBacklinkTarget && sidePanelRightPanel !== 'closed'}
            onCreateNoteFromPage={onCreateNoteFromPage}
            onSaveSelectionAsNote={onSaveSelectionAsNote}
            onOpenBacklinkTarget={onOpenBacklinkTarget}
            onRevealBacklinkTargetOnBoard={onRevealBacklinkTargetOnBoard}
            // Page and exact-selection handoffs live where the page rows and
            // the selection toolbar already are; both carry identity only,
            // neither writes anything, and both land in the SAME document-
            // scoped Board AI panel the dock opens.
            onAddBoardAiContext={boardAiAvailable ? handOffToBoardAi : undefined}
            onActivePageChange={handleActivePageChange}
          />
        </div>
        {/*
          The docked reader's right side, arranged exactly as the focused
          workspace's: at most one panel, opened from the dock in the header
          above. It is a SIBLING of the reading pane, never nested inside it,
          so the PDF stays visible and usable whichever panel is open -- and
          closing the panel gives the document the whole drawer back, with no
          strip left holding narrow space it no longer needs.

          ONE panel, two geometries, and never a hidden one. From `lg` up it is
          the 300px column beside the document it belongs to. Below that the
          drawer is 420px -- too narrow to sit beside anything -- so the panel
          covers the reading pane instead of disappearing: the document stays
          MOUNTED underneath with its page, scroll and session intact, and
          toggling the panel off in the header brings it straight back.

          The rule this enforces is that an ACTIVE panel is always on screen. A
          page or selection handoff activates this panel from inside the
          document at any width, and the board's floating AI shortcut stands
          down while a reader is open, so a panel that could be hidden by a
          breakpoint would leave that handoff with nowhere to land.

          Only rendered when there is somewhere to send a click: with no
          `onOpenBacklinkTarget` the Library could list Notes it can never open.
        */}
        {onOpenBacklinkTarget ? (
          <>
            {sidePanelRightPanel !== 'closed' ? (
              <div
                data-knowledge-source-notes-pane="true"
                data-knowledge-library-panel="true"
                data-knowledge-reader-right-panel={sidePanelRightPanel}
                className="absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden border-l border-gray-100 bg-white lg:static lg:z-auto lg:w-[300px] lg:flex-none"
              >
                {/*
                  What is this source, where did it come from, and where is it
                  used -- answered once, here, above whichever panel is open.
                  The reading pane beside it shows the document and nothing
                  about it, so no metadata is duplicated. Both the rows and the
                  page phrasing are the reader's existing ones, imported rather
                  than reimplemented.
                */}
                <header className="shrink-0 border-b border-gray-100 px-4 pb-2 pt-3">
                  <button
                    type="button"
                    data-knowledge-library-back="true"
                    className="mb-3 text-xs font-medium text-blue-700 hover:text-blue-900"
                    onClick={closeReader}
                  >
                    ← Back to PDFs
                  </button>
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
                  <UsedInNotes
                    scope="document"
                    rows={libraryBacklinkRows}
                    onOpen={onOpenBacklinkTarget}
                    onShowOnBoard={onRevealBacklinkTargetOnBoard}
                  />
                  <p data-knowledge-reader-panel-title="true" className="mt-2 text-[11px] font-semibold text-gray-700">
                    {sidePanelRightPanel === 'library' ? 'Library' : 'AI'}
                  </p>
                </header>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                  {sidePanelRightPanel === 'library' ? (
                    <PdfWorkspaceLibraryPanel
                      documentId={reader.documentId}
                      onOpenNote={onOpenBacklinkTarget}
                      onShowNoteOnBoard={onRevealBacklinkTargetOnBoard}
                      canDragNote={canDragSourceNote}
                      onNavigateToPage={navigateReaderToPage}
                      onNavigateToImagePage={navigateReaderToPage}
                    />
                  ) : boardAiAvailable ? (
                    <BoardAiChatDrawer
                      boardId={boardId}
                      isOpen
                      onClose={() => setSidePanelRightPanel('closed')}
                      presentation="embedded"
                      documentScope={{
                        knowledgeDocumentId: reader.documentId,
                        originalFilename: reader.originalFilename || 'Document',
                        pageNumber: readerActivePageNumber,
                      }}
                      draftContext={boardAiDraftContext}
                      onDraftContextChange={changeBoardAiDraftContext}
                      documentSessions={boardAiSessionsByDocumentId}
                      onDocumentSessionsChange={setBoardAiSessionsByDocumentId}
                      onOpenCitation={openCitation}
                      canSaveAssistantAsNote={canSaveAssistantAsNote}
                      onSaveAssistantAsNote={onSaveAssistantAsNote}
                      selectedBoardItem={null}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </aside>
  );
}
