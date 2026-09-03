"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ExternalLink, FileText, Maximize2, PanelRight, Type } from 'lucide-react';
import KnowledgeDocumentPageImage from '@/components/collabboard/KnowledgeDocumentPageImage';
import { useKnowledgePageRenderRepair } from '@/components/collabboard/useKnowledgePageRenderRepair';
import {
  useKnowledgePageCache,
  fetchKnowledgeReadyPages,
} from '@/components/collabboard/KnowledgePageCache';
import type { KnowledgeDocumentDetailPage } from '@/components/collabboard/KnowledgeDocumentDetails';
import {
  useKnowledgeSourceNoteColors,
  useKnowledgeSourceReferencesForDocument,
} from '@/components/collabboard/KnowledgeSourceReferenceContext';
import { knowledgeSourceHighlightSegments } from '@/lib/domain/knowledge/knowledgeSourceHighlights';
import { knowledgeSourceHighlightColor } from '@/lib/domain/knowledge/knowledgeSourceHighlightColor';
import {
  listKnowledgePdfs,
  type KnowledgePdfProcessingStatus,
} from '@/components/collabboard/KnowledgePdfUploader';
/**
 * PDF-C1 Text -- the reader's OWN exact-span contract, imported rather than
 * re-derived. The card captures a selection with it and hands the resulting
 * request to the board; it never resolves offsets, quotes or hashes itself.
 */
import {
  PAGE_TEXT_ROOT,
  buildSelectionSourceRequest,
  captureExactSelection,
  type CapturedPageSelection,
} from '@/components/collabboard/knowledgeSourceTextSelection';
import type { KnowledgeSourcePageRequest } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';

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

/** Page images, or the canonical parsed text for the same pages. */
export type KnowledgePdfCardView = 'page' | 'text';

export interface KnowledgePdfCardControlsProps {
  readonly boardId: string;
  readonly documentId: string;
  readonly status: KnowledgePdfProcessingStatus;
  readonly collapsed: boolean;
  readonly view: KnowledgePdfCardView;
  readonly loading?: boolean;
  readonly onToggleCollapse: () => void;
  readonly onToggleView: () => void;
  /** Inherits the host strip's icon colour when it renders these. */
  readonly iconColor?: string;
  /**
   * Drops the status chip once the document is ready. Set by a host whose bar
   * is shared with other controls: "Ready" is the steady state and the page
   * body already shows it, so the words only cost width the pencil needs.
   * Non-terminal and failed states are always shown.
   */
  readonly hideStatusWhenReady?: boolean;
  /**
   * Read-only board access. The controls still RENDER -- a viewer should see
   * what the document offers -- but none of them can be activated, using the
   * board's own permission authority rather than a second rule.
   */
  readonly disabled?: boolean;
}

/** Which host should show the document. Same reader either way. */
export type KnowledgePdfPresentation = 'workspace' | 'side-panel';

