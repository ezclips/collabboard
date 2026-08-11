"use client";

import React from 'react';
import DOMPurify from 'dompurify';
import type { Comment } from '@/lib/domain/canvas/comments';
import { handleSafeCommentLinkClick } from '@/components/collabboard/commentLinkSafety';

// Canonical per-row rendering for the freeform "Site A" comment profile
// (COMMENT_UI_CONTRACT_V1.md). Ported 1:1 from FreeformPadletCards.tsx's
// image-padlet badge-triggered comment panel -- markup, classNames, and
// interaction wiring are intentionally unchanged, not redesigned.
//
// Site A's action buttons (Color/Edit, Strikethrough, Delete) are NOT
// per-row: they live in a single shared rail acting on whichever comment is
// "active", owned by CommentList. This row only renders identity + content.
export interface FreeformCommentRowProps {
  comment: Comment;
  isActive: boolean;
  isEditing: boolean;
  editingText: string;
  onEditingTextChange: (text: string) => void;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  /** True while a color popup is open for THIS comment -- suppresses the textarea's onBlur commit, matching Site A. */
  suppressBlurCommit: boolean;
}

function timeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const years = Math.floor(days / 365);
  if (minutes < 60) return `${Math.max(1, minutes)}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 365) return `${days}d`;
  return `${years}y`;
}

export default function FreeformCommentRow({
  comment,
  isActive,
  isEditing,
  editingText,
  onEditingTextChange,
  onSelect,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  suppressBlurCommit,
}: FreeformCommentRowProps) {
  return (
    <div
      className={`flex gap-2 rounded py-0.5 px-0.5 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onStartEdit();
      }}
    >
      <div className="flex flex-col items-center gap-0.5 shrink-0 w-[22px]">
        <div className="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
          {comment.userName?.charAt(0).toUpperCase() || 'U'}
        </div>
        <span className="text-[9px] text-gray-400 leading-none text-center">{timeAgo(comment.timestamp)}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-gray-700 truncate">{comment.userName || 'User'}</span>
        </div>
        {isEditing ? (
          <textarea
            value={editingText}
            onChange={(e) => onEditingTextChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onCommitEdit();
              }
              if (e.key === 'Escape') {
                onCancelEdit();
              }
            }}
            onBlur={() => {
              if (suppressBlurCommit) return;
              onCommitEdit();
            }}
            className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
            style={{
              color: comment.textColor || comment.color || '#4b5563',
              backgroundColor: comment.backgroundColor || undefined,
            }}
            rows={1}
            autoFocus
          />
        ) : (
          <div
            className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer ${comment.isStrikethrough ? 'line-through' : ''}`}
            style={{
              color: comment.textColor || comment.color,
              backgroundColor: comment.backgroundColor || undefined,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              if (handleSafeCommentLinkClick(e)) return;
              e.stopPropagation();
            }}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onStartEdit();
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
          />
        )}
      </div>
    </div>
  );
}
