"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { Highlight } from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { MessageSquare, Palette, PenTool, Send, Strikethrough, Trash2, X } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import DOMPurify from "dompurify";

import CommentEditorToolbar, { ToolbarMode } from "./CommentEditorToolbar";
import TextStylePopup from "./TextStylePopup";
import { cycleEditorTextAlign } from "./textAlignCycle";
import { getMeaningfulTitle } from "@/lib/infra/collabboard/postTitle";
import { handleSafeCommentLinkClick } from "../commentLinkSafety";
import { createCommentLinkExtension, applyCommentLink } from "../commentLinkAuthoring";
import { CommentLinkPopover } from "../CommentLinkPopover";
import { type CommentAccessMode } from "@/lib/domain/canvas/comments";

// Module-level constant -- stable reference, never recreated on render
const COMMENT_EXTENSIONS = [
  StarterKit.configure({ link: false, underline: false }),
  createCommentLinkExtension(),
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];
import { ColorPickerContent } from "../ColorPicker";
import { contrastIconColor } from "../shells/CardShell";

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

interface CommentData {
  id: string;
  text: string; // HTML
  userId: string;
  userName: string;
  userAvatar?: string;
  timestamp: number;
  color?: string;
  textColor?: string;
  backgroundColor?: string;
  isStrikethrough?: boolean;
}

interface CommentEditorProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    comments: CommentData[];
    cardColor?: string;
    badgeColor?: string;
    isCollapsed?: boolean;
    topStrip?: string;
    commentTitle?: string;
    // PATCH 9K.1: tells the caller's persistence path (saveComment) to skip
    // its own unconditional editor-close -- set ONLY by the Collapse/Expand
    // toggle, never by handleSave, so normal submit/close semantics are
    // untouched.
    keepEditorOpen?: boolean;
  }) => void;
  initialComments?: CommentData[];
  initialCardColor?: string;
  initialBadgeColor?: string;
  initialTopStrip?: string;
  initialCommentTitle?: string;
  // PATCH 9K.1: current canvas presentation state (padlet.metadata.isCollapsed)
  // so the toolbar toggle knows which direction to flip next.
  initialIsCollapsed?: boolean;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;

  /**
   * OPTIONAL but strongly recommended:
   * pass the parent post/padlet id so we can hard-reset when switching targets.
   */
  targetId?: string;

  // PATCH 8Z: canonical comment permission signal, threaded from
  // CanvasModals.tsx's existing commentAccessMode -- no new authorization
  // lookup inside this component. Defaults to 'manage' so any caller that
  // hasn't been updated keeps its exact current behavior.
  accessMode?: CommentAccessMode;
}

