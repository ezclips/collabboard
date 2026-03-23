"use client";

import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import CommentRow from './CommentRow';

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

interface EmbeddedCommentListProps {
  comments: CommentData[];
  badgeColor?: string;
  disableScroll?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onSubmit?: (text: string) => void;
  onEditComment?: (commentId: string, text: string) => void;
  onRemoveComment?: (commentId: string) => void;
  onToggleStrikethrough?: (commentId: string) => void;
  onColorChange?: (commentId: string, textColor?: string, bgColor?: string) => void;
  maxHeight?: number;
  showComposer?: boolean;
}

export default function EmbeddedCommentList({
  comments,
  badgeColor,
  disableScroll = false,
  currentUserId = 'anonymous',
  onSubmit,
  onEditComment,
  onRemoveComment,
  onToggleStrikethrough,
  onColorChange,
  maxHeight = 240,
  showComposer = true,
}: EmbeddedCommentListProps) {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [newCommentText, setNewCommentText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counterBadgeColor =
    typeof badgeColor === 'string' && badgeColor.trim().length > 0
      ? badgeColor
      : '#3b82f6';

  // Auto-select last comment when comments change
  useEffect(() => {
    if (comments.length > 0) {
      const lastComment = comments[comments.length - 1];
      if (!activeCommentId || !comments.find(c => c.id === activeCommentId)) {
        setActiveCommentId(lastComment.id);
      }
    } else {
      setActiveCommentId(null);
    }
  }, [comments, activeCommentId]);

  // Scroll to bottom when new comment added
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [comments.length]);

  const handleSubmit = () => {
    const trimmed = newCommentText.trim();
    if (!trimmed || !onSubmit) return;
    onSubmit(trimmed);
    setNewCommentText('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col w-full bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-xs font-medium text-gray-600">Comments</span>
        </div>
        {/* Comment counter pin */}
        {comments.length > 0 && (
          <div
            className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-white text-[10px] font-semibold"
            style={{ backgroundColor: counterBadgeColor }}
          >
            {comments.length}
          </div>
        )}
      </div>

      {/* Comments Scroll Area */}
      <div
        ref={scrollRef}
        className={disableScroll
          ? "overflow-visible"
          : "overflow-y-scroll scrollbar-ultrathin"}
        style={{
          maxHeight: disableScroll ? undefined : maxHeight,
          scrollbarGutter: disableScroll ? undefined : 'stable',
        }}
      >
        {comments.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">No comments yet</p>
        ) : (
          <div className="p-2 space-y-1 group">
            {comments.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                isActive={activeCommentId === comment.id}
                isEditing={editingCommentId === comment.id}
                currentUserId={currentUserId}
                onSelect={() => setActiveCommentId(comment.id)}
                onStartEdit={() => {
                  setEditingCommentId(comment.id);
                  setActiveCommentId(comment.id);
                }}
                onSaveEdit={(text) => {
                  onEditComment?.(comment.id, text);
                  setEditingCommentId(null);
                }}
                onCancelEdit={() => setEditingCommentId(null)}
                onToggleStrikethrough={() => onToggleStrikethrough?.(comment.id)}
                onDelete={() => {
                  onRemoveComment?.(comment.id);
                  if (activeCommentId === comment.id) {
                    setActiveCommentId(null);
                  }
                }}
                onOpenColorPicker={() => {
                  // Color picker integration - can be extended
                  onColorChange?.(comment.id, undefined, undefined);
                }}
                showColorButton={!!onColorChange}
              />
            ))}
          </div>
        )}
      </div>

      {/* Input Area */}
      {showComposer && onSubmit && (
        <div className="px-2 py-1.5 border-t border-gray-100 bg-gray-50/50">
          <div className="flex gap-1 items-center">
            <input
              ref={inputRef}
              type="text"
              value={newCommentText}
              onChange={(e) => setNewCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              placeholder="Add a comment..."
              className="flex-1 min-w-0 text-xs px-2.5 py-1 rounded-full border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none bg-white"
            />
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit();
              }}
              disabled={!newCommentText.trim()}
              className="w-5 h-5 rounded-full bg-blue-500 text-white flex items-center justify-center hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
              title="Send"
            >
              <Send className="w-2.5 h-2.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
