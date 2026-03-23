import React from 'react';
import { Padlet } from '@/types/collabboard';
import { Edit2 } from 'lucide-react';
import ReactionDisplay from './editors/ReactionDisplay';

interface CardPreviewProps {
    padlet: Padlet;
    isSelected: boolean;
    onClick?: () => void;
    onOpenToolbar?: (e: React.MouseEvent) => void;
    onEditContent?: () => void;
    isCardView?: boolean;
    reactions?: string[];
    onAddReaction?: () => void;
    onReactionClick?: (emoji: string) => void;
}

export default function CardPreview({
    padlet,
    isSelected,
    onClick,
    onOpenToolbar,
    reactions = [],
    onAddReaction,
    onReactionClick
}: CardPreviewProps) {
    const { metadata, title, content } = padlet;
    const iconBgColor = metadata?.iconBgColor || '#f8f9fa'; // Small square behind icon (Tab 1: "Icon")
    const cardBgColor = metadata?.backgroundColor || '#ffffff'; // Outer card background (Tab 2: "Icon BG")
    const svgUrl = metadata?.svgUrl;
    const counterType = metadata?.counterType || 'words';
    const topStripColor = metadata?.topStripColor || '#4f46e5'; // Top strip (Tab 3: "Icon Strip")
    const textColor = metadata?.textColor || '#1F2937'; // Title text color
    const showTopStrip = !!topStripColor && topStripColor !== 'transparent';
    const isClipartCard = !!svgUrl;
    const stripBg = showTopStrip ? topStripColor : 'rgba(0,0,0,0.04)';
    const stripIconColor = showTopStrip ? '#f3f4f6' : '#9ca3af';

    // Calculate counter
    const calculateCounter = () => {
        if (counterType === 'words') {
            const text = (content || '').replace(/<[^>]*>/g, '').trim();
            const wordCount = text ? text.split(/\s+/).length : 0;
            return `${wordCount} words`;
        } else {
            const cardCount = metadata?.childPadletIds?.length || 0;
            return `${cardCount} cards`;
        }
    };

    if (isClipartCard) {
        return (
            <div
                onClick={onClick}
                className={`group relative h-full border overflow-hidden transition-colors ${isSelected ? 'border-blue-500 ring-2 ring-blue-100 shadow-md' : 'border-gray-200'}`}
                style={{ backgroundColor: cardBgColor }}
            >
                <div
                    className="w-full flex-shrink-0 grid"
                    style={{ gridTemplateColumns: 'auto 1fr auto', minHeight: '22px', backgroundColor: stripBg }}
                >
                    <div className="flex items-center pl-1.5">
                        <div className="w-5 h-5 shrink-0" aria-hidden="true" />
                    </div>
                    <div className="flex items-center justify-center px-1 min-w-0" />
                    <div className="flex items-center pr-1.5">
                        {onOpenToolbar && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onOpenToolbar(e);
                                }}
                                className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-opacity opacity-0 group-hover:opacity-100"
                                style={{ color: stripIconColor }}
                                title="Edit"
                            >
                                <Edit2 className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>

                <div className="pointer-events-none select-none flex h-[calc(100%-22px)] flex-col items-center justify-center gap-2 px-4 py-3">
                    <div
                        className="flex h-32 w-32 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: iconBgColor }}
                    >
                        <img src={svgUrl} alt="" className="h-28 w-28 object-contain" />
                    </div>
                    {title ? (
                        <div className="text-center text-xs font-semibold" style={{ color: textColor }}>
                            {title}
                        </div>
                    ) : null}
                    <div className="text-[10px] text-gray-600">{calculateCounter()}</div>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={onClick}
            className={`group relative h-full rounded-xl border transition-colors ${isSelected ? 'border-blue-500 ring-2 ring-blue-100 shadow-md' : 'border-gray-200'
                }`}
            style={{ backgroundColor: cardBgColor }}
        >
            {/* Edit Button */}
            {onOpenToolbar && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onOpenToolbar(e);
                    }}
                    className={`absolute top-1 right-1 p-1.5 text-gray-500 bg-white/90 hover:bg-white hover:text-gray-800 rounded-full shadow-sm border border-gray-200/70 z-30 transition-all opacity-0 group-hover:opacity-100 ${isSelected ? 'opacity-100' : ''}`}
                >
                    <Edit2 className="w-4 h-4" />
                </button>
            )}

            {showTopStrip && (
                <div
                    className="absolute left-0 top-0 h-1 w-full rounded-t-xl"
                    style={{ backgroundColor: topStripColor }}
                />
            )}

            <div className="pointer-events-none select-none flex h-full flex-col items-center justify-center gap-2 px-4 pb-4 pt-6">
                <div
                    className="flex h-32 w-32 items-center justify-center rounded-2xl shadow-inner"
                    style={{ backgroundColor: iconBgColor }}
                >
                    <div className="h-28 w-28 rounded-md bg-gray-200" />
                </div>

                {title ? (
                    <div className="text-center text-xs font-semibold" style={{ color: textColor }}>
                        {title}
                    </div>
                ) : null}

                <div className="text-[10px] text-gray-600">{calculateCounter()}</div>
            </div>

            {/* Reactions (if any) */}
            {reactions.length > 0 && (
                <div className="absolute bottom-2 left-2 flex flex-wrap gap-1 z-10">
                    <ReactionDisplay
                        reactions={reactions}
                        onAddClick={onAddReaction}
                        onReactionClick={onReactionClick}
                    />
                </div>
            )}
        </div>
    );
}
