'use client';

/**
 * PATCH-363. Subscribes to the PRIVATE, access-checked board channel and reports
 * who is on the board right now.
 *
 * The channel is `board:<boardId>` with `private: true`, so Realtime authorises
 * it through RLS on `realtime.messages` (see the migration). A refused or broken
 * channel becomes `'unavailable'` -- logged ONCE, no toast spam, and the stack
 * hides itself.
 *
 * PATCH-368. When `hideGuestNames` is on and the current user is a guest, the
 * presence payload carries `name: null`, so the real name never travels to
 * another client. The flag is a separate, re-trackable input: flipping it
 * re-tracks on the SAME channel (no re-subscribe, no presence blip).
 */

import { useEffect, useRef, useState } from 'react';

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
  hideGuestNames = false,
): UseBoardPresenceResult {
  const [people, setPeople] = useState<readonly PresencePerson[]>([]);
  const [status, setStatus] = useState<BoardPresenceStatus>('connecting');

  const userId = user?.id ?? null;
  const identity = presenceIdentity(user);
  // The name that leaves this client: null while a guest's name is hidden.
  const trackName = hideGuestNames && identity.isGuest ? null : identity.name;

  // The live channel, so the re-track effect can reach it without re-subscribing.
  const channelRef = useRef<any>(null);
  // A stable joinedAt, so a re-track never reorders the list.
  const joinedAtRef = useRef(new Date().toISOString());

  useEffect(() => {
    if (!boardId || !userId) return;
    joinedAtRef.current = new Date().toISOString();

    const supabase = supabaseBrowser();
    const channel = supabase.channel(`board:${boardId}`, {
      config: { private: true, presence: { key: userId } },
    });
    channelRef.current = channel;

    channel.on('presence', { event: 'sync' }, () => {
      setPeople(presencePeople(channel.presenceState() as unknown as PresenceState, userId));
    });

    channel.subscribe((subscribeStatus) => {
      if (subscribeStatus === 'SUBSCRIBED') {
        setStatus('live');
      } else if (subscribeStatus === 'CHANNEL_ERROR' || subscribeStatus === 'TIMED_OUT') {
        // A recoverable state, not an error: Supabase retries and a later
        // SUBSCRIBED sets 'live' again. Warn, never console.error (no red
        // Next.js overlay for a transient dev-server timeout).
        console.warn('[presence] board channel not connected yet; retrying');
        setStatus('unavailable');
      }
    });

    return () => {
      channelRef.current = null;
      void channel.untrack();
      void supabase.removeChannel(channel);
    };
    // The identity is derived from the user; userId is enough to re-subscribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId, userId]);

  // Track once the channel is live, and RE-TRACK when the name changes (the flag
  // flipping). The channel stays, so no presence blip.
  useEffect(() => {
    const channel = channelRef.current;
    if (!channel || status !== 'live' || !userId) return;
    void channel.track({
      name: trackName,
      isGuest: identity.isGuest,
      color: presenceColor(userId),
      joinedAt: joinedAtRef.current,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, trackName, identity.isGuest, userId]);

  return { people, status };
}
