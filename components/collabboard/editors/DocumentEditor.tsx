"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import PostEditorShell, { useShellPanels, useShellSelection } from './PostEditorShell';
import TextStylePopup from './TextStylePopup';
import LinkPopup from './LinkPopup';
import CommentPopup from './CommentPopup';
import { ColorPickerContent } from '../ColorPicker';
import { toEditorHtml, fromEditorHtml } from '@/lib/domain/canvas/documentContentAdapter';
import type { SaveCardData, SaveCardResult } from '@/hooks/canvas/usePadletSave';

type Comment152 = { id: string; text: string; userId: string; userName: string; timestamp: number };

// Same palette Note's own Card Color picker uses (NoteEditor.tsx) -- kept as
// a local copy, matching this codebase's existing convention of each editor
// owning its own preset list rather than a shared module.
const BACKGROUND_COLORS = [
  '#ffffff', '#f3f4f6', '#fee2e2', '#ffedd5', '#fef3c7',
  '#dcfce7', '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3',
];
const TOP_STRIP_COLORS = [
  'transparent', '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280', '#1f2937',
];
// Matches CardPreview.tsx's own fallback defaults for a Document card.
const DEFAULT_BACKGROUND_COLOR = '#ffffff';
const DEFAULT_TOP_STRIP_COLOR = '#4f46e5';

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

