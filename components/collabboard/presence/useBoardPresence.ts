'use client';

/**
 * PATCH-363. Subscribes to the PRIVATE, access-checked board channel and reports
 * who is on the board right now.
 *
 * The channel is `board:<boardId>` with `private: true`, so Realtime authorises
 * it through RLS on `realtime.messages` (see the migration). A refused or broken
 * channel becomes `'unavailable'` -- logged ONCE, no toast spam, and the stack
 * hides itself.
 */

import { useEffect, useState } from 'react';

import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  presenceColor,
  presenceIdentity,
  presencePeople,
  type PresencePerson,
  type PresenceState,
  type PresenceUserLike,
} from '@/lib/domain/presence/boardPresence';

export type BoardPresenceStatus = 'connecting' | 'live' | 'unavailable';

export interface UseBoardPresenceResult {
  readonly people: readonly PresencePerson[];
  readonly status: BoardPresenceStatus;
}

export function useBoardPresence(
  boardId: string | null | undefined,
  user: PresenceUserLike | null | undefined,
): UseBoardPresenceResult {
  const [people, setPeople] = useState<readonly PresencePerson[]>([]);
  const [status, setStatus] = useState<BoardPresenceStatus>('connecting');

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!boardId || !userId) return;

    const supabase = supabaseBrowser();
    const identity = presenceIdentity(user);
    const channel = supabase.channel(`board:${boardId}`, {
      config: { private: true, presence: { key: userId } },
    });

    channel.on('presence', { event: 'sync' }, () => {
      setPeople(presencePeople(channel.presenceState() as unknown as PresenceState, userId));
    });

    channel.subscribe((subscribeStatus) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        setStatus('live');
        void channel.track({
          name: identity.name,
          isGuest: identity.isGuest,
          color: presenceColor(userId),
          joinedAt: new Date().toISOString(),
        });
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        // A recoverable state, not an error: Supabase retries and a later
        // SUBSCRIBED sets 'live' again. Warn, never console.error (no red
        // Next.js overlay for a transient dev-server timeout).
        console.warn('[presence] board channel not connected yet; retrying');
        setStatus('unavailable');
      }
    });

    return () => {
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
    // The identity is derived from the user; userId is enough to re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, userId]);

  return { people, status };
}
