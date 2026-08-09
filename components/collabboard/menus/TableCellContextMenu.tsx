"use client";

import React, { useState } from 'react';
import {
    Check,
    ChevronRight
} from "lucide-react";
import {
    ContextMenuShortcut,
    PositionedContextMenu,
    PositionedContextMenuItem,
    PositionedContextMenuSeparator,
} from '@/components/ui/context-menu';

interface TableCellContextMenuProps {
    isOpen: boolean;
    position: { x: number; y: number };
    onClose: () => void;

    // Actions
    onCut?: () => void;
    onCopy?: () => void;
    onPaste?: () => void;

    onAddRowAbove?: () => void;
    onAddRowBelow?: () => void;
    onAddColumnLeft?: () => void;
    onAddColumnRight?: () => void;
    onDeleteRow?: () => void;
    onDeleteColumn?: () => void;

    // Alignment
    currentAlign?: "left" | "center" | "right";
    currentVerticalAlign?: "top" | "middle" | "bottom";
    onAlignChange?: (align?: "left" | "center" | "right", vertical?: "top" | "middle" | "bottom") => void;
}

export function TableCellContextMenu({
    isOpen,
    position,
    onClose,
    onCut,
    onCopy,
    onPaste,
    onAddRowAbove,
    onAddRowBelow,
    onAddColumnLeft,
    onAddColumnRight,
    onDeleteRow,
    onDeleteColumn,
    currentAlign,
    currentVerticalAlign,
    onAlignChange
}: TableCellContextMenuProps) {
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);

    if (!isOpen) return null;

    /** Trailing checkmark, matching the original right-aligned indicator. */
    const checkmark = (
        <span className="ml-auto pl-4 flex items-center text-gray-600">
            <Check className="w-3.5 h-3.5" />
        </span>
    );

    return (
        <PositionedContextMenu
            open
            x={position.x}
            y={position.y}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
            // The table editor floats above canvas chrome, so this menu keeps its
            // high stacking order. `overflow-visible` lets the hover-disclosed
            // alignment submenu escape the menu box.
            className="z-[9999] min-w-[200px] overflow-visible"
            onClick={(e) => e.stopPropagation()}
        >
            <PositionedContextMenuItem onSelect={() => onCut?.()}>
                Cut
                <ContextMenuShortcut>Ctrl+X</ContextMenuShortcut>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onCopy?.()}>
                Copy
                <ContextMenuShortcut>Ctrl+C</ContextMenuShortcut>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onPaste?.()}>
                Paste
                <ContextMenuShortcut>Ctrl+V</ContextMenuShortcut>
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem onSelect={() => onAddRowAbove?.()}>
                Add Row Above
                <ContextMenuShortcut>Alt+↑</ContextMenuShortcut>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAddRowBelow?.()}>
                Add Row Below
                <ContextMenuShortcut>Alt+↓</ContextMenuShortcut>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAddColumnLeft?.()}>
                Add Column Left
                <ContextMenuShortcut>Alt+←</ContextMenuShortcut>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAddColumnRight?.()}>
                Add Column Right
                <ContextMenuShortcut>Alt+→</ContextMenuShortcut>
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem variant="destructive" onSelect={() => onDeleteRow?.()}>
                Delete Row
            </PositionedContextMenuItem>
            <PositionedContextMenuItem variant="destructive" onSelect={() => onDeleteColumn?.()}>
                Delete Column
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            {/* Change Alignment Submenu Trigger */}
            <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu("alignment")}
                onMouseLeave={() => setActiveSubmenu(null)}
            >
                <PositionedContextMenuItem
                    // A pure hover disclosure: clicking it neither acts nor closes.
                    onSelect={(event) => event.preventDefault()}
                >
                    Change Alignment...
                    <span className="ml-auto pl-4 flex items-center">
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                    </span>
                </PositionedContextMenuItem>

                {/* Submenu */}
                {activeSubmenu === "alignment" && (
                    <div
                        className="absolute left-full top-0 ml-0.5 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px]"
                        style={{ marginTop: '-4px' }} // Align top nicely
                    >
                        <PositionedContextMenuItem
                            onSelect={() => onAlignChange?.("left", currentVerticalAlign)}
                        >
                            Left
                            {(currentAlign === "left" || !currentAlign) && checkmark}
                        </PositionedContextMenuItem>
                        <PositionedContextMenuItem
                            onSelect={() => onAlignChange?.("center", currentVerticalAlign)}
                        >
                            Center
                            {currentAlign === "center" && checkmark}
                        </PositionedContextMenuItem>
                        <PositionedContextMenuItem
                            onSelect={() => onAlignChange?.("right", currentVerticalAlign)}
                        >
                            Right
                            {currentAlign === "right" && checkmark}
                        </PositionedContextMenuItem>

                        <PositionedContextMenuSeparator />

                        <PositionedContextMenuItem
                            onSelect={() => onAlignChange?.(currentAlign, "top")}
                        >
                            Top
                            {(currentVerticalAlign === "top" || !currentVerticalAlign) && checkmark}
                        </PositionedContextMenuItem>
                        <PositionedContextMenuItem
                            onSelect={() => onAlignChange?.(currentAlign, "middle")}
                        >
                            Middle
                            {currentVerticalAlign === "middle" && checkmark}
                        </PositionedContextMenuItem>
                        <PositionedContextMenuItem
                            onSelect={() => onAlignChange?.(currentAlign, "bottom")}
                        >
                            Bottom
                            {currentVerticalAlign === "bottom" && checkmark}
                        </PositionedContextMenuItem>
                    </div>
                )}
            </div>
        </PositionedContextMenu>
    );
}
