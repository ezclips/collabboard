"use client";

import React, { useState, useEffect } from 'react';
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
import { X } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';

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



interface NoteEditorProps {
  initialContent?: string;
  initialDetachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
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
  const [commentMode, setCommentMode] = useState<'add' | 'view'>('add');
  const [commentPopupPosition, setCommentPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const [savedSelection, setSavedSelection] = useState<{ from: number; to: number } | null>(null);
  const [lastSelection, setLastSelection] = useState<{ from: number; to: number } | null>(null);
  const [existingComment, setExistingComment] = useState<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    color?: string;
  } | undefined>(undefined);

  // Detached comments - stored separately from inline text
  const [detachedComments, setDetachedComments] = useState(initialDetachedComments);

  // Sync detachedComments when initialDetachedComments changes (e.g., when opening a different padlet)
  useEffect(() => {
    setDetachedComments(initialDetachedComments);
  }, [initialDetachedComments]);

  // Detached comments popup state
  const [detachedPopupOpen, setDetachedPopupOpen] = useState(false);
  const [detachedPopupPosition, setDetachedPopupPosition] = useState({ x: 0, y: 0 });
  const [editingDetachedId, setEditingDetachedId] = useState<string | null>(null);
  const [editingDetachedText, setEditingDetachedText] = useState('');
  const [selectedDetachedId, setSelectedDetachedId] = useState<string | null>(null);
  const [detachedColorPickerOpen, setDetachedColorPickerOpen] = useState(false);
  const [badgeColor, setBadgeColor] = useState(initialBadgeColor);

  // Update textColor when initialTextColor changes
  useEffect(() => {
    setTextColor(initialTextColor);
  }, [initialTextColor]);

