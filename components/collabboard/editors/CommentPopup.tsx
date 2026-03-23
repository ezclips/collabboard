"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Palette, Strikethrough, Trash2, X } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle as TipTapTextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import TextStylePopup from './TextStylePopup';

const COMMENT_POPUP_EXTENSIONS = [
    StarterKit.configure({
        heading: false,
        codeBlock: false,
    }),
    TipTapTextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
];

interface CommentData {
    id: string;
    text: string;
    userId: string;
    userName: string;
    userAvatar?: string;
    timestamp: number;
    color?: string;
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
}: CommentPopupProps) {
    const [newCommentText, setNewCommentText] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState('');
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [colorPickerCoords, setColorPickerCoords] = useState<{ left: number; top: number } | null>(null);
    const [textareaSelection, setTextareaSelection] = useState<{ start: number; end: number } | null>(null);
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
    const activeComment = useMemo(
        () => effectiveComments.find((comment) => comment.id === activeCommentId) || null,
        [effectiveComments, activeCommentId]
    );
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
            className={`relative rounded-xl border border-gray-200 p-4 ${
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
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                {!embedded && (
                    <button
                        onClick={() => onOpenChange(false)}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                        title="Close"
                    >
                        <X className="w-4 h-4" />
                    </button>
                )}
            </div>

            {colorPickerPortal}

            {effectiveComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
            ) : (
                <div className="relative w-full pr-6">
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
                            return (
                                <div
                                    key={comment.id}
                                    className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                    onClick={() => setActiveCommentId(comment.id)}
                                    onDoubleClick={() => {
                                        if (comment.userId !== currentUserId) return;
                                        setEditingCommentId(comment.id);
                                        setEditingCommentText(comment.text);
                                    }}
                                >
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
                                                className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${comment.isStrikethrough ? 'line-through' : ''}`}
                                                dangerouslySetInnerHTML={{ __html: comment.text }}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="absolute right-0 top-0 flex flex-col gap-1 pt-1">
                        {editingCommentId && activeComment && editingCommentId === activeComment.id && onColor ? (
                            <button
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    // ===== DYNAMIC POSITIONING - MAINTAINS ALIGNMENT =====
                                    // Get button position to calculate offset from Note Post
                                    const rect = event.currentTarget.getBoundingClientRect();
                                    // Position to the left of the Note Post, aligned with the comment row
                                    // Horizontal: 84px to the left (toolbar width 72px + gap 12px)
                                    // Vertical: align with the button (which is aligned with the comment)
                                    setColorPickerCoords({ left: rect.right - 84, top: rect.top });
                                    // ===== END DYNAMIC POSITIONING =====
                                    setColorPickerOpen((open) => !open);
                                }}
                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                title="Color"
                            >
                                <Palette className="w-3 h-3" />
                            </button>
                        ) : (
                            <button
                                onClick={() => {
                                    if (!activeComment) return;
                                    setEditingCommentId(activeComment.id);
                                    setEditingCommentText(activeComment.text);
                                    setColorPickerOpen(false);
                                }}
                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
                                title="Edit"
                                disabled={!activeComment}
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
                            onClick={() => {
                                if (!activeComment) return;
                                if (onToggleCommentStrikethrough) {
                                    onToggleCommentStrikethrough(activeComment.id);
                                    return;
                                }
                                onStrikethrough?.();
                            }}
                            className={`p-1 rounded transition-colors ${activeComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                            title="Strikethrough"
                            disabled={!activeComment}
                        >
                            <Strikethrough className="w-3 h-3" />
                        </button>
                        <button
                            onClick={() => {
                                if (!activeComment) return;
                                if (onRemoveComment) {
                                    onRemoveComment(activeComment.id);
                                } else if (onRemove) {
                                    onRemove();
                                }
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
                            title="Delete"
                            disabled={!activeComment}
                        >
                            <Trash2 className="w-3 h-3" />
                        </button>
                    </div>
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
