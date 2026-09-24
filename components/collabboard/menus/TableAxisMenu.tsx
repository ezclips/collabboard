"use client";

import React from 'react';
import {
    ArrowDownAZ,
    ArrowDownToLine,
    ArrowLeftToLine,
    ArrowRightToLine,
    ArrowUpToLine,
    ArrowUpZA,
    AlignCenter,
    AlignLeft,
    AlignRight,
    Check,
    Columns3,
    Copy,
    Eraser,
    MoveHorizontal,
    Palette,
    Pencil,
    Sigma,
    Sparkles,
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
 * The menu for ONE row or ONE column, opened from that axis's handle.
 *
 * SEPARATE FROM `TableCellContextMenu` DELIBERATELY. That menu acts on a CELL
 * and its characterization suite pins its action set and order; this one acts
 * on a whole row or column, and lives here so neither surface's contract
 * disturbs the other. Both are built from the same positioned primitives, so
 * they look and behave alike without sharing a component that would have to
 * know which axis it is.
 *
 * The menu receives the INDEX and reports what the user chose; it maps nothing
 * to the grid itself. The editor owns that, so there is one place a structural
 * change is applied.
 */

export type TableAxis = 'row' | 'column';

export type TableAxisAction =
    | 'insert-before'
    | 'insert-after'
    | 'duplicate'
    | 'clear'
    | 'delete'
    | 'fill-ai'
    | 'fit-width'
    | 'distribute-widths'
    | 'color'
    | 'rename'
    | 'fill-row-ai'
    | 'sort-asc'
    | 'sort-desc'
    | 'summary-none'
    | 'summary-sum'
    | 'summary-average'
    | 'summary-count'
    | 'summary-min'
    | 'summary-max';

/** PATCH-174. The column-summary kinds the Summary submenu offers (plus None). */
export type TableSummaryKind = 'sum' | 'average' | 'count' | 'min' | 'max';

export interface TableAxisMenuProps {
    readonly axis: TableAxis;
    readonly isOpen: boolean;
    readonly position: { x: number; y: number };
    readonly onClose: () => void;
    /** Hidden when only one row/column remains -- there would be nothing left. */
    readonly canDelete: boolean;
    /**
     * The shared align of every cell on this axis, or null when they disagree.
     * A CHECKMARK APPEARS ONLY FOR A SHARED VALUE, so the menu never claims an
     * alignment most of the row does not have.
     */
    readonly currentAlign: 'left' | 'center' | 'right' | null;
    readonly onAction: (action: TableAxisAction) => void;
    readonly onAlign: (align: 'left' | 'center' | 'right') => void;
    /** PATCH-174. This column's current summary, for the checkmark. */
    readonly currentSummary?: TableSummaryKind | null;
}

export function TableAxisMenu({
    axis,
    isOpen,
    position,
    onClose,
    canDelete,
    currentAlign,
    onAction,
    onAlign,
    currentSummary = null,
}: TableAxisMenuProps) {
    if (!isOpen) return null;

    const isRow = axis === 'row';
    const InsertBeforeIcon = isRow ? ArrowUpToLine : ArrowLeftToLine;
    const InsertAfterIcon = isRow ? ArrowDownToLine : ArrowRightToLine;
    const insertBefore = isRow ? 'Insert above' : 'Insert left';
    const insertAfter = isRow ? 'Insert below' : 'Insert right';

    /** Trailing checkmark, the same indicator the cell menu uses. */
    const checkmark = (
        <span className="ml-auto pl-4 flex items-center text-gray-600">
            <Check className="w-3.5 h-3.5" />
        </span>
    );
    const itemIcon = (Icon: React.ComponentType<{ className?: string }>) => (
        <Icon className="w-3.5 h-3.5 shrink-0 text-gray-500" />
    );

    return (
        <PositionedContextMenu
            open
            x={position.x}
            y={position.y}
            onOpenChange={(nextOpen) => {
                if (!nextOpen) onClose();
            }}
            className="z-[9999] min-w-[210px]"
            onClick={(e) => e.stopPropagation()}
        >
            {/*
              PATCH-172. Rename is the FIRST item of the COLUMN menu, its own
              group. The row menu has no equivalent -- a row has no title.
            */}
            {!isRow && (
                <>
                    <PositionedContextMenuItem onSelect={() => onAction('rename')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(Pencil)}
                            Rename
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuSeparator />
                </>
            )}

            <PositionedContextMenuItem onSelect={() => onAction('insert-before')}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(InsertBeforeIcon)}
                    {insertBefore}
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAction('insert-after')}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(InsertAfterIcon)}
                    {insertAfter}
                </span>
            </PositionedContextMenuItem>

            <PositionedContextMenuSeparator />

            {/*
              PATCH-171. Color is a plain item now: it selects the whole axis and
              opens the editor's standard Cell color panel, rather than a
              bespoke column of swatches.
            */}
            <PositionedContextMenuItem onSelect={() => onAction('color')}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Palette)}
                    Color
                </span>
            </PositionedContextMenuItem>

            <PositionedContextMenuSub>
                <PositionedContextMenuSubTrigger>
                    <span className="flex w-full items-center gap-2">
                        {itemIcon(AlignLeft)}
                        Align
                    </span>
                </PositionedContextMenuSubTrigger>
                <PositionedContextMenuSubContent className="min-w-[150px]">
                    <PositionedContextMenuItem onSelect={() => onAlign('left')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignLeft)}
                            Left
                            {currentAlign === 'left' && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem onSelect={() => onAlign('center')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignCenter)}
                            Center
                            {currentAlign === 'center' && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem onSelect={() => onAlign('right')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(AlignRight)}
                            Right
                            {currentAlign === 'right' && checkmark}
                        </span>
                    </PositionedContextMenuItem>
                </PositionedContextMenuSubContent>
            </PositionedContextMenuSub>

            {/*
              PATCH-173. Fill row with AI is a ROW action only: it fills that
              row's empty cells from each column's title. Placed after Align,
              before the separator that opens the structural group.
            */}
            {isRow && (
                <PositionedContextMenuItem onSelect={() => onAction('fill-row-ai')}>
                    <span className="flex w-full items-center gap-2">
                        {itemIcon(Sparkles)}
                        Fill row with AI…
                    </span>
                </PositionedContextMenuItem>
            )}

            {/*
              PATCH-166. Fill with AI is a COLUMN action only: the row menu has
              no equivalent, because an instruction applies to a column, row by
              row. Placed after Align and before the separator that opens the
              structural group.
            */}
            {!isRow && (
                <PositionedContextMenuItem onSelect={() => onAction('fill-ai')}>
                    <span className="flex w-full items-center gap-2">
                        {itemIcon(Sparkles)}
                        Fill with AI…
                    </span>
                </PositionedContextMenuItem>
            )}

            {/*
              PATCH-170. Column width tools, their own group. Column-only: a row
              has no width. `Fit to content` fits THIS column; `Distribute`
              applies to every column.
            */}
            {!isRow && (
                <>
                    <PositionedContextMenuSeparator />
                    <PositionedContextMenuItem onSelect={() => onAction('fit-width')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(MoveHorizontal)}
                            Fit to content
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem onSelect={() => onAction('distribute-widths')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(Columns3)}
                            Distribute columns evenly
                        </span>
                    </PositionedContextMenuItem>
                </>
            )}

            {/*
              PATCH-174. Sort and Summary, their own group. Column-only: a row
              has no order or total of its own. `Sort` orders the whole table by
              this column; `Summary` shows a total under it.
            */}
            {!isRow && (
                <>
                    <PositionedContextMenuSeparator />
                    <PositionedContextMenuItem onSelect={() => onAction('sort-asc')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(ArrowDownAZ)}
                            Sort A → Z
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuItem onSelect={() => onAction('sort-desc')}>
                        <span className="flex w-full items-center gap-2">
                            {itemIcon(ArrowUpZA)}
                            Sort Z → A
                        </span>
                    </PositionedContextMenuItem>
                    <PositionedContextMenuSub>
                        <PositionedContextMenuSubTrigger>
                            <span className="flex w-full items-center gap-2">
                                {itemIcon(Sigma)}
                                Summary
                            </span>
                        </PositionedContextMenuSubTrigger>
                        <PositionedContextMenuSubContent className="min-w-[150px]">
                            <PositionedContextMenuItem onSelect={() => onAction('summary-none')}>
                                <span className="flex w-full items-center gap-2">
                                    None
                                    {currentSummary === null && checkmark}
                                </span>
                            </PositionedContextMenuItem>
                            {([['summary-sum', 'Sum'], ['summary-average', 'Average'], ['summary-count', 'Count'], ['summary-min', 'Min'], ['summary-max', 'Max']] as const).map(([action, label]) => (
                                <PositionedContextMenuItem key={action} onSelect={() => onAction(action)}>
                                    <span className="flex w-full items-center gap-2">
                                        {label}
                                        {currentSummary === label.toLowerCase() && checkmark}
                                    </span>
                                </PositionedContextMenuItem>
                            ))}
                        </PositionedContextMenuSubContent>
                    </PositionedContextMenuSub>
                </>
            )}

            <PositionedContextMenuSeparator />

            <PositionedContextMenuItem onSelect={() => onAction('duplicate')}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Copy)}
                    Duplicate
                </span>
            </PositionedContextMenuItem>
            <PositionedContextMenuItem onSelect={() => onAction('clear')}>
                <span className="flex w-full items-center gap-2">
                    {itemIcon(Eraser)}
                    Clear contents
                </span>
            </PositionedContextMenuItem>
            {canDelete ? (
                <PositionedContextMenuItem variant="destructive" onSelect={() => onAction('delete')}>
                    <span className="flex w-full items-center gap-2">
                        {itemIcon(Trash2)}
                        Delete
                    </span>
                </PositionedContextMenuItem>
            ) : null}
        </PositionedContextMenu>
    );
}

export default TableAxisMenu;
