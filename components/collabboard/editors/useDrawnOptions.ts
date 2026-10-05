'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { DrawnKind } from '@/lib/ai/drawn/prompt';
import type { DesignSuggestion } from '@/lib/ai/infographic/suggest';
import type { VisualOutline } from '@/lib/ai/outline';

import {
  DRAWN_BATCH,
  pickBaseSeed,
  routeErrorMessage,
  seedsForBase,
  suggestionFromResponse,
} from './drawnOptionHelpers';

/**
 * PATCH-284. Draws the AI post's pictures: `draw` asks `/api/ai/draw-picture`
 * for three pictures of a kind (at most two requests in flight), `shuffle`
 * draws three more with seeds never seen this session. A failed request leaves
 * its slot out; when all three fail `error` carries the route's own message.
 */

export type DrawnOptionsStatus = 'idle' | 'drawing' | 'done' | 'error';

export interface UseDrawnOptionsResult {
  options: DesignSuggestion[];
  status: DrawnOptionsStatus;
  error: string | null;
  draw: (outline: VisualOutline, kind: DrawnKind) => void;
  shuffle: () => void;
}

export function useDrawnOptions({ boardId }: { boardId?: string } = {}): UseDrawnOptionsResult {
  const [options, setOptions] = useState<DesignSuggestion[]>([]);
  const [status, setStatus] = useState<DrawnOptionsStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef(0);
  const usedSeedsRef = useRef<Set<number>>(new Set());
  const lastRef = useRef<{ outline: VisualOutline; kind: DrawnKind } | null>(null);

  const run = useCallback(
    (outline: VisualOutline, kind: DrawnKind) => {
      lastRef.current = { outline, kind };
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const runId = ++runIdRef.current;

      const seeds = seedsForBase(pickBaseSeed(Math.random, usedSeedsRef.current));
      seeds.forEach((seed) => usedSeedsRef.current.add(seed));

      setOptions([]);
      setError(null);
      setStatus('drawing');

      const results: Array<DesignSuggestion | null> = Array(DRAWN_BATCH).fill(null);
      let arrived = 0;
      let failures = 0;
      let lastError: string | null = null;

      const settle = () => {
        if (runIdRef.current !== runId) return;
        const good = results
          .filter((entry): entry is DesignSuggestion => entry !== null)
          .sort((a, b) => a.fit - b.fit);
        setOptions(good);
        if (arrived + failures === DRAWN_BATCH) {
          if (arrived === 0) {
            setStatus('error');
            setError(lastError ?? 'The picture could not be drawn.');
          } else {
            setStatus('done');
            setError(null);
          }
        }
      };

      const drawOne = async (index: number) => {
        const seed = seeds[index];
        try {
          const res = await fetch('/api/ai/draw-picture', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ outline, kind, seed, ...(boardId ? { boardId } : {}) }),
            signal: controller.signal,
          });
          const payload = await res.json().catch(() => ({}));
          if (!res.ok) {
            failures += 1;
            lastError = routeErrorMessage(payload) ?? `Drawing failed (${res.status}).`;
            return;
          }
          const entry = suggestionFromResponse({
            picture: (payload as { picture?: unknown }).picture,
            outline,
            kind,
            seed,
            label: `Option ${arrived + 1}`,
            fit: arrived,
          });
          arrived += 1;
          results[index] = entry;
        } catch (err) {
          if ((err as Error)?.name === 'AbortError') throw err;
          failures += 1;
          lastError = (err as Error)?.message || 'The picture could not be drawn.';
        }
      };

      const queue = seeds.map((_, index) => index);
      let active = 0;
      const pump = () => {
        while (active < 2 && queue.length > 0) {
          const index = queue.shift()!;
          active += 1;
          void drawOne(index)
            .catch(() => {})
            .finally(() => {
              active -= 1;
              if (runIdRef.current !== runId) return;
              settle();
              if (arrived + failures < DRAWN_BATCH) pump();
            });
        }
      };
      pump();
    },
    [boardId],
  );

  const draw = useCallback(
    (outline: VisualOutline, kind: DrawnKind) => run(outline, kind),
    [run],
  );
  const shuffle = useCallback(() => {
    if (lastRef.current) run(lastRef.current.outline, lastRef.current.kind);
  }, [run]);

  useEffect(() => () => abortRef.current?.abort(), []);

  return { options, status, error, draw, shuffle };
}
