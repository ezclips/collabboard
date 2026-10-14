'use client';

/**
 * PATCH-367. The owner-only pill: "N guest post(s) waiting", hidden at 0.
 *
 * When given an `onFocus` handler it is a button that takes the owner to the
 * oldest waiting post (CanvasClient's existing board-reveal); without one it is
 * informational only.
 */

import React from 'react';

import { guestPostsWaitingLabel } from '@/lib/domain/canvas/postApproval';

export interface PendingPostsPillProps {
  readonly count: number;
  readonly onFocus?: () => void;
}

export default function PendingPostsPill({ count, onFocus }: PendingPostsPillProps) {
  if (count <= 0) return null;

  const interactive = typeof onFocus === 'function';

  return (
    <button
      type="button"
      data-pending-pill="true"
      data-pending-count={count}
      onClick={interactive ? onFocus : undefined}
      disabled={!interactive}
      title={interactive ? 'Show the oldest waiting post' : undefined}
      className="fixed left-1/2 top-16 z-[1900] -translate-x-1/2 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-900 shadow-md disabled:cursor-default"
    >
      {guestPostsWaitingLabel(count)}
    </button>
  );
}
