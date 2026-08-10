"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';
import { Link as LinkIcon, Palette, Strikethrough, Trash2, X } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle as TipTapTextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TextStylePopup from './TextStylePopup';

// Same 48-color badge palette every other post's Comments panel (Note,
// Clipart, Todo, Table, Link) uses for its badge-color swatch.
const BADGE_COLORS = [
    "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04",
    "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563",
    "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c",
    "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777",
    "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb",
    "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a",
    "#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea",
    "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488",
];

const COMMENT_POPUP_EXTENSIONS = [
    StarterKit.configure({
        heading: false,
        codeBlock: false,
        link: false,
    }),
    TipTapTextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
        openOnClick: false,
        HTMLAttributes: {
            class: 'text-blue-500 underline cursor-pointer',
        },
    }),
];

interface CommentData {
    id: string;
    text: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    timestamp: number;
    color?: string;
    textColor?: string;
    backgroundColor?: string;
    isStrikethrough?: boolean;
}

interface CommentPopupProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (commentText: string) => void;
    onEdit?: (commentText: string) => void;
    onRemove?: () => void;
    onEditComment?: (commentId: string, commentText: string) => void;
    onRemoveComment?: (commentId: string) => void;
    onRemoveThread?: () => void;
    onColor?: (color: string) => void;
    onTextColor?: (color: string) => void;
    onStrikethrough?: () => void;
    onToggleCommentStrikethrough?: (commentId: string) => void;
    // Per-comment text/highlight color, distinct from onColor/onTextColor
    // above (which color the highlighted *document text span* a
    // text-selection comment thread is anchored to -- see OverlayLayer.tsx).
    // This colors an individual comment's own text, matching CommentPost.tsx
    // and CommentEditor.tsx's onUpdateCommentColor.
    onCommentColor?: (commentId: string, textColor?: string, backgroundColor?: string) => void;
    comments?: CommentData[];
    mode?: 'add' | 'view';
    existingComment?: CommentData;
    highlightColor?: string;
    textColor?: string;
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    position?: { x: number; y: number } | null;
    hideComposer?: boolean;
    onColorPickerOpenChange?: (open: boolean) => void;
    fullWidth?: boolean;
    embedded?: boolean; // When true, renders inline without portal/positioning
    // The comment-count badge's own background color (the little circle
    // shown on the card, not an individual comment's text color) -- same
    // "Badge Color" swatch + palette every other post type's Comments
    // panel (Note, Clipart, Todo, Table, Link) already has.
    badgeColor?: string;
    onBadgeColorChange?: (color: string) => void;
    // Suppresses the panel's own built-in close button, for callers that
    // render their own close control instead.
    hideCloseButton?: boolean;
}

