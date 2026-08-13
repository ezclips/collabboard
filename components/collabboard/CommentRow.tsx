"use client";

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import DOMPurify from 'dompurify';
import { Palette, Strikethrough, Trash2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle as TipTapTextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import TextStylePopup from './editors/TextStylePopup';
import { useAnchoredPopover, rectFromElement, preventPopoverFocusLoss, type AnchorRect } from './editors/useAnchoredPopover';
import { handleSafeCommentLinkClick } from './commentLinkSafety';
import type { CommentAccessMode } from '@/lib/domain/canvas/comments';

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

interface CommentRowProps {
  comment: CommentData;
  isActive: boolean;
  isEditing: boolean;
  currentUserId?: string;
  onSelect: () => void;
  onStartEdit: () => void;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
  onToggleStrikethrough: () => void;
  onDelete: () => void;
  // Per-comment text/highlight color. Replaces the old onOpenColorPicker
  // stub (which just cleared the color) with a real inline picker.
  onColorChange?: (commentId: string, textColor?: string, backgroundColor?: string) => void;
  // PATCH 8AD: this component has exactly one caller (EmbeddedCommentList),
  // so the permission gate lives directly here rather than behind a second
  // indirection. Defaults to 'manage' so every pre-existing caller (tests,
  // storybook-style mounts) keeps today's behavior unchanged.
  accessMode?: CommentAccessMode;
}

export default function CommentRow({
  comment,
  isActive,
  isEditing,
  currentUserId,
  onSelect,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onToggleStrikethrough,
  onDelete,
  onColorChange,
  accessMode = 'manage',
}: CommentRowProps) {
  const [localEditText, setLocalEditText] = useState('');
  const [shouldSelectText, setShouldSelectText] = useState(false);
  const editEditorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  const [colorPopupOpen, setColorPopupOpen] = useState(false);
  const [colorTriggerRect, setColorTriggerRect] = useState<AnchorRect | null>(null);
  const { popoverRef: colorPopoverRef, position: colorPosition } = useAnchoredPopover(colorPopupOpen, colorTriggerRect);

  // TipTap editor for editing
  const editEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
      }),
      TipTapTextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[20px] text-xs px-2 py-1',
      },
    },
  });

  editEditorRef.current = editEditor;

  // Set editor content when entering edit mode
  useEffect(() => {
    if (isEditing && editEditor && !editEditor.isDestroyed) {
      editEditor.commands.setContent(comment.text);
      setTimeout(() => {
        editEditor.commands.focus('end');
      }, 50);
    }
  }, [isEditing, comment.text, editEditor]);

  // Auto-select text when entering edit mode via pen tip button
  useEffect(() => {
    if (shouldSelectText && isEditing && editEditor && !editEditor.isDestroyed) {
      const timer = setTimeout(() => {
        editEditor.commands.selectAll();
      }, 60);
      setShouldSelectText(false);
      return () => clearTimeout(timer);
    }
  }, [shouldSelectText, isEditing, editEditor]);

  // Close the color popup if editing ends without it (save/cancel), so it
  // doesn't linger orphaned pointing at a row that's no longer editable.
  useEffect(() => {
    if (!isEditing) setColorPopupOpen(false);
  }, [isEditing]);

  const refocusEditor = () => {
    if (!editEditor || editEditor.isDestroyed) return;
    editEditor.commands.focus('end');
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    return `${days}d`;
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const handleSaveEdit = () => {
    if (!editEditor || editEditor.isDestroyed) return;
    const htmlContent = editEditor.getHTML();
    const textContent = editEditor.getText().trim();
    if (!textContent) return;
    onSaveEdit(htmlContent);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    }
    if (e.key === 'Escape') {
      onCancelEdit();
      if (editEditor && !editEditor.isDestroyed) {
        editEditor.commands.clearContent();
      }
    }
  };

  // READ users can never edit -- regardless of comment ownership. Folding
  // the access check into canEdit (rather than a separate check at each call
  // site) means the double-click-to-edit path and the Edit button's own
  // click handler share one gate instead of two that could drift apart.
  const canManage = accessMode === 'manage';
  const canEdit = canManage && comment.userId === currentUserId;

  return (
    <div
      className={`group/row flex gap-2 rounded-lg p-2 cursor-pointer transition-colors ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
        }`}
      onClick={onSelect}
      onDoubleClick={() => {
        if (canEdit) onStartEdit();
      }}
    >
      {/* Avatar */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
          {comment.userAvatar ? (
            <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full object-cover" />
          ) : (
            getInitial(comment.userName)
          )}
        </div>
        <span className="text-[9px] text-gray-400 leading-none">{getTimeAgo(comment.timestamp)}</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-xs font-medium text-gray-700 truncate">{comment.userName}</span>
        </div>
        {isEditing ? (
          <div
            className="relative"
            style={{
              color: comment.textColor || comment.color || undefined,
              backgroundColor: comment.backgroundColor || undefined,
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
              // The color popup renders outside this wrapper (portaled to
              // document.body) and its hex input auto-steals focus on
              // interaction -- that's a genuine blur, but not the user
              // clicking away, so don't save/exit-edit for it.
              if (colorPopupOpen) return;
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                handleSaveEdit();
              }
            }}
          >
            <EditorContent
              editor={editEditor}
              className="bg-white rounded border border-gray-200 focus-within:border-blue-400 min-h-[24px] max-h-[80px] overflow-auto"
              onKeyDown={handleKeyDown}
            />
          </div>
        ) : (
          <div
            className={`text-xs text-gray-600 whitespace-pre-wrap break-words leading-relaxed text-left [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer ${comment.isStrikethrough ? 'line-through opacity-60' : ''
              }`}
            style={{
              color: comment.textColor || comment.color,
              backgroundColor: comment.backgroundColor || undefined,
            }}
            onClick={(e) => {
              if (handleSafeCommentLinkClick(e)) return;
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
          />
        )}
      </div>

      {/* Actions - Fixed width column, always reserves space (MANAGE only --
          READ omits the whole column rather than disabling its buttons). */}
      {canManage && (
      <div className="flex flex-col gap-0.5 w-5 shrink-0">
        {/* Buttons only visible when active or hovering */}
        <div className={`flex flex-col gap-0.5 ${isActive ? 'visible' : 'invisible group-hover/row:visible'}`}>
          {isEditing && onColorChange ? (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (colorPopupOpen) {
                  setColorPopupOpen(false);
                  refocusEditor();
                } else {
                  setColorTriggerRect(rectFromElement(e.currentTarget));
                  setColorPopupOpen(true);
                }
              }}
              className="p-0.5 rounded transition-colors text-gray-400 hover:text-blue-500 hover:bg-blue-50"
              title="Color"
            >
              <Palette className="w-3 h-3" />
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (canEdit) {
                  setShouldSelectText(true);
                  onStartEdit();
                }
              }}
              className="p-0.5 rounded transition-colors text-gray-400 hover:text-blue-500 hover:bg-blue-50 disabled:opacity-30"
              title="Edit"
              disabled={!canEdit}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path>
                <path d="m15 5 4 4"></path>
              </svg>
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStrikethrough();
            }}
            className={`p-0.5 rounded transition-colors ${comment.isStrikethrough
                ? 'text-blue-500 bg-blue-50'
                : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
              }`}
            title="Strikethrough"
          >
            <Strikethrough className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-0.5 rounded transition-colors text-gray-400 hover:text-red-500 hover:bg-red-50"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
      )}

      {colorPopupOpen && onColorChange && createPortal(
        <div
          ref={colorPopoverRef}
          className="fixed z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
          style={{
            left: colorPosition?.left ?? -9999,
            top: colorPosition?.top ?? -9999,
            // opacity, not visibility: a visibility:hidden subtree is not
            // focusable, which would break click-to-focus on the hex input.
            opacity: colorPosition ? 1 : 0,
            pointerEvents: colorPosition ? 'auto' : 'none',
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={preventPopoverFocusLoss}
        >
          <TextStylePopup
            isOpen={true}
            onOpenChange={(open) => {
              if (!open) {
                setColorPopupOpen(false);
                refocusEditor();
              }
            }}
            onSelectHeading={() => {}}
            hideHeadingSelect={true}
            onSelectColor={(color) => onColorChange(comment.id, color, comment.backgroundColor)}
            onSelectHighlight={(color) => onColorChange(comment.id, comment.textColor, color === 'transparent' ? undefined : color)}
            currentHeading="normal"
            currentColor={comment.textColor || comment.color}
            currentHighlight={comment.backgroundColor}
          />
        </div>,
        document.body
      )}
    </div>
  );
}
