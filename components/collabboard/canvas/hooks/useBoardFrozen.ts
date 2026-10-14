'use client';

/**
 * PATCH-366. The board's frozen state, live.
 *
 * `initialFrozenAt` is the value the caller already loaded (a `boards` row's
 * `frozen_at`); when it is `undefined` the hook fetches it once itself, so a
 * caller that has no board row (the Kanban store) still starts correct. It then
 * subscribes to `boards` UPDATE for this board and updates ONLY when
 * `frozen_at` changed -- `boards` is updated often (thumbnail, last_visited_at)
 * and those must not re-render anything.
 *
 * PATCH-366 Addendum 1. The topic is PER INSTANCE. Two hooks run for the same
 * board at once (CanvasClient + the Kanban store, CanvasClient +
 * BoardFreezeToggle), and Realtime keys channels by topic: two channels sharing
 * one topic leave one of them silently not receiving. `useId()` is stable for
 * the life of the instance, so the topic is unique per instance and the cleanup
 * removes exactly the channel this instance opened.
 */

import { useCallback, useEffect, useId, useState } from 'react';
import { toast } from 'sonner';

import { supabaseBrowser } from '@/lib/supabase/browser';

export interface UseBoardFrozenResult {
  readonly frozenAt: string | null;
  readonly setFrozen: (next: boolean) => void;
}

export function useBoardFrozen(
  boardId: string | null | undefined,
  initialFrozenAt?: string | null,
): UseBoardFrozenResult {
  const [frozenAt, setFrozenAt] = useState<string | null>(initialFrozenAt ?? null);
  const initialProvided = initialFrozenAt !== undefined;
  // Stable per instance; makes this hook's realtime topic unique among the
  // several that run for one board.
  const instanceId = useId();

  // Re-sync from the loaded value when it changes (navigation between boards).
  useEffect(() => {
    if (initialFrozenAt === undefined) return;
    setFrozenAt((current) => (current === (initialFrozenAt ?? null) ? current : initialFrozenAt ?? null));
  }, [initialFrozenAt]);

  // No initial value supplied: read it once so the caller starts correct. A
  // failed read leaves the last known value -- the DB is the guard, and the
  // existing save-error path already covers a write it refuses.
  useEffect(() => {
    if (initialProvided || !boardId) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from('boards')
          .select('frozen_at')
          .eq('id', boardId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error('Error reading board frozen state:', error);
          return;
        }
        setFrozenAt((data as { frozen_at?: string | null } | null)?.frozen_at ?? null);
      } catch (error) {
        console.error('Error reading board frozen state:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [boardId, initialProvided]);

  useEffect(() => {
    if (!boardId) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`board-freeze:${boardId}:${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
        (payload) => {
          const next = (payload.new as { frozen_at?: string | null } | null)?.frozen_at ?? null;
          // Ignore updates that did not touch frozen_at.
          setFrozenAt((current) => (current === next ? current : next));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [boardId, instanceId]);

  const setFrozen = useCallback((next: boolean) => {
    if (!boardId) return;
    const supabase = supabaseBrowser();
    void (async () => {
      const value = next ? new Date().toISOString() : null;
      const { data, error } = await supabase
        .from('boards')
        .update({ frozen_at: value })
        .eq('id', boardId)
        .select('frozen_at');
      if (error) {
        if ((error as { code?: string }).code === '42501') {
          toast.error('Only the board owner can freeze this board.');
        } else {
          toast.error('Could not change the board freeze.');
        }
        return;
      }
      const rows = Array.isArray(data) ? data : [];
      const applied = (rows[0] as { frozen_at?: string | null } | undefined)?.frozen_at ?? value;
      setFrozenAt(applied);
    })();
  }, [boardId]);

  return { frozenAt, setFrozen };
}
