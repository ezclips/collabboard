'use client';

/**
 * The shared client-side authority for a Ready Knowledge document's persisted
 * pages.
 *
 * Nothing here processes, derives or owns a PDF. The durable architecture is
 * already correct and unchanged: `/pages` is a pure read of `knowledge_pages`
 * for a document whose `processing_status` is already 'ready', extraction runs
 * once in the worker, and page images are Storage artifacts the image route
 * only ever reads. What was missing was purely on this side of the wire --
 * every consumer held its own `useState(null)`, so leaving a board or closing
 * the reader threw away data the server had already made permanent, and the
 * user watched content they already had "load" again.
 *
 * This is that missing memory and nothing more:
 *
 *   - it caches ONLY a successful Ready answer. A 409 (still extracting) and a
 *     failure are returned to the caller and never stored, so the first-time
 *     processing state machine each consumer owns is untouched.
 *   - it de-duplicates concurrent requests for the same document, which is what
 *     collapses the two simultaneous `/pages` GETs a board load used to issue.
 *   - it remembers, for this app session only, which page images answered 404,
 *     so a document with no raster derivatives stops re-probing them on every
 *     remount and goes straight to the canonical page text.
 *
 * Lifetime and scope. The provider is mounted in the ROOT layout, which is the
 * one client host that survives `router.push` between the dashboard and a
 * canvas -- a cache inside CanvasClient would die on exactly the navigation the
 * user complained about. Cached page text is private board content, so the
 * store is owned by the authenticated user: a different user (or a sign-out)
 * replaces the store wholesale rather than clearing entries one by one, which
 * makes it structurally impossible to read another session's entry. Memory
 * only -- no localStorage, no IndexedDB, no copy written into board or post
 * metadata, and nothing durable to leak on a shared machine. A hard reload
 * legitimately
 * starts empty and re-reads the server's persisted data.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { useSupabase } from '@/lib/supabase-provider';
import type { KnowledgeDocumentDetailPage } from '@/components/collabboard/KnowledgeDocumentDetails';
import type { KnowledgeTranscriptStoredRepresentation } from '@/lib/domain/knowledge/knowledgeTranscriptVersion';
import { KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS } from '@/lib/domain/knowledge/knowledgeTextCardExcerpt';
import { safeTextCutIndex } from '@/lib/domain/knowledge/knowledgeTextCanonical';

/**
 * How long a cached Ready answer is served without revalidating. `/pages` for a
 * Ready document is the output of one completed processing run, so within a
 * session it does not change underneath us; the window exists so a future
 * source-version feature cannot leave a view pinned to superseded text forever.
 */
export const KNOWLEDGE_PAGES_FRESH_MS = 5 * 60 * 1000;

export interface KnowledgeReadyPages {
  readonly documentId: string;
  readonly originalFilename: string;
  readonly pageCount: number | null;
  readonly pages: readonly KnowledgeDocumentDetailPage[];
  /**
   * What this source IS, from the server's own row. 'pdf' only when a build
   * that predates kinds answered -- the one shape that existed then.
   */
  readonly kind: string;
  /**
   * The whole canonical text of a PAGELESS source: the exact string a
   * citation's character offsets index into. Absent for a paged source, which
   * has `pages` instead. The two are never both present, because a source has
   * pages or it has characters.
   */
  readonly text?: string;
  /**
   * Present ONLY for a transcript, and carried from the server row rather
   * than derived here. A reader that inferred "transcript" from the
   * absence of pages would attach an unverified-claim notice to every
   * plain text file.
   */
  readonly transcriptRepresentation?: KnowledgeTranscriptStoredRepresentation | null;
  /** When this answer arrived, for the freshness rule above. */
  readonly loadedAt: number;
}

/**
 * PATCH-181. The SUMMARY of a Ready document: everything a canvas card needs
 * to draw one page picture and a page count, and NOTHING that costs the text of
 * every page.
 *
 * `pages` carries page number and geometry only (text is always the empty
 * string); `snippet` is the opening of the first page that has any text; `text`
 * is a text source's excerpt. A full entry can derive one of these with no
 * request, which is what makes opening a card that the reader already read free.
 */
