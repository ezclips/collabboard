"use client";

import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import KnowledgeDocumentDetails, { type KnowledgeDocumentDetailPage } from '@/components/collabboard/KnowledgeDocumentDetails';
import type { KnowledgeSourcePageRequest } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';
import type { KnowledgeSourceOpenRequest } from '@/lib/domain/knowledge/knowledgeSourceNavigation';
import {
  listKnowledgePdfs,
  type KnowledgePdfProcessingStatus,
} from '@/components/collabboard/KnowledgePdfUploader';

const STATUS_LABELS: Record<KnowledgePdfProcessingStatus, string> = {
  uploaded: 'Uploaded',
  processing: 'Processing…',
  ready: 'Ready',
  failed: 'Failed',
};

export interface KnowledgeDocumentsListProps {
  /**
   * Bumped by the parent when an upload has changed server state. This surface
   * deliberately has no polling loop of its own: KnowledgePdfUploader already
   * owns one, and a second timer over the same endpoint would double the load
   * for no extra information.
   */
  refreshToken?: number;
  isOpen?: boolean;
  onClose?: () => void;
  /** Forwarded verbatim to the page reader; absent when the viewer cannot create posts. */
  onCreateNoteFromPage?: (request: KnowledgeSourcePageRequest) => void;
  /**
   * P6J-F6-B2. A Note asking for its exact source. Handled at most once per
   * requestId, so closing the modal and reopening it manually never replays
   * the last source.
   */
  sourceOpenRequest?: KnowledgeSourceOpenRequest | null;
  /**
   * P6J-F6-B3N. Forwarded to the canvas after this surface closes. Nothing is
   * stored -- one direct user event, so reopening by hand replays nothing.
   */
  onOpenBacklinkTarget?: (targetPadletId: string) => void;
}

interface KnowledgeListEntry {
  id: string;
  originalFilename: string;
  pageCount: number | null;
  processingStatus: KnowledgePdfProcessingStatus | null;
  statusLabel: string | null;
}

type ListPhase = 'loading' | 'loaded' | 'error';

interface KnowledgeDetailsState {
  entry: KnowledgeListEntry;
  pages: readonly KnowledgeDocumentDetailPage[];
  loading: boolean;
  error: boolean;
  /** Navigation state only -- never written back to source_references. */
  initialPageNumber?: number;
}

interface KnowledgeSearchResult { documentId: string; originalFilename: string; pageStart: number; pageEnd: number; text: string; }
type SearchPhase = 'idle' | 'loading' | 'loaded' | 'error';
type WarmPhase = 'idle' | 'warming' | 'ready' | 'failed';
function isProcessingStatus(value: unknown): value is KnowledgePdfProcessingStatus {
  return value === 'uploaded' || value === 'processing' || value === 'ready' || value === 'failed';
}

/**
 * The response is treated as untrusted input. A row is rendered only when it
 * carries the two fields this surface actually needs; every other field
 * degrades to "omitted" instead of throwing. A malformed row therefore costs
 * that row, never the board.
 */
function toEntry(value: unknown): KnowledgeListEntry | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || record.id.length === 0) return null;
  if (typeof record.originalFilename !== 'string' || record.originalFilename.length === 0) return null;

  const rawPageCount = record.pageCount;
  const pageCount = typeof rawPageCount === 'number'
    && Number.isInteger(rawPageCount)
    && rawPageCount > 0
    ? rawPageCount
    : null;

  return {
    id: record.id,
    originalFilename: record.originalFilename,
    pageCount,
    processingStatus: isProcessingStatus(record.processingStatus) ? record.processingStatus : null,
    statusLabel: isProcessingStatus(record.processingStatus)
      ? STATUS_LABELS[record.processingStatus]
      : null,
  };
}

