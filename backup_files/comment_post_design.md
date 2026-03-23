# Comment Post Design Reference

This document captures the current design, spacing, and behavior for the **canvas view** and the **comment editing window** so the layout can be restored exactly if needed.

---

## 1) Canvas View (CommentPost card on canvas)

**File:** `components/collabboard/CommentPost.tsx`

### A. File Structure & Imports

```tsx
"use client";

import React, { useState } from 'react';
import { MessageSquare, Palette, PenTool, Send, Strikethrough, Trash2 } from 'lucide-react';
import TextStylePopup from './editors/TextStylePopup';
```

### B. Interfaces

#### CommentData Interface
```tsx
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
```

#### CommentPostProps Interface
```tsx
interface CommentPostProps {
    comments: CommentData[];
    cardColor: string;
    badgeColor?: string;
    topStrip?: string;
    commentTitle?: string;
    onEdit: () => void;
    onAddComment?: (text: string) => void;
    onEditComment?: (commentId: string, text: string) => void;
    onToggleCommentStrikethrough?: (commentId: string) => void;
    onDeleteComment?: (commentId: string) => void;
    onUpdateCommentColor?: (commentId: string, textColor?: string, backgroundColor?: string) => void;
    onClick?: (e: React.MouseEvent) => void;
    onDoubleClick?: (e: React.MouseEvent) => void;
    onMouseDown?: (e: React.MouseEvent) => void;
    selected?: boolean;
    showMenu?: boolean;
    onMenuClick?: () => void;
    onBadgeClick?: (e: React.MouseEvent) => void;
    width?: number;
    height?: number;
}
```

### C. Component State

```tsx
const [draftComment, setDraftComment] = useState('');
const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
const [editingText, setEditingText] = useState('');
const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
```

### D. Default Props

```tsx
cardColor = '#ffffff'
badgeColor = '#facc15'
topStrip = 'transparent'
commentTitle = 'Comments'
selected = false
showMenu = false
width = 300
height = 'auto'
```

### E. Helper Functions

#### getTimeAgo
```tsx
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
```

#### getInitial
```tsx
const getInitial = (name: string) => name.charAt(0).toUpperCase();
```

### F. Card Container

**Classes:**
```
group bg-white rounded-xl shadow-lg border border-gray-200 flex flex-col cursor-pointer transition-shadow
```

**Selected state:** `ring-2 ring-blue-500 ring-offset-2`
**Hover state:** `hover:shadow-xl`

**Inline styles:**
```tsx
style={{
    width: typeof width === 'number' ? `${width}px` : width,
    minHeight: '100px',
    backgroundColor: cardColor
}}
```

**Top strip (when enabled):**
```tsx
{topStrip && topStrip !== 'transparent' && (
  <div className="h-1.5 w-full rounded-t-xl" style={{ backgroundColor: topStrip }} />
)}
```

**Data attribute:** `data-comment-post-root="true"`

**Event handlers:**
- `onClick`: calls `onClick` prop with `e.stopPropagation()`
- `onDoubleClick`: calls `onDoubleClick` prop with `e.stopPropagation()` (clears selection; does NOT open editor)
- `onMouseDown`: calls `onMouseDown` prop

### G. Inner Content Container

**Classes:** `p-4 flex-1 flex flex-col relative`

### H. Comment Color Popup (TextStylePopup)

**Trigger:** When `commentColorPopupId` is set (edit button switches to Palette when editing)

**Container classes:**
```
absolute right-full top-0 mr-3 z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]
```

**Position:** Left side of card (`right-full`)

**TextStylePopup props:**
```tsx
<TextStylePopup
    isOpen={true}
    onOpenChange={(open) => !open && setCommentColorPopupId(null)}
    onSelectHeading={() => {}}
    hideHeadingSelect={true}
    onSelectColor={(color) => {
        if (onUpdateCommentColor && commentColorPopupId) {
            onUpdateCommentColor(commentColorPopupId, color, undefined);
        }
    }}
    onSelectHighlight={(color) => {
        if (onUpdateCommentColor && commentColorPopupId) {
            onUpdateCommentColor(commentColorPopupId, undefined, color);
        }
    }}
    currentHeading="normal"
    currentColor={comments.find((c) => c.id === commentColorPopupId)?.textColor || comments.find((c) => c.id === commentColorPopupId)?.color}
    currentHighlight={comments.find((c) => c.id === commentColorPopupId)?.backgroundColor}
/>
```

