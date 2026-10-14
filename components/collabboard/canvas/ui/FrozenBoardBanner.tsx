'use client';

/**
 * PATCH-366. The frozen-board banner: a slim bar at the top centre. The owner
 * sees the owner copy and an Unfreeze button; everyone else sees the visitor
 * copy. Rendered once per layout (Freeform, Kanban, Gantt) by CanvasClient.
 */

import React from 'react';
import { Snowflake } from 'lucide-react';

import { FROZEN_BANNER_OWNER, FROZEN_BANNER_VISITOR } from '@/lib/domain/canvas/boardFreeze';

export interface FrozenBoardBannerProps {
  readonly frozen: boolean;
  readonly isOwnerOrAdmin: boolean;
  readonly onUnfreeze?: () => void;
  readonly unfreezing?: boolean;
}

export default function FrozenBoardBanner({
  frozen,
  isOwnerOrAdmin,
  onUnfreeze,
  unfreezing,
}: FrozenBoardBannerProps) {
  if (!frozen) return null;

  return (
    <div
      data-frozen-banner="true"
      className="fixed left-1/2 top-4 z-[2000] flex -translate-x-1/2 items-center gap-3 rounded-full border border-sky-200 bg-sky-50 px-4 py-2 text-sm text-sky-900 shadow-lg"
    >
      <Snowflake className="h-4 w-4 shrink-0 text-sky-500" aria-hidden="true" />
      <span>{isOwnerOrAdmin ? FROZEN_BANNER_OWNER : FROZEN_BANNER_VISITOR}</span>
      {isOwnerOrAdmin && onUnfreeze ? (
        <button
          type="button"
          data-frozen-unfreeze="true"
          onClick={onUnfreeze}
          disabled={unfreezing}
          className="rounded-full bg-sky-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-sky-700 disabled:opacity-50"
        >
          Unfreeze
        </button>
      ) : null}
    </div>
  );
}