function metadataLine(entry: KnowledgeListEntry): string | null {
  const parts: string[] = [];
  if (entry.pageCount !== null) {
    parts.push(entry.pageCount === 1 ? '1 page' : `${entry.pageCount} pages`);
  }
  if (entry.statusLabel !== null) parts.push(entry.statusLabel);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function originalPdfPath(boardId: string, documentId: string) {
  return `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/original`;
}

function toSearchResult(value: unknown): KnowledgeSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const pageStart = record.pageStart;
  const pageEnd = record.pageEnd;
  if (
    typeof record.documentId !== 'string' || record.documentId.length === 0
    || typeof record.originalFilename !== 'string' || record.originalFilename.length === 0
    || typeof pageStart !== 'number' || !Number.isInteger(pageStart) || pageStart < 1
    || typeof pageEnd !== 'number' || !Number.isInteger(pageEnd) || pageEnd < pageStart
    || typeof record.text !== 'string'
  ) return null;
  return { documentId: record.documentId, originalFilename: record.originalFilename, pageStart, pageEnd, text: record.text };
}

function parseSearchResults(value: unknown): readonly KnowledgeSearchResult[] | null {
  if (!value || typeof value !== 'object' || !Array.isArray((value as Record<string, unknown>).results)) return null;
  return (value as { results: unknown[] }).results
    .map(toSearchResult)
    .filter((result): result is KnowledgeSearchResult => result !== null);
}
function pageLabel(result: KnowledgeSearchResult): string {
  return result.pageStart === result.pageEnd
    ? `Page ${result.pageStart}`
    : `Pages ${result.pageStart}–${result.pageEnd}`;
}

interface KnowledgeWarmSubscription { promise: Promise<boolean>; release: () => void; }
interface KnowledgeWarmFlight { controller: AbortController; consumers: Set<symbol>; promise: Promise<boolean>; }
const knowledgeWarmFlights = new Map<string, KnowledgeWarmFlight>();

function subscribeToKnowledgeWarm(boardId: string): KnowledgeWarmSubscription {
  let flight = knowledgeWarmFlights.get(boardId);
  if (!flight) {
    const controller = new AbortController();
    let currentFlight: KnowledgeWarmFlight;
    const timeout = setTimeout(() => controller.abort(), 120_000);
    const promise = fetch(`/api/boards/${encodeURIComponent(boardId)}/knowledge/warm`, { method: 'POST', signal: controller.signal })
      .then((response) => !controller.signal.aborted && response.ok)
      .catch(() => false)
      .finally(() => {
        clearTimeout(timeout);
        if (knowledgeWarmFlights.get(boardId) === currentFlight) knowledgeWarmFlights.delete(boardId);
      });
    currentFlight = { controller, consumers: new Set(), promise };
    flight = currentFlight;
    knowledgeWarmFlights.set(boardId, flight);
  }
  const consumer = Symbol('knowledge-warm');
  flight.consumers.add(consumer);
  let released = false;
  return {
    promise: flight.promise,
    release: () => {
      if (released) return;
      released = true;
      flight!.consumers.delete(consumer);
      if (flight!.consumers.size === 0) {
        queueMicrotask(() => {
          if (flight!.consumers.size === 0 && knowledgeWarmFlights.get(boardId) === flight) flight!.controller.abort();
        });
      }
    },
  };
}

/**
 * Read-only list of the PDFs already attached to the current board.
 *
 * The data reader remains mounted with the board so its GET lifecycle stays
 * unchanged; only the presentation is gated by isOpen.
 *
 * No client-side role gating: whatever the server returns is rendered, so
 * read-only collaborators see the same list an editor does.
 */
