"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import KnowledgeDocumentDetails, { type KnowledgeDocumentDetailPage } from '@/components/collabboard/KnowledgeDocumentDetails';
import KnowledgeSourceNotesPanel from '@/components/collabboard/KnowledgeSourceNotesPanel';
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

export interface KnowledgeSourceReaderDrawerProps {
  /**
   * A Note asking for its exact citation. Handled at most once per requestId,
   * so a re-render -- or a toolbar collapse -- never replays the last source.
   */
  sourceOpenRequest?: KnowledgeSourceOpenRequest | null;
  /** A library or semantic-result pick. Same once-per-requestId contract. */
  documentOpenRequest?: KnowledgeDocumentOpenRequest | null;
  /** Forwarded verbatim. The canvas still owns placement and every write. */
  onCreateNoteFromPage?: (request: KnowledgeSourcePageRequest) => void;
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
      loading: true, error: false, initialPageNumber, sourceTarget,
    });
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/pages`);
      const payload = await response.json().catch(() => null) as { pages?: unknown; document?: unknown } | null;
      if (!response.ok || !payload || !Array.isArray(payload.pages)) throw new Error('details unavailable');
      if (generation !== readGenerationRef.current) return;
      setReader({
        documentId,
        ...documentMetadata(payload.document),
        pages: payload.pages.filter(isDetailPage),
        loading: false, error: false, initialPageNumber, sourceTarget,
      });
    } catch {
      if (generation !== readGenerationRef.current) return;
      setReader((current) => (current?.documentId === documentId
        ? { ...current, loading: false, error: true }
        : current));
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

  if (!boardId || reader === null) return null;

  return (
    <aside
      data-knowledge-reader="true"
      role="complementary"
      aria-label="Knowledge reader"
      // Overlay, never a layout reservation: the board keeps its full width and
      // no layout implementation learns that this drawer exists. `lg:w-[760px]`
      // is the SAME overlay, merely wide enough to also fit the Source Notes
      // pane beside the unchanged 420px reading experience.
      className="fixed inset-y-0 right-0 z-[1200] flex w-full flex-col border-l border-gray-200 bg-white shadow-2xl md:w-[420px] lg:w-[760px]"
    >
      <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-3">
        <span className="select-none text-[9px] font-medium uppercase leading-none tracking-wider text-gray-400">
          Knowledge
        </span>
        <button
          ref={closeButtonRef}
          type="button"
          aria-label="Close Knowledge reader"
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          onClick={closeReader}
        >
          ×
        </button>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3 lg:w-[420px] lg:flex-none">
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
            onCreateNoteFromPage={onCreateNoteFromPage}
            onOpenBacklinkTarget={onOpenBacklinkTarget}
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
        */}
        {onOpenBacklinkTarget ? (
          <div
            data-knowledge-source-notes-pane="true"
            className="hidden min-h-0 w-[340px] flex-none overflow-y-auto overscroll-contain border-l border-gray-100 px-4 py-3 lg:block"
          >
            <KnowledgeSourceNotesPanel documentId={reader.documentId} onOpenNote={onOpenBacklinkTarget} />
          </div>
        ) : null}
      </div>
    </aside>
  );
}