### I. Header Section

**Container classes:** `flex items-center justify-between mb-3`

#### Title
- Text: `commentTitle` (default: "Comments")
- Classes: `text-sm font-semibold text-gray-700`

#### Badge Color Button
- Button classes: `w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100`
- Title: "Badge Color"
- Inner square classes: `w-4 h-4 rounded border border-gray-300`
- Inline style: `backgroundColor: badgeColor`
- Click handler: calls `onBadgeClick` with `e.stopPropagation()`

#### Menu Button (3-dot)
- Only shows when `showMenu={true}`
- Button classes: `w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100`
- Title: "Edit"
- Data attribute: `data-no-drag="true"`
- Click handler: calls `onMenuClick` with `e.stopPropagation()`
- SVG icon: 3 circles at cy="5", cy="12", cy="19" (vertical dots)

### J. Comment List Container

**Note:** In the canvas view, the only way to open the editing window is via the Edit button (3-dot menu). Double-click does not open the editor.

**Wrapper (when comments exist):** `flex gap-2`

**List container classes:**
```
flex-1 space-y-3 max-h-[240px] overflow-y-auto overflow-x-hidden pr-0 mr-0.5 scrollbar-ultrathin
```

**Key values:**
- `max-h-[240px]` - Maximum height before scrolling
- `mr-0.5` - 2px right margin (scrollbar offset)
- `space-y-3` - Gap between comment rows
- `scrollbar-ultrathin` - Custom scrollbar style

### K. Comment Row

**Container classes:**
```tsx
`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`
```

**Click handler:** `onClick={() => setActiveCommentId(comment.id)}`
**Double-click handler:** starts editing the comment text (does NOT open editor modal)

#### Avatar Column
**Container classes:** `flex flex-col items-center gap-0.5 shrink-0 w-[22px]`

**Avatar circle:**
- Classes: `w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0`
- Shows user avatar image or initial letter

**Time text:**
- Classes: `text-[9px] text-gray-400 leading-none text-center`
- Format: `Xm` (1–59), `Xh` (1–23), `Xd` (1–364), `Xy` (365+)

#### Content Column
**Container classes:** `flex-1 min-w-0`

**Name row:**
- Classes: `flex items-center gap-2 mb-0.5`
- Name text: `text-xs font-medium text-gray-700 truncate`

**Comment body (when not editing):**
```tsx
<div
    className={`text-xs text-gray-600 break-words whitespace-pre-wrap leading-relaxed select-text cursor-text ${comment.isStrikethrough ? 'line-through' : ''}`}
    style={{
        color: comment.textColor || comment.color,
        backgroundColor: comment.backgroundColor || undefined,
    }}
    onMouseDown={(e) => e.stopPropagation()}
    onClick={(e) => e.stopPropagation()}
    onDoubleClick={(e) => {
        e.stopPropagation();
        startEdit();
    }}
    dangerouslySetInnerHTML={{ __html: comment.text }}
/>
```

**Key features:**
- `select-text cursor-text` - Enables mouse text selection
- `stopPropagation` on mouseDown/click - Allows text selection without triggering row selection
- Supports `textColor`, `backgroundColor`, and `isStrikethrough`

**Editing textarea (when editing):**
```tsx
<textarea
    value={editingText}
    onChange={(e) => setEditingText(e.target.value)}
    onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            commitEdit();
        }
        if (e.key === 'Escape') {
            setEditingCommentId(null);
            setEditingText('');
            setCommentColorPopupId(null);
        }
    }}
    onBlur={() => commitEdit()}
    className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
    rows={1}
/>
```

#### commitEdit Function
```tsx
const commitEdit = () => {
    const trimmed = editingText.trim();
    if (!trimmed) {
        setEditingCommentId(null);
        setEditingText('');
        setCommentColorPopupId(null);
        return;
    }
    if (onEditComment) onEditComment(comment.id, trimmed);
    setEditingCommentId(null);
    setEditingText('');
    setCommentColorPopupId(null);
};
```

