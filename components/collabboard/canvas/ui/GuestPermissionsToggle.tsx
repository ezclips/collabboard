'use client';

/**
 * PATCH-380. The two "what may guests do" switches for the Share modal's Guest
 * link tab.
 *
 * REUSES the existing board-settings write path, exactly as `GuestNamesToggle`
 * and `GuestApprovalToggle` do: the switch reads the board row (`user_id` plus the
 * two flags) with the session client, shows only to the BOARD OWNER, and writes
 * the column with `supabaseBrowser().from('boards').update(...)`. The database
 * trigger `boards_guard_guest_permissions` is the second line of defence -- it
 * refuses a non-owner write with 42501, which is what the toast reports.
 *
 * Both flags default FALSE, so a guest keeps exactly the access PATCH-379 left
 * them until the owner turns one on.
 */

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { supabaseBrowser } from '@/lib/supabase/browser';
import ShareSwitchRow from './ShareSwitchRow';

export interface GuestPermissionsToggleProps {
  readonly boardId: string;
}

type Flag = 'guest_uploads_allowed' | 'guest_ai_allowed';

const TOAST_OWNER = 'Only the board owner can change what guests may do.';

export default function GuestPermissionsToggle({ boardId }: GuestPermissionsToggleProps) {
  const [isOwner, setIsOwner] = useState(false);
  const [ready, setReady] = useState(false);
  const [uploads, setUploads] = useState(false);
  const [ai, setAi] = useState(false);
  const [saving, setSaving] = useState<Flag | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    void (async () => {
      try {
        const supabase = supabaseBrowser();
        const { data: { user } } = await supabase.auth.getUser();
        const { data: board } = await supabase
          .from('boards')
          .select('user_id, guest_uploads_allowed, guest_ai_allowed')
          .eq('id', boardId)
          .maybeSingle();
        if (cancelled) return;
        const row = board as {
          user_id?: string | null;
          guest_uploads_allowed?: boolean | null;
          guest_ai_allowed?: boolean | null;
        } | null;
        setIsOwner(typeof row?.user_id === 'string' && row.user_id.length > 0 && row.user_id === user?.id);
        setUploads(row?.guest_uploads_allowed === true);
        setAi(row?.guest_ai_allowed === true);
        setReady(true);
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [boardId]);

  const toggle = async (flag: Flag, next: boolean) => {
    if (saving) return;
    setSaving(flag);
    const apply = flag === 'guest_uploads_allowed' ? setUploads : setAi;
    apply(next);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase
        .from('boards')
        .update({ [flag]: next })
        .eq('id', boardId);
      if (error) {
        apply(!next);
        if ((error as { code?: string }).code === '42501') {
          toast.error(TOAST_OWNER);
        } else {
          toast.error('Could not change what guests may do.');
        }
      }
    } catch {
      apply(!next);
      toast.error('Could not change what guests may do.');
    } finally {
      setSaving(null);
    }
  };

  if (!ready || !isOwner) return null;

  return (
    <>
      <ShareSwitchRow
        label="Guests may upload images and PDFs"
        hint="Guests can add images and PDFs. Their files go through your board and count against storage."
        checked={uploads}
        onToggle={() => void toggle('guest_uploads_allowed', !uploads)}
        disabled={saving !== null}
        switchData={{ 'data-guest-permission': 'uploads' }}
      />
      <ShareSwitchRow
        label="Guests may use Board AI"
        hint="Uses your AI credits"
        checked={ai}
        onToggle={() => void toggle('guest_ai_allowed', !ai)}
        disabled={saving !== null}
        switchData={{ 'data-guest-permission': 'ai' }}
      />
    </>
  );
}
