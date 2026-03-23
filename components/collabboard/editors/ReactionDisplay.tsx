"use client";

import React from 'react';
import { Plus, Smile } from 'lucide-react';

interface ReactionDisplayProps {
    reactions: string[];
    onAddClick?: () => void;
    onReactionClick?: (emoji: string) => void;
}

export default function ReactionDisplay({
    reactions,
    onAddClick,
    onReactionClick
}: ReactionDisplayProps) {
    // Group reactions by emoji and count them
    const groupedReactions = reactions.reduce((acc, emoji) => {
        acc[emoji] = (acc[emoji] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const uniqueEmojis = Object.keys(groupedReactions);

    if (uniqueEmojis.length === 0 && !onAddClick) return null;

    return (
        <div className="flex flex-wrap items-center gap-1 min-h-[24px]">
            {uniqueEmojis.map((emoji) => (
                <button
                    key={emoji}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onReactionClick?.(emoji);
                    }}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/80 hover:bg-white border border-gray-100 shadow-sm transition-all hover:shadow-md group active:scale-95"
                >
                    <span className="text-sm leading-none">{emoji}</span>
                    <span className="text-[10px] font-bold text-gray-500 group-hover:text-blue-600 transition-colors">
                        {groupedReactions[emoji]}
                    </span>
                </button>
            ))}

            {onAddClick && (
                <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                        e.stopPropagation();
                        onAddClick();
                    }}
                    className="w-6 h-6 flex items-center justify-center rounded-md bg-white/50 hover:bg-white border border-dashed border-gray-300 text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-all opacity-0 group-hover/image-container:opacity-100 active:scale-90"
                    title="Reaction"
                >
                    <Plus className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}