### L. Action Buttons Column

**Container classes:** `flex flex-col gap-1 flex-shrink-0 pt-1 -mr-1`

**Key values:**
- `-mr-1` - 4px right nudge toward card edge
- `pt-1` - Top padding alignment

**Button contrast (auto):**
- Light cards use gray/blue buttons
- Dark cards switch to lighter icons for contrast

#### Edit/Palette Button (Dual Function)

**When NOT editing (shows PenTool):**
```tsx
<button
    onClick={() => {
        if (!activeCommentId) return;
        const current = comments.find(c => c.id === activeCommentId);
        setEditingCommentId(activeCommentId);
        setEditingText(current?.text || '');
        setCommentColorPopupId(null);
    }}
    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
    title="Edit"
    disabled={!activeCommentId}
>
    <PenTool className="w-3 h-3" />
</button>
```

**When editing (shows Palette):**
```tsx
<button
    onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
    }}
    onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setCommentColorPopupId((prev) => (prev === activeCommentId ? null : activeCommentId));
    }}
    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
    title="Color"
    disabled={!activeCommentId}
>
    <Palette className="w-3 h-3" />
</button>
```

#### Strikethrough Button
```tsx
<button
    onClick={() => {
        if (!activeCommentId || !onToggleCommentStrikethrough) return;
        onToggleCommentStrikethrough(activeCommentId);
    }}
    className={`p-1 rounded transition-colors ${comments.find(c => c.id === activeCommentId)?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
    title="Strikethrough"
    disabled={!activeCommentId}
>
    <Strikethrough className="w-3 h-3" />
</button>
```

#### Delete Button
```tsx
<button
    onClick={() => {
        if (!activeCommentId || !onDeleteComment) return;
        onDeleteComment(activeCommentId);
        setActiveCommentId(null);
        setEditingCommentId(null);
        setEditingText('');
        setCommentColorPopupId(null);
    }}
    className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
    title="Delete"
    disabled={!activeCommentId}
>
    <Trash2 className="w-3 h-3" />
</button>
```

### M. Input Section (Add Comment)

**Container classes:** `mt-3 pt-3 border-t border-gray-100`

**Inner wrapper:** `flex items-center gap-2`

#### Left Icon (MessageSquare)
```tsx
<div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
    <MessageSquare className="w-3.5 h-3.5" />
</div>
```

#### Text Input
```tsx
<input
    type="text"
    placeholder="Add a comment..."
    className="flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none bg-white"
    onFocus={(e) => {
        e.stopPropagation();
        if (!onAddComment) onEdit();
    }}
    onClick={(e) => e.stopPropagation()}
    value={draftComment}
    onChange={(e) => setDraftComment(e.target.value)}
    onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (onAddComment && draftComment.trim()) {
                onAddComment(draftComment.trim());
                setDraftComment('');
            } else if (!onAddComment) {
                onEdit();
            }
        }
    }}
    data-no-drag="true"
/>
```

#### Send Button
```tsx
<button
    onClick={(e) => {
        e.stopPropagation();
        if (onAddComment && draftComment.trim()) {
            onAddComment(draftComment.trim());
            setDraftComment('');
        } else if (!onAddComment) {
            onEdit();
        }
    }}
    className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
    title="Open comments"
    data-no-drag="true"
>
    <Send className="w-3.5 h-3.5" />
