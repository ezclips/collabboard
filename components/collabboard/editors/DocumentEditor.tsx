"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import NoteEditorToolbar from './NoteEditorToolbar';
import TextStylePopup from './TextStylePopup';
import LinkPopup from './LinkPopup';
import CommentPopup from './CommentPopup';
import DiscardChangesDialog from './DiscardChangesDialog';
import { toEditorHtml, fromEditorHtml } from '@/lib/domain/canvas/documentContentAdapter';
import type { SaveCardData, SaveCardResult } from '@/hooks/canvas/usePadletSave';

type Comment152 = { id: string; text: string; userId: string; userName: string; timestamp: number };

interface DocumentEditorProps {
  isOpen: boolean;
  title: string;
  initialContent: string;
  metadata: Record<string, any> | null;
  readOnly?: boolean;
  onSave: (data: SaveCardData) => Promise<SaveCardResult | void> | SaveCardResult | void;
  onClose: () => void;
  // PATCH-149B2-ii §34.4: fires only on clean<->dirty transitions (ref-guarded).
  onDirtyChange?: (isDirty: boolean) => void;
  // PATCH-152 §4.3 (OQ-2 Route B): real authenticated identity for Comment.
  currentUserId?: string;
  currentUserName?: string;
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
  onDirtyChange,
  currentUserId,
  currentUserName,
}: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialMetadata?.description || '');
  const [baseline, setBaseline] = useState({ title: initialTitle, description: initialMetadata?.description || '', body: '' });
  const [, forceBodyTick] = useState(0);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // PATCH-152 §4.1-4.4: toolbar popup state, ported narrowly from NoteEditor.
  const [, forceSelectionTick] = useState(0);
  const [textStyleOpen, setTextStyleOpen] = useState(false);
  const [currentHeading, setCurrentHeading] = useState('normal');
  const [currentTextColor, setCurrentTextColor] = useState('#1a1a1a');
  const [currentHighlight, setCurrentHighlight] = useState('transparent');
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [linkViewUrl, setLinkViewUrl] = useState('');
  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [activeThread, setActiveThread] = useState<{ id: string; comments: Comment152[] } | null>(null);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);

  const editor = useSharedTipTapEditor({
    initialContent: toEditorHtml(initialContent),
    editable: !readOnly,
    onUpdate: readOnly ? undefined : () => forceBodyTick((c) => c + 1),
  });

  // PATCH-152 §2 OQ-3: local, Document-only selection reactivity -- deliberate, scoped divergence; Note is unfixed.
  useEffect(() => {
    if (!editor) return;
    const handleSelectionUpdate = () => forceSelectionTick((c) => c + 1);
    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => { editor.off('selectionUpdate', handleSelectionUpdate); };
  }, [editor]);

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
  // §34.5: ref-guarded so an unstable parent callback identity cannot re-fire
  // this without a genuine clean<->dirty transition (Design A measured unsafe).
  const lastReportedDirty = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastReportedDirty.current === isDirty) return;
    lastReportedDirty.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
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

  // PATCH-152 §4.1: heading/color/highlight semantics ported narrowly from NoteEditor.tsx:561-617.
  const handleSelectHeading = (level: string) => {
    if (!editor) return;
    setCurrentHeading(level);
    editor.chain().focus().clearNodes().unsetFontSize().run();
    switch (level) {
      case 'h1': editor.chain().focus().toggleHeading({ level: 1 }).run(); break;
      case 'h2': editor.chain().focus().toggleHeading({ level: 2 }).run(); break;
      case 'normal': editor.chain().focus().setParagraph().setFontSize('14px').run(); break;
      case 'small': editor.chain().focus().setParagraph().setFontSize('12px').setColor('#6b7280').run(); break;
      case 'code': editor.chain().focus().toggleCodeBlock().run(); break;
      case 'callout': {
        editor.chain().focus().setParagraph().run();
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, ' ');
        if (!text.startsWith('⚠')) editor.chain().focus().insertContentAt(from, '⚠ ').setHighlight({ color: '#fef3c7' }).run();
        else editor.chain().focus().setHighlight({ color: '#fef3c7' }).run();
        break;
      }
      case 'quote': editor.chain().focus().toggleBlockquote().run(); break;
      default: editor.chain().focus().setParagraph().run();
    }
  };
  const handleSelectTextColor = (color: string) => { setCurrentTextColor(color); editor?.chain().focus().setColor(color).run(); };
  const handleSelectHighlight = (color: string) => {
    setCurrentHighlight(color);
    if (color === 'transparent') editor?.chain().focus().unsetHighlight().run();
    else editor?.chain().focus().setHighlight({ color }).run();
  };

  // PATCH-152 §4.2: link workflow ported narrowly from NoteEditor.tsx:279-313.
  const handleLink = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (!editor.state.doc.textBetween(from, to, '').trim()) return;
    const linkMark = editor.getAttributes('link');
    setLinkViewUrl(linkMark?.href || '');
    setTextStyleOpen(false);
    setCommentPopupOpen(false);
    setLinkPopupOpen(true);
  };
  const handleAddLink = (url: string) => { if (url && editor) editor.chain().focus().setLink({ href: url }).run(); };
  const handleRemoveLink = () => { editor?.chain().focus().unsetLink().run(); };

  // PATCH-152 §4.3/§4.4: thread semantics ported narrowly from NoteEditor.tsx:180-204/316-371/407-445.
  const buildThreadFromAttrs = (attrs: { commentId?: string | null; commentThread?: string | null; commentText?: string | null; userId?: string | null; userName?: string | null; timestamp?: number | null }) => {
    const commentId = attrs.commentId || '';
    let comments: Comment152[] = [];
    if (attrs.commentThread) {
      try { const parsed = JSON.parse(attrs.commentThread); if (Array.isArray(parsed)) comments = parsed; } catch { /* ignore invalid thread payload */ }
    } else if (attrs.commentText) {
      comments = [{ id: commentId || `comment-${Date.now()}`, text: attrs.commentText, userId: attrs.userId || currentUserId || '', userName: attrs.userName || currentUserName || 'Anonymous', timestamp: attrs.timestamp || Date.now() }];
    }
    return { id: commentId, comments };
  };
  const handleTextComment = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (!editor.state.doc.textBetween(from, to, '').trim()) return;
    editor.chain().focus().setTextSelection({ from, to }).run();
    const attrs = editor.getAttributes('comment');
    setActiveThread(attrs?.commentId ? buildThreadFromAttrs(attrs) : { id: `comment-${Date.now()}`, comments: [] });
    setSavedSelection({ from, to });
    setTextStyleOpen(false);
    setLinkPopupOpen(false);
    setCommentPopupOpen(true);
  };
  const handleAddComment = (commentText: string) => {
    if (!editor || !commentText || !activeThread || !savedSelection) return;
    const newComment: Comment152 = { id: `comment-${Date.now()}`, text: commentText, userId: currentUserId || '', userName: currentUserName || 'Anonymous', timestamp: Date.now() };
    const nextComments = [...activeThread.comments, newComment];
    editor.chain().focus().setTextSelection(savedSelection).setComment({
      commentId: activeThread.id, commentText: newComment.text, commentThread: JSON.stringify(nextComments),
      userId: newComment.userId, userName: newComment.userName, timestamp: newComment.timestamp,
    }).run();
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  if (!isOpen || !editor) return null;

  const hasSelection = !editor.state.selection.empty;

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
          <div className="relative min-w-[72px]">
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
              onTextStyle={() => { setLinkPopupOpen(false); setCommentPopupOpen(false); setTextStyleOpen(true); }}
              onLink={handleLink}
              onTextComment={handleTextComment}
              isBold={editor.isActive('bold')}
              isItalic={editor.isActive('italic')}
              isStrikethrough={editor.isActive('strike')}
              isUnderline={editor.isActive('underline')}
              isBulletList={editor.isActive('bulletList')}
              isOrderedList={editor.isActive('orderedList')}
              isCode={editor.isActive('codeBlock')}
              isLink={editor.isActive('link')}
              isComment={editor.isActive('comment')}
              hasSelection={hasSelection}
            />
            {textStyleOpen && (
              <div className="absolute left-full top-0 ml-2 z-[60] bg-white rounded-lg shadow-xl border border-gray-200 p-4" style={{ width: '300px' }}>
                <button onClick={() => setTextStyleOpen(false)} className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-100">
                  <X className="w-3 h-3 text-gray-400" />
                </button>
                <TextStylePopup
                  isOpen={true}
                  onOpenChange={setTextStyleOpen}
                  onSelectHeading={handleSelectHeading}
                  onSelectColor={handleSelectTextColor}
                  onSelectHighlight={handleSelectHighlight}
                  currentHeading={currentHeading}
                  currentColor={currentTextColor}
                  currentHighlight={currentHighlight}
                />
              </div>
            )}
            <LinkPopup
              isOpen={linkPopupOpen}
              onOpenChange={setLinkPopupOpen}
              onSubmit={handleAddLink}
              onRemoveLink={handleRemoveLink}
              initialUrl={linkViewUrl}
            />
            {commentPopupOpen && (
              <div className="absolute left-full top-0 ml-2 z-[60]" style={{ width: '300px' }}>
                <CommentPopup
                  isOpen={commentPopupOpen}
                  onOpenChange={setCommentPopupOpen}
                  onSubmit={handleAddComment}
                  comments={activeThread?.comments || []}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                />
              </div>
            )}
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