export interface KnowledgeReadyPagesSummary {
  readonly documentId: string;
  readonly originalFilename: string;
  readonly pageCount: number | null;
  readonly kind: string;
  readonly pages: readonly KnowledgeDocumentDetailPage[];
  readonly snippet: string | null;
  readonly text?: string;
  readonly textTruncated?: boolean;
  /** PATCH-181. The FULL canonical length, so a footer can state it. */
  readonly textLength?: number;
  readonly transcriptRepresentation?: KnowledgeTranscriptStoredRepresentation | null;
  readonly loadedAt: number;
}

/**
 * Deliberately three outcomes, not a nullable success. 'preparing' is the 409
 * that means extraction has not finished -- a normal lifecycle state that each
 * consumer still retries with its OWN policy, because the card and the reader
 * have different ones and this patch is not allowed to change either.
 */
export type KnowledgePagesLoad =
  | { readonly status: 'ready'; readonly entry: KnowledgeReadyPages }
  | { readonly status: 'preparing' }
  | { readonly status: 'failed' };

/** PATCH-181: the same three outcomes for a SUMMARY read. */
export type KnowledgeSummaryLoad =
  | { readonly status: 'ready'; readonly entry: KnowledgeReadyPagesSummary }
  | { readonly status: 'preparing' }
  | { readonly status: 'failed' };

export interface KnowledgePageCache {
  /** Last known-good pages for this document, or null. Never a failure. */
  readonly read: (documentId: string) => KnowledgeReadyPages | null;
  /**
   * PATCH-181. The last known-good SUMMARY, or null.
   *
   * A FULL entry satisfies this read: if the reader has already loaded the
   * document's pages, the summary is DERIVED from them -- page metadata and a
   * snippet, or an excerpt -- with no request. Only when neither exists does a
   * card need to fetch.
   */
  readonly readSummary: (documentId: string) => KnowledgeReadyPagesSummary | null;
  /** True when a cached entry is old enough to revalidate behind the content. */
  readonly isStale: (entry: KnowledgeReadyPages) => boolean;
  /** One `/pages` read, shared with any identical request already in flight. */
  readonly load: (boardId: string, documentId: string) => Promise<KnowledgePagesLoad>;
  /** One `/pages?view=summary` read, shared the same way, in its own map. */
  readonly loadSummary: (boardId: string, documentId: string) => Promise<KnowledgeSummaryLoad>;
  readonly isPageImageless: (documentId: string, pageNumber: number) => boolean;
  readonly markPageImageless: (documentId: string, pageNumber: number) => void;
  /**
   * PDF-R1. Forget that a document's pages had no derivative.
   *
   * A repair can produce the artifact minutes after a 404 was recorded, and
   * the marker is what stops the image being requested again -- so a
   * successful render MUST be able to clear it. Without this the session
   * would keep hiding a picture that now exists.
   */
  readonly clearPageImageless: (documentId: string) => void;
}

const Context = createContext<KnowledgePageCache | null>(null);

/**
 * Everything one authenticated user is allowed to see, and the scope that owns
 * it. Replacing this object IS the invalidation: no entry can outlive the user
 * it was fetched for.
 */
interface Store {
  scope: string | null;
  readonly entries: Map<string, KnowledgeReadyPages>;
  readonly inFlight: Map<string, Promise<KnowledgePagesLoad>>;
  /** PATCH-181: the summary representation, in its own maps. */
  readonly summaries: Map<string, KnowledgeReadyPagesSummary>;
  readonly inFlightSummary: Map<string, Promise<KnowledgeSummaryLoad>>;
  readonly imageless: Map<string, Set<number>>;
}

const newStore = (scope: string | null): Store => ({
  scope,
  entries: new Map(),
  inFlight: new Map(),
  summaries: new Map(),
  inFlightSummary: new Map(),
  imageless: new Map(),
});

/**
 * A transcript representation, checked rather than trusted.
 *
 * It arrives over the network, and everything downstream uses its cues to
 * decide whether a citation may name a moment. A malformed value must
 * therefore read as "not a transcript" -- no disclosure, no timestamps --
 * rather than as a transcript whose cues cannot be trusted.
 */
function isTranscriptRepresentation(
  value: unknown,
): value is KnowledgeTranscriptStoredRepresentation {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  if (typeof record.representationVersion !== "number") return false;
  if (!Array.isArray(record.cues)) return false;
  return record.cues.every((cue) => {
    if (!cue || typeof cue !== "object") return false;
    const entry = cue as Record<string, unknown>;
    return [entry.charStart, entry.charEnd, entry.startMs, entry.endMs].every(
      (slot) => typeof slot === "number" && Number.isInteger(slot),
    );
  });
}