</button>
```

### N. Empty State

When `comments.length === 0`:
```tsx
<p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
```

---

## 2) Parent Component Wiring (CanvasClient.tsx)

**File:** `app/dashboard/canvas/[id]/CanvasClient.tsx`

### CommentPost Usage in CanvasClient

```tsx
<CommentPost
    comments={padlet.metadata?.comments || []}
    cardColor={padlet.metadata?.cardColor || '#ffffff'}
    badgeColor={padlet.metadata?.badgeColor || '#facc15'}
    selected={selectedPadletId === padlet.id}
    showMenu={true}
    onMenuClick={() => {
        closeAllToolbars();
        setPadletToEdit(padlet);
        setIsCommentEditorOpen(true);
    }}
    onAddComment={async (text) => {
        const newComment = {
            id: `comment-${Date.now()}`,
            text,
            userId: user?.id || 'anon',
            userName: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Anonymous',
            userAvatar: user?.user_metadata?.avatar_url,
            timestamp: Date.now(),
        };
        const currentComments = padlet.metadata?.comments || [];
        await updatePadletMetadata(padlet.id, {
            comments: [...currentComments, newComment],
        });
    }}
    onEditComment={async (commentId, text) => {
        const currentComments = padlet.metadata?.comments || [];
        const nextComments = currentComments.map((comment: any) =>
            comment.id === commentId ? { ...comment, text } : comment
        );
        await updatePadletMetadata(padlet.id, { comments: nextComments });
    }}
    onToggleCommentStrikethrough={async (commentId) => {
        const currentComments = padlet.metadata?.comments || [];
        const nextComments = currentComments.map((comment: any) =>
            comment.id === commentId
                ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                : comment
        );
        await updatePadletMetadata(padlet.id, { comments: nextComments });
    }}
    onDeleteComment={async (commentId) => {
        const currentComments = padlet.metadata?.comments || [];
        const nextComments = currentComments.filter((comment: any) => comment.id !== commentId);
        await updatePadletMetadata(padlet.id, { comments: nextComments });
    }}
    onUpdateCommentColor={async (commentId, textColor, backgroundColor) => {
        const currentComments = padlet.metadata?.comments || [];
        const nextComments = currentComments.map((comment: any) =>
            comment.id === commentId
                ? {
                    ...comment,
                    ...(textColor !== undefined && { textColor, color: textColor }),
                    ...(backgroundColor !== undefined && { backgroundColor }),
                }
                : comment
        );
        await updatePadletMetadata(padlet.id, { comments: nextComments });
    }}
    onClick={(e) => {
        e.stopPropagation();
        if (!isDragging) {
            closeAllToolbars();
            setSelectedPadletId(padlet.id);
        }
    }}
    onDoubleClick={(e) => {
        e.stopPropagation();
        // Double-click does NOT open editor; it only clears selection
        closeAllToolbars();
        setSelectedPadletId(null);
    }}
    onEdit={() => {
        closeAllToolbars();
        setPadletToEdit(padlet);
        setIsCommentEditorOpen(true);
    }}
    onMouseDown={(e) => {
        if (isLineMode) return;
        handlePadletMouseDown(e, padlet.id);
    }}
    onBadgeClick={(e) => {
        e.stopPropagation();
        // Opens badge color popup (handled by parent)
    }}
/>
```

---

## 3) Editing Window (CommentEditor modal)

**File:** `components/collabboard/editors/CommentEditor.tsx`

### A. File Structure & Imports

```tsx
"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import { Highlight } from "@tiptap/extension-highlight";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import { MessageSquare, Palette, PenTool, Send, Strikethrough, Trash2, X } from "lucide-react";
import EmojiPicker from "emoji-picker-react";

import CommentEditorToolbar, { ToolbarMode } from "./CommentEditorToolbar";
import TextStylePopup from "./TextStylePopup";
import { ColorPickerContent } from "../ColorPicker";
```

### B. Color Constants

```tsx
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
```

### C. Interfaces

#### CommentData Interface
```tsx
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
```

#### CommentEditorProps Interface
```tsx
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
  }) => void;
  initialComments?: CommentData[];
  initialCardColor?: string;
  initialBadgeColor?: string;
  initialTopStrip?: string;
  initialCommentTitle?: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  targetId?: string; // For hard-reset when switching targets
}
```

### D. Component State

```tsx
// Core data state
const [comments, setComments] = useState<CommentData[]>(initialComments);
const [cardColor, setCardColor] = useState(initialCardColor);
const [badgeColor, setBadgeColor] = useState(initialBadgeColor);
const [topStrip, setTopStrip] = useState<string | null>(initialTopStrip || null);
const [commentTitle, setCommentTitle] = useState(initialCommentTitle);
const [showTitleInput, setShowTitleInput] = useState(false);
const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);

