'use client';

/**
 * PATCH-380. The inline "Turn off this guest link?" confirm, including the
 * optional "also remove the N people who joined" checkbox. Extracted from
 * CanvasGuestLinksTab to keep that component under the 400-line ceiling.
 */

import React from 'react';

export interface GuestLinkOffConfirmProps {
  readonly joinedCount: number;
  readonly removeJoined: boolean;
  readonly onRemoveJoinedChange: (next: boolean) => void;
  readonly busy: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

export default function GuestLinkOffConfirm({
  joinedCount,
  removeJoined,
  onRemoveJoinedChange,
  busy,
  onConfirm,
  onCancel,
}: GuestLinkOffConfirmProps) {
  return (
    <div className="flex shrink-0 flex-col items-end gap-1.5">
      {joinedCount > 0 ? (
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            data-remove-joined="true"
            checked={removeJoined}
            onChange={(event) => onRemoveJoinedChange(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-[#655ac9] focus:ring-[#655ac9]"
          />
          Also remove the {joinedCount} {joinedCount === 1 ? 'person' : 'people'} who joined with this link
        </label>
      ) : null}
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs text-gray-600">Turn off?</span>
        <button
          type="button"
          data-guest-link-off-confirm="true"
          onClick={onConfirm}
          disabled={busy}
          className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Turn off
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
