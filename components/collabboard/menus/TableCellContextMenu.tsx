"use client";

import React from 'react';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    AlignVerticalJustifyCenter,
    AlignVerticalJustifyEnd,
    AlignVerticalJustifyStart,
    ArrowDownToLine,
    ArrowLeftToLine,
    ArrowRightToLine,
    ArrowUpToLine,
    Check,
    ClipboardPaste,
    Copy,
    Scissors,
    Trash2,
} from "lucide-react";
import {
    PositionedContextMenu,
    PositionedContextMenuItem,
    PositionedContextMenuSeparator,
    PositionedContextMenuSub,
    PositionedContextMenuSubContent,
    PositionedContextMenuSubTrigger,
} from '@/components/ui/context-menu';

/**
 * The right-click menu for ONE cell.
 *
 * PATCH-167: it now reads and looks like the row/column handle menu
 * (`TableAxisMenu`) -- an icon on every item and sentence-case wording. The
 * actions, order, groups, separators, callbacks, destructive variant and
 * alignment/checkmark rules are unchanged; only the labels and the leading
 * icons differ.
 */

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
    if (!isOpen) return null;

    /** Trailing checkmark, matching the original right-aligned indicator. */
    const checkmark = (
        <span className="ml-auto pl-4 flex items-center text-gray-600">
            <Check className="w-3.5 h-3.5" />
        </span>
    );
    const itemIcon = (Icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>) => (
        <Icon className="w-3.5 h-3.5 shrink-0 text-gray-500" aria-hidden={true} />
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
            // high stacking order. The alignment submenu is portaled by the shared
            // primitive, so the surface no longer has to opt out of clipping.
            className="z-[9999] min-w-[200px]"
            onClick={(e) => e.stopPropagation()}
        >
            <PositionedContextMenuItem onSelect={() => onCut?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Scissors)}
                    Cut
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onCopy?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Copy)}
                    Copy
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onPaste?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(ClipboardPaste)}
                    Paste
                </span>
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem onSelect={() => onAddRowAbove?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(ArrowUpToLine)}
                    Insert row above
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAddRowBelow?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(ArrowDownToLine)}
                    Insert row below
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAddColumnLeft?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(ArrowLeftToLine)}
                    Insert column left
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAddColumnRight?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(ArrowRightToLine)}
                    Insert column right
                </span>
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem variant="destructive" onSelect={() => onDeleteRow?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Trash2)}
                    Delete row
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem variant="destructive" onSelect={() => onDeleteColumn?.()}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Trash2)}
                    Delete column
                </span>
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            {/*
              * Alignment submenu. Each choice forwards the pair it was given,
              * changing only its own axis and passing the counterpart through
              * verbatim -- including `undefined`, so an unset axis is never
              * silently defaulted to the value the checkmark happens to show.
              */}
            <PositionedContextMenuSub>
                <PositionedContextMenuSubTrigger>
                    <span className="flex w-full items-center gap-2">
                        {itemIcon(AlignLeft)}
                        Align
                    </span>
                </PositionedContextMenuSubTrigger>

                <PositionedContextMenuSubContent className="min-w-[150px]">
                    <PositionedContextMenuItem
                        onSelect={() => onAlignChange?.("left", currentVerticalAlign)}
                    >
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignLeft)}
                            Left
                            {(currentAlign === "left" || !currentAlign) && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem
                        onSelect={() => onAlignChange?.("center", currentVerticalAlign)}
                    >
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignCenter)}
                            Center
                            {currentAlign === "center" && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem
                        onSelect={() => onAlignChange?.("right", currentVerticalAlign)}
                    >
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignRight)}
                            Right
                            {currentAlign === "right" && checkmark}
                        </span>
                    </PositionedContextMenuItem>

                    <PositionedContextMenuSeparator />

                    <PositionedContextMenuItem
                        onSelect={() => onAlignChange?.(currentAlign, "top")}
                    >
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignVerticalJustifyStart)}
                            Top
                            {(currentVerticalAlign === "top" || !currentVerticalAlign) && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem
                        onSelect={() => onAlignChange?.(currentAlign, "middle")}
                    >
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignVerticalJustifyCenter)}
                            Middle
                            {currentVerticalAlign === "middle" && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem
                        onSelect={() => onAlignChange?.(currentAlign, "bottom")}
                    >
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignVerticalJustifyEnd)}
                            Bottom
                            {currentVerticalAlign === "bottom" && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                </PositionedContextMenuSubContent>
            </PositionedContextMenuSub>
        </PositionedContextMenu>
    );
}
