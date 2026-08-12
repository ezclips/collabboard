"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import DOMPurify from 'dompurify';
import { createPortal } from 'react-dom';
import { Link as LinkIcon, Palette, Send, Strikethrough, Trash2, X } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color } from '@tiptap/extension-color';
import { TextStyle as TipTapTextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import Link from '@tiptap/extension-link';
import TextStylePopup from './TextStylePopup';
import { useAnchoredPopover, rectFromElement, preventPopoverFocusLoss, panelSpanAnchorRect, type AnchorRect } from './useAnchoredPopover';
import { handleSafeCommentLinkClick } from '../commentLinkSafety';
import type { CommentAccessMode } from '@/lib/domain/canvas/comments';

// Same 48-color badge palette every other post's Comments panel (Note,
// Clipart, Todo, Table, Link) uses for its badge-color swatch.
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

const COMMENT_POPUP_EXTENSIONS = [
    StarterKit.configure({
        heading: false,
        codeBlock: false,
        link: false,
    }),
    TipTapTextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    Link.configure({
        openOnClick: false,
        HTMLAttributes: {
            class: 'text-blue-500 underline cursor-pointer',
        },
    }),
];

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

interface ReadOnlySelection {
    commentId: string;
    from: number;
    to: number;
}

interface ReadOnlyCommentContentProps {
    comment: CommentData;
    onEditorReady: (commentId: string, editor: ReturnType<typeof useEditor> | null) => void;
    onSelectionChange: (commentId: string, from: number, to: number) => void;
    onSelectionClear: (commentId: string) => void;
}

function ReadOnlyCommentContent({ comment, onEditorReady, onSelectionChange, onSelectionClear }: ReadOnlyCommentContentProps) {
    const editor = useEditor({
        immediatelyRender: false,
        editable: false,
        extensions: COMMENT_POPUP_EXTENSIONS,
        content: DOMPurify.sanitize(comment.text),
        onSelectionUpdate: ({ editor: updated }) => {
            const { from, to } = updated.state.selection;
            if (from === to) onSelectionClear(comment.id);
            else onSelectionChange(comment.id, from, to);
        },
        editorProps: {
            attributes: {
                class: 'text-xs text-gray-600 whitespace-pre-wrap break-words leading-relaxed text-left [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer select-text cursor-text',
                'data-comment-readonly-editor': comment.id,
            },
        },
    });

    const lastPropText = useRef(comment.text);
    useEffect(() => {
        onEditorReady(comment.id, editor);
        return () => onEditorReady(comment.id, null);
    }, [comment.id, editor, onEditorReady]);

    useEffect(() => {
        if (!editor || editor.isDestroyed || lastPropText.current === comment.text) return;
        const incoming = DOMPurify.sanitize(comment.text);
        if (editor.getHTML() !== incoming) {
            const previousSelection = editor.state.selection;
            editor.commands.setContent(incoming, { emitUpdate: false });
            const maxPosition = editor.state.doc.content.size;
            const from = Math.min(previousSelection.from, maxPosition);
            const to = Math.min(previousSelection.to, maxPosition);
            if (from < to) editor.commands.setTextSelection({ from, to });
        }
        lastPropText.current = comment.text;
    }, [comment.text, editor]);

    if (!editor) return <div data-comment-readonly-editor={comment.id}>{comment.text}</div>;
    return <EditorContent editor={editor} data-comment-readonly-editor={comment.id} />;
}

interface CommentPopupProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    onSubmit: (commentText: string) => void;
    onEdit?: (commentText: string) => void;
    onRemove?: () => void;
    onEditComment?: (commentId: string, commentText: string) => void;
    onRemoveComment?: (commentId: string) => void;
    onRemoveThread?: () => void;
    onColor?: (color: string) => void;
    onTextColor?: (color: string) => void;
    onStrikethrough?: () => void;
    onToggleCommentStrikethrough?: (commentId: string) => void;
    // Per-comment text/highlight color, distinct from onColor/onTextColor
    // above (which color the highlighted *document text span* a
    // text-selection comment thread is anchored to -- see OverlayLayer.tsx).
    // This colors an individual comment's own text, matching CommentPost.tsx
    // and CommentEditor.tsx's onUpdateCommentColor.
    onCommentColor?: (commentId: string, textColor?: string, backgroundColor?: string) => void;
    comments?: CommentData[];
    mode?: 'add' | 'view';
    existingComment?: CommentData;
    highlightColor?: string;
    textColor?: string;
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
    position?: { x: number; y: number } | null;
    hideComposer?: boolean;
    onColorPickerOpenChange?: (open: boolean) => void;
    fullWidth?: boolean;
    embedded?: boolean; // When true, renders inline without portal/positioning
    // The comment-count badge's own background color (the little circle
    // shown on the card, not an individual comment's text color) -- same
    // "Badge Color" swatch + palette every other post type's Comments
    // panel (Note, Clipart, Todo, Table, Link) already has.
    badgeColor?: string;
    onBadgeColorChange?: (color: string) => void;
    commentTitle?: string;
    commentTitleStyle?: { color?: string; backgroundColor?: string };
    onCommentTitleChange?: (title: string) => void;
    onCommentTitleStyleChange?: (style: { color?: string; backgroundColor?: string }) => void;
    // Suppresses the panel's own built-in close button, for callers that
    // render their own close control instead.
    hideCloseButton?: boolean;
    // PATCH 8G is intentionally enabled only by the two Clipart entry points.
    // Other CommentPopup consumers keep their existing read-only behavior until
    // they are explicitly migrated.
    enableCanonicalSelectionStyling?: boolean;
    // PATCH 8O.1 -- explicit access contract. Defaults to 'manage' so every
    // existing consumer that does not yet pass this prop keeps its exact
    // current (fully writable) behavior; only canonical Clipart/Image callers
    // pass a resolved 'read' when the effective caller permission is
    // read-only. Callback PRESENCE (whether onEditComment etc. were passed)
    // is never treated as authorization -- see the isReadOnly guards below.
    accessMode?: CommentAccessMode;
}