export default function KnowledgeDocumentsList({ refreshToken = 0, isOpen = true, onClose, onCreateNoteFromPage, sourceOpenRequest = null, onOpenBacklinkTarget }: KnowledgeDocumentsListProps) {
  const params = useParams<{ id: string }>();
  const boardId = params?.id;
  const [phase, setPhase] = useState<ListPhase>('loading');
  const [entries, setEntries] = useState<readonly KnowledgeListEntry[]>([]);
  const [details, setDetails] = useState<KnowledgeDetailsState | null>(null);
  const [searchQuery, setSearchQuery] = useState(''), [searchPhase, setSearchPhase] = useState<SearchPhase>('idle'), [searchResults, setSearchResults] = useState<readonly KnowledgeSearchResult[]>([]);
  const [warmPhase, setWarmPhase] = useState<WarmPhase>('idle');
  const searchControllerRef = useRef<AbortController | null>(null);
  const searchGenerationRef = useRef(0);
  const warmGenerationRef = useRef(0);
  const warmReleaseRef = useRef<(() => void) | null>(null);
  const queuedSearchRef = useRef<string | null>(null);
  const executeSearchRef = useRef<(query: string) => void>(() => undefined);
  const handledSourceRequestRef = useRef<number | null>(null);

  useEffect(() => {
    if (!boardId) return;

    const controller = new AbortController();
    let cancelled = false;
    setPhase('loading');

    void (async () => {
      try {
        const documents = await listKnowledgePdfs(
          boardId,
          (input, init) => fetch(input, { ...init, signal: controller.signal }),
        );
        if (cancelled) return;
        setEntries(
          (documents as readonly unknown[])
            .map(toEntry)
            .filter((entry): entry is KnowledgeListEntry => entry !== null),
        );
        setPhase('loaded');
      } catch {
        if (!cancelled) setPhase('error');
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [boardId, refreshToken]);

  useEffect(() => () => {
    searchGenerationRef.current += 1;
    searchControllerRef.current?.abort();
    queuedSearchRef.current = null;
    warmReleaseRef.current?.();
    warmReleaseRef.current = null;
    warmGenerationRef.current += 1;
  }, []);
  useEffect(() => {
    if (isOpen) return;
    searchGenerationRef.current += 1;
    searchControllerRef.current?.abort();
    queuedSearchRef.current = null;
  }, [isOpen]);

  useEffect(() => {
    if (!boardId || !isOpen) return;
    const generation = ++warmGenerationRef.current;
    const subscription = subscribeToKnowledgeWarm(boardId);
    warmReleaseRef.current = subscription.release;
    setWarmPhase('warming');
    void subscription.promise.then((ready) => {
      if (generation !== warmGenerationRef.current) return;
      warmReleaseRef.current = null;
      setWarmPhase(ready ? 'ready' : 'failed');
      const queued = queuedSearchRef.current;
      queuedSearchRef.current = null;
      if (queued) executeSearchRef.current(queued);
    });
    return () => {
      if (warmGenerationRef.current === generation) {
        warmGenerationRef.current += 1;
        queuedSearchRef.current = null;
        warmReleaseRef.current?.();
        warmReleaseRef.current = null;
      } else subscription.release();
    };
  }, [boardId, isOpen]);

  const executeSearch = async (query: string) => {
    if (!boardId) return;
    searchGenerationRef.current += 1;
    const generation = searchGenerationRef.current;
    searchControllerRef.current?.abort();
    const controller = new AbortController();
    searchControllerRef.current = controller;
    setSearchPhase('loading');
    setSearchResults([]);
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/knowledge/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      const results = response.ok ? parseSearchResults(payload) : null;
      if (!results) throw new Error('search unavailable');
      if (generation !== searchGenerationRef.current) return;
      setSearchResults(results);
      setSearchPhase('loaded');
    } catch {
      if (controller.signal.aborted || generation !== searchGenerationRef.current) return;
      setSearchResults([]);
      setSearchPhase('error');
    } finally {
      if (searchControllerRef.current === controller) searchControllerRef.current = null;
    }
  };
  executeSearchRef.current = (query) => { void executeSearch(query); };

  const submitSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!boardId || query.length === 0) return;
    if (warmPhase === 'warming') {
      queuedSearchRef.current = query;
      setSearchPhase('idle');
      setSearchResults([]);
      return;
    }
    void executeSearch(query);
  };

  /**
   * Clearing the field leaves search mode and restores the document list. The
   * `searchPhase === 'idle'` guard is what keeps this away from B2: a query
   * queued behind a pending warm is still `idle`, so ordinary typing can never
   * cancel or rewrite that queued intent.
   */
  const changeSearchQuery = (value: string) => {
    setSearchQuery(value);
    if (value.trim().length > 0 || searchPhase === 'idle') return;
    searchGenerationRef.current += 1;
    searchControllerRef.current?.abort();
    setSearchResults([]);
    setSearchPhase('idle');
  };

  /**
   * The document's own response is the better source of its display metadata
   * than whatever the caller happened to hold: the pages endpoint already
   * returns id, filename and page count, so opening by id alone is fully
   * supported and a stale or synthesized entry gets corrected on arrival.
   */
  function hydrateEntry(entry: KnowledgeListEntry, value: unknown): KnowledgeListEntry {
    if (!value || typeof value !== 'object') return entry;
    const record = value as Record<string, unknown>;
    // Identity is never overwritten from the payload -- the id we asked for is
    // the id we show.
    return {
      ...entry,
      originalFilename: typeof record.originalFilename === 'string' && record.originalFilename.length > 0
        ? record.originalFilename
        : entry.originalFilename,
      pageCount: typeof record.pageCount === 'number' && Number.isInteger(record.pageCount) && record.pageCount > 0
        ? record.pageCount
        : entry.pageCount,
    };
  }

  const openDetails = async (entry: KnowledgeListEntry, initialPageNumber?: number) => {
    if (!boardId) return;
    setDetails({ entry, pages: [], loading: true, error: false, initialPageNumber });
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(entry.id)}/pages`);
      const payload = await response.json().catch(() => null) as { pages?: unknown; document?: unknown } | null;
      if (!response.ok || !payload || !Array.isArray(payload.pages)) throw new Error('details unavailable');
      const pages = payload.pages.filter((page): page is KnowledgeDocumentDetailPage => (
        !!page && typeof page === 'object' && typeof (page as KnowledgeDocumentDetailPage).pageNumber === 'number' && typeof (page as KnowledgeDocumentDetailPage).text === 'string'
      ));
      setDetails({ entry: hydrateEntry(entry, payload.document), pages, loading: false, error: false, initialPageNumber });
    } catch {
      setDetails((current) => current?.entry.id === entry.id ? { ...current, loading: false, error: true } : current);
    }
  };

  /**
   * Opens a source by DOCUMENT ID. Identity is the id and only the id: two
   * sources can share a filename, so a name-based lookup would open the wrong
   * document. A known list entry is reused when present purely to show a
   * filename sooner; the request still decides which document loads.
   */
  const openDetailsByDocumentId = (documentId: string, initialPageNumber?: number) => {
    const known = entries.find((candidate) => candidate.id === documentId);
    void openDetails(
      known ?? { id: documentId, originalFilename: '', pageCount: null, processingStatus: null, statusLabel: null },
      initialPageNumber,
    );
  };

  // Each requestId is acted on at most once. Without this latch, closing the
  // modal and reopening it by hand would replay the last source the user
  // clicked, which is not what reopening a library means.
  useEffect(() => {
    if (!boardId || !sourceOpenRequest) return;
    if (handledSourceRequestRef.current === sourceOpenRequest.requestId) return;
    handledSourceRequestRef.current = sourceOpenRequest.requestId;
    openDetailsByDocumentId(sourceOpenRequest.sourceDocumentId, sourceOpenRequest.pageStart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, sourceOpenRequest]);

  const closeSurface = () => {
    setDetails(null);
    onClose?.();
  };

  useEffect(() => {
    if (!isOpen || !onClose) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSurface();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!boardId || !isOpen) return null;

  return (
    <div
      data-knowledge-documents="true"
      role="dialog"
      aria-modal="true"
      aria-label="Knowledge documents"
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50 p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) closeSurface();
      }}
    >
      <div
        className="relative max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="select-none text-[9px] font-medium uppercase leading-none tracking-wider text-gray-400">
            Knowledge
          </span>
          <button
            type="button"
            aria-label="Close Knowledge"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            onClick={closeSurface}
          >
            ×
          </button>
        </div>

        {details ? (
          <KnowledgeDocumentDetails
            documentId={details.entry.id}
            originalFilename={details.entry.originalFilename}
            pageCount={details.entry.pageCount}
            pages={details.pages}
            loading={details.loading}
            error={details.error}
            initialPageNumber={details.initialPageNumber}
            onBack={() => setDetails(null)}
            onCreateNoteFromPage={onCreateNoteFromPage}
            onOpenBacklinkTarget={onOpenBacklinkTarget
              ? (targetPadletId) => {
                // Close first, then hand the canvas the target: the reader is a
                // modal over the board, so the Note must not open behind it.
                closeSurface();
                onOpenBacklinkTarget(targetPadletId);
              }
              : undefined}
          />
        ) : (
          <>
            <form className="mt-3 flex gap-2" onSubmit={(event) => void submitSearch(event)}>
              <input
                type="search"
                aria-label="Search Knowledge"
                placeholder="Search across PDFs…"
                value={searchQuery}
                onChange={(event) => changeSearchQuery(event.target.value)}
                className="min-w-0 flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200"
              />
              <button
                type="submit"
                aria-label="Submit Knowledge search"
                className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                Search
              </button>
            </form>
            {warmPhase === 'warming' ? <p className="mt-2 text-[11px] text-gray-500">Search engine is waking up…</p> : null}
            {searchPhase === 'loading' ? <p className="mt-2 text-[11px] text-gray-500">Searching Knowledge…</p> : null}
            {searchPhase === 'error' ? <p className="mt-2 text-[11px] text-gray-500">Knowledge search unavailable.</p> : null}
            {searchPhase === 'loaded' && searchResults.length === 0 ? <p className="mt-2 text-[11px] text-gray-500">No matching Knowledge found.</p> : null}
            {searchPhase === 'loaded' && searchResults.length > 0 ? (
              <ul data-knowledge-search-results="true" className="mt-2 space-y-2">
                {searchResults.map((result, index) => (
                  <li key={`${result.documentId}-${result.pageStart}-${result.pageEnd}-${index}`} className="rounded-md border border-gray-100">
                    <button
                      type="button"
                      // Identity is documentId: two sources can share a filename.
                      onClick={() => void openDetails({ id: result.documentId, originalFilename: result.originalFilename, pageCount: null, processingStatus: null, statusLabel: null })}
                      className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-300"
                    >
                      <p className="truncate text-xs font-medium text-gray-700">{result.originalFilename}</p>
                      <p className="text-[11px] text-gray-500">{pageLabel(result)}</p>
                      <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-xs text-gray-600">{result.text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            {searchPhase !== 'idle' ? null : phase === 'error' ? (
              <p className="mt-2 text-[11px] text-gray-500">Knowledge documents unavailable.</p>
            ) : entries.length > 0 ? (
              <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto">
                {entries.map((entry) => {
                  const metadata = metadataLine(entry);
                  return (
                    <li key={entry.id} className="min-w-0">
                  {entry.processingStatus === 'ready' ? (
                    <a
                      href={originalPdfPath(boardId, entry.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="truncate text-xs text-blue-700 underline decoration-blue-200 underline-offset-2 hover:text-blue-900"
                      title={`Open ${entry.originalFilename}`}
                    >
                      {entry.originalFilename}
                    </a>
                  ) : (
                    <p className="truncate text-xs text-gray-700" title={entry.originalFilename}>
                      {entry.originalFilename}
                    </p>
                  )}
                {metadata !== null ? (
                  <p className="text-[11px] text-gray-500">{metadata}</p>
                ) : null}
                {entry.processingStatus === 'ready' ? (
                  <button
                    type="button"
                    className="mt-1 text-[11px] font-medium text-gray-600 underline underline-offset-2 hover:text-gray-900"
                    onClick={() => void openDetails(entry)}
                  >
                    View text
                  </button>
                ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : phase === 'loading' ? (
              <p className="mt-2 text-[11px] text-gray-500">Loading PDFs…</p>
            ) : (
              <p className="mt-2 text-[11px] text-gray-500">No PDFs added yet.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
