"use client";

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import PostEditorShell, { useShellPanels, useShellSelection } from './PostEditorShell';
import { cycleEditorTextAlign } from './textAlignCycle';
import TextStylePopup from './TextStylePopup';
import SelectedTextContextMenu from './SelectedTextContextMenu';
import LinkPopup from './LinkPopup';
import CommentPopup from './CommentPopup';
import { ColorPickerContent } from '../ColorPicker';
import { contrastIconColor } from '../shells/CardShell';
import { toEditorHtml, fromEditorHtml } from '@/lib/domain/canvas/documentContentAdapter';
import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';
import type { SaveCardData, SaveCardResult } from '@/hooks/canvas/usePadletSave';

type Comment152 = { id: string; text: string; userId: string; userName: string; timestamp: number; textColor?: string; backgroundColor?: string; isStrikethrough?: boolean };

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
  accessMode?: CommentAccessMode;
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
  accessMode = 'manage',
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
  // PATCH 8AA -- Document anchored/highlighted comments are wired to today's
  // live READ/MANAGE model only. The dormant COMMENT tier is intentionally
  // treated as READ here until a real board-level comment role is deployed.
  const anchoredAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';
  const canManageAnchoredComments = anchoredAccessMode === 'manage';

  const editor = useSharedTipTapEditor({
    initialContent: toEditorHtml(initialContent),
    editable: !readOnly,
    onUpdate: readOnly ? undefined : () => forceBodyTick((c) => c + 1),
  });

  // PATCH-152 §4.3/§4.4: thread semantics ported narrowly from NoteEditor.tsx:180-204/316-371/407-445.
  const parseThreadFromAttrsForDomOpen = (attrs: { commentId?: string | null; commentThread?: string | null; commentText?: string | null; userId?: string | null; userName?: string | null; timestamp?: number | null }) => {
    const commentId = attrs.commentId || '';
    let comments: Comment152[] = [];
    if (attrs.commentThread) {
      try { const parsed = JSON.parse(attrs.commentThread); if (Array.isArray(parsed)) comments = parsed; } catch { /* ignore invalid thread payload */ }
    } else if (attrs.commentText) {
      comments = [{ id: commentId || `comment-${Date.now()}`, text: attrs.commentText, userId: attrs.userId || currentUserId || '', userName: attrs.userName || currentUserName || 'Anonymous', timestamp: attrs.timestamp || Date.now() }];
    }
    return { id: commentId, comments };
  };

  const openThreadFromCommentElement = (commentElement: HTMLElement): boolean => {
    const thread = parseThreadFromAttrsForDomOpen({
      commentId: commentElement.getAttribute('data-comment-id'),
      commentThread: commentElement.getAttribute('data-comment-thread'),
      commentText: commentElement.getAttribute('data-comment-text'),
      userId: commentElement.getAttribute('data-user-id'),
      userName: commentElement.getAttribute('data-user-name'),
      timestamp: Number(commentElement.getAttribute('data-timestamp')) || null,
    });
    if (!thread.id && thread.comments.length === 0) return false;
    setActiveThread(thread);
    // PATCH 8AP -- authorization for an EXISTING thread comes from
    // accessMode alone (see anchoredAccessMode below), never from
    // savedSelection; leaving any prior savedSelection untouched here is
    // safe because updateCommentThreadInDoc locates this thread's mark by
    // commentId, so a stale savedSelection is never consulted for a mark
    // that already exists in the document (only genuinely NEW anchor
    // creation via handleTextComment falls back to savedSelection, and that
    // path always sets it fresh in the same call that creates the new id).
    panels.openPanel('comment');
    return true;
  };

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
  const handleBodyClick = (event: React.MouseEvent) => {
    const commentTarget = (event.target as HTMLElement).closest?.('[data-comment-id]') as HTMLElement | null;
    if (commentTarget && openThreadFromCommentElement(commentTarget)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
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

  // KNI-R3: selected-text right-click menu; range captured at claim time, then restored via restoreSelection above before a command applies.
  const [selectedTextMenuPosition, setSelectedTextMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [selectedTextMenuRange, setSelectedTextMenuRange] = useState<{ from: number; to: number } | null>(null);
  const handleEditorContextMenu = (event: React.MouseEvent) => {
    if (!editor || !editor.isEditable || editor.state.selection.empty) return;
    const { from, to } = editor.state.selection;
    const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
    if (!hit || hit.pos < from || hit.pos > to) return;
    event.preventDefault(); event.stopPropagation();
    setSelectedTextMenuRange({ from, to }); setSelectedTextMenuPosition({ x: event.clientX, y: event.clientY });
  };
  const handleSelectedTextMenuColor = (color: string) => { if (restoreSelection(selectedTextMenuRange)) { setCurrentTextColor(color); editor?.chain().focus().setColor(color).run(); } };
  const handleSelectedTextMenuHighlight = (color: string) => { if (restoreSelection(selectedTextMenuRange)) { setCurrentHighlight(color); editor?.chain().focus().setHighlight({ color }).run(); } };
  const handleSelectedTextMenuClearHighlight = () => { if (restoreSelection(selectedTextMenuRange)) { setCurrentHighlight('transparent'); editor?.chain().focus().unsetHighlight().run(); } };
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
    panels.openPanel('link');
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
    if (!editor || !canManageAnchoredComments) return;
    const { from, to } = editor.state.selection;
    if (!editor.state.doc.textBetween(from, to, '').trim()) return;
    editor.chain().focus().setTextSelection({ from, to }).run();
    const attrs = editor.getAttributes('comment');
    setActiveThread(attrs?.commentId ? buildThreadFromAttrs(attrs) : { id: `comment-${Date.now()}`, comments: [] });
    setSavedSelection({ from, to });
    panels.openPanel('comment');
  };
  // PATCH 8AP -- ported narrowly from NoteEditor.tsx's updateCommentThreadInDoc/
  // removeCommentThreadFromDoc: locates an EXISTING mark by commentId via
  // doc.descendants and rewrites/removes it in place, independent of any
  // saved selection range. This is what lets existing-thread mutations
  // (edit/delete/strikethrough/color) work whether the thread was opened via
  // the toolbar (fresh selection) or by clicking an already-marked span
  // (savedSelection absent) -- only genuinely NEW anchor creation (no mark
  // yet exists for this id) needs a selection range, handled in
  // handleAddComment's fallback branch below.
  const updateCommentThreadInDoc = (
    commentId: string,
    nextComments: Comment152[],
    overrides?: Record<string, any>
  ): boolean => {
    if (!editor) return false;
    const { state, view } = editor;
    const { doc, tr } = state;
    let found = false;
    const lastComment = nextComments[nextComments.length - 1];
    doc.descendants((node, pos) => {
      const commentMark = node.marks.find((mark) => mark.type.name === 'comment' && mark.attrs.commentId === commentId);
      if (commentMark) {
        const newMark = state.schema.marks.comment.create({
          ...commentMark.attrs,
          ...overrides,
          commentThread: JSON.stringify(nextComments),
          commentText: lastComment?.text || commentMark.attrs.commentText,
          userId: lastComment?.userId || commentMark.attrs.userId,
          userName: lastComment?.userName || commentMark.attrs.userName,
          timestamp: lastComment?.timestamp || commentMark.attrs.timestamp,
        });
        tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
        tr.addMark(pos, pos + node.nodeSize, newMark);
        found = true;
      }
    });
    if (found) view.dispatch(tr);
    return found;
  };

  const removeCommentThreadFromDoc = (commentId: string) => {
    if (!editor) return;
    const { state, view } = editor;
    const { doc, tr } = state;
    doc.descendants((node, pos) => {
      const commentMark = node.marks.find((mark) => mark.type.name === 'comment' && mark.attrs.commentId === commentId);
      if (commentMark) tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
    });
    view.dispatch(tr);
  };

  const handleAddComment = (commentText: string) => {
    if (!editor || !canManageAnchoredComments || !commentText || !activeThread) return;
    const newComment: Comment152 = { id: `comment-${Date.now()}`, text: commentText, userId: currentUserId || '', userName: currentUserName || 'Anonymous', timestamp: Date.now() };
    const nextComments = [...activeThread.comments, newComment];
    const updated = updateCommentThreadInDoc(activeThread.id, nextComments);
    if (!updated) {
      // No existing mark for this thread id -- genuinely new anchor, which
      // requires the selection range captured by handleTextComment.
      if (!savedSelection) return;
      editor.chain().focus().setTextSelection(savedSelection).setComment({
        commentId: activeThread.id, commentText: newComment.text, commentThread: JSON.stringify(nextComments),
        userId: newComment.userId, userName: newComment.userName, timestamp: newComment.timestamp,
      }).run();
    }
    setActiveThread({ ...activeThread, comments: nextComments });
    setSavedSelection(null);
  };

  const handleEditComment = (commentId: string, newText: string) => {
    if (!editor || !canManageAnchoredComments || !newText || !activeThread) return;
    const nextComments = activeThread.comments.map((comment) =>
      comment.id === commentId ? { ...comment, text: newText } : comment
    );
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  const handleRemoveComment = (commentId: string) => {
    if (!editor || !canManageAnchoredComments || !activeThread) return;
    const nextComments = activeThread.comments.filter((comment) => comment.id !== commentId);
    if (nextComments.length === 0) {
      updateCommentThreadInDoc(activeThread.id, [], { commentText: '' });
      setActiveThread({ ...activeThread, comments: [] });
      return;
    }
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  const handleRemoveThread = () => {
    if (!editor || !canManageAnchoredComments || !activeThread) return;
    removeCommentThreadFromDoc(activeThread.id);
    setActiveThread(null);
    panels.closePanel('comment');
  };

  const handleToggleCommentStrikethrough = (commentId: string) => {
    if (!editor || !canManageAnchoredComments || !activeThread) return;
    const nextComments = activeThread.comments.map((comment) =>
      comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
    );
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  // Per-comment text/highlight color -- distinct from any text-span
  // highlight color; persisted into the same commentThread mark payload as
  // handleAddComment above so it survives alongside the rest of the thread.
  // PATCH 8AP -- no longer requires savedSelection: routes through
  // updateCommentThreadInDoc like every other existing-thread mutation.
  const handleCommentColor = (commentId: string, textColor?: string, backgroundColor?: string) => {
    if (!editor || !canManageAnchoredComments || !activeThread) return;
    const nextComments = activeThread.comments.map((comment) =>
      comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
    );
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  if (!isOpen || !editor) return null;

  const toolbarProps = {
    variant: 'document' as const,
    onTextStyle: () => panels.openPanel('textStyle'),
    onLink: handleLink,
    onTextComment: canManageAnchoredComments ? handleTextComment : undefined,
    onCardColor: () => panels.openPanel('cardColor'),
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
        <div className="relative" style={{ width: '640px' }}>
          <button
            type="button"
            aria-label="Close"
            onClick={attemptClose}
            className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <div
            className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
            style={{ maxHeight: '80vh' }}
          >
          {/* Top strip -- Title lives inside it, same as the canvas card's
              own top strip, matching every other post type's edit window
              (was a plain white bordered header, not respecting
              topStripColor at all). */}
          <div
            className="px-6 py-4 flex items-center justify-between gap-4"
            style={{ backgroundColor: topStripColor !== 'transparent' ? topStripColor : 'rgba(0,0,0,0.04)' }}
          >
            {readOnly ? (
              <span className="text-lg font-semibold truncate" style={{ color: topStripColor !== 'transparent' ? contrastIconColor(topStripColor) : '#1f2937' }}>
                {title || 'Untitled document'}
              </span>
            ) : (
              <input
                ref={titleInputRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Untitled document"
                className="flex-1 text-lg font-semibold bg-transparent outline-none border-none placeholder:opacity-40"
                style={{ color: topStripColor !== 'transparent' ? contrastIconColor(topStripColor) : '#1f2937' }}
              />
            )}
          </div>

          {saveError && <div role="alert" className="px-6 py-2 text-sm text-red-700 bg-red-50 border-b border-red-100">{saveError}</div>}

          <div className="flex-1 overflow-y-auto px-6 py-4" onClick={handleBodyClick} onContextMenu={handleEditorContextMenu}>
            <EditorContent editor={editor} className="prose max-w-none" />
          </div>

          {selectedTextMenuPosition && (
            <SelectedTextContextMenu
              open
              x={selectedTextMenuPosition.x}
              y={selectedTextMenuPosition.y}
              onOpenChange={(open) => { if (!open) { setSelectedTextMenuPosition(null); setSelectedTextMenuRange(null); } }}
              currentTextColor={currentTextColor}
              currentHighlightColor={currentHighlight}
              onTextColor={handleSelectedTextMenuColor}
              onHighlight={handleSelectedTextMenuHighlight}
              onClearHighlight={handleSelectedTextMenuClearHighlight}
            />
          )}

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
      }
      sharedPanel={
        <>
            {!readOnly && panels.open.textStyle && (
              <div className="relative" style={{ width: '300px' }}>
                <button onClick={() => panels.closePanel('textStyle')} className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600" title="Close">
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
                <TextStylePopup
                  isOpen={true}
                  onOpenChange={(open) => (open ? panels.openPanel('textStyle') : panels.closePanel('textStyle'))}
                  onSelectHeading={handleSelectHeading}
                  onSelectColor={handleSelectTextColor}
                  onSelectHighlight={handleSelectHighlight}
                  currentHeading={currentHeading}
                  currentColor={currentTextColor}
                  currentHighlight={currentHighlight}
                  hideCloseButton
                  onBold={() => editor.chain().focus().toggleBold().run()}
                  onItalic={() => editor.chain().focus().toggleItalic().run()}
                  onStrikethrough={() => editor.chain().focus().toggleStrike().run()}
                  onUnderline={() => editor.chain().focus().toggleUnderline().run()}
                  onBulletList={() => editor.chain().focus().toggleBulletList().run()}
                  onOrderedList={() => editor.chain().focus().toggleOrderedList().run()}
                  onCode={() => editor.chain().focus().toggleCodeBlock().run()}
                  onAlign={() => cycleEditorTextAlign(editor)}
                  isBold={editor.isActive('bold')}
                  isItalic={editor.isActive('italic')}
                  isStrikethrough={editor.isActive('strike')}
                  isUnderline={editor.isActive('underline')}
                  isBulletList={editor.isActive('bulletList')}
                  isOrderedList={editor.isActive('orderedList')}
                  isCode={editor.isActive('codeBlock')}
                />
                </div>
              </div>
            )}
            {!readOnly && panels.open.link && (
              // Fixed width matches the textStyle/comment panels above and
              // below -- otherwise LinkPopup's own min-w-[280px] lets it
              // size to content, and switching to/from a differently-sized
              // panel changes the shared-panel slot's width, re-centering
              // the whole toolbar/card/panel row and visibly shifting the
              // card out from under the user.
              <div style={{ width: '300px' }}>
                <LinkPopup
                  inline
                  isOpen={panels.open.link}
                  onOpenChange={(open) => (open ? panels.openPanel('link') : panels.closePanel('link'))}
                  onSubmit={handleAddLink}
                  onRemoveLink={handleRemoveLink}
                  initialUrl={linkViewUrl}
                />
              </div>
            )}
            {panels.open.comment && (
              <div style={{ width: '300px' }}>
                <CommentPopup
                  isOpen={panels.open.comment}
                  onOpenChange={(open) => (open ? panels.openPanel('comment') : panels.closePanel('comment'))}
                  onSubmit={guardCommentMutation(anchoredAccessMode, handleAddComment)}
                  onEditComment={guardCommentMutation(anchoredAccessMode, handleEditComment)}
                  onRemoveComment={guardCommentMutation(anchoredAccessMode, handleRemoveComment)}
                  onRemoveThread={guardCommentMutation(anchoredAccessMode, handleRemoveThread)}
                  onToggleCommentStrikethrough={guardCommentMutation(anchoredAccessMode, handleToggleCommentStrikethrough)}
                  onCommentColor={guardCommentMutation(anchoredAccessMode, handleCommentColor)}
                  comments={activeThread?.comments || []}
                  currentUserId={currentUserId}
                  currentUserName={currentUserName}
                  // PATCH 8AP -- authorization comes from accessMode alone now,
                  // never from savedSelection (see openThreadFromCommentElement's
                  // comment above for why that's safe for existing threads).
                  accessMode={anchoredAccessMode}
                />
              </div>
            )}
            {!readOnly && panels.open.cardColor && (
              <div className="relative h-fit self-start" style={{ width: '260px' }}>
                <button
                  onClick={() => panels.closePanel('cardColor')}
                  className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div
                  className="bg-white rounded-lg shadow-xl border border-gray-200 p-4"
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
              </div>
            )}
        </>
      }
    />
  );
}
