"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

interface EmojiReactionPickerProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectEmoji: (emoji: string) => void;
    inline?: boolean;
    className?: string;
}

const emojiCategories = [
    { id: 'frequent', label: 'Frequently used' },
    { id: 'smileys', label: 'Smileys & Emotions' },
    { id: 'people', label: 'People & Body' },
    { id: 'animals', label: 'Animals & Nature' },
    { id: 'food', label: 'Food & Drink' },
    { id: 'travel', label: 'Travel & Places' },
    { id: 'activities', label: 'Activities' },
    { id: 'objects', label: 'Objects' },
    { id: 'symbols', label: 'Symbols' },
    { id: 'flags', label: 'Flags' },
];

const emojiData: Record<string, string[]> = {
    frequent: ['👍', '👎', '😊', '❤️', '🎉', '👏', '🔥', '💯', '✅', '⭐'],
    smileys: [
        '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃',
        '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋',
        '😜', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
    ],
    people: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '👇', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🙏'],
    animals: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵'],
    food: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥'],
    travel: ['🚗', '🚕', '🚙', '🚌', '🚎', '🏎️', '🚓', '🚑', '🚒', '🚐', '🛻', '🚚', '🚛', '🚜', '✈️'],
    activities: ['⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸', '🏒', '🏑', '🎯'],
    objects: ['⌚', '📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '💽', '💾', '💿', '📀', '📷', '📸', '📹', '🎥'],
    symbols: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖'],
    flags: ['🏁', '🚩', '🎌', '🏴', '🏳️', '🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇩🇪', '🇫🇷', '🇮🇹', '🇪🇸', '🇯🇵', '🇨🇳', '🇰🇷'],
};

export default function EmojiReactionPicker({
    isOpen,
    onOpenChange,
    onSelectEmoji,
    inline = false,
    className,
}: EmojiReactionPickerProps) {
    const [selectedCategory, setSelectedCategory] = useState('frequent');
    const [searchQuery, setSearchQuery] = useState('');

    const filteredEmojis = searchQuery
        ? Object.values(emojiData).flat().filter(emoji =>
            emoji.includes(searchQuery)
        )
        : emojiData[selectedCategory] || [];

    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    if (inline && !isOpen) return null;

    const content = (
        <div className="flex h-[350px]">
            {/* Category Sidebar */}
            <div className="w-1/3 border-r overflow-y-auto py-2">
                {emojiCategories.map((category) => (
                    <button
                        key={category.id}
                        onMouseDown={preventFocusLoss}
                        onClick={() => setSelectedCategory(category.id)}
                        className={`w-full text-left px-3 py-2 text-sm transition-colors ${selectedCategory === category.id
                            ? 'bg-blue-50 text-blue-600 font-medium'
                            : 'text-gray-600 hover:bg-gray-50'
                            }`}
                    >
                        {category.label}
                    </button>
                ))}
            </div>

            {/* Emoji Grid */}
            <div className="w-2/3 flex flex-col">
                {/* Search */}
                <div className="p-2 border-b">
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                            placeholder="Search emojis..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8 h-8 text-sm"
                        />
                    </div>
                </div>

                {/* Category Title */}
                <div className="px-3 py-2 text-sm font-medium text-gray-700 border-b">
                    {emojiCategories.find(c => c.id === selectedCategory)?.label || 'Emojis'}
                </div>

                {/* Emoji Grid */}
                <div className="flex-1 overflow-y-auto p-2">
                    <div className="grid grid-cols-8 gap-1">
                        {filteredEmojis.map((emoji, index) => (
                            <button
                                key={index}
                                onMouseDown={preventFocusLoss}
                                onClick={() => {
                                    onSelectEmoji(emoji);
                                    onOpenChange(false);
                                }}
                                className="w-8 h-8 flex items-center justify-center text-xl hover:bg-gray-100 rounded transition-colors"
                                title={emoji}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>

                    {filteredEmojis.length === 0 && (
                        <div className="text-center text-gray-400 py-8">
                            No emojis found
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    if (inline) {
        return (
            <div
                className={`bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden w-[360px] ${className || ''}`.trim()}
                onMouseDown={preventFocusLoss}
            >
                <div className="flex items-center justify-between px-3 py-2 border-b">
                    <span className="text-sm font-semibold text-gray-700">Add Reaction</span>
                    <button
                        className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                        onClick={() => onOpenChange(false)}
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>
                {content}
            </div>
        );
    }

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent
                className="sm:max-w-lg"
                onMouseDown={preventFocusLoss}
            >
                <DialogHeader>
                    <DialogTitle>Add Reaction</DialogTitle>
                </DialogHeader>
                {content}
            </DialogContent>
        </Dialog>
    );
}
