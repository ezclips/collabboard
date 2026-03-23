"use client";

import React from 'react';
import {
    ArrowLeft,
    Type,
    Bold,
    Italic,
    Strikethrough,
    Underline,
    List,
    ListOrdered,
    AlignLeft,
    Code,
    Link,
    MessageSquare,
    Palette,
    Smile,
    MapPin,
} from 'lucide-react';

export type ToolbarMode = 'text' | 'box';

interface CommentEditorToolbarProps {
    mode: ToolbarMode;
    onModeChange: (mode: ToolbarMode) => void;
    // Box mode handlers
    onCardColor?: () => void;
    onCollapse?: () => void;
    // Text mode handlers
    onBold?: () => void;
    onItalic?: () => void;
    onStrikethrough?: () => void;
    onLink?: () => void;
    onTextStyle?: () => void;
    textStyleOpen?: boolean;
    onEmoji?: () => void;
    emojiOpen?: boolean;
    linkEnabled?: boolean;
    onTitle?: () => void;
    titleActive?: boolean;
}

export default function CommentEditorToolbar({
    mode,
    onModeChange,
    onCardColor,
    onCollapse,
    onBold,
    onItalic,
    onStrikethrough,
    onLink,
    onTextStyle,
    textStyleOpen = false,
    onEmoji,
    emojiOpen = false,
    linkEnabled = false,
    onTitle,
    titleActive = false,
}: CommentEditorToolbarProps) {

    // Toggle between text and box modes
    const handleToggleMode = () => {
        onModeChange(mode === 'text' ? 'box' : 'text');
    };

    // Text mode tools - basic formatting only
    const textModeTools = [
        { icon: Type, label: 'Title', onClick: onTitle, active: titleActive },
        { icon: Bold, label: 'Bold', onClick: onBold, active: false },
        { icon: Italic, label: 'Italic', onClick: onItalic, active: false },
        { icon: Strikethrough, label: 'Strike', onClick: onStrikethrough, active: false },
        { icon: Link, label: 'Link', onClick: onLink, active: false, disabled: !linkEnabled, disabledHint: 'Select text to add a link' },
    ];

    // Box mode tools
    const boxModeTools = [
        {
            icon: Palette,
            label: 'Card\nColor',
            onClick: onCardColor,
            hasPopup: true,
            active: false
        },
        {
            icon: Smile,
            label: 'React',
            onClick: onEmoji,
            hasPopup: true,
            active: emojiOpen
        },
        {
            icon: MapPin,
            label: 'Collapse',
            onClick: onCollapse,
            hasPopup: false,
            active: false
        },
    ];

    const currentTools = mode === 'text' ? textModeTools : boxModeTools;

    // Prevent focus loss when clicking toolbar buttons
    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
    };

    return (
        <div className="relative">
            <div
                className="flex flex-col items-center bg-white rounded-lg shadow-lg p-1 gap-1 self-center flex-shrink-0 overflow-y-auto w-12"
                style={{
                    maxHeight: '400px',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#d1d5db transparent',
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Toggle button - ALWAYS visible, toggles between text/box modes */}
                <div className="flex flex-col items-center shrink-0">
                    <button
                        onMouseDown={preventFocusLoss}
                        onClick={handleToggleMode}
                        className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                        title={mode === 'text' ? 'Switch to Box Design' : 'Switch to Text Design'}
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-9 truncate">{mode === 'text' ? 'Box' : 'Text'}</span>
                </div>

                {/* Divider line */}
                <div className="w-8 h-px bg-gray-300 shrink-0" />

                {/* Tool buttons - vertical scroll */}
                {currentTools.map((tool, index) => {
                    const IconComponent = tool.icon;
                    const toolAny = tool as any;
                    return (
                        <div key={index} className="flex flex-col items-center shrink-0">
                            <button
                                onMouseDown={preventFocusLoss}
                                onClick={toolAny.disabled ? undefined : tool.onClick}
                                className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                                    tool.active
                                        ? 'bg-blue-100 text-blue-600'
                                        : toolAny.disabled
                                            ? 'text-gray-300 cursor-not-allowed'
                                            : 'hover:bg-gray-200 text-gray-600'
                                }`}
                                title={toolAny.disabled ? (toolAny.disabledHint || tool.label) : tool.label}
                            >
                                <IconComponent className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center w-9 leading-tight">
                                {tool.label.split('\n').map((line, i) => (
                                    <React.Fragment key={`${tool.label}-${i}`}>
                                        {line}
                                        {i < tool.label.split('\n').length - 1 && <br />}
                                    </React.Fragment>
                                ))}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
