'use client';

/**
 * PATCH-368. The "Hide guest names" switch for the Share modal's Guest link tab.
 *
 * SELF-SUFFICIENT like `GuestApprovalToggle`: it takes only `boardId`, reads the
 * board row (`user_id`, `hide_guest_names`) and the current user with the session
 * client, shows the switch only to the BOARD OWNER, writes the column itself, and
 * toasts the 42501 refusal.
 */

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { supabaseBrowser } from '@/lib/supabase/browser';
import ShareSwitchRow from './ShareSwitchRow';

export interface GuestNamesToggleProps {
  readonly boardId: string;
}

export default function GuestNamesToggle({ boardId }: GuestNamesToggleProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
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
          .select('user_id, hide_guest_names')
          .eq('id', boardId)
          .maybeSingle();
        if (cancelled) return;
        const row = board as { user_id?: string | null; hide_guest_names?: boolean | null } | null;
        setIsOwner(typeof row?.user_id === 'string' && row.user_id.length > 0 && row.user_id === user?.id);
        setEnabled(row?.hide_guest_names === true);
        setReady(true);
      } catch {
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
        .update({ hide_guest_names: next })
        .eq('id', boardId);
      if (error) {
        setEnabled(!next);
        if ((error as { code?: string }).code === '42501') {
          toast.error('Only the board owner can change guest name visibility.');
        } else {
          toast.error('Could not change guest name visibility.');
        }
      }
    } catch {
      setEnabled(!next);
      toast.error('Could not change guest name visibility.');
    } finally {
      setSaving(false);
    }
  };

  if (!ready || !isOwner) return null;

  return (
    <ShareSwitchRow
      label="Hide guest names"
      hint="Guests appear as Guest 1–99 to everyone. You still see real names on the People tab."
      checked={enabled}
      onToggle={() => void toggle()}
      disabled={saving}
      switchData={{ 'data-hide-guest-names-toggle': 'true' }}
    />
  );
}
