"use client";

import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Underline } from '@tiptap/extension-underline';
import { Link } from '@tiptap/extension-link';
import { Highlight } from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import { FontSize } from './extensions/FontSize';
import { Comment } from './extensions/Comment';
import NoteEditorToolbar, { ToolbarMode } from './NoteEditorToolbar';
import TextStylePopup from './TextStylePopup';
import EmojiPicker from 'emoji-picker-react';
import LinkPopup from './LinkPopup';
import CommentPopup from './CommentPopup';
import { Palette, PenTool, X, Strikethrough, Trash2 } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';

// Module-level constant -- stable reference, never recreated on render
const NOTE_EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [1, 2] },
    link: false,
    underline: false,
  }),
  Underline,
  Link.configure({ openOnClick: false }),
  Highlight.configure({ multicolor: true }),
  TextStyle,
  Color,
  FontSize,
  Comment,
  Placeholder.configure({ placeholder: 'Start typing...' }),
];

const BACKGROUND_COLORS = [
  "#ffffff",
  "#f3f4f6",
  "#fee2e2",
  "#ffedd5",
  "#fef3c7",
  "#dcfce7",
  "#dbeafe",
  "#e0e7ff",
  "#f3e8ff",
  "#fce7f3",
];

const TOP_STRIP_COLORS = [
  "transparent",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#1f2937",
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
  isStrikethrough?: boolean;
}


interface NoteEditorProps {
  initialContent?: string;
  initialDetachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    isStrikethrough?: boolean;
    textColor?: string;
    backgroundColor?: string;
  }>;
  initialBadgeColor?: string;
  initialTextColor?: string;
  onSave: (data: {
    content: string;
    cardColor?: string;
    topStrip?: string;
    textColor?: string;
    reactions?: string[];
    badgeColor?: string;
    detachedComments?: Array<{
      id: string;
      text: string;
      userId: string;
      userName: string;
      timestamp: number;
      isStrikethrough?: boolean;
      textColor?: string;
      backgroundColor?: string;
    }>;
  }) => void;
  onClose: () => void;
  isOpen: boolean;
}

