"use client";

import React from 'react';
import {
  PositionedContextMenu,
  PositionedContextMenuItem,
  PositionedContextMenuLabel,
  PositionedContextMenuSeparator,
  PositionedContextMenuSwatch,
} from '@/components/ui/positioned-context-menu';
import { TEXT_COLOR_PRESETS, HIGHLIGHT_COLOR_PRESETS } from './textStylePresets';

interface SelectedTextContextMenuProps {
  /** Controlled visibility + viewport coordinates -- same contract as PositionedContextMenu. */
  open: boolean;
  x: number;
  y: number;
  /** Fires with `false` on Escape, outside pointer-down, Tab, or item select. */
  onOpenChange: (open: boolean) => void;
  currentTextColor?: string;
  currentHighlightColor?: string;
  onTextColor: (color: string) => void;
  onHighlight: (color: string) => void;
  onClearHighlight: () => void;
  /**
   * KNI-R4 seam. Absent means "not available yet": render nothing, never a
   * disabled/fake placeholder item.
   */
  onAIAction?: () => void;
}

/**
 * KNI-R3. The one shared selected-text right-click menu for Note and
 * Document. Presentation only: the owning editor decides whether a
 * right-click may claim the native contextmenu event, captures/restores the
 * TipTap range, and supplies these callbacks -- this component never reads
 * an editor or a DOM selection itself. Escape, outside-pointer dismissal,
 * and viewport clamping all come from PositionedContextMenu; nothing here
 * re-implements them.
 */
export default function SelectedTextContextMenu({
  open,
  x,
  y,
  onOpenChange,
  currentTextColor,
  currentHighlightColor,
  onTextColor,
  onHighlight,
  onClearHighlight,
  onAIAction,
}: SelectedTextContextMenuProps) {
  return (
    <PositionedContextMenu
      open={open}
      x={x}
      y={y}
      onOpenChange={onOpenChange}
      // KNI-R3B: elevate above PostEditorShell's z-[1000] modal overlay (shared default is z-50).
      className="w-56 py-2 z-[1100]"
    >
      <PositionedContextMenuLabel>Text color</PositionedContextMenuLabel>
      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
        {TEXT_COLOR_PRESETS.map((color) => (
          <PositionedContextMenuSwatch
            key={color}
            color={color}
            label={color}
            selected={currentTextColor === color}
            onSelect={() => onTextColor(color)}
          />
        ))}
      </div>

      <PositionedContextMenuSeparator />

      <PositionedContextMenuLabel>Highlight</PositionedContextMenuLabel>
      <div className="flex flex-wrap gap-1.5 px-2 pb-2">
        {HIGHLIGHT_COLOR_PRESETS.map((color) => (
          <PositionedContextMenuSwatch
            key={color}
            color={color}
            label={color === 'transparent' ? 'Clear' : color}
            selected={currentHighlightColor === color}
            onSelect={() => (color === 'transparent' ? onClearHighlight() : onHighlight(color))}
          />
        ))}
      </div>

      {onAIAction && (
        <>
          <PositionedContextMenuSeparator />
          <PositionedContextMenuItem onSelect={() => onAIAction()}>Ask AI</PositionedContextMenuItem>
        </>
      )}
    </PositionedContextMenu>
  );
}
