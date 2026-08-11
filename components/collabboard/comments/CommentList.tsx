"use client";

import React, { useState } from 'react';
import { Edit2, Palette, PenTool, Strikethrough, Trash2 } from 'lucide-react';
import TextStylePopup from '@/components/collabboard/editors/TextStylePopup';
import {
  type Comment,
  editCommentText,
  removeComment,
  toggleCommentStrikethrough,
  setCommentTextColor,
  setCommentBackgroundColor,
} from '@/lib/domain/canvas/comments';
import FreeformCommentRow from './FreeformCommentRow';

// A comment surface's action-cluster identity: which Edit icon it shows and
// whether text-color writes mirror into the legacy `color` field. Real,
// frozen drift exists between sites (COMMENT_UI_CONTRACT_V1.md) -- a single
// typed profile object carries that variation instead of a growing list of
// boolean enable* props, and callers must pick one explicitly rather than
// getting a silently-chosen default policy for color writes.
export interface CommentSurfaceProfile {
  editIcon: 'PenTool' | 'Edit2';
  mirrorLegacyColor: boolean;
}

// Site A (image padlet, badge-triggered popup): PenTool edit icon, mirrors
// textColor into the legacy `color` field on every write.
export const SITE_A_PROFILE: CommentSurfaceProfile = {
  editIcon: 'PenTool',
  mirrorLegacyColor: true,
};

export interface CommentListProps {
  comments: Comment[];
  onCommentsChange: (next: Comment[]) => void;
  profile?: CommentSurfaceProfile;
}

// Owns only shared list concerns for the Site A profile: ordered rendering,
// which comment is "active"/"editing" (that identity lives at the list
// level because Site A's action rail is itself list-level, not per-row),
// and forwarding comment operations to the domain layer. Deliberately does
// NOT own modal/floating/panel chrome -- that stays with each site's own
// shell (see PATCH 8B spec, section 4).
export default function CommentList({ comments, onCommentsChange, profile = SITE_A_PROFILE }: CommentListProps) {
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [colorPopupOpen, setColorPopupOpen] = useState(false);

  const activeComment = comments.find((c) => c.id === activeCommentId) ?? null;

  const commitEdit = () => {
    const trimmed = editingText.trim();
    setEditingCommentId(null);
    setEditingText('');
    setColorPopupOpen(false);
    if (!trimmed || !editingCommentId) return;
    onCommentsChange(editCommentText(comments, editingCommentId, trimmed));
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditingText('');
    setColorPopupOpen(false);
  };

  const startEdit = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditingText(comment.text || '');
    setColorPopupOpen(false);
  };

  if (comments.length === 0) {
    return <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>;
  }

  return (
    <div className="flex gap-2 relative">
      <div className="flex-1 space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin">
        {comments.map((comment) => (
          <FreeformCommentRow
            key={comment.id}
            comment={comment}
            isActive={activeCommentId === comment.id}
            isEditing={editingCommentId === comment.id}
            editingText={editingCommentId === comment.id ? editingText : ''}
            onEditingTextChange={setEditingText}
            onSelect={() => setActiveCommentId(comment.id)}
            onStartEdit={() => startEdit(comment)}
            onCommitEdit={commitEdit}
            onCancelEdit={cancelEdit}
            suppressBlurCommit={colorPopupOpen && editingCommentId === comment.id}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
        {editingCommentId && activeComment && editingCommentId === activeComment.id ? (
          <button
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setColorPopupOpen((open) => !open);
            }}
            className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
            title="Color"
            disabled={!activeComment}
          >
            <Palette className="w-3 h-3" />
          </button>
        ) : (
          <button
            onClick={() => {
              if (!activeComment) return;
              startEdit(activeComment);
            }}
            className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
            title="Edit"
            disabled={!activeComment}
          >
            {profile.editIcon === 'Edit2' ? <Edit2 className="w-3 h-3" /> : <PenTool className="w-3 h-3" />}
          </button>
        )}
        <button
          onClick={() => {
            if (!activeComment) return;
            onCommentsChange(toggleCommentStrikethrough(comments, activeComment.id));
          }}
          className={`p-1 rounded transition-colors ${
            activeComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'
          } disabled:opacity-40 disabled:hover:text-gray-300`}
          title="Strikethrough"
          disabled={!activeComment}
        >
          <Strikethrough className="w-3 h-3" />
        </button>
        <button
          onClick={() => {
            if (!activeComment) return;
            const next = removeComment(comments, activeComment.id);
            onCommentsChange(next);
            setActiveCommentId(next[next.length - 1]?.id ?? null);
            setEditingCommentId(null);
            setEditingText('');
            setColorPopupOpen(false);
          }}
          className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
          title="Delete"
          disabled={!activeComment}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {colorPopupOpen && activeComment && (
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
            onOpenChange={(open) => {
              if (!open) setColorPopupOpen(false);
            }}
            onSelectHeading={() => {}}
            hideHeadingSelect={true}
            onSelectColor={(color) =>
              onCommentsChange(
                setCommentTextColor(comments, activeComment.id, color, { mirrorLegacyColor: profile.mirrorLegacyColor })
              )
            }
            onSelectHighlight={(color) =>
              onCommentsChange(setCommentBackgroundColor(comments, activeComment.id, color === 'transparent' ? undefined : color))
            }
            currentHeading="normal"
            currentColor={activeComment.textColor || activeComment.color}
            currentHighlight={activeComment.backgroundColor}
          />
        </div>
      )}
    </div>
  );
}
