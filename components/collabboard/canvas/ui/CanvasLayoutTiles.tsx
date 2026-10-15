'use client';

/**
 * PATCH-376/377. The layout picker in Canvas settings.
 *
 * PATCH-376 disabled the other family's tiles because a bare `boards.layout`
 * change across families left the board looking empty. PATCH-377 CONVERTS the
 * posts instead (`public.convert_board_layout`), so all four tiles are selectable
 * again -- and choosing the other family shows what will happen to the posts,
 * counted from the loaded ones, so nobody has to guess.
 *
 * The rules are pure and live in `lib/domain/canvas/layoutSwitchFamilies.ts`;
 * this file only presents them.
 */

import React from 'react';
import { Columns3, Grid3X3, Layers3, Clock } from 'lucide-react';

import type { LayoutType } from '@/types/collabboard';
import {
  CARD_COMMENTS_NOTE,
  layoutFamily,
  layoutSwitchPlan,
  type LayoutSwitchCounts,
} from '@/lib/domain/canvas/layoutSwitchFamilies';

/**
 * The four layouts this window can switch between. Kanban/Gantt/Scheduler/Map/
 * Drawing/Freeform each depend on structures (kanban_columns, map pins, …) that
 * a blind layout swap would leave inconsistent, so they stay out.
 */
const SWITCHABLE_LAYOUTS: { id: LayoutType; name: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'wall', name: 'Wall', icon: Layers3 },
  { id: 'columns', name: 'Columns', icon: Columns3 },
  { id: 'grid', name: 'Grid', icon: Grid3X3 },
  { id: 'timeline', name: 'Timeline', icon: Clock },
];

export interface CanvasLayoutTilesProps {
  /** The board's CURRENT layout: what a switch would be made from. */
  readonly currentLayout: LayoutType | null | undefined;
  /** The layout selected in the window right now. */
  readonly selectedLayout: LayoutType;
  /** False for a viewer: every tile is disabled, as the window's other inputs are. */
  readonly canEdit: boolean;
  readonly onSelect: (layout: LayoutType) => void;
  /** PATCH-377. What the board has now, for the conversion sentence. */
  readonly counts: LayoutSwitchCounts;
}

export default function CanvasLayoutTiles({
  currentLayout,
  selectedLayout,
  canEdit,
  onSelect,
  counts,
}: CanvasLayoutTilesProps) {
  // Null for a layout with neither posts shape -- the old "not available" line.
  if (!layoutFamily(currentLayout)) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
        Layout switching isn&apos;t available for this canvas type.
      </p>
    );
  }

  const plan = layoutSwitchPlan(currentLayout, selectedLayout, counts);
  const convertSummary = plan?.kind === 'convert' ? plan.summary : null;

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {SWITCHABLE_LAYOUTS.map((option) => {
          const IconComponent = option.icon;
          const isSelected = selectedLayout === option.id;
          return (
            <button
              key={option.id}
              type="button"
              data-settings-layout={option.id}
              disabled={!canEdit}
              onClick={() => onSelect(option.id)}
              className={`flex flex-col items-center gap-1 rounded-lg border-2 px-2 py-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <IconComponent size={18} />
              {option.name}
            </button>
          );
        })}
      </div>
      {convertSummary ? (
        <p data-settings-layout-convert-summary="true" className="text-xs text-gray-500">
          {convertSummary}
          {counts.commentedPanels > 0 ? ` ${CARD_COMMENTS_NOTE}` : ''}
        </p>
      ) : null}
    </>
  );
}
