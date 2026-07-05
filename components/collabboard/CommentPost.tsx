"use client";

import React, { useState, useRef, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { MessageSquare, Palette, PenTool, Send, Strikethrough, Trash2 } from 'lucide-react';
import TextStylePopup from './editors/TextStylePopup';

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

interface CommentPostProps {
    comments: CommentData[];
    cardColor: string;
    badgeColor?: string;
    topStrip?: string;
    commentTitle?: string;
    onTitleChange?: (title: string) => void;
    onEdit: () => void;
    onAddComment?: (text: string) => void;
    onEditComment?: (commentId: string, text: string) => void;
    onToggleCommentStrikethrough?: (commentId: string) => void;
    onDeleteComment?: (commentId: string) => void;
    onUpdateCommentColor?: (commentId: string, textColor?: string, backgroundColor?: string) => void;
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    selected?: boolean;
    showMenu?: boolean;
    onMenuClick?: () => void;
    onBadgeClick?: (e: React.MouseEvent) => void;
    width?: number;
    height?: number;
}

export default function CommentPost({
    comments,
    cardColor = '#ffffff',
    badgeColor = '#facc15',
    topStrip,
    commentTitle = 'Comments',
    onTitleChange,
    onEdit,
    onClick,
    onDoubleClick,
    onMouseDown,
    selected = false,
    showMenu = false,
    onMenuClick,
    onBadgeClick,
    onAddComment,
    onEditComment,
    onToggleCommentStrikethrough,
    onDeleteComment,
    onUpdateCommentColor,
    width = 300,
    height = 'auto' as any,
}: CommentPostProps) {
    const [draftComment, setDraftComment] = useState('');
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingText, setEditingText] = useState('');
    const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [localTitle, setLocalTitle] = useState(commentTitle);
    const [shouldSelectText, setShouldSelectText] = useState(false);
    const editTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-select text when entering edit mode via pen tip button
    useEffect(() => {
        if (shouldSelectText && editingCommentId && editTextareaRef.current) {
            // Delay to ensure textarea is fully mounted and focused
            const timer = setTimeout(() => {
                if (editTextareaRef.current) {
                    editTextareaRef.current.focus();
                    editTextareaRef.current.select();
                    setShouldSelectText(false);
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [shouldSelectText, editingCommentId]);

    const isDarkColor = (color?: string) => {
        if (!color || color === 'transparent') return false;
        let hex = color.trim();
        if (!hex.startsWith('#')) return false;
        if (hex.length === 4) {
            hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
        }
        if (hex.length >= 9) {
            hex = hex.slice(0, 7);
        }
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return luminance < 0.5;
    };

    const htmlToText = (html: string) => {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
    };

    // Check if comment has rich HTML content (links, formatting) that would be lost in plain text editing
    const hasRichContent = (html: string) => {
        if (!html) return false;
        // Check for anchor tags (links)
        return /<a\s/i.test(html);
    };


    const getTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        const years = Math.floor(days / 365);

        if (minutes < 60) return `${Math.max(1, minutes)}m`;
        if (hours < 24) return `${hours}h`;
        if (days < 365) return `${days}d`;
        return `${years}y`;
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();

    const isDarkCard = isDarkColor(cardColor);
    const actionBaseClass = isDarkCard ? 'text-gray-200 hover:text-white' : 'text-gray-300 hover:text-blue-500';
    const actionDisabledClass = isDarkCard ? 'disabled:opacity-40 disabled:hover:text-gray-200' : 'disabled:opacity-40 disabled:hover:text-gray-300';
    const strikeActiveClass = isDarkCard ? 'text-white bg-white/20' : 'text-blue-500 bg-blue-50';
    const deleteHoverClass = isDarkCard ? 'hover:text-red-300' : 'hover:text-red-500';

    return (
        <div
            className={`group bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col cursor-pointer transition-shadow relative ${selected ? 'ring-2 ring-blue-500 ring-offset-2' : 'hover:shadow-xl'}`}
            style={{
                width: typeof width === 'number' ? `${width}px` : width,
                minHeight: '100px',
                backgroundColor: cardColor
            }}
            data-comment-post-root="true"
            onClick={(e) => {
                e.stopPropagation();
                if (onClick) {
                    onClick(e);
                }
            }}
            onDoubleClick={(e) => {
                e.stopPropagation();
                if (onDoubleClick) {
                    onDoubleClick(e);
                }
            }}
            onMouseDown={(e) => {
                if (onMouseDown) {
                    onMouseDown(e);
                }
            }}
        >
            {/* Comment counter badge on card edge */}
            {comments.length > 0 && (
                <div
                    className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 pointer-events-none"
                    style={{ backgroundColor: badgeColor }}
                    title={`${comments.length} comment${comments.length > 1 ? 's' : ''}`}
                >
                    {comments.length}
                </div>
            )}
            {topStrip && topStrip !== 'transparent' && (
                <div className="h-1.5 w-full rounded-t-xl" style={{ backgroundColor: topStrip }} />
            )}
            <div className="p-4 flex-1 flex flex-col relative">
                {commentColorPopupId && (
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
                            onSelectHeading={() => { }}
                            hideHeadingSelect={true}
                            onSelectColor={(color) => {
                                if (onUpdateCommentColor && commentColorPopupId) {
                                    onUpdateCommentColor(commentColorPopupId, color, undefined);
                                }
                            }}
                            onSelectHighlight={(color) => {
                                if (onUpdateCommentColor && commentColorPopupId) {
                                    onUpdateCommentColor(commentColorPopupId, undefined, color);
                                }
                            }}
                            currentHeading="normal"
                            currentColor={comments.find((c) => c.id === commentColorPopupId)?.textColor || comments.find((c) => c.id === commentColorPopupId)?.color}
                            currentHighlight={comments.find((c) => c.id === commentColorPopupId)?.backgroundColor}
                        />
                    </div>
                )}
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        {isEditingTitle ? (
                            <input
                                type="text"
                                value={localTitle}
                                onChange={(e) => setLocalTitle(e.target.value)}
                                onBlur={() => {
                                    setIsEditingTitle(false);
                                    if (onTitleChange && localTitle.trim()) {
                                        onTitleChange(localTitle.trim());
                                    }
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        setIsEditingTitle(false);
                                        if (onTitleChange && localTitle.trim()) {
                                            onTitleChange(localTitle.trim());
                                        }
                                    }
                                    if (e.key === 'Escape') {
                                        setIsEditingTitle(false);
                                        setLocalTitle(commentTitle);
                                    }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="text-sm font-semibold text-gray-700 bg-transparent border-b border-blue-400 outline-none px-0 py-0 w-24"
                                autoFocus
                            />
                        ) : (
                            <span
                                className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-blue-600 transition-colors"
                                onDoubleClick={(e) => {
                                    e.stopPropagation();
                                    setIsEditingTitle(true);
                                    setLocalTitle(commentTitle);
                                }}
                                title="Double-click to edit title"
                            >
                                {commentTitle}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <div
                            className="w-7 h-7 flex items-center justify-center rounded"
                            title="Badge Color"
                        >
                            <div
                                className="w-4 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: badgeColor }}
                            />
                        </div>
                        {showMenu && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (onMenuClick) onMenuClick();
                                }}
                                className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                                title="Edit"
                                data-no-drag="true"
                            >
                                <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="currentColor">
                                    <circle cx="12" cy="5" r="2" />
                                    <circle cx="12" cy="12" r="2" />
                                    <circle cx="12" cy="19" r="2" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
                {comments.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                ) : (
                    <div className="space-y-1 max-h-[240px] overflow-y-scroll overflow-x-hidden scrollbar-ultrathin" style={{ scrollbarGutter: 'stable' }}>
                        {comments.map((comment) => {
                            const isActive = activeCommentId === comment.id;
                            const isEditing = editingCommentId === comment.id;
                            const commitEdit = () => {
                                const trimmed = editingText.trim();
                                if (!trimmed) {
                                    setEditingCommentId(null);
                                    setEditingText('');
                                    setCommentColorPopupId(null);
                                    return;
                                }
                                if (onEditComment) onEditComment(comment.id, trimmed);
                                setEditingCommentId(null);
                                setEditingText('');
                                setCommentColorPopupId(null);
                            };

                            const startEdit = () => {
                                if (!comment.id) return;
                                // If comment has links/rich content, open full editor to preserve HTML
                                if (hasRichContent(comment.text || '')) {
                                    onEdit();
                                    return;
                                }
                                setActiveCommentId(comment.id);
                                setEditingCommentId(comment.id);
                                setEditingText(htmlToText(comment.text || ''));
                                setCommentColorPopupId(null);
                            };

                            return (
                                <div
                                    key={comment.id}
                                    className={`group/row flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                    onClick={(e) => {
                                        // Single click starts editing (text selection handled by stopPropagation on text div)
                                        if (!isEditing) {
                                            startEdit();
                                        }
                                    }}
                                >
                                    {/* Avatar Column */}
                                    <div className="flex flex-col items-center gap-0.5 shrink-0 w-[22px]">
                                        <div className="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                            {comment.userAvatar ? (
                                                <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                                            ) : (
                                                getInitial(comment.userName)
                                            )}
                                        </div>
                                        <span className="text-[9px] text-gray-400 leading-none text-center">
                                            {getTimeAgo(comment.timestamp)}
                                        </span>
                                    </div>

                                    {/* Content Column */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-0.5">
                                            <span className="text-xs font-medium text-gray-700 truncate">{comment.userName}</span>
                                        </div>
                                        {isEditing ? (
                                            <textarea
                                                ref={editTextareaRef}
                                                value={editingText}
                                                onChange={(e) => setEditingText(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        commitEdit();
                                                    }
                                                    if (e.key === 'Escape') {
                                                        setEditingCommentId(null);
                                                        setEditingText('');
                                                        setCommentColorPopupId(null);
                                                    }
                                                }}
                                                onBlur={() => commitEdit()}
                                                className="w-full text-xs bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                                style={{
                                                    color: comment.textColor || comment.color || '#4b5563',
                                                    backgroundColor: comment.backgroundColor || undefined,
                                                }}
                                                rows={1}
                                                autoFocus
                                            />
                                        ) : (
                                            <div
                                                className={`text-xs text-gray-600 break-words whitespace-pre-wrap leading-relaxed select-text cursor-text ${comment.isStrikethrough ? 'line-through opacity-60' : ''} [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer`}
                                                style={{
                                                    color: comment.textColor || comment.color,
                                                    backgroundColor: comment.backgroundColor || undefined,
                                                }}
                                                onMouseDown={(e) => {
                                                    // Allow text selection - stop propagation to prevent row click
                                                    e.stopPropagation();
                                                }}
                                                onClick={(e) => {
                                                    // Check if clicked on a link - let it work
                                                    const target = e.target as HTMLElement;
                                                    if (target.tagName === 'A') {
                                                        e.stopPropagation();
                                                        // Let the link work normally
                                                        return;
                                                    }
                                                    // Check if user is selecting text (has selection)
                                                    const selection = window.getSelection();
                                                    if (selection && selection.toString().length > 0) {
                                                        // User selected text, don't start editing
                                                        e.stopPropagation();
                                                        return;
                                                    }
                                                    // No text selected, start editing
                                                    e.stopPropagation();
                                                    startEdit();
                                                }}
                                                dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
                                            />
                                        )}
                                    </div>

                                    {/* Actions Column - Fixed width, always reserves space */}
                                    <div className="flex flex-col gap-0.5 w-5 shrink-0">
                                        <div className={`flex flex-col gap-0.5 ${isActive ? 'visible' : 'invisible group-hover/row:visible'}`}>
                                            {/* Edit/Palette Button */}
                                            {isEditing ? (
                                                <button
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        setCommentColorPopupId((prev) => (prev === comment.id ? null : comment.id));
                                                    }}
                                                    className={`p-0.5 rounded transition-colors ${actionBaseClass}`}
                                                    title="Color"
                                                >
                                                    <Palette className="w-3 h-3" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setShouldSelectText(true);
                                                        startEdit();
                                                    }}
                                                    className={`p-0.5 rounded transition-colors ${actionBaseClass}`}
                                                    title="Edit"
                                                >
                                                    <PenTool className="w-3 h-3" />
                                                </button>
                                            )}
                                            {/* Strikethrough Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onToggleCommentStrikethrough) {
                                                        onToggleCommentStrikethrough(comment.id);
                                                    }
                                                }}
                                                className={`p-0.5 rounded transition-colors ${comment.isStrikethrough ? strikeActiveClass : actionBaseClass}`}
                                                title="Strikethrough"
                                            >
                                                <Strikethrough className="w-3 h-3" />
                                            </button>
                                            {/* Delete Button */}
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (onDeleteComment) {
                                                        onDeleteComment(comment.id);
                                                        if (activeCommentId === comment.id) {
                                                            setActiveCommentId(null);
                                                        }
                                                        setEditingCommentId(null);
                                                        setEditingText('');
                                                        setCommentColorPopupId(null);
                                                    }
                                                }}
                                                className={`p-0.5 rounded transition-colors ${isDarkCard ? 'text-gray-200' : 'text-gray-300'} ${deleteHoverClass}`}
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
                <div className="mt-3 pt-3 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                            <MessageSquare className="w-3.5 h-3.5" />
                        </div>
                        <input
                            type="text"
                            placeholder="Add a comment..."
                            className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none bg-white"
                            onFocus={(e) => {
                                e.stopPropagation();
                                if (!onAddComment) onEdit();
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            value={draftComment}
                            onChange={(e) => setDraftComment(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (onAddComment && draftComment.trim()) {
                                        onAddComment(draftComment.trim());
                                        setDraftComment('');
                                    } else if (!onAddComment) {
                                        onEdit();
                                    }
                                }
                            }}
                            data-no-drag="true"
                        />
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onAddComment && draftComment.trim()) {
                                    onAddComment(draftComment.trim());
                                    setDraftComment('');
                                } else if (!onAddComment) {
                                    onEdit();
                                }
                            }}
                            className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
                            title="Open comments"
                            data-no-drag="true"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
