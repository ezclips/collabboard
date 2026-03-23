"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { Highlight } from '@tiptap/extension-highlight';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Send, Smile, X, MessageCircle } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';

import CommentEditorToolbar, { ToolbarMode } from './CommentEditorToolbar';
import NoteColorPopup from './NoteColorPopup';
import TextStylePopup from './TextStylePopup';

interface CommentData {
    id: string;
    text: string; // This will now store HTML content
    userId: string;
    userName: string;
    userAvatar?: string;
    timestamp: number;
    color?: string;
}

interface CommentEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        comments: CommentData[];
        cardColor?: string;
        isCollapsed?: boolean;
    }) => void;
    initialComments?: CommentData[];
    initialCardColor?: string;
    currentUserId?: string;
    currentUserName?: string;
    currentUserAvatar?: string;
}

export default function CommentEditor({
    isOpen,
    onClose,
    onSave,
    initialComments = [],
    initialCardColor = '#ffffff',
    currentUserId = 'user1',
    currentUserName = 'R',
    currentUserAvatar,
}: CommentEditorProps) {
    const [comments, setComments] = useState<CommentData[]>(initialComments);
    const [cardColor, setCardColor] = useState(initialCardColor);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [cardColorOpen, setCardColorOpen] = useState(false);
    const [textStyleOpen, setTextStyleOpen] = useState(false);
    const [currentTextColor, setCurrentTextColor] = useState('#1f2937');
    const [currentHighlight, setCurrentHighlight] = useState('transparent');
    const [linkInputOpen, setLinkInputOpen] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');
    const [toolbarMode, setToolbarMode] = useState<ToolbarMode>('text');
    const [emojiOpen, setEmojiOpen] = useState(false);
    const [topStrip, setTopStrip] = useState<string | null>(null);
    const [cardTextColor, setCardTextColor] = useState('#1F2937');
    const modalRef = useRef<HTMLDivElement>(null);
    const [editorKey, setEditorKey] = useState(0);

    // Common extensions configuration
    const extensions = [
        StarterKit,
        Link.configure({
            openOnClick: false,
            HTMLAttributes: {
                class: 'text-blue-500 underline cursor-pointer',
            },
        }),
        Underline,
        TextStyle,
        Color,
        Highlight.configure({
            multicolor: true,
        }),
    ];

    // TipTap editor for new comments
    const editor = useEditor({
        immediatelyRender: false,
        extensions,
        content: '',
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[40px] p-2',
            },
        },
    }, [editorKey]); // Only depend on editorKey for recreation

    // TipTap editor for editing existing comments
    const editEditor = useEditor({
        immediatelyRender: false,
        extensions,
        content: '',
        editorProps: {
            attributes: {
                class: 'prose prose-sm max-w-none focus:outline-none min-h-[40px] p-2 bg-gray-50 rounded border border-gray-200',
            },
        },
    }, [editorKey]); // Only depend on editorKey for recreation

    // Reset editor key when opening to force fresh editor instances
    useEffect(() => {
        if (isOpen) {
            // Increment key FIRST to create fresh editor instances
            setEditorKey(prev => prev + 1);
        }
    }, [isOpen]);

    // Reset UI state when opening (separate effect to avoid circular deps)
    useEffect(() => {
        if (isOpen) {
            // Reset UI state
            setComments(initialComments);
            setCardColor(initialCardColor);
            setEditingCommentId(null);
            setTextStyleOpen(false);
            setCardColorOpen(false);
            setLinkInputOpen(false);
            setEmojiOpen(false);
        }
    }, [isOpen, initialComments, initialCardColor]);

    // Clear editor content after new editor is created
    useEffect(() => {
        if (!isOpen) return;
        
        // Small delay to ensure new editor instance is ready
        const timer = setTimeout(() => {
            if (editor && !editor.isDestroyed) {
                editor.commands.setContent('');
                editor.commands.focus('end');
            }
            if (editEditor && !editEditor.isDestroyed) {
                editEditor.commands.setContent('');
            }
        }, 50);
        
        return () => clearTimeout(timer);
    }, [editorKey, isOpen]); // Runs after editorKey changes

    // Cleanup on close
    useEffect(() => {
        if (isOpen) return;
        setEditingCommentId(null);
    }, [isOpen]);

    // Optional debug: Log content after reset (comment out after testing)
    // useEffect(() => {
    //   if (editor) console.log('Main editor content after reset:', editor.getHTML());
    //   if (editEditor) console.log('Edit editor content after reset:', editEditor.getHTML());
    // }, [editorKey, editor, editEditor]);

    // Additional safety check for lingering content


    const handleSave = () => {
        onSave({ comments, cardColor });
        onClose();
    };

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

        setComments([...comments, newComment]);
        editor.commands.clearContent();
        editor.commands.focus();
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleAddComment();
        } else if (e.key === 'Escape') {
            handleSave();
        }
    };

    const handleEditComment = (commentId: string) => {
        const comment = comments.find(c => c.id === commentId);
        if (comment && editEditor) {
            setEditingCommentId(commentId);
            editEditor.commands.setContent(comment.text);
            setTimeout(() => editEditor.commands.focus(), 10);
        }
    };

    const handleSaveEdit = () => {
        if (!editingCommentId || !editEditor) return;
        const htmlContent = editEditor.getHTML();
        const textContent = editEditor.getText().trim();

        if (!textContent) return;

        setComments(comments.map(c =>
            c.id === editingCommentId
                ? { ...c, text: htmlContent }
                : c
        ));
        setEditingCommentId(null);
        editEditor.commands.clearContent();
    };

    const handleRemoveComment = (commentId: string) => {
        setComments(comments.filter(c => c.id !== commentId));
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
        if (days < 7) return `${days}d ago`;
        return new Date(timestamp).toLocaleDateString();
    };

    const getInitial = (name: string) => {
        return name.charAt(0).toUpperCase();
    };

    const handleCollapse = () => {
        onSave({ comments, cardColor, isCollapsed: true });
        onClose();
    };

    // Toolbar handlers
    const handleBold = () => editor?.chain().focus().toggleBold().run();
    const handleItalic = () => editor?.chain().focus().toggleItalic().run();
    const handleStrike = () => editor?.chain().focus().toggleStrike().run();
    const handleUnderline = () => editor?.chain().focus().toggleUnderline().run();

    const handleLink = () => {
        if (!editor) return;
        setTextStyleOpen(false);
        setCardColorOpen(false);  // Close card color popup
        setEmojiOpen(false); // Close emoji picker
        const previousUrl = editor.getAttributes('link').href || '';
        setLinkUrl(previousUrl);
        setLinkInputOpen(true);
    };

    const handleEmojiClick = (emojiData: { emoji: string }) => {
        if (!editor) return;
        editor.chain().focus().insertContent(emojiData.emoji).run();
        setEmojiOpen(false);
    };

    const handleTextColor = (color: string) => {
        if (!editor) return;
        editor.chain().focus().setColor(color).run();
        setCurrentTextColor(color);
    };

    const handleHighlight = (color: string) => {
        if (!editor) return;
        if (color === 'transparent') {
            editor.chain().focus().unsetHighlight().run();
        } else {
            editor.chain().focus().setHighlight({ color }).run();
        }
        setCurrentHighlight(color);
    };

    const handleApplyLink = () => {
        if (!editor) return;
        if (linkUrl === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
        } else {
            // Add https:// if missing
            let finalUrl = linkUrl;
            if (!/^https?:\/\//i.test(finalUrl)) {
                finalUrl = 'https://' + finalUrl;
            }
            editor.chain().focus().extendMarkRange('link').setLink({ href: finalUrl }).run();
        }
        setLinkInputOpen(false);
        setLinkUrl('');
    };

    // Click outside handler
    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            handleSave();
        }
    };

    if (!isOpen || !editor) return null;

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
            onClick={handleOverlayClick}
        >
            <div
                className="flex items-start gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left Toolbar */}
                <CommentEditorToolbar
                    mode={toolbarMode}
                    onModeChange={setToolbarMode}
                    onCardColor={() => {
                        setTextStyleOpen(false);
                        setLinkInputOpen(false);
                        setCardColorOpen(true);
                    }}
                    onCollapse={handleCollapse}
                    onBold={handleBold}
                    onItalic={handleItalic}
                    onStrikethrough={handleStrike}
                    onLink={handleLink}
                    onTextStyle={() => {
                        setEmojiOpen(false);
                        setLinkInputOpen(false);
                        setCardColorOpen(false);
                        setTextStyleOpen(true);
                    }}
                    textStyleOpen={textStyleOpen}
                    onEmoji={() => {
                        setTextStyleOpen(false);
                        setLinkInputOpen(false);
                        setCardColorOpen(false);
                        setEmojiOpen(!emojiOpen);
                    }}
                    emojiOpen={emojiOpen}
                />

                {/* Main Card */}
                <div
                    className="relative bg-white rounded-xl shadow-2xl overflow-visible"
                    style={{ width: '400px' }}
                >
                    {/* Card Color Popup */}
                    {cardColorOpen && (
                        <div className="absolute left-full top-0 ml-2 z-50">
                            <NoteColorPopup
                                isOpen={true}
                                onOpenChange={setCardColorOpen}
                                onSelectBackground={setCardColor}
                                onSelectTopStrip={(color) => setTopStrip(color)}
                                onSelectTextColor={(color) => setCardTextColor(color)}
                                currentBackground={cardColor}
                                currentTopStrip={topStrip || 'transparent'}
                                currentTextColor={cardTextColor}
                            />
                        </div>
                    )}

                    {/* Emoji Picker Popup */}
                    {emojiOpen && (
                        <div
                            className="absolute left-full top-0 ml-2 z-[70]"
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <EmojiPicker
                                onEmojiClick={handleEmojiClick}
                                width={320}
                                height={400}
                                searchPlaceHolder="Search emojis..."
                                previewConfig={{ showPreview: false }}
                            />
                        </div>
                    )}

                    {/* Text Style Popup - positioned to the right of the card */}
                    {textStyleOpen && (
                        <div
                            className="absolute left-full top-0 ml-2 z-[60] bg-white rounded-lg shadow-2xl p-4 w-[300px] border border-gray-100"
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <span className="font-semibold text-gray-800">Text style</span>
                                <button
                                    onClick={() => setTextStyleOpen(false)}
                                    className="p-1 hover:bg-gray-100 rounded-full transition-colors font-bold"
                                >
                                    ✕
                                </button>
                            </div>
                            <TextStylePopup
                                isOpen={true}
                                onOpenChange={setTextStyleOpen}
                                onSelectHeading={() => { }}
                                onSelectColor={handleTextColor}
                                onSelectHighlight={handleHighlight}
                                currentColor={currentTextColor}
                                currentHighlight={currentHighlight}
                            />
                        </div>
                    )}

                    {/* Link Input Popup */}
                    {linkInputOpen && (
                        <div
                            className="absolute left-full top-0 ml-2 z-[60] bg-white rounded-lg shadow-lg p-3 border border-gray-200"
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="url"
                                    value={linkUrl}
                                    onChange={(e) => setLinkUrl(e.target.value)}
                                    placeholder="google.com"
                                    className="flex-1 px-3 py-2 border border-blue-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200 text-sm w-64"
                                    autoFocus
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleApplyLink();
                                        if (e.key === 'Escape') setLinkInputOpen(false);
                                    }}
                                />
                                <button
                                    onClick={handleApplyLink}
                                    className="px-4 py-2 text-gray-600 hover:text-gray-900 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                                >
                                    Add
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Inner wrapper with margin */}
                    <div className="m-2 relative">
                        {/* Comment Count Badge */}
                        {comments.length > 0 && (
                            <div
                                className="absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800"
                                style={{ backgroundColor: cardColor }}
                            >
                                {comments.length}
                            </div>
                        )}

                        {/* Inner card */}
                        <div
                            className="rounded-xl overflow-hidden flex flex-col"
                            style={{
                                backgroundColor: cardColor,
                                minHeight: '180px',
                                maxHeight: '70vh',
                            }}
                        >
                            {/* Comments list */}
                            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                {comments.length === 0 ? (
                                    <div className="text-center text-gray-400 py-8">
                                        No comments yet. Add one below!
                                    </div>
                                ) : (
                                    comments.map(comment => (
                                        <div key={comment.id} className="flex gap-3">
                                            {/* Avatar */}
                                            <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                                                {comment.userAvatar ? (
                                                    <img src={comment.userAvatar} alt="" className="w-full h-full rounded-full" />
                                                ) : (
                                                    getInitial(comment.userName)
                                                )}
                                            </div>

                                            {/* Comment content */}
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-medium text-gray-800">{comment.userName}</span>
                                                    <span className="text-xs text-gray-400">{getTimeAgo(comment.timestamp)}</span>
                                                    {comment.userId === currentUserId && (
                                                        <>
                                                            <button
                                                                onClick={() => handleEditComment(comment.id)}
                                                                className="text-xs text-blue-500 hover:text-blue-600 ml-auto"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() => handleRemoveComment(comment.id)}
                                                                className="text-xs text-red-500 hover:text-red-600"
                                                            >
                                                                Remove
                                                            </button>
                                                        </>
                                                    )}
                                                </div>

                                                {editingCommentId === comment.id && editEditor ? (
                                                    <div className="flex flex-col gap-2">
                                                        <EditorContent key={`edit-${editorKey}`} editor={editEditor} />
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={handleSaveEdit}
                                                                className="text-sm text-blue-500 hover:text-blue-600 font-medium"
                                                            >
                                                                Save
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingCommentId(null);
                                                                    editEditor.commands.clearContent();
                                                                }}
                                                                className="text-sm text-gray-500 hover:text-gray-600"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="text-sm text-gray-700 prose prose-sm max-w-none"
                                                        dangerouslySetInnerHTML={{ __html: comment.text }}
                                                    />
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* Add comment input */}
                            <div className="p-4 border-t bg-gray-50/50">
                                <div className="flex items-start gap-3">
                                    {/* Current user avatar */}
                                    <div className="w-8 h-8 rounded-full bg-orange-600 flex items-center justify-center text-white text-sm font-medium flex-shrink-0 mt-1">
                                        {currentUserAvatar ? (
                                            <img src={currentUserAvatar} alt="" className="w-full h-full rounded-full" />
                                        ) : (
                                            getInitial(currentUserName)
                                        )}
                                    </div>

                                    {/* Rich text editor */}
                                    <div
                                        className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"
                                        onKeyDown={handleKeyDown}
                                    >
                                        <EditorContent key={`main-${editorKey}`} editor={editor} />
                                    </div>

                                    {/* Send button */}
                                    <button
                                        onClick={handleAddComment}
                                        className="w-8 h-8 rounded-full flex items-center justify-center bg-blue-500 text-white hover:bg-blue-600 transition-colors mt-1"
                                    >
                                        <Send className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
