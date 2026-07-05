"use client";

import React, { useState, useEffect, useRef } from 'react';
import DOMPurify from 'dompurify';
import { Palette, Strikethrough, Trash2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle as TipTapTextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';

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
  onOpenColorPicker?: () => void;
  showColorButton?: boolean;
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
  onOpenColorPicker,
  showColorButton = false,
}: CommentRowProps) {
  const [localEditText, setLocalEditText] = useState('');
  const [shouldSelectText, setShouldSelectText] = useState(false);
  const editEditorRef = useRef<ReturnType<typeof useEditor> | null>(null);

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

  const canEdit = comment.userId === currentUserId;

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
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={(e) => {
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
            className={`text-xs text-gray-600 whitespace-pre-wrap break-words leading-relaxed text-left ${comment.isStrikethrough ? 'line-through opacity-60' : ''
              }`}
            style={{
              color: comment.textColor || comment.color,
              backgroundColor: comment.backgroundColor || undefined,
            }}
            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
          />
        )}
      </div>

      {/* Actions - Fixed width column, always reserves space */}
      <div className="flex flex-col gap-0.5 w-5 shrink-0">
        {/* Buttons only visible when active or hovering */}
        <div className={`flex flex-col gap-0.5 ${isActive ? 'visible' : 'invisible group-hover/row:visible'}`}>
          {isEditing && showColorButton ? (
            <button
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onOpenColorPicker?.();
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
    </div>
  );
}
