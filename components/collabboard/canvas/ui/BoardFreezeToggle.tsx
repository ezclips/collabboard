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
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#dfdafb] bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">Freeze board</p>
        <p className="text-xs text-slate-500">Nobody else can add or change anything until you unfreeze.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isFrozen}
        aria-label="Freeze board"
        data-board-freeze-toggle="true"
        onClick={() => setFrozen(!isFrozen)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          isFrozen ? 'bg-sky-600' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            isFrozen ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