/** The same two payload rules the reader has always applied, in one place. */
export function knowledgeDocumentMetadata(
  value: unknown,
): {
  originalFilename: string;
  pageCount: number | null;
  kind: string;
  transcriptRepresentation: KnowledgeTranscriptStoredRepresentation | null;
} {
  if (!value || typeof value !== 'object') {
    return { originalFilename: '', pageCount: null, kind: 'pdf', transcriptRepresentation: null };
  }
  const record = value as Record<string, unknown>;
  return {
    originalFilename: typeof record.originalFilename === 'string' ? record.originalFilename : '',
    pageCount: typeof record.pageCount === 'number' && Number.isInteger(record.pageCount) && record.pageCount > 0
      ? record.pageCount
      : null,
    // 'pdf' ONLY when the field is absent, which means a build predating kinds
    // answered. Never a fallback for a kind this client does not recognise:
    // that value travels through unchanged, and the reader refuses it rather
    // than rendering an unknown source as a PDF.
    kind: typeof record.kind === 'string' && record.kind.length > 0 ? record.kind : 'pdf',
    // Structurally checked, not cast: this arrives from the network, and a
    // malformed value must read as 'not a transcript' rather than as a
    // transcript whose cues cannot be trusted.
    transcriptRepresentation: isTranscriptRepresentation(record.transcriptRepresentation)
      ? record.transcriptRepresentation
      : null,
  };
}

export function isKnowledgeDetailPage(value: unknown): value is KnowledgeDocumentDetailPage {
  return !!value
    && typeof value === 'object'
    && typeof (value as KnowledgeDocumentDetailPage).pageNumber === 'number'
    && typeof (value as KnowledgeDocumentDetailPage).text === 'string';
}

/**
 * PATCH-181. A summary page: number and geometry, and NO text (always the empty
 * string here). Kept distinct from `isKnowledgeDetailPage` because the summary
 * deliberately omits `text`, so the full-page guard would reject every row.
 */
function summaryPage(value: unknown): KnowledgeDocumentDetailPage | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.pageNumber !== 'number') return null;
  return {
    pageNumber: record.pageNumber,
    // Never the network's text: the summary carries none, and the empty string
    // is what makes a card show the loading state in text view rather than an
    // empty paragraph.
    text: '',
    widthPoints: typeof record.widthPoints === 'number' ? record.widthPoints : null,
    heightPoints: typeof record.heightPoints === 'number' ? record.heightPoints : null,
    rotation: typeof record.rotation === 'number' ? record.rotation : null,
  };
}

/**
 * The ONE `fetch(` in this file. Both representations are read here, so the
 * endpoint has exactly one home in the client; the URL is built once, and the
 * `?view=summary` query is added only for the summary.
 */
function requestKnowledgePages(
  boardId: string,
  documentId: string,
  view: 'full' | 'summary',
): Promise<Response> {
  const base = `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/pages`;
  return fetch(view === 'summary' ? `${base}?view=summary` : base);
}

/**
 * The ONE `/pages?view=summary` request implementation in the client. Symmetric
 * with `fetchKnowledgeReadyPages`: the provider shares and remembers its result,
 * and a surface rendered without the provider calls this same function.
 */
export async function fetchKnowledgeReadySummary(
  boardId: string,
  documentId: string,
): Promise<KnowledgeSummaryLoad> {
  try {
    const response = await requestKnowledgePages(boardId, documentId, 'summary');
    if (response.status === 409) return { status: 'preparing' };
    const payload = await response.json().catch(() => null) as
      { pages?: unknown; document?: unknown; snippet?: unknown; text?: unknown; textTruncated?: unknown; textLength?: unknown } | null;
    if (!response.ok || !payload || !Array.isArray(payload.pages)) return { status: 'failed' };
    return {
      status: 'ready',
      entry: {
        documentId,
        ...knowledgeDocumentMetadata(payload.document),
        pages: payload.pages
          .map(summaryPage)
          .filter((page): page is KnowledgeDocumentDetailPage => page !== null),
        snippet: typeof payload.snippet === 'string' && payload.snippet.length > 0
          ? payload.snippet
          : null,
        ...(typeof payload.text === 'string' ? { text: payload.text } : {}),
        ...(payload.textTruncated === true ? { textTruncated: true } : {}),
        ...(typeof payload.textLength === 'number' && Number.isInteger(payload.textLength) && payload.textLength >= 0
          ? { textLength: payload.textLength }
          : {}),
        loadedAt: Date.now(),
      },
    };
  } catch {
    return { status: 'failed' };
  }
}

