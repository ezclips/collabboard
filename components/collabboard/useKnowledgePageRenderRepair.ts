'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * PDF-R1 -- asking the server to (re)render a document's page visuals.
 *
 * The browser does not render anything and does not poll the database; it asks
 * one route and reads one safe word back. The hook exists so the card and the
 * reader tell the SAME story about a missing picture rather than each inventing
 * their own.
 */

export type KnowledgeRenderState =
  | 'idle'
  | 'requesting'
  | 'in_progress'
  | 'complete'
  | 'unavailable';

const RENDER_PATH = (boardId: string, documentId: string) =>
  `/api/boards/${encodeURIComponent(boardId)}/knowledge/${encodeURIComponent(documentId)}/render-pages`;

/** Long enough not to hammer the route, short enough to feel like progress. */
const POLL_INTERVAL_MS = 4_000;
/** ~2 minutes. A render that has not finished by then needs a human decision. */
const MAX_POLLS = 30;

export interface KnowledgePageRenderRepair {
  readonly state: KnowledgeRenderState;
  /** Ask once. Repeated calls while a request is outstanding do nothing. */
  readonly request: () => void;
  /** Explicit user retry: clears the latch and asks again. */
  readonly retry: () => void;
}

/**
 * One repair conversation per document.
 *
 * The latch is the important part: a missing derivative is discovered by an
 * <img> that fails, and that can happen on every render, so without it the
 * component would POST in a loop. One automatic request per document per
 * mount; after that only an explicit retry.
 */
export function useKnowledgePageRenderRepair(
  boardId: string,
  documentId: string,
  onComplete?: () => void,
): KnowledgePageRenderRepair {
  const [state, setState] = useState<KnowledgeRenderState>('idle');
  const requestedRef = useRef<string | null>(null);
  const pollsRef = useRef(0);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  // A different document is a different conversation entirely.
  useEffect(() => {
    requestedRef.current = null;
    pollsRef.current = 0;
    setState('idle');
  }, [boardId, documentId]);

  const start = useCallback(async () => {
    setState('requesting');
    try {
      const response = await fetch(RENDER_PATH(boardId, documentId), { method: 'POST' });
      if (!response.ok && response.status !== 202) {
        setState('unavailable');
        return;
      }
      setState('in_progress');
    } catch {
      setState('unavailable');
    }
  }, [boardId, documentId]);

  const request = useCallback(() => {
    const key = `${boardId}:${documentId}`;
    if (requestedRef.current === key) return;
    requestedRef.current = key;
    pollsRef.current = 0;
    void start();
  }, [boardId, documentId, start]);

  const retry = useCallback(() => {
    requestedRef.current = null;
    request();
  }, [request]);

  /**
   * Polling stops the moment it has an answer, and gives up rather than
   * running forever. `complete` tells the host to probe the image again --
   * the session's earlier 404 must not outlive the repair that fixed it.
   */
  useEffect(() => {
    if (state !== 'in_progress') return;
    let cancelled = false;
    const timer = setInterval(async () => {
      if (cancelled) return;
      pollsRef.current += 1;
      if (pollsRef.current > MAX_POLLS) {
        setState('unavailable');
        return;
      }
      try {
        const response = await fetch(RENDER_PATH(boardId, documentId), { method: 'GET' });
        if (!response.ok) return;
        const payload = await response.json() as { state?: string };
        if (cancelled) return;
        if (payload.state === 'complete') {
          setState('complete');
          completeRef.current?.();
        } else if (payload.state === 'unavailable' || payload.state === 'not_ready') {
          setState('unavailable');
        }
      } catch {
        // A transient poll failure is not an answer; the next tick asks again.
      }
    }, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [state, boardId, documentId]);

  return { state, request, retry };
}
