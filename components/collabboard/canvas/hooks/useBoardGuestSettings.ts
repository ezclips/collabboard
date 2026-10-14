'use client';

/**
 * PATCH-368. A board's guest-settings flag (`boards.hide_guest_names`), live.
 *
 * One read, then a `postgres_changes` UPDATE subscription on `boards` with a
 * UNIQUE topic per instance (`useId`, the PATCH-366 Addendum 1 lesson: two
 * channels on one topic leave one of them silently not receiving). Updates that
 * did not touch the flag are ignored, so the frequent `boards` writes (thumbnail,
 * last_visited_at) never re-render anything.
 */

import { useEffect, useId, useState } from 'react';

import { supabaseBrowser } from '@/lib/supabase/browser';

export interface UseBoardGuestSettingsResult {
  readonly hideGuestNames: boolean;
}

export function useBoardGuestSettings(boardId: string | null | undefined): UseBoardGuestSettingsResult {
  const [hideGuestNames, setHideGuestNames] = useState(false);
  const instanceId = useId();

  // One read so the first render is correct.
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    void (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data, error } = await supabase
          .from('boards')
          .select('hide_guest_names')
          .eq('id', boardId)
          .maybeSingle();
        if (cancelled) return;
        if (error) {
          console.error('Error reading board guest settings:', error);
          return;
        }
        setHideGuestNames((data as { hide_guest_names?: boolean | null } | null)?.hide_guest_names === true);
      } catch (error) {
        console.error('Error reading board guest settings:', error);
      }
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  // Live updates. The topic is PER INSTANCE, so several mounts of this hook for
  // one board all keep receiving. Wrapped like the read: a client that cannot be
  // built must not take the whole surface down with it.
  useEffect(() => {
    if (!boardId) return;
    let cleanup: (() => void) | undefined;
    try {
      const supabase = supabaseBrowser();
      const channel = supabase
        .channel(`board-guest-settings:${boardId}:${instanceId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
          (payload) => {
            const next = (payload.new as { hide_guest_names?: boolean | null } | null)?.hide_guest_names === true;
            setHideGuestNames((current) => (current === next ? current : next));
          },
        )
        .subscribe();
      cleanup = () => { void supabase.removeChannel(channel); };
    } catch (error) {
      console.error('Error subscribing to board guest settings:', error);
      return;
    }
    return cleanup;
  }, [boardId, instanceId]);

  return { hideGuestNames };
}