/**
 * The ONE `/pages` request implementation in the client. The provider shares
 * and remembers its result; a surface rendered without the provider calls this
 * same function directly, so there has never been -- and must never be -- a
 * second fetch of this endpoint anywhere else.
 */
export async function fetchKnowledgeReadyPages(
  boardId: string,
  documentId: string,
): Promise<KnowledgePagesLoad> {
  try {
    const response = await requestKnowledgePages(boardId, documentId, 'full');
    // Never a stored answer: still extracting is a state, not content.
    if (response.status === 409) return { status: 'preparing' };
    const payload = await response.json().catch(() => null) as
      { pages?: unknown; document?: unknown; text?: unknown } | null;
    if (!response.ok || !payload || !Array.isArray(payload.pages)) return { status: 'failed' };
    return {
      status: 'ready',
      entry: {
        documentId,
        ...knowledgeDocumentMetadata(payload.document),
        pages: payload.pages.filter(isKnowledgeDetailPage),
        // Only a STRING is taken. A pageless source whose text did not arrive
        // leaves the reader with nothing to show, which is honest; anything
        // coerced into a string would be a document reading '[object Object]'.
        ...(typeof payload.text === 'string' ? { text: payload.text } : {}),
        loadedAt: Date.now(),
      },
    };
  } catch {
    return { status: 'failed' };
  }
}

