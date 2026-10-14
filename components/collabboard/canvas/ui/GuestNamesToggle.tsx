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
    <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[#dfdafb] bg-white px-3 py-2">
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700">Hide guest names</p>
        <p className="text-xs text-slate-500">
          Guests appear as Guest 1–99 to everyone. You still see real names on the People tab.
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Hide guest names"
        data-hide-guest-names-toggle="true"
        disabled={saving}
        onClick={() => void toggle()}
        className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-[#655ac9]' : 'bg-slate-300'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
