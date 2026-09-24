"use client";

import React, { useState, useCallback, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import {
    ArrowLeft,
    Type,
    Hash,
    Palette,
    AlignLeft,
    AlignCenter,
    AlignRight,
    Plus,
    Grid,
    GripVertical,
    MessageSquare,
    ChevronRight,
    Check,
    X,
} from "lucide-react";
import { useReactTable, getCoreRowModel, flexRender, ColumnDef } from "@tanstack/react-table";
import { ColorPickerContent } from "../ColorPicker";
import { TableCellContextMenu } from "../menus/TableCellContextMenu";
import * as Popover from "@radix-ui/react-popover";
import TextFormattingButtons from "./TextFormattingButtons";
import { nextTextAlign } from "./textAlignCycle";
import CommentPopup from "./CommentPopup";
import { guardCommentMutation, type CommentAccessMode } from "@/lib/domain/canvas/comments";
import {
    clearColumn,
    clearRow,
    deleteColumn as deleteColumnAt,
    deleteRow as deleteRowAt,
    duplicateColumn,
    duplicateRow,
    insertColumn,
    insertRow,
    setColumnStyle,
    setRowStyle,
    type TableGrid,
} from "@/lib/domain/canvas/tableStructure";
import { TableAxisMenu, type TableAxisAction } from "../menus/TableAxisMenu";
import TableFillPanel from "./TableFillPanel";
import TableAskAIPanel from "./TableAskAIPanel";
import { applyTableFillValues, type TableFillValue } from "@/lib/domain/ai/tableFill";
import { tableSelectionText } from "@/lib/domain/ai/tableAskAI";

// Comment interface
interface PadletComment {
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    color?: string;
    textColor?: string;
    backgroundColor?: string;
    isStrikethrough?: boolean;
}

type CommentTitleStyle = { color?: string; backgroundColor?: string };

export type TableToolbarMode = "outside" | "inside";

// Cell types for the submenu
const CELL_TYPES = [
    { id: "auto", label: "Auto", icon: "A" },
    { id: "number", label: "Number", icon: "123", hasSubmenu: true },
    { id: "currency", label: "Currency", icon: "$", hasSubmenu: true },
    { id: "percentage", label: "Percentage", icon: "%" },
    { id: "text", label: "Text", icon: "ABC" },
    { id: "date", label: "Date & Time", icon: "📅" },
    { id: "checkbox", label: "Checkbox", icon: "☑" },
];

interface TableTool {
    id: string;
    icon: React.ComponentType<any> | (() => React.ReactNode);
    label: string;
    onClick?: () => void;
    submenu?: string;
    active?: boolean;
}

// Color palette matching other editors
const CELL_COLORS = [
    "#ffffff",
    "#fee2e2",
    "#ffedd5",
    "#fef3c7",
    "#dcfce7",
    "#dbeafe",
    "#e0e7ff",
    "#f3e8ff",
    "#fce7f3",
    "#ffe4e6",
    "#f87171",
    "#fb923c",
    "#fbbf24",
    "#34d399",
    "#60a5fa",
    "#818cf8",
    "#a78bfa",
    "#f472b6",
    "#fb7185",
    "#94a3b8",
];

// Formula options
const FORMULAS = ["SUM", "IF", "MIN", "MAX", "COUNT", "AVERAGE"];

interface TableEditorProps {
    initialTitle?: string;
    initialContent?: string;
    onSave: (data: { title: string; content: string; isCollapsed?: boolean }) => void;
    onClose: () => void;
    isOpen: boolean;
    // PATCH 8V -- accessMode/currentUserId/currentUserName. Matches
    // NoteEditor/DrawingEditor/TodoEditor/AIComponentEditor/LinkEditor's
    // own-editor-site convention: defaults to 'manage'/'anon'/'You' so
    // existing callers that don't yet pass these keep their current
    // fully-writable behavior.
    accessMode?: CommentAccessMode;
    currentUserId?: string;
    currentUserName?: string;
}

type CellStyle = {
    bg?: string;
    align?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
};

type CellCoord = { row: number; col: number };
type SelectionRange = { start: CellCoord; end: CellCoord };
type SelectionBox = { left: number; top: number; width: number; height: number } | null;

const TABLE_ROW_HEADER_WIDTH = 32;
const TABLE_CELL_WIDTH = 100;
const TABLE_CELL_HEIGHT = 32;

export default function TableEditor({
    initialTitle = "",
    initialContent = "",
    onSave,
    onClose,
    isOpen,
    accessMode = 'manage',
    currentUserId = 'anon',
    currentUserName = 'You',
}: TableEditorProps) {
    // Toolbar mode state
    const [toolbarMode, setToolbarMode] = useState<TableToolbarMode>("outside");
    const [isCollapsed, setIsCollapsed] = useState(false);

    // Initial load logic for isCollapsed
    useEffect(() => {
        if (isOpen && initialContent) {
            try {
                const parsed = JSON.parse(initialContent);
                setIsCollapsed(parsed.isCollapsed || false);
            } catch { /* ignore */ }
        }
    }, [isOpen, initialContent]);

    // Table data state
    const [title, setTitle] = useState(initialTitle);
    const [caption, setCaption] = useState(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                return parsed.caption || "";
            }
        } catch {
            /* ignore */
        }
        return "";
    });
    const [columns, setColumns] = useState<string[]>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (parsed.columns) return parsed.columns;
            }
        } catch {
            /* ignore */
        }
        return ["A", "B", "C"];
    });
    const [rows, setRows] = useState<string[][]>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (parsed.rows) return parsed.rows;
            }
        } catch {
            /* ignore */
        }
        return Array(4)
            .fill(null)
            .map(() => Array(3).fill(""));
    });

    // Selection state
    const [selectedCell, setSelectedCell] = useState<CellCoord | null>(null);
    const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
    const [isSelectingCells, setIsSelectingCells] = useState(false);

    // Selection outline box (the missing piece)
    const [selectionBox, setSelectionBox] = useState<SelectionBox>(null);

    // Table scroll container ref (for overlay positioning)
    const tableViewportRef = useRef<HTMLDivElement | null>(null);

    // Cell element refs map
    const cellRefs = useRef<Map<string, HTMLTableCellElement>>(new Map());
    const setCellRef = useCallback((row: number, col: number, el: HTMLTableCellElement | null) => {
        const key = `${row}-${col}`;
        if (!el) {
            cellRefs.current.delete(key);
            return;
        }
        cellRefs.current.set(key, el);
    }, []);

    // End selection on global mouse up
    useEffect(() => {
        const handleMouseUp = () => setIsSelectingCells(false);
        window.addEventListener("mouseup", handleMouseUp);
        return () => window.removeEventListener("mouseup", handleMouseUp);
    }, []);

    // Cell styling state - load from initialContent if available
    const [cellStyles, setCellStyles] = useState<Record<string, CellStyle>>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (parsed.cellStyles) return parsed.cellStyles;
            }
        } catch { /* ignore */ }
        return {};
    });

    // Title's own style, independent of any cell's -- `activeStyleTarget`
    // tracks whether the Text style panel is currently formatting the
    // title or the selected cell(s), same click-to-target pattern used for
    // Todo's per-item color. Defaults to 'cell' so existing cell-styling
    // behaviour is unchanged until the user actually clicks into the title.
    const [titleStyle, setTitleStyle] = useState<CellStyle>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (parsed.titleStyle) return parsed.titleStyle;
            }
        } catch { /* ignore */ }
        return {};
    });
    const [activeStyleTarget, setActiveStyleTarget] = useState<'title' | 'cell'>('cell');

    // Context Menu state
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; isOpen: boolean } | null>(null);

    /**
     * PATCH-165. The row/column handle menu: WHICH axis, WHICH index, and where
     * to open it. One piece of state rather than two, so a row menu and a
     * column menu can never both be open.
     */
    const [axisMenu, setAxisMenu] = useState<
        { axis: 'row' | 'column'; index: number; x: number; y: number } | null
    >(null);

    /**
     * PATCH-166. The "Fill with AI…" panel and the suggestions it produced.
     *
     * `fillTarget` is the column the panel is open for; `fillSuggestions` is
     * what came back, awaiting Accept or Discard. While suggestions are pending
     * the table is LOCKED (`fillLocked`): cell inputs are read-only and the
     * grips, "+" bars and right-click menu do nothing, so the row indices the
     * values refer to cannot shift underneath them. Accept or Discard unlocks.
     */
    const [fillTarget, setFillTarget] = useState<number | null>(null);
    const [fillSuggestions, setFillSuggestions] = useState<
        { column: number; values: readonly TableFillValue[] } | null
    >(null);
    const fillLocked = fillSuggestions !== null;

    /**
     * PATCH-168. The "Ask AI…" panel and the selection text captured when it was
     * opened. `askAI` holds the captured text and count so moving the selection
     * afterwards cannot change what was asked; the insert target is read live
     * from `selectedCell` so the answer lands where the user is looking.
     */
    const [askAI, setAskAI] = useState<
        { text: string; truncated: boolean; cellCount: number } | null
    >(null);

    // Submenu states
    const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
    const [pinnedTextStyle, setPinnedTextStyle] = useState(false);
    const [showCaptionEdit, setShowCaptionEdit] = useState(false);

    // Comment state
    const [comments, setComments] = useState<PadletComment[]>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (parsed.comments) {
                    return parsed.comments.map((comment: PadletComment) => ({
                        ...comment,
                        textColor: comment.textColor || comment.color,
                        backgroundColor: comment.backgroundColor,
                    }));
                }
            }
        } catch {
            /* ignore */
        }
        return [];
    });
    // Row/composer/edit/color/title state now lives inside the canonical
    // CommentPopup itself (PATCH 8V); this editor only owns the persisted
    // data and the panel's open/closed state.
    const [showCommentsPopup, setShowCommentsPopup] = useState(false);
    const [badgeColor, setBadgeColor] = useState(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                return parsed.badgeColor || "#facc15";
            }
        } catch {
            /* ignore */
        }
        return "#facc15";
    });
    const [commentTitle, setCommentTitle] = useState<string | undefined>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (typeof parsed.commentTitle === "string") return parsed.commentTitle;
            }
        } catch {
            /* ignore */
        }
        return undefined;
    });
    const [commentTitleStyle, setCommentTitleStyle] = useState<CommentTitleStyle>(() => {
        try {
            if (initialContent) {
                const parsed = JSON.parse(initialContent);
                if (parsed.commentTitleStyle) return parsed.commentTitleStyle;
            }
        } catch {
            /* ignore */
        }
        return {};
    });
    const [submenuPopupPosition, setSubmenuPopupPosition] = useState({ x: 0, y: 0 });
    const tableCardRef = useRef<HTMLDivElement>(null);
    const toolbarRef = useRef<HTMLDivElement>(null);

    // Close context menu on global click
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener("click", handleClick);
        return () => window.removeEventListener("click", handleClick);
    }, []);

    const normalizeRange = useCallback((range: SelectionRange) => {
        const minRow = Math.min(range.start.row, range.end.row);
        const maxRow = Math.max(range.start.row, range.end.row);
        const minCol = Math.min(range.start.col, range.end.col);
        const maxCol = Math.max(range.start.col, range.end.col);
        return { minRow, maxRow, minCol, maxCol };
    }, []);

    const isCellSelected = useCallback(
        (rowIndex: number, colIndex: number) => {
            if (!selectionRange) return selectedCell?.row === rowIndex && selectedCell?.col === colIndex;
            const { minRow, maxRow, minCol, maxCol } = normalizeRange(selectionRange);
            return rowIndex >= minRow && rowIndex <= maxRow && colIndex >= minCol && colIndex <= maxCol;
        },
        [normalizeRange, selectionRange, selectedCell]
    );

    // ====== NEW: compute selection outline box ======
    const recomputeSelectionBox = useCallback(() => {
        const viewport = tableViewportRef.current;
        if (!viewport || !selectionRange) {
            setSelectionBox(null);
            return;
        }

        const { minRow, maxRow, minCol, maxCol } = normalizeRange(selectionRange);
        // Single-cell selections already get their own inset ring drawn
        // directly on the <td> (see "Active cell inner ring" below), which
        // hugs that cell's real border exactly. This overlay is only for
        // multi-cell ranges, where a bounding-box outline is needed.
        if (minRow === maxRow && minCol === maxCol) {
            setSelectionBox(null);
            return;
        }

        const tl = cellRefs.current.get(`${minRow}-${minCol}`);
        const br = cellRefs.current.get(`${maxRow}-${maxCol}`);

        if (!tl || !br) {
            setSelectionBox(null);
            return;
        }

        const viewportRect = viewport.getBoundingClientRect();
        const tlRect = tl.getBoundingClientRect();
        const brRect = br.getBoundingClientRect();

        // Position relative to the scroll container (and include scroll offsets)
        const left = tlRect.left - viewportRect.left + viewport.scrollLeft;
        const top = tlRect.top - viewportRect.top + viewport.scrollTop;
        const width = brRect.right - tlRect.left;
        const height = brRect.bottom - tlRect.top;

        setSelectionBox({
            left,
            top,
            width,
            height,
        });
    }, [normalizeRange, selectionRange]);

    // Check for text selection inside inputs
    const closePanelTimerRef = useRef<NodeJS.Timeout | null>(null);

    const checkTextHighlight = useCallback(() => {
        // Find if active element is an input having selection
        const activeEl = document.activeElement as HTMLInputElement;
        const isInput = activeEl?.tagName === "INPUT" && activeEl.type === "text";

        let hasSelection = false;
        if (isInput) {
            const start = activeEl.selectionStart;
            const end = activeEl.selectionEnd;
            if (start !== null && end !== null && end > start) {
                hasSelection = true;
            }
        }

        if (hasSelection) {
            // Cancel any pending close
            if (closePanelTimerRef.current) {
                clearTimeout(closePanelTimerRef.current);
                closePanelTimerRef.current = null;
            }

            // Open textStyle if not already open
            setToolbarMode("inside");
            setActiveSubmenu((current) => current === "textStyle" ? current : "textStyle");
        } else {
            // If no text selection, maybe close panel if not pinned (debounce it)
            if (closePanelTimerRef.current) clearTimeout(closePanelTimerRef.current);

            closePanelTimerRef.current = setTimeout(() => {
                // We use setPinnedTextStyle and setActiveSubmenu from closure, but we need current state
                // This is slightly tricky inside callbacks without refs or dependency updates.
                // However, we can access state updates via setters.
                // But we need to Read state. 
                // Let's rely on the component re-rendering to keep this callback fresh 
                // OR check pinned state inside the setter if possible? No.
                // Better: Just check pinnedTextStyle from closure (added to dependency).

                if (!pinnedTextStyle && activeSubmenu === "textStyle") {
                    // Check if we still don't have selection (might have raced?)
                    // Actually, if we are here, we scheduled this 150ms ago.
                    setActiveSubmenu(null);
                }
            }, 150);
        }
    }, [pinnedTextStyle, activeSubmenu]);

    // Update outline when selection changes, on scroll, and on resize
    useEffect(() => {
        recomputeSelectionBox();
    }, [recomputeSelectionBox, rows, columns, cellStyles]);

    useEffect(() => {
        const viewport = tableViewportRef.current;
        if (!viewport) return;

        const onScroll = () => recomputeSelectionBox();
        viewport.addEventListener("scroll", onScroll, { passive: true });

        const onResize = () => recomputeSelectionBox();
        window.addEventListener("resize", onResize);

        return () => {
            viewport.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onResize);
        };
    }, [recomputeSelectionBox]);

    // Apply style to current selection
    const applyStyleToSelection = (style: CellStyle) => {
        if (activeStyleTarget === 'title') {
            setTitleStyle((prev) => ({ ...prev, ...style }));
            return;
        }
        if (!selectedCell && !selectionRange) return;

        setCellStyles((prev) => {
            const next = { ...prev };

            if (selectionRange) {
                const { minRow, maxRow, minCol, maxCol } = normalizeRange(selectionRange);
                for (let r = minRow; r <= maxRow; r++) {
                    for (let c = minCol; c <= maxCol; c++) {
                        const key = `${r}-${c}`;
                        next[key] = { ...next[key], ...style };
                    }
                }
            } else if (selectedCell) {
                const key = `${selectedCell.row}-${selectedCell.col}`;
                next[key] = { ...next[key], ...style };
            }

            return next;
        });

        setContextMenu(null);
    };

    // Auto-show Text Style panel when multi-cell selection with text is completed
    useEffect(() => {
        // Only trigger when selection just ended (isSelectingCells became false)
        if (isSelectingCells) return;
        if (!selectionRange) return;

        const { minRow, maxRow, minCol, maxCol } = normalizeRange(selectionRange);
        const isMultiCell = minRow !== maxRow || minCol !== maxCol;

        // Check if any selected cell has text
        // Not while an AI panel is open: it occupies the same spot, one panel at a time.
        const aiPanelOpen = askAI !== null || fillTarget !== null;
        if (isMultiCell && !pinnedTextStyle && !aiPanelOpen && activeSubmenu !== "textStyle") {
            let hasText = false;
            for (let r = minRow; r <= maxRow && !hasText; r++) {
                for (let c = minCol; c <= maxCol && !hasText; c++) {
                    if (rows[r] && rows[r][c] && rows[r][c].trim() !== "") {
                        hasText = true;
                    }
                }
            }

            if (hasText) {
                setActiveSubmenu("textStyle");
            }
        }
    }, [isSelectingCells, selectionRange, normalizeRange, rows, pinnedTextStyle, activeSubmenu, askAI, fillTarget]);

    // Handle cell mouse down (Start Selection)
    const handleCellMouseDown = (rowIndex: number, colIndex: number, e?: React.MouseEvent) => {
        setActiveStyleTarget('cell');
        // Right click: focus cell only (don't start drag)
        if (e && e.button === 2) {
            if (!isCellSelected(rowIndex, colIndex)) {
                setSelectedCell({ row: rowIndex, col: colIndex });
                setSelectionRange(null);
            }
            return;
        }

        setIsSelectingCells(true);
        // Only keep textStyle open if pinned, otherwise close it
        if (!pinnedTextStyle) {
            setActiveSubmenu(null);
        }
        setToolbarMode("inside");

        if (e && e.shiftKey && selectedCell && !contextMenu) {
            setSelectionRange({
                start: selectionRange ? selectionRange.start : selectedCell,
                end: { row: rowIndex, col: colIndex },
            });
        } else {
            setSelectedCell({ row: rowIndex, col: colIndex });
            setSelectionRange({
                start: { row: rowIndex, col: colIndex },
                end: { row: rowIndex, col: colIndex },
            });
        }
    };

    // Handle cell mouse enter (Update Selection during drag)
    const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
        if (isSelectingCells && selectionRange) {
            setSelectionRange({
                ...selectionRange,
                end: { row: rowIndex, col: colIndex },
            });
        }
    };

    // Handle column header click
    const handleColumnHeaderClick = (colIndex: number, e: React.MouseEvent) => {
        if (e.shiftKey && selectionRange) {
            const startCol = selectionRange.start.col;
            const endCol = colIndex;
            setSelectionRange({
                start: { row: 0, col: startCol },
                end: { row: rows.length - 1, col: endCol },
            });
        } else {
            setSelectionRange({ start: { row: 0, col: colIndex }, end: { row: rows.length - 1, col: colIndex } });
            setSelectedCell({ row: 0, col: colIndex });
        }
        setToolbarMode("inside");
        setActiveSubmenu(null);
    };

    // --- TanStack Table Integration ---
    const data = useMemo(() => {
        return rows.map((row, rowIndex) => {
            const rowObj: Record<string, string> = { id: rowIndex.toString() };
            row.forEach((cell, colIndex) => {
                rowObj[colIndex.toString()] = cell;
            });
            return rowObj;
        });
    }, [rows]);

    const tableColumns = useMemo<ColumnDef<Record<string, string>>[]>(() => {
        return columns.map((colName, colIndex) => ({
            header: colName,
            accessorKey: colIndex.toString(),
            cell: (info: any) => info.getValue(),
        }));
    }, [columns]);

    const table = useReactTable({
        data,
        columns: tableColumns,
        getCoreRowModel: getCoreRowModel(),
    });

    // Handle cell change
    const handleCellChange = (rowIndex: number, colIndex: number, value: string) => {
        setRows((prev) =>
            prev.map((row, r) => (r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : row))
        );
    };

    // Add row/column
    //
    // EVERY STRUCTURAL CHANGE GOES THROUGH ONE PURE RESULT. `rows`, `columns`
    // and `cellStyles` are three states describing ONE table, and `cellStyles`
    // is keyed by position -- so changing two of them by hand (which is what
    // this file used to do) leaves a style on the cell that has moved, not the
    // cell it belonged to. `applyGrid` is the only writer, and every handler
    // below builds a `TableGrid`, mutates nothing, and hands the result here.
    const applyGrid = useCallback((next: TableGrid) => {
        setRows(next.rows.map((row) => [...row]));
        setColumns([...next.columns]);
        setCellStyles({ ...next.cellStyles });
    }, []);

    /** The CURRENT table as one value, built fresh from the three states. */
    const currentGrid = useCallback((): TableGrid => ({
        rows,
        columns,
        cellStyles,
    }), [rows, columns, cellStyles]);

    const addRow = useCallback(() => {
        if (fillLocked) return;
        applyGrid(insertRow(currentGrid(), rows.length));
    }, [applyGrid, currentGrid, rows.length, fillLocked]);

    const addRowAbove = useCallback(() => {
        if (!selectedCell) return;
        applyGrid(insertRow(currentGrid(), selectedCell.row));
        setContextMenu(null);
    }, [applyGrid, currentGrid, selectedCell]);

    const addRowBelow = useCallback(() => {
        if (!selectedCell) return;
        applyGrid(insertRow(currentGrid(), selectedCell.row + 1));
        setContextMenu(null);
    }, [applyGrid, currentGrid, selectedCell]);

    const addColumn = useCallback(() => {
        if (fillLocked) return;
        applyGrid(insertColumn(currentGrid(), columns.length));
    }, [applyGrid, currentGrid, columns.length, fillLocked]);

    const addColumnLeft = useCallback(() => {
        if (!selectedCell) return;
        applyGrid(insertColumn(currentGrid(), selectedCell.col));
        setContextMenu(null);
    }, [applyGrid, currentGrid, selectedCell]);

    const addColumnRight = useCallback(() => {
        if (!selectedCell) return;
        applyGrid(insertColumn(currentGrid(), selectedCell.col + 1));
        setContextMenu(null);
    }, [applyGrid, currentGrid, selectedCell]);

    const deleteRow = useCallback(() => {
        if (!selectedCell || rows.length <= 1) return;
        applyGrid(deleteRowAt(currentGrid(), selectedCell.row));
        setSelectedCell(null);
        setContextMenu(null);
    }, [applyGrid, currentGrid, selectedCell, rows.length]);

    const deleteColumn = useCallback(() => {
        if (!selectedCell || columns.length <= 1) return;
        applyGrid(deleteColumnAt(currentGrid(), selectedCell.col));
        setSelectedCell(null);
        setContextMenu(null);
    }, [applyGrid, currentGrid, selectedCell, columns.length]);

    /**
     * PATCH-165. One place that turns a handle-menu choice into a pure grid
     * result, for the row/column the menu was opened on. The menu reports WHAT
     * was chosen; the mapping to the structure module lives here, so the menu
     * cannot reach the data model and there is still exactly one writer
     * (`applyGrid`).
     */
    const applyAxisAction = useCallback((action: TableAxisAction) => {
        if (!axisMenu) return;
        const grid = currentGrid();
        const { axis, index } = axisMenu;
        switch (action) {
            case 'insert-before':
                applyGrid(axis === 'row' ? insertRow(grid, index) : insertColumn(grid, index));
                break;
            case 'insert-after':
                applyGrid(axis === 'row' ? insertRow(grid, index + 1) : insertColumn(grid, index + 1));
                break;
            case 'duplicate':
                applyGrid(axis === 'row' ? duplicateRow(grid, index) : duplicateColumn(grid, index));
                break;
            case 'clear':
                applyGrid(axis === 'row' ? clearRow(grid, index) : clearColumn(grid, index));
                break;
            case 'delete':
                applyGrid(axis === 'row' ? deleteRowAt(grid, index) : deleteColumnAt(grid, index));
                // The deleted axis may have held the selected cell.
                setSelectedCell(null);
                setSelectionRange(null);
                break;
            case 'fill-ai':
                // Column-only (the row menu never reports it): open the panel
                // for this column. Nothing is written until the user accepts.
                setAskAI(null);
                // The toolbar's own panels open in the same spot; one panel at a time.
                setActiveSubmenu(null);
                setFillTarget(index);
                break;
        }
        setAxisMenu(null);
    }, [applyGrid, axisMenu, currentGrid]);

    const applyAxisColor = useCallback((bg: string | undefined) => {
        if (!axisMenu) return;
        const grid = currentGrid();
        applyGrid(axisMenu.axis === 'row'
            ? setRowStyle(grid, axisMenu.index, { bg })
            : setColumnStyle(grid, axisMenu.index, { bg }));
        // No explicit close: choosing a swatch closes the positioned menu itself.
    }, [applyGrid, axisMenu, currentGrid]);

    const applyAxisAlign = useCallback((align: 'left' | 'center' | 'right') => {
        if (!axisMenu) return;
        const grid = currentGrid();
        applyGrid(axisMenu.axis === 'row'
            ? setRowStyle(grid, axisMenu.index, { align })
            : setColumnStyle(grid, axisMenu.index, { align }));
    }, [applyGrid, axisMenu, currentGrid]);

    /**
     * The shared alignment of every cell on the axis, or null when they
     * disagree -- so the menu shows a checkmark only for a value the WHOLE row
     * or column actually has.
     */
    const axisMenuSharedAlign = useMemo(() => {
        if (!axisMenu) return null;
        const { axis, index } = axisMenu;
        const values = axis === 'row'
            ? columns.map((_, col) => cellStyles[`${index}-${col}`]?.align)
            : rows.map((_, row) => cellStyles[`${row}-${index}`]?.align);
        const first = values[0];
        return values.every((value) => value === first) ? (first ?? null) : null;
    }, [axisMenu, columns, rows, cellStyles]);

    /** Values by row for the pending suggestions, so a cell lookup is O(1). */
    const fillValueByRow = useMemo(() => {
        const map = new Map<number, string>();
        for (const entry of fillSuggestions?.values ?? []) map.set(entry.row, entry.value);
        return map;
    }, [fillSuggestions]);

    const handleFillSuggestions = useCallback((values: readonly TableFillValue[]) => {
        setFillSuggestions((current) => {
            // Anchor the values to the column the panel was open for, so a
            // later change cannot mislabel them.
            if (fillTarget === null) return current;
            return { column: fillTarget, values };
        });
    }, [fillTarget]);

    const closeFillPanel = useCallback(() => setFillTarget(null), []);

    /**
     * ACCEPT ALL: one pure update through `applyTableFillValues`, which changes
     * only the target column and leaves every cell style untouched.
     */
    const acceptFillSuggestions = useCallback(() => {
        if (!fillSuggestions) return;
        const grid = currentGrid();
        const nextRows = applyTableFillValues(
            { rows: grid.rows, columns: grid.columns },
            fillSuggestions.column,
            fillSuggestions.values,
        );
        applyGrid({ rows: nextRows, columns: grid.columns, cellStyles: grid.cellStyles });
        setFillSuggestions(null);
    }, [applyGrid, currentGrid, fillSuggestions]);

    const discardFillSuggestions = useCallback(() => setFillSuggestions(null), []);

    /** The active cell's current text, so the Ask AI panel can label its insert. */
    const activeCellHasText = selectedCell
        ? (rows[selectedCell.row]?.[selectedCell.col] ?? '').trim().length > 0
        : false;

    /**
     * PATCH-168. Capture the selection as text NOW, then open the panel. Opening
     * it closes the Fill with AI panel: two AI panels cannot be open at once.
     */
    const openAskAI = useCallback(() => {
        const range = selectionRange
            ? normalizeRange(selectionRange)
            : selectedCell
                ? { minRow: selectedCell.row, maxRow: selectedCell.row, minCol: selectedCell.col, maxCol: selectedCell.col }
                : null;
        if (!range) return;
        const { text, truncated } = tableSelectionText({ rows, columns }, range);
        const cellCount = (range.maxRow - range.minRow + 1) * (range.maxCol - range.minCol + 1);
        setFillTarget(null);
        setContextMenu(null);
        // The toolbar's own panels open in the same spot; one panel at a time.
        setActiveSubmenu(null);
        setAskAI({ text, truncated, cellCount });
    }, [selectionRange, selectedCell, rows, columns, normalizeRange]);

    const closeAskAI = useCallback(() => setAskAI(null), []);

    /**
     * INSERT the answer into the CURRENTLY selected cell through `applyGrid`,
     * the single writer: only that cell's text changes, every style is kept.
     */
    const insertAskAIAnswer = useCallback((value: string) => {
        if (!selectedCell) return;
        const grid = currentGrid();
        const nextRows = grid.rows.map((row, r) => (
            r === selectedCell.row
                ? row.map((cell, c) => (c === selectedCell.col ? value : cell))
                : [...row]
        ));
        applyGrid({ rows: nextRows, columns: grid.columns, cellStyles: grid.cellStyles });
    }, [applyGrid, currentGrid, selectedCell]);

    const handleCut = useCallback(() => {
        if (!selectedCell) return;
        const val = rows[selectedCell.row][selectedCell.col];
        navigator.clipboard.writeText(val);
        handleCellChange(selectedCell.row, selectedCell.col, "");
        setContextMenu(null);
    }, [selectedCell, rows]);

    const handleCopy = useCallback(() => {
        if (!selectedCell) return;
        const val = rows[selectedCell.row][selectedCell.col];
        navigator.clipboard.writeText(val);
        setContextMenu(null);
    }, [selectedCell, rows]);

    const handlePaste = useCallback(async () => {
        if (!selectedCell) return;
        try {
            const text = await navigator.clipboard.readText();
            handleCellChange(selectedCell.row, selectedCell.col, text);
        } catch (e) {
            console.error("Failed to paste", e);
        }
        setContextMenu(null);
    }, [selectedCell]);

    const getCurrentStyles = () => {
        if (!selectedCell) return {};
        const key = `${selectedCell.row}-${selectedCell.col}`;
        return cellStyles[key] || {};
    };

    const toggleSubmenu = (submenu: string) => setActiveSubmenu((s) => (s === submenu ? null : submenu));

    const handleToggleMode = () => {
        if (toolbarMode === "outside") setToolbarMode("inside");
        else {
            setToolbarMode("outside");
            setSelectedCell(null);
            setSelectionRange(null);
        }
        setActiveSubmenu(null);
    };

    const handleSaveAndClose = () => {
        // PATCH-166: pending AI suggestions are dropped on save, never written.
        setFillSuggestions(null);
        onSave({
            title,
            content: JSON.stringify({
                rows,
                columns,
                caption,
                comments,
                cellStyles,
                badgeColor,
                titleStyle,
                commentTitle,
                commentTitleStyle: Object.keys(commentTitleStyle).length > 0 ? commentTitleStyle : undefined,
            }),
            isCollapsed,
        });
        onClose();
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) handleSaveAndClose();
    };

    const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();

    const outsideModeTools: TableTool[] = [
        { id: "caption", icon: AlignLeft, label: "Caption", onClick: () => setShowCaptionEdit((v: any) => !v) },
        {
            id: "comment",
            icon: MessageSquare,
            label: "Comment",
            onClick: () => setShowCommentsPopup((prev) => !prev),
        },
    ];

    const insideModeTools: TableTool[] = [
        { id: "textStyle", icon: Type, label: "Text style", submenu: "textStyle" },
        { id: "cellType", icon: Hash, label: "Cell type", submenu: "cellType" },
        { id: "cellColor", icon: Palette, label: "Cell color", submenu: "cellColor" },
        { id: "formula", icon: Hash, label: "Formula", submenu: "formula" },
        { id: "alignment", icon: AlignLeft, label: "Alignment", submenu: "alignment" },
        { id: "addColumn", icon: Grid, label: "Add column", onClick: addColumn },
        { id: "addRow", icon: Plus, label: "Add row", onClick: addRow },
    ];

    const currentTools: TableTool[] = toolbarMode === "outside" ? outsideModeTools : insideModeTools;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50" onClick={handleOverlayClick}>
            <div className="flex items-start gap-2" onClick={(e) => e.stopPropagation()}>
                {/* Left Toolbar */}
                <div className="relative self-start mt-1" ref={toolbarRef}>
                    <div
                        className="flex flex-col items-center bg-white rounded-lg shadow-lg p-0.5 gap-0.5 flex-shrink-0"
                    >
                        <div className="flex flex-col items-center shrink-0">
                            <button
                                onMouseDown={preventFocusLoss}
                                onClick={handleToggleMode}
                                className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                                title={toolbarMode === "outside" ? "Switch to Cell Editing" : "Switch to Card Settings"}
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">{toolbarMode === "outside" ? "Inside" : "Outside"}</span>
                        </div>

                        <div className="w-9 h-px bg-gray-300 shrink-0" />

                        {currentTools.map((tool) => {
                            const IconComponent = tool.icon;
                            const hasSubmenu = "submenu" in tool && tool.submenu;
                            const isActive = hasSubmenu && activeSubmenu === tool.submenu;

                            return (
                                <div key={tool.id} className="relative flex flex-col items-center shrink-0">
                                    <button
                                        onMouseDown={preventFocusLoss}
                                        onClick={(e) => {
                                            if (hasSubmenu) {
                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                setSubmenuPopupPosition({ x: rect.left, y: rect.top });
                                                toggleSubmenu(tool.submenu as string);
                                            } else if ("onClick" in tool && tool.onClick) {
                                                tool.onClick();
                                            }
                                        }}
                                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isActive || tool.active ? "bg-gray-200 text-gray-800" : "hover:bg-gray-200 text-gray-600"
                                            }`}
                                        title={tool.label}
                                    >
                                        <IconComponent className="w-5 h-5" />
                                        {tool.id === "comment" && comments.length > 0 && (
                                            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-gray-800 flex items-center justify-center"
                                                style={{ backgroundColor: badgeColor }}>
                                                {comments.length}
                                            </span>
                                        )}
                                    </button>
                                    <span className="text-[9px] text-gray-500 text-center">{tool.label}</span>
                                </div>
                            );
                        })}
                    </div>

                </div>

                {/* Card */}
                <div className="flex flex-col relative" ref={tableCardRef}>
                    <div className="m-2 relative">
                        <div
                            className="rounded-lg overflow-hidden bg-white shadow-lg"
                            style={{ minHeight: "200px", minWidth: "400px", maxHeight: "calc(100vh - 80px)", width: "max-content" }}
                        >
                            {/* Top strip -- Title lives inside it, same as the
                                canvas card's own top strip, matching every
                                other post type's edit window. Table has no
                                topStrip color of its own today, so this uses
                                the same neutral gray every other type falls
                                back to when no strip color is set. */}
                            <div
                                className="w-full flex-shrink-0 flex items-center px-2"
                                style={{ minHeight: '22px', backgroundColor: 'rgba(0,0,0,0.04)' }}
                            >
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onFocus={() => {
                                        setActiveStyleTarget('title');
                                        setSelectedCell(null);
                                        setSelectionRange(null);
                                        setActiveSubmenu('textStyle');
                                    }}
                                    placeholder="Post name"
                                    className={`w-full text-sm font-semibold bg-transparent outline-none border-b placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1 ${
                                        activeStyleTarget === 'title' ? 'border-blue-400 bg-blue-50/40' : 'border-transparent focus:border-blue-400'
                                    }`}
                                    style={{
                                        color: titleStyle.color,
                                        fontWeight: titleStyle.bold ? '700' : undefined,
                                        fontStyle: titleStyle.italic ? 'italic' : undefined,
                                        textDecoration: [titleStyle.underline && 'underline', titleStyle.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined,
                                        textAlign: titleStyle.align,
                                    }}
                                />
                            </div>

                            {/* PATCH-166. The suggestions bar: how many AI
                                values are waiting, and the two ways to resolve
                                them. Present only while suggestions are pending. */}
                            {fillSuggestions && (
                                <div
                                    data-table-fill-bar=""
                                    className="flex items-center gap-2 border-b border-purple-100 bg-purple-50 px-2 py-1 text-xs text-purple-700"
                                >
                                    <span>{fillSuggestions.values.length} AI suggestions</span>
                                    <span className="text-purple-300" aria-hidden="true">·</span>
                                    <button type="button" onClick={acceptFillSuggestions} className="font-medium hover:underline">
                                        Accept all
                                    </button>
                                    <span className="text-purple-300" aria-hidden="true">·</span>
                                    <button type="button" onClick={discardFillSuggestions} className="hover:underline">
                                        Discard
                                    </button>
                                </div>
                            )}

                            {/*
                              PATCH-165. The "+" bars: OUTSIDE the scrolling
                              viewport, so they are reachable no matter where the
                              table is scrolled. A row bar below, a column bar to
                              the right. Quiet by default, darker on hover.
                            */}
                            <div className="flex items-stretch">
                                <div className="flex flex-col">
                                    <div
                                        ref={tableViewportRef}
                                        className="relative overflow-x-auto overflow-y-auto"
                                        style={{
                                            // Grows with the table, up to the window; only past that does it scroll.
                                            maxWidth: "calc(100vw - 200px)",
                                            maxHeight: "calc(100vh - 220px)",
                                        }}
                                    >
                                {/* ✅ Selection outline overlay */}
                                {selectionBox && (
                                    <div
                                        className="absolute pointer-events-none z-20"
                                        style={{
                                            left: selectionBox.left,
                                            top: selectionBox.top,
                                            width: selectionBox.width,
                                            height: selectionBox.height,
                                            boxSizing: "border-box",
                                        }}
                                    >
                                        {/* Outer border */}
                                        <div className="absolute inset-0 ring-2 ring-purple-500 rounded-[2px]" />
                                        {/* Fill tint (very subtle) */}
                                        <div className="absolute inset-0 bg-purple-200/20 rounded-[2px]" />
                                    </div>
                                )}

                                <table
                                    className="border-collapse"
                                    style={{
                                        userSelect: isSelectingCells ? "none" : "auto",
                                        width: "max-content",
                                        minWidth: "100%",
                                    }}
                                >
                                    <thead>
                                        {table.getHeaderGroups().map((headerGroup) => (
                                            <tr key={headerGroup.id}>
                                                <th
                                                    className="bg-gray-100 border border-gray-300 text-xs text-center border-b-2"
                                                    style={{
                                                        width: `${TABLE_ROW_HEADER_WIDTH}px`,
                                                        minWidth: `${TABLE_ROW_HEADER_WIDTH}px`,
                                                        height: `${TABLE_CELL_HEIGHT}px`,
                                                    }}
                                                />
                                                {headerGroup.headers.map((header, i) => (
                                                    <th
                                                        key={header.id}
                                                        className={`group/col border border-gray-300 text-xs font-medium text-center cursor-pointer hover:bg-gray-200 transition-colors ${selectedCell?.col === i ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-700"
                                                            }`}
                                                        style={{
                                                            width: `${TABLE_CELL_WIDTH}px`,
                                                            minWidth: `${TABLE_CELL_WIDTH}px`,
                                                            maxWidth: `${TABLE_CELL_WIDTH}px`,
                                                            height: `${TABLE_CELL_HEIGHT}px`,
                                                        }}
                                                        onClick={(e) => handleColumnHeaderClick(i, e)}
                                                    >
                                                        <span className="relative flex h-full items-center justify-center">
                                                            {flexRender(header.column.columnDef.header, header.getContext())}
                                                            {/*
                                                              PATCH-165. The column handle. stopPropagation
                                                              so opening THIS menu does not also run the
                                                              header click's column selection -- clicking the
                                                              letter elsewhere still selects the column.
                                                            */}
                                                            <button
                                                                type="button"
                                                                data-table-column-handle={i}
                                                                aria-label={`Column ${columns[i]} options`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    if (fillLocked) return;
                                                                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                    setAxisMenu({ axis: 'column', index: i, x: rect.left, y: rect.bottom });
                                                                }}
                                                                className={`absolute left-1 top-1/2 -translate-y-1/2 rounded border border-gray-300 bg-white p-0.5 text-gray-500 shadow-sm hover:bg-gray-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 ${axisMenu?.axis === 'column' && axisMenu.index === i ? 'opacity-100' : 'opacity-0 group-hover/col:opacity-100 focus:opacity-100'}`}
                                                            >
                                                                <GripVertical className="h-3 w-3" aria-hidden="true" />
                                                            </button>
                                                        </span>
                                                    </th>
                                                ))}
                                            </tr>
                                        ))}
                                    </thead>

                                    <tbody>
                                        {table.getRowModel().rows.map((row) => (
                                            <tr key={row.id} className="group/row">
                                                <td
                                                    className="bg-gray-100 border border-gray-300 text-xs text-center text-gray-500 font-medium select-none"
                                                    style={{
                                                        width: `${TABLE_ROW_HEADER_WIDTH}px`,
                                                        minWidth: `${TABLE_ROW_HEADER_WIDTH}px`,
                                                        height: `${TABLE_CELL_HEIGHT}px`,
                                                    }}
                                                >
                                                    {/*
                                                      PATCH-165. The row handle,
                                                      in the row-number cell. The
                                                      number stays visible; the grip
                                                      reveals on row hover, or while
                                                      THIS row's menu is open.
                                                    */}
                                                    <span className="relative flex h-full w-full items-center justify-center">
                                                        {row.index + 1}
                                                        <button
                                                            type="button"
                                                            data-table-row-handle={row.index}
                                                            aria-label={`Row ${row.index + 1} options`}
                                                            onClick={(e) => {
                                                                if (fillLocked) return;
                                                                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                                                setAxisMenu({ axis: 'row', index: row.index, x: rect.right, y: rect.top });
                                                            }}
                                                            className={`absolute inset-0 flex items-center justify-center rounded bg-gray-100 text-gray-500 hover:bg-gray-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 ${axisMenu?.axis === 'row' && axisMenu.index === row.index ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100 focus:opacity-100'}`}
                                                        >
                                                            <GripVertical className="h-3 w-3" aria-hidden="true" />
                                                        </button>
                                                    </span>
                                                </td>

                                                {row.getVisibleCells().map((cell, colIndex) => {
                                                    const key = `${row.index}-${colIndex}`;
                                                    const style = cellStyles[key];

                                                    const isActive = selectedCell?.row === row.index && selectedCell?.col === colIndex;
                                                    const inRange = isCellSelected(row.index, colIndex);
                                                    // PATCH-166. A pending suggestion for THIS cell, if any.
                                                    const fillValue = fillSuggestions?.column === colIndex
                                                        ? fillValueByRow.get(row.index)
                                                        : undefined;

                                                    return (
                                                        <td
                                                            key={cell.id}
                                                            ref={(el) => setCellRef(row.index, colIndex, el)}
                                                            className={`border border-gray-300 p-0 relative ${inRange ? "bg-purple-100/40" : ""
                                                                } ${isActive ? "z-10" : "hover:bg-gray-50"}`}
                                                            style={{
                                                                width: `${TABLE_CELL_WIDTH}px`,
                                                                minWidth: `${TABLE_CELL_WIDTH}px`,
                                                                maxWidth: `${TABLE_CELL_WIDTH}px`,
                                                                height: `${TABLE_CELL_HEIGHT}px`,
                                                                userSelect: isSelectingCells ? "none" : "auto", // Fix userSelect
                                                                backgroundColor: style?.bg,
                                                                textAlign: style?.align || "left",
                                                                verticalAlign: style?.verticalAlign || "top",
                                                                fontWeight: style?.bold ? "bold" : "normal",
                                                                fontStyle: style?.italic ? "italic" : "normal",
                                                                textDecoration: [style?.underline && "underline", style?.strikethrough && "line-through"].filter(Boolean).join(" ") || "none",
                                                                color: style?.color || "inherit",
                                                            }}
                                                            onMouseDown={(e) => handleCellMouseDown(row.index, colIndex, e)}
                                                            onMouseEnter={() => handleCellMouseEnter(row.index, colIndex)}
                                                            onContextMenu={(e) => {
                                                                if (fillLocked) return;
                                                                e.preventDefault();
                                                                setContextMenu({ x: e.clientX, y: e.clientY, isOpen: true });
                                                                if (!isCellSelected(row.index, colIndex)) handleCellMouseDown(row.index, colIndex);
                                                            }}
                                                        >
                                                            {/* Active cell inner ring -- hugs this cell's own
                                                                border exactly; the selectionBox overlay below
                                                                only draws a bounding-box outline for multi-cell
                                                                ranges, since its computed pixel offsets don't
                                                                line up with the table's own cell borders. */}
                                                            {isActive && <div className="absolute inset-0 pointer-events-none ring-2 ring-purple-500 ring-inset" />}

                                                            {/* PATCH-166. The AI suggestion, shown IN the cell but
                                                                never written: the real cell text below is untouched.
                                                                Purple italic on a light purple ground, marked so the
                                                                test suite can find it. */}
                                                            {fillValue !== undefined && (
                                                                <span
                                                                    data-table-fill-suggestion=""
                                                                    className="pointer-events-none absolute inset-0 z-10 flex items-center overflow-hidden bg-purple-100/70 px-2 text-sm italic text-purple-700"
                                                                >
                                                                    <span className="truncate">{fillValue}</span>
                                                                </span>
                                                            )}

                                                            <input
                                                                type="text"
                                                                value={(cell.getValue() as string) || ""}
                                                                readOnly={fillLocked}
                                                                onChange={(e) => handleCellChange(row.index, colIndex, e.target.value)}
                                                                className="w-full h-full px-2 text-sm bg-transparent border-none outline-none selection:bg-purple-200"
                                                                style={{
                                                                    textAlign: "inherit",
                                                                    fontWeight: "inherit",
                                                                    fontStyle: "inherit",
                                                                    textDecoration: "inherit",
                                                                    color: "inherit",
                                                                    pointerEvents: isSelectingCells ? "none" : "auto",
                                                                }}
                                                                onMouseDown={(e) => {
                                                                    // stopPropagation prevents double-firing with TD handler
                                                                    // Do not call handleCellMouseDown to avoid setting isSelectingCells(true)
                                                                    // This allows native browser text selection to work
                                                                    e.stopPropagation();

                                                                    // A RIGHT-click inside the current selection keeps it, so the
                                                                    // cell menu (and Ask AI) acts on every selected cell, not one.
                                                                    if (e.button === 2 && isCellSelected(row.index, colIndex)) return;

                                                                    // Manually focus the cell without starting drag
                                                                    setSelectedCell({ row: row.index, col: colIndex });
                                                                    setSelectionRange({
                                                                        start: { row: row.index, col: colIndex },
                                                                        end: { row: row.index, col: colIndex },
                                                                    });

                                                                    // Handle panel logic
                                                                    if (!pinnedTextStyle) {
                                                                        setActiveSubmenu(null);
                                                                    }
                                                                    setToolbarMode("inside");
                                                                }}
                                                                onSelect={checkTextHighlight}
                                                                onMouseUp={checkTextHighlight}
                                                                onKeyUp={checkTextHighlight}
                                                            />
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                    </div>

                                    {/* The row "+" bar: below the viewport, always reachable. */}
                                    <button
                                        type="button"
                                        data-table-add-row="true"
                                        aria-label="Add row"
                                        title="Click to add a new row"
                                        onClick={addRow}
                                        className="flex h-4 w-full items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                                    >
                                        <Plus className="h-3 w-3" aria-hidden="true" />
                                    </button>
                                </div>

                                {/* The column "+" bar: beside the viewport, always reachable. */}
                                <button
                                    type="button"
                                    data-table-add-column="true"
                                    aria-label="Add column"
                                    title="Click to add a new column"
                                    onClick={addColumn}
                                    className="flex w-4 shrink-0 items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-600 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
                                >
                                    <Plus className="h-3 w-3" aria-hidden="true" />
                                </button>
                            </div>

                            {/* Caption */}
                            {showCaptionEdit && (
                                <div className="p-3 border-t">
                                    <input
                                        type="text"
                                        value={caption}
                                        onChange={(e) => setCaption(e.target.value)}
                                        placeholder="Add a caption..."
                                        className="w-full text-sm text-gray-500 bg-transparent outline-none"
                                        autoFocus
                                    />
                                </div>
                            )}
                            {caption && !showCaptionEdit && (
                                <div className="p-3 border-t text-sm text-gray-500 cursor-pointer hover:bg-gray-50" onClick={() => setShowCaptionEdit(true)}>
                                    {caption}
                                </div>
                            )}
                        </div>

                        {/* Table detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8V -- migrated off the local hand-rolled implementation, same pattern as Link's own-editor site). */}
                        {showCommentsPopup && (
                            <div
                                className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <CommentPopup
                                    isOpen={showCommentsPopup}
                                    accessMode={accessMode}
                                    onOpenChange={(open) => { if (!open) setShowCommentsPopup(false); }}
                                    onSubmit={guardCommentMutation(accessMode, (text) => {
                                        const newComment: PadletComment = { id: `comment-${Date.now()}`, text, userId: currentUserId, userName: currentUserName, timestamp: Date.now() };
                                        setComments((prev) => [...prev, newComment]);
                                    })}
                                    onEditComment={guardCommentMutation(accessMode, (commentId, text) => {
                                        setComments((prev) => prev.map((comment) => comment.id === commentId ? { ...comment, text } : comment));
                                    })}
                                    onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
                                        setComments((prev) => prev.filter((comment) => comment.id !== commentId));
                                    })}
                                    onToggleCommentStrikethrough={guardCommentMutation(accessMode, (commentId) => {
                                        setComments((prev) => prev.map((comment) => comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment));
                                    })}
                                    onCommentColor={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
                                        setComments((prev) => prev.map((comment) => comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment));
                                    })}
                                    comments={comments}
                                    currentUserId={currentUserId}
                                    currentUserName={currentUserName}
                                    badgeColor={badgeColor}
                                    onBadgeColorChange={guardCommentMutation(accessMode, setBadgeColor)}
                                    commentTitle={commentTitle}
                                    commentTitleStyle={Object.keys(commentTitleStyle).length > 0 ? commentTitleStyle : undefined}
                                    onCommentTitleChange={guardCommentMutation(accessMode, (nextTitle: string) => setCommentTitle(nextTitle === 'Comments' ? undefined : nextTitle))}
                                    onCommentTitleStyleChange={guardCommentMutation(accessMode, (style: CommentTitleStyle) => setCommentTitleStyle(style))}
                                    enableCanonicalSelectionStyling
                                />
                            </div>
                        )}

                        {/* Comment badge */}
                        {comments.length > 0 && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowCommentsPopup((prev) => !prev);
                                }}
                                className="absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all"
                                style={{ backgroundColor: badgeColor }}
                                title={`${comments.length} comment${comments.length > 1 ? "s" : ""}`}
                            >
                                {comments.length}
                            </button>
                        )}
                    </div>
                </div>

                {/* Detached Table Submenus */}
                {activeSubmenu && (
                    <div
                        className="fixed z-[100] bg-white rounded-xl shadow-lg border border-gray-200 w-auto"
                        style={{
                            top: toolbarRef.current ? toolbarRef.current.getBoundingClientRect().top : submenuPopupPosition.y,
                            left: toolbarRef.current ? toolbarRef.current.getBoundingClientRect().left - 12 : submenuPopupPosition.x,
                            transform: 'translateX(-100%)',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {activeSubmenu === "cellType" && (
                            <div className="py-2">
                                {CELL_TYPES.map((type) => (
                                    <button
                                        key={type.id}
                                        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-gray-100 text-left"
                                        onClick={() => setActiveSubmenu(null)}
                                    >
                                        <span className="w-6 text-center text-gray-500">{type.icon}</span>
                                        <span className="flex-1">{type.label}</span>
                                        {type.hasSubmenu && <ChevronRight className="w-4 h-4 text-gray-400" />}
                                        {type.id === "auto" && <Check className="w-4 h-4 text-gray-600" />}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* cellColor is rendered separately on the right side of the table */}

                        {activeSubmenu === "formula" && (
                            <div className="py-2 w-40">
                                {FORMULAS.map((formula) => (
                                    <button
                                        key={formula}
                                        className="w-full px-4 py-2 text-left hover:bg-gray-100"
                                        onClick={() => setActiveSubmenu(null)}
                                    >
                                        {formula}
                                    </button>
                                ))}
                                <div className="border-t mt-2 pt-2 px-4">
                                    <Link
                                        href="/help/formulas"
                                        target="_blank"
                                        className="text-sm text-blue-600 flex items-center gap-1 hover:underline group"
                                        onClick={() => setActiveSubmenu(null)}
                                    >
                                        View formula help <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                                    </Link>
                                </div>
                            </div>
                        )}

                        {/* textStyle is rendered separately on the right side of the table */}

                        {activeSubmenu === "alignment" && (
                            <div className="p-2 flex gap-1">
                                <button className="w-7 h-7 border rounded text-gray-700 border-gray-300 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50" onClick={() => applyStyleToSelection({ align: "left" })}>
                                    <AlignLeft className="w-3.5 h-3.5" />
                                </button>
                                <button className="w-7 h-7 border rounded text-gray-700 border-gray-300 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50" onClick={() => applyStyleToSelection({ align: "center" })}>
                                    <AlignCenter className="w-3.5 h-3.5" />
                                </button>
                                <button className="w-7 h-7 border rounded text-gray-700 border-gray-300 bg-white shadow-sm flex items-center justify-center hover:bg-gray-50" onClick={() => applyStyleToSelection({ align: "right" })}>
                                    <AlignRight className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Text Style Panel - Right side of table */}
                {activeSubmenu === "textStyle" && (
                    <div
                        className="fixed z-[100]"
                        style={{
                            top: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().top + 8 : 100,
                            left: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().right + 12 : 100,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                            onClick={() => {
                                setActiveSubmenu(null);
                                setPinnedTextStyle(false);
                            }}
                            title="Close panel"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                        <div
                            className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-y-auto"
                            style={{
                                maxHeight: `calc(100vh - ${(tableCardRef.current ? tableCardRef.current.getBoundingClientRect().top + 8 : 100) + 16}px)`,
                            }}
                        >
                        {(() => {
                            const key = selectedCell
                                ? `${selectedCell.row}-${selectedCell.col}`
                                : selectionRange
                                    ? `${selectionRange.start.row}-${selectionRange.start.col}`
                                    : "";
                            const isTitleTarget = activeStyleTarget === 'title';
                            const currentCellStyle = isTitleTarget ? titleStyle : (cellStyles[key] || {});
                            const toggle = (field: "bold" | "italic" | "underline" | "strikethrough") => {
                                if (!isTitleTarget && !key) return;
                                applyStyleToSelection({ [field]: !currentCellStyle[field] });
                            };
                            const cycleAlign = () => {
                                if (!isTitleTarget && !key) return;
                                applyStyleToSelection({ align: nextTextAlign(currentCellStyle.align || "left") });
                            };
                            return (
                                <>
                                    <div className="px-3 pt-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider truncate">
                                        {isTitleTarget ? 'Editing: Post name' : 'Editing: Cell'}
                                    </div>
                                    {/* Formatting buttons -- same grid every Text style
                                        panel shows, between the (absent here) font-size
                                        section and the color picker below. Bullet
                                        list/Numbered list/Code are inert: a single-line
                                        cell or title input can't hold them. Align cycles
                                        the active target's left/center/right style. */}
                                    <div className="p-3 border-b border-gray-100">
                                        <TextFormattingButtons
                                            onBold={() => toggle("bold")}
                                            onItalic={() => toggle("italic")}
                                            onUnderline={() => toggle("underline")}
                                            onStrikethrough={() => toggle("strikethrough")}
                                            onAlign={cycleAlign}
                                            isBold={!!currentCellStyle.bold}
                                            isItalic={!!currentCellStyle.italic}
                                            isUnderline={!!currentCellStyle.underline}
                                            isStrikethrough={!!currentCellStyle.strikethrough}
                                        />
                                    </div>
                                    {/* Color Picker */}
                                    <div className="p-3">
                                        <ColorPickerContent
                                            color={currentCellStyle.color || "#000000"}
                                            onChange={(color: string) => applyStyleToSelection({ color })}
                                            hasOpacity={true}
                                        />
                                    </div>
                                </>
                            );
                        })()}
                        </div>
                    </div>
                )}

                {/* Cell Color Panel - Right side of table */}
                {activeSubmenu === "cellColor" && (
                    <div
                        className="fixed z-[100] bg-white rounded-xl shadow-lg border border-gray-200"
                        style={{
                            top: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().top + 8 : 100,
                            left: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().right + 12 : 100,
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <button
                            className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                            onClick={() => setActiveSubmenu(null)}
                            title="Close panel"
                        >
                            <X className="h-3.5 w-3.5" />
                        </button>
                        <div className="p-3">
                            <ColorPickerContent
                                color={(() => {
                                    const key = selectedCell
                                        ? `${selectedCell.row}-${selectedCell.col}`
                                        : selectionRange
                                            ? `${selectionRange.start.row}-${selectionRange.start.col}`
                                            : "";
                                    return cellStyles[key || ""]?.bg || "#ffffff";
                                })()}
                                onChange={(color: string) => applyStyleToSelection({ bg: color })}
                                hasOpacity={true}
                            />
                        </div>
                    </div>
                )}

                {/* Context Menu - Replaced by TableCellContextMenu component */}
                {contextMenu && (
                    <TableCellContextMenu
                        isOpen={contextMenu.isOpen}
                        position={{ x: contextMenu.x, y: contextMenu.y }}
                        onClose={() => setContextMenu(null)}
                        onAskAI={openAskAI}
                        onCut={handleCut}
                        onCopy={handleCopy}
                        onPaste={handlePaste}
                        onAddRowAbove={addRowAbove}
                        onAddRowBelow={addRowBelow}
                        onAddColumnLeft={addColumnLeft}
                        onAddColumnRight={addColumnRight}
                        onDeleteRow={deleteRow}
                        onDeleteColumn={deleteColumn}
                        currentAlign={getCurrentStyles().align}
                        currentVerticalAlign={getCurrentStyles().verticalAlign}
                        onAlignChange={(align, vertical) => {
                            applyStyleToSelection({ align, verticalAlign: vertical });
                        }}
                    />
                )}

                {/* PATCH-165. The row/column handle menu, opened from a grip. */}
                {axisMenu && (
                    <TableAxisMenu
                        axis={axisMenu.axis}
                        isOpen
                        position={{ x: axisMenu.x, y: axisMenu.y }}
                        onClose={() => setAxisMenu(null)}
                        canDelete={axisMenu.axis === 'row' ? rows.length > 1 : columns.length > 1}
                        currentAlign={axisMenuSharedAlign}
                        onAction={applyAxisAction}
                        onColor={applyAxisColor}
                        onAlign={applyAxisAlign}
                        colors={CELL_COLORS}
                    />
                )}

                {/* PATCH-166. The "Fill with AI…" panel, anchored beside the
                    table card. It owns only the request; the editor owns the
                    suggestions and the lock. */}
                {fillTarget !== null && (
                    <div
                        className="fixed z-[100]"
                        style={{
                            top: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().top + 8 : 100,
                            left: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().right + 12 : 100,
                        }}
                    >
                        <TableFillPanel
                            columns={columns}
                            targetColumn={fillTarget}
                            rows={rows}
                            onSuggestions={handleFillSuggestions}
                            onClose={closeFillPanel}
                        />
                    </div>
                )}

                {/* PATCH-168. The "Ask AI…" panel, anchored beside the table
                    card. It owns only the request; the editor owns the insert,
                    and the table stays editable while it is open. */}
                {askAI && (
                    <div
                        className="fixed z-[100]"
                        style={{
                            top: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().top + 8 : 100,
                            left: tableCardRef.current ? tableCardRef.current.getBoundingClientRect().right + 12 : 100,
                        }}
                    >
                        <TableAskAIPanel
                            text={askAI.text}
                            truncated={askAI.truncated}
                            cellCount={askAI.cellCount}
                            activeCell={selectedCell}
                            activeCellHasText={activeCellHasText}
                            onInsert={insertAskAIAnswer}
                            onClose={closeAskAI}
                        />
                    </div>
                )}

            </div>
        </div>
    );
}
