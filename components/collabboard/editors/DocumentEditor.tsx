"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import NoteEditorToolbar from './NoteEditorToolbar';
import DiscardChangesDialog from './DiscardChangesDialog';
import { toEditorHtml, fromEditorHtml } from '@/lib/domain/canvas/documentContentAdapter';
import type { SaveCardData, SaveCardResult } from '@/hooks/canvas/usePadletSave';

interface DocumentEditorProps {
  isOpen: boolean;
  title: string;
  initialContent: string;
  metadata: Record<string, any> | null;
  readOnly?: boolean;
  onSave: (data: SaveCardData) => Promise<SaveCardResult | void> | SaveCardResult | void;
  onClose: () => void;
}

// PATCH-149B2-i §32: explicit Save + dirty-state tracking against a saved baseline;
// Close/backdrop/Escape never save. Replaces the B1b-i §22.4 save-on-close lifecycle.
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
  const [baseline, setBaseline] = useState({ title: initialTitle, description: initialMetadata?.description || '', body: '' });
  const [, forceBodyTick] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const editor = useSharedTipTapEditor({
    initialContent: toEditorHtml(initialContent),
    editable: !readOnly,
    onUpdate: readOnly ? undefined : () => forceBodyTick((c) => c + 1),
  });
  // §23.15 (F3): primitives only, never the metadata object; also re-establishes the saved baseline for a new open session.
  useEffect(() => {
    if (!isOpen || !editor) return;
    const desc = initialMetadata?.description || '';
    setTitle(initialTitle);
    setDescription(desc);
    const html = toEditorHtml(initialContent);
    if (html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false });
    setBaseline({ title: initialTitle, description: desc, body: fromEditorHtml(editor.getHTML()) });
    setShowDiscardConfirm(false);
    setSaveError(null);
  }, [isOpen, editor, initialTitle, initialContent, initialMetadata?.description]);

  const currentBody = editor ? fromEditorHtml(editor.getHTML()) : '';
  const isDirty = !readOnly && (title !== baseline.title || description !== baseline.description || currentBody !== baseline.body);
  const attemptClose = () => {
    if (isSaving) return;
    if (isDirty) { setShowDiscardConfirm(true); return; }
    onClose();
  };
  const handleKeepEditing = () => { setShowDiscardConfirm(false); titleInputRef.current?.focus(); };
  const handleDiscardConfirmed = () => { setShowDiscardConfirm(false); onClose(); };
  const handleSave = async () => {
    if (readOnly || !isDirty || isSaving) return;
    setIsSaving(true);
    setSaveError(null);
    // Unrelated keys from the latest prop, not a stale open-time snapshot (§23.15 F3).
    const payload: SaveCardData = { title, content: currentBody, metadata: { ...(initialMetadata || {}), description } };
    let result: SaveCardResult | void;
    try { result = await onSave(payload); } catch (e) { result = { status: 'failed', error: e }; }
    const status = result && typeof result === 'object' && 'status' in result ? result.status : 'saved';
    if (status === 'failed') {
      setIsSaving(false);
      setSaveError('Failed to save. Please try again.');
      return;
    }
    // skipped-blank/deferred-placement close without updating baseline (§32.6).
    if (status === 'saved') setBaseline({ title, description, body: currentBody });
    setIsSaving(false);
    onClose();
  };
  useEffect(() => {
    if (!isOpen || !editor) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isSaving) return;
      if (showDiscardConfirm) { setShowDiscardConfirm(false); return; }
      if (isDirty) { setShowDiscardConfirm(true); return; }
      onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editor, isSaving, showDiscardConfirm, isDirty, onClose]);

  if (!isOpen || !editor) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={attemptClose}
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
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled document"
                className="flex-1 text-lg font-semibold text-gray-900 bg-transparent outline-none border-none placeholder:text-gray-300"
              />
            )}
            <div className="flex items-center gap-2 shrink-0">
              {!readOnly && (
                <button
                  type="button"
                  aria-label="Save document"
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={attemptClose}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {saveError && <div role="alert" className="px-6 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{saveError}</div>}

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

      {showDiscardConfirm && <DiscardChangesDialog onKeepEditing={handleKeepEditing} onDiscard={handleDiscardConfirmed} />}
    </div>
  );
}
