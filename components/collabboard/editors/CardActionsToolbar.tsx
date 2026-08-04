'use client';

import React from 'react';
import {
    Palette,
    Image as ImageIcon,
    TextCursor,
    Smile,
    MessageSquare,
} from 'lucide-react';
import type { Padlet } from '@/types/collabboard';

interface CardActionsToolbarProps {
    padlet: Padlet;
    onColorClick: (e: React.MouseEvent, type: 'topstrip' | 'icon' | 'background') => void;
    onReplaceIcon: () => void;
    onToggleCardView?: () => void;
    onAddReaction: (e: React.MouseEvent) => void;
    onComment: () => void;
    onCaption?: () => void;
    onDelete?: () => void;
    isColorPickerOpen?: boolean;
    isCardView?: boolean;
    isCaptionActive?: boolean;
    commentCount?: number;
    commentBadgeColor?: string;
}

type CardActionTool = {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    onClick: (e: React.MouseEvent) => void;
    active: boolean;
    badgeCount?: number;
    badgeColor?: string;
};

export default function CardActionsToolbar({
    padlet: _padlet,
    onColorClick,
    onReplaceIcon,
    onToggleCardView,
    onAddReaction,
    onComment,
    onCaption,
    isColorPickerOpen = false,
    isCardView = false,
    isCaptionActive = false,
    commentCount = 0,
    commentBadgeColor = '#facc15',
}: CardActionsToolbarProps) {
    void _padlet;
    const effectiveCommentCount = Number.isFinite(commentCount) ? Math.max(0, Math.floor(commentCount)) : 0;
    const effectiveCommentBadgeColor = typeof commentBadgeColor === 'string' && commentBadgeColor.trim()
        ? commentBadgeColor
        : '#facc15';
    const tools: CardActionTool[] = [
        {
            icon: Palette,
            label: 'Color',
            onClick: (e: React.MouseEvent) => onColorClick(e, 'topstrip'),
            active: isColorPickerOpen,
        },
        {
            icon: ImageIcon,
            label: 'Icon',
            onClick: () => onReplaceIcon(),
            active: false,
        },
        ...(onCaption ? [{
            icon: TextCursor,
            label: 'Caption',
            onClick: () => onCaption(),
            active: isCaptionActive,
        }] : []),
        {
            icon: Smile,
            label: 'Reaction',
            onClick: (e: React.MouseEvent) => onAddReaction(e),
            active: false,
        },
        {
            icon: MessageSquare,
            label: 'Comment',
            onClick: () => onComment(),
            active: false,
            badgeCount: effectiveCommentCount,
            badgeColor: effectiveCommentBadgeColor,
        },
    ];


    return (
        <div className="flex flex-col items-center bg-white rounded-lg shadow-xl border border-gray-200 p-2 gap-1 z-50 pointer-events-auto">
            {tools.map((tool, index) => {
                const IconComponent = tool.icon;
                const hasCommentBadge = tool.label === 'Comment' && (tool.badgeCount ?? 0) > 0;
                return (
                    <div key={index} className="flex flex-col items-center shrink-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                tool.onClick(e);
                            }}
                            className={`${hasCommentBadge ? 'relative ' : ''}w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${tool.active ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
                                }`}
                            title={tool.label}
                        >
                            <IconComponent className="w-5 h-5" />
                            {hasCommentBadge && (
                                <span
                                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-gray-800 flex items-center justify-center"
                                    style={{ backgroundColor: tool.badgeColor }}
                                >
                                    {tool.badgeCount}
                                </span>
                            )}
                        </button>
                        <span className="text-[9px] text-gray-500 text-center leading-none mt-1">
                            {tool.label}
                        </span>
                    </div>
                );
            })}


        </div>
    );
}
