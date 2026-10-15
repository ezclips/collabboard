'use client';

/**
 * PATCH-370. The "Waiting for approval" bar for a pending guest post: the label,
 * and -- for the owner -- Approve and Decline (Decline asks inline first).
 *
 * Extracted from FreeformPadletCards (PATCH-367) so every Padlet-style layout
 * (Wall, Columns, Grid, Timeline, Map) shows the same bar. The inline-confirm
 * state lives here, one bar per post.
 */

import React, { useState } from 'react';

import { PENDING_LABEL } from '@/lib/domain/canvas/postApproval';

export interface PendingApprovalBarProps {
  readonly canApprove: boolean;
  readonly onApprove: () => void;
  readonly onDecline: () => void;
}

export default function PendingApprovalBar({ canApprove, onApprove, onDecline }: PendingApprovalBarProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div
      data-pending-approval="true"
      data-no-drag="true"
      onPointerDown={(e) => e.stopPropagation()}
      className="relative z-30 flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800"
    >
      <span>{PENDING_LABEL}</span>
      {canApprove ? (
        <span className="ml-auto flex items-center gap-1">
          {confirming ? (
            <>
              <span className="text-amber-700">Decline?</span>
              <button
                type="button"
                data-decline-post-confirm="true"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onDecline(); }}
                className="rounded bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-red-700"
              >
                Delete
              </button>
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                data-approve-post="true"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); onApprove(); }}
                className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700"
              >
                Approve
              </button>
              <button
                type="button"
                data-decline-post="true"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
                className="rounded px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50"
              >
                Decline
              </button>
            </>
          )}
        </span>
      ) : null}
    </div>
  );
}
