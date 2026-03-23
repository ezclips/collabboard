"use client";

import React, { useState, useEffect, useRef } from 'react';
import {
    Check,
    ChevronRight,
    AlignLeft,
    AlignCenter,
    AlignRight
} from "lucide-react";

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
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        // Use capture to ensuring we catch it before other handlers if needed, 
        // but standard bubble is usually fine.
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const handleAction = (action?: () => void) => {
        if (action) action();
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[200px]"
            style={{ top: position.y, left: position.x }}
            onClick={(e) => e.stopPropagation()}
        >
            <MenuItem label="Cut" shortcut="Ctrl+X" onClick={() => handleAction(onCut)} />
            <MenuItem label="Copy" shortcut="Ctrl+C" onClick={() => handleAction(onCopy)} />
            <MenuItem label="Paste" shortcut="Ctrl+V" onClick={() => handleAction(onPaste)} />

            <div className="my-1 border-t border-gray-200" />

            <MenuItem label="Add Row Above" shortcut="Alt+↑" onClick={() => handleAction(onAddRowAbove)} />
            <MenuItem label="Add Row Below" shortcut="Alt+↓" onClick={() => handleAction(onAddRowBelow)} />
            <MenuItem label="Add Column Left" shortcut="Alt+←" onClick={() => handleAction(onAddColumnLeft)} />
            <MenuItem label="Add Column Right" shortcut="Alt+→" onClick={() => handleAction(onAddColumnRight)} />

            <div className="my-1 border-t border-gray-200" />

            <MenuItem label="Delete Row" textColor="text-red-600" onClick={() => handleAction(onDeleteRow)} />
            <MenuItem label="Delete Column" textColor="text-red-600" onClick={() => handleAction(onDeleteColumn)} />

            <div className="my-1 border-t border-gray-200" />

            {/* Change Alignment Submenu Trigger */}
            <div
                className="relative"
                onMouseEnter={() => setActiveSubmenu("alignment")}
                onMouseLeave={() => setActiveSubmenu(null)}
            >
                <button
                    className="w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 text-gray-700 flex justify-between items-center"
                >
                    Change Alignment...
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                {/* Submenu */}
                {activeSubmenu === "alignment" && (
                    <div
                        className="absolute left-full top-0 ml-0.5 bg-white rounded-lg shadow-xl border border-gray-200 py-1 min-w-[150px]"
                        style={{ marginTop: '-4px' }} // Align top nicely
                    >
                        <MenuItem
                            label="Left"
                            onClick={() => handleAction(() => onAlignChange?.("left", currentVerticalAlign))}
                            icon={currentAlign === "left" || !currentAlign ? <Check className="w-3.5 h-3.5" /> : undefined}
                        />
                        <MenuItem
                            label="Center"
                            onClick={() => handleAction(() => onAlignChange?.("center", currentVerticalAlign))}
                            icon={currentAlign === "center" ? <Check className="w-3.5 h-3.5" /> : undefined}
                        />
                        <MenuItem
                            label="Right"
                            onClick={() => handleAction(() => onAlignChange?.("right", currentVerticalAlign))}
                            icon={currentAlign === "right" ? <Check className="w-3.5 h-3.5" /> : undefined}
                        />

                        <div className="my-1 border-t border-gray-200" />

                        <MenuItem
                            label="Top"
                            onClick={() => handleAction(() => onAlignChange?.(currentAlign, "top"))}
                            icon={currentVerticalAlign === "top" || !currentVerticalAlign ? <Check className="w-3.5 h-3.5" /> : undefined}
                        />
                        <MenuItem
                            label="Middle"
                            onClick={() => handleAction(() => onAlignChange?.(currentAlign, "middle"))}
                            icon={currentVerticalAlign === "middle" ? <Check className="w-3.5 h-3.5" /> : undefined}
                        />
                        <MenuItem
                            label="Bottom"
                            onClick={() => handleAction(() => onAlignChange?.(currentAlign, "bottom"))}
                            icon={currentVerticalAlign === "bottom" ? <Check className="w-3.5 h-3.5" /> : undefined}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}

function MenuItem({
    label,
    shortcut,
    onClick,
    textColor = "text-gray-700",
    icon
}: {
    label: string;
    shortcut?: string;
    onClick: () => void;
    textColor?: string;
    icon?: React.ReactNode;
}) {
    return (
        <button
            className={`w-full px-4 py-1.5 text-left text-sm hover:bg-gray-100 ${textColor} flex justify-between items-center group`}
            onClick={onClick}
        >
            <span className="flex items-center gap-2">
                {label}
            </span>
            <div className="flex items-center">
                {shortcut && <span className="text-xs text-gray-400 ml-3">{shortcut}</span>}
                {icon && <span className="text-gray-600 ml-2">{icon}</span>}
            </div>
        </button>
    );
}