export default function CommentEditor({
  isOpen,
  onClose,
  onSave,
  initialComments = [],
  initialCardColor = "#ffffff",
  initialBadgeColor = "#facc15",
  initialTopStrip = "transparent",
  initialCommentTitle = "",
  initialIsCollapsed = false,
  currentUserId = "user1",
  currentUserName = "R",
  currentUserAvatar,
  targetId,
  accessMode = "manage",
}: CommentEditorProps) {
  // COMMENT mode stays dormant everywhere in this rollout -- only 'read' and
  // 'manage' are ever live, so treating anything short of 'manage' as
  // read-only matches guardCommentMutation's own semantics exactly.
  const isReadOnly = accessMode !== "manage";
  const [comments, setComments] = useState<CommentData[]>(initialComments);
  const [cardColor, setCardColor] = useState(initialCardColor);
  const [badgeColor, setBadgeColor] = useState(initialBadgeColor);
  const [commentTitle, setCommentTitle] = useState(getMeaningfulTitle(initialCommentTitle, 'comment'));
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
  // PATCH 9K.1: single source of truth for the toolbar's Collapse/Expand
  // toggle -- mirrors padlet.metadata.isCollapsed, reset from the same prop
  // every time the editor opens (see the "Reset UI state on open" effect).
  const [isCollapsed, setIsCollapsed] = useState(initialIsCollapsed);

  const [cardColorOpen, setCardColorOpen] = useState(false);
  const [textStyleOpen, setTextStyleOpen] = useState(false);
  const [badgeColorOpen, setBadgeColorOpen] = useState(false);
  const [currentTextColor, setCurrentTextColor] = useState("#1f2937");
  const [currentHighlight, setCurrentHighlight] = useState("transparent");
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("text");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [linkEnabled, setLinkEnabled] = useState(false);

  // Store selection range for link application
  const savedSelectionRef = useRef<{ from: number; to: number } | null>(null);

  const [topStrip, setTopStrip] = useState<string | null>(initialTopStrip || null);
  const [cardTextColor, setCardTextColor] = useState("#1F2937");
  const [activeColorTab, setActiveColorTab] = useState<'background' | 'topstrip'>('background');

  const [editorKey, setEditorKey] = useState(0);
  const [shouldSelectText, setShouldSelectText] = useState(false);

  // Helper: run something after the editor definitely exists
  const afterTwoFrames = (fn: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  };

  // TipTap editor for new comments
  const editor = useEditor(
    {
      immediatelyRender: false,
      extensions: COMMENT_EXTENSIONS,
      content: "",
      editorProps: {
        attributes: {
          class: "max-w-none focus:outline-none px-3 py-2 text-xs overflow-x-hidden",
        },
      },
    },
    [editorKey]
  );

  // TipTap editor for editing existing comments
  const editEditor = useEditor(
    {
      immediatelyRender: false,
      extensions: COMMENT_EXTENSIONS,
      content: "",
      editorProps: {
        attributes: {
          class:
            "w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 overflow-x-hidden",
        },
      },
    },
    [editorKey]
  );

  const resetEditors = useCallback(
    (opts?: { focusMain?: boolean }) => {
      afterTwoFrames(() => {
        if (editor && !editor.isDestroyed) {
          editor.commands.clearContent(true);
          if (opts?.focusMain) editor.commands.focus("end");
        }
        if (editEditor && !editEditor.isDestroyed) {
          editEditor.commands.clearContent(true);
        }
      });
    },
    [editor, editEditor]
  );

  // Hard reset key on open OR when switching target
  useEffect(() => {
    if (!isOpen) return;
    setEditorKey((prev) => prev + 1);
  }, [isOpen, targetId]);

  // Reset UI state on open
  useEffect(() => {
    if (!isOpen) return;

    setComments(initialComments);
    setCardColor(initialCardColor);
    setBadgeColor(initialBadgeColor);
    setTopStrip(initialTopStrip || null);
    setCommentTitle(getMeaningfulTitle(initialCommentTitle, 'comment'));
    setEditingCommentId(null);
    setActiveCommentId(initialComments[initialComments.length - 1]?.id || null);
    setCommentColorPopupId(null);
    setIsCollapsed(initialIsCollapsed);

    setTextStyleOpen(false);
    setCardColorOpen(false);
    setBadgeColorOpen(false);
    setLinkInputOpen(false);
    setEmojiOpen(false);

    setLinkUrl("");
    setCurrentTextColor("#1f2937");
    setCurrentHighlight("transparent");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);
  // Only reset on open/close — NOT on every render of initial* props.
  // The parent uses key={padletToEdit?.id} so this component remounts when switching
  // padlets, making the full dep list unnecessary. Including `initialComments` (passed
  // as `|| []`) creates a new array reference each render and causes a reset loop.

  // Clear editor content AFTER the new instances are created
  useEffect(() => {
    if (!isOpen) return;
    resetEditors({ focusMain: true });
  }, [isOpen, editorKey, resetEditors]);

  // If we leave edit mode, ensure edit editor is cleared (prevents "ghost text" on next edit)
  useEffect(() => {
    if (!isOpen) return;
    if (editingCommentId === null) {
      afterTwoFrames(() => {
        if (editEditor && !editEditor.isDestroyed) {
          editEditor.commands.clearContent(true);
        }
      });
    }
  }, [editingCommentId, isOpen, editEditor]);

  // Auto-select text when entering edit mode via pen tip button
  useEffect(() => {
    if (shouldSelectText && editingCommentId && editEditor && !editEditor.isDestroyed) {
      const timer = setTimeout(() => {
        editEditor.commands.selectAll();
      }, 50);
      setShouldSelectText(false);
      return () => clearTimeout(timer);
    }
  }, [shouldSelectText, editingCommentId, editEditor]);

  useEffect(() => {
    if (editingCommentId === null) {
      setCommentColorPopupId(null);
    }
  }, [editingCommentId]);

  useEffect(() => {
    if (!isOpen) return;
    if (comments.length === 0) {
      setActiveCommentId(null);
      return;
    }
    if (!activeCommentId || !comments.some((comment) => comment.id === activeCommentId)) {
      setActiveCommentId(comments[comments.length - 1]?.id || null);
    }
  }, [comments, activeCommentId, isOpen]);

  const handleSave = () => {
    // Commit any pending edit before saving
    let finalComments = comments;
    if (editingCommentId && editEditor && !editEditor.isDestroyed) {
      const htmlContent = editEditor.getHTML();
      const textContent = editEditor.getText().trim();
      if (textContent) {
        finalComments = comments.map((c) => 
          c.id === editingCommentId ? { ...c, text: htmlContent } : c
        );
      }
    }
    onSave({ comments: finalComments, cardColor, badgeColor, topStrip: topStrip || undefined, commentTitle: commentTitle.trim() || undefined });
    // Ensure drafts never persist between opens
    resetEditors();
    onClose();
  };

  const handleAddComment = () => {
    if (isReadOnly) return;
    if (!editor) return;
    const htmlContent = editor.getHTML();
    const textContent = editor.getText().trim();
    if (!textContent) return;

    const newComment: CommentData = {
      id: `comment-${Date.now()}`,
      text: htmlContent,
      userId: currentUserId,
      userName: currentUserName,
      timestamp: Date.now(),
    };

    setComments((prev) => [...prev, newComment]);
    setActiveCommentId(newComment.id);

    editor.commands.clearContent(true);
    editor.commands.focus("end");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAddComment();
    } else if (e.key === "Escape") {
      handleSave();
    }
  };

  const handleEditComment = (commentId: string) => {
    if (isReadOnly) return;
    const comment = comments.find((c) => c.id === commentId);
    if (comment && editEditor) {
      setActiveCommentId(commentId);
      setEditingCommentId(commentId);
      afterTwoFrames(() => {
        if (!editEditor.isDestroyed) {
          editEditor.commands.setContent(comment.text);
          editEditor.commands.focus("end");
        }
      });
    }
  };

  const handleSaveEdit = () => {
    if (isReadOnly) return;
    if (!editingCommentId || !editEditor) return;
    const htmlContent = editEditor.getHTML();
    const textContent = editEditor.getText().trim();
    if (!textContent) return;

    setComments((prev) =>
      prev.map((c) => (c.id === editingCommentId ? { ...c, text: htmlContent } : c))
    );

    setEditingCommentId(null);
    editEditor.commands.clearContent(true);
  };

  const handleRemoveComment = (commentId: string) => {
    if (isReadOnly) return;
    setComments((prev) => {
      const next = prev.filter((comment) => comment.id !== commentId);
      if (activeCommentId === commentId) {
        setActiveCommentId(next[next.length - 1]?.id || null);
      }
      return next;
    });
  };

  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const years = Math.floor(days / 365);

    if (minutes < 60) return `${Math.max(1, minutes)}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 365) return `${days}d`;
    return `${years}y`;
  };

  const getInitial = (name: string) => name.charAt(0).toUpperCase();

  const isDarkColor = (color?: string) => {
    if (!color || color === "transparent") return false;
    let hex = color.trim();
    if (!hex.startsWith("#")) return false;
    if (hex.length === 4) {
      hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
    }
    if (hex.length >= 9) {
      hex = hex.slice(0, 7);
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance < 0.5;
  };

  const isDarkCard = isDarkColor(cardColor);
  const actionBaseClass = isDarkCard ? "text-gray-200 hover:text-white" : "text-gray-300 hover:text-blue-500";
  const actionDisabledClass = isDarkCard ? "disabled:opacity-40 disabled:hover:text-gray-200" : "disabled:opacity-40 disabled:hover:text-gray-300";
  const strikeActiveClass = isDarkCard ? "text-white bg-white/20" : "text-blue-500 bg-blue-50";
  const deleteHoverClass = isDarkCard ? "hover:text-red-300" : "hover:text-red-500";

  // PATCH 9K.1: true two-way toggle -- flips metadata.isCollapsed in either
  // direction and persists through the same onSave/saveComment path already
  // used everywhere else, but with keepEditorOpen so saveComment does NOT
  // close the modal. The canvas presentation (full post vs. pin marker)
  // switches via the persisted padlets state; this editor stays open the
  // whole time so the same toolbar button can be pressed again.
  const handleToggleCollapse = () => {
    // Commit any pending edit before toggling
    let finalComments = comments;
    if (editingCommentId && editEditor && !editEditor.isDestroyed) {
      const htmlContent = editEditor.getHTML();
      const textContent = editEditor.getText().trim();
      if (textContent) {
        finalComments = comments.map((c) =>
          c.id === editingCommentId ? { ...c, text: htmlContent } : c
        );
        setComments(finalComments);
        setEditingCommentId(null);
      }
    }
    const nextIsCollapsed = !isCollapsed;
    setIsCollapsed(nextIsCollapsed);
    onSave({
      comments: finalComments,
      cardColor,
      badgeColor,
      isCollapsed: nextIsCollapsed,
      topStrip: topStrip || undefined,
      commentTitle: commentTitle.trim() || undefined,
      keepEditorOpen: true,
    });
  };

  const activeComment = comments.find((comment) => comment.id === activeCommentId) || null;

  // Toolbar handlers
  const handleBold = () => editor?.chain().focus().toggleBold().run();
  const handleItalic = () => editor?.chain().focus().toggleItalic().run();
  const handleStrike = () => editor?.chain().focus().toggleStrike().run();
  const handleUnderline = () => editor?.chain().focus().toggleUnderline().run();
  const handleBulletList = () => editor?.chain().focus().toggleBulletList().run();
  const handleOrderedList = () => editor?.chain().focus().toggleOrderedList().run();
  const handleCode = () => editor?.chain().focus().toggleCodeBlock().run();
  const handleAlign = () => editor && cycleEditorTextAlign(editor);

  const getActiveEditor = () => (editingCommentId ? editEditor : editor);

  const handleLink = () => {
    if (isReadOnly) return;
    const activeEditor = getActiveEditor();
    if (!activeEditor) return;
    if (activeEditor.state.selection.empty) return;
    // Save selection before opening link input (focus may be lost)
    const { from, to } = activeEditor.state.selection;
    savedSelectionRef.current = { from, to };
    setTextStyleOpen(false);
    setCardColorOpen(false);
    setBadgeColorOpen(false);
    setEmojiOpen(false);
    const previousUrl = activeEditor.getAttributes("link").href || "";
    setLinkUrl(previousUrl);
    setLinkInputOpen(true);
  };

  const handleEmojiClick = (emojiData: { emoji: string }) => {
    if (!editor) return;
    editor.chain().focus().insertContent(emojiData.emoji).run();
    setEmojiOpen(false);
  };

  const handleTextColor = (color: string) => {
    if (isReadOnly) return;
    if (!editor) return;
    editor.chain().focus().setColor(color).run();
    setCurrentTextColor(color);
  };

  const handleHighlight = (color: string) => {
    if (isReadOnly) return;
    if (!editor) return;
    if (color === "transparent") {
      editor.chain().focus().unsetHighlight().run();
    } else {
      editor.chain().focus().setHighlight({ color }).run();
    }
    setCurrentHighlight(color);
  };

  const handleApplyLink = () => {
    if (isReadOnly) return;
    const activeEditor = getActiveEditor();
    if (!activeEditor) return;

    applyCommentLink(activeEditor, linkUrl, savedSelectionRef.current);

    setLinkInputOpen(false);
    setLinkUrl("");
    savedSelectionRef.current = null;
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleSave();
  };

  useEffect(() => {
    const activeEditor = getActiveEditor();
    if (!activeEditor) {
      setLinkEnabled(false);
      return;
    }
    const updateLinkEnabled = () => {
      setLinkEnabled(!activeEditor.state.selection.empty);
    };
    updateLinkEnabled();
    activeEditor.on("selectionUpdate", updateLinkEnabled);
    activeEditor.on("transaction", updateLinkEnabled);
    return () => {
      activeEditor.off("selectionUpdate", updateLinkEnabled);
      activeEditor.off("transaction", updateLinkEnabled);
    };
  }, [editor, editEditor, editingCommentId]);

  if (!isOpen || !editor) return null;

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
      onClick={handleOverlayClick}
    >
      {/* Three-column grid, not a centered flex row (see PostEditorShell.tsx
          for the same fix and rationale): the two flanking columns are both
          `1fr`, always equal width to each other regardless of what (or
          whether anything) is open in them, so the main card's on-screen
          position never shifts when Text Style opens/closes. (The other
          popups here -- card color, emoji, link -- are already absolute
          overlays anchored to the card and never affected the row's width.)
          Grid tracks are pointer-events: none (pure layout, often wider than
          their visible content) with pointer events re-enabled only on the
          actual toolbar/card/panel boxes, so empty grid space still counts
          as a genuine backdrop click. */}
      <div
        className="grid items-start gap-3"
        style={{ gridTemplateColumns: '1fr auto 1fr', width: '100%', pointerEvents: 'none' }}
      >
        <div className="flex items-start justify-end" style={{ pointerEvents: 'none' }}>
        {/* Left Toolbar - visually hidden when comment color popup is open, but keeps width to prevent layout shift */}
        <div
          className={commentColorPopupId ? "invisible pointer-events-none" : ""}
          style={{ pointerEvents: commentColorPopupId ? 'none' : 'auto' }}
          onClick={(e) => e.stopPropagation()}
        >
          <CommentEditorToolbar
            mode={toolbarMode}
            onModeChange={setToolbarMode}
            onCardColor={() => {
              setTextStyleOpen(false);
              setLinkInputOpen(false);
              setBadgeColorOpen(false);
              setCardColorOpen(true);
            }}
            onCollapse={handleToggleCollapse}
            isCollapsed={isCollapsed}
            onLink={handleLink}
            onTextStyle={() => {
              setEmojiOpen(false);
              setLinkInputOpen(false);
              setCardColorOpen(false);
              setBadgeColorOpen(false);
              setTextStyleOpen(true);
            }}
            textStyleOpen={textStyleOpen}
            onEmoji={() => {
              setTextStyleOpen(false);
              setLinkInputOpen(false);
              setCardColorOpen(false);
              setBadgeColorOpen(false);
              setEmojiOpen(!emojiOpen);
            }}
            emojiOpen={emojiOpen}
            linkEnabled={linkEnabled}
            readOnly={isReadOnly}
          />
        </div>
        </div>

        {/* Main Card */}
        <div
          className="relative rounded-xl shadow-2xl border border-gray-200 overflow-visible"
          style={{ width: "320px", backgroundColor: cardColor, pointerEvents: 'auto' }}
        >
          {/* Top strip -- Title lives inside it, same as the canvas card's
              own top strip, matching every other post type's edit window.
              A flow element (not the old absolute-positioned accent line)
              so it actually pushes the rest of the card down. */}
          <div
            className="w-full flex-shrink-0 flex items-center px-2 rounded-t-xl"
            style={{
              minHeight: '22px',
              backgroundColor: topStrip && topStrip !== 'transparent' ? topStrip : 'rgba(0,0,0,0.04)',
            }}
          >
            <input
              type="text"
              value={commentTitle}
              onChange={(e) => { if (!isReadOnly) setCommentTitle(e.target.value); }}
              placeholder="Post name"
              readOnly={isReadOnly}
              className="w-full text-sm font-semibold bg-transparent outline-none border-b border-transparent focus:border-blue-400 placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1"
              style={{ color: topStrip && topStrip !== 'transparent' ? contrastIconColor(topStrip) : '#374151', cursor: isReadOnly ? 'default' : undefined }}
            />
          </div>
          {/* Card Color Popup - New style matching NoteEditor */}
          {cardColorOpen && (
            <div
              className="absolute left-full top-0 ml-2 z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 h-fit"
              style={{ width: '260px' }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.preventDefault()}
            >
              <button
                onClick={() => setCardColorOpen(false)}
                className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Note Color</span>
                <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                    <button
                      onClick={() => setActiveColorTab('background')}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeColorTab === 'background'
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-500 hover:text-gray-700"
                        }`}
                      title="Background Color"
                    >
                      BG
                    </button>
                    <button
                      onClick={() => setActiveColorTab('topstrip')}
                      className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${activeColorTab === 'topstrip'
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
                  color={activeColorTab === "background" ? cardColor : (topStrip || 'transparent')}
                  onChange={(c) => activeColorTab === "background" ? setCardColor(c) : setTopStrip(c)}
                  hasOpacity={true}
                  presets={activeColorTab === "background" ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
                />
              </div>
            </div>
          )}

          {/* Emoji Picker Popup */}
          {emojiOpen && (
            <div className="absolute left-full top-0 ml-2 z-[70]" onMouseDown={(e) => e.preventDefault()}>
              <EmojiPicker
                onEmojiClick={handleEmojiClick}
                width={320}
                height={400}
                searchPlaceHolder="Search emojis..."
                previewConfig={{ showPreview: false }}
              />
            </div>
          )}

          {/* Link Input Popup */}
          {linkInputOpen && (
            <div
              className="absolute left-full top-0 ml-2 z-[60] bg-white rounded-lg shadow-lg p-3 border border-gray-200"
              onMouseDown={(e) => e.preventDefault()}
            >
              <CommentLinkPopover
                url={linkUrl}
                onUrlChange={setLinkUrl}
                onApply={handleApplyLink}
                onCancel={() => setLinkInputOpen(false)}
                inputClassName="flex-1 px-3 py-2 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm w-64"
                applyButtonClassName="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
              />
            </div>
          )}

          <div className="relative p-4">
            {commentColorPopupId && (
              <div
                className="absolute right-full top-0 mr-3 z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <TextStylePopup
                  isOpen={true}
                  onOpenChange={(open) => !open && setCommentColorPopupId(null)}
                  onSelectHeading={() => {}}
                  hideHeadingSelect={true}
                  onSelectColor={(color) => {
                    if (isReadOnly) return;
                    setComments((prev) =>
                      prev.map((comment) =>
                        comment.id === commentColorPopupId
                          ? { ...comment, textColor: color, color }
                          : comment
                      )
                    );
                  }}
                  onSelectHighlight={(color) => {
                    if (isReadOnly) return;
                    setComments((prev) =>
                      prev.map((comment) =>
                        comment.id === commentColorPopupId
                          ? { ...comment, backgroundColor: color }
                          : comment
                      )
                    );
                  }}
                  currentHeading="normal"
                  currentColor={comments.find((comment) => comment.id === commentColorPopupId)?.textColor || comments.find((comment) => comment.id === commentColorPopupId)?.color}
                  currentHighlight={comments.find((comment) => comment.id === commentColorPopupId)?.backgroundColor}
                />
              </div>
            )}

            <div className="flex items-center justify-end mb-3">
              {/* Close button removed -- redundant with the backdrop click
                  (handleOverlayClick) which already saves and closes, same
                  as every other editor. Badge Color trigger not rendered at
                  all in read-only -- matches the "not rendered, not merely
                  disabled" principle used everywhere else in the canonical
                  comment system. */}
              {!isReadOnly && (
              <button
                onClick={() => {
                  setBadgeColorOpen((prev) => !prev);
                  setCommentColorPopupId(null);
                }}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                title="Badge Color"
              >
                <div
                  className="w-4 h-4 rounded border border-gray-300"
                  style={{ backgroundColor: badgeColor }}
                />
              </button>
              )}
            </div>

            {badgeColorOpen && (
              <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                <div className="grid grid-cols-6 gap-1.5">
                  {BADGE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => {
                        if (isReadOnly) return;
                        setBadgeColor(color);
                        setBadgeColorOpen(false);
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

            {comments.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
            ) : (
              <div className="space-y-1 max-h-[360px] overflow-y-auto overflow-x-hidden scrollbar-ultrathin">
                {comments.map((comment) => {
                  const isEditing = editingCommentId === comment.id;
                  const isActive = activeCommentId === comment.id;

                  return (
                    <div
                      key={comment.id}
                      className={`group/row flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      onClick={() => setActiveCommentId(comment.id)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        handleEditComment(comment.id);
                        setCommentColorPopupId(null);
                      }}
                    >
                      {/* Avatar Column */}
                      <div className="flex flex-col items-center gap-0.5 shrink-0 w-[22px]">
                        <div className="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          {comment.userAvatar ? (
                            <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full" />
                          ) : (
                            getInitial(comment.userName)
                          )}
                        </div>
                        <span className="text-[9px] text-gray-400 leading-none text-center">
                          {getTimeAgo(comment.timestamp).replace(' ago', '')}
                        </span>
                      </div>

                      {/* Content Column */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-gray-700 truncate">{comment.userName}</span>
                        </div>
                        {isEditing ? (
                          <div
                            className="relative"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <EditorContent
                              editor={editEditor}
                              className="max-h-[120px] overflow-auto"
                              onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  handleSaveEdit();
                                }
                                if (e.key === 'Escape') {
                                  setEditingCommentId(null);
                                  if (editEditor && !editEditor.isDestroyed) {
                                    editEditor.commands.clearContent();
                                  }
                                }
                              }}
                            />
                          </div>
                        ) : (
                          <div
                            className={`text-xs text-gray-600 whitespace-pre-wrap break-words leading-relaxed [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer ${comment.isStrikethrough ? 'line-through opacity-60' : ''}`}
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

                      {/* Actions Column - Fixed width, always reserves space.
                          Not rendered at all in read-only -- matches the "not
                          rendered, not merely disabled" principle used
                          everywhere else in the canonical comment system. */}
                      {!isReadOnly && (
                      <div className="flex flex-col gap-0.5 w-5 shrink-0">
                        <div className={`flex flex-col gap-0.5 ${isActive ? 'visible' : 'invisible group-hover/row:visible'}`}>
                          {/* Edit/Palette Button */}
                          {isEditing ? (
                            <button
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setCommentColorPopupId((prev) => (prev === comment.id ? null : comment.id));
                              }}
                              className={`p-0.5 rounded transition-colors ${actionBaseClass}`}
                              title="Color"
                            >
                              <Palette className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEditComment(comment.id);
                                setShouldSelectText(true);
                                setCommentColorPopupId(null);
                              }}
                              className={`p-0.5 rounded transition-colors ${actionBaseClass}`}
                              title="Edit"
                            >
                              <PenTool className="w-3 h-3" />
                            </button>
                          )}
                          {/* Strikethrough Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isReadOnly) return;
                              setComments((prev) =>
                                prev.map((c) =>
                                  c.id === comment.id
                                    ? { ...c, isStrikethrough: !c.isStrikethrough }
                                    : c
                                )
                              );
                            }}
                            className={`p-0.5 rounded transition-colors ${comment.isStrikethrough ? strikeActiveClass : actionBaseClass}`}
                            title="Strikethrough"
                          >
                            <Strikethrough className="w-3 h-3" />
                          </button>
                          {/* Delete Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveComment(comment.id);
                              if (activeCommentId === comment.id) {
                                setActiveCommentId(null);
                              }
                              setEditingCommentId(null);
                              if (editEditor && !editEditor.isDestroyed) {
                                editEditor.commands.clearContent();
                              }
                              setCommentColorPopupId(null);
                            }}
                            className={`p-0.5 rounded transition-colors ${isDarkCard ? 'text-gray-200' : 'text-gray-300'} ${deleteHoverClass}`}
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {!isReadOnly && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
                  <MessageSquare className="w-3.5 h-3.5" />
                </div>
                <div
                  className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:border-gray-200 focus-within:ring-0"
                  onKeyDown={handleKeyDown}
                >
                  <EditorContent key={`main-${editorKey}`} editor={editor} />
                </div>
                <button
                  onClick={handleAddComment}
                  className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
                  title="Send"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            )}
          </div>

          {/* Save/Close is handled by clicking outside or ESC */}
        </div>

        {/* Text Style Popup -- right-side grid column (same architecture as
            Note/Document's sharedPanel slot in PostEditorShell.tsx): this
            column is `1fr`, always equal width to the toolbar's `1fr`
            column, so opening it no longer drags the main card sideways. */}
        <div className="flex items-start justify-start" style={{ pointerEvents: 'none' }}>
        <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
        {textStyleOpen && (
          <div className="relative z-[60] w-[300px]">
            <button
              onClick={() => setTextStyleOpen(false)}
              className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <div
              className="bg-white rounded-lg shadow-2xl p-4 border border-gray-100 max-h-[calc(100vh-2rem)] overflow-y-auto"
              onMouseDown={(e) => e.preventDefault()}
            >
            <TextStylePopup
              isOpen={true}
              onOpenChange={setTextStyleOpen}
              onSelectHeading={() => {}}
              onSelectColor={handleTextColor}
              onSelectHighlight={handleHighlight}
              currentColor={currentTextColor}
              currentHighlight={currentHighlight}
              hideCloseButton
              onBold={handleBold}
              onItalic={handleItalic}
              onStrikethrough={handleStrike}
              onUnderline={handleUnderline}
              onBulletList={handleBulletList}
              onOrderedList={handleOrderedList}
              onCode={handleCode}
              onAlign={handleAlign}
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
        </div>
        </div>
      </div>
    </div>
  );
}
