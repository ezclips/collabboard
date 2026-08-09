// components/collabboard/menus/LineContextMenu.tsx
"use client";

import React, { useState } from 'react';
import {
    ContextMenuSwatchRow,
    PositionedContextMenu,
    PositionedContextMenuItem,
    PositionedContextMenuSeparator,
    PositionedContextMenuSwatch,
} from '@/components/ui/context-menu';
import type { CanvasLine } from '@/types/collabboard';
import { ColorPickerContent } from '../ColorPicker';

// Color presets matching the design - compact row of colors
const LINE_COLOR_PRESETS = [
    '#3b82f6', // blue
    '#06b6d4', // cyan
    '#10b981', // green
    '#84cc16', // lime
    '#eab308', // yellow
    '#f97316', // orange
    '#ef4444', // red
    '#ec4899', // pink
    '#8b5cf6', // purple
    '#6b7280', // gray
];

interface LineContextMenuProps {
    isOpen: boolean;
    position: { x: number; y: number };
    line: CanvasLine | null;
    onClose: () => void;
    onDuplicate?: () => void;
    onDelete?: () => void;
    onCut?: () => void;
    onCopy?: () => void;
    onLock?: () => void;
    onBringToFront?: () => void;
    onSendToBack?: () => void;
    onToggleStartArrow?: () => void;
    onToggleEndArrow?: () => void;
    onColorChange?: (color: string) => void;
}

export function LineContextMenu({
    isOpen,
    position,
    line,
    onClose,
    onDuplicate,
    onDelete,
    onCut,
    onCopy,
    onLock,
    onBringToFront,
    onSendToBack,
    onToggleStartArrow,
    onToggleEndArrow,
    onColorChange
}: LineContextMenuProps) {
    const [showCustomColorPicker, setShowCustomColorPicker] = useState(false);

    if (!isOpen || !line) return null;

    const handleColorSelect = (color: string) => {
        onColorChange?.(color);
    };

    return (
        <PositionedContextMenu
            open
            x={position.x}
            y={position.y}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
            // Line menus float above the canvas overlays, so they need a higher
            // stacking order than the shared surface default. `overflow-visible`
            // lets the custom-color panel escape the menu box.
            className="z-[9999] min-w-[220px] overflow-visible"
            onClick={(e) => e.stopPropagation()}
        >
            <PositionedContextMenuItem onSelect={() => onCut?.()}>
                Cut
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onDuplicate?.()}>
                Duplicate
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onDelete?.()}>
                Delete
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onToggleStartArrow?.()}>
                {line.start_arrow ? 'Remove Start Arrow' : 'Add Start Arrow'}
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onToggleEndArrow?.()}>
                {line.end_arrow ? 'Remove End Arrow' : 'Add End Arrow'}
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem onSelect={() => onBringToFront?.()}>
                Bring to Front
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onSendToBack?.()}>
                Send to Back
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            {/* Color Presets Row */}
            <ContextMenuSwatchRow className="flex-nowrap">
                {LINE_COLOR_PRESETS.map((color) => (
                    <PositionedContextMenuSwatch
                        key={color}
                        color={color}
                        label={color}
                        selected={line.color === color}
                        onSelect={() => handleColorSelect(color)}
                    />
                ))}
            </ContextMenuSwatchRow>

            {/* Choose Custom Color */}
            <div className="relative">
                <PositionedContextMenuItem
                    // Keeps the menu open so the panel below stays reachable.
                    onSelect={(event) => event.preventDefault()}
                    onClick={() => setShowCustomColorPicker((open) => !open)}
                >
                    Choose Custom Color...
                    <div className="ml-auto pl-5 text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </PositionedContextMenuItem>

                {/* Custom Color Picker Submenu */}
                {showCustomColorPicker && (
                    <div
                        className="absolute left-full top-0 ml-2 bg-white rounded-lg shadow-2xl border border-gray-200 p-3 animate-in fade-in slide-in-from-left-2 duration-200"
                        style={{ width: '256px', zIndex: 10000 }}
                    >
                        <ColorPickerContent
                            color={line.color || '#374151'}
                            onChange={(c) => {
                                handleColorSelect(c);
                            }}
                            hasOpacity={true}
                            presets={LINE_COLOR_PRESETS}
                        />
                    </div>
                )}
            </div>
        </PositionedContextMenu>
    );
}
