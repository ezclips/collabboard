import React from 'react';
import DOMPurify from 'dompurify';
import { Padlet } from '@/types/collabboard';
import { resolveCaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { decodeHtmlEntities } from '@/lib/html-utils';
import { Edit2 } from 'lucide-react';
import ReactionDisplay from './editors/ReactionDisplay';
import DocumentCardContent from './DocumentCardContent';

interface CardPreviewProps {
    padlet: Padlet;
    isSelected: boolean;
    onClick?: () => void;
    onOpenToolbar?: (e: React.MouseEvent) => void;
    onEditContent?: () => void;
    onReadDocument?: () => void; // PATCH-149B1b-iii §27.4: opt-in Read affordance
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
    onEditContent,
    onReadDocument,
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
    const titleStyle = resolveCaptionStyle(metadata?.captionStyle, metadata?.textColor);
    const showTopStrip = !!topStripColor && topStripColor !== 'transparent';
    const isClipartCard = !!svgUrl;
    const stripBg = showTopStrip ? topStripColor : 'rgba(0,0,0,0.04)';
    const stripIconColor = showTopStrip ? '#f3f4f6' : '#9ca3af';
    // PATCH-152 targeted correction: Document is a plain-text card, not an
    // icon/image card -- sanitize the same way PostCardContent's Document
    // branch does, guarded for the SSR/plain-Node render path this component
    // is also exercised under (DOMPurify has no window there).
    const sanitizedDocumentContent =
        typeof window !== 'undefined' ? DOMPurify.sanitize(decodeHtmlEntities(content || '')) : '';

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
                        {onEditContent ? (
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onEditContent(); }}
                                className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-opacity opacity-0 group-hover:opacity-100"
                                style={{ color: stripIconColor }}
                                aria-label="Open card"
                            >
                                <Edit2 className="w-3 h-3" />
                            </button>
                        ) : (
                            <div className="w-5 h-5 shrink-0" aria-hidden="true" />
                        )}
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
                        <div className="text-center text-xs font-semibold" style={titleStyle}>
                            {title}
                        </div>
                    ) : null}
                    <div className="text-[10px] text-gray-600">{calculateCounter()}</div>
                </div>

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

    return (
        <div
            onClick={onClick}
            className={`group relative h-full overflow-hidden transition-colors flex flex-col ${isSelected ? 'ring-2 ring-blue-500 ring-offset-2' : ''}`}
            style={{ backgroundColor: cardBgColor, boxShadow: 'inset 0 0 0 1px #e5e7eb' }}
        >
            {/* Note-style square-corner chrome: a gray title bar (same strip
                structure as the Clipart branch) holding the title text, edit
                controls in its left/right slots -- no rounded corners, no
                floating overlay buttons. Outline drawn as an inset box-shadow
                rather than a stroked `border` -- under this canvas's zoom/pan
                CSS transform a 1px stroked border can land on a fractional
                device pixel and anti-alias away on some edges while staying
                crisp on others (a hairline-border-under-transform artifact);
                an inset shadow is a filled region rather than a stroked line
                and does not suffer that same edge-dependent disappearance. */}
            <div
                className="w-full flex-shrink-0 grid"
                style={{ gridTemplateColumns: 'auto 1fr auto', minHeight: '22px', backgroundColor: stripBg }}
            >
                <div className="flex items-center pl-1.5">
                    {onEditContent ? (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onEditContent(); }}
                            className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-opacity opacity-0 group-hover:opacity-100"
                            style={{ color: stripIconColor }}
                            aria-label="Open card"
                        >
                            <Edit2 className="w-3 h-3" />
                        </button>
                    ) : (
                        <div className="w-5 h-5 shrink-0" aria-hidden="true" />
                    )}
                </div>
                <div className="flex items-center justify-center px-1 min-w-0">
                    {title ? (
                        <span className="text-xs font-semibold text-center truncate" style={titleStyle}>
                            {title}
                        </span>
                    ) : null}
                </div>
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

            {/* Body: clamped Document text preview; Read overlays the bottom
                half of the text only once it overflows (DocumentCardContent
                owns that gating -- same button already used everywhere else). */}
            <div className="relative flex-1 min-h-0 overflow-hidden p-2">
                <DocumentCardContent content={sanitizedDocumentContent} textColor={metadata?.textColor} onRead={onReadDocument} />
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
