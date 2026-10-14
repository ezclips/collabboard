'use client';

/**
 * PATCH-367. The "Approve guest posts first" switch for the Share modal's Guest
 * link tab.
 *
 * SELF-SUFFICIENT like `BoardFreezeToggle`: it takes only `boardId`, reads the
 * board row (`user_id`, `guest_posts_need_approval`) and the current user with
 * the session client, shows the switch only to the BOARD OWNER, writes the
 * column itself, and toasts the 42501 refusal.
 *
 * It also counts the posts already waiting, so the hint under the switch can
 * say plainly that turning it off does not approve them -- the owner can see
 * every pending post, so the count is complete for the person who sees this.
 */

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { supabaseBrowser } from '@/lib/supabase/browser';
import ShareSwitchRow from './ShareSwitchRow';

export interface GuestApprovalToggleProps {
  readonly boardId: string;
}

export default function GuestApprovalToggle({ boardId }: GuestApprovalToggleProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [pending, setPending] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        const { data: board } = await supabase
          .from('boards')
          .select('user_id, guest_posts_need_approval')
          .eq('id', boardId)
          .maybeSingle();
        if (cancelled) return;
        const row = board as { user_id?: string | null; guest_posts_need_approval?: boolean | null } | null;
        setIsOwner(typeof row?.user_id === 'string' && row.user_id.length > 0 && row.user_id === user?.id);
        setEnabled(row?.guest_posts_need_approval === true);
        setReady(true);

        // How many posts are already waiting (owner-visible, so complete here).
        const { count } = await supabase
          .from('padlets')
          .select('id', { count: 'exact', head: true })
          .or(`board_id.eq.${boardId},canvas_id.eq.${boardId}`)
          .eq('metadata->>pendingApproval', 'true');
        if (!cancelled) setPending(typeof count === 'number' ? count : 0);
      } catch {
        // The switch itself must still work if the count read fails.
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  const toggle = async () => {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setEnabled(next);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from('boards')
        .update({ guest_posts_need_approval: next })
        .eq('id', boardId);
      if (error) {
        setEnabled(!next);
        if ((error as { code?: string }).code === '42501') {
          toast.error('Only the board owner can change guest post approval.');
        } else {
          toast.error('Could not change guest post approval.');
        }
      }
    } catch {
      setEnabled(!next);
      toast.error('Could not change guest post approval.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !isOwner) return null;

  return (
    <ShareSwitchRow
      label="Approve guest posts first"
      hint="New guest posts stay hidden from everyone else until you approve them."
      checked={enabled}
      onToggle={() => void toggle()}
      disabled={saving}
      switchData={{ 'data-guest-approval-toggle': 'true' }}
    >
      {pending > 0 ? (
        <p data-guest-approval-pending-hint="true" className="pb-2 text-xs text-amber-700">
          {pending} post{pending === 1 ? '' : 's'} already waiting stay pending until you approve or decline them.
        </p>
      ) : null}
    </ShareSwitchRow>
  );
}