export function KnowledgePageCacheProvider({ children }: { children: React.ReactNode }) {
  const { supabase } = useSupabase();
  const storeRef = useRef<Store>(newStore(null));
  /**
   * The first resolution ADOPTS the store rather than clearing it: there is one
   * browser session, so entries fetched in the moment before `getUser()`
   * answered belong to the user it answers with. Only a genuine change of user
   * -- including a sign-out -- discards anything.
   */
  const adoptedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const applyScope = (userId: string | null) => {
      if (cancelled) return;
      if (!adoptedRef.current) {
        adoptedRef.current = true;
        storeRef.current.scope = userId;
        return;
      }
      if (storeRef.current.scope !== userId) storeRef.current = newStore(userId);
    };

    supabase.auth.getUser()
      .then(({ data }) => applyScope(data.user?.id ?? null))
      .catch(() => { /* Unresolved auth simply leaves the store unadopted. */ });
    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => applyScope(session?.user?.id ?? null),
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [supabase]);

  const read = useCallback(
    (documentId: string) => storeRef.current.entries.get(documentId) ?? null,
    [],
  );

  /**
   * PATCH-181. A full entry satisfies a summary read, derived here so the card
   * can paint immediately from pages the reader already loaded -- no request.
   * The derivation mirrors what the summary route would return: page metadata
   * with no text, a snippet from the first page that has any, and an excerpt.
   */
  const readSummary = useCallback((documentId: string): KnowledgeReadyPagesSummary | null => {
    const store = storeRef.current;
    const full = store.entries.get(documentId);
    if (full) {
      const snippetPage = full.pages.find((page) => page.text.trim().length > 0);
      return {
        documentId: full.documentId,
        originalFilename: full.originalFilename,
        pageCount: full.pageCount,
        kind: full.kind,
        // Geometry only: the summary never carries page text.
        pages: full.pages.map((page) => ({ ...page, text: '' })),
        snippet: snippetPage ? snippetPage.text.trim().slice(0, 90) : null,
        ...(typeof full.text === 'string'
          ? { text: full.text.slice(0, safeTextCutIndex(full.text, KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS)) }
          : {}),
        ...(typeof full.text === 'string'
          && full.text.length > safeTextCutIndex(full.text, KNOWLEDGE_TEXT_CARD_EXCERPT_CHARS)
          ? { textTruncated: true }
          : {}),
        // The full length, from the entry that holds the whole text.
        ...(typeof full.text === 'string' ? { textLength: full.text.length } : {}),
        ...(full.transcriptRepresentation !== undefined
          ? { transcriptRepresentation: full.transcriptRepresentation }
          : {}),
        loadedAt: full.loadedAt,
      };
    }
    return store.summaries.get(documentId) ?? null;
  }, []);

  const isStale = useCallback(
    (entry: KnowledgeReadyPages) => Date.now() - entry.loadedAt > KNOWLEDGE_PAGES_FRESH_MS,
    [],
  );

  const load = useCallback(async (boardId: string, documentId: string): Promise<KnowledgePagesLoad> => {
    const store = storeRef.current;
    // The de-duplication. A second consumer arriving while the first request is
    // still open joins it instead of opening its own.
    const inFlight = store.inFlight.get(documentId);
    if (inFlight) return inFlight;

    const request = (async (): Promise<KnowledgePagesLoad> => {
      try {
        const result = await fetchKnowledgeReadyPages(boardId, documentId);
        // N1/N2. The scope check now gates the RETURN as well as the write.
        //
        // Guarding only the write left the awaiting caller holding the old
        // user's page text: the store it would have been written into was
        // correctly rejected, but `result` was handed back regardless, and a
        // surface that rendered it would show one user's document to the next.
        // A store swap means the answer belongs to a session that no longer
        // exists here, so it is reported as a plain failure -- the same
        // neutral, non-Ready result a transient error already produces, which
        // every consumer of this function already handles. Nothing new is
        // stored, nothing is retried, and the new user's own request goes out
        // normally.
        if (storeRef.current !== store) return { status: 'failed' };
        // Only a genuinely Ready answer is ever stored, and only into the store
        // that asked. A 409 or a transient failure writes NOTHING, so an
        // already-cached document keeps its last known-good pages.
        if (result.status === 'ready') {
          store.entries.set(documentId, result.entry);
        }
        return result;
      } finally {
        store.inFlight.delete(documentId);
      }
    })();

    store.inFlight.set(documentId, request);
    return request;
  }, []);

  /**
   * PATCH-181. One summary read, shared in the SAME way as the full read but in
   * its own maps -- the two representations have different validators and must
   * never satisfy one another's in-flight lookup.
   */
  const loadSummary = useCallback(async (boardId: string, documentId: string): Promise<KnowledgeSummaryLoad> => {
    const store = storeRef.current;
    const inFlight = store.inFlightSummary.get(documentId);
    if (inFlight) return inFlight;

    const request = (async (): Promise<KnowledgeSummaryLoad> => {
      try {
        const result = await fetchKnowledgeReadySummary(boardId, documentId);
        // The same scope guard as `load`: a store swap means the answer belongs
        // to a session that no longer exists here, so it is reported as a plain
        // failure and stored nowhere.
        if (storeRef.current !== store) return { status: 'failed' };
        if (result.status === 'ready') {
          store.summaries.set(documentId, result.entry);
        }
        return result;
      } finally {
        store.inFlightSummary.delete(documentId);
      }
    })();

    store.inFlightSummary.set(documentId, request);
    return request;
  }, []);

  const isPageImageless = useCallback(
    (documentId: string, pageNumber: number) =>
      storeRef.current.imageless.get(documentId)?.has(pageNumber) ?? false,
    [],
  );

  /**
   * Session-lifetime only, deliberately. A raster derivative that does not
   * exist today may exist tomorrow once the worker produces it, so this must
   * never become durable knowledge -- a later app session probes again.
   */
  const clearPageImageless = useCallback((documentId: string) => {
    storeRef.current.imageless.delete(documentId);
  }, []);

  const markPageImageless = useCallback((documentId: string, pageNumber: number) => {
    const store = storeRef.current;
    const known = store.imageless.get(documentId);
    if (known) known.add(pageNumber);
    else store.imageless.set(documentId, new Set([pageNumber]));
  }, []);

  const value = useMemo<KnowledgePageCache>(
    () => ({ read, readSummary, isStale, load, loadSummary, isPageImageless, markPageImageless, clearPageImageless }),
    [read, readSummary, isStale, load, loadSummary, isPageImageless, markPageImageless, clearPageImageless],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Null outside a provider. Every consumer keeps its own fetch path for that
 * case, so a surface rendered without the provider -- an isolated test, a
 * future host -- behaves exactly as it did before this cache existed.
 */
export function useKnowledgePageCache(): KnowledgePageCache | null {
  return useContext(Context);
}