// Popup state
const [cardColorOpen, setCardColorOpen] = useState(false);
const [textStyleOpen, setTextStyleOpen] = useState(false);
const [badgeColorOpen, setBadgeColorOpen] = useState(false);
const [linkInputOpen, setLinkInputOpen] = useState(false);
const [emojiOpen, setEmojiOpen] = useState(false);

// Text styling state
const [currentTextColor, setCurrentTextColor] = useState("#1f2937");
const [currentHighlight, setCurrentHighlight] = useState("transparent");
const [linkUrl, setLinkUrl] = useState("");

// Toolbar state
const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("text");

// Card color popup state
const [cardTextColor, setCardTextColor] = useState("#1F2937");
const [activeColorTab, setActiveColorTab] = useState<'background' | 'topstrip'>('background');

// Editor key for hard reset
const [editorKey, setEditorKey] = useState(0);
```

### E. Default Props

```tsx
initialComments = []
initialCardColor = "#ffffff"
initialBadgeColor = "#facc15"
initialTopStrip = "transparent"
initialCommentTitle = "Comments"
currentUserId = "user1"
currentUserName = "R"
```

### F. TipTap Editor Extensions

```tsx
const extensions = [
  StarterKit,
  Link.configure({
    openOnClick: false,
    HTMLAttributes: {
      class: "text-blue-500 underline cursor-pointer",
    },
  }),
  Underline,
  TextStyle,
  Color,
  Highlight.configure({ multicolor: true }),
];
```

### G. TipTap Editors

#### Main Editor (for new comments)
```tsx
const editor = useEditor(
  {
    immediatelyRender: false,
    extensions,
    content: "",
    editorProps: {
      attributes: {
        class: "max-w-none focus:outline-none px-3 py-2 text-xs overflow-x-hidden",
      },
    },
  },
  [editorKey]
);
```

#### Edit Editor (for editing existing comments)
```tsx
const editEditor = useEditor(
  {
    immediatelyRender: false,
    extensions,
    content: "",
    editorProps: {
      attributes: {
        class: "w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 overflow-x-hidden",
      },
    },
  },
  [editorKey]
);
```

### H. Key Functions

#### handleAddComment
```tsx
const handleAddComment = () => {
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
```

#### handleEditComment
```tsx
const handleEditComment = (commentId: string) => {
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
```

#### handleSaveEdit
```tsx
const handleSaveEdit = () => {
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
```

#### handleRemoveComment
```tsx
const handleRemoveComment = (commentId: string) => {
  setComments((prev) => {
    const next = prev.filter((comment) => comment.id !== commentId);
    if (activeCommentId === commentId) {
      setActiveCommentId(next[next.length - 1]?.id || null);
    }
    return next;
  });
};
```

#### handleSave
```tsx
const handleSave = () => {
  onSave({ comments, cardColor, badgeColor, topStrip: topStrip || undefined, commentTitle });
  resetEditors();
  onClose();
};
```

#### handleCollapse
```tsx
const handleCollapse = () => {
  onSave({ comments, cardColor, badgeColor, isCollapsed: true, topStrip: topStrip || undefined, commentTitle });
  resetEditors();
  onClose();
};
```

### I. Modal Overlay

**Classes:** `fixed inset-0 z-[1000] flex items-center justify-center bg-black/30`

**Click handler:** `onClick={handleOverlayClick}` - saves and closes when clicking outside

### J. Layout Structure

```tsx
<div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
  {/* Left Toolbar - visually hidden when commentColorPopupId is set, but width is preserved */}
  <div className={commentColorPopupId ? "invisible pointer-events-none" : ""}>
    <CommentEditorToolbar ... />
  </div>

  {/* Main Card */}
  <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 overflow-visible" style={{ width: "320px" }}>
    ...
  </div>
</div>
```

**IMPORTANT:** Left toolbar is visually hidden (not unmounted) when `commentColorPopupId` is truthy to prevent layout shift.

### K. Left Toolbar (CommentEditorToolbar)

**Conditional render:** `CommentEditorToolbar` is always rendered, wrapped in `invisible pointer-events-none` when `commentColorPopupId` is truthy.

**Props:**
```tsx
<CommentEditorToolbar
  mode={toolbarMode}
  onModeChange={setToolbarMode}
  onCardColor={() => {
    setTextStyleOpen(false);
    setLinkInputOpen(false);
    setBadgeColorOpen(false);
    setCardColorOpen(true);
  }}
  onTitle={() => setShowTitleInput((prev) => !prev)}
  titleActive={showTitleInput}
  onBold={handleBold}
  onItalic={handleItalic}
  onStrikethrough={handleStrike}
  onLink={handleLink}
  onEmoji={() => {
    setTextStyleOpen(false);
    setLinkInputOpen(false);
    setCardColorOpen(false);
    setBadgeColorOpen(false);
    setEmojiOpen(!emojiOpen);
  }}
  emojiOpen={emojiOpen}
  linkEnabled={linkEnabled}
/>
```

### L. Main Card

**Container classes:** `relative rounded-xl shadow-2xl border border-gray-200 overflow-visible`
**Width:** `320px`
**Inline styles:** `backgroundColor: cardColor`
**Top strip (when enabled):** `h-1.5` strip at top

### M. Popups (positioned to right of card)

#### Card Color Popup
**Position:** `absolute left-full top-0 ml-2 z-50`
**Width:** `260px`
**Contains:** BG/TS tabs + ColorPickerContent
**Close button:** top-right inside header (does not overlap BG/TS)

#### Emoji Picker Popup
**Position:** `absolute left-full top-0 ml-2 z-[70]`
**Component:** `<EmojiPicker width={320} height={400} />`

#### Text Style Popup
**Position:** `absolute left-full top-0 ml-2 z-[60]`
**Width:** `300px`

#### Link Input Popup
**Position:** `absolute left-full top-0 ml-2 z-[60]`

### N. Comment Color Popup (TextStylePopup)

**Trigger:** When `commentColorPopupId` is set (edit button switches to Palette when editing)
**Position:** `absolute right-full top-0 mr-3 z-[1200]` (LEFT side of card)
**Width:** `min-w-[240px]`

```tsx
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
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentColorPopupId
              ? { ...comment, textColor: color, color }
              : comment
          )
        );
      }}
      onSelectHighlight={(color) => {
        setComments((prev) =>
          prev.map((comment) =>
            comment.id === commentColorPopupId
              ? { ...comment, backgroundColor: color }
              : comment
          )
        );
      }}
      currentHeading="normal"
      currentColor={comments.find((c) => c.id === commentColorPopupId)?.textColor || comments.find((c) => c.id === commentColorPopupId)?.color}
      currentHighlight={comments.find((c) => c.id === commentColorPopupId)?.backgroundColor}
    />
  </div>
)}
```

### O. Header Section

**Container classes:** `flex items-center justify-between mb-3`

#### Title
- Text: `commentTitle` (default: "Comments")
- Title can be toggled into an input via the Title button in the left toolbar
- Classes: `text-sm font-semibold text-gray-700`

#### Badge Color Button
```tsx
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
```

#### Close Button (X)
```tsx
<button
  onClick={handleSave}
  className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
  title="Close"