export default function CommentPopup({
    isOpen,
    onOpenChange,
    onSubmit,
    onEdit,
    onRemove,
    onEditComment,
    onRemoveComment,
    onRemoveThread,
    onColor,
    onTextColor,
    onStrikethrough,
    onToggleCommentStrikethrough,
    onCommentColor,
    comments = [],
    existingComment,
    highlightColor,
    textColor,
    currentUserId = 'user1',
    currentUserName = 'R',
    position,
    hideComposer = false,
    onColorPickerOpenChange,
    fullWidth = false,
    embedded = false,
    badgeColor,
    onBadgeColorChange,
    commentTitle,
    commentTitleStyle,
    onCommentTitleChange,
    onCommentTitleStyleChange,
    hideCloseButton = false,
    enableCanonicalSelectionStyling = false,
    accessMode = 'manage',
}: CommentPopupProps) {
    // PATCH 8O.1 -- single choke point every internal mutation path and every
    // mutation-affording UI element checks. Kept as a plain derived boolean
    // (not stored in state) so it can never drift from the accessMode prop.
    const isReadOnly = accessMode === 'read';
    const [newCommentText, setNewCommentText] = useState('');
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState('');
    const [colorPickerOpen, setColorPickerOpen] = useState(false);
    const [badgeColorPickerOpen, setBadgeColorPickerOpen] = useState(false);
    const [titleEditing, setTitleEditing] = useState(false);
    const [titleDraft, setTitleDraft] = useState('Comments');
    const [titleStyleOpen, setTitleStyleOpen] = useState(false);
    const [titleStyleTriggerRect, setTitleStyleTriggerRect] = useState<AnchorRect | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [colorPickerCoords, setColorPickerCoords] = useState<{ left: number; top: number } | null>(null);
    const [textareaSelection, setTextareaSelection] = useState<{ start: number; end: number } | null>(null);
    // Per-row color popup (distinct from colorPickerOpen/colorPickerCoords
    // above, which drive the OverlayLayer text-span color picker).
    const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
    // Per-row link popover for the comment currently being edited.
    const [linkPopoverCommentId, setLinkPopoverCommentId] = useState<string | null>(null);
    const [linkUrl, setLinkUrl] = useState('');
    const [readOnlySelection, setReadOnlySelection] = useState<ReadOnlySelection | null>(null);
    const savedLinkSelectionRef = useRef<{ from: number; to: number } | null>(null);
    const readOnlyEditorsRef = useRef(new Map<string, ReturnType<typeof useEditor>>());
    const readOnlySelectionRef = useRef<ReadOnlySelection | null>(null);
    const savedLinkEditorRef = useRef<ReturnType<typeof useEditor>>(null);
    const [colorTriggerRect, setColorTriggerRect] = useState<AnchorRect | null>(null);
    const [linkTriggerRect, setLinkTriggerRect] = useState<AnchorRect | null>(null);
    const colorAnchorRef = useRef<Element | null>(null);
    const linkAnchorRef = useRef<Element | null>(null);
    const titleStyleAnchorRef = useRef<Element | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const panelEdgeAnchorRect = useCallback((anchorRef: React.RefObject<Element | null>) => {
        const panel = panelRef.current?.getBoundingClientRect();
        const action = anchorRef.current?.getBoundingClientRect();
        if (!panel || !action) return null;
        return panelSpanAnchorRect(panel, action);
    }, []);
    const colorPanelAnchorRect = useCallback(() => panelEdgeAnchorRect(colorAnchorRef), [panelEdgeAnchorRect]);
    const linkPanelAnchorRect = useCallback(() => panelEdgeAnchorRect(linkAnchorRef), [panelEdgeAnchorRect]);
    const titleStylePanelAnchorRect = useCallback(() => panelEdgeAnchorRect(titleStyleAnchorRef), [panelEdgeAnchorRect]);
    const { popoverRef: colorPopoverRef, position: colorPosition } = useAnchoredPopover(
        !!commentColorPopupId,
        colorTriggerRect,
        enableCanonicalSelectionStyling ? colorAnchorRef : undefined,
        enableCanonicalSelectionStyling ? colorPanelAnchorRect : undefined
    );
    const { popoverRef: linkPopoverRef, position: linkPosition } = useAnchoredPopover(
        !!linkPopoverCommentId,
        linkTriggerRect,
        enableCanonicalSelectionStyling ? linkAnchorRef : undefined,
        enableCanonicalSelectionStyling ? linkPanelAnchorRect : undefined
    );
    const { popoverRef: titleStylePopoverRef, position: titleStylePosition } = useAnchoredPopover(
        titleStyleOpen,
        titleStyleTriggerRect,
        titleStyleAnchorRef,
        titleStylePanelAnchorRect
    );
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    const setSelection = useCallback((selection: ReadOnlySelection | null) => {
        readOnlySelectionRef.current = selection;
        setReadOnlySelection(selection);
        if (selection) setActiveCommentId(selection.commentId);
    }, []);

    const registerReadOnlyEditor = useCallback((commentId: string, editor: ReturnType<typeof useEditor> | null) => {
        if (editor) readOnlyEditorsRef.current.set(commentId, editor);
        else readOnlyEditorsRef.current.delete(commentId);
    }, []);

    // TipTap editor for editing comments with rich text support
    const editEditor = useEditor({
        immediatelyRender: false,
        extensions: COMMENT_POPUP_EXTENSIONS,
        content: '',
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[24px] text-xs',
            },
        },
    });

    // Notify parent when color picker opens/closes
    useEffect(() => {
        onColorPickerOpenChange?.(colorPickerOpen);
    }, [colorPickerOpen, onColorPickerOpenChange]);

    useEffect(() => {
        if (isOpen) {
            if (!hideComposer && !isReadOnly) {
                setTimeout(() => {
                    // preventScroll: without it, focusing an input that is
                    // partially or fully outside the nearest scrollable
                    // ancestor's visible area makes the browser auto-scroll
                    // that ancestor to reveal it -- for the canvas's own
                    // scroll container, that is a canvas pan the user never
                    // asked for, triggered merely by opening Comments near a
                    // viewport edge (PATCH 8M).
                    inputRef.current?.focus({ preventScroll: true });
                }, 50);
            }
        } else {
            setNewCommentText('');
            setEditingCommentId(null);
            setEditingCommentText('');
            setColorPickerOpen(false);
            setColorPickerCoords(null);
            setBadgeColorPickerOpen(false);
            setTitleEditing(false);
            setTitleStyleOpen(false);
            setTitleStyleTriggerRect(null);
            setCommentColorPopupId(null);
            setLinkPopoverCommentId(null);
            setLinkUrl('');
            savedLinkSelectionRef.current = null;
            savedLinkEditorRef.current = null;
            setSelection(null);
        }
    }, [isOpen, hideComposer, isReadOnly, setSelection]);

    useEffect(() => {
        if (!isOpen || !enableCanonicalSelectionStyling) return;
        const handleSelectionChange = () => {
            const selection = window.getSelection();
            const current = readOnlySelectionRef.current;
            if (!selection || selection.isCollapsed || !current || !panelRef.current) {
                if (current && (!selection || selection.isCollapsed)) setSelection(null);
                return;
            }
            const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
            const focus = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
            const anchorEditor = anchor?.closest('[data-comment-readonly-editor]');
            const focusEditor = focus?.closest('[data-comment-readonly-editor]');
            if (!anchorEditor || anchorEditor !== focusEditor || anchorEditor.getAttribute('data-comment-readonly-editor') !== current.commentId) {
                setSelection(null);
            }
        };
        document.addEventListener('selectionchange', handleSelectionChange);
        return () => document.removeEventListener('selectionchange', handleSelectionChange);
    }, [isOpen, enableCanonicalSelectionStyling, setSelection]);

    useEffect(() => {
        if (!enableCanonicalSelectionStyling) return;
        if (editingCommentId) return;
        if (!readOnlySelection || readOnlySelection.commentId !== commentColorPopupId) {
            setCommentColorPopupId(null);
            setColorTriggerRect(null);
            colorAnchorRef.current = null;
        }
    }, [enableCanonicalSelectionStyling, editingCommentId, readOnlySelection, commentColorPopupId]);

    // Update edit editor content when editing a comment
    useEffect(() => {
        if (editingCommentId && editingCommentText && editEditor && !editEditor.isDestroyed) {
            editEditor.commands.setContent(editingCommentText);
            setTimeout(() => {
                editEditor.commands.focus('end');
            }, 50);
        }
    }, [editingCommentId, editingCommentText, editEditor]);

    const preventFocusLoss = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const getTimeAgo = (timestamp: number) => {
        const now = Date.now();
        const diff = now - timestamp;
        const seconds = Math.floor(diff / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (seconds < 60) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();

    const effectiveComments = comments.length > 0 ? comments : (existingComment ? [existingComment] : []);
    const resolvedHighlightColor = highlightColor || existingComment?.color;
    const resolvedCommentTitle = commentTitle?.trim() || 'Comments';
    const startTitleEditing = () => {
        if (isReadOnly) return;
        setTitleDraft(resolvedCommentTitle);
        setTitleEditing(true);
    };
    const commitTitle = () => {
        if (isReadOnly) return;
        const nextTitle = titleDraft.trim() || 'Comments';
        onCommentTitleChange?.(nextTitle);
        setTitleDraft(nextTitle);
        setTitleEditing(false);
    };
    const cancelTitle = () => {
        setTitleDraft(resolvedCommentTitle);
        setTitleEditing(false);
    };
    const handleSubmit = () => {
        if (isReadOnly) return;
        const trimmed = newCommentText.trim();
        if (!trimmed) return;
        onSubmit(trimmed);
        setNewCommentText('');
        inputRef.current?.focus();
    };

    const handleEditCommit = () => {
        if (isReadOnly) return;
        if (!editingCommentId || !editEditor || editEditor.isDestroyed) {
            return;
        }
        
        const htmlContent = editEditor.getHTML();
        const textContent = editEditor.getText().trim();
        
        if (!textContent) {
            return;
        }
        
        if (onEditComment) {
            onEditComment(editingCommentId, htmlContent);
        } else if (onEdit) {
            onEdit(htmlContent);
        }
        
        setEditingCommentId(null);
        setEditingCommentText('');
        editEditor.commands.clearContent();
    };

    useEffect(() => {
        if (!isOpen) return;
        if (effectiveComments.length === 0) {
            setActiveCommentId(null);
            return;
        }
        if (!activeCommentId || !effectiveComments.some((comment) => comment.id === activeCommentId)) {
            setActiveCommentId(effectiveComments[effectiveComments.length - 1]?.id || null);
        }
    }, [isOpen, effectiveComments, activeCommentId]);

    const handleTextColor = useCallback((color: string) => {
        if (!editEditor || editEditor.isDestroyed) {
            return;
        }
        editEditor.chain().focus().setColor(color).run();
    }, [editEditor]);

    const handleHighlightColor = useCallback((color: string) => {
        if (!editEditor || editEditor.isDestroyed) {
            return;
        }
        if (color === 'transparent') {
            editEditor.chain().focus().unsetHighlight().run();
        } else {
            editEditor.chain().focus().setHighlight({ color }).run();
        }
    }, [editEditor]);

    const applySelectedStyle = useCallback((type: 'color' | 'highlight', color: string) => {
        if (isReadOnly) return;
        const selection = readOnlySelectionRef.current;
        if (!selection) return;
        const editor = readOnlyEditorsRef.current.get(selection.commentId);
        if (!editor || editor.isDestroyed) return;
        const chain = editor.chain().setTextSelection({ from: selection.from, to: selection.to });
        if (type === 'color') chain.setColor(color).run();
        else if (color === 'transparent') chain.unsetHighlight().run();
        else chain.setHighlight({ color }).run();
        onEditComment?.(selection.commentId, editor.getHTML());
        // Keep the same comment/range active while the parent round-trips the
        // new HTML. This permits repeated foreground/highlight changes without
        // forcing the user to reselect the text.
        setSelection(selection);
    }, [isReadOnly, onEditComment, setSelection]);

    const applySelectedStrikethrough = useCallback(() => {
        if (isReadOnly) return;
        const selection = readOnlySelectionRef.current;
        if (!selection) return;
        const editor = readOnlyEditorsRef.current.get(selection.commentId);
        if (!editor || editor.isDestroyed) return;
        editor.chain().setTextSelection({ from: selection.from, to: selection.to }).toggleStrike().run();
        onEditComment?.(selection.commentId, editor.getHTML());
        setSelection(selection);
    }, [isReadOnly, onEditComment, setSelection]);

    // Re-focuses the comment editor after closing the color/link popover
    // without applying anything, so a later genuine click-away still fires
    // the blur that commits the edit (the popovers live outside the row's
    // blur-watched wrapper, so once focus leaves it it doesn't come back on
    // its own).
    const refocusCommentEditor = useCallback(() => {
        if (!editEditor || editEditor.isDestroyed) return;
        editEditor.commands.focus('end');
    }, [editEditor]);

    const openLinkPopover = useCallback((commentId: string) => {
        if (isReadOnly) return;
        const readOnlySelection = readOnlySelectionRef.current;
        const editor = readOnlySelection?.commentId === commentId
            ? readOnlyEditorsRef.current.get(commentId)
            : editEditor;
        if (!editor || editor.isDestroyed) return;
        const { from, to } = readOnlySelection?.commentId === commentId
            ? readOnlySelection
            : editor.state.selection;
        savedLinkSelectionRef.current = { from, to };
        savedLinkEditorRef.current = editor;
        setLinkUrl(editor.getAttributes('link').href || '');
        setCommentColorPopupId(null);
        setLinkPopoverCommentId(commentId);
    }, [isReadOnly, editEditor]);

    const handleApplyLink = useCallback(() => {
        if (isReadOnly) return;
        if (!linkPopoverCommentId) return;
        const selectedReadOnly = readOnlySelectionRef.current?.commentId === linkPopoverCommentId
            ? readOnlyEditorsRef.current.get(linkPopoverCommentId)
            : null;

        const editor = savedLinkEditorRef.current || selectedReadOnly || editEditor;
        if (!editor || editor.isDestroyed) return;
        const saved = savedLinkSelectionRef.current;
        const trimmed = linkUrl.trim();

        if (trimmed === '') {
            const chain = editor.chain().focus();
            if (saved) chain.setTextSelection(saved);
            chain.unsetLink().run();
        } else {
            const finalUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
            if (saved && saved.from !== saved.to) {
                // Text was selected -- link exactly that range.
                editor.chain().focus().setTextSelection(saved).setLink({ href: finalUrl }).run();
            } else {
                // Nothing selected: setLink() would mark an empty range and
                // silently produce no anchor at all. Insert the URL as linked
                // text at the cursor instead (what Docs/Notion/Slack do), then
                // clear the stored mark so typing afterwards isn't linked too.
                const chain = editor.chain().focus();
                if (saved) chain.setTextSelection(saved.from);
                chain
                    .insertContent({
                        type: 'text',
                        text: trimmed,
                        marks: [{ type: 'link', attrs: { href: finalUrl } }],
                    })
                    .unsetMark('link')
                    .run();
            }
        }

        // Persist immediately rather than waiting for a later blur -- Escape,
        // Delete, or the panel closing would otherwise discard the link
        // silently. A later real blur still calls handleEditCommit with the
        // same (or further-edited) HTML, which is a harmless no-op re-save.
        const htmlContent = editor.getHTML();
        if (onEditComment) {
            onEditComment(linkPopoverCommentId, htmlContent);
        } else if (onEdit) {
            onEdit(htmlContent);
        }
        setLinkPopoverCommentId(null);
        setLinkUrl('');
        savedLinkSelectionRef.current = null;
        savedLinkEditorRef.current = null;
    }, [isReadOnly, editEditor, linkUrl, linkPopoverCommentId, onEditComment, onEdit]);

    if (!isOpen) return null;

    // Only render the internal color picker portal if the parent is NOT handling it
    // When onColorPickerOpenChange is provided, the parent renders the color picker externally
    const colorPickerPortal =
        colorPickerOpen &&
        colorPickerCoords &&
        (onColor || onTextColor) &&
        !onColorPickerOpenChange  // Don't render internal portal if parent handles it
            ? createPortal(
                <div
                    className="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                    style={{ left: `${colorPickerCoords.left}px`, top: `${colorPickerCoords.top}px` }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                    }}
                >
                    <TextStylePopup
                        isOpen={true}
                        onOpenChange={(open) => {
                            if (!open) setColorPickerOpen(false);
                        }}
                        onSelectHeading={() => {}}
                        hideHeadingSelect={true}
                        onSelectColor={(color) => {
                            handleTextColor(color);
                            onTextColor?.(color);
                        }}
                        onSelectHighlight={(color) => {
                            handleHighlightColor(color);
                            onColor?.(color);
                        }}
                        currentHeading="normal"
                        currentColor={textColor}
                        currentHighlight={resolvedHighlightColor}
                    />
                </div>,
                document.body
            )
            : null;

    const titleStylePortal = !isReadOnly && titleStyleOpen && onCommentTitleStyleChange
        ? createPortal(
            <div
                ref={titleStylePopoverRef}
                data-comment-title-style-popover="true"
                className="fixed z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                style={{
                    left: titleStylePosition?.left ?? -9999,
                    top: titleStylePosition?.top ?? -9999,
                    opacity: titleStylePosition ? 1 : 0,
                    pointerEvents: titleStylePosition ? 'auto' : 'none',
                }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={preventPopoverFocusLoss}
            >
                <TextStylePopup
                    isOpen={true}
                    onOpenChange={(open) => {
                        if (!open) {
                            setTitleStyleOpen(false);
                            setTitleStyleTriggerRect(null);
                        }
                    }}
                    onSelectHeading={() => {}}
                    hideHeadingSelect={true}
                    onSelectColor={(color) => onCommentTitleStyleChange({ ...(commentTitleStyle || {}), color })}
                    onSelectHighlight={(color) => {
                        const nextStyle = { ...(commentTitleStyle || {}) };
                        if (color === 'transparent') delete nextStyle.backgroundColor;
                        else nextStyle.backgroundColor = color;
                        onCommentTitleStyleChange(nextStyle);
                    }}
                    currentHeading="normal"
                    currentColor={commentTitleStyle?.color}
                    currentHighlight={commentTitleStyle?.backgroundColor}
                />
            </div>,
            document.body
        )
        : null;

    // Height discipline (PATCH 8L-A), canonical Clipart entry points only.
    //
    // The panel's preferred size is unchanged: the comment list keeps its
    // max-h-[400px], so with room to spare the panel renders at exactly the
    // dimensions it always has. This only adds a CEILING for the case where
    // the viewport cannot accommodate that preferred size.
    //
    // Deliberately NOT flex-1 on the list. A previous attempt (e782852,
    // reverted in c7113b0) made the list `flex-1`, which GROWS to fill the
    // container -- that is what produced the rejected near-full-height panel.
    // Shrink-only is the whole point: bounded above by 400px as today, allowed
    // to shrink below it when the viewport is short, never allowed to exceed
    // it just because space happens to be available.
    const boundedHeight = enableCanonicalSelectionStyling && !embedded;

    const panel = (
        <div
            ref={panelRef}
            data-comment-panel="true"
            className={`relative border border-gray-200 p-4 rounded-lg ${
                embedded
                    ? 'shadow-none border-0 p-0 w-full max-w-none'
                    : fullWidth
                        ? 'shadow-2xl min-w-[280px] w-full max-w-none overflow-visible'
                        : 'shadow-2xl min-w-[280px] max-w-[360px] overflow-visible'
            }${boundedHeight ? ' flex flex-col' : ''}`}
            style={{
                backgroundColor: '#fff',
                width: '100%',
                // 16px = the 8px viewport margin useAnchoredPopover already
                // uses, top and bottom, so a clamped panel and its nested
                // popovers agree on what "inside the viewport" means.
                ...(boundedHeight ? { maxHeight: 'calc(100vh - 16px)' } : {}),
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={enableCanonicalSelectionStyling ? (e) => e.stopPropagation() : undefined}
            onClick={enableCanonicalSelectionStyling ? (e) => e.stopPropagation() : undefined}
            onDoubleClick={enableCanonicalSelectionStyling ? (e) => e.stopPropagation() : undefined}
            onWheel={enableCanonicalSelectionStyling ? (e) => e.stopPropagation() : undefined}
        >
            {!embedded && !hideCloseButton && (
                <button
                    onClick={() => onOpenChange(false)}
                    className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                    title="Close"
                >
                    <X className="h-3.5 w-3.5" />
                </button>
            )}
            <div className={`flex items-center justify-between mb-3 pb-2 border-b border-gray-100${boundedHeight ? ' flex-shrink-0' : ''}`}>
                <div className="flex min-w-0 items-center gap-1">
                    {!isReadOnly && titleEditing ? (
                        <input
                            autoFocus
                            data-comment-panel-title="true"
                            aria-label="Comment panel title"
                            type="text"
                            value={titleDraft}
                            onChange={(e) => setTitleDraft(e.target.value)}
                            onBlur={commitTitle}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitTitle();
                                } else if (e.key === 'Escape') {
                                    e.preventDefault();
                                    cancelTitle();
                                }
                            }}
                            className="min-w-0 w-full text-sm font-semibold text-gray-700 bg-transparent outline-none border-b border-blue-400 rounded px-1 -mx-1"
                            style={{ color: commentTitleStyle?.color || '#374151', backgroundColor: commentTitleStyle?.backgroundColor }}
                        />
                    ) : (
                        <h4
                            data-comment-panel-title="true"
                            className="text-sm font-semibold rounded px-1 -mx-1 cursor-text"
                            style={{ color: commentTitleStyle?.color || '#374151', backgroundColor: commentTitleStyle?.backgroundColor }}
                            onClick={!isReadOnly && onCommentTitleChange ? startTitleEditing : undefined}
                        >
                            {resolvedCommentTitle}
                        </h4>
                    )}
                    {!isReadOnly && titleEditing && onCommentTitleStyleChange && (
                        <button
                            ref={titleStyleAnchorRef as React.RefObject<HTMLButtonElement>}
                            type="button"
                            aria-label="Style comment title"
                            title="Title color and highlight"
                            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                            onClick={() => {
                                setTitleStyleTriggerRect(rectFromElement(titleStyleAnchorRef.current!));
                                setTitleStyleOpen((open) => !open);
                            }}
                            className="shrink-0 p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-gray-100"
                        >
                            <Palette className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {!isReadOnly && onBadgeColorChange && (
                        <button
                            onClick={() => setBadgeColorPickerOpen((open) => !open)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                            title="Badge Color"
                        >
                            <div
                                className="w-4 h-4 rounded border border-gray-300"
                                style={{ backgroundColor: badgeColor || '#facc15' }}
                            />
                        </button>
                    )}
                </div>
            </div>

            {!isReadOnly && badgeColorPickerOpen && onBadgeColorChange && (
                <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                    <div className="grid grid-cols-6 gap-1.5">
                        {BADGE_COLORS.map((color) => (
                            <button
                                key={color}
                                onClick={() => {
                                    onBadgeColorChange(color);
                                    setBadgeColorPickerOpen(false);
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

            {colorPickerPortal}
            {titleStylePortal}

            {/* Per-comment color and link popups -- portaled to document.body
                with viewport-measured fixed coordinates (useAnchoredPopover)
                so they can never be clipped by the comment list's own
                overflow or a transformed canvas ancestor, and flip side near
                a viewport edge instead of rendering off-screen. */}
            {!isReadOnly && commentColorPopupId && onCommentColor && (() => {
                const target = effectiveComments.find((comment) => comment.id === commentColorPopupId);
                if (!target) return null;
                return createPortal(
                    <div
                        ref={colorPopoverRef}
                        className="fixed z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                        style={{
                            left: colorPosition?.left ?? -9999,
                            top: colorPosition?.top ?? -9999,
                            // opacity, not visibility: a visibility:hidden
                            // subtree is not focusable, which would break
                            // click-to-focus on the hex input inside.
                            opacity: colorPosition ? 1 : 0,
                            pointerEvents: colorPosition ? 'auto' : 'none',
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={preventPopoverFocusLoss}
                    >
                        <TextStylePopup
                            isOpen={true}
                            onOpenChange={(open) => {
                                if (!open) {
                                    setCommentColorPopupId(null);
                                    refocusCommentEditor();
                                }
                            }}
                            onSelectHeading={() => {}}
                            hideHeadingSelect={true}
                            onSelectColor={(color) => {
                                if (isReadOnly) return;
                                if (!editingCommentId && readOnlySelectionRef.current?.commentId === target.id) applySelectedStyle('color', color);
                                else onCommentColor(target.id, color, target.backgroundColor);
                            }}
                            onSelectHighlight={(color) => {
                                if (isReadOnly) return;
                                if (!editingCommentId && readOnlySelectionRef.current?.commentId === target.id) applySelectedStyle('highlight', color);
                                else onCommentColor(target.id, target.textColor, color === 'transparent' ? undefined : color);
                            }}
                            currentHeading="normal"
                            currentColor={target.textColor || target.color}
                            currentHighlight={target.backgroundColor}
                        />
                    </div>,
                    document.body
                );
            })()}

            {!isReadOnly && linkPopoverCommentId && createPortal(
                <div
                    ref={linkPopoverRef}
                    className="fixed z-[1200] bg-white rounded-lg shadow-lg p-3 border border-gray-200"
                    style={{
                        left: linkPosition?.left ?? -9999,
                        top: linkPosition?.top ?? -9999,
                        // opacity, not visibility: autoFocus below cannot
                        // focus a visibility:hidden input, which left the URL
                        // field unfocusable AND (with the old blanket
                        // preventDefault) unclickable -- i.e. untypable.
                        opacity: linkPosition ? 1 : 0,
                        pointerEvents: linkPosition ? 'auto' : 'none',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={preventPopoverFocusLoss}
                >
                    <div className="flex items-center gap-2">
                        <input
                            type="url"
                            value={linkUrl}
                            onChange={(e) => setLinkUrl(e.target.value)}
                            placeholder="google.com"
                            className="px-3 py-1.5 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 text-xs w-56"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleApplyLink();
                                if (e.key === 'Escape') {
                                    setLinkPopoverCommentId(null);
                                    refocusCommentEditor();
                                }
                            }}
                        />
                        <button
                            onClick={handleApplyLink}
                            className="px-3 py-1.5 text-gray-600 hover:text-gray-900 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                        >
                            Add
                        </button>
                    </div>
                </div>,
                document.body
            )}

            {effectiveComments.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
            ) : (
                <div
                    ref={scrollContainerRef}
                    className={`w-full space-y-3 overflow-y-auto pr-1 scrollbar-ultrathin ${
                        embedded ? 'max-h-[240px]' : 'max-h-[400px]'
                    }${boundedHeight ? ' min-h-0' : ''}`}
                    style={{ scrollbarGutter: 'stable' }}
                >
                    {effectiveComments.map((comment) => {
                        // PATCH 8O.1: forcing these false in read mode -- rather than
                        // only gating their entry points -- means the entire
                        // isEditing/hasReadOnlySelection-driven action-rail and
                        // edit-mode body below are structurally unreachable for a
                        // reader regardless of what editingCommentId/readOnlySelection
                        // state happens to hold.
                        const isEditing = !isReadOnly && editingCommentId === comment.id;
                        const isActive = activeCommentId === comment.id;
                        const isColorOpen = !isReadOnly && commentColorPopupId === comment.id;
                        const isLinkOpen = !isReadOnly && linkPopoverCommentId === comment.id;
                        const hasReadOnlySelection = !isReadOnly && enableCanonicalSelectionStyling && (
                            readOnlySelection?.commentId === comment.id ||
                            (isLinkOpen && savedLinkEditorRef.current !== null)
                        );
                        return (
                            <div
                                key={comment.id}
                                className={`group/row relative flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setActiveCommentId(comment.id)}
                                onDoubleClick={() => {
                                    if (isReadOnly) return;
                                    if (comment.userId !== currentUserId) return;
                                    setEditingCommentId(comment.id);
                                    setEditingCommentText(comment.text);
                                }}
                            >
                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {comment.userAvatar ? (
                                        <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full" />
                                    ) : (
                                        getInitial(comment.userName)
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium text-gray-700">{comment.userName}</span>
                                        <span className="text-[10px] text-gray-400">{getTimeAgo(comment.timestamp)}</span>
                                    </div>
                                    {isEditing ? (
                                        <div className="mt-1 w-full">
                                            <div
                                                className="relative"
                                                style={{
                                                    color: comment.textColor || comment.color || undefined,
                                                    backgroundColor: comment.backgroundColor || undefined,
                                                }}
                                                onMouseDown={(e) => {
                                                    // Allow text selection in editor
                                                    e.stopPropagation();
                                                }}
                                                onBlur={(e) => {
                                                    // The color/link popovers render outside this wrapper
                                                    // (so they aren't clipped by the scroll list) and
                                                    // auto-focus their own input on open -- that's a
                                                    // genuine blur of the editor, but not the user
                                                    // clicking away, so don't commit/exit-edit for it.
                                                    if (isColorOpen || isLinkOpen) return;
                                                    // Save when clicking outside editor
                                                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                                                        handleEditCommit();
                                                    }
                                                }}
                                            >
                                                <EditorContent
                                                    editor={editEditor}
                                                    className="bg-gray-50 rounded px-2 py-1 border border-gray-200 focus-within:border-blue-400 min-h-[24px] max-h-[120px] overflow-auto"
                                                    onKeyDown={(e: React.KeyboardEvent) => {
                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                            e.preventDefault();
                                                            handleEditCommit();
                                                        }
                                                        if (e.key === 'Escape') {
                                                            setEditingCommentId(null);
                                                            setEditingCommentText('');
                                                            if (editEditor && !editEditor.isDestroyed) {
                                                                editEditor.commands.clearContent();
                                                            }
                                                        }
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer ${comment.isStrikethrough ? 'line-through' : ''}`}
                                            style={{
                                                color: comment.textColor || comment.color,
                                                backgroundColor: comment.backgroundColor || undefined,
                                            }}
                                            onClick={(e) => {
                                                if (handleSafeCommentLinkClick(e)) return;
                                            }}
                                        >
                                            {enableCanonicalSelectionStyling ? (
                                                <ReadOnlyCommentContent
                                                    comment={comment}
                                                    onEditorReady={registerReadOnlyEditor}
                                                    onSelectionChange={(commentId, from, to) => setSelection({ commentId, from, to })}
                                                    onSelectionClear={(commentId) => {
                                                        if (readOnlySelectionRef.current?.commentId === commentId) setSelection(null);
                                                    }}
                                                />
                                            ) : (
                                                <span dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }} />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Actions Column - per comment, fixed width, always reserves space */}
                                <div className="flex flex-col gap-0.5 w-5 shrink-0">
                                    {!isReadOnly && (
                                    <div className={`flex flex-col gap-0.5 ${isActive ? 'visible' : 'invisible group-hover/row:visible'}`}>
                                        {isEditing ? (
                                            <>
                                                {onCommentColor && (
                                                    <button
                                                        onMouseDown={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                        }}
                                                        onClick={(event) => {
                                                            event.preventDefault();
                                                            event.stopPropagation();
                                                            setLinkPopoverCommentId(null);
                                                            if (isColorOpen) {
                                                                setCommentColorPopupId(null);
                                                                refocusCommentEditor();
                                                            } else {
                                                                colorAnchorRef.current = event.currentTarget;
                                                                setColorTriggerRect(rectFromElement(event.currentTarget));
                                                                setCommentColorPopupId(comment.id);
                                                            }
                                                        }}
                                                        className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                        title="Color"
                                                    >
                                                        <Palette className="w-3 h-3" />
                                                    </button>
                                                )}
                                                <button
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        if (isLinkOpen) {
                                                            setLinkPopoverCommentId(null);
                                                            refocusCommentEditor();
                                                        } else {
                                                            linkAnchorRef.current = event.currentTarget;
                                                            setLinkTriggerRect(rectFromElement(event.currentTarget));
                                                            openLinkPopover(comment.id);
                                                        }
                                                    }}
                                                    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                    title="Link"
                                                >
                                                    <LinkIcon className="w-3 h-3" />
                                                </button>
                                            </>
                                        ) : hasReadOnlySelection ? (
                                            <>
                                                <button
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        setLinkPopoverCommentId(null);
                                                        if (isColorOpen) setCommentColorPopupId(null);
                                                        else {
                                                            colorAnchorRef.current = event.currentTarget;
                                                            setColorTriggerRect(rectFromElement(event.currentTarget));
                                                            setCommentColorPopupId(comment.id);
                                                        }
                                                    }}
                                                    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                    title="Color / Text Style"
                                                >
                                                    <Palette className="w-3 h-3" />
                                                </button>
                                                <button
                                                    onMouseDown={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                    }}
                                                    onClick={(event) => {
                                                        event.preventDefault();
                                                        event.stopPropagation();
                                                        if (isLinkOpen) {
                                                            setLinkPopoverCommentId(null);
                                                            refocusCommentEditor();
                                                        } else {
                                                            linkAnchorRef.current = event.currentTarget;
                                                            setLinkTriggerRect(rectFromElement(event.currentTarget));
                                                            openLinkPopover(comment.id);
                                                        }
                                                    }}
                                                    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                    title="Link"
                                                >
                                                    <LinkIcon className="w-3 h-3" />
                                                </button>
                                            </>
                                        ) : (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (isReadOnly) return;
                                                    setEditingCommentId(comment.id);
                                                    setEditingCommentText(comment.text);
                                                }}
                                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                title="Edit"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"></path>
                                                    <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"></path>
                                                    <path d="m2.3 2.3 7.286 7.286"></path>
                                                    <circle cx="11" cy="11" r="2"></circle>
                                                </svg>
                                            </button>
                                        )}
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isReadOnly) return;
                                                if (hasReadOnlySelection) {
                                                    applySelectedStrikethrough();
                                                } else if (onToggleCommentStrikethrough) {
                                                    onToggleCommentStrikethrough(comment.id);
                                                } else {
                                                    onStrikethrough?.();
                                                }
                                            }}
                                            className={`p-1 rounded transition-colors ${comment.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'}`}
                                            title="Strikethrough"
                                        >
                                            <Strikethrough className="w-3 h-3" />
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isReadOnly) return;
                                                if (onRemoveComment) {
                                                    onRemoveComment(comment.id);
                                                } else if (onRemove) {
                                                    onRemove();
                                                }
                                                if (activeCommentId === comment.id) setActiveCommentId(null);
                                                if (editingCommentId === comment.id) {
                                                    setEditingCommentId(null);
                                                    setEditingCommentText('');
                                                }
                                                if (commentColorPopupId === comment.id) setCommentColorPopupId(null);
                                                if (linkPopoverCommentId === comment.id) setLinkPopoverCommentId(null);
                                            }}
                                            className="p-1 text-gray-300 hover:text-red-500 transition-colors"
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3 h-3" />
                                        </button>
                                    </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Add comment input at bottom */}
            {!hideComposer && !isReadOnly && (
                <div className={`mt-3 pt-3 border-t border-gray-100 flex items-center gap-2${boundedHeight ? ' flex-shrink-0' : ''}`}>
                    <input
                        ref={inputRef}
                        type="text"
                        value={newCommentText}
                        onChange={(e) => setNewCommentText(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        className="min-w-0 flex-1 text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                        placeholder="Add a comment..."
                    />
                    <button
                        type="button"
                        aria-label="Send"
                        title="Send"
                        onClick={handleSubmit}
                        className="shrink-0 w-8 h-8 inline-flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors"
                    >
                        <Send className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );

    // Embedded mode: render inline without wrappers (for canvas display)
    if (embedded) {
        return panel;
    }

    if (position) {
        return (
            <div
                className="fixed z-[3000] flex items-start gap-2"
                style={{ left: position.x, top: position.y }}
                onMouseDown={(e) => e.stopPropagation()}
            >
                {panel}
            </div>
        );
    }

    // When no position prop, just render the panel directly
    // Parent component handles positioning
    return (
        <div onMouseDown={(e) => e.stopPropagation()}>
            {panel}
        </div>
    );
}