  // Text styling state
  const [currentHeading, setCurrentHeading] = useState('normal');
  const [currentTextColor, setCurrentTextColor] = useState('#1a1a1a');
  const [currentHighlight, setCurrentHighlight] = useState('transparent');

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontSize,
      Comment,
      Placeholder.configure({ placeholder: 'Start typing...' }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class: 'focus:outline-none min-h-[100px] w-full text-sm',
        style: 'word-wrap: break-word; overflow-wrap: break-word; white-space: pre-wrap;',
      },
      handleClick: (view, pos, event) => {
        // Check if clicked on a comment mark
        const target = event.target as HTMLElement;
        if (target.classList.contains('comment-mark')) {
          const commentId = target.getAttribute('data-comment-id');
          const commentText = target.getAttribute('data-comment-text');
          const userId = target.getAttribute('data-user-id');
          const userName = target.getAttribute('data-user-name');
          const timestamp = target.getAttribute('data-timestamp');

          if (commentId && commentText) {
            // Get position of the clicked element for popup placement
            const rect = target.getBoundingClientRect();
            setCommentPopupPosition({
              x: rect.right + 10,
              y: rect.top,
            });

            const color = target.getAttribute('data-color');
            setExistingComment({
              id: commentId,
              text: commentText,
              userId: userId || 'user1',
              userName: userName || 'User',
              timestamp: timestamp ? parseInt(timestamp, 10) : Date.now(),
              color: color || undefined,
            });
            setCommentMode('view');
            setCommentPopupOpen(true);
            return true;
          }
        }
        return false;
      },
    },
    // NO onBlur handler - it causes issues when clicking toolbar
  });

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
  const handleComment = () => {
    if (!editor) return;

    // Check if text is selected
    const { from, to } = editor.state.selection;
    let selection = { from, to };
    let selectedText = editor.state.doc.textBetween(from, to, '');

    if ((!selectedText || selectedText.trim() === '') && lastSelection) {
      selection = lastSelection;
      selectedText = editor.state.doc.textBetween(selection.from, selection.to, '');
    }

    if (!selectedText || selectedText.trim() === '') {
      // No text selected - don't open popup
      return;
    }

    editor.chain().focus().setTextSelection(selection).run();

    // Check if selected text already has a comment
    const commentAttrs = editor.getAttributes('comment');
    if (commentAttrs && commentAttrs.commentId) {
      // Existing comment - view mode
      setExistingComment({
        id: commentAttrs.commentId,
        text: commentAttrs.commentText,
        userId: commentAttrs.userId,
        userName: commentAttrs.userName,
        timestamp: commentAttrs.timestamp,
      });
      setCommentMode('view');
    } else {
      // New comment - add mode
      setExistingComment(undefined);
      setCommentMode('add');
    }

    // Save the current selection so we can restore it when submitting
    setSavedSelection(selection);
    setCommentPopupOpen(true);
  };

  const handleAddComment = (commentText: string) => {
    if (!editor || !commentText || !savedSelection) return;

    const commentId = `comment-${Date.now()}`;
    // Restore the saved selection before applying the comment
    editor
      .chain()
      .focus()
      .setTextSelection({ from: savedSelection.from, to: savedSelection.to })
      .setComment({
        commentId,
        commentText,
        userId: 'user1', // TODO: Get from auth
        userName: 'R', // TODO: Get from auth
        timestamp: Date.now(),
      })
      .run();

    setSavedSelection(null);
  };

  const handleEditComment = (newText: string) => {
    if (!editor || !newText || !existingComment) return;

    // Use TipTap's transaction to find and update the comment mark
    const { state, view } = editor;
    const { doc, tr } = state;

    let found = false;

    // Find the comment mark with matching ID and update its text attribute
    doc.descendants((node, pos) => {
      if (found) return false;

      const commentMark = node.marks.find(mark =>
        mark.type.name === 'comment' && mark.attrs.commentId === existingComment.id
      );

      if (commentMark) {
        // Create new mark with updated text
        const newMark = state.schema.marks.comment.create({
          ...commentMark.attrs,
          commentText: newText,
        });

        // Remove old mark and add new one
        tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
        tr.addMark(pos, pos + node.nodeSize, newMark);
        found = true;
      }
    });

    if (found) {
      view.dispatch(tr);
      // Update state
      setExistingComment({ ...existingComment, text: newText });
    }
  };

  const handleColorComment = (color: string) => {
    if (!editor || !existingComment) return;

    // Use TipTap's transaction to find and update the comment mark's color
    const { state, view } = editor;
    const { doc, tr } = state;

    let found = false;

    doc.descendants((node, pos) => {
      if (found) return false;

      const commentMark = node.marks.find(mark =>
        mark.type.name === 'comment' && mark.attrs.commentId === existingComment.id
      );

      if (commentMark) {
        // Create new mark with updated color
        const newMark = state.schema.marks.comment.create({
          ...commentMark.attrs,
          color: color || null,
        });

        tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
        tr.addMark(pos, pos + node.nodeSize, newMark);
        found = true;
      }
    });

    if (found) {
      view.dispatch(tr);
      setExistingComment({ ...existingComment, color });
    }
  };

  const handleDetachComment = () => {
    console.log('handleDetachComment called', { existingComment });
    if (!editor || !existingComment) {
      console.log('handleDetachComment: editor or existingComment missing');
      return;
    }

    // Add the comment to detached comments array BEFORE removing from text
    setDetachedComments(prev => [...prev, {
      id: existingComment.id,
      text: existingComment.text,
      userId: existingComment.userId,
      userName: existingComment.userName,
      timestamp: existingComment.timestamp,
    }]);

    // Remove the comment mark from the text
    const { state, view } = editor;
    const { doc, tr } = state;

    let found = false;
    doc.descendants((node, pos) => {
      const commentMark = node.marks.find(mark =>
        mark.type.name === 'comment' && mark.attrs.commentId === existingComment.id
      );

      if (commentMark) {
        console.log('Found comment mark at pos', pos);
        tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
        found = true;
      }
    });

    if (found) {
      console.log('Dispatching transaction');
      view.dispatch(tr);
    }
    setExistingComment(undefined);
    setCommentPopupOpen(false);
  };

  const handleRemoveComment = () => {
    if (!editor || !existingComment) return;

    // Remove the comment mark from the text
    const { state, view } = editor;
    const { doc, tr } = state;

    doc.descendants((node, pos) => {
      const commentMark = node.marks.find(mark =>
        mark.type.name === 'comment' && mark.attrs.commentId === existingComment.id
      );

      if (commentMark) {
        tr.removeMark(pos, pos + node.nodeSize, commentMark.type);
      }
    });

    view.dispatch(tr);
    setExistingComment(undefined);
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

  const openTextStylePanel = () => {
    setTextStyleOpen(true);
    setCardColorOpen(false);
    setEmojiPickerOpen(false);
  };

  const openCardColorPanel = () => {
    setCardColorOpen(true);
    setTextStyleOpen(false);
    setEmojiPickerOpen(false);
  };

  const openEmojiPanel = () => {
    setEmojiPickerOpen(true);
    setTextStyleOpen(false);
    setCardColorOpen(false);
  };

  if (!isOpen || !editor) return null;

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
        {/* Left Toolbar - DETACHED from card */}
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
            onTextStyle={openTextStylePanel}
            onCardColor={openCardColorPanel}
            onAddReaction={openEmojiPanel}
            onPostComment={() => setDetachedPopupOpen(true)}
            onTextComment={handleComment}
            isBold={editor.isActive('bold')}
            isItalic={editor.isActive('italic')}
            isStrikethrough={editor.isActive('strike')}
            isUnderline={editor.isActive('underline')}
            isBulletList={editor.isActive('bulletList')}
            isOrderedList={editor.isActive('orderedList')}
            isCode={editor.isActive('codeBlock')}
            isLink={editor.isActive('link')}
            isComment={editor.isActive('comment')}
          />

        {/* Main Note Card */}
        <div
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
              onOpenChange={setCommentPopupOpen}
              onSubmit={handleAddComment}
              onEdit={handleEditComment}
              onRemove={handleRemoveComment}
              onColor={handleColorComment}
              mode={commentMode}
              existingComment={existingComment}
              currentUserId="user1"
              currentUserName="R"
              position={commentPopupPosition}
            />

          {/* Note Card content */}
          <div className="flex flex-col relative">

            {/* Card with border - fixed width, expands vertically */}
            <div className="m-2 relative">
              {/* Comment Badge - OUTSIDE the card to avoid clipping */}
              {detachedComments.length > 0 && (
                <button
                  className="absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all"
                  style={{ backgroundColor: badgeColor }}
                  title={`${detachedComments.length} detached comment${detachedComments.length > 1 ? 's' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    setDetachedPopupPosition({
                      x: rect.right + 10,
                      y: rect.top,
                    });
                    setDetachedPopupOpen(!detachedPopupOpen);
                  }}
                >
                  {detachedComments.length}
                </button>
              )}

              {/* Inner card - no border for clean design */}
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

                {/* Editor - constrained to card width */}
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
              {/* End inner card */}
            </div>
          </div>
          {/* End m-2 wrapper */}
        </div>

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
            className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-4 h-fit self-start"
            style={{ width: '260px' }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setCardColorOpen(false)}
              className="absolute top-2 right-2 -translate-y-1 translate-x-1 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-100"
              title="Close"
            >
              <X className="w-3 h-3 text-gray-400" />
            </button>
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

        {/* Detached Comments Popup with Toolbar */}
        {detachedPopupOpen && detachedComments.length > 0 && (
          <div
            className="fixed z-[100] flex items-start gap-2"
            style={{
              left: detachedPopupPosition.x,
              top: detachedPopupPosition.y,
            }}
          >
            {/* Actions Toolbar - Left side */}
            <div
              className="flex flex-col items-center bg-gray-50 rounded-lg shadow-lg border border-gray-200 p-2 gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Color button */}
              <div className="relative">
                <button
                  onClick={() => setDetachedColorPickerOpen(!detachedColorPickerOpen)}
                  className="w-10 h-10 flex items-center justify-center rounded-lg transition-colors hover:bg-gray-200"
                  title="Badge Color"
                >
                  <div
                    className="w-6 h-6 rounded border-2 border-gray-400"
                    style={{ backgroundColor: badgeColor }}
                  />
                </button>
                <span className="text-[9px] text-gray-500 text-center w-full block">Color</span>

                {/* Color picker dropdown */}
                {detachedColorPickerOpen && (
                  <div className="absolute left-full ml-2 top-0 bg-white rounded-lg shadow-lg border border-gray-200 p-3 z-50" style={{ width: '200px' }}>
                    <div className="grid grid-cols-6 gap-1.5">
                      {['#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04',
                        '#f3f4f6', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563',
                        '#ffedd5', '#fed7aa', '#fdba74', '#fb923c', '#f97316', '#ea580c',
                        '#fce7f3', '#fbcfe8', '#f9a8d4', '#f472b6', '#ec4899', '#db2777',
                        '#dbeafe', '#bfdbfe', '#93c5fd', '#60a5fa', '#3b82f6', '#2563eb',
                        '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a',
                        '#f3e8ff', '#e9d5ff', '#d8b4fe', '#c084fc', '#a855f7', '#9333ea',
                        '#ccfbf1', '#99f6e4', '#5eead4', '#2dd4bf', '#14b8a6', '#0d9488',
                      ].map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            setBadgeColor(color);
                            setDetachedColorPickerOpen(false);
                          }}
                          className={`rounded hover:ring-2 hover:ring-gray-400 transition-transform hover:scale-110 ${badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
                          style={{
                            width: '24px',
                            height: '24px',
                            backgroundColor: color,
                            border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a'].includes(color) ? '1px solid #d1d5db' : 'none',
                          }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Reattach button - arrow pointing back */}
              <button
                onClick={() => {
                  if (!editor || !selectedDetachedId) return;

                  const { from, to, empty } = editor.state.selection;

                  if (empty) {
                    // Just silently return - button tooltip explains what to do
                    return;
                  }

                  // Find the selected detached comment
                  const commentToReattach = detachedComments.find(c => c.id === selectedDetachedId);
                  if (!commentToReattach) return;

                  // Apply the comment mark to the selected text
                  editor.chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .setComment({
                      commentId: commentToReattach.id,
                      commentText: commentToReattach.text,
                      userId: commentToReattach.userId,
                      userName: commentToReattach.userName,
                      timestamp: commentToReattach.timestamp,
                    })
                    .run();

                  // Remove from detached comments
                  setDetachedComments(prev => prev.filter(c => c.id !== selectedDetachedId));
                  setSelectedDetachedId(null);
                  setDetachedPopupOpen(false);
                }}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${selectedDetachedId && editor && !editor.state.selection.empty
                  ? 'hover:bg-blue-100 text-blue-600'
                  : selectedDetachedId
                    ? 'hover:bg-gray-200 text-gray-600'
                    : 'text-gray-400 cursor-not-allowed'
                  }`}
                title={
                  !selectedDetachedId
                    ? "Select a comment first"
                    : editor?.state.selection.empty
                      ? "Select text in editor, then click Reattach"
                      : "Reattach comment to selected text"
                }
                disabled={!selectedDetachedId}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M5 12L12 5M5 12L12 19" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-[9px] text-gray-500 text-center w-full block">Reattach</span>

              {/* Remove button */}
              <button
                onClick={() => {
                  if (selectedDetachedId) {
                    setDetachedComments(prev => prev.filter(c => c.id !== selectedDetachedId));
                    setSelectedDetachedId(null);
                  }
                }}
                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${selectedDetachedId ? 'hover:bg-red-100 text-red-500' : 'text-gray-400 cursor-not-allowed'
                  }`}
                title={selectedDetachedId ? "Remove selected comment" : "Select a comment first"}
                disabled={!selectedDetachedId}
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <span className="text-[9px] text-gray-500 text-center w-full block">Remove</span>
            </div>

            {/* Comments Popup - Right side */}
            <div
              className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[280px] max-w-[320px]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <span className="text-sm font-semibold text-gray-700">
                  Detached Comments ({detachedComments.length})
                </span>
                <button
                  onClick={() => {
                    setDetachedPopupOpen(false);
                    setSelectedDetachedId(null);
                    setDetachedColorPickerOpen(false);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Comments list */}
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {detachedComments.map((comment) => {
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

                  const isSelected = selectedDetachedId === comment.id;

                  return (
                    <div
                      key={comment.id}
                      className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'
                        }`}
                      onClick={() => setSelectedDetachedId(isSelected ? null : comment.id)}
                    >
                      <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                        {comment.userName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1">
                            <span className="text-sm font-medium text-gray-800">
                              {comment.userName}
                            </span>
                            <span className="text-xs text-gray-400">
                              {getTimeAgo(comment.timestamp)}
                            </span>
                          </div>
                          {!isSelected && editingDetachedId !== comment.id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDetachedId(comment.id);
                                setEditingDetachedText(comment.text);
                              }}
                              className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                            >
                              Edit
                            </button>
                          )}
                        </div>
                        {editingDetachedId === comment.id ? (
                          <div className="mt-1">
                            <input
                              type="text"
                              value={editingDetachedText}
                              onChange={(e) => setEditingDetachedText(e.target.value)}
                              className="w-full text-sm bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400"
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && editingDetachedText.trim()) {
                                  setDetachedComments(prev => prev.map(c =>
                                    c.id === comment.id ? { ...c, text: editingDetachedText.trim() } : c
                                  ));
                                  setEditingDetachedId(null);
                                } else if (e.key === 'Escape') {
                                  setEditingDetachedId(null);
                                }
                              }}
                            />
                            <div className="flex justify-end gap-2 mt-1">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDetachedId(null);
                                }}
                                className="text-xs text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (editingDetachedText.trim()) {
                                    setDetachedComments(prev => prev.map(c =>
                                      c.id === comment.id ? { ...c, text: editingDetachedText.trim() } : c
                                    ));
                                    setEditingDetachedId(null);
                                  }
                                }}
                                className="text-xs text-blue-500 hover:text-blue-600 font-medium"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-700 mt-0.5 truncate">
                            {comment.text}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
