'use client';

/**
 * PATCH-366. The Freeze board switch for the Share modal.
 *
 * SELF-SUFFICIENT on purpose: it takes only `boardId`, reads the board row
 * (`user_id`, `frozen_at`) and the current user with the session client, shows
 * the switch only to the BOARD OWNER, writes `frozen_at` itself, and takes live
 * updates from `useBoardFrozen`. So the Share modal only renders
 * `<BoardFreezeToggle boardId={canvasId} />` -- Kanban and Gantt get it without
 * their shells passing anything.
 *
 * Owner-only in the UI is fine: the database also lets board admins freeze, and
 * the UI offering less than the DB permits is always safe.
 */

import React, { useEffect, useState } from 'react';

import { supabaseBrowser } from '@/lib/supabase/browser';
import { useBoardFrozen } from '../hooks/useBoardFrozen';
import ShareSwitchRow from './ShareSwitchRow';

export interface BoardFreezeToggleProps {
  readonly boardId: string;
}

export default function BoardFreezeToggle({ boardId }: BoardFreezeToggleProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [ready, setReady] = useState(false);
  const [initialFrozenAt, setInitialFrozenAt] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void (async () => {
      const supabase = supabaseBrowser();
      const { data: { user } } = await supabase.auth.getUser();
      const { data: board } = await supabase
        .from('boards')
        .select('user_id, frozen_at')
        .eq('id', boardId)
        .maybeSingle();
      if (cancelled) return;
      const row = board as { user_id?: string | null; frozen_at?: string | null } | null;
      setIsOwner(typeof row?.user_id === 'string' && row.user_id.length > 0 && row.user_id === user?.id);
      setInitialFrozenAt(row?.frozen_at ?? null);
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  const { frozenAt, setFrozen } = useBoardFrozen(boardId, initialFrozenAt);
  const isFrozen = frozenAt != null;

  if (!ready || !isOwner) return null;

  return (
    <ShareSwitchRow
      label="Freeze board"
      hint="Nobody else can add or change anything until you unfreeze."
      checked={isFrozen}
      onToggle={() => setFrozen(!isFrozen)}
      switchData={{ 'data-board-freeze-toggle': 'true' }}
    />
  );
}
