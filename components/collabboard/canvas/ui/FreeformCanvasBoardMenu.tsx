"use client";

import React, { useMemo } from 'react';
import { Check } from 'lucide-react';
import {
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuSeparator,
} from '@/components/ui/context-menu';

type FreeformCanvasBoardMenuProps = {
  x: number;
  y: number;
  isEditable: boolean;
  showGraphLine: boolean;
  canPaste: boolean;
  canUndoPaste: boolean;
  showDotGrid: boolean;
  snapToGrid: boolean;
  alignmentGuides: boolean;
  onClose: () => void;
  onPaste: () => void;
  onUndo: () => void;
  onSelectAll: () => void;
  onToolAction: (toolType: string) => void;
  onOpenBackgroundEditor: () => void;
  onToggleDotGrid: () => void;
  onToggleSnapToGrid: () => void;
  onToggleAlignmentGuides: () => void;
};

export const FREEFORM_BOARD_TOOL_ITEMS = [
  { label: 'New Note', type: 'note' },
  { label: 'New Link', type: 'link' },
  { label: 'New To-do', type: 'todo' },
  { label: 'New Line', type: 'line' },
  { label: 'New Graph Line', type: 'graph-line' },
  { label: 'New Column', type: 'container' },
  { label: 'New Table', type: 'table' },
  { label: 'New Comment', type: 'comment' },
  { label: 'New Image', type: 'image' },
  { label: 'New Upload', type: 'upload' },
  { label: 'New Import', type: 'import' },
  { label: 'New Draw', type: 'draw' },
  { label: 'New Library', type: 'library' },
  { label: 'New AI Drawing', type: 'ai-component' },
];

export default function FreeformCanvasBoardMenu({
  x,
  y,
  isEditable,
  showGraphLine,
  canPaste,
  canUndoPaste,
  showDotGrid,
  snapToGrid,
  alignmentGuides,
  onClose,
  onPaste,
  onUndo,
  onSelectAll,
  onToolAction,
  onOpenBackgroundEditor,
  onToggleDotGrid,
  onToggleSnapToGrid,
  onToggleAlignmentGuides,
}: FreeformCanvasBoardMenuProps) {
  const visibleToolItems = useMemo(
    () => FREEFORM_BOARD_TOOL_ITEMS.filter((item) => item.type !== 'graph-line' || showGraphLine),
    [showGraphLine]
  );

  return (
    <PositionedContextMenu
      open
      x={x}
      y={y}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
      // The board menu sits above every canvas overlay, so it keeps its high
      // stacking order and its wider-than-default column.
      className="z-[9999] min-w-[272px]"
      onClick={(e) => e.stopPropagation()}
    >
      <PositionedContextMenuItem
        disabled={!isEditable || !canPaste}
        onSelect={() => onPaste()}
      >
        Paste
      </PositionedContextMenuItem>
      <PositionedContextMenuItem
        disabled={!isEditable || !canUndoPaste}
        onSelect={() => onUndo()}
      >
        Undo
      </PositionedContextMenuItem>
      <PositionedContextMenuItem onSelect={() => onSelectAll()}>
        Select All
      </PositionedContextMenuItem>

      <PositionedContextMenuSeparator />

      {visibleToolItems.map((item) => (
        <PositionedContextMenuItem
          key={item.type}
          disabled={!isEditable}
          onSelect={() => onToolAction(item.type)}
        >
          {item.label}
        </PositionedContextMenuItem>
      ))}

      <PositionedContextMenuSeparator />

      <PositionedContextMenuItem
        disabled={!isEditable}
        // Dismissal comes from the shared shell, which routes through onClose.
        onSelect={() => onOpenBackgroundEditor()}
      >
        Change Board Background...
      </PositionedContextMenuItem>
      <PositionedContextMenuItem
        // An in-menu toggle: staying open is what makes the checkmark below a
        // useful state indicator rather than something the user never sees.
        onSelect={(event) => {
          event.preventDefault();
          onToggleDotGrid();
        }}
      >
        Show Dot Grid
        {showDotGrid && (
          <span className="ml-auto pl-4 flex items-center text-slate-700">
            <Check className="h-4 w-4" />
          </span>
        )}
      </PositionedContextMenuItem>
      <PositionedContextMenuItem
        // Same personal-preference pattern as Show Dot Grid above: no
        // disabled/isEditable gate -- it's a client-local visual toggle, not
        // an edit action, and PATCH SNAP-GRID-A only persists the setting
        // (movement is not affected yet).
        onSelect={(event) => {
          event.preventDefault();
          onToggleSnapToGrid();
        }}
      >
        Snap to Grid
        {snapToGrid && (
          <span className="ml-auto pl-4 flex items-center text-slate-700">
            <Check className="h-4 w-4" />
          </span>
        )}
      </PositionedContextMenuItem>
      <PositionedContextMenuItem
        // Same personal-preference pattern as Show Dot Grid / Snap to Grid
        // above: no disabled/isEditable gate -- it's a client-local visual
        // toggle (which guides render during drag), not an edit action.
        onSelect={(event) => {
          event.preventDefault();
          onToggleAlignmentGuides();
        }}
      >
        Alignment Guides
        {alignmentGuides && (
          <span className="ml-auto pl-4 flex items-center text-slate-700">
            <Check className="h-4 w-4" />
          </span>
        )}
      </PositionedContextMenuItem>
    </PositionedContextMenu>
  );
}
