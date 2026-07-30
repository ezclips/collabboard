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

const emojiKeywords: Record<string, string[]> = {};

function addEmojiKeywords(categoryId: string, index: number, terms: string[]) {
    const emoji = emojiData[categoryId]?.[index];
    if (emoji) emojiKeywords[emoji] = terms;
}

[
    ['frequent', 0, ['thumbs up', 'like', 'approve', 'yes']],
    ['frequent', 1, ['thumbs down', 'dislike', 'no']],
    ['frequent', 2, ['smile', 'happy', 'blush']],
    ['frequent', 3, ['heart', 'love']],
    ['frequent', 4, ['party', 'celebrate']],
    ['frequent', 5, ['clap', 'applause']],
    ['frequent', 6, ['fire', 'flame', 'hot']],
    ['frequent', 7, ['hundred', '100', 'perfect']],
    ['frequent', 8, ['check', 'done', 'yes']],
    ['frequent', 9, ['star', 'favorite']],
    ['smileys', 0, ['smile', 'happy', 'grin']],
    ['smileys', 1, ['smile', 'happy', 'grin']],
    ['smileys', 2, ['smile', 'happy', 'laugh']],
    ['smileys', 3, ['smile', 'happy', 'grin']],
    ['smileys', 4, ['smile', 'happy', 'laugh']],
    ['smileys', 5, ['smile', 'happy', 'laugh', 'sweat']],
    ['smileys', 6, ['laugh', 'laughing', 'rolling']],
    ['smileys', 7, ['laugh', 'laughing', 'tears', 'happy']],
    ['smileys', 8, ['smile', 'happy']],
    ['smileys', 9, ['smile', 'upside down']],
    ['smileys', 10, ['wink', 'smile']],
    ['smileys', 11, ['smile', 'happy', 'blush']],
    ['smileys', 12, ['smile', 'angel']],
    ['smileys', 13, ['smile', 'happy', 'love']],
    ['smileys', 14, ['heart eyes', 'love', 'happy']],
    ['smileys', 15, ['star eyes', 'excited', 'happy']],
    ['symbols', 0, ['heart', 'love']],
    ['symbols', 1, ['heart', 'orange', 'love']],
    ['symbols', 2, ['heart', 'yellow', 'love']],
    ['symbols', 3, ['heart', 'green', 'love']],
    ['symbols', 4, ['heart', 'blue', 'love']],
    ['symbols', 5, ['heart', 'purple', 'love']],
    ['symbols', 6, ['heart', 'black', 'love']],
    ['symbols', 7, ['heart', 'white', 'love']],
    ['symbols', 8, ['heart', 'brown', 'love']],
    ['symbols', 9, ['heart', 'broken']],
    ['symbols', 10, ['heart', 'exclamation']],
    ['symbols', 11, ['heart', 'love']],
    ['symbols', 12, ['heart', 'love']],
    ['symbols', 13, ['heart', 'love']],
    ['symbols', 14, ['heart', 'love']],
    ['symbols', 15, ['heart', 'love']],
].forEach(([categoryId, index, terms]) => addEmojiKeywords(categoryId as string, index as number, terms as string[]));

const getCategoryLabel = (categoryId: string) =>
    emojiCategories.find((category) => category.id === categoryId)?.label ?? categoryId;

const getSearchText = (emoji: string, categoryId: string) => [
    emoji,
    getCategoryLabel(categoryId),
    ...(emojiKeywords[emoji] ?? []),
].join(' ').toLowerCase();

export default function EmojiReactionPicker({
    isOpen,
    onOpenChange,
    onSelectEmoji,
    inline = false,
    className,
}: EmojiReactionPickerProps) {
    const [selectedCategory, setSelectedCategory] = useState('frequent');
    const [searchQuery, setSearchQuery] = useState('');

    const normalizedSearchQuery = searchQuery.trim().toLowerCase();
    const filteredEmojis = normalizedSearchQuery
        ? Object.entries(emojiData)
            .flatMap(([categoryId, emojis]) => emojis.map((emoji) => ({ emoji, categoryId })))
            .filter(({ emoji, categoryId }) => getSearchText(emoji, categoryId).includes(normalizedSearchQuery))
            .map(({ emoji }) => emoji)
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
