'use client';

/**
 * PATCH-377 Addendum 1. The board's own LAYOUT, live.
 *
 * A cross-family switch rewrites `boards.layout`, and every page is built from
 * the layout it loaded with. The posts and sections follow over realtime
 * (PATCH-373/357), but a tab still rendering a Columns board would show a Wall
 * board's posts NOWHERE -- the very invisibility PATCH-377 exists to end. So
 * this watches `boards` for this id and, the moment `layout` differs from the one
 * this page is showing, calls the caller's refetch so the page re-renders in the
 * new layout.
 *
 * ITS OWN CHANNEL, WITH A UNIQUE TOPIC (`useId`, the PATCH-373 lesson): a
 * subscription the server refuses kills the WHOLE channel it is on, so this must
 * never share `canvas-<id>` with the padlets subscription, and two instances for
 * one board must not share a topic (one would silently stop receiving).
 *
 * The layout is read through a ref, so the handler compares against the layout
 * the page is ACTUALLY showing, not the one it had when the channel was opened.
 */

import { useEffect, useId, useRef } from 'react';

import { supabaseBrowser } from '@/lib/supabase/browser';

export function useBoardLayoutLive(
  boardId: string | undefined,
  currentLayout: string | null | undefined,
  onLayoutChanged: () => void,
): void {
  const instanceId = useId();

  const currentLayoutRef = useRef<string | null>(currentLayout ?? null);
  useEffect(() => { currentLayoutRef.current = currentLayout ?? null; }, [currentLayout]);

  const onLayoutChangedRef = useRef(onLayoutChanged);
  useEffect(() => { onLayoutChangedRef.current = onLayoutChanged; }, [onLayoutChanged]);

  useEffect(() => {
    if (!boardId) return;
    let cleanup: (() => void) | undefined;
    try {
      const supabase = supabaseBrowser();
      const channel = supabase
        .channel(`board-layout:${boardId}:${instanceId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
          (payload) => {
            const next = (payload.new as { layout?: string | null } | null)?.layout ?? null;
            // Every `boards` write (thumbnail, last_visited_at, freeze) carries
            // `layout` too; only a DIFFERENT one means the page has to rebuild.
            if (!next || next === currentLayoutRef.current) return;
            // Recorded before the refetch, so a second echo of the same change
            // cannot ask for a second one.
            currentLayoutRef.current = next;
            onLayoutChangedRef.current();
          },
        )
        .subscribe();
      cleanup = () => { void supabase.removeChannel(channel); };
    } catch (error) {
      console.error('Error subscribing to the board layout:', error);
      return;
    }
    return cleanup;
  }, [boardId, instanceId]);
}