export default function CommentPopup({
    isOpen,
    onOpenChange,
    onSubmit,
    onEdit,
    onRemove,
    onEditComment,
    onRemoveComment,
    onRemoveThread,
    onColor,
    onTextColor,
    onStrikethrough,
    onToggleCommentStrikethrough,
    onCommentColor,
    comments = [],
    existingComment,
    highlightColor,
    textColor,
    currentUserId = 'user1',
    currentUserName = 'R',
    position,
    hideComposer = false,
    onColorPickerOpenChange,
    fullWidth = false,
    embedded = false,
    badgeColor,
    onBadgeColorChange,
    hideCloseButton = false,
}: CommentPopupProps) {
    const [newCommentText, setNewCommentText] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState('');
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [badgeColorPickerOpen, setBadgeColorPickerOpen] = useState(false);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [colorPickerCoords, setColorPickerCoords] = useState<{ left: number; top: number } | null>(null);
    const [textareaSelection, setTextareaSelection] = useState<{ start: number; end: number } | null>(null);
    // Per-row color popup (distinct from colorPickerOpen/colorPickerCoords
    // above, which drive the OverlayLayer text-span color picker).
    const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
    // Per-row link popover for the comment currently being edited.
    const [linkPopoverCommentId, setLinkPopoverCommentId] = useState<string | null>(null);
    const [linkUrl, setLinkUrl] = useState('');
    const savedLinkSelectionRef = useRef<{ from: number; to: number } | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // TipTap editor for editing comments with rich text support
    const editEditor = useEditor({
        immediatelyRender: false,
        extensions: COMMENT_POPUP_EXTENSIONS,
        content: '',
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[24px] text-xs',
            },
        },
    });

    // Notify parent when color picker opens/closes
    useEffect(() => {
        onColorPickerOpenChange?.(colorPickerOpen);
    }, [colorPickerOpen, onColorPickerOpenChange]);

    useEffect(() => {
        if (isOpen) {
            if (!hideComposer) {
                setTimeout(() => {
                    inputRef.current?.focus();
                }, 50);
            }
        } else {
            setNewCommentText('');
            setEditingCommentId(null);
            setEditingCommentText('');
            setColorPickerOpen(false);
            setColorPickerCoords(null);
            setBadgeColorPickerOpen(false);
            setCommentColorPopupId(null);
            setLinkPopoverCommentId(null);
            setLinkUrl('');
        }
    }, [isOpen, hideComposer]);

    // Update edit editor content when editing a comment
    useEffect(() => {
        if (editingCommentId && editingCommentText && editEditor && !editEditor.isDestroyed) {
            editEditor.commands.setContent(editingCommentText);
            setTimeout(() => {
                editEditor.commands.focus('end');
            }, 50);
        }
    }, [editingCommentId, editingCommentText, editEditor]);

    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const getTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();

    const effectiveComments = comments.length > 0 ? comments : (existingComment ? [existingComment] : []);
    const resolvedHighlightColor = highlightColor || existingComment?.color;
    const handleSubmit = () => {
        const trimmed = newCommentText.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setNewCommentText('');
        inputRef.current?.focus();
    };

    const handleEditCommit = () => {
        if (!editingCommentId || !editEditor || editEditor.isDestroyed) {
            return;
        }
        
        const htmlContent = editEditor.getHTML();
        const textContent = editEditor.getText().trim();
        
        if (!textContent) {
            return;
        }
        
        if (onEditComment) {
            onEditComment(editingCommentId, htmlContent);
        } else if (onEdit) {
            onEdit(htmlContent);
        }
        
        setEditingCommentId(null);
        setEditingCommentText('');
        editEditor.commands.clearContent();
    };

    useEffect(() => {
        if (!isOpen) return;
        if (effectiveComments.length === 0) {
            setActiveCommentId(null);
            return;
        }
        if (!activeCommentId || !effectiveComments.some((comment) => comment.id === activeCommentId)) {
            setActiveCommentId(effectiveComments[effectiveComments.length - 1]?.id || null);
        }
    }, [isOpen, effectiveComments, activeCommentId]);

    const handleTextColor = useCallback((color: string) => {
        if (!editEditor || editEditor.isDestroyed) {
            return;
        }
        editEditor.chain().focus().setColor(color).run();
    }, [editEditor]);

    const handleHighlightColor = useCallback((color: string) => {
        if (!editEditor || editEditor.isDestroyed) {
            return;
        }
        if (color === 'transparent') {
            editEditor.chain().focus().unsetHighlight().run();
        } else {
            editEditor.chain().focus().setHighlight({ color }).run();
        }
    }, [editEditor]);

    const openLinkPopover = useCallback((commentId: string) => {
        if (!editEditor || editEditor.isDestroyed) return;
        const { from, to } = editEditor.state.selection;
        savedLinkSelectionRef.current = { from, to };
        setLinkUrl(editEditor.getAttributes('link').href || '');
        setCommentColorPopupId(null);
        setLinkPopoverCommentId(commentId);
    }, [editEditor]);

    const handleApplyLink = useCallback(() => {
        if (!editEditor || editEditor.isDestroyed) return;
        if (savedLinkSelectionRef.current) {
            const { from, to } = savedLinkSelectionRef.current;
            editEditor.chain().focus().setTextSelection({ from, to }).run();
        }
        if (linkUrl.trim() === '') {
            editEditor.chain().focus().unsetLink().run();
        } else {
            let finalUrl = linkUrl.trim();
            if (!/^https?:\/\//i.test(finalUrl)) finalUrl = `https://${finalUrl}`;
            editEditor.chain().focus().setLink({ href: finalUrl }).run();
        }
        setLinkPopoverCommentId(null);
        setLinkUrl('');
        savedLinkSelectionRef.current = null;
    }, [editEditor, linkUrl]);

    if (!isOpen) return null;

    // Only render the internal color picker portal if the parent is NOT handling it
    // When onColorPickerOpenChange is provided, the parent renders the color picker externally
    const colorPickerPortal =
        colorPickerOpen &&
        colorPickerCoords &&
        (onColor || onTextColor) &&
        !onColorPickerOpenChange  // Don't render internal portal if parent handles it
            ? createPortal(
                <div
                    className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                    style={{ left: `${colorPickerCoords.left}px`, top: `${colorPickerCoords.top}px` }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <TextStylePopup
                        isOpen={true}
                        onOpenChange={(open) => {
                            if (!open) setColorPickerOpen(false);
                        }}
                        onSelectHeading={() => {}}
                        hideHeadingSelect={true}
                        onSelectColor={(color) => {
                            handleTextColor(color);
                            onTextColor?.(color);
                        }}
                        onSelectHighlight={(color) => {
                            handleHighlightColor(color);
                            onColor?.(color);
                        }}
                        currentHeading="normal"
                        currentColor={textColor}
                        currentHighlight={resolvedHighlightColor}
                    />
                </div>,
                document.body
            )
            : null;

    const panel = (
        <div
            ref={panelRef}
            className={`relative border border-gray-200 p-4 rounded-lg ${
                embedded
                    ? 'shadow-none border-0 p-0 w-full max-w-none'
                    : fullWidth
                        ? 'shadow-2xl min-w-[280px] w-full max-w-none overflow-visible'
                        : 'shadow-2xl min-w-[280px] max-w-[360px] overflow-visible'
            }`}
            style={{ backgroundColor: '#fff', width: '100%' }}
            onMouseDown={(e) => {
                // Only prevent default for non-interactive areas
                const target = e.target as HTMLElement;
                const isInteractive = target.closest('input, textarea, button, [contenteditable="true"]');
                if (!isInteractive && !target.closest('.ProseMirror')) {
                    e.preventDefault();
                }
                e.stopPropagation();
            }}
        >
            {!embedded && !hideCloseButton && (
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                    title="Close"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                <div className="flex items-center gap-2">
                    {onBadgeColorChange && (
                        <button
                            onClick={() => setBadgeColorPickerOpen((open) => !open)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                            title="Badge Color"
                        >
                            <div
                                className="w-4 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: badgeColor || '#facc15' }}
                            />
                        </button>
                    )}
                </div>
            </div>

            {badgeColorPickerOpen && onBadgeColorChange && (
                <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                    <div className="grid grid-cols-6 gap-1.5">
                        {BADGE_COLORS.map((color) => (
                            <button
                                key={color}
                                onClick={() => {
                                    onBadgeColorChange(color);
                                    setBadgeColorPickerOpen(false);
                                }}
                                className={`rounded transition-transform hover:scale-110 ${badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
                                style={{
                                    width: '20px',
                                    height: '20px',
                                    backgroundColor: color,
                                    border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a'].includes(color) ? '1px solid #d1d5db' : 'none',
                                }}
                                title={color}
                            />
                        ))}
                    </div>
                </div>
            )}

            {colorPickerPortal}

            {effectiveComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
            ) : (
                <div
                    ref={scrollContainerRef}
                    className={`w-full space-y-3 overflow-y-auto pr-1 scrollbar-ultrathin ${
                        embedded ? 'max-h-[240px]' : 'max-h-[400px]'
                    }`}
                    style={{ scrollbarGutter: 'stable' }}
                >
                    {effectiveComments.map((comment) => {
                        const isEditing = editingCommentId === comment.id;
                        const isActive = activeCommentId === comment.id;
                        const isColorOpen = commentColorPopupId === comment.id;
                        const isLinkOpen = linkPopoverCommentId === comment.id;
                        return (
                            <div
                                key={comment.id}
                                className={`group/row relative flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setActiveCommentId(comment.id)}
                                onDoubleClick={() => {
                                    if (comment.userId !== currentUserId) return;
                                    setEditingCommentId(comment.id);
                                    setEditingCommentText(comment.text);
                                }}
                            >
                                {isColorOpen && onCommentColor && (
                                    <div
                                        className="absolute right-full top-0 mr-3 z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                        }}
                                    >
                                        <TextStylePopup
                                            isOpen={true}
                                            onOpenChange={(open) => !open && setCommentColorPopupId(null)}
                                            onSelectHeading={() => {}}
                                            hideHeadingSelect={true}
                                            onSelectColor={(color) => onCommentColor(comment.id, color, comment.backgroundColor)}
                                            onSelectHighlight={(color) => onCommentColor(comment.id, comment.textColor, color === 'transparent' ? undefined : color)}
                                            currentHeading="normal"
                                            currentColor={comment.textColor || comment.color}
                                            currentHighlight={comment.backgroundColor}
                                        />
                                    </div>
                                )}
                                {isLinkOpen && (
                                    <div
                                        className="absolute right-full top-0 mr-3 z-[1200] bg-white rounded-lg shadow-lg p-3 border border-gray-200"
                                        onClick={(e) => e.stopPropagation()}
                                        onMouseDown={(e) => e.preventDefault()}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="url"
                                                value={linkUrl}
                                                onChange={(e) => setLinkUrl(e.target.value)}
                                                placeholder="google.com"
                                                className="px-3 py-1.5 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 text-xs w-56"
                                                autoFocus
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') handleApplyLink();
                                                    if (e.key === 'Escape') setLinkPopoverCommentId(null);
                                                }}
                                            />
                                            <button
                                                onClick={handleApplyLink}
                                                className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                                            >
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {comment.userAvatar ? (
                                        <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full" />
                                    ) : (
                                        getInitial(comment.userName)
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-700">{comment.userName}</span>
                                        <span className="text-[10px] text-gray-400">{getTimeAgo(comment.timestamp)}</span>
                                    </div>
                                    {isEditing ? (
                                        <div className="mt-1 w-full">
                                            <div
                                                className="relative"
                                                onMouseDown={(e) => {
                                                    // Allow text selection in editor
                                                    e.stopPropagation();
                                                }}
                                                onBlur={(e) => {
                                                    // Save when clicking outside editor
                                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                        handleEditCommit();
                                                    }
                                                }}
                                            >
                                                <EditorContent
                                                    editor={editEditor}
                                                    className="bg-gray-50 rounded px-2 py-1 border border-gray-200 focus-within:border-blue-400 min-h-[24px] max-h-[120px] overflow-auto"
                                                    onKeyDown={(e: React.KeyboardEvent) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleEditCommit();
                                                        }
                                                        if (e.key === 'Escape') {
                                                            setEditingCommentId(null);
                                                            setEditingCommentText('');
                                                            if (editEditor && !editEditor.isDestroyed) {
                                                                editEditor.commands.clearContent();
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer ${comment.isStrikethrough ? 'line-through' : ''}`}
                                            style={{
                                                color: comment.textColor || comment.color,
                                                backgroundColor: comment.backgroundColor || undefined,
                                            }}
                                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
                                        />
                                    )}
                                </div>

                                {/* Actions Column - per comment, fixed width, always reserves space */}
                                <div className="flex flex-col gap-0.5 w-5 shrink-0">
                                    <div className={`flex flex-col gap-0.5 ${isActive ? 'visible' : 'invisible group-hover/row:visible'}`}>
                                        {isEditing ? (
                                            <>
                                                {onCommentColor && (
                                                    <button
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                        }}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            setLinkPopoverCommentId(null);
                                                            setCommentColorPopupId((prev) => (prev === comment.id ? null : comment.id));
                                                        }}
                                                        className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                        title="Color"
                                                    >
                                                        <Palette className="w-3 h-3" />
                                                    </button>
                                                )}
                                                <button
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        if (isLinkOpen) {
                                                            setLinkPopoverCommentId(null);
                                                        } else {
                                                            openLinkPopover(comment.id);
                                                        }
                                                    }}
                                                    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                    title="Link"
                                                >
                                                    <LinkIcon className="w-3 h-3" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setEditingCommentId(comment.id);
                                                    setEditingCommentText(comment.text);
                                                }}
                                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                title="Edit"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"></path>
                                                    <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"></path>
                                                    <path d="m2.3 2.3 7.286 7.286"></path>
                                                    <circle cx="11" cy="11" r="2"></circle>
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onToggleCommentStrikethrough) {
                                                    onToggleCommentStrikethrough(comment.id);
                                                } else {
                                                    onStrikethrough?.();
                                                }
                                            }}
                                            className={`p-1 rounded transition-colors ${comment.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'}`}
                                            title="Strikethrough"
                                        >
                                            <Strikethrough className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (onRemoveComment) {
                                                    onRemoveComment(comment.id);
                                                } else if (onRemove) {
                                                    onRemove();
                                                }
                                                if (activeCommentId === comment.id) setActiveCommentId(null);
                                                if (editingCommentId === comment.id) {
                                                    setEditingCommentId(null);
                                                    setEditingCommentText('');
                                                }
                                                if (commentColorPopupId === comment.id) setCommentColorPopupId(null);
                                                if (linkPopoverCommentId === comment.id) setLinkPopoverCommentId(null);
                                            }}
                                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add comment input at bottom */}
            {!hideComposer && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                    <input
                        ref={inputRef}
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                                e.preventDefault();
                                const text = e.currentTarget.value.trim();
                                onSubmit(text);
                                setNewCommentText('');
                                e.currentTarget.value = '';
                            }
                        }}
                        className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                        placeholder="Add a comment..."
                    />
                </div>
            )}
        </div>
    );

    // Embedded mode: render inline without wrappers (for canvas display)
    if (embedded) {
        return panel;
    }

    if (position) {
        return (
            <div
                className="fixed z-[3000] flex items-start gap-2"
                style={{ left: position.x, top: position.y }}
                onMouseDown={preventFocusLoss}
            >
                {panel}
            </div>
        );
    }

    // When no position prop, just render the panel directly
    // Parent component handles positioning
    return (
        <div onMouseDown={preventFocusLoss}>
            {panel}
        </div>
    );
}
