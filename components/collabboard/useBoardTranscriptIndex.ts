"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BoardTranscriptIndexEntry } from '@/lib/domain/knowledge/boardTranscriptIndex';

/**
 * The board's transcripts, read ONCE for the whole board.
 *
 * ONE REQUEST, NOT ONE PER CARD. A board with thirty YouTube links would
 * otherwise open with thirty identical requests, and the answer is the same for
 * all of them -- the index is keyed by video, and every card asks the same
 * question of the same list.
 *
 * ============================================================================
 * A FAILED READ IS NOT AN EMPTY BOARD
 * ============================================================================
 *
 * This is the shape recorded three times in LESSONS_LEARNED: a failure and an
 * answer converging on one value, after which nothing downstream can tell them
 * apart. If a failed fetch returned `[]`, every card on the board would show
 * "Add transcript" -- a confident statement that none of these videos has a
 * transcript, made at the exact moment we could not know. Someone would paste
 * one that already exists, and get a duplicate.
 *
 * So `loaded` is reported separately and callers must gate on it. Until the
 * read succeeds, a card shows nothing rather than a claim.
 */
export interface BoardTranscriptIndex {
  readonly entries: readonly BoardTranscriptIndexEntry[];
  /** True only after a SUCCESSFUL read. False while loading AND after a failure. */
  readonly loaded: boolean;
  /** Re-read after an import, so the card that started it updates. */
  readonly refresh: () => void;
}

const EMPTY: readonly BoardTranscriptIndexEntry[] = [];

export function useBoardTranscriptIndex(
  boardId: string | null | undefined,
  /**
   * Skip the request entirely for a board with no media posts on it, which is
   * most boards. Passing `false` keeps `loaded` false, so nothing claims
   * anything about transcripts either way.
   */
  enabled: boolean,
): BoardTranscriptIndex {
  const [entries, setEntries] = useState<readonly BoardTranscriptIndexEntry[]>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Survives unmount so a late response cannot set state on a gone component.
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  // A DIFFERENT BOARD IS NOT A STALE READ OF THIS ONE. Without this, moving
  // between boards would render board A's transcripts against board B's cards
  // for as long as the new read takes -- "Transcript added" on a video that
  // has none here, which is the mis-attribution this feature exists to avoid,
  // arriving through the loading state instead of through the matching.
  useEffect(() => {
    setEntries(EMPTY);
    setLoaded(false);
  }, [boardId]);

  useEffect(() => {
    if (!enabled || !boardId) return;

    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(
          `/api/boards/${encodeURIComponent(boardId)}/knowledge/transcripts`,
          { signal: controller.signal },
        );
        if (!response.ok) {
          // DELIBERATELY LEAVES `loaded` FALSE. A 503 is not "this board has
          // no transcripts"; it is "we do not know", and the card must say
          // nothing rather than something false.
          return;
        }
        const body = (await response.json()) as { transcripts?: unknown };
        if (!activeRef.current || controller.signal.aborted) return;
        setEntries(
          Array.isArray(body.transcripts)
            ? (body.transcripts as readonly BoardTranscriptIndexEntry[])
            : EMPTY,
        );
        setLoaded(true);
      } catch {
        // Network failure or abort. Same reasoning: no claim.
      }
    })();

    return () => controller.abort();
  }, [boardId, enabled, reloadToken]);

  const refresh = useCallback(() => setReloadToken((token) => token + 1), []);

  return useMemo(() => ({ entries, loaded, refresh }), [entries, loaded, refresh]);
}