// PATCH-152 targeted correction: closing (backdrop/X/Escape) always saves a
// dirty document first, then closes -- no explicit Save button, no discard
// confirmation. Replaces the PATCH-149B2-i §32 explicit-Save-button lifecycle.
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
  const [backgroundColor, setBackgroundColor] = useState(initialMetadata?.backgroundColor || DEFAULT_BACKGROUND_COLOR);
  const [topStripColor, setTopStripColor] = useState(initialMetadata?.topStripColor || DEFAULT_TOP_STRIP_COLOR);
  const [activeColorTab, setActiveColorTab] = useState<'background' | 'topstrip'>('background');
  const [baseline, setBaseline] = useState({
    title: initialTitle,
    description: initialMetadata?.description || '',
    body: '',
    backgroundColor: initialMetadata?.backgroundColor || DEFAULT_BACKGROUND_COLOR,
    topStripColor: initialMetadata?.topStripColor || DEFAULT_TOP_STRIP_COLOR,
  });
  const [, forceBodyTick] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const panels = useShellPanels(); // PATCH-152 §24.6/24.10: coordinated via the shared shell's panel hook
  const [currentHeading, setCurrentHeading] = useState('normal');
  const [currentTextColor, setCurrentTextColor] = useState('#1a1a1a');
  const [currentHighlight, setCurrentHighlight] = useState('transparent');
  const [linkViewUrl, setLinkViewUrl] = useState('');
  const [activeThread, setActiveThread] = useState<{ id: string; comments: Comment152[] } | null>(null);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);

  const editor = useSharedTipTapEditor({
    initialContent: toEditorHtml(initialContent),
    editable: !readOnly,
    onUpdate: readOnly ? undefined : () => forceBodyTick((c) => c + 1),
  });

  // PATCH-152 targeted correction: read-only links stay clickable (opened
  // safely in a new tab) even though the shared extension registry disables
  // in-editor navigation (Link.configure({ openOnClick: false }), so editing
  // near a link never accidentally navigates away). A plain DOM click
  // handler on the body wrapper -- not TipTap's editorProps.handleClick --
  // since ProseMirror's own click routing resolves a document position from
  // layout coordinates first and only then calls handleClick, which is not
  // exercised by a synthetic click in a layout-free environment. This only
  // activates when readOnly; it never places a cursor, opens a panel, or
  // mutates document/selection state -- it just hands the href to the
  // browser. Read-only-only (not reactive) is safe here: readOnly is fixed
  // for the lifetime of a given open session (CanvasModals remounts the
  // editor via a key change whenever the destination differs).
  const handleReadOnlyBodyClick = (event: React.MouseEvent) => {
    if (!readOnly) return;
    const anchor = (event.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null;
    if (!anchor) return;
    event.preventDefault();
    window.open(anchor.href, '_blank', 'noopener,noreferrer');
  };

  const { hasSelection, lastSelection } = useShellSelection(editor); // PATCH-152 §24.11: shared shell mechanism

  // §24.11: restores the stored range before Link/Text-style apply; no-op if current, fails safe if invalid.
  const restoreSelection = (range: { from: number; to: number } | null): boolean => {
    if (!editor || !range) return false;
    if (editor.state.selection.from === range.from && editor.state.selection.to === range.to) return true;
    if (range.from < 0 || range.to > editor.state.doc.content.size || range.from > range.to) return false;
    editor.chain().setTextSelection(range).run(); return true;
  };

  // §23.15 (F3): primitives only, never the metadata object; also re-establishes the saved baseline for a new open session.
  useEffect(() => {
    if (!isOpen || !editor) return;
    const desc = initialMetadata?.description || '';
    const bg = initialMetadata?.backgroundColor || DEFAULT_BACKGROUND_COLOR;
    const ts = initialMetadata?.topStripColor || DEFAULT_TOP_STRIP_COLOR;
    setTitle(initialTitle);
    setDescription(desc);
    setBackgroundColor(bg);
    setTopStripColor(ts);
    const html = toEditorHtml(initialContent);
    if (html !== editor.getHTML()) editor.commands.setContent(html, { emitUpdate: false });
    setBaseline({ title: initialTitle, description: desc, body: fromEditorHtml(editor.getHTML()), backgroundColor: bg, topStripColor: ts });
    setSaveError(null);
  }, [isOpen, editor, initialTitle, initialContent, initialMetadata?.description, initialMetadata?.backgroundColor, initialMetadata?.topStripColor]);

  const currentBody = editor ? fromEditorHtml(editor.getHTML()) : '';
  const isDirty = !readOnly && (
    title !== baseline.title
    || description !== baseline.description
    || currentBody !== baseline.body
    || backgroundColor !== baseline.backgroundColor
    || topStripColor !== baseline.topStripColor
  );
  // §34.5: ref-guarded so an unstable parent callback identity cannot re-fire
  // this without a genuine clean<->dirty transition (Design A measured unsafe).
  const lastReportedDirty = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastReportedDirty.current === isDirty) return;
    lastReportedDirty.current = isDirty;
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);
  // PATCH-152 targeted correction: closing (backdrop, X, Escape) always saves
  // first when dirty -- no explicit Save button, no discard confirmation.
  // onClose only fires once persistence completes (or immediately when there
  // is nothing to save), so content is never lost and the editor never closes
  // ahead of the write.
  const attemptClose = async () => {
    if (isSaving) return;
    if (readOnly || !isDirty) { onClose(); return; }
    setIsSaving(true);
    setSaveError(null);
    // Unrelated keys from the latest prop, not a stale open-time snapshot (§23.15 F3).
    const payload: SaveCardData = {
      title,
      content: currentBody,
      metadata: {
        ...(initialMetadata || {}),
        description,
        backgroundColor: backgroundColor !== DEFAULT_BACKGROUND_COLOR ? backgroundColor : undefined,
        topStripColor: topStripColor !== DEFAULT_TOP_STRIP_COLOR ? topStripColor : undefined,
      },
    };
    let result: SaveCardResult | void;
    try { result = await onSave(payload); } catch (e) { result = { status: 'failed', error: e }; }
    const status = result && typeof result === 'object' && 'status' in result ? result.status : 'saved';
    if (status === 'failed') {
      setIsSaving(false);
      setSaveError('Failed to save. Please try again.');
      return;
    }
    // skipped-blank/deferred-placement close without updating baseline (§32.6).
    if (status === 'saved') setBaseline({ title, description, body: currentBody, backgroundColor, topStripColor });
    setIsSaving(false);
    onClose();
  };
  useEffect(() => {
    if (!isOpen || !editor) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isSaving) return;
      void attemptClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editor, isSaving, attemptClose]);

  // PATCH-152 §4.1: heading/color/highlight semantics ported narrowly from NoteEditor.tsx:561-617.
  const handleSelectHeading = (level: string) => {
    if (!editor) return;
    restoreSelection(lastSelection);
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
  const handleSelectTextColor = (color: string) => { restoreSelection(lastSelection); setCurrentTextColor(color); editor?.chain().focus().setColor(color).run(); };
  const handleSelectHighlight = (color: string) => {
    restoreSelection(lastSelection);
    setCurrentHighlight(color);
    if (color === 'transparent') editor?.chain().focus().unsetHighlight().run();
    else editor?.chain().focus().setHighlight({ color }).run();
  };

  // PATCH-152 §4.2/§24.10-24.11: link workflow via the shell's panel exclusivity; restores the stored range before applying (§24.4/10).
  const handleLink = () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    if (!editor.state.doc.textBetween(from, to, '').trim()) return;
    const linkMark = editor.getAttributes('link');
    setLinkViewUrl(linkMark?.href || '');
    panels.openPanel('link', ['textStyle', 'comment', 'cardColor']);
  };
  const handleAddLink = (url: string) => { if (!url || !editor || !restoreSelection(lastSelection)) return; editor.chain().focus().setLink({ href: url }).run(); };
  const handleRemoveLink = () => { if (!editor || !restoreSelection(lastSelection)) return; editor.chain().focus().unsetLink().run(); };

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
    panels.openPanel('comment', ['textStyle', 'link', 'cardColor']);
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

  const toolbarProps = {
    variant: 'document' as const,
    onBold: () => editor.chain().focus().toggleBold().run(),
    onItalic: () => editor.chain().focus().toggleItalic().run(),
    onStrikethrough: () => editor.chain().focus().toggleStrike().run(),
    onUnderline: () => editor.chain().focus().toggleUnderline().run(),
    onBulletList: () => editor.chain().focus().toggleBulletList().run(),
    onOrderedList: () => editor.chain().focus().toggleOrderedList().run(),
    onCode: () => editor.chain().focus().toggleCodeBlock().run(),
    onTextStyle: () => panels.openPanel('textStyle', ['link', 'comment', 'cardColor']),
    onLink: handleLink,
    onTextComment: handleTextComment,
    onCardColor: () => panels.openPanel('cardColor', ['textStyle', 'link', 'comment']),
    isBold: editor.isActive('bold'), isItalic: editor.isActive('italic'),
    isStrikethrough: editor.isActive('strike'), isUnderline: editor.isActive('underline'),
    isBulletList: editor.isActive('bulletList'), isOrderedList: editor.isActive('orderedList'),
    isCode: editor.isActive('codeBlock'),
    isLink: editor.isActive('link'),
    isComment: editor.isActive('comment'),
  };

  return (
    <PostEditorShell
      isOpen={isOpen}
      onBackdropClick={attemptClose}
      role="dialog"
      ariaModal
      ariaLabel={readOnly ? 'View document' : 'Edit document'}
      showToolbar={!readOnly}
      hasSelection={hasSelection}
      selectionIndicator={panels.open.textStyle || panels.open.link || panels.open.comment}
      selectionEditor={editor}
      selectionRange={lastSelection}
      toolbar={toolbarProps}
      centre={
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

          <div className="flex-1 overflow-y-auto px-6 py-4" onClick={handleReadOnlyBodyClick}>
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
      }
      sharedPanel={
        !readOnly && (
          <>
            {panels.open.textStyle && (
              <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 relative" style={{ width: '300px' }}>
                <button onClick={() => panels.closePanel('textStyle')} className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-100" title="Close">
                  <X className="w-3 h-3 text-gray-400" />
                </button>
                <TextStylePopup
                  isOpen={true}
                  onOpenChange={(open) => (open ? panels.openPanel('textStyle', ['link', 'comment', 'cardColor']) : panels.closePanel('textStyle'))}
                  onSelectHeading={handleSelectHeading}
                  onSelectColor={handleSelectTextColor}
                  onSelectHighlight={handleSelectHighlight}
                  currentHeading={currentHeading}
                  currentColor={currentTextColor}
                  currentHighlight={currentHighlight}
                  hideCloseButton
                />
              </div>
            )}
            <LinkPopup
              inline
              isOpen={panels.open.link}
              onOpenChange={(open) => (open ? panels.openPanel('link', ['textStyle', 'comment', 'cardColor']) : panels.closePanel('link'))}
              onSubmit={handleAddLink}
              onRemoveLink={handleRemoveLink}
              initialUrl={linkViewUrl}
            />
            {panels.open.comment && (
              <div style={{ width: '300px' }}>
                <CommentPopup
                  isOpen={panels.open.comment}
                  onOpenChange={(open) => (open ? panels.openPanel('comment', ['textStyle', 'link', 'cardColor']) : panels.closePanel('comment'))}
                  onSubmit={handleAddComment}
                  comments={activeThread?.comments || []}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                />
              </div>
            )}
            {panels.open.cardColor && (
              <div
                className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 h-fit self-start"
                style={{ width: '260px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Document Color</span>
                  <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                    <button
                      onClick={() => setActiveColorTab('background')}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeColorTab === 'background'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                      title="Background Color"
                    >
                      BG
                    </button>
                    <button
                      onClick={() => setActiveColorTab('topstrip')}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeColorTab === 'topstrip'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                      title="Top Strip Color"
                    >
                      TS
                    </button>
                  </div>
                </div>
                <div className="mb-0">
                  <ColorPickerContent
                    color={activeColorTab === 'background' ? backgroundColor : topStripColor}
                    onChange={(c) => (activeColorTab === 'background' ? setBackgroundColor(c) : setTopStripColor(c))}
                    hasOpacity={true}
                    presets={activeColorTab === 'background' ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
                  />
                </div>
              </div>
            )}
          </>
        )
      }
    />
  );
}
