"use client";

import React, { useState } from 'react';
import { Trash2, Strikethrough } from 'lucide-react';

interface CommentActionsToolbarProps {
    onColor: (color: string) => void;
    onRemove: () => void;
    onStrikethrough?: () => void;
    currentColor?: string;
    isStrikethrough?: boolean;
}

const COLORS = [
    // Row 1 - Light colors
    '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04',
    // Row 2 - Grays
    '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563',
    // Row 3 - Oranges & Reds
    '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c',
    // Row 4 - Pinks & Reds
    '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777',
    // Row 5 - Blues
    '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb',
    // Row 6 - Greens
    '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a',
    // Row 7 - Purples
    '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea',
    // Row 8 - Teals
    '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488',
];

export default function CommentActionsToolbar({
    onColor,
    onRemove,
    onStrikethrough,
    currentColor,
    isStrikethrough,
}: CommentActionsToolbarProps) {
    const [showColorPicker, setShowColorPicker] = useState(false);

    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    return (
        <div
            className="flex flex-col items-center bg-white rounded-lg shadow-xl border border-gray-200 p-2 gap-1"
            onMouseDown={preventFocusLoss}
        >
            {/* Color button */}
            <div className="relative">
                <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${currentColor
                        ? 'bg-blue-100 text-blue-600'
                        : 'hover:bg-gray-100 text-gray-600'
                        }`}
                    title="Color"
                >
                    <div
                        className="w-6 h-6 rounded border-2 border-gray-400"
                        style={{ backgroundColor: currentColor || '#e5e7eb' }}
                    />
                </button>
                <span className="text-[9px] text-gray-500 text-center w-full block">Color</span>

                {/* Color picker dropdown - Wide grid like mockup */}
                {showColorPicker && (
                    <div className="absolute left-full ml-2 top-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50" style={{ width: '200px' }}>
                        <div className="grid grid-cols-6 gap-1.5">
                            {COLORS.map((color) => (
                                <button
                                    key={color}
                                    onClick={() => {
                                        onColor(color);
                                        setShowColorPicker(false);
                                    }}
                                    className={`rounded hover:ring-2 hover:ring-gray-400 transition-transform hover:scale-110 ${currentColor === color ? 'ring-2 ring-blue-500' : ''}`}
                                    style={{
                                        width: '24px',
                                        height: '24px',
                                        backgroundColor: color,
                                        border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a', '#ffffff'].includes(color) ? '1px solid #d1d5db' : 'none',
                                    }}
                                    title={color}
                                />
                            ))}
                        </div>
                        {/* Clear color option */}
                        <button
                            onClick={() => {
                                onColor('');
                                setShowColorPicker(false);
                            }}
                            className="mt-3 w-full text-sm text-gray-500 hover:text-gray-700 py-1 border-t border-gray-100"
                        >
                            Clear
                        </button>
                    </div>
                )}
            </div>

            {/* Strikethrough button */}
            {onStrikethrough && (
                <div>
                    <button
                        onClick={onStrikethrough}
                        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${isStrikethrough ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'}`}
                        title="Strikethrough"
                    >
                        <Strikethrough className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block">Strike</span>
                </div>
            )}

            {/* Remove button */}
            <div>
                <button
                    onClick={() => {
                        console.log('Remove clicked');
                        onRemove();
                    }}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 hover:text-red-500 text-gray-600 transition-colors"
                    title="Remove"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
                <span className="text-[9px] text-gray-500 text-center w-full block">Remove</span>
            </div>
        </div>
    );
}
