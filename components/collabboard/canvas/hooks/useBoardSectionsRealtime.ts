'use client';

/**
 * PATCH-373 Addendum 1. Columns/Grid sections, live -- on their OWN channel.
 *
 * WHY ITS OWN CHANNEL. The first version put the `board_sections` handlers on
 * the existing `canvas-${canvasId}` channel. `board_sections` is not yet in the
 * `supabase_realtime` publication, and ONE UNPUBLISHED TABLE KILLS THE WHOLE
 * CHANNEL: the live run showed
 *   "Unable to subscribe to changes with given parameters ... table: board_sections"
 * and from then on the second tab received no `padlets` events either -- a plain
 * post edit stopped arriving. A separate channel means a missing table can only
 * silence section updates, never the posts.
 *
 * THE TOPIC IS PER INSTANCE. Realtime keys channels by topic, so two channels
 * sharing one topic leave one silently not receiving. `useId()` is stable for
 * the life of the instance, and the topic is deliberately NOT
 * `canvas-${canvasId}` -- it must never collide with the padlets channel.
 *
 * The handlers are immutable, and `board_sections.id` is a BIGINT live while a
 * synthesized section's id can be a number too, so every comparison goes
 * through `String(id)`.
 */

import { useCallback, useEffect, useId } from 'react';

import { supabaseBrowser } from '@/lib/supabase/browser';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import type { BoardSection } from '@/types/collabboard';

export function useBoardSectionsRealtime(
  canvasId: string | undefined,
  setSections: React.Dispatch<React.SetStateAction<BoardSection[]>>,
): void {
  // Stable per instance; keeps this hook's topic unique and distinct from the
  // padlets channel's.
  const instanceId = useId();

  const handleRealtimeSectionChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const sectionId = String(newRecord?.id ?? oldRecord?.id ?? '');
    if (!sectionId) return;
    debugCanvasLogger('realtimeUpdate', { eventType, sectionId });

    if (eventType === 'DELETE') {
      // DELETE carries only the primary key, so it arrives unfiltered and this
      // filter is what scopes it: only an id this board already holds is dropped.
      setSections(prev => prev.filter(section => String(section.id) !== sectionId));
      return;
    }

    if (!newRecord) return;
    setSections(prev => {
      const existing = prev.find(section => String(section.id) === sectionId);
      // Our own create already added the row; the INSERT echo leaves it exactly
      // as it is (so its numeric id is not churned to the echoed string).
      if (eventType === 'INSERT' && existing) return prev;
      const without = prev.filter(section => String(section.id) !== sectionId);
      return [...without, newRecord as BoardSection].sort(
        (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0),
      );
    });
  }, [setSections]);

  useEffect(() => {
    if (!canvasId) return;
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`canvas-sections:${canvasId}:${instanceId}`)
      // INSERT/UPDATE respect the existing SELECT RLS on board_sections, so they
      // carry the board filter.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'board_sections', filter: `board_id=eq.${canvasId}` },
        handleRealtimeSectionChange,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'board_sections', filter: `board_id=eq.${canvasId}` },
        handleRealtimeSectionChange,
      )
      .on(
        'postgres_changes',
        // DELETE cannot be filtered by board_id (only the primary key is in the
        // old record), so it is subscribed unfiltered; the handler drops only
        // ids it already holds, which are this board's.
        { event: 'DELETE', schema: 'public', table: 'board_sections' },
        handleRealtimeSectionChange,
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [canvasId, instanceId, handleRealtimeSectionChange]);
}
