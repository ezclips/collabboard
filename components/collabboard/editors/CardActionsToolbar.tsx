'use client';

import React from 'react';
import {
    Palette,
    Image as ImageIcon,
    LayoutGrid,
    Smile,
    MessageSquare,
} from 'lucide-react';

interface CardActionsToolbarProps {
    padlet: any;
    onColorClick: (e: React.MouseEvent, type: 'topstrip' | 'icon' | 'background') => void;
    onReplaceIcon: () => void;
    onToggleCardView: () => void;
    onAddReaction: (e: React.MouseEvent) => void;
    onComment: () => void;
    onDelete?: () => void;
    isColorPickerOpen?: boolean;
    isCardView?: boolean;
}

export default function CardActionsToolbar({
    padlet,
    onColorClick,
    onReplaceIcon,
    onToggleCardView,
    onAddReaction,
    onComment,
    isColorPickerOpen = false,
    isCardView = false,
}: CardActionsToolbarProps) {
    const tools = [
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
        {
            icon: LayoutGrid,
            label: 'Card view',
            onClick: () => onToggleCardView(),
            active: isCardView,
        },
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
        },
    ];


    return (
        <div className="flex flex-col items-center bg-white rounded-lg shadow-xl border border-gray-200 p-2 gap-1 z-50 pointer-events-auto">
            {tools.map((tool, index) => {
                const IconComponent = tool.icon;
                return (
                    <div key={index} className="flex flex-col items-center shrink-0">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                tool.onClick(e);
                            }}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${tool.active ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100 text-gray-600'
                                }`}
                            title={tool.label}
                        >
                            <IconComponent className="w-5 h-5" />
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

