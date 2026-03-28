// components/collabboard/menus/LineContextMenu.tsx
"use client";

import React, { useState, useEffect, useRef } from 'react';
import * as ContextMenu from '@radix-ui/react-context-menu';
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
    const menuRef = useRef<HTMLDivElement>(null);

    // Close on click outside
    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        // Delay adding listeners to avoid immediate close from the click that opened the menu
        setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 10);

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen || !line) return null;

    const handleColorSelect = (color: string) => {
        onColorChange?.(color);
    };

    const handleAction = (action?: () => void) => {
        if (action) action();
        onClose();
    };

    return (
        <div
            ref={menuRef}
            className="fixed z-[9999] min-w-[220px] bg-white rounded-md overflow-visible p-1 shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)] animate-in fade-in zoom-in-95 duration-100"
            style={{
                left: position.x,
                top: position.y,
            }}
            onClick={(e) => e.stopPropagation()}
        >
            <MenuItem label="Cut" onClick={() => handleAction(onCut)} />
            <MenuItem label="Duplicate" onClick={() => handleAction(onDuplicate)} />
            <MenuItem label="Delete" onClick={() => handleAction(onDelete)} />
            <MenuItem label={line.start_arrow ? "Remove Start Arrow" : "Add Start Arrow"} onClick={() => handleAction(onToggleStartArrow)} />
            <MenuItem label={line.end_arrow ? "Remove End Arrow" : "Add End Arrow"} onClick={() => handleAction(onToggleEndArrow)} />

            <div className="h-[1px] bg-gray-100 m-1" />

            <MenuItem label="Bring to Front" onClick={() => handleAction(onBringToFront)} />
            <MenuItem label="Send to Back" onClick={() => handleAction(onSendToBack)} />

            <div className="h-[1px] bg-gray-100 m-1" />

            {/* Color Presets Row */}
            <div className="flex gap-1 px-2 py-1.5">
                {LINE_COLOR_PRESETS.map((color) => (
                    <button
                        key={color}
                        onClick={() => {
                            handleColorSelect(color);
                            onClose();
                        }}
                        className={`w-5 h-5 rounded border transition-all hover:scale-110 ${line.color === color
                            ? 'border-gray-600 ring-1 ring-gray-400'
                            : 'border-gray-300 hover:border-gray-400'
                            }`}
                        style={{ backgroundColor: color }}
                        title={color}
                    />
                ))}
            </div>

            {/* Choose Custom Color */}
            <div className="relative">
                <button
                    className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none hover:bg-slate-100 cursor-pointer"
                    onClick={() => setShowCustomColorPicker(!showCustomColorPicker)}
                >
                    Choose Custom Color...
                    <div className="ml-auto pl-5 text-slate-400">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M4.5 2L8.5 6L4.5 10" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </div>
                </button>

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
        </div>
    );
}

function MenuItem({ label, shortcut, onClick }: { label: string; shortcut?: string[]; onClick: () => void }) {
    return (
        <button
            className="w-full text-[13px] leading-none text-slate-700 rounded-[3px] flex items-center h-8 px-2 relative select-none outline-none hover:bg-slate-100 cursor-pointer"
            onClick={onClick}
        >
            {label}
            {shortcut && (
                <div className="ml-auto pl-5 flex gap-1">
                    {shortcut.map((s, i) => (
                        <kbd key={i} className="min-w-[1.2rem] h-5 px-1 bg-slate-100 border border-slate-200 rounded text-[10px] flex items-center justify-center font-sans text-slate-500">
                            {s}
                        </kbd>
                    ))}
                </div>
            )}
        </button>
    );
}
