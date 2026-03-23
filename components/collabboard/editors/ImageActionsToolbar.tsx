import React, { useState, useEffect } from 'react';
import {
    Palette,
    Type,
    Crop,
    Pencil,
    Smile,
    MessageSquare,
    ArrowLeft,
    TextCursor,
    Bold,
    Italic,
    Strikethrough,
    Underline,
} from 'lucide-react';

export type ToolbarMode = 'image' | 'caption';

interface ImageActionsToolbarProps {
    mode?: ToolbarMode;
    onModeChange?: (mode: ToolbarMode) => void;
    onColorClick: () => void;
    isColorPickerOpen?: boolean;
    onCardColor: (color: string) => void;
    onTopStrip?: (color: string) => void;
    onCaptionTextColor?: (color: string) => void;
    onCaption: () => void;
    onTextStyle: () => void;
    onSelectColor: (color: string) => void;
    onSelectHighlight: (color: string) => void;
    onEditImage: () => void;
    onDrawOnTop: () => void;
    onAddReaction: () => void;
    onComment: () => void;
    commentCount?: number;
    commentBadgeColor?: string;
    currentCardColor?: string;
    currentTopStrip?: string;
    currentCaptionTextColor?: string;
    currentColor?: string;
    currentHighlight?: string;
    isDrawingMode?: boolean;
    isCaptionMode?: boolean;
    isTextStyleMode?: boolean;
}

const COLORS = [
    '#ffffff', '#fef9c3', '#fef08a', '#fde047', '#facc15', '#ffedd5',
    '#fed7aa', '#fdba74', '#fb923c', '#fce7f3', '#fbcfe8', '#f9a8d4',
    '#f472b6', '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#dcfce7',
    '#bbf7d0', '#86efac', '#4ade80', '#f3e8ff', '#e9d5ff', '#d8b4fe'
];

const TEXT_COLORS = [
    { color: '#000000', label: 'Black' },
    { color: '#ef4444', label: 'Red' },
    { color: '#22c55e', label: 'Green' },
    { color: '#3b82f6', label: 'Blue' },
    { color: '#f59e0b', label: 'Orange' },
    { color: '#a855f7', label: 'Purple' },
];

const HIGHLIGHT_COLORS = [
    { color: 'transparent', label: 'None' },
    { color: '#fee2e2', label: 'Light Red' },
    { color: '#fef3c7', label: 'Light Orange' },
    { color: '#dcfce7', label: 'Light Green' },
    { color: '#dbeafe', label: 'Light Blue' },
    { color: '#f3e8ff', label: 'Light Purple' },
];