>
  <X className="w-4 h-4" />
</button>
```

### P. Badge Color Panel

**Position:** `absolute right-3 top-12 z-10`
**Grid:** `grid grid-cols-6 gap-1.5`
**Square size:** `20px x 20px`

### Q. Comment List Container

**Wrapper:** `flex gap-2`

**List classes:** `flex-1 space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin`

**Key values:**
- `max-h-[360px]` - Taller than canvas view
- `space-y-2` - Gap between rows
- NO `mr-0.5` offset (unlike canvas)

### R. Comment Row

**Container classes:**
```tsx
`flex gap-2 rounded py-0.5 px-0.5 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`
```

**Double-click handler:** starts editing the comment (does NOT close modal)

#### Avatar Column
- Container: `flex flex-col items-center gap-0.5 shrink-0 w-[22px]`
- Avatar: `w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0`
- Time: `text-[9px] text-gray-400 leading-none text-center` (format matches canvas: `Xm`, `Xh`, `Xd`, `Xy`)

#### Comment Body (when not editing)
```tsx
<div
  className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${comment.isStrikethrough ? 'line-through' : ''}`}
  style={{
    color: comment.textColor || comment.color,
    backgroundColor: comment.backgroundColor || undefined,
  }}
  onDoubleClick={(e) => {
    e.stopPropagation();
    handleEditComment(comment.id);
    setCommentColorPopupId(null);
  }}
  dangerouslySetInnerHTML={{ __html: comment.text }}
/>
```