export default function NoteEditor({
  initialContent = '',
  initialDetachedComments = [],
  initialBadgeColor = '#facc15',
  initialTextColor = '#1F2937',
  onSave,
  onClose,
  isOpen,
}: NoteEditorProps) {
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>('text');
  const [cardColor, setCardColor] = useState('#FFFFFF');
  const [topStrip, setTopStrip] = useState<string | null>(null);
  const [textColor, setTextColor] = useState(initialTextColor);
  const [reactions, setReactions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'background' | 'topstrip'>('background');

  // Popup states
  const [textStyleOpen, setTextStyleOpen] = useState(false);
  const [cardColorOpen, setCardColorOpen] = useState(false);
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false);
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [linkViewUrl, setLinkViewUrl] = useState('');
  const [commentPopupOpen, setCommentPopupOpen] = useState(false);
  const [commentPopupPosition, setCommentPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);
  const [lastSelection, setLastSelection] = useState<{ from: number; to: number } | null>(null);
  const [activeThread, setActiveThread] = useState<{
    id: string;
    comments: InlineComment[];
    color?: string;
  } | null>(null);
  // Detached comments - stored separately from inline text
  const [detachedComments, setDetachedComments] = useState(initialDetachedComments);
  const [detachedPopupOpen, setDetachedPopupOpen] = useState(false);
  const [detachedPopupPosition, setDetachedPopupPosition] = useState({ x: 0, y: 0 });
  const [detachedColorPickerOpen, setDetachedColorPickerOpen] = useState(false);
  const [textCommentColorPickerOpen, setTextCommentColorPickerOpen] = useState(false);
  const [newDetachedText, setNewDetachedText] = useState('');
  const [editingDetachedId, setEditingDetachedId] = useState<string | null>(null);
  const [editingDetachedText, setEditingDetachedText] = useState('');
  const [activeDetachedId, setActiveDetachedId] = useState<string | null>(null);
  const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
  // Store absolute viewport coordinates for comment panel and color picker
  const [linkedTextPosition, setLinkedTextPosition] = useState<{ top: number; cardLeft: number; cardRight: number } | null>(null);
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

  const editor = useEditor({
    immediatelyRender: false,
    extensions: NOTE_EXTENSIONS,
    content: initialContent,
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

          // Calculate absolute viewport coordinates for positioning panels
          const commentRect = commentTarget.getBoundingClientRect();
          const cardRect = noteCardRef.current?.getBoundingClientRect();
          if (cardRect) {
            setLinkedTextPosition({
              top: cardRect.top,
              cardLeft: cardRect.left,
              cardRight: cardRect.right,
            });
          }

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
          setCommentPopupOpen(true);
          return true;
        }
        return false;
      },
    },
    // NO onBlur handler - it causes issues when clicking toolbar
  }, []);

  // Reset content when initialContent changes
  useEffect(() => {
    if (editor && initialContent !== editor.getHTML()) {
      editor.commands.setContent(initialContent);
    }
  }, [initialContent, editor]);

  useEffect(() => {
    if (!editor) return;

    const handleSelectionUpdate = () => {
      const { from, to, empty } = editor.state.selection;
      if (!empty) {
        setLastSelection({ from, to });
      }
    };

    editor.on('selectionUpdate', handleSelectionUpdate);
    return () => {
      editor.off('selectionUpdate', handleSelectionUpdate);
    };
  }, [editor]);

  // Text formatting handlers
  const handleBold = () => editor?.chain().focus().toggleBold().run();
  const handleItalic = () => editor?.chain().focus().toggleItalic().run();
  const handleStrikethrough = () => editor?.chain().focus().toggleStrike().run();
  const handleUnderline = () => editor?.chain().focus().toggleUnderline().run();
  const handleBulletList = () => editor?.chain().focus().toggleBulletList().run();
  const handleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
  const handleCode = () => editor?.chain().focus().toggleCodeBlock().run();

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
    setLinkPopupOpen(true);
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
    if (!editor) return;

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

    // Calculate absolute viewport coordinates for positioning panels
    const view = editor.view;
    const startCoords = view.coordsAtPos(selection.from);
    const cardRect = noteCardRef.current?.getBoundingClientRect();
    if (cardRect) {
      setLinkedTextPosition({
        top: cardRect.top,
        cardLeft: cardRect.left,
        cardRight: cardRect.right,
      });
    }

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
    setCommentPopupOpen(true);
    setTextStyleOpen(false);
    setCardColorOpen(false);
    setEmojiPickerOpen(false);
  };

  const handlePostComment = (anchor?: DOMRect) => {
    const rect = anchor || noteCardRef.current?.getBoundingClientRect();
    if (rect) {
      setDetachedPopupPosition({
        x: rect.right + 10,
        y: rect.top,
      });
    }
    setDetachedPopupOpen(true);
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
    if (!editor || !commentText || !activeThread) return;

    const newComment: InlineComment = {
      id: `comment-${Date.now()}`,
      text: commentText,
      userId: 'user1',
      userName: 'R',
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
    if (!editor || !newText || !activeThread) return;

    const nextComments = activeThread.comments.map((comment) =>
      comment.id === commentId ? { ...comment, text: newText } : comment
    );

    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  const handleRemoveComment = (commentId: string) => {
    if (!editor || !activeThread) return;

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
    if (!editor || !activeThread) return;
    removeCommentThreadFromDoc(activeThread.id);
    setActiveThread(null);
    setCommentPopupOpen(false);
  };

  const handleToggleCommentStrikethrough = (commentId: string) => {
    if (!editor || !activeThread) return;
    const nextComments = activeThread.comments.map((comment) =>
      comment.id === commentId
        ? { ...comment, isStrikethrough: !comment.isStrikethrough }
        : comment
    );
    updateCommentThreadInDoc(activeThread.id, nextComments);
    setActiveThread({ ...activeThread, comments: nextComments });
  };

  const handleColorComment = (color: string) => {
    if (!editor || !activeThread) return;
    const nextColor = color || null;
    updateCommentThreadInDoc(activeThread.id, activeThread.comments, { color: nextColor });
    setActiveThread({ ...activeThread, color: color || undefined });
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
    setCurrentTextColor(color);
    editor?.chain().focus().setColor(color).run();
  };

  const handleSelectHighlight = (color: string) => {
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
      content,
      cardColor: cardColor !== '#FFFFFF' ? cardColor : undefined,
      topStrip: topStrip || undefined,
      textColor: textColor !== '#1F2937' ? textColor : undefined,
      reactions: reactions.length > 0 ? reactions : undefined,
      badgeColor,
      detachedComments: detachedComments.length > 0 ? detachedComments : undefined,
    });
    onClose();
  };

  // Close handler - save before closing
  const handleClose = () => {
    handleSaveAndClose();
  };

  // Click outside to save and close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleSaveAndClose();
    }
  };

  const handleCommentPopupOpenChange = (open: boolean) => {
    setCommentPopupOpen(open);
    if (!open) {
      setActiveThread(null);
      setCommentPopupPosition(null);
      setSavedSelection(null);
    }
  };

  if (!isOpen || !editor) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/50"
      onClick={handleOverlayClick}
    >
      {/* Editor container with toolbar and card as siblings */}
      <div
        className="flex items-start gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        {/* LEFT ZONE: Toolbar + Comment Color Picker */}
        <div className="relative flex items-start gap-3">
          {/* Toolbar */}
          <div className="min-w-[72px]">
            <div className={(detachedColorPickerOpen || textCommentColorPickerOpen) ? 'opacity-0 pointer-events-none' : ''}>
              <NoteEditorToolbar
                mode={toolbarMode}
                onModeChange={setToolbarMode}
                onBold={handleBold}
                onItalic={handleItalic}
                onStrikethrough={handleStrikethrough}
                onUnderline={handleUnderline}
                onBulletList={handleBulletList}
                onOrderedList={handleOrderedList}
                onCode={handleCode}
                onLink={handleLink}
                onTextStyle={() => setTextStyleOpen(true)}
                onCardColor={() => setCardColorOpen(true)}
                onAddReaction={() => setEmojiPickerOpen(true)}
                onPostComment={handlePostComment}
                onTextComment={handleTextComment}
                postCommentCount={detachedComments.length}
                postCommentBadgeColor={badgeColor}
                isBold={editor.isActive('bold')}
                isItalic={editor.isActive('italic')}
                isStrikethrough={editor.isActive('strike')}
                isUnderline={editor.isActive('underline')}
                isBulletList={editor.isActive('bulletList')}
                isOrderedList={editor.isActive('orderedList')}
                isCode={editor.isActive('codeBlock')}
                isLink={editor.isActive('link')}
                isComment={editor.isActive('comment')}
                hasSelection={!editor.state.selection.empty}
              />
            </div>
          </div>

        </div>

        {/* Main Note Card */}
        <div
          ref={noteCardRef}
          className="relative bg-white rounded-lg shadow-2xl overflow-visible"
          style={{ width: '280px' }}
        >
          {/* Reaction Picker Popup - positioned to the right of the card */}
          {emojiPickerOpen && (
            <div
              className="absolute left-full top-0 ml-2 z-[60]"
              onMouseDown={(e) => e.preventDefault()}
            >
              <div className="relative">
                <button
                  className="absolute top-2 right-2 translate-x-1 z-10 w-4 h-4 rounded hover:bg-gray-100 flex items-center justify-center"
                  onClick={() => setEmojiPickerOpen(false)}
                  title="Close"
                >
                  <X className="w-3 h-3 text-gray-400" />
                </button>
                <EmojiPicker
                  onEmojiClick={(emojiData) => {
                    if (!reactions.includes(emojiData.emoji)) {
                      setReactions([...reactions, emojiData.emoji]);
                    }
                    setEmojiPickerOpen(false);
                  }}
                  width={320}
                  height={400}
                  searchPlaceHolder="Search emojis..."
                  previewConfig={{ showPreview: false }}
                  className="note-emoji-picker"
                />
              </div>
            </div>
          )}

          {/* Link Popup */}
          <LinkPopup
            isOpen={linkPopupOpen}
            onOpenChange={setLinkPopupOpen}
            onSubmit={handleAddLink}
            onRemoveLink={handleRemoveLink}
            initialUrl={linkViewUrl}
          />

          {/* Comment Popup */}
          <CommentPopup
            isOpen={commentPopupOpen}
            onOpenChange={handleCommentPopupOpenChange}
            onSubmit={handleAddComment}
            onEditComment={handleEditComment}
            onRemoveComment={handleRemoveComment}
            onRemoveThread={handleRemoveThread}
            onToggleCommentStrikethrough={handleToggleCommentStrikethrough}
            onColor={handleColorComment}
            comments={activeThread?.comments || []}
            highlightColor={activeThread?.color}
            currentUserId="user1"
            currentUserName="R"
            position={commentPopupPosition}
          />

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
                setDetachedPopupOpen(!detachedPopupOpen);
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
                {/* Top Strip */}
                {topStrip && (
                  <div className="h-1.5 w-full" style={{ backgroundColor: topStrip }} />
                )}

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

        {/* Detached Comments Popup - Canvas style */}
        {detachedPopupOpen && (
          <div
            className="fixed z-[100]"
            style={{
              left: detachedPopupPosition.x,
              top: detachedPopupPosition.y,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
              {/* Header with badge color button */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setDetachedColorPickerOpen(!detachedColorPickerOpen)}
                    className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                    title="Badge Color"
                  >
                    <div
                      className="w-4 h-4 rounded border border-gray-300"
                      style={{ backgroundColor: badgeColor }}
                    />
                  </button>
                  <button
                    onClick={() => {
                      setDetachedPopupOpen(false);
                      setActiveDetachedId(null);
                      setDetachedColorPickerOpen(false);
                      setEditingDetachedId(null);
                      setCommentColorPopupId(null);
                    }}
                    className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Badge color picker popup */}
              {detachedColorPickerOpen && (
                <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                  <div className="grid grid-cols-6 gap-1.5">
                    {BADGE_COLORS.map((color) => (
                      <button
                        key={color}
                        onClick={() => {
                          setBadgeColor(color);
                          setDetachedColorPickerOpen(false);
                        }}
                        className={`rounded transition-transform hover:scale-110 ${badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
                        style={{
                          width: '20px',
                          height: '20px',
                          backgroundColor: color,
                          border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a'].includes(color) ? '1px solid #d1d5db' : 'none',
                        }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Comments list or empty state */}
              {detachedComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
              ) : (
                <div className="flex gap-2 relative">
                  <div className="flex-1 space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin">
                    {detachedComments.map((comment) => {
                      const isActive = activeDetachedId === comment.id;
                      const isEditing = editingDetachedId === comment.id;

                      return (
                        <div
                          key={comment.id}
                          className={`flex gap-2 rounded py-0.5 px-0.5 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                          onClick={() => setActiveDetachedId(comment.id)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingDetachedId(comment.id);
                            setEditingDetachedText(comment.text || '');
                          }}
                        >
                          <div className="flex flex-col items-center gap-0.5 shrink-0 w-[22px]">
                            <div className="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                              {comment.userName?.charAt(0).toUpperCase() || 'U'}
                            </div>
                            <span className="text-[9px] text-gray-400 leading-none text-center">
                              {getTimeAgo(comment.timestamp)}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-xs font-medium text-gray-700 truncate">{comment.userName || 'User'}</span>
                            </div>
                            {isEditing ? (
                              <textarea
                                value={editingDetachedText}
                                onChange={(e) => setEditingDetachedText(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    if (editingDetachedText.trim()) {
                                      setDetachedComments((prev) =>
                                        prev.map((c) =>
                                          c.id === comment.id ? { ...c, text: editingDetachedText.trim() } : c
                                        )
                                      );
                                      setEditingDetachedId(null);
                                      setEditingDetachedText('');
                                    }
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingDetachedId(null);
                                    setEditingDetachedText('');
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                style={{
                                  color: comment.textColor || '#4b5563',
                                }}
                                rows={1}
                                autoFocus
                              />
                            ) : (
                              <div
                                className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${comment.isStrikethrough ? 'line-through' : ''}`}
                                style={{ color: comment.textColor }}
                              >
                                {comment.text}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action buttons on the right */}
                  <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                    <button
                      onClick={() => {
                        const active = detachedComments.find((c) => c.id === activeDetachedId);
                        if (!active) return;
                        setEditingDetachedId(active.id);
                        setEditingDetachedText(active.text || '');
                      }}
                      className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
                      title="Edit"
                      disabled={!activeDetachedId}
                    >
                      <PenTool className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        if (!activeDetachedId) return;
                        setDetachedComments((prev) =>
                          prev.map((c) =>
                            c.id === activeDetachedId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                          )
                        );
                      }}
                      className={`p-1 rounded transition-colors ${
                        detachedComments.find((c) => c.id === activeDetachedId)?.isStrikethrough
                          ? 'text-blue-500 bg-blue-50'
                          : 'text-gray-300 hover:text-blue-500'
                      } disabled:opacity-40 disabled:hover:text-gray-300`}
                      title="Strikethrough"
                      disabled={!activeDetachedId}
                    >
                      <Strikethrough className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        if (!activeDetachedId) return;
                        const next = detachedComments.filter((c) => c.id !== activeDetachedId);
                        setDetachedComments(next);
                        setActiveDetachedId(next[next.length - 1]?.id || null);
                        setEditingDetachedId(null);
                        setEditingDetachedText('');
                      }}
                      className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
                      title="Delete"
                      disabled={!activeDetachedId}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* Add comment input */}
              <div className="mt-3 pt-3 border-t border-gray-100">
                <input
                  type="text"
                  value={newDetachedText}
                  onChange={(e) => setNewDetachedText(e.target.value)}
                  placeholder="Add a comment..."
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newDetachedText.trim()) {
                      handleAddDetachedComment();
                    }
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Text Style Popup - attached to the right of card */}
        {textStyleOpen && (
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 relative" style={{ width: '300px' }}>
            <button
              onClick={() => setTextStyleOpen(false)}
              className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-100"
            >
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

        {/* Note Color Picker - attached to the right */}
        {cardColorOpen && (
          <div
            className="bg-white rounded-lg shadow-xl border border-gray-200 p-4 h-fit self-start"
            style={{ width: '260px' }}
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
        )}

      </div>
    </div>
  );
}