export interface KnowledgePdfOpenRequest {
  readonly documentId: string;
  readonly pageNumber?: number;
  /**
   * Open = the focused workspace; Add to side panel = the docked drawer beside
   * a still-usable board. The DOCUMENT is identical -- only the host differs --
   * so this never becomes a second reader or a second source.
   */
  readonly presentation?: KnowledgePdfPresentation;
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

/**
 * PDF-C1 Text -- the board's EXISTING Note-creation authority, carried on the
 * SAME transport as `onOpenDocument` and for the same reason: the card is
 * rendered from two hosts and eleven PostCardContent call sites, none of which
 * should grow a prop.
 *
 * This is `CanvasClient.handleCreateNoteFromKnowledgePage` and nothing else.
 * The card produces a `KnowledgeSourcePageRequest` and delegates; every draft,
 * every editor and every write stays where it already lives. Null for a reader
 * who cannot create posts, which is what removes the action from the card
 * rather than rendering it disabled -- the reader's own convention.
 */
const KnowledgePdfCreateNoteContext = createContext<((request: KnowledgeSourcePageRequest) => void) | null>(null);

export function KnowledgePdfOpenProvider({
  onOpenDocument,
  onStatusResolved = null,
  onCreateNoteFromPage = null,
  children,
}: {
  onOpenDocument: ((request: KnowledgePdfOpenRequest) => void) | null;
  /** Optional so a host without durable posts stays inert, as before. */
  onStatusResolved?: KnowledgePdfStatusReporter | null;
  /** Optional: omitting it leaves the card read-only, exactly as before. */
  onCreateNoteFromPage?: ((request: KnowledgeSourcePageRequest) => void) | null;
  children: React.ReactNode;
}) {
  return (
    <KnowledgePdfOpenContext.Provider value={onOpenDocument}>
      <KnowledgePdfStatusContext.Provider value={onStatusResolved}>
        <KnowledgePdfCreateNoteContext.Provider value={onCreateNoteFromPage}>
          {children}
        </KnowledgePdfCreateNoteContext.Provider>
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

/**
 * The board's Note-creation authority for one source page, or null when the
 * host wired none. Transport only: this never creates anything itself.
 */
export function useKnowledgePdfCreateNote() {
  return useContext(KnowledgePdfCreateNoteContext);
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

/**
 * Truthful backend state only. No percentage is derived from polls or time.
 *
 * `uploaded` reads as "Processing…" rather than "Uploading…": the row only
 * exists once the file has finished uploading, so the transfer is already
 * complete by the time this label can be shown. What the viewer is actually
 * waiting on is extraction.
 */
const STATUS_LABEL: Record<KnowledgePdfProcessingStatus, string> = {
  uploaded: 'Processing…', processing: 'Processing…', ready: 'Ready', failed: 'Processing failed',
};

/**
 * A document can report `ready` a moment before its pages are queryable, so
 * `/pages` answers 409 for a short window. That is a normal lifecycle state,
 * not a failure, and it must not latch: the card polls it out rather than
 * declaring the document empty. Bounded so a genuinely stuck document costs a
 * finite number of requests and then simply stops asking.
 */
const PAGES_RETRY_LIMIT = 12;
const PAGES_RETRY_DELAY_MS = 2000;
const TERMINAL = (status: KnowledgePdfProcessingStatus) => status === 'ready' || status === 'failed';

export interface KnowledgePdfCanvasSurfaceProps {
  readonly boardId: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly processingStatus: KnowledgePdfProcessingStatus;
  readonly displayMode?: KnowledgePdfDisplayMode;
  readonly onStatusResolved?: (status: KnowledgePdfProcessingStatus) => void;
  /**
   * Set by a host that renders {@link KnowledgePdfCardControls} in its own post
   * chrome (Freeform's top strip). The surface then draws no header, so the
   * object has exactly one bar, and takes its view state from the host below.
   */
  readonly hostRendersControls?: boolean;
  readonly collapsed?: boolean;
  readonly view?: KnowledgePdfCardView;
}

/**
 * The PDF placement's controls, as bare buttons with no bar of their own.
 *
 * Rendered by whichever chrome the host already has -- on Freeform that is the
 * post's existing top strip, so a PDF shows ONE bar carrying these controls
 * alongside the strip's own pencil, rather than a second header stacked under
 * it. Every action is read-only navigation or local view state, so nothing here
 * is permission-gated; see the surface's own note.
 */
export function KnowledgePdfCardControls({
  boardId,
  documentId,
  status,
  collapsed,
  view,
  loading = false,
  onToggleCollapse,
  onToggleView,
  iconColor,
  hideStatusWhenReady = false,
  disabled = false,
}: KnowledgePdfCardControlsProps) {
  const openDocument = useKnowledgePdfOpen();
  const isReady = status === 'ready';
  const button = 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded '
    + 'focus-visible:outline focus-visible:outline-1 '
    // The toolbar's own disabled convention: dimmed and visibly inert.
    + (disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-black/10');
  /**
   * The view selector's two halves. Active reuses the toolbar's own hover tint
   * as a pressed state rather than inventing a colour; inactive is dimmed, so
   * which mode you are in reads at a glance without a new visual language.
   */
  const viewButton = (active: boolean) => `${button} ${active ? 'bg-black/10' : 'opacity-60'}`;
  /** Selecting the mode you are already in is a no-op, not a toggle back. */
  const selectView = (next: KnowledgePdfCardView) => (event: React.MouseEvent) => {
    event.stopPropagation();
    if (view !== next) onToggleView();
  };
  // `data-no-drag` is the host strip's own convention for interactive children.
  const guard = {
    'data-no-drag': 'true',
    onPointerDown: (event: React.PointerEvent) => event.stopPropagation(),
  } as const;

  return (
    <>
      <button
        type="button"
        {...guard}
        disabled={disabled}
        data-knowledge-pdf-action="collapse"
        title={collapsed ? 'Expand' : 'Collapse'}
        aria-label={collapsed ? 'Expand' : 'Collapse'}
        aria-expanded={!collapsed}
        className={button}
        style={{ color: iconColor }}
        onClick={(event) => { event.stopPropagation(); onToggleCollapse(); }}
      >
        {collapsed
          ? <ChevronRight className="h-3 w-3" aria-hidden="true" />
          : <ChevronDown className="h-3 w-3" aria-hidden="true" />}
      </button>

      {/*
        The view selector: two halves of ONE choice, not two toggles. Each
        button selects its own mode and does nothing when that mode is already
        active, so neither can bounce you out of the view you asked for. Before
        the document is ready there is no parsed text to choose, so the icon
        stays the plain document marker it has always been.
      */}
      {isReady ? (
        <>
          <button
            type="button"
            {...guard}
            disabled={disabled}
            data-knowledge-pdf-action="page-view"
            data-knowledge-pdf-view={view}
            title="PDF pages"
            aria-label="PDF pages"
            aria-pressed={view === 'page'}
            className={viewButton(view === 'page')}
            onClick={selectView('page')}
          >
            <FileText className="h-3 w-3 text-red-500" aria-hidden="true" />
          </button>
          <button
            type="button"
            {...guard}
            disabled={disabled}
            data-knowledge-pdf-action="parsed-content"
            data-knowledge-pdf-view={view}
            title="Parsed text"
            aria-label="Parsed text"
            aria-pressed={view === 'text'}
            className={viewButton(view === 'text')}
            style={{ color: iconColor }}
            onClick={selectView('text')}
          >
            <Type className="h-3 w-3" aria-hidden="true" />
          </button>
        </>
      ) : (
        <FileText className="h-3 w-3 shrink-0 text-red-500" aria-hidden="true" />
      )}

      {hideStatusWhenReady && isReady ? null : (
        <span
          data-knowledge-pdf-status={status}
          className={`shrink-0 text-[9px] ${status === 'failed' ? 'text-red-600' : 'opacity-60'}`}
        >
          {STATUS_LABEL[status]}
        </span>
      )}

      {openDocument ? (
        <>
          <button
            type="button"
            {...guard}
            disabled={disabled}
            data-knowledge-pdf-action="open"
            title="Open"
            aria-label="Open"
            className={button}
            style={{ color: iconColor }}
            onClick={(event) => {
              event.stopPropagation();
              openDocument({ documentId, presentation: 'workspace' });
            }}
          >
            <Maximize2 className="h-3 w-3" aria-hidden="true" />
          </button>
          {/* The SAME reader and the same document as Open -- one reader
              implementation, one source. Only the host differs: this docks it
              beside a board that stays usable, where Open gives the document
              the whole surface. */}
          <button
            type="button"
            {...guard}
            disabled={disabled}
            data-knowledge-pdf-action="side-panel"
            title="Add to side panel"
            aria-label="Add to side panel"
            className={button}
            style={{ color: iconColor }}
            onClick={(event) => {
              event.stopPropagation();
              openDocument({ documentId, presentation: 'side-panel' });
            }}
          >
            <PanelRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </>
      ) : null}

      {isReady ? (disabled ? (
        /* An <a> takes no `disabled`, so a viewer gets the same affordance
           with no href: nothing to activate and nowhere to navigate. */
        <span
          data-knowledge-pdf-action="new-tab"
          aria-disabled="true"
          role="link"
          title="Open in new tab"
          aria-label="Open in new tab"
          className={button}
          style={{ color: iconColor }}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </span>
      ) : (
        <a
          {...guard}
          data-knowledge-pdf-action="new-tab"
          title="Open in new tab"
          aria-label="Open in new tab"
          href={`/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/original`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
          style={{ color: iconColor }}
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )) : null}
    </>
  );
}

export default function KnowledgePdfCanvasSurface({
  boardId,
  documentId,
  originalFilename,
  processingStatus,
  displayMode = 'preview',
  onStatusResolved,
  hostRendersControls = false,
  collapsed: collapsedProp,
  view: viewProp,
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
  const [ownCollapsed, setOwnCollapsed] = useState(false);
  const [ownView, setOwnView] = useState<KnowledgePdfCardView>('page');
  // Controlled by the host when it owns the chrome; otherwise the surface keeps
  // its own state, so the fallback header behaves exactly as before.
  const collapsed = collapsedProp ?? ownCollapsed;
  const view = viewProp ?? ownView;
  const toggleCollapse = useCallback(() => setOwnCollapsed((value) => !value), []);
  const toggleView = useCallback(() => setOwnView((value) => (value === 'page' ? 'text' : 'page')), []);

  /**
   * The canonical page text, from the SAME endpoint the reader uses. Fetched
   * once per ready document and only while expanded, so a collapsed card costs
   * nothing. It serves two jobs: the parsed-content view, and the per-page
   * fallback whenever a page has no rendered image.
   */
  /**
   * The shared, user-scoped memory of every Ready document this session has
   * already read. Null outside a provider, in which case everything below is
   * exactly the fetch-on-mount path it always was.
   */
  const pageCache = useKnowledgePageCache();
  /**
   * Seeded from the cache, so a card remounting onto a document this session
   * already knows paints its text on the FIRST render -- there is no null
   * state to flash, and `documentLoading` below is false from the start.
   */
  const [pages, setPages] = useState<readonly KnowledgeDocumentDetailPage[] | null>(
    () => pageCache?.read(documentId)?.pages ?? null,
  );
  const [pagesFailed, setPagesFailed] = useState(false);
  /** A 409 was seen: extraction is still finishing, so the wait is expected. */
  const [pagesPreparing, setPagesPreparing] = useState(false);
  /** Bumped only by a 409, which is what re-runs the effect for another try. */
  const [pagesAttempt, setPagesAttempt] = useState(0);
  const [imagelessPages, setImagelessPages] = useState<ReadonlySet<number>>(() => new Set());
  /**
   * PDF-C1 single-page preview. The canvas object is a strong preview and page
   * CONTROLLER, not a second reader: exactly one page is on screen and the
   * navigator below moves between them. Full-document reading stays in Open and
   * the side panel, which is why nothing here scrolls through a whole document.
   *
   * Presentation only, and deliberately card-local: which page you are looking
   * at is not a property of the board, writes no padlet metadata and issues no
   * request -- the same reasoning that keeps `collapsed` and `view` local, and
   * what keeps all three usable by a read-only viewer.
   */
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    if (!isReady || collapsed || pages || pagesFailed || !boardId) return;
    // The attempt counter is the loop bound. Past it the card stops asking and
    // keeps the preparing state: nothing observed says the document failed, so
    // claiming it did would be the same false terminal this patch removes.
    if (pagesAttempt >= PAGES_RETRY_LIMIT) return;
    let cancelled = false;
    let retryTimer = 0;
    (async () => {
      // The SAME `/pages` read, now shared: a request already in flight for
      // this document is joined rather than duplicated, and a Ready answer is
      // remembered for every other view of the same document.
      const result = pageCache
        ? await pageCache.load(boardId, documentId)
        : await fetchKnowledgeReadyPages(boardId, documentId);
      if (cancelled) return;
      // 409 is "not ready yet", the one status that must never latch, and the
      // one the cache deliberately refuses to store. Only the timer advances
      // the attempt, so exactly one request is ever in flight and a retry
      // cannot stack on the request that scheduled it.
      if (result.status === 'preparing') {
        setPagesPreparing(true);
        retryTimer = window.setTimeout(() => {
          if (!cancelled) setPagesAttempt((attempt) => attempt + 1);
        }, PAGES_RETRY_DELAY_MS);
        return;
      }
      if (result.status === 'failed') {
        // Text is enhancement over the status the card already shows truthfully.
        setPagesFailed(true);
        return;
      }
      setPagesPreparing(false);
      setPages(result.entry.pages);
    })();
    return () => { cancelled = true; window.clearTimeout(retryTimer); };
  }, [isReady, collapsed, pages, pagesFailed, pagesAttempt, boardId, documentId]);

  /**
   * PDF-R1. A missing derivative is now a recoverable state, not a silent
   * downgrade to text. The repair is requested at most once per document per
   * mount; when it completes, every imageless marker for this document is
   * dropped so the page is genuinely probed again.
   */
  const onRepairComplete = useCallback(() => {
    pageCache?.clearPageImageless(documentId);
    setImagelessPages(new Set());
  }, [pageCache, documentId]);
  const repair = useKnowledgePageRenderRepair(boardId, documentId, onRepairComplete);

  const markImageless = useCallback((pageNumber: number) => {
    // Also remembered session-wide, so this document's missing derivative is
    // not re-probed by every later mount of every view.
    pageCache?.markPageImageless(documentId, pageNumber);
    setImagelessPages((current) => {
      if (current.has(pageNumber)) return current;
      const next = new Set(current);
      next.add(pageNumber);
      return next;
    });
  }, [pageCache, documentId]);

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

  /**
   * The navigator's range comes from the pages actually in hand, not from the
   * document's declared pageCount: a page this client cannot render is one it
   * must not offer to navigate to.
   */
  const pageTotal = pages?.length ?? 0;
  /**
   * Clamped on read rather than corrected in an effect. Pages arrive after the
   * first render, and a document can be replaced under a longer-lived card, so
   * the displayed page is derived from what exists right now -- there is no
   * intermediate render where the index points past the end.
   */
  const pageNumber = pageTotal > 0 ? Math.min(Math.max(currentPage, 1), pageTotal) : 1;
  const currentPageData = pages && pageTotal > 0 ? pages[pageNumber - 1] : null;
  const canPagePrevious = pageNumber > 1;
  const canPageNext = pageNumber < pageTotal;
  /** Movement is clamped here too, so no caller can push the page out of range. */
  const goToPage = useCallback((next: number) => {
    setCurrentPage((current) => {
      const total = pages?.length ?? 0;
      if (total <= 0) return current;
      return Math.min(Math.max(next, 1), total);
    });
  }, [pages]);

  /**
   * The SAME citations the reader paints, and the same note colours, resolved
   * by the same domain functions. Nothing here decides what a highlight is:
   * the span resolver is the sole authority, so a drifted or page-only
   * reference paints nothing in the card exactly as it paints nothing in the
   * side panel. A card outside the provider simply gets no highlights.
   */
  const references = useKnowledgeSourceReferencesForDocument(documentId);
  const noteColors = useKnowledgeSourceNoteColors();

  /**
   * PDF-C1 Text -- selecting source text on the page that is actually visible.
   *
   * Everything below is the READER's contract, imported: the same capture, the
   * same refusals, the same request builder, the same board callback. What is
   * local here is one piece of transient UI state -- which selection the user
   * has right now -- exactly as the reader keeps its own. No second state
   * machine, no second provenance model, and no persistence: this component
   * still never writes anything.
   */
  const createNoteFromPage = useKnowledgePdfCreateNote();
  const pageTextContainerRef = useRef<HTMLDivElement | null>(null);
  const [capturedSelection, setCapturedSelection] = useState<CapturedPageSelection | null>(null);

  /**
   * Proved against the page ON SCREEN, never a remembered one. `pages` is the
   * cached document and `pageNumber` the displayed index, so a selection made
   * on page 3 can only ever resolve to page 3 -- the capture reads the page
   * number off the paragraph it measured and refuses a range whose text does
   * not match that page's canonical string.
   */
  const handleSelectionSettled = useCallback(() => {
    setCapturedSelection(captureExactSelection(pageTextContainerRef.current, pages ?? []));
  }, [pages]);

  /**
   * A selection belongs to the page and representation it was made in. Paging
   * away or switching PDF/T unmounts that paragraph, so keeping the capture
   * would leave an action pointing at text nobody can see any more.
   */
  useEffect(() => { setCapturedSelection(null); }, [pageNumber, view, collapsed]);

  /**
   * The one place a captured selection becomes the board's problem. Delegates
   * verbatim: the card builds no draft, opens no editor, touches no reference
   * table and calls no API. Absent authority means no action was rendered.
   */
  const createNoteFromSelection = useCallback(() => {
    if (!createNoteFromPage || !capturedSelection) return;
    createNoteFromPage(buildSelectionSourceRequest(
      documentId,
      originalFilename,
      pages ?? [],
      capturedSelection,
      null,
    ));
    setCapturedSelection(null);
  }, [createNoteFromPage, capturedSelection, documentId, originalFilename, pages]);

  /** The pager's two arrows: the toolbar's disabled convention, one place. */
  const pagerButton = (enabled: boolean) =>
    'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded '
    + 'focus-visible:outline focus-visible:outline-1 '
    + (enabled ? 'text-gray-600 hover:bg-gray-200' : 'cursor-not-allowed text-gray-300');

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
        PDF-C1. On Freeform the host renders KnowledgePdfCardControls inside
        the post's own top strip, so this surface draws NO header of its own --
        one object, one bar. A host that does not (the common card content)
        still gets the fallback header below.
      */}
      {hostRendersControls ? null : (
        <div
          data-knowledge-pdf-header="true"
          className="flex select-none items-center gap-1 border-b border-gray-200 bg-gray-100 px-1.5 py-1"
        >
          <KnowledgePdfCardControls
            boardId={boardId}
            documentId={documentId}
            status={status}
            collapsed={collapsed}
            view={view}
            loading={documentLoading}
            onToggleCollapse={toggleCollapse}
            onToggleView={toggleView}
          />
          {/* The host strip shows the filename as the post's title; this
              fallback header has no title row, so it names the file itself. */}
          <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-gray-700" title={originalFilename}>
            {originalFilename}
          </span>
        </div>
      )}

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
          ref={pageTextContainerRef}
          data-knowledge-pdf-body="true"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-1.5 py-1.5"
          onWheel={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          /* The reader's own settle points, for the same reason: a selection is
             only real once the gesture has ended. */
          onMouseUp={handleSelectionSettled}
          onKeyUp={handleSelectionSettled}
        >
          {!isReady ? (
            <div className="px-1 py-2 text-[10px] text-gray-500">{STATUS_LABEL[status]}</div>
          ) : documentLoading ? (
            /* The one loading indicator, in the body where it is visible
               without hovering -- the strip's controls are hover-revealed, so
               an indicator there could never be seen while it mattered. */
            <div data-knowledge-pdf-loading="true" className="px-1 py-2 text-[10px] italic text-gray-400">
              {/* Still a non-numeric state, and now it distinguishes the two
                  reasons for waiting: fetching pages that exist, versus pages
                  the backend has not finished extracting. No estimate is
                  shown -- the duration is not something this client knows. */}
              {pagesPreparing ? 'Preparing document…' : 'Loading document…'}
            </div>
          ) : currentPageData ? (
            /*
              EXACTLY ONE page is mounted -- not one visible among many. A
              hidden sibling would still request its image and still be found by
              a search of the card, which is precisely the multi-page reader
              this object is not.
            */
            <section
              key={currentPageData.pageNumber}
              data-knowledge-pdf-page={currentPageData.pageNumber}
            >
              <div className="mb-0.5 select-none text-[8px] uppercase tracking-wider text-gray-400">
                Page {currentPageData.pageNumber}
              </div>
              {view === 'page' && !imagelessPages.has(currentPageData.pageNumber) ? (
                <KnowledgeDocumentPageImage
                  boardId={boardId}
                  documentId={documentId}
                  pageNumber={currentPageData.pageNumber}
                  originalFilename={originalFilename}
                  widthPoints={currentPageData.widthPoints}
                  heightPoints={currentPageData.heightPoints}
                  rotation={currentPageData.rotation}
                  onUnavailable={() => {
                    markImageless(currentPageData.pageNumber);
                    // Discovering the gap is what asks for it to be filled.
                    repair.request();
                  }}
                />
              ) : null}
              {/*
                PDF/page means the VISUAL page. When the derivative is missing
                this says so and offers to build it, rather than quietly
                rendering parsed text under a control that claims to be showing
                the document -- which is what it used to do.
              */}
              {view === 'page' && imagelessPages.has(currentPageData.pageNumber) ? (
                <div
                  data-knowledge-pdf-page-visual-state={
                    repair.state === 'unavailable' ? 'unavailable' : 'preparing'
                  }
                  className="mb-2 flex flex-col items-center justify-center gap-1 rounded border border-dashed border-gray-300 bg-gray-50 px-2 py-6 text-center"
                >
                  {repair.state === 'unavailable' ? (
                    <>
                      <span className="text-[10px] text-gray-500">Page preview unavailable</span>
                      <button
                        type="button"
                        data-knowledge-pdf-action="retry-page-visual"
                        className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-100"
                        onClick={(event) => { event.stopPropagation(); repair.retry(); }}
                      >
                        Retry
                      </button>
                    </>
                  ) : (
                    <span className="text-[10px] text-gray-500">Preparing page preview…</span>
                  )}
                </div>
              ) : null}
              {view === 'text' ? (
                <p
                  data-knowledge-pdf-page-text="true"
                  /*
                    PDF-C1 Text. Two attributes, both load-bearing.

                    PAGE_TEXT_ROOT is the reader's coordinate-space marker: the
                    capture measures offsets from this paragraph's start and
                    reads its page number straight off this attribute, so the
                    displayed page is the only page a selection here can
                    produce.

                    data-no-drag is the canvas's OWN existing exemption.
                    `handlePadletMouseDown` runs in capture phase on every card
                    and calls `lockBodySelection()` -- document.body
                    user-select: none for the duration of the gesture -- unless
                    the target is inside `[data-no-drag="true"]`, in which case
                    it returns before both the lock AND the drag arming. That
                    single early return is what makes real text selection
                    possible here and what stops a selection gesture from
                    dragging the card. The pager already relies on it; nothing
                    outside this paragraph changes, so a drag begun anywhere
                    else on the card still moves it exactly as before.
                  */
                  data-no-drag="true"
                  {...{ [PAGE_TEXT_ROOT]: currentPageData.pageNumber }}
                  className="whitespace-pre-wrap break-words text-[9px] leading-snug text-gray-700"
                >
                  {/*
                    The SAME resolver, given the page actually on screen. This is
                    the whole provenance contract of the switcher: the displayed
                    page number is what reaches the citation authority, so a
                    reference recorded against p.3 paints on page 3 and nowhere
                    else. Nothing here decides what a highlight is.
                  */}
                  {knowledgeSourceHighlightSegments(
                    references,
                    currentPageData.pageNumber,
                    currentPageData.text,
                  )
                    .map((segment) => {
                      const highlight = segment.spans.length > 0
                        ? knowledgeSourceHighlightColor(segment.spans, noteColors)
                        : null;
                      if (!highlight) {
                        return <React.Fragment key={segment.start}>{segment.text}</React.Fragment>;
                      }
                      return (
                        <mark
                          key={segment.start}
                          data-knowledge-pdf-highlight="true"
                          className="rounded-[2px] bg-transparent px-0 text-inherit"
                          style={{ backgroundColor: highlight.backgroundColor }}
                        >
                          {segment.text}
                        </mark>
                      );
                    })}
                </p>
              ) : null}
              {/*
                The reader's action, on the card. Rendered only when there is
                a proved selection AND the board wired its creation authority
                -- the same two conditions the reader's own floating Note Post
                is gated on (`onCreateNoteFromPage && documentId && selection`).
                A viewer is given no callback, so no mutation action exists to
                click rather than a disabled one to explain.
              */}
              {createNoteFromPage && capturedSelection
                && capturedSelection.pageNumber === currentPageData.pageNumber ? (
                <div className="mt-1 flex justify-end">
                  <button
                    type="button"
                    data-no-drag="true"
                    data-knowledge-pdf-action="create-note"
                    aria-label={`Create Note from selection on page ${capturedSelection.pageNumber}`}
                    className="shrink-0 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] text-blue-700 hover:bg-blue-100 hover:text-blue-900"
                    /* The card is dragged by its chrome and the canvas pans
                       under it, so a press that begins on this action belongs
                       to the action alone -- the pager's own rule. */
                    onPointerDown={(event) => event.stopPropagation()}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => { event.stopPropagation(); createNoteFromSelection(); }}
                  >
                    Create Note
                  </button>
                </div>
              ) : null}
            </section>
          ) : (
            <div className="px-1 py-2 text-[10px] text-gray-500">
              Page content is not available for this document.
            </div>
          )}
        </div>
      )}

      {/*
        The page navigator. Permanent while expanded -- it is how this object is
        read, so hiding it behind hover would hide the only way to move. It sits
        outside the body so the page can never scroll it out of reach, and it is
        absent entirely when there is nothing to page through (collapsed, still
        processing, or a document with no usable pages).
      */}
      {!collapsed && currentPageData && pageTotal > 0 ? (
        <div
          data-knowledge-pdf-pager="true"
          data-no-drag="true"
          className="flex shrink-0 select-none items-center justify-center gap-2 border-t border-gray-200 bg-gray-50 px-1.5 py-1"
          /* The card is dragged by its header and the canvas pans under it, so
             a press that begins on the pager belongs to the pager alone. */
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            data-no-drag="true"
            data-knowledge-pdf-action="page-previous"
            title="Previous page"
            aria-label="Previous page"
            disabled={!canPagePrevious}
            className={pagerButton(canPagePrevious)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); goToPage(pageNumber - 1); }}
          >
            <ChevronLeft className="h-3 w-3" aria-hidden="true" />
          </button>
          <span
            data-knowledge-pdf-page-indicator="true"
            className="min-w-0 text-[9px] tabular-nums text-gray-600"
          >
            {pageNumber} / {pageTotal}
          </span>
          <button
            type="button"
            data-no-drag="true"
            data-knowledge-pdf-action="page-next"
            title="Next page"
            aria-label="Next page"
            disabled={!canPageNext}
            className={pagerButton(canPageNext)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => { event.stopPropagation(); goToPage(pageNumber + 1); }}
          >
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
