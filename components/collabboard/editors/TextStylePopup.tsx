"use client";

import React, { useState } from 'react';
import { ColorPickerContent } from '../ColorPicker';

interface TextStylePopupProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectHeading: (level: 'h1' | 'h2' | 'normal' | 'small' | 'code' | 'callout' | 'quote') => void;
    onSelectColor: (color: string) => void;
    onSelectHighlight: (color: string) => void;
    currentHeading?: string;
    currentColor?: string;
    currentHighlight?: string;
    hideHeadingSelect?: boolean;
}


const textColors = [
    { color: '#1f2937', label: 'Default', border: true },
    { color: '#dc2626', label: 'Red' },
    { color: '#16a34a', label: 'Green' },
    { color: '#2563eb', label: 'Blue' },
    { color: '#ea580c', label: 'Orange' },
    { color: '#9333ea', label: 'Purple' },
];

const highlightColors = [
    { color: '#1f2937', bgColor: '#1f2937', textColor: 'white' },
    { color: '#dc2626', bgColor: '#fecaca', textColor: '#991b1b' },
    { color: '#f59e0b', bgColor: '#fef3c7', textColor: '#92400e' },
    { color: '#16a34a', bgColor: '#dcfce7', textColor: '#166534' },
    { color: '#14b8a6', bgColor: '#ccfbf1', textColor: '#0f766e' },
    { color: '#8b5cf6', bgColor: '#ede9fe', textColor: '#5b21b6' },
    { color: 'transparent', bgColor: 'white', textColor: '#1f2937', border: true },
];

const headingStyles = [
    { level: 'h1' as const, label: 'Large heading', shortcut: '⌘1', className: 'text-lg font-bold' },
    { level: 'h2' as const, label: 'Normal heading', shortcut: '⌘2', className: 'text-base font-semibold' },
    { level: 'normal' as const, label: 'Normal text', shortcut: '⌘0', className: 'text-sm' },
    { level: 'small' as const, label: 'Small text', shortcut: '⌘9', className: 'text-xs text-gray-500' },
    { level: 'code' as const, label: 'Code block', shortcut: '⌘>', className: 'text-sm font-mono bg-gray-100 px-1' },
    { level: 'callout' as const, label: 'Callout', shortcut: '⌘6', className: 'text-sm', icon: '⚠️' },
    { level: 'quote' as const, label: '"Quote block"', shortcut: '⌘#', className: 'text-sm italic' },
];

export default function TextStylePopup({
    isOpen,
    onOpenChange,
    onSelectHeading,
    onSelectColor,
    onSelectHighlight,
    currentHeading = 'normal',
    currentColor = '#1f2937',
    currentHighlight = 'transparent',
    hideHeadingSelect = false,
}: TextStylePopupProps) {
    const [colorMode, setColorMode] = useState<'text' | 'highlight'>('text');

    const preventFocusLoss = (e: React.MouseEvent) => {
        // Allow inputs (sliders, hex inputs) to receive focus/events
        if ((e.target as HTMLElement).tagName === 'INPUT') {
            e.stopPropagation();
            return;
        }
        e.preventDefault();
        e.stopPropagation();
    };

    if (!isOpen) return null;

    return (
        <div className="space-y-4" onMouseDown={preventFocusLoss} onClick={(e) => e.stopPropagation()}>

            {/* Text Style Section */}
            {!hideHeadingSelect && (
                <div className="space-y-1">
                    {headingStyles.map((style) => (
                    <button
                        key={style.level}
                        onMouseDown={preventFocusLoss}
                        onClick={() => onSelectHeading(style.level)}
                        className={`w-full h-9 px-2 rounded flex items-center justify-between transition-all ${currentHeading === style.level
                            ? 'bg-gray-100'
                            : 'hover:bg-gray-50'
                            }`}
                    >
                        <span className={`flex items-center gap-2 leading-none truncate ${style.className}`}>
                            {'icon' in style && <span>{style.icon}</span>}
                            {style.label}
                        </span>
                            <span className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">{style.shortcut}</span>
                                {currentHeading === style.level && (
                                    <span className="text-blue-500">✓</span>
                                )}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Color Mode Toggle + Picker */}
            <div className={`space-y-3 ${hideHeadingSelect ? '' : 'pt-2 border-t border-gray-100'}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* T / H Toggle Buttons */}
                        <div className="flex gap-1 bg-gray-100 p-0.5 rounded-lg">
                            <button
                                onMouseDown={preventFocusLoss}
                                onClick={() => setColorMode('text')}
                                className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-all ${colorMode === 'text'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                title="Text Color"
                            >
                                T
                            </button>
                            <button
                                onMouseDown={preventFocusLoss}
                                onClick={() => setColorMode('highlight')}
                                className={`w-7 h-7 flex items-center justify-center rounded-md text-xs font-bold transition-all ${colorMode === 'highlight'
                                    ? 'bg-white text-gray-900 shadow-sm'
                                    : 'text-gray-500 hover:text-gray-700'
                                    }`}
                                title="Highlight Color"
                            >
                                H
                            </button>
                        </div>
                        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                            {colorMode === 'text' ? 'Text Color' : 'Highlight Color'}
                        </span>
                    </div>
                    <button
                        onMouseDown={preventFocusLoss}
                        onClick={() => onOpenChange(false)}
                        className="w-7 h-7 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-xs font-bold"
                        title="Close"
                    >
                        X
                    </button>
                </div>

                <div onMouseDown={preventFocusLoss}>
                    <ColorPickerContent
                        color={colorMode === 'text' ? currentColor : currentHighlight}
                        onChange={(c) => colorMode === 'text' ? onSelectColor(c) : onSelectHighlight(c)}
                        hasOpacity={true}
                    />
                </div>
            </div>
        </div>
    );
}
