"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { X, Save, CircleHelp, Move, ZoomIn, Palette, Type, Smile, MessageSquare, TextCursor } from 'lucide-react';
import { getExcalidrawLibrary } from '@/lib/collabboard/excalidrawLibrary';
import { CardColorPanel } from './CardColorPanel';
import TextStylePopup from './TextStylePopup';
import EmojiReactionPicker from './EmojiReactionPicker';
import CommentPopup from './CommentPopup';
import ReactionDisplay from './ReactionDisplay';
import InlineCaption from './InlineCaption';
import { resolveCaptionStyle, CAPTION_STYLE_PRESETS, type CaptionHeading } from '@/lib/domain/canvas/captionStyle';
import { nextTextAlign } from './textAlignCycle';
import { getMeaningfulTitle } from '@/lib/infra/collabboard/postTitle';

// Dynamically import the wrapper that contains all Excalidraw-specific code
// This is necessary to prevent "window is not defined" errors during SSR
const ExcalidrawWrapper = dynamic(
    () => import('./ExcalidrawWrapper'),
    { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400">Loading editor...</div> }
);

interface DrawingEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        drawingData: string;
        drawingAppState: string;
        drawingFiles: string; // JSON serialized binary files
        previewUrl?: string;
        title?: string;
        metadata?: Record<string, unknown>;
    }) => void;
    initialData?: {
        drawingData?: string;
        drawingAppState?: string;
        drawingFiles?: string;
    };
    initialTitle?: string;
    initialMetadata?: Record<string, unknown>;
    readOnly?: boolean;
}

type CommentDraft = {
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    textColor?: string;
    backgroundColor?: string;
};

