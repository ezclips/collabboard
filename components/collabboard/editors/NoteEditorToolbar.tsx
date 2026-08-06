"use client";

import React from 'react';
import {
    ArrowLeft,
    Type,
    Link,
    MessageSquare,
    Palette,
    Smile,
} from 'lucide-react';

export type ToolbarMode = 'text' | 'box';

interface NoteEditorToolbarProps {
    mode: ToolbarMode;
    onModeChange: (mode: ToolbarMode) => void;
    // PATCH-149B1b-i: 'document' hides the box-mode toggle and shows only
    // controls with a supplied handler.
    variant?: 'note' | 'document';
    // Text mode handlers -- formatting (Bold/Italic/.../Code) lives in the
    // Text style panel now (TextFormattingButtons), not this toolbar.
    onLink?: () => void;
    onTextStyle?: () => void;
    // Box mode handlers
    onCardColor?: () => void;
    onAddReaction?: () => void;
    onPostComment?: (anchor?: DOMRect) => void;
    onTextComment?: () => void;
    postCommentCount?: number;
    postCommentBadgeColor?: string;
    // Active states
    isLink?: boolean;
    isComment?: boolean;
    // Selection state for contextual hints
    hasSelection?: boolean;
}

export default function NoteEditorToolbar({
    mode,
    onModeChange,
    variant = 'note',
    onLink,
    onTextStyle,
    onCardColor,
    onAddReaction,
    onPostComment,
    onTextComment,
    postCommentCount = 0,
    postCommentBadgeColor = '#facc15',
    isLink = false,
    isComment = false,
    hasSelection = false,
}: NoteEditorToolbarProps) {
    // Toggle between text and box modes
    const handleToggleMode = () => {
        onModeChange(mode === 'text' ? 'box' : 'text');
    };

    // Text mode tools with contextual hints -- formatting buttons
    // (Bold/Italic/Strikethrough/Underline/lists/Align/Code) now live in
    // the Text style panel itself, not this toolbar.
    const textModeTools = [
        {
            icon: Type,
            label: 'Text style',
            hint: 'Change text formatting',
            onClick: onTextStyle,
            hasPopup: true,
            active: false
        },
        {
            icon: Link,
            label: 'Link',
            hint: hasSelection ? 'Add link to selected text' : 'Link text first!',
            onClick: onLink,
            active: isLink,
            disabled: !hasSelection,
        },
        {
            icon: MessageSquare,
            label: 'Comment',
            hint: hasSelection ? 'Add comment to selected text' : 'Highlight text first!',
            onClick: onTextComment,
            active: isComment,
            disabled: !hasSelection,
        },
    ];

    // Box mode tools with hints
    const boxModeTools = [
        {
            icon: Palette,
            label: 'Card color',
            hint: 'Change card background and top strip color',
            onClick: onCardColor,
            hasPopup: true,
            active: false
        },
        {
            icon: Smile,
            label: 'Reaction',
            hint: 'Add emoji reaction to this post',
            onClick: onAddReaction,
            hasPopup: true,
            active: false
        },
        {
            icon: MessageSquare,
            label: 'Comment',
            hint: postCommentCount > 0 ? `View ${postCommentCount} comment${postCommentCount > 1 ? 's' : ''}` : 'Add a comment to this post',
            onClick: onPostComment,
            hasPopup: false,
            active: false,
            badgeCount: postCommentCount,
            badgeColor: postCommentBadgeColor,
        },
    ];

    const isDocument = variant === 'document';
    // PATCH-152 follow-up: Document now gets the same Text/Box mode toggle as
    // Note (e.g. Card color, to change the top strip color) -- it just still
    // filters box-mode tools down to whichever handlers are actually supplied
    // (DocumentEditor wires onCardColor but not onAddReaction/onPostComment
    // yet), same as it already did for text-mode tools like onAlign.
    const currentTools = mode === 'text' ? textModeTools : boxModeTools;
    const visibleTools = isDocument ? currentTools.filter((t) => typeof t.onClick === 'function') : currentTools;
    const hasReachableBoxTool = boxModeTools.some((t) => typeof t.onClick === 'function');
    const showModeToggle = !isDocument || hasReachableBoxTool;

    // Prevent focus loss when clicking toolbar buttons
    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div
            className="flex flex-col items-center bg-white rounded-lg shadow-xl border border-gray-200 p-2 gap-1 flex-shrink-0 overflow-hidden"
            style={{
                maxHeight: '400px',
                scrollbarWidth: 'thin',
                scrollbarColor: '#d1d5db transparent',
            }}
        >
            {showModeToggle && (<>
            {/* Toggle button - visible whenever box mode has something to show */}
            <div className="flex flex-col items-center shrink-0">
                <button
                    onMouseDown={preventFocusLoss}
                    onClick={handleToggleMode}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                    title={mode === 'text' ? 'Switch to Box Design' : 'Switch to Text Design'}
                >
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <span className="text-[9px] text-gray-500 text-center">{mode === 'text' ? 'Box' : 'Text'}</span>
            </div>

            {/* Divider line */}
            <div className="w-8 h-px bg-gray-200 shrink-0" />
            </>)}

            {/* Tool buttons - vertical scroll */}
            <div className="flex flex-col items-center gap-1 overflow-y-auto min-h-0 flex-1 scrollbar-thin">
                {visibleTools.map((tool, index) => {
                    const IconComponent = tool.icon;
                    const toolAny = tool as any;
                    const isDisabled = toolAny.disabled === true;
                    return (
                        <div key={index} className="flex flex-col items-center shrink-0">
                            <button
                                onMouseDown={preventFocusLoss}
                                onClick={(event) => {
                                    if (isDisabled) return;
                                    if (tool.onClick === onPostComment) {
                                        if (mode === 'box') {
                                            onPostComment?.();
                                            return;
                                        }
                                        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
                                        onPostComment?.(rect);
                                        return;
                                    }
                                    tool.onClick?.();
                                }}
                                className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${
                                    isDisabled
                                        ? 'text-gray-300 cursor-not-allowed'
                                        : tool.active
                                            ? 'bg-blue-100 text-blue-600'
                                            : 'hover:bg-gray-100 text-gray-600'
                                }`}
                                title={tool.hint || tool.label}
                            >
                                <IconComponent className="w-5 h-5" />
                                {toolAny.badgeCount > 0 && (
                                    <span
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-gray-800 flex items-center justify-center"
                                        style={{ backgroundColor: toolAny.badgeColor || '#facc15' }}
                                    >
                                        {toolAny.badgeCount}
                                    </span>
                                )}
                            </button>
                            <span className={`text-[9px] text-center ${isDisabled ? 'text-gray-300' : 'text-gray-500'}`}>{tool.label}</span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
