'use client';

/**
 * PATCH-376. The layout picker in Canvas settings, on its own so PATCH-377's
 * real cross-family conversion can extend it without growing the window again.
 *
 * A tile of the OTHER family is shown DISABLED with the reason under the row,
 * never removed: a missing tile reads as a bug, a disabled one with a reason
 * reads as a plan. The rule itself is pure and lives in
 * `lib/domain/canvas/layoutSwitchFamilies.ts` -- this file only presents it.
 */

import React from 'react';
import { Columns3, Grid3X3, Layers3, Clock } from 'lucide-react';

import type { LayoutType } from '@/types/collabboard';
import {
  CROSS_FAMILY_NOTE,
  canSwitchLayout,
  layoutFamily,
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
}

export default function CanvasLayoutTiles({
  currentLayout,
  selectedLayout,
  canEdit,
  onSelect,
}: CanvasLayoutTilesProps) {
  // Null for a layout with neither posts shape -- the old "not available" line.
  if (!layoutFamily(currentLayout)) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">
        Layout switching isn&apos;t available for this canvas type.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-4 gap-2">
        {SWITCHABLE_LAYOUTS.map((option) => {
          const IconComponent = option.icon;
          const isSelected = selectedLayout === option.id;
          // A tile of the OTHER family would hide every post, so it is disabled
          // with the reason under the row rather than removed.
          const crossFamily = !canSwitchLayout(currentLayout, option.id);
          return (
            <button
              key={option.id}
              type="button"
              data-settings-layout={option.id}
              {...(crossFamily ? { 'data-settings-layout-disabled': 'true' } : {})}
              disabled={!canEdit || crossFamily}
              title={crossFamily ? CROSS_FAMILY_NOTE : undefined}
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
      <p data-settings-layout-note="true" className="text-xs text-gray-500">
        {CROSS_FAMILY_NOTE}
      </p>
    </>
  );
}
