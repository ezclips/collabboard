"use client";

import React from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Palette, Highlighter } from 'lucide-react';

const PRESET_COLORS = [
    '#1f2937', '#9ca3af', '#2dd4bf', '#4ade80', '#f97316',
    '#facc15', '#fb923c', '#ef4444', '#f472b6', '#a855f7',
    '#38bdf8', '#6366f1', '#ffffff'
];

const PASTEL_COLORS = [
    '#94a3b8', '#cbd5e1', '#94d2bd', '#e9edc9', '#fec5bb',
    '#fcd5ce', '#e2e2e2'
];

interface DrawingColorPopupProps {
    color: string;
    onSelect: (color: string) => void;
    children: React.ReactNode;
}

export function DrawingColorPopup({ color, onSelect, children }: DrawingColorPopupProps) {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-[220] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 w-64 animate-in fade-in zoom-in duration-200"
                    sideOffset={5}
                >
                    <div className="space-y-4">
                        <div className="grid grid-cols-5 gap-2">
                            {PRESET_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => onSelect(c)}
                                    className={`w-8 h-8 rounded-md border-2 transition-all ${color === c ? 'border-blue-500 scale-110 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <div className="h-px bg-gray-100 w-full" />
                        <div className="grid grid-cols-5 gap-2">
                            {PASTEL_COLORS.map((c) => (
                                <button
                                    key={c}
                                    onClick={() => onSelect(c)}
                                    className={`w-8 h-8 rounded-md border-2 transition-all ${color === c ? 'border-blue-500 scale-110 shadow-sm' : 'border-gray-100 hover:border-gray-300'}`}
                                    style={{ backgroundColor: c }}
                                />
                            ))}
                        </div>
                        <div className="mt-4">
                            <button className="w-full py-2 px-3 flex items-center gap-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg border border-gray-200 transition-colors">
                                <div className="w-4 h-4 rounded-full bg-gradient-to-tr from-red-500 via-green-500 to-blue-500" />
                                Custom color...
                            </button>
                        </div>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

interface DrawingStylePopupProps {
    width: number;
    onSelect: (width: number) => void;
    children: React.ReactNode;
}

const STYLES = [
    { label: 'Fine', value: 2 },
    { label: 'Medium', value: 5 },
    { label: 'Thick', value: 10 },
    { label: 'Extra Thick', value: 20 },
];

export function DrawingStylePopup({ width, onSelect, children }: DrawingStylePopupProps) {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-[220] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 animate-in fade-in zoom-in duration-200"
                    sideOffset={5}
                >
                    <div className="flex gap-1 p-1">
                        {STYLES.map((style) => (
                            <button
                                key={style.value}
                                onClick={() => onSelect(style.value)}
                                className={`p-3 rounded-lg transition-all ${width === style.value ? 'bg-orange-50 border-2 border-orange-500' : 'hover:bg-gray-50 border-2 border-transparent'}`}
                            >
                                <div className="flex flex-col items-center gap-1">
                                    <svg width="24" height="24" viewBox="0 0 24 24">
                                        <path
                                            d="M4 18 C 8 10, 16 10, 20 18"
                                            fill="none"
                                            stroke="#374151"
                                            strokeWidth={style.value / 2 + 1}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </div>
                            </button>
                        ))}
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}

interface TextStylePopupProps {
    currentStyle: 'h1' | 'h2' | 'p' | 'small' | 'code';
    currentColor: string;
    onStyleSelect: (style: 'h1' | 'h2' | 'p' | 'code') => void;
    onColorSelect: (color: string) => void;
    children: React.ReactNode;
}

export function TextStylePopup({ currentStyle, currentColor, onStyleSelect, onColorSelect, children }: TextStylePopupProps) {
    return (
        <Popover.Root>
            <Popover.Trigger asChild>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    className="z-[220] bg-white rounded-xl shadow-xl border border-gray-200 w-56 animate-in fade-in zoom-in duration-200 overflow-hidden"
                    sideOffset={5}
                    align="start"
                >
                    <div className="flex flex-col py-1">
                        {/* Styles */}
                        <div className="px-1 text-sm font-medium text-gray-500 mb-1 ml-2 mt-1">Text Style</div>
                        <button onClick={() => onStyleSelect('h1')} className={`flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${currentStyle === 'h1' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}>
                            <span className="text-lg font-bold">Large heading</span>
                            {currentStyle === 'h1' && <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => onStyleSelect('h2')} className={`flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${currentStyle === 'h2' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}>
                            <span className="text-base font-semibold">Normal heading</span>
                            {currentStyle === 'h2' && <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => onStyleSelect('p')} className={`flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 ${currentStyle === 'p' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}>
                            <span className="text-sm">Normal text</span>
                            {currentStyle === 'p' && <Check className="w-4 h-4" />}
                        </button>

                        <div className="h-px bg-gray-100 my-2" />

                        {/* Colors */}
                        <div className="px-1 text-sm font-medium text-gray-500 mb-2 ml-2">Color</div>
                        <div className="grid grid-cols-5 gap-1 px-3 pb-2">
                            {['#000000', '#ef4444', '#22c55e', '#3b82f6', '#f97316', '#a855f7'].map(c => (
                                <button
                                    key={c}
                                    onClick={() => onColorSelect(c)}
                                    className={`w-6 h-6 rounded flex items-center justify-center transition-all ${currentColor === c ? 'ring-2 ring-offset-1 ring-blue-500' : 'hover:scale-110'}`}
                                    style={{ backgroundColor: c }}
                                >
                                    <span className="text-white text-[10px] font-bold">A</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    )
}

import { Check } from 'lucide-react';