#### Edit Editor (when editing)
```tsx
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
```

**Edit editor base classes (tiptap editor):**
```tsx
className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 overflow-x-hidden"
```

### S. Action Buttons Column

**Container classes:** `flex flex-col gap-1 flex-shrink-0 pt-1`

**NO `-mr-1` offset (unlike canvas)**

#### Edit/Palette Button (Dual Function)

**When NOT editing (shows PenTool):**
```tsx
<button
  onClick={() => {
    if (!activeComment) return;
    handleEditComment(activeComment.id);
    setCommentColorPopupId(null);
  }}
  className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
  title="Edit"
  disabled={!activeComment}
>
  <PenTool className="w-3 h-3" />
</button>
```

**When editing (shows Palette):**
```tsx
<button
  onMouseDown={(event) => {
    event.preventDefault();
    event.stopPropagation();
  }}
  onClick={(event) => {
    event.preventDefault();
    event.stopPropagation();
    setCommentColorPopupId((prev) => (prev === activeComment.id ? null : activeComment.id));
  }}
  className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
  title="Color"
  disabled={!activeComment}
>
  <Palette className="w-3 h-3" />
</button>
```

#### Strikethrough Button
```tsx
<button
  onClick={() => {
    if (!activeComment) return;
    setComments((prev) =>
      prev.map((comment) =>
        comment.id === activeComment.id
          ? { ...comment, isStrikethrough: !comment.isStrikethrough }
          : comment
      )
    );
  }}
  className={`p-1 rounded transition-colors ${activeComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
  title="Strikethrough"
  disabled={!activeComment}
>
  <Strikethrough className="w-3 h-3" />
</button>
```

#### Delete Button
```tsx
<button
  onClick={() => {
    if (!activeComment) return;
    handleRemoveComment(activeComment.id);
    setActiveCommentId((prev) => (prev === activeComment.id ? null : prev));
    setEditingCommentId(null);
    if (editEditor && !editEditor.isDestroyed) {
      editEditor.commands.clearContent();
    }
    setCommentColorPopupId(null);
  }}
  className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
  title="Delete"
  disabled={!activeComment}
>
  <Trash2 className="w-3 h-3" />
</button>
```

### T. Input Section (Add Comment)

**Container classes:** `mt-3 pt-3 border-t border-gray-100`

**Inner wrapper:** `flex items-center gap-2`

#### Left Icon (MessageSquare)
```tsx
<div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-xs">
  <MessageSquare className="w-3.5 h-3.5" />
</div>
```

#### TipTap Editor Wrapper
```tsx
<div
  className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:border-gray-200 focus-within:ring-0"
  onKeyDown={handleKeyDown}
>
  <EditorContent key={`main-${editorKey}`} editor={editor} />
</div>
```

**Key:** No blue focus ring (`focus-within:border-gray-200 focus-within:ring-0`)

#### Send Button
```tsx
<button
  onClick={handleAddComment}
  className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center hover:bg-gray-200 transition-colors"
  title="Send"
>
  <Send className="w-3.5 h-3.5" />
</button>
```

### U. Empty State

When `comments.length === 0`:
```tsx
<p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
```

### V. Keyboard Shortcuts

| Key | Context | Action |
|-----|---------|--------|
| Enter | Input field | Add comment |
| Shift+Enter | Input field | New line |
| Escape | Input field | Save and close |
| Enter | Edit textarea | Save edit |
| Escape | Edit textarea | Cancel edit |
| Double-click | Comment row/text | Start editing comment |

### W. useEffect Hooks

1. **Reset editor key on open/target change**
2. **Reset UI state on open** (comments, colors, popups)
3. **Clear editor content after new instances created**
4. **Clear edit editor when leaving edit mode**
5. **Close color popup when editing ends**
6. **Auto-select last comment when comments change**

---

## 4) Known Offsets (Reference Values)

| Element | Class/Value | Pixels |
|---------|-------------|--------|
| Canvas list scrollbar offset | `mr-0.5` | 2px |
| Canvas action buttons | `-mr-1` | -4px (nudge right) |
| Avatar size (both views) | `w-[22px] h-[22px]` | 22px |
| Time text | `text-[9px]` | 9px |
| Canvas max height | `max-h-[240px]` | 240px |
| Editor max height | `max-h-[360px]` | 360px |
| Button icon size | `w-3 h-3` | 12px |
| Badge square | `w-4 h-4` | 16px |
| Badge button | `w-7 h-7` | 28px |
| Send button | `w-8 h-8` | 32px |

---

## 5) Quick Checklist

### Canvas View
- [ ] Canvas input is editable without opening the editor modal
- [ ] 3 action buttons appear to the right inside the canvas card (Edit/Palette, Strike, Delete)
- [ ] Edit button switches to Palette icon when editing a comment
- [ ] Palette button opens TextStylePopup on left side of card
- [ ] No horizontal scrollbars
- [ ] Scrollbar position is slightly inset (not flush to right edge) - `mr-0.5`
- [ ] Badge color popup aligns with menu button and opens next to badge
- [ ] Comment text is selectable with mouse (`select-text cursor-text`)
- [ ] Double-click on card does NOT open editor (only 3-dot menu does)
- [ ] Double-click on a comment row/text starts inline edit
- [ ] Color changes apply immediately when selected
- [ ] Strikethrough button shows active state (`text-blue-500 bg-blue-50`) when comment is struck
- [ ] Top strip renders at card top when set

### Editing Window
- [ ] Left toolbar (T, H, colors) is visible by default
- [ ] Left toolbar becomes invisible (not unmounted) when comment color popup is open
- [ ] Left toolbar reappears when comment color popup closes
- [ ] Main card stays fixed (no horizontal jump) when toolbar is invisible
- [ ] Comment color popup appears on LEFT side of card (`right-full`)
- [ ] Other popups (card color, emoji, text style, link) appear on RIGHT side (`left-full`)
- [ ] Entry field is simple/small (no `min-h-[32px]`, no `prose prose-sm`)
- [ ] No blue focus ring on entry field (`focus-within:border-gray-200 focus-within:ring-0`)
- [ ] Edit button switches to Palette when editing
- [ ] Double-click on a comment row/text starts inline edit
- [ ] Toolbar includes Title and Collapse buttons (Text Style removed)
- [ ] Toolbar labels: "Card" on first line and "Color" on second; "Reaction" is renamed to "React"
- [ ] Link button is disabled until text selection (shows hint: "Select text to add a link")
- [ ] Clicking outside modal saves and closes
- [ ] Escape key saves and closes
- [ ] Badge color panel shows 6-column grid with 48 colors
- [ ] Card color panel has a Close button in the header

---

## 6) Icon Reference

| Icon | Import | Size | Used For |
|------|--------|------|----------|
| MessageSquare | lucide-react | `w-3.5 h-3.5` | Input left icon |
| Palette | lucide-react | `w-3 h-3` | Color button (when editing) |
| PenTool | lucide-react | `w-3 h-3` | Edit button (when not editing) |
| Send | lucide-react | `w-3.5 h-3.5` | Send button |
| Strikethrough | lucide-react | `w-3 h-3` | Strikethrough button |
| Trash2 | lucide-react | `w-3 h-3` | Delete button |

---

## 7) Color Values

| Purpose | Default Value |
|---------|---------------|
| Card background | `#ffffff` |
| Badge color | `#facc15` (yellow) |
| Avatar background | `bg-blue-500` |
| Active row | `bg-blue-50` |
| Hover row | `hover:bg-gray-50` |
| Button default | `text-gray-300` |
| Button hover (edit/strike) | `hover:text-blue-500` |
| Button hover (delete) | `hover:text-red-500` |
| Strikethrough active | `text-blue-500 bg-blue-50` |
