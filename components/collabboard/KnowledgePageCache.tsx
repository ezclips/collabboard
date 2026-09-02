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
  /** When this answer arrived, for the freshness rule above. */
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

export interface KnowledgePageCache {
  /** Last known-good pages for this document, or null. Never a failure. */
  readonly read: (documentId: string) => KnowledgeReadyPages | null;
  /** True when a cached entry is old enough to revalidate behind the content. */
  readonly isStale: (entry: KnowledgeReadyPages) => boolean;
  /** One `/pages` read, shared with any identical request already in flight. */
  readonly load: (boardId: string, documentId: string) => Promise<KnowledgePagesLoad>;
  readonly isPageImageless: (documentId: string, pageNumber: number) => boolean;
  readonly markPageImageless: (documentId: string, pageNumber: number) => void;
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
  readonly imageless: Map<string, Set<number>>;
}

const newStore = (scope: string | null): Store => ({
  scope,
  entries: new Map(),
  inFlight: new Map(),
  imageless: new Map(),
});

/** The same two payload rules the reader has always applied, in one place. */
export function knowledgeDocumentMetadata(
  value: unknown,
): { originalFilename: string; pageCount: number | null } {
  if (!value || typeof value !== 'object') return { originalFilename: '', pageCount: null };
  const record = value as Record<string, unknown>;
  return {
    originalFilename: typeof record.originalFilename === 'string' ? record.originalFilename : '',
    pageCount: typeof record.pageCount === 'number' && Number.isInteger(record.pageCount) && record.pageCount > 0
      ? record.pageCount
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
    const response = await fetch(
      `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/pages`,
    );
    // Never a stored answer: still extracting is a state, not content.
    if (response.status === 409) return { status: 'preparing' };
    const payload = await response.json().catch(() => null) as
      { pages?: unknown; document?: unknown } | null;
    if (!response.ok || !payload || !Array.isArray(payload.pages)) return { status: 'failed' };
    return {
      status: 'ready',
      entry: {
        documentId,
        ...knowledgeDocumentMetadata(payload.document),
        pages: payload.pages.filter(isKnowledgeDetailPage),
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
        // Only a genuinely Ready answer is ever stored, and only into the store
        // that asked -- a user change mid-flight must not adopt this result.
        // A 409 or a transient failure writes NOTHING, so an already-cached
        // document keeps its last known-good pages.
        if (result.status === 'ready' && storeRef.current === store) {
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
  const markPageImageless = useCallback((documentId: string, pageNumber: number) => {
    const store = storeRef.current;
    const known = store.imageless.get(documentId);
    if (known) known.add(pageNumber);
    else store.imageless.set(documentId, new Set([pageNumber]));
  }, []);

  const value = useMemo<KnowledgePageCache>(
    () => ({ read, isStale, load, isPageImageless, markPageImageless }),
    [read, isStale, load, isPageImageless, markPageImageless],
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
