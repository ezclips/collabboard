"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, Save, CircleHelp, Move, ZoomIn, Palette, TextCursor, Smile, MessageSquare } from 'lucide-react';
import { getExcalidrawLibrary } from '@/lib/collabboard/excalidrawLibrary';
import { CardColorPanel } from './CardColorPanel';
import TextStylePopup from './TextStylePopup';
import EmojiReactionPicker from './EmojiReactionPicker';
import CommentPopup from './CommentPopup';
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

    // Track if initial data has been loaded
    const [initialElements, setInitialElements] = useState<any[]>([]);
    const [initialAppState, setInitialAppState] = useState<any>(null);
    const [initialFiles, setInitialFiles] = useState<any>(null);
    const [libraryItems, setLibraryItems] = useState<any[]>([]); // New state
    const [key, setKey] = useState(0);
    const [showHelp, setShowHelp] = useState(false);

    // Post customization: title + the same color/style/reaction/comment
    // metadata every other post type supports, entered directly in the
    // header strip -- saved together with the drawing on Save Changes.
    const [title, setTitle] = useState(initialTitle);
    const [cardColor, setCardColor] = useState('#ffffff');
    const [topStrip, setTopStrip] = useState('transparent');
    const [captionStyle, setCaptionStyle] = useState<Record<string, any>>({});
    const [reactions, setReactions] = useState<string[]>([]);
    const [detachedComments, setDetachedComments] = useState<CommentDraft[]>([]);
    const [badgeColor, setBadgeColor] = useState('#facc15');

    const [isTextStyleOpen, setIsTextStyleOpen] = useState(false);
    const [isColorPanelOpen, setIsColorPanelOpen] = useState(false);
    const [isReactionPickerOpen, setIsReactionPickerOpen] = useState(false);
    const [isCommentPanelOpen, setIsCommentPanelOpen] = useState(false);

    const togglePanel = (panel: 'text' | 'color' | 'reaction' | 'comment') => {
        setIsTextStyleOpen((prev) => (panel === 'text' ? !prev : false));
        setIsColorPanelOpen((prev) => (panel === 'color' ? !prev : false));
        setIsReactionPickerOpen((prev) => (panel === 'reaction' ? !prev : false));
        setIsCommentPanelOpen((prev) => (panel === 'comment' ? !prev : false));
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
    const titleInputStyle = resolveCaptionStyle(captionStyle, undefined);

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
            setCaptionStyle((initialMetadata?.titleStyle as Record<string, unknown>) || {});
            setReactions(Array.isArray(initialMetadata?.reactions) ? initialMetadata.reactions as string[] : []);
            setDetachedComments(Array.isArray(initialMetadata?.detachedComments) ? initialMetadata.detachedComments as CommentDraft[] : []);
            setBadgeColor(typeof initialMetadata?.badgeColor === 'string' ? initialMetadata.badgeColor : '#facc15');
            setIsTextStyleOpen(false);
            setIsColorPanelOpen(false);
            setIsReactionPickerOpen(false);
            setIsCommentPanelOpen(false);
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
                titleStyle: captionStyle,
                reactions,
                detachedComments,
                badgeColor,
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
            <div
                className="relative bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden w-[90vw] h-[90vh]"
                onClick={(e) => e.stopPropagation()}
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
                                placeholder="Post name"
                                className="flex-1 min-w-0 truncate bg-transparent text-lg font-semibold text-gray-800 outline-none border-none placeholder:text-gray-400 placeholder:font-normal"
                                style={titleInputStyle}
                            />
                        )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                        {!readOnly && (
                            <div className="flex items-center gap-1 mr-1">
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => togglePanel('text')}
                                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isTextStyleOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'}`}
                                        title="Text style"
                                    >
                                        <TextCursor className="w-4 h-4" />
                                    </button>
                                    {isTextStyleOpen && (
                                        <div
                                            className="absolute right-0 top-full mt-2 z-[200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <TextStylePopup
                                                isOpen={isTextStyleOpen}
                                                onOpenChange={setIsTextStyleOpen}
                                                onSelectHeading={applyCaptionPreset}
                                                hideCloseButton
                                                onSelectColor={(color) => setCaptionStyle((prev) => ({ ...prev, color }))}
                                                onSelectHighlight={(color) => setCaptionStyle((prev) => ({ ...prev, backgroundColor: color }))}
                                                currentHeading={captionStyle.heading || 'normal'}
                                                currentColor={captionStyle.color}
                                                currentHighlight={captionStyle.backgroundColor}
                                                onBold={toggleCaptionBold}
                                                onItalic={toggleCaptionItalic}
                                                onUnderline={toggleCaptionUnderline}
                                                onStrikethrough={toggleCaptionStrikethrough}
                                                onAlign={cycleCaptionAlign}
                                                isBold={isCaptionBold}
                                                isItalic={isCaptionItalic}
                                                isUnderline={!!captionStyle.underline}
                                                isStrikethrough={!!captionStyle.strikethrough}
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => togglePanel('color')}
                                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isColorPanelOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'}`}
                                        title="Color"
                                    >
                                        <Palette className="w-4 h-4" />
                                    </button>
                                    {isColorPanelOpen && (
                                        <div className="absolute right-0 top-full mt-2 z-[200]" onClick={(e) => e.stopPropagation()}>
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
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => togglePanel('reaction')}
                                        className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isReactionPickerOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'}`}
                                        title="Reaction"
                                    >
                                        <Smile className="w-4 h-4" />
                                    </button>
                                    {isReactionPickerOpen && (
                                        <div className="absolute right-0 top-full mt-2 z-[200]" onClick={(e) => e.stopPropagation()}>
                                            <EmojiReactionPicker
                                                isOpen={isReactionPickerOpen}
                                                onOpenChange={setIsReactionPickerOpen}
                                                onSelectEmoji={(emoji) => {
                                                    setReactions((prev) => [...prev, emoji]);
                                                    setIsReactionPickerOpen(false);
                                                }}
                                                inline
                                            />
                                        </div>
                                    )}
                                </div>

                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => togglePanel('comment')}
                                        className={`relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${isCommentPanelOpen ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'}`}
                                        title="Comment"
                                    >
                                        <MessageSquare className="w-4 h-4" />
                                        {commentCount > 0 && (
                                            <span
                                                className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold text-gray-800 flex items-center justify-center"
                                                style={{ backgroundColor: badgeColor }}
                                            >
                                                {commentCount}
                                            </span>
                                        )}
                                    </button>
                                    {isCommentPanelOpen && (
                                        <div className="absolute right-0 top-full mt-2 z-[200]" style={{ minWidth: '320px' }} onClick={(e) => e.stopPropagation()}>
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
                                                comments={detachedComments}
                                                currentUserId="anon"
                                                currentUserName="You"
                                                embedded
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {!readOnly && (
                            <button
                                onClick={handleSaveAndClose}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                            >
                                <Save size={18} />
                                Save Changes
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                            title="Close"
                        >
                            <X size={24} />
                        </button>
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
                        />
                    </div>
                </div>

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
        </div >
    );
}