export default function ImageActionsToolbar({
    mode: externalMode,
    onModeChange,
    onColorClick,
    isColorPickerOpen = false,
    onCardColor,
    onTopStrip,
    onCaptionTextColor,
    onCaption,
    onTextStyle,
    onSelectColor,
    onSelectHighlight,
    onEditImage,
    onDrawOnTop,
    onAddReaction,
    onComment,
    commentCount = 0,
    commentBadgeColor = '#facc15',
    currentCardColor = '#ffffff',
    currentTopStrip = 'transparent',
    currentCaptionTextColor = '#1F2937',
    currentColor,
    currentHighlight,
    isDrawingMode = false,
    isCaptionMode = false,
    isTextStyleMode = false,
}: ImageActionsToolbarProps) {
    const [internalMode, setInternalMode] = useState<ToolbarMode>('image');

    // Use external mode if provided, otherwise use internal
    const mode = externalMode ?? internalMode;
    const setMode = (newMode: ToolbarMode) => {
        if (onModeChange) {
            onModeChange(newMode);
        } else {
            setInternalMode(newMode);
        }
    };

    // Sync with isTextStyleMode from parent if needed
    useEffect(() => {
        if (isTextStyleMode && mode !== 'caption') {
            setMode('caption');
        }
    }, [isTextStyleMode]);

    const preventFocusLoss = (e: React.MouseEvent) => {
        // Only prevent default to keep focus, don't stop propagation
        // so that button clicks inside the toolbar still work
        e.preventDefault();
    };

    const handleToggleMode = () => {
        const newMode = mode === 'image' ? 'caption' : 'image';
        setMode(newMode);
        if (newMode === 'caption') {
            onTextStyle(); // Notify parent we're entering caption mode
        }
    };

    // Caption mode tools (text styling for caption)
    const captionModeTools = [
        {
            icon: Type,
            label: 'Text style',
            onClick: onTextStyle,
            hasPopup: true,
            active: isTextStyleMode,
        },
    ];

    // Image mode tools
    const imageModeTools = [
        { id: 'caption', icon: TextCursor, label: 'Caption', onClick: handleToggleMode, active: isCaptionMode },
        { id: 'edit', icon: Crop, label: 'Edit image', onClick: onEditImage, active: false },
        { id: 'draw', icon: Pencil, label: 'Draw on top', onClick: onDrawOnTop, active: isDrawingMode },
        { id: 'reaction', icon: Smile, label: 'Reaction', onClick: onAddReaction, active: false },
        { id: 'comment', icon: MessageSquare, label: 'Comment', onClick: onComment, active: false },
    ];

    return (
        <div
            className="flex flex-col items-center bg-white rounded-lg shadow-xl border border-gray-200 p-2 gap-1 z-50 pointer-events-auto"
            style={{ maxHeight: 'calc(100vh - 160px)', overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#d1d5db transparent' }}
            onMouseDown={preventFocusLoss}
        >
            {/* Toggle button - switches between image/caption modes */}
            <div className="flex flex-col items-center shrink-0">
                <button
                    onClick={handleToggleMode}
                    className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                    title={mode === 'image' ? 'Switch to Caption Styling' : 'Switch to Image Actions'}
                >
                    <ArrowLeft className="w-5 h-5 text-black" />
                </button>
                <span className="text-[9px] text-gray-500 text-center">
                    {mode === 'image' ? 'Text' : 'Image'}
                </span>
            </div>

            <div className="w-8 h-px bg-gray-200 shrink-0" />

            {mode === 'caption' ? (
                <>
                    {/* Caption Mode Tools */}
                    {captionModeTools.map((tool, index) => {
                        const IconComponent = tool.icon;
                        const isHeader = (tool as any).isHeader;

                        // Separator logic if we add more tools later
                        if (index === 100) {
                            return null;
                        }

                        return (
                            <div key={index} className="flex flex-col items-center shrink-0">
                                <button
                                    onClick={tool.onClick}
                                    className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${tool.active
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'hover:bg-gray-100 text-gray-600'
                                        }`}
                                    title={tool.label}
                                >
                                    <IconComponent className="w-5 h-5" />
                                    {tool.hasPopup && <span className="absolute right-0 bottom-0 text-[10px] pr-1">▶</span>}
                                </button>
                                <span className="text-[9px] text-gray-500 text-center">{tool.label}</span>
                            </div>
                        );
                    })}
                </>
            ) : (
                <>
                    {/* Color Tool - triggers external popup */}
                    <div className="flex flex-col items-center shrink-0">
                        <button
                            onClick={onColorClick}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-100 ${isColorPickerOpen ? 'bg-gray-100' : ''}`}
                            title="Color"
                        >
                            <Palette className="w-5 h-5 text-gray-600" />
                        </button>
                        <span className="text-[9px] text-gray-500 text-center">Color</span>
                    </div>

                    {/* Image Mode Tools */}
                    {imageModeTools.map((tool, index) => {
                        const IconComponent = tool.icon;
                        return (
                            <div key={index} className="flex flex-col items-center shrink-0">
                                <button
                                    onClick={tool.onClick}
                                    className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${tool.active
                                        ? 'bg-blue-100 text-blue-600'
                                        : 'hover:bg-gray-100 text-gray-600'
                                        }`}
                                    title={tool.label}
                                >
                                    <IconComponent className="w-5 h-5" />
                                    {tool.id === 'comment' && commentCount > 0 && (
                                        <span
                                            className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-gray-800 flex items-center justify-center"
                                            style={{ backgroundColor: commentBadgeColor }}
                                        >
                                            {commentCount}
                                        </span>
                                    )}
                                </button>
                                <span className="text-[9px] text-gray-500 text-center">{tool.label}</span>
                            </div>
                        );
                    })}
                </>
            )}
        </div>
    );
}
