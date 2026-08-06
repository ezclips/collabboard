"use client";

import React from 'react';
import { Bold, Italic, Strikethrough, Underline, List, ListOrdered, AlignLeft, Code } from 'lucide-react';

// Shared formatting-button grid rendered inside every "Text style" panel
// (Note, Document, Comment, Todo, Clipart caption, Table cell) so the same
// buttons appear in the same spot -- between the heading/font-size list and
// the text/highlight color picker -- regardless of post type. Buttons whose
// handler isn't supplied by the caller still render (for visual parity
// across post types whose content model doesn't support that particular
// formatting yet) but are inert, same as this app's existing "Align" button
// in Note/Document, which has never had a wired handler.
export interface TextFormattingButtonsProps {
    onBold?: () => void;
    onItalic?: () => void;
    onStrikethrough?: () => void;
    onUnderline?: () => void;
    onBulletList?: () => void;
    onOrderedList?: () => void;
    onAlign?: () => void;
    onCode?: () => void;
    isBold?: boolean;
    isItalic?: boolean;
    isStrikethrough?: boolean;
    isUnderline?: boolean;
    isBulletList?: boolean;
    isOrderedList?: boolean;
    isCode?: boolean;
}

const preventFocusLoss = (e: React.MouseEvent) => e.preventDefault();

export default function TextFormattingButtons({
    onBold,
    onItalic,
    onStrikethrough,
    onUnderline,
    onBulletList,
    onOrderedList,
    onAlign,
    onCode,
    isBold = false,
    isItalic = false,
    isStrikethrough = false,
    isUnderline = false,
    isBulletList = false,
    isOrderedList = false,
    isCode = false,
}: TextFormattingButtonsProps) {
    const buttons = [
        { icon: Bold, label: 'Bold', onClick: onBold, active: isBold },
        { icon: Italic, label: 'Italic', onClick: onItalic, active: isItalic },
        { icon: Strikethrough, label: 'Strikethrough', onClick: onStrikethrough, active: isStrikethrough },
        { icon: Underline, label: 'Underline', onClick: onUnderline, active: isUnderline },
        { icon: List, label: 'Bullet list', onClick: onBulletList, active: isBulletList },
        { icon: ListOrdered, label: 'Numbered list', onClick: onOrderedList, active: isOrderedList },
        { icon: AlignLeft, label: 'Align', onClick: onAlign, active: false },
        { icon: Code, label: 'Code', onClick: onCode, active: isCode },
    ];

    return (
        <div className="grid grid-cols-4 gap-1.5">
            {buttons.map((btn) => {
                const Icon = btn.icon;
                return (
                    <button
                        key={btn.label}
                        type="button"
                        onMouseDown={preventFocusLoss}
                        onClick={() => btn.onClick?.()}
                        className={`h-9 flex items-center justify-center rounded-md border transition-colors ${btn.active
                            ? 'bg-blue-50 border-blue-300 text-blue-600'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        title={btn.label}
                    >
                        <Icon className="w-4 h-4" />
                    </button>
                );
            })}
        </div>
    );
}
