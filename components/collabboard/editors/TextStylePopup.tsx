"use client";

import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';
import TextFormattingButtons, { type TextFormattingButtonsProps } from './TextFormattingButtons';
import { TEXT_COLOR_PRESETS, HIGHLIGHT_COLOR_PRESETS } from './textStylePresets';

interface TextStylePopupProps extends TextFormattingButtonsProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectHeading: (level: 'h1' | 'h2' | 'normal' | 'small' | 'code' | 'callout' | 'quote') => void;
    onSelectColor: (color: string) => void;
    onSelectHighlight: (color: string) => void;
    currentHeading?: string;
    currentColor?: string;
    currentHighlight?: string;
    hideHeadingSelect?: boolean;
    // Callers that already render their own top-right close affordance
    // (e.g. a round X in the panel's own header) pass this so the popup
    // doesn't duplicate it with a second, inline "X" text button.
    hideCloseButton?: boolean;
}


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
    hideCloseButton = false,
    onBold,
    onItalic,
    onStrikethrough,
    onUnderline,
    onBulletList,
    onOrderedList,
    onAlign,
    onCode,
    isBold,
    isItalic,
    isStrikethrough,
    isUnderline,
    isBulletList,
    isOrderedList,
    isCode,
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
            {!hideCloseButton && (
                <button
                    onMouseDown={preventFocusLoss}
                    onClick={() => onOpenChange(false)}
                    className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                    title="Close"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}

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

            {/* Formatting buttons -- same grid on every real "Text style"
                panel (Note, Document, Comment, Todo, Clipart caption, Table
                cell), between the heading/font-size list above and the
                text/highlight color picker below. Hidden on the small
                comment-swatch color popups (hideHeadingSelect), which were
                never the "Text style" tool to begin with. */}
            {!hideHeadingSelect && (
                <div className="pt-2 border-t border-gray-100">
                    <TextFormattingButtons
                        onBold={onBold}
                        onItalic={onItalic}
                        onStrikethrough={onStrikethrough}
                        onUnderline={onUnderline}
                        onBulletList={onBulletList}
                        onOrderedList={onOrderedList}
                        onAlign={onAlign}
                        onCode={onCode}
                        isBold={isBold}
                        isItalic={isItalic}
                        isStrikethrough={isStrikethrough}
                        isUnderline={isUnderline}
                        isBulletList={isBulletList}
                        isOrderedList={isOrderedList}
                        isCode={isCode}
                    />
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
                </div>

                <div onMouseDown={preventFocusLoss}>
                    <ColorPickerContent
                        color={colorMode === 'text' ? currentColor : currentHighlight}
                        onChange={(c) => colorMode === 'text' ? onSelectColor(c) : onSelectHighlight(c)}
                        hasOpacity={true}
                        presets={colorMode === 'text' ? TEXT_COLOR_PRESETS : HIGHLIGHT_COLOR_PRESETS}
                    />
                </div>
            </div>
        </div>
    );
}
