"use client";

import React from 'react';
import { Edit2, Palette, PenTool, Strikethrough, Trash2 } from 'lucide-react';
import { type Comment, editCommentText, removeComment, toggleCommentStrikethrough } from '@/lib/domain/canvas/comments';
import FreeformCommentRow from './FreeformCommentRow';

// A comment surface's action-cluster identity: which Edit icon it shows and
// whether text-color writes mirror into the legacy `color` field. Real,
// frozen drift exists between sites (COMMENT_UI_CONTRACT_V1.md) -- a single
// typed profile object carries that variation instead of a growing list of
// boolean enable* props, and callers must pick one explicitly rather than
// getting a silently-chosen default policy for color writes. mirrorLegacyColor
// documents the write policy a caller's own color-popup handler must apply
// (see `colorPopupCommentId` below -- CommentList doesn't write colors itself).
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
  // Active/editing/color-popup identity is a CONTROLLED prop, not internal
  // state (PATCH 8C correction to the 8B design): Site A's real production
  // state (activeCardCommentId/editingCardCommentId/commentColorPopupId) is
  // the SAME state family site D's separate toolbar-open comment panel reads
  // (COMMENT_UI_CONTRACT_V1.md: "shared with A"). Owning this internally
  // would desync D from A the moment a toolbar opens/closes mid-edit.
  activeCommentId: string | null;
  onActiveCommentIdChange: (id: string | null) => void;
  editingCommentId: string | null;
  editingText: string;
  onEditingCommentIdChange: (id: string | null) => void;
  onEditingTextChange: (text: string) => void;
  // Which comment's color popup is requested, mirroring production's
  // `commentColorPopupId` (a comment id, not a boolean). CommentList only
  // toggles this and reads it for the Color/Edit button slot and the
  // textarea's blur-suppression guard -- it does NOT render the popup
  // itself. In Site A's actual DOM the color popup is a SIBLING of the
  // whole comment panel (anchored to the padlet, not the comment list), not
  // nested inside it, so the caller keeps owning that render (shell/chrome,
  // PATCH 8B spec section 4) to avoid silently moving its anchor point.
  colorPopupCommentId: string | null;
  onColorPopupCommentIdChange: (id: string | null) => void;
}

// Owns only shared list concerns for the Site A profile: ordered rendering,
// the row list, and the shared action rail (Color/Edit toggle, Strikethrough,
// Delete -- Site A's action rail is list-level, not per-row), forwarding
// comment text/strikethrough/delete operations to the domain layer.
// Deliberately does NOT own modal/floating/panel chrome, the color popup's
// own rendering, or the add-comment composer -- those stay with each site's
// own shell (PATCH 8B spec, section 4; PATCH 8C spec, step 2).
export default function CommentList({
  comments,
  onCommentsChange,
  profile = SITE_A_PROFILE,
  activeCommentId,
  onActiveCommentIdChange,
  editingCommentId,
  editingText,
  onEditingCommentIdChange,
  onEditingTextChange,
  colorPopupCommentId,
  onColorPopupCommentIdChange,
}: CommentListProps) {
  const activeComment = comments.find((c) => c.id === activeCommentId) ?? null;

  const commitEdit = () => {
    const trimmed = editingText.trim();
    const targetId = editingCommentId;
    onEditingCommentIdChange(null);
    onEditingTextChange('');
    onColorPopupCommentIdChange(null);
    if (!trimmed || !targetId) return;
    onCommentsChange(editCommentText(comments, targetId, trimmed));
  };

  const cancelEdit = () => {
    onEditingCommentIdChange(null);
    onEditingTextChange('');
    onColorPopupCommentIdChange(null);
  };

  const startEdit = (comment: Comment) => {
    onEditingCommentIdChange(comment.id);
    onEditingTextChange(comment.text || '');
    onColorPopupCommentIdChange(null);
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
            onEditingTextChange={onEditingTextChange}
            onSelect={() => onActiveCommentIdChange(comment.id)}
            onStartEdit={() => startEdit(comment)}
            onCommitEdit={commitEdit}
            onCancelEdit={cancelEdit}
            suppressBlurCommit={colorPopupCommentId === comment.id}
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
              onColorPopupCommentIdChange(colorPopupCommentId === activeComment.id ? null : activeComment.id);
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
            onActiveCommentIdChange(next[next.length - 1]?.id ?? null);
            onEditingCommentIdChange(null);
            onEditingTextChange('');
            onColorPopupCommentIdChange(null);
          }}
          className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
          title="Delete"
          disabled={!activeComment}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
