import React from 'react';
import DOMPurify from 'dompurify';
import { Padlet } from '@/types/collabboard';
import { resolveCaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { decodeHtmlEntities } from '@/lib/html-utils';
import { Edit2 } from 'lucide-react';
import ReactionDisplay from './editors/ReactionDisplay';
import DocumentCardContent from './DocumentCardContent';
import { getMeaningfulTitle } from '@/lib/infra/collabboard/postTitle';

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
    hideTitle?: boolean;
    // "Full view": drops the entire top strip (title, edit buttons) and the
    // outer border -- not just the title text hideTitle alone would leave
    // the strip's background/buttons in place. Right-click "Full View".
    hideFrame?: boolean;
    // Overrides the strip's title slot with a live editable control --
    // ClipartCardDraftModal uses this to put a real "Post name" input
    // directly in the gray strip, the same place every other post type's
    // title lives, instead of a separate field elsewhere that only looked
    // like an unrelated caption.
    titleEditor?: React.ReactNode;
    // Overrides the Clipart branch's caption slot (below reactions) with a
    // live editable control, same override pattern as titleEditor -- lets
    // ClipartCardDraftModal put a real caption text field there instead of
    // this read-only paragraph.
    captionEditor?: React.ReactNode;
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
    onReactionClick,
    hideTitle = false,
    hideFrame = false,
    titleEditor,
    captionEditor
}: CardPreviewProps) {
    const { metadata, title, content } = padlet;
    const iconBgColor = metadata?.iconBgColor || '#f8f9fa'; // Small square behind icon (Tab 1: "Icon")
    const cardBgColor = metadata?.backgroundColor || '#ffffff'; // Outer card background (Tab 2: "Icon BG")
    const svgUrl = metadata?.svgUrl;
    const topStripColor = metadata?.topStripColor || '#4f46e5'; // Top strip (Tab 3: "Icon Strip")
    const titleStyle = resolveCaptionStyle(metadata?.titleStyle, metadata?.textColor);
    // The Clipart branch's caption (the text below reactions, metadata.caption)
    // has always been a field distinct from the title -- but until this fix it
    // was rendered with the SAME titleStyle object, so changing the title's
    // color/weight via the editor's Text style panel silently changed the
    // caption's too. metadata.captionStyle is now the caption's own style,
    // independent of metadata.titleStyle (see ClipartCardDraftModal.tsx).
    const captionStyle = resolveCaptionStyle(metadata?.captionStyle, metadata?.textColor);
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
    // Placeholder-aware title, matching Note/Comment's own top-strip bar --
    // a legacy default like "New Post" reads as unset, not a real title.
    const documentTitle = getMeaningfulTitle(title, 'card');

    if (isClipartCard) {
        return (
            <div
                onClick={onClick}
                className={`group relative h-full flex flex-col ${hideFrame ? '' : 'border'} overflow-hidden transition-colors ${hideFrame ? '' : (isSelected ? 'border-blue-500 ring-2 ring-blue-100 shadow-md' : 'border-gray-200')}`}
                style={{ backgroundColor: hideFrame ? 'transparent' : cardBgColor }}
                // The icon <img> below inherits pointer-events-none from its
                // wrapper, but preventDefault on dragstart here too so a
                // press-and-drag anywhere on this card can never be hijacked
                // by the browser's native image drag (see the same guard in
                // FreeformPadletCards' shared content wrapper).
                onDragStart={(e) => e.preventDefault()}
            >
                {!hideFrame && (
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
                        {titleEditor ? titleEditor : (!hideTitle && (
                            <span
                                className={`text-xs font-semibold text-center truncate${documentTitle ? '' : ' opacity-40 select-none'}`}
                                style={titleStyle}
                            >
                                {documentTitle || 'Title'}
                            </span>
                        ))}
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
                )}

                {/* flex-1 min-h-0 (not the old fixed h-[calc(100%-22px)]), so
                    this icon block only claims whatever height is left over
                    after the title strip, reactions, and caption -- it used
                    to claim the ENTIRE remaining card height by itself,
                    pushing reactions/caption below the card's visible,
                    overflow-hidden bounds regardless of whether they had
                    any content to show. */}
                <div className="pointer-events-none select-none flex flex-1 min-h-0 flex-col items-center justify-center gap-2 px-4 py-3">
                    <div
                        className="flex h-32 w-32 items-center justify-center rounded-2xl"
                        style={{ backgroundColor: iconBgColor }}
                    >
                        <img src={svgUrl} alt="" className="h-28 w-28 object-contain" />
                    </div>
                </div>

                {reactions.length > 0 && (
                    <div className="flex flex-shrink-0 flex-wrap items-center gap-1 px-4 pt-1">
                        <ReactionDisplay
                            reactions={reactions}
                            onAddClick={onAddReaction}
                            onReactionClick={onReactionClick}
                        />
                    </div>
                )}

                {(captionEditor || padlet.metadata?.caption) && (
                    <div className="flex-shrink-0 pb-2 pt-1">
                        {captionEditor ? captionEditor : (
                            <p className="px-4 text-xs text-gray-600 break-words" style={captionStyle}>
                                {padlet.metadata?.caption}
                            </p>
                        )}
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
                    <span
                        className={`text-xs font-semibold text-center truncate${documentTitle ? '' : ' opacity-40 select-none'}`}
                        style={titleStyle}
                    >
                        {documentTitle || 'Title'}
                    </span>
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