export default function DrawingEditor({
    isOpen,
    onClose,
    onSave,
    initialData,
    initialTitle = '',
    initialMetadata,
    readOnly = false,
}: DrawingEditorProps) {
    // Use refs to store current state without causing re-renders
    const elementsRef = useRef<any[]>([]);
    const appStateRef = useRef<any>(null);
    const filesRef = useRef<any>({});
    const helpRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    // Track if initial data has been loaded
    const [initialElements, setInitialElements] = useState<any[]>([]);
    const [initialAppState, setInitialAppState] = useState<any>(null);
    const [initialFiles, setInitialFiles] = useState<any>(null);
    const [libraryItems, setLibraryItems] = useState<any[]>([]); // New state
    const [key, setKey] = useState(0);
    const [showHelp, setShowHelp] = useState(false);

    // Post customization: title + the same color/style/reaction/comment/caption
    // metadata every other post type supports, entered via the left toolbar
    // and saved together with the drawing on Save Changes.
    const [title, setTitle] = useState(initialTitle);
    const [cardColor, setCardColor] = useState('#ffffff');
    const [topStrip, setTopStrip] = useState('transparent');
    const [titleStyle, setTitleStyle] = useState<Record<string, any>>({});
    const [reactions, setReactions] = useState<string[]>([]);
    const [detachedComments, setDetachedComments] = useState<CommentDraft[]>([]);
    const [badgeColor, setBadgeColor] = useState('#facc15');
    const [caption, setCaption] = useState('');
    const [captionStyle, setCaptionStyle] = useState<Record<string, any>>({});
    // The single Text style button doubles up: it either styles the post's
    // own title (default) or, when the caption field has focus, the
    // caption's own text -- no second style button/popup duplicated.
    const [activeStyleTarget, setActiveStyleTarget] = useState<'title' | 'caption'>('title');

    const [isTextStyleOpen, setIsTextStyleOpen] = useState(false);
    const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
    const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
    const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);
    const [isCaptionEditing, setIsCaptionEditing] = useState(false);
    // Shared position for every popup that detaches from the toolbar (Text
    // style, Color, Reaction, Comment) -- only one is ever open at a time, so
    // one position is enough, computed fresh each time one opens. Anchored
    // via `right` (distance from the viewport's right edge) rather than
    // `left` so it hugs the modal's right side and overlaps the Excalidraw
    // canvas instead of risking overflow off-screen -- the modal spans
    // almost the full viewport width here, unlike the other editors' fixed
    // narrower panels.
    const [detachedPopupPos, setDetachedPopupPos] = useState<{ right: number; top: number } | null>(null);

    const togglePanel = (panel: 'text' | 'color' | 'reaction' | 'comment' | 'caption') => {
        setIsTextStyleOpen((prev) => (panel === 'text' ? !prev : false));
        setIsColorPanelOpen((prev) => (panel === 'color' ? !prev : false));
        setIsReactionPickerOpen((prev) => (panel === 'reaction' ? !prev : false));
        setIsCommentPanelOpen((prev) => (panel === 'comment' ? !prev : false));
        setIsCaptionEditing((prev) => (panel === 'caption' ? !prev : false));
    };

    const openDetachedPanel = (panel: 'text' | 'color' | 'reaction' | 'comment', isCurrentlyOpen: boolean) => {
        const opening = !isCurrentlyOpen;
        togglePanel(panel);
        if (opening && modalRef.current) {
            const rect = modalRef.current.getBoundingClientRect();
            setDetachedPopupPos({ right: window.innerWidth - rect.right, top: rect.top });
        }
    };

    // Highlighting text in the title or caption should open the Text style
    // panel targeting whichever field was highlighted, without toggling an
    // already-open panel closed (openDetachedPanel toggles on `!prev`, so
    // calling it while already open would close it instead of just
    // retargeting -- only call it to OPEN, and only update the target when
    // it's already open).
    const openTextStyleFor = (target: 'title' | 'caption') => {
        setActiveStyleTarget(target);
        if (!isTextStyleOpen) openDetachedPanel('text', isTextStyleOpen);
    };

    const isTitleBold = titleStyle.fontWeight === '700' || titleStyle.fontWeight === 'bold';
    const isTitleItalic = titleStyle.fontStyle === 'italic';
    const toggleTitleBold = () => setTitleStyle((prev) => ({ ...prev, fontWeight: isTitleBold ? '400' : '700' }));
    const toggleTitleItalic = () => setTitleStyle((prev) => ({ ...prev, fontStyle: isTitleItalic ? 'normal' : 'italic' }));
    const toggleTitleUnderline = () => setTitleStyle((prev) => ({ ...prev, underline: !prev.underline }));
    const toggleTitleStrikethrough = () => setTitleStyle((prev) => ({ ...prev, strikethrough: !prev.strikethrough }));
    const cycleTitleAlign = () => setTitleStyle((prev) => ({ ...prev, textAlign: nextTextAlign(prev.textAlign || 'left') }));
    const applyTitlePreset = (level: CaptionHeading) => {
        setTitleStyle((prev) => {
            const selectedPreset = level === 'callout' && prev.backgroundColor
                ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: prev.backgroundColor }
                : CAPTION_STYLE_PRESETS[level];
            return { ...prev, ...selectedPreset };
        });
    };

    const isCaptionBold = captionStyle.fontWeight === '700' || captionStyle.fontWeight === 'bold';
    const isCaptionItalic = captionStyle.fontStyle === 'italic';
    const toggleCaptionBold = () => setCaptionStyle((prev) => ({ ...prev, fontWeight: isCaptionBold ? '400' : '700' }));
    const toggleCaptionItalic = () => setCaptionStyle((prev) => ({ ...prev, fontStyle: isCaptionItalic ? 'normal' : 'italic' }));
    const toggleCaptionUnderline = () => setCaptionStyle((prev) => ({ ...prev, underline: !prev.underline }));
    const toggleCaptionStrikethrough = () => setCaptionStyle((prev) => ({ ...prev, strikethrough: !prev.strikethrough }));
    const cycleCaptionAlign = () => setCaptionStyle((prev) => ({ ...prev, textAlign: nextTextAlign(prev.textAlign || 'left') }));
    const applyCaptionPreset = (level: CaptionHeading) => {
        setCaptionStyle((prev) => {
            const selectedPreset = level === 'callout' && prev.backgroundColor
                ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: prev.backgroundColor }
                : CAPTION_STYLE_PRESETS[level];
            return { ...prev, ...selectedPreset };
        });
    };

    const commentCount = detachedComments.length;
    const titleInputStyle = resolveCaptionStyle(titleStyle, undefined);
    const captionInputStyle = resolveCaptionStyle(captionStyle, undefined);

    // Whichever text the Text style button currently targets -- the post's
    // own title, or (when focused) the caption -- resolved once so the
    // popup's props stay a simple pass-through below.
    const textStylePopupProps = activeStyleTarget === 'caption'
        ? {
            onSelectHeading: applyCaptionPreset,
            onSelectColor: (color: string) => setCaptionStyle((prev) => ({ ...prev, color })),
            onSelectHighlight: (color: string) => setCaptionStyle((prev) => ({ ...prev, backgroundColor: color })),
            currentHeading: captionStyle.heading || 'normal',
            currentColor: captionStyle.color,
            currentHighlight: captionStyle.backgroundColor,
            onBold: toggleCaptionBold,
            onItalic: toggleCaptionItalic,
            onUnderline: toggleCaptionUnderline,
            onStrikethrough: toggleCaptionStrikethrough,
            onAlign: cycleCaptionAlign,
            isBold: isCaptionBold,
            isItalic: isCaptionItalic,
            isUnderline: !!captionStyle.underline,
            isStrikethrough: !!captionStyle.strikethrough,
        }
        : {
            onSelectHeading: applyTitlePreset,
            onSelectColor: (color: string) => setTitleStyle((prev) => ({ ...prev, color })),
            onSelectHighlight: (color: string) => setTitleStyle((prev) => ({ ...prev, backgroundColor: color })),
            currentHeading: titleStyle.heading || 'normal',
            currentColor: titleStyle.color,
            currentHighlight: titleStyle.backgroundColor,
            onBold: toggleTitleBold,
            onItalic: toggleTitleItalic,
            onUnderline: toggleTitleUnderline,
            onStrikethrough: toggleTitleStrikethrough,
            onAlign: cycleTitleAlign,
            isBold: isTitleBold,
            isItalic: isTitleItalic,
            isUnderline: !!titleStyle.underline,
            isStrikethrough: !!titleStyle.strikethrough,
        };

    // Parse initial data only when opening
    useEffect(() => {
        if (isOpen) {
            let elements: any[] = [];
            let appState: any = null;
            let files: any = {};

            // Load Excalidraw Community Library items
            const communityItems = getExcalidrawLibrary();
            // Flatten the nested elements structure for Excalidraw
            const flattenedLibrary = communityItems.flatMap(item =>
                item.elements.map(el => ({
                    ...el,
                    // Optional: add some metadata to help identify source
                    metadata: { ...el.metadata, source: item.name }
                }))
            );
            setLibraryItems(flattenedLibrary);

            if (initialData?.drawingData) {
                try {
                    elements = JSON.parse(initialData.drawingData);
                    if (initialData.drawingAppState) {
                        const parsedState = JSON.parse(initialData.drawingAppState);
                        // Sanitize appState: remove collaborators to avoid Map vs Object issues
                        // and unwanted session data
                        const { collaborators, ...rest } = parsedState;
                        appState = rest;
                    }
                    if (initialData.drawingFiles) {
                        try {
                            files = JSON.parse(initialData.drawingFiles);
                        } catch (e) {
                            console.error("Failed to parse initial drawing files", e);
                        }
                    }
                } catch (e) {
                    console.error("Failed to parse initial drawing data", e);
                }
            }

            elementsRef.current = elements;
            appStateRef.current = appState;
            filesRef.current = files;
            setInitialElements(elements);
            setInitialAppState(appState);
            setInitialFiles(files);
            setKey(prev => prev + 1);

            setTitle(initialTitle);
            setCardColor(typeof initialMetadata?.cardColor === 'string' ? initialMetadata.cardColor : '#ffffff');
            setTopStrip(typeof initialMetadata?.topStrip === 'string' ? initialMetadata.topStrip : 'transparent');
            setTitleStyle((initialMetadata?.titleStyle as Record<string, unknown>) || {});
            setReactions(Array.isArray(initialMetadata?.reactions) ? initialMetadata.reactions as string[] : []);
            setDetachedComments(Array.isArray(initialMetadata?.detachedComments) ? initialMetadata.detachedComments as CommentDraft[] : []);
            setBadgeColor(typeof initialMetadata?.badgeColor === 'string' ? initialMetadata.badgeColor : '#facc15');
            setCaption(typeof initialMetadata?.caption === 'string' ? initialMetadata.caption : '');
            setCaptionStyle((initialMetadata?.captionStyle as Record<string, unknown>) || {});
            setIsTextStyleOpen(false);
            setIsColorPanelOpen(false);
            setIsReactionPickerOpen(false);
            setIsCommentPanelOpen(false);
            setIsCaptionEditing(false);
            setActiveStyleTarget('title');
            setDetachedPopupPos(null);
        }
    }, [isOpen, initialData?.drawingData, initialData?.drawingAppState, initialData?.drawingFiles, initialTitle, initialMetadata]);

    // Memoized onChange handler that only updates refs
    const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
        elementsRef.current = elements.filter(el => !el.isDeleted);
        appStateRef.current = appState;
        filesRef.current = files;
    }, []);

    const handleSaveAndClose = async () => {
        let previewUrl = "";
        const elements = elementsRef.current;
        const appState = appStateRef.current;
        const files = filesRef.current;

        try {
            if (elements.length > 0) {
                // Dynamically import exportToSvg only on the client
                const { exportToSvg } = await import("@excalidraw/excalidraw");

                const svg = await exportToSvg({
                    elements: elements,
                    appState: {
                        ...appState,
                        exportWithDarkMode: false,
                        exportBackground: true,
                        viewBackgroundColor: "#ffffff",
                    },
                    files: files,
                });

                const svgString = new XMLSerializer().serializeToString(svg);
                previewUrl = `data:image/svg+xml;base64,${btoa(svgString)}`;
            }
        } catch (e) {
            console.error("Failed to generate drawing preview", e);
        }

        onSave({
            drawingData: JSON.stringify(elements),
            drawingAppState: JSON.stringify(appState),
            drawingFiles: JSON.stringify(files),
            previewUrl,
            title: title.trim() || undefined,
            metadata: {
                cardColor,
                topStrip,
                titleStyle,
                reactions,
                detachedComments,
                badgeColor,
                caption,
                captionStyle,
            },
        });
        onClose();
    };

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleSaveAndClose();
        }
    };

    // Close help when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showHelp && helpRef.current && !helpRef.current.contains(event.target as Node)) {
                setShowHelp(false);
            }
        };

        if (showHelp) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showHelp]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
            onClick={handleOverlayClick}
        >
            <div className="flex w-[90vw] items-start gap-6" onClick={(e) => e.stopPropagation()}>
                {/* Left toolbar -- Text style/Color/Reaction/Comment/Caption, same
                    detached-vertical-icon-strip placement every other post type
                    (Note, Image, AI Component) uses, instead of buttons crowded
                    into the header row. */}
                {!readOnly && (
                    <div className="flex shrink-0 flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white p-2 shadow-xl">
                        <div className="flex shrink-0 flex-col items-center">
                            <button
                                type="button"
                                onClick={() => openDetachedPanel('text', isTextStyleOpen)}
                                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isTextStyleOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                                title={activeStyleTarget === 'caption' ? 'Text style (Caption text)' : 'Text style'}
                            >
                                <Type className="h-5 w-5" />
                            </button>
                            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Text style</span>
                            {isTextStyleOpen && detachedPopupPos && createPortal(
                                <div
                                    className="fixed z-[1100] min-w-[240px] rounded-lg border border-gray-200 bg-white p-3 shadow-xl"
                                    style={{ right: detachedPopupPos.right, top: detachedPopupPos.top }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <button
                                        onClick={() => setIsTextStyleOpen(false)}
                                        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                                        title="Close"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                    <TextStylePopup
                                        isOpen={isTextStyleOpen}
                                        onOpenChange={setIsTextStyleOpen}
                                        hideCloseButton
                                        {...textStylePopupProps}
                                    />
                                </div>,
                                document.body,
                            )}
                        </div>

                        <div className="flex shrink-0 flex-col items-center">
                            <button
                                type="button"
                                onClick={() => openDetachedPanel('color', isColorPanelOpen)}
                                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isColorPanelOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                                title="Color"
                            >
                                <Palette className="h-5 w-5" />
                            </button>
                            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Color</span>
                            {isColorPanelOpen && detachedPopupPos && createPortal(
                                <div
                                    className="fixed z-[1100]"
                                    style={{ right: detachedPopupPos.right, top: detachedPopupPos.top }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <CardColorPanel
                                        bgColor={cardColor}
                                        topStrip={topStrip}
                                        tabs={['bg', 'ts']}
                                        onChangeTarget={(target, value) => {
                                            if (target === 'bg') setCardColor(value);
                                            if (target === 'ts') setTopStrip(value);
                                        }}
                                        onClose={() => setIsColorPanelOpen(false)}
                                    />
                                </div>,
                                document.body,
                            )}
                        </div>

                        <div className="flex shrink-0 flex-col items-center">
                            <button
                                type="button"
                                onClick={() => openDetachedPanel('reaction', isReactionPickerOpen)}
                                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isReactionPickerOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                                title="Reaction"
                            >
                                <Smile className="h-5 w-5" />
                            </button>
                            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Reaction</span>
                            {isReactionPickerOpen && detachedPopupPos && createPortal(
                                <div
                                    className="fixed z-[1100]"
                                    style={{ right: detachedPopupPos.right, top: detachedPopupPos.top }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <EmojiReactionPicker
                                        isOpen={isReactionPickerOpen}
                                        onOpenChange={setIsReactionPickerOpen}
                                        onSelectEmoji={(emoji) => {
                                            setReactions((prev) => [...prev, emoji]);
                                            setIsReactionPickerOpen(false);
                                        }}
                                        inline
                                    />
                                </div>,
                                document.body,
                            )}
                        </div>

                        <div className="relative flex shrink-0 flex-col items-center">
                            <button
                                type="button"
                                onClick={() => openDetachedPanel('comment', isCommentPanelOpen)}
                                className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isCommentPanelOpen ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                                title="Comment"
                            >
                                <MessageSquare className="h-5 w-5" />
                                {commentCount > 0 && (
                                    <span
                                        className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-gray-800"
                                        style={{ backgroundColor: badgeColor }}
                                    >
                                        {commentCount}
                                    </span>
                                )}
                            </button>
                            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Comment</span>
                            {isCommentPanelOpen && detachedPopupPos && createPortal(
                                <div
                                    className="fixed z-[1100]"
                                    style={{ right: detachedPopupPos.right, top: detachedPopupPos.top }}
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <CommentPopup
                                        isOpen={isCommentPanelOpen}
                                        onOpenChange={setIsCommentPanelOpen}
                                        onSubmit={(commentText) => {
                                            setDetachedComments((prev) => [...prev, {
                                                id: `comment-${Date.now()}`,
                                                text: commentText,
                                                userId: 'anon',
                                                userName: 'You',
                                                timestamp: Date.now(),
                                            }]);
                                        }}
                                        onCommentColor={(commentId, textColor, backgroundColor) => {
                                            setDetachedComments((prev) =>
                                                prev.map((c) => (c.id === commentId ? { ...c, textColor, backgroundColor } : c))
                                            );
                                        }}
                                        comments={detachedComments}
                                        currentUserId="anon"
                                        currentUserName="You"
                                        badgeColor={badgeColor}
                                        onBadgeColorChange={setBadgeColor}
                                    />
                                </div>,
                                document.body,
                            )}
                        </div>

                        <div className="flex shrink-0 flex-col items-center">
                            <button
                                type="button"
                                onClick={() => togglePanel('caption')}
                                className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${isCaptionEditing ? 'bg-blue-100 text-blue-600' : 'text-gray-600 hover:bg-gray-100'}`}
                                title="Caption (shown below the drawing)"
                            >
                                <TextCursor className="h-5 w-5" />
                            </button>
                            <span className="mt-1 text-center text-[9px] leading-none text-gray-500">Caption</span>
                        </div>
                    </div>
                )}

                <div className="relative flex h-[90vh] min-w-0 flex-1 flex-col">
                    <button
                        onClick={onClose}
                        className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                        title="Close"
                    >
                        <X className="h-3.5 w-3.5" />
                    </button>
                    <div
                        ref={modalRef}
                        className="flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
                    >
                    {/* Header toolbar */}
                    <div className="flex items-center justify-between px-6 py-3 border-b bg-gray-50">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center text-red-600 shrink-0">
                                <svg
                                    width="20"
                                    height="20"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M12 19l7-7 3 3-7 7-3-3z"></path>
                                    <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path>
                                    <path d="M2 2l7.5 1.5"></path>
                                    <path d="M7 11l5-5"></path>
                                </svg>
                            </div>
                            {readOnly ? (
                                <h2 className="text-lg font-semibold text-gray-800 truncate">
                                    {title || "View Drawing"}
                                </h2>
                            ) : (
                                <input
                                    type="text"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    onFocus={() => setActiveStyleTarget('title')}
                                    onSelect={(e) => {
                                        const el = e.currentTarget;
                                        if (el.selectionStart !== el.selectionEnd) openTextStyleFor('title');
                                    }}
                                    placeholder="Title"
                                    className="flex-1 min-w-0 truncate bg-transparent text-lg font-semibold text-gray-800 outline-none border-none placeholder:text-gray-400 placeholder:font-normal"
                                    style={titleInputStyle}
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            {!readOnly && (
                                <button
                                    onClick={handleSaveAndClose}
                                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                                >
                                    <Save size={18} />
                                    Save Changes
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Custom Help Dialog for View Mode */}
                    {readOnly && showHelp && (
                        <div ref={helpRef} className="absolute top-[60px] left-[70px] z-[50] w-96 max-h-[70vh] bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 flex flex-col">
                            <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50 flex-shrink-0">
                                <h3 className="font-semibold text-gray-800 text-base">View</h3>
                                <button onClick={() => setShowHelp(false)} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="p-4 space-y-1 text-sm text-gray-600 overflow-y-auto custom-scrollbar">
                                {/* Shortcut Rows */}
                                {[
                                    { label: "Zoom in", keys: ["Ctrl", "+"] },
                                    { label: "Zoom out", keys: ["Ctrl", "-"] },
                                    { label: "Reset zoom", keys: ["Ctrl", "0"] },
                                    { label: "Zoom to fit all elements", keys: ["Shift", "1"] },
                                    { label: "Zoom to selection", keys: ["Shift", "2"] },
                                    { label: "Move page up/down", keys: ["PgUp/PgDn"] },
                                    { label: "Move page left/right", keys: ["Shift", "PgUp/PgDn"] },
                                    { label: "Zen mode", keys: ["Alt", "Z"] },
                                    { label: "Snap to objects", keys: ["Alt", "S"] },
                                    { label: "Toggle grid", keys: ["Ctrl", "'"] },
                                    { label: "View mode", keys: ["Alt", "R"] },
                                    { label: "Toggle light/dark theme", keys: ["Alt", "Shift", "D"] },
                                    { label: "Canvas & Shape properties", keys: ["Alt", "/"] },
                                    { label: "Find on canvas", keys: ["Ctrl", "F"] },
                                    { label: "Command palette", keys: ["Ctrl", "/"], altKeys: ["Ctrl", "Shift", "P"] },
                                ].map((item, idx) => (
                                    <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 px-1 rounded transition-colors group">
                                        <span className="text-gray-700 group-hover:text-gray-900">{item.label}</span>
                                        <div className="flex items-center gap-1.5 flex-wrap justify-end">
                                            {item.keys.map((k, kIdx) => (
                                                <kbd key={kIdx} className="px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-gray-600 font-sans min-w-[28px] text-center shadow-sm">
                                                    {k}
                                                </kbd>
                                            ))}
                                            {item.altKeys && (
                                                <>
                                                    <span className="text-[10px] text-gray-300 mx-0.5">or</span>
                                                    {item.altKeys.map((k, kIdx) => (
                                                        <kbd key={kIdx} className="px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs text-gray-600 font-sans min-w-[28px] text-center shadow-sm">
                                                            {k}
                                                        </kbd>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400 text-center flex-shrink-0">
                                Keyboard shortcuts for viewing mode
                            </div>
                        </div>
                    )}

                    {/* Excalidraw Container */}
                    <div className="flex-1 relative bg-gray-50">
                        <div className="absolute inset-0">
                            <ExcalidrawWrapper
                                excalidrawKey={key}
                                initialData={{
                                    elements: initialElements,
                                    appState: {
                                        ...initialAppState,
                                        viewBackgroundColor: "#ffffff",
                                        theme: "light",
                                    },
                                    files: initialFiles,
                                    scrollToContent: true,
                                    libraryItems: libraryItems,
                                }}
                                onChange={handleChange}
                                readOnly={readOnly}
                                onShowHelp={() => setShowHelp(true)}
                                useCollabBoardContextMenu
                            />
                        </div>
                    </div>

                    {/* Reactions + Caption -- same bottom section every other
                        post type (Image, AI Component) shows below its content,
                        driven by the left toolbar's Reaction/Caption buttons. */}
                    {(reactions.length > 0 || !readOnly || caption) && (
                        <div className="shrink-0 border-t bg-white px-4 py-2">
                            {reactions.length > 0 && (
                                <div className="pb-1">
                                    <ReactionDisplay
                                        reactions={reactions}
                                        onAddClick={!readOnly ? () => openDetachedPanel('reaction', isReactionPickerOpen) : undefined}
                                        onReactionClick={!readOnly ? (emoji) => {
                                            setReactions((prev) => {
                                                const index = prev.indexOf(emoji);
                                                if (index === -1) return prev;
                                                return [...prev.slice(0, index), ...prev.slice(index + 1)];
                                            });
                                        } : undefined}
                                    />
                                </div>
                            )}
                            {(!readOnly || caption) && (
                                <InlineCaption
                                    value={caption}
                                    isEditing={!readOnly && isCaptionEditing}
                                    onChange={setCaption}
                                    onCommit={() => setIsCaptionEditing(false)}
                                    onFocus={() => setActiveStyleTarget('caption')}
                                    onTextSelect={() => openTextStyleFor('caption')}
                                    placeholder="Add a caption..."
                                    color={captionInputStyle.color}
                                    backgroundColor={captionInputStyle.backgroundColor}
                                    textStyle={captionInputStyle}
                                />
                            )}
                        </div>
                    )}

                    {readOnly && (
                        <style>{`
                            /* Hide the Help button in read-only mode - comprehensive selectors */
                            .excalidraw button[aria-label="Help"],
                            .excalidraw button[title="Help"],
                            .excalidraw .HelpButton,
                            .excalidraw [class*="HelpButton"],
                            .excalidraw .help-icon,
                            .excalidraw .App-menu .dropdown-menu-button[aria-label="Help"],
                            .excalidraw .layer-ui__wrapper button[aria-label="Help"],
                            .excalidraw .App-bottom-bar button:last-child,
                            .excalidraw .island button[aria-label="Help"] {
                                display: none !important;
                            }
                            /* Hide the Help dialog/modal entirely */
                            .excalidraw .HelpDialog,
                            .excalidraw [class*="HelpDialog"],
                            .excalidraw .Modal[aria-label*="Help"],
                            .excalidraw .Dialog--HelpDialog,
                            .excalidraw .Modal--HelpDialog,
                            .excalidraw div[role="dialog"][aria-label*="help" i],
                            .excalidraw div[role="dialog"][aria-label*="Help"],
                            .excalidraw .layer-ui__wrapper .Modal {
                                display: none !important;
                            }
                        `}</style>
                    )}

                    {/* Footer info */}
                    <div className="px-6 py-2 border-t bg-gray-50 text-xs text-gray-400 flex justify-between items-center">
                        <span>
                            {readOnly
                                ? "Scroll/Pinch to zoom • Drag to pan"
                                : "Changes are saved locally until you click Save"
                            }
                        </span>
                    </div>
                </div>
                </div>
            </div>
        </div>
    );
}
