"use client";

import React, { useState, useEffect, useRef } from 'react';
import { EditorContent, useSharedTipTapEditor } from './useSharedTipTapEditor';
import PostEditorShell, { useShellPanels, useShellSelection } from './PostEditorShell';
import { cycleEditorTextAlign, nextTextAlign } from './textAlignCycle';
import TextStylePopup from './TextStylePopup';
import EmojiReactionPicker from './EmojiReactionPicker';
import LinkPopup from './LinkPopup';
import CommentPopup from './CommentPopup';
import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';
import { Palette, PenTool, X, Strikethrough, Trash2 } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';
import { CAPTION_STYLE_PRESETS, resolveCaptionStyle, type CaptionHeading, type CaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { contrastIconColor } from '../shells/CardShell';

const BACKGROUND_COLORS = [
  "#ffffff", "#f3f4f6", "#fee2e2", "#ffedd5", "#fef3c7",
  "#dcfce7", "#dbeafe", "#e0e7ff", "#f3e8ff", "#fce7f3",
];

const TOP_STRIP_COLORS = [
  "transparent", "#ef4444", "#f97316", "#eab308", "#22c55e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1f2937",
];

const BADGE_COLORS = [
  "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04",
  "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563",
  "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c",
  "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777",
  "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb",
  "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a",
  "#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea",
  "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488",
];

interface InlineComment {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: number;
  color?: string;
  textColor?: string;
  backgroundColor?: string;
  isStrikethrough?: boolean;
}

interface DetachedCommentData {
  id: string;
  text: string;
  userId: string;
  userName: string;
  timestamp: number;
  isStrikethrough?: boolean;
  textColor?: string;
  backgroundColor?: string;
}

// Shape matches CommentPopup.tsx's own commentTitleStyle/onCommentTitleStyleChange
// prop types exactly (color/backgroundColor only) -- distinct from CaptionStyle
// (which covers the POST title's own styling, a different metadata field).
type CommentTitleStyle = { color?: string; backgroundColor?: string };

interface NoteEditorProps {
  initialTitle?: string;
  initialContent?: string;
  initialDetachedComments?: DetachedCommentData[];
  initialBadgeColor?: string;
  initialTextColor?: string;
  initialTitleStyle?: CaptionStyle;
  // PATCH 8P.1 -- the Comments PANEL's own title/style (metadata.commentTitle /
  // metadata.commentTitleStyle), distinct from the Note POST's own title
  // (initialTitle/initialTitleStyle above). Matches the field names already
  // used by every other canonical caller (FreeformPadletCards.tsx's Note
  // sites, Clipart, Image).
  initialCommentTitle?: string;
  initialCommentTitleStyle?: CommentTitleStyle;
  // PATCH 8P.1 -- real authenticated identity for newly created detached
  // comments (Category A only). Defaults preserve prior behavior for any
  // caller that hasn't been updated, same convention as
  // ClipartCardDraftModal.tsx's currentUserId/currentUserName.
  currentUserId?: string;
  currentUserName?: string;
  onSave: (data: {
    title?: string;
    content: string;
    cardColor?: string;
    topStrip?: string;
    textColor?: string;
    reactions?: string[];
    badgeColor?: string;
    detachedComments?: DetachedCommentData[];
    titleStyle?: CaptionStyle;
    commentTitle?: string;
    commentTitleStyle?: CommentTitleStyle;
  }) => void;
  onClose: () => void;
  isOpen: boolean;
  // PATCH 8P -- access mode for the normal/detached post-comment panel
  // (Category A). PATCH 8AB extends this same prop to also gate the
  // selected-text/anchored comment thread popup further down (via the
  // derived `anchoredAccessMode`/`canManageAnchoredComments` below) -- both
  // systems share one board-level mode, there is no separate anchored-only
  // signal. Defaults to 'manage' so every existing caller that has not been
  // updated keeps its exact current (fully writable) behavior, same
  // convention as every other canonical caller (ClipartCardDraftModal.tsx,
  // FreeformPadletCards.tsx).
  accessMode?: CommentAccessMode;
}

// PATCH-152 §22.6 (Route D2): a stable module-level reference so an omitted
// prop can never recreate a fresh array each render -- the :147-152 sync
// effect below compares this reference, and an unstable one would wipe
// locally added detached comments on the very next render.
const EMPTY_DETACHED_COMMENTS: NonNullable<NoteEditorProps['initialDetachedComments']> = [];

export default function NoteEditor({
  initialTitle = '',
  initialContent = '',
  initialDetachedComments = EMPTY_DETACHED_COMMENTS,
  initialBadgeColor = '#facc15',
  initialTextColor = '#1F2937',
  initialTitleStyle,
  initialCommentTitle,
  initialCommentTitleStyle,
  currentUserId = 'anon',
  currentUserName = 'You',
  onSave,
  onClose,
  isOpen,
  accessMode = 'manage',
}: NoteEditorProps) {
  const panels = useShellPanels();
  const [title, setTitle] = useState(initialTitle);
  // Title's own style, independent of the TipTap content's rich-text marks
  // -- `activeStyleTarget` tracks whether the Text style panel is currently
  // formatting the title or the note body, same click-to-target pattern as
  // Todo's per-item color. Defaults to 'content' so existing behaviour
  // (panel always acted on the editor selection) is unchanged until the
  // user actually clicks into the title.
  const [titleStyle, setTitleStyle] = useState<CaptionStyle>(initialTitleStyle || {});
  const [activeStyleTarget, setActiveStyleTarget] = useState<'title' | 'content'>('content');
  useEffect(() => {
    setTitleStyle(initialTitleStyle || {});
  }, [initialTitleStyle]);
  // PATCH 8P.1 -- the Comments PANEL's own title/style (Category A only).
  const [commentTitle, setCommentTitle] = useState(initialCommentTitle);
  const [commentTitleStyle, setCommentTitleStyle] = useState<CommentTitleStyle>(initialCommentTitleStyle || {});
  useEffect(() => {
    setCommentTitle(initialCommentTitle);
  }, [initialCommentTitle]);
  useEffect(() => {
    setCommentTitleStyle(initialCommentTitleStyle || {});
  }, [initialCommentTitleStyle]);
  const [cardColor, setCardColor] = useState('#FFFFFF');
  const [topStrip, setTopStrip] = useState<string | null>(null);
  const [textColor, setTextColor] = useState(initialTextColor);
  const [reactions, setReactions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'background' | 'topstrip'>('background');

  const [linkViewUrl, setLinkViewUrl] = useState('');
  const [commentPopupPosition, setCommentPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);
  const [activeThread, setActiveThread] = useState<{
    id: string;
    comments: InlineComment[];
    color?: string;
  } | null>(null);
  // Detached comments - stored separately from inline text
  const [detachedComments, setDetachedComments] = useState(initialDetachedComments);
  const [detachedPopupPosition, setDetachedPopupPosition] = useState({ x: 0, y: 0 });
  const [detachedColorPickerOpen, setDetachedColorPickerOpen] = useState(false);
  const [textCommentColorPickerOpen, setTextCommentColorPickerOpen] = useState(false);
  const [newDetachedText, setNewDetachedText] = useState('');
  const [editingDetachedId, setEditingDetachedId] = useState<string | null>(null);
  const [editingDetachedText, setEditingDetachedText] = useState('');
  const [activeDetachedId, setActiveDetachedId] = useState<string | null>(null);
  const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
  const noteCardRef = useRef<HTMLDivElement | null>(null);

  // Sync detachedComments when initialDetachedComments changes (e.g., when opening a different padlet)
  // Use functional update to bail out when contents match — prevents infinite loops
  // if a caller passes an unstable array reference (e.g. `|| []` on every render).
  useEffect(() => {
    setDetachedComments(prev => {
      if (JSON.stringify(prev) === JSON.stringify(initialDetachedComments)) return prev;
      return initialDetachedComments;
    });
  }, [initialDetachedComments]);

  const [badgeColor, setBadgeColor] = useState(initialBadgeColor);

  // PATCH 8AB -- the selected-text/anchored comment thread system reuses the
  // same live READ/MANAGE model already threaded into `accessMode` for the
  // normal/detached panel above (CanvasModals.tsx passes one board-level
  // commentAccessMode into both). The dormant COMMENT tier is intentionally
  // collapsed into 'read' here, same as DocumentEditor.tsx's anchoredAccessMode.
  const anchoredAccessMode: CommentAccessMode = accessMode === 'manage' ? 'manage' : 'read';
  const canManageAnchoredComments = anchoredAccessMode === 'manage';

  // Update textColor when initialTextColor changes
  useEffect(() => {
    setTextColor(initialTextColor);
  }, [initialTextColor]);

  // Text styling state
  const [currentHeading, setCurrentHeading] = useState('normal');
  const [currentTextColor, setCurrentTextColor] = useState('#1a1a1a');
  const [currentHighlight, setCurrentHighlight] = useState('transparent');

  const parseCommentThread = (threadRaw: string | null, fallback?: InlineComment) => {
    if (threadRaw) {
      try {
        const parsed = JSON.parse(threadRaw) as InlineComment[];
        if (Array.isArray(parsed)) {
          return parsed.filter((item) => item && typeof item.text === 'string');
        }
      } catch {
        // Ignore invalid thread payloads
      }
    }
    return fallback ? [fallback] : [];
  };

  const buildThreadFromAttrs = (attrs: {
    commentId?: string | null;
    commentThread?: string | null;
    commentText?: string | null;
    userId?: string | null;
    userName?: string | null;
    timestamp?: number | null;
    color?: string | null;
  }) => {
    const commentId = attrs.commentId || '';
    const fallbackComment = attrs.commentText
      ? {
        id: commentId || `comment-${Date.now()}`,
        text: attrs.commentText,
        userId: attrs.userId || 'user1',
        userName: attrs.userName || 'User',
        timestamp: attrs.timestamp || Date.now(),
      }
      : undefined;
    return {
      id: commentId,
      comments: parseCommentThread(attrs.commentThread || null, fallbackComment),
      color: attrs.color || undefined,
    };
  };

  const editor = useSharedTipTapEditor({ initialContent,
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[100px] w-full text-sm',
        style: 'word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap;',
      },
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        const commentTarget = target.closest('[data-comment-id]') as HTMLElement | null;
        if (commentTarget) {
          const commentId = commentTarget.getAttribute('data-comment-id');
          const commentText = commentTarget.getAttribute('data-comment-text');
          if (!commentId) return false;

          setCommentPopupPosition(null);

          const thread = buildThreadFromAttrs({
            commentId,
            commentThread: commentTarget.getAttribute('data-comment-thread'),
            commentText,
            userId: commentTarget.getAttribute('data-user-id'),
            userName: commentTarget.getAttribute('data-user-name'),
            timestamp: commentTarget.getAttribute('data-timestamp')
              ? parseInt(commentTarget.getAttribute('data-timestamp') || '0', 10)
              : null,
            color: commentTarget.getAttribute('data-color'),
          });

          setActiveThread(thread);
          panels.openPanel('comment');
          return true;
        }
        return false;
      },
    },
  });

  const { hasSelection, lastSelection } = useShellSelection(editor);

  // Clicking into the TipTap content hands the Text style panel's target
  // back to 'content' -- without this, formatting the title once would
  // permanently steal every subsequent panel action away from the note body.
  useEffect(() => {
    if (!editor) return;
    const handleFocus = () => setActiveStyleTarget('content');
    editor.on('focus', handleFocus);
    return () => {
      editor.off('focus', handleFocus);
    };
  }, [editor]);

  const writeTitleStyle = (updates: Partial<CaptionStyle>) => {
    setTitleStyle((prev) => ({ ...prev, ...updates }));
  };

  // Text formatting handlers -- act on the title's own style when it's the
  // active target, otherwise unchanged: act on the TipTap selection.
  const handleBold = () => activeStyleTarget === 'title'
    ? writeTitleStyle({ fontWeight: (titleStyle.fontWeight === '700' || titleStyle.fontWeight === 'bold') ? '400' : '700' })
    : editor?.chain().focus().toggleBold().run();
  const handleItalic = () => activeStyleTarget === 'title'
    ? writeTitleStyle({ fontStyle: titleStyle.fontStyle === 'italic' ? 'normal' : 'italic' })
    : editor?.chain().focus().toggleItalic().run();
  const handleStrikethrough = () => activeStyleTarget === 'title'
    ? writeTitleStyle({ strikethrough: !titleStyle.strikethrough })
    : editor?.chain().focus().toggleStrike().run();
  const handleUnderline = () => activeStyleTarget === 'title'
    ? writeTitleStyle({ underline: !titleStyle.underline })
    : editor?.chain().focus().toggleUnderline().run();
  const handleBulletList = () => editor?.chain().focus().toggleBulletList().run();
  const handleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
  const handleCode = () => editor?.chain().focus().toggleCodeBlock().run();
  const handleAlign = () => activeStyleTarget === 'title'
    ? writeTitleStyle({ textAlign: nextTextAlign(titleStyle.textAlign || 'left') })
    : (editor && cycleEditorTextAlign(editor));

  const handleLink = () => {
    if (!editor) return;

    // Check if text is selected
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '');

    if (!selectedText || selectedText.trim() === '') {
      // No text selected - don't open popup
      return;
    }

    // Check if selected text already has a link - get the existing URL
    const linkMark = editor.getAttributes('link');
    if (linkMark && linkMark.href) {
      setLinkViewUrl(linkMark.href);
    } else {
      setLinkViewUrl('');
    }

    // Text is selected, open the link popup
    panels.openPanel('link');
  };

  const handleAddLink = (url: string) => {
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  const handleRemoveLink = () => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
    }
  };

  // Comment handlers
  const handleTextComment = () => {
    if (!editor || !canManageAnchoredComments) return;

    const { from, to } = editor.state.selection;
    let selection = { from, to };
    let selectedText = editor.state.doc.textBetween(from, to, '');

    if ((!selectedText || selectedText.trim() === '') && lastSelection) {
      selection = lastSelection;
      selectedText = editor.state.doc.textBetween(selection.from, selection.to, '');
    }

    if (!selectedText || selectedText.trim() === '') {
      return;
    }

    editor.chain().focus().setTextSelection(selection).run();

    const commentAttrs = editor.getAttributes('comment');
    if (commentAttrs && commentAttrs.commentId) {
      const thread = buildThreadFromAttrs({
        commentId: commentAttrs.commentId,
        commentThread: commentAttrs.commentThread || null,
        commentText: commentAttrs.commentText || null,
        userId: commentAttrs.userId || null,
        userName: commentAttrs.userName || null,
        timestamp: commentAttrs.timestamp || null,
        color: commentAttrs.color || null,
      });
      setActiveThread(thread);
    } else {
      setActiveThread({
        id: `comment-${Date.now()}`,
        comments: [],
      });
    }

    setCommentPopupPosition(null);
    setSavedSelection(selection);
    panels.openPanel('comment');
  };

  const handlePostComment = (anchor?: DOMRect) => {
    const rect = anchor || noteCardRef.current?.getBoundingClientRect();
    if (rect) {
      setDetachedPopupPosition({
        x: rect.right + 10,
        y: rect.top,
      });
    }
    panels.openPanel('detached');
    setActiveDetachedId(detachedComments[detachedComments.length - 1]?.id || null);
    setEditingDetachedId(null);
    setEditingDetachedText('');
    setCommentColorPopupId(null);
    setNewDetachedText('');
  };

  const handleAddDetachedComment = () => {
    const trimmed = newDetachedText.trim();
    if (!trimmed) return;
    const newComment = {
      id: `comment-${Date.now()}`,
      text: trimmed,
      userId: 'user1',
      userName: 'R',
      timestamp: Date.now(),
    };
    setDetachedComments((prev) => [...prev, newComment]);
    setActiveDetachedId(newComment.id);
    setEditingDetachedId(null);
    setEditingDetachedText('');
    setCommentColorPopupId(null);
    setNewDetachedText('');
  };

  const updateCommentThreadInDoc = (
    commentId: string,
    nextComments: InlineComment[],
    overrides?: Record<string, any>
  ) => {
    if (!editor) return false;

    const { state, view } = editor;
    const { doc, tr } = state;
    let found = false;
    const lastComment = nextComments[nextComments.length - 1];

    doc.descendants((node, pos) => {
      const commentMark = node.marks.find(mark =>
        mark.type.name === 'comment' && mark.attrs.commentId === commentId
      );

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

    if (found) {
      view.dispatch(tr);
    }
    return found;
  };

  const removeCommentThreadFromDoc = (commentId: string) => {
    if (!editor) return;

    const { state, view } = editor;
    const { doc, tr } = state;

    doc.descendants((node, pos) => {
      const commentMark = node.marks.find(mark =>
        mark.type.name === 'comment' && mark.attrs.commentId === commentId
      );

      if (commentMark) {
        tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
      }
    });

    view.dispatch(tr);
  };

  const handleAddComment = (commentText: string) => {
    if (!editor || !canManageAnchoredComments || !commentText || !activeThread) return;

    const newComment: InlineComment = {
      id: `comment-${Date.now()}`,
      text: commentText,
      userId: currentUserId,
      userName: currentUserName,
      timestamp: Date.now(),
    };
    const nextComments = [...activeThread.comments, newComment];
    const updated = updateCommentThreadInDoc(activeThread.id, nextComments);

    if (!updated) {
      if (!savedSelection) return;
      editor
        .chain()
        .focus()
        .setTextSelection({ from: savedSelection.from, to: savedSelection.to })
        .setComment({
          commentId: activeThread.id,
          commentText: newComment.text,
          commentThread: JSON.stringify(nextComments),
          userId: newComment.userId,
          userName: newComment.userName,
          timestamp: newComment.timestamp,
        })
        .run();
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
      comment.id === commentId
        ? { ...comment, isStrikethrough: !comment.isStrikethrough }
        : comment
    );
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  const handleColorComment = (color: string) => {
    if (!editor || !canManageAnchoredComments || !activeThread) return;
    const nextColor = color || null;
    updateCommentThreadInDoc(activeThread.id, activeThread.comments, { color: nextColor });
    setActiveThread({ ...activeThread, color: color || undefined });
  };

  // Per-comment text/highlight color -- distinct from handleColorComment
  // above, which colors the highlighted document text span the whole
  // thread is anchored to.
  const handleCommentColor = (commentId: string, textColor?: string, backgroundColor?: string) => {
    if (!editor || !canManageAnchoredComments || !activeThread) return;
    const nextComments = activeThread.comments.map((comment) =>
      comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
    );
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const handleSelectHeading = (level: string) => {
    if (activeStyleTarget === 'title') {
      const preset = level === 'callout' && titleStyle.backgroundColor
        ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: titleStyle.backgroundColor }
        : CAPTION_STYLE_PRESETS[level as CaptionHeading];
      if (preset) writeTitleStyle(preset);
      return;
    }
    if (!editor) return;
    setCurrentHeading(level);

    // First, clear any existing block-level formatting and font size
    editor.chain().focus().clearNodes().unsetFontSize().run();

    switch (level) {
      case 'h1':
        editor.chain().focus().toggleHeading({ level: 1 }).run();
        break;
      case 'h2':
        editor.chain().focus().toggleHeading({ level: 2 }).run();
        break;
      case 'normal':
        editor.chain().focus().setParagraph().setFontSize('14px').run();
        break;
      case 'small':
        // Small text - smaller font size and lighter color
        editor.chain().focus().setParagraph().setFontSize('12px').setColor('#6b7280').run();
        break;
      case 'code':
        editor.chain().focus().toggleCodeBlock().run();
        break;
      case 'callout':
        // For callout: use paragraph with yellow highlight and add warning icon
        editor.chain().focus().setParagraph().run();
        // Add warning emoji at the beginning and apply highlight
        const { from, to } = editor.state.selection;
        const text = editor.state.doc.textBetween(from, to, ' ');
        if (!text.startsWith('⚠')) {
          editor.chain().focus().insertContentAt(from, '⚠ ').setHighlight({ color: '#fef3c7' }).run();
        } else {
          editor.chain().focus().setHighlight({ color: '#fef3c7' }).run();
        }
        break;
      case 'quote':
        editor.chain().focus().toggleBlockquote().run();
        break;
      default:
        editor.chain().focus().setParagraph().run();
    }
  };

  const handleSelectTextColor = (color: string) => {
    if (activeStyleTarget === 'title') {
      writeTitleStyle({ color });
      return;
    }
    setCurrentTextColor(color);
    editor?.chain().focus().setColor(color).run();
  };

  const handleSelectHighlight = (color: string) => {
    if (activeStyleTarget === 'title') {
      writeTitleStyle({ backgroundColor: color === 'transparent' ? undefined : color });
      return;
    }
    setCurrentHighlight(color);
    if (color === 'transparent') {
      editor?.chain().focus().unsetHighlight().run();
    } else {
      editor?.chain().focus().setHighlight({ color }).run();
    }
  };

  // Save and close
  const handleSaveAndClose = () => {
    const content = editor?.getHTML() || '';
    onSave({
      title: title.trim() || undefined,
      content,
      cardColor: cardColor !== '#FFFFFF' ? cardColor : undefined,
      topStrip: topStrip || undefined,
      textColor: textColor !== '#1F2937' ? textColor : undefined,
      reactions: reactions.length > 0 ? reactions : undefined,
      badgeColor,
      detachedComments: detachedComments.length > 0 ? detachedComments : undefined,
      titleStyle: Object.keys(titleStyle).length > 0 ? titleStyle : undefined,
      commentTitle,
      commentTitleStyle: Object.keys(commentTitleStyle).length > 0 ? commentTitleStyle : undefined,
    });
    onClose();
  };

  const handleCommentPopupOpenChange = (open: boolean) => {
    if (open) {
      panels.openPanel('comment');
    } else {
      panels.closePanel('comment');
      setActiveThread(null);
      setCommentPopupPosition(null);
      setSavedSelection(null);
    }
  };

  if (!isOpen || !editor) {
    return null;
  }

  const toolbarProps = {
    onLink: handleLink,
    onTextStyle: () => panels.openPanel('textStyle'),
    onCardColor: () => panels.openPanel('cardColor'),
    onAddReaction: () => panels.openPanel('reaction'),
    onPostComment: handlePostComment,
    onTextComment: canManageAnchoredComments ? handleTextComment : undefined,
    postCommentCount: detachedComments.length,
    postCommentBadgeColor: badgeColor,
    isLink: editor.isActive('link'),
    isComment: editor.isActive('comment'),
  };

  return (
    <PostEditorShell
      isOpen={isOpen}
      onBackdropClick={handleSaveAndClose}
      toolbarHidden={detachedColorPickerOpen || textCommentColorPickerOpen}
      hasSelection={hasSelection}
      toolbar={toolbarProps}
      centre={
        <>
        {/* Main Note Card */}
        <div
          ref={noteCardRef}
          className="relative bg-white rounded-lg shadow-2xl overflow-visible"
          style={{ width: '280px' }}
        >
          {/* Reaction Picker Popup - positioned to the right of the card */}
          {panels.open.reaction && (
            <div
              className="absolute left-full top-0 ml-2 z-[60]"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div>
                <EmojiReactionPicker
                  isOpen={panels.open.reaction}
                  onOpenChange={(open) => (open ? panels.openPanel('reaction') : panels.closePanel('reaction'))}
                  onSelectEmoji={(emoji) => {
                    if (!reactions.includes(emoji)) {
                      setReactions([...reactions, emoji]);
                    }
                    panels.closePanel('reaction');
                  }}
                  className="note-emoji-picker"
                  inline
                />
              </div>
            </div>
          )}

          {/* Comment Badge - Positioned on the outer card, matching canvas position */}
          {detachedComments.length > 0 && (
            <button
              className="absolute -top-2 -right-2 z-[100] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
              style={{ backgroundColor: badgeColor }}
              title={`${detachedComments.length} comment${detachedComments.length > 1 ? 's' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = noteCardRef.current?.getBoundingClientRect();
                if (rect) {
                  setDetachedPopupPosition({
                    x: rect.right + 10,
                    y: rect.top,
                  });
                }
                panels.open.detached ? panels.closePanel('detached') : panels.openPanel('detached');
                setActiveDetachedId(detachedComments[detachedComments.length - 1]?.id || null);
                setEditingDetachedId(null);
                setEditingDetachedText('');
                setCommentColorPopupId(null);
              }}
            >
              {detachedComments.length}
            </button>
          )}

          {/* Note Card content */}
          <div className="flex flex-col relative">
            {/* Top strip -- flush against the outer card's own edges (no
                inset gap on any side), same as the canvas card's own top
                strip. Sits above the m-2 inset inner card rather than
                inside it, since that margin was leaving a visible gap on
                the left/right/top between the strip and the card outline. */}
            <div
              className="w-full flex-shrink-0 flex items-center px-2 rounded-t-lg"
              style={{ minHeight: '22px', backgroundColor: topStrip || 'rgba(0,0,0,0.04)' }}
            >
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onFocus={() => {
                  setActiveStyleTarget('title');
                  if (!panels.open.textStyle) panels.openPanel('textStyle');
                }}
                placeholder="Post name"
                className={`w-full text-sm font-semibold bg-transparent outline-none border-b placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1 ${
                  activeStyleTarget === 'title' ? 'border-blue-400 bg-blue-50/40' : 'border-transparent focus:border-blue-400'
                }`}
                style={resolveCaptionStyle(titleStyle, topStrip ? contrastIconColor(topStrip) : textColor)}
              />
            </div>
            <div className="m-2 relative">
              {/* Inner card */}
              <div
                className="rounded-lg overflow-hidden"
                style={{
                  backgroundColor: cardColor,
                  color: textColor,
                  minHeight: '180px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  width: '240px',
                }}
              >
                {/* Editor */}
                <div
                  className="p-3"
                  style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    overflow: 'hidden',
                    maxWidth: '100%',
                  }}
                >
                  <EditorContent
                    editor={editor}
                    className="break-words"
                    style={{ maxWidth: '100%', overflow: 'hidden' }}
                  />
                </div>

                {/* Reactions */}
                {reactions.length > 0 && (
                  <div className="flex gap-1 px-3 pb-2">
                    {reactions.map((emoji, i) => (
                      <span
                        key={i}
                        className="text-base cursor-pointer hover:scale-110"
                        onClick={() => setReactions(reactions.filter((_, idx) => idx !== i))}
                      >
                        {emoji}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {panels.open.detached && (
          <CommentPopup
            isOpen={panels.open.detached}
            accessMode={accessMode}
            onOpenChange={(open) => {
              if (!open) {
                panels.closePanel('detached');
                setActiveDetachedId(null);
              }
            }}
            onSubmit={guardCommentMutation(accessMode, (text) => {
              const newComment: DetachedCommentData = {
                id: `comment-${Date.now()}`,
                text,
                userId: currentUserId,
                userName: currentUserName,
                timestamp: Date.now(),
              };
              setDetachedComments((prev) => [...prev, newComment]);
            })}
            onEditComment={guardCommentMutation(accessMode, (commentId, text) => {
              setDetachedComments((prev) => prev.map((comment) =>
                comment.id === commentId ? { ...comment, text } : comment
              ));
            })}
            onRemoveComment={guardCommentMutation(accessMode, (commentId) => {
              setDetachedComments((prev) => prev.filter((comment) => comment.id !== commentId));
            })}
            onToggleCommentStrikethrough={guardCommentMutation(accessMode, (commentId) => {
              setDetachedComments((prev) => prev.map((comment) =>
                comment.id === commentId
                  ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                  : comment
              ));
            })}
            onCommentColor={guardCommentMutation(accessMode, (commentId, textColor, backgroundColor) => {
              setDetachedComments((prev) => prev.map((comment) =>
                comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
              ));
            })}
            comments={detachedComments}
            badgeColor={badgeColor}
            onBadgeColorChange={guardCommentMutation(accessMode, setBadgeColor)}
            commentTitle={commentTitle}
            commentTitleStyle={Object.keys(commentTitleStyle).length > 0 ? commentTitleStyle : undefined}
            onCommentTitleChange={guardCommentMutation(accessMode, (nextTitle: string) => setCommentTitle(nextTitle === 'Comments' ? undefined : nextTitle))}
            onCommentTitleStyleChange={guardCommentMutation(accessMode, (style: CommentTitleStyle) => setCommentTitleStyle(style))}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            position={detachedPopupPosition}
            enableCanonicalSelectionStyling
          />
        )}
        </>
      }
      sharedPanel={
        <>
        {/* Text Style Popup - attached to the right of card */}
        {panels.open.textStyle && (
          <div className="relative" style={{ width: '300px' }}>
            <button
              onClick={() => panels.closePanel('textStyle')}
              className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 truncate pr-4">
              {activeStyleTarget === 'title' ? 'Editing: Post name' : 'Editing: Note text'}
            </div>
            <TextStylePopup
              isOpen={true}
              onOpenChange={(open) => (open ? panels.openPanel('textStyle') : panels.closePanel('textStyle'))}
              onSelectHeading={handleSelectHeading}
              onSelectColor={handleSelectTextColor}
              onSelectHighlight={handleSelectHighlight}
              currentHeading={activeStyleTarget === 'title' ? (titleStyle.heading || 'normal') : currentHeading}
              currentColor={activeStyleTarget === 'title' ? titleStyle.color : currentTextColor}
              currentHighlight={activeStyleTarget === 'title' ? titleStyle.backgroundColor : currentHighlight}
              hideCloseButton
              onBold={handleBold}
              onItalic={handleItalic}
              onStrikethrough={handleStrikethrough}
              onUnderline={handleUnderline}
              onBulletList={activeStyleTarget === 'title' ? undefined : handleBulletList}
              onOrderedList={activeStyleTarget === 'title' ? undefined : handleOrderedList}
              onCode={activeStyleTarget === 'title' ? undefined : handleCode}
              onAlign={handleAlign}
              isBold={activeStyleTarget === 'title' ? (titleStyle.fontWeight === '700' || titleStyle.fontWeight === 'bold') : editor.isActive('bold')}
              isItalic={activeStyleTarget === 'title' ? titleStyle.fontStyle === 'italic' : editor.isActive('italic')}
              isStrikethrough={activeStyleTarget === 'title' ? !!titleStyle.strikethrough : editor.isActive('strike')}
              isUnderline={activeStyleTarget === 'title' ? !!titleStyle.underline : editor.isActive('underline')}
              isBulletList={activeStyleTarget === 'title' ? false : editor.isActive('bulletList')}
              isOrderedList={activeStyleTarget === 'title' ? false : editor.isActive('orderedList')}
              isCode={activeStyleTarget === 'title' ? false : editor.isActive('codeBlock')}
            />
            </div>
          </div>
        )}

        {/* Note Color Picker - attached to the right */}
        {panels.open.cardColor && (
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
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Note Color</span>
              <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                  <button
                    onClick={() => setActiveTab('background')}
                    className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeTab === 'background'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                      }`}
                    title="Background Color"
                  >
                    BG
                  </button>
                  <button
                    onClick={() => setActiveTab('topstrip')}
                    className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeTab === 'topstrip'
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                      }`}
                    title="Top Strip Color"
                  >
                    TS
                  </button>
              </div>
            </div>

            <div className="mb-0">
              <ColorPickerContent
                color={activeTab === "background" ? cardColor : (topStrip || 'transparent')}
                onChange={(c) => activeTab === "background" ? setCardColor(c) : setTopStrip(c)}
                hasOpacity={true}
                presets={activeTab === "background" ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
              />
            </div>
            </div>
          </div>
        )}

        {/* Link Popup - right-side flex sibling, same slot/wrapper as the
            selected-text Comment popup below (PATCH-152 targeted correction:
            align Link and Comment). Uses LinkPopup's existing inline mode so
            no independent absolute/fixed positioning is introduced here. */}
        {panels.open.link && (
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

        {/* Selected-text Comment Popup - right-side flex sibling, per
            .agent/skills/row_canvas_development/SKILL.md's documented layout
            (sub-panels appear to the right as extra flex items) */}
        {panels.open.comment && (
          <div style={{ width: '300px' }}>
            <CommentPopup
              isOpen={panels.open.comment}
              onOpenChange={handleCommentPopupOpenChange}
              onSubmit={guardCommentMutation(anchoredAccessMode, handleAddComment)}
              onEditComment={guardCommentMutation(anchoredAccessMode, handleEditComment)}
              onRemoveComment={guardCommentMutation(anchoredAccessMode, handleRemoveComment)}
              onRemoveThread={guardCommentMutation(anchoredAccessMode, handleRemoveThread)}
              onToggleCommentStrikethrough={guardCommentMutation(anchoredAccessMode, handleToggleCommentStrikethrough)}
              onColor={guardCommentMutation(anchoredAccessMode, handleColorComment)}
              onCommentColor={guardCommentMutation(anchoredAccessMode, handleCommentColor)}
              comments={activeThread?.comments || []}
              highlightColor={activeThread?.color}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              position={commentPopupPosition}
              accessMode={anchoredAccessMode}
            />
          </div>
        )}
        </>
      }
    />
  );
}
