"use client";

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import NoteEditorToolbar from './NoteEditorToolbar';
import { toEditorHtml, fromEditorHtml } from '@/lib/domain/canvas/documentContentAdapter';
import type { SaveCardData } from '@/hooks/canvas/usePadletSave';

interface DocumentEditorProps {
  isOpen: boolean;
  title: string;
  initialContent: string;
  metadata: Record<string, any> | null;
  readOnly?: boolean;
  onSave: (data: SaveCardData) => void;
  onClose: () => void;
}

// PATCH-149B1b-i: dedicated Document wrapper around the shared TipTap core
// (PATCH-149 §22.3). Temporary save-on-close lifecycle -- PATCH-149B2 owns
// replacing this with explicit Save, dirty state and discard confirmation
// (PATCH-149 §22.4); do not extend this lifecycle here.
export default function DocumentEditor({
  isOpen,
  title: initialTitle,
  initialContent,
  metadata: initialMetadata,
  readOnly = false,
  onSave,
  onClose,
}: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialMetadata?.description || '');
  const [metadata, setMetadata] = useState(initialMetadata || {});

  useEffect(() => {
    if (isOpen) {
      setTitle(initialTitle);
      setDescription(initialMetadata?.description || '');
      setMetadata(initialMetadata || {});
    }
  }, [isOpen, initialTitle, initialMetadata]);

  const editor = useSharedTipTapEditor({
    initialContent: toEditorHtml(initialContent),
    editable: !readOnly,
  });

  const handleSaveAndClose = () => {
    if (!readOnly) {
      onSave({
        title,
        content: fromEditorHtml(editor?.getHTML()),
        metadata: { ...metadata, description },
      });
    }
    onClose();
  };

  if (!isOpen || !editor) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={handleSaveAndClose}
      role="dialog"
      aria-modal="true"
      aria-label={readOnly ? 'View document' : 'Edit document'}
    >
      <div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
        {!readOnly && (
          <div className="min-w-[72px]">
            <NoteEditorToolbar
              variant="document"
              mode="text"
              onModeChange={() => {}}
              onBold={() => editor.chain().focus().toggleBold().run()}
              onItalic={() => editor.chain().focus().toggleItalic().run()}
              onStrikethrough={() => editor.chain().focus().toggleStrike().run()}
              onUnderline={() => editor.chain().focus().toggleUnderline().run()}
              onBulletList={() => editor.chain().focus().toggleBulletList().run()}
              onOrderedList={() => editor.chain().focus().toggleOrderedList().run()}
              onCode={() => editor.chain().focus().toggleCodeBlock().run()}
              isBold={editor.isActive('bold')}
              isItalic={editor.isActive('italic')}
              isStrikethrough={editor.isActive('strike')}
              isUnderline={editor.isActive('underline')}
              isBulletList={editor.isActive('bulletList')}
              isOrderedList={editor.isActive('orderedList')}
              isCode={editor.isActive('codeBlock')}
            />
          </div>
        )}

        <div
          className="relative bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
          style={{ width: '640px', maxHeight: '80vh' }}
        >
          <div className="px-6 py-4 border-b flex items-center justify-between gap-4">
            {readOnly ? (
              <span className="text-lg font-semibold text-gray-800 truncate">
                {title || 'Untitled document'}
              </span>
            ) : (
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled document"
                className="flex-1 text-lg font-semibold text-gray-900 bg-transparent outline-none border-none placeholder:text-gray-300"
              />
            )}
            <button
              type="button"
              aria-label="Close"
              onClick={handleSaveAndClose}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            <EditorContent editor={editor} className="prose max-w-none" />
          </div>

          {!readOnly && (
            <div className="px-6 py-3 border-t">
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description..."
                className="w-full text-sm text-gray-500 bg-transparent outline-none border-none placeholder:text-gray-300"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
