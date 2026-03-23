"use client";

import React, { useState, useEffect, useRef } from 'react';
import { X, Palette, Image as ImageIcon, Link2, Type, Smile, MessageSquare, ExternalLink, PenTool } from 'lucide-react';
import { ColorPickerContent } from '../ColorPicker';
import EmojiPicker from 'emoji-picker-react';
import TextStylePopup from './TextStylePopup';
import LinkMediaEmbed, { getLinkEmbedKind } from '../LinkMediaEmbed';

// Comment type
interface Comment {
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

interface LinkEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        linkUrl: string;
        linkTitle?: string;
        linkDescription?: string;
        linkImage?: string;
        linkFavicon?: string;
        linkDomain?: string;
        linkCaption?: string;
        linkCaptionColor?: string;
        cardColor?: string;
        topStrip?: string;
        reactions?: string[];
        displayMode?: 'both' | 'image-only' | 'info-only';
        detachedComments?: Comment[];
        badgeColor?: string;
    }) => void;
    initialData?: {
        linkUrl?: string;
        linkTitle?: string;
        linkDescription?: string;
        linkImage?: string;
        linkFavicon?: string;
        linkDomain?: string;
        linkCaption?: string;
        linkCaptionColor?: string;
        cardColor?: string;
        topStrip?: string;
        reactions?: string[];
        displayMode?: 'both' | 'image-only' | 'info-only';
        detachedComments?: Comment[];
        comments?: Comment[];
        badgeColor?: string;
    };
}

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


// HTML entity decoder
function decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
        '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
        '&#39;': "'", '&#x27;': "'", '&apos;': "'", '&nbsp;': ' ',
    };
    let decoded = text;
    for (const [entity, char] of Object.entries(entities)) {
        decoded = decoded.replace(new RegExp(entity, 'gi'), char);
    }
    decoded = decoded.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)));
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    return decoded;
}

export default function LinkEditor({
    isOpen,
    onClose,
    onSave,
    initialData,
}: LinkEditorProps) {
    // URL and preview state
    const [urlInput, setUrlInput] = useState('');
    const [linkUrl, setLinkUrl] = useState('');
    const [linkTitle, setLinkTitle] = useState('');
    const [linkDescription, setLinkDescription] = useState('');
    const [linkImage, setLinkImage] = useState('');
    const [linkFavicon, setLinkFavicon] = useState('');
    const [linkDomain, setLinkDomain] = useState('');
    const [linkCaption, setLinkCaption] = useState('');
    const [linkCaptionColor, setLinkCaptionColor] = useState('#1F2937');
    const [isLoading, setIsLoading] = useState(false);
    const [previewLoaded, setPreviewLoaded] = useState(false);

    // Styling state
    const [cardColor, setCardColor] = useState('#ffffff');
    const [topStrip, setTopStrip] = useState<string | null>(null);
    const [reactions, setReactions] = useState<string[]>([]);

    // Popup state
    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [activeTab, setActiveTab] = useState<'background' | 'topstrip' | 'text'>('background');

    // Display mode: 'both' | 'image-only' | 'info-only'
    const [displayMode, setDisplayMode] = useState<'both' | 'image-only' | 'info-only'>('both');

    // Editing state
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [isEditingCaption, setIsEditingCaption] = useState(false);

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [showCommentsPopup, setShowCommentsPopup] = useState(false);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState('');
    const [newCommentText, setNewCommentText] = useState('');
    const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
    const [badgeColor, setBadgeColor] = useState('#facc15');
    const [showBadgeColorPicker, setShowBadgeColorPicker] = useState(false);

    const urlInputRef = useRef<HTMLInputElement>(null);

    // Initialize from props
    useEffect(() => {
        if (isOpen && initialData) {
            setLinkUrl(initialData.linkUrl || '');
            setUrlInput(initialData.linkUrl || '');
            setLinkTitle(decodeHtmlEntities(initialData.linkTitle || ''));
            setLinkDescription(decodeHtmlEntities(initialData.linkDescription || ''));
            setLinkImage(initialData.linkImage || '');
            setLinkFavicon(initialData.linkFavicon || '');
            setLinkDomain(initialData.linkDomain || '');
            setLinkCaption(initialData.linkCaption || '');
            setLinkCaptionColor(initialData.linkCaptionColor || '#1F2937');
            setCardColor(initialData.cardColor || '#ffffff');
            setTopStrip(initialData.topStrip || null);
            setReactions(initialData.reactions || []);
            setDisplayMode(initialData.displayMode || 'both');
            const incomingComments = initialData.detachedComments || initialData.comments || [];
            setComments(incomingComments.map((comment) => ({
                ...comment,
                textColor: comment.textColor || comment.color,
                backgroundColor: comment.backgroundColor,
                isStrikethrough: comment.isStrikethrough,
            })));
            setBadgeColor(initialData.badgeColor || '#facc15');
            setPreviewLoaded(!!initialData.linkUrl);
        } else if (isOpen) {
            // Reset for new link
            setLinkUrl('');
            setUrlInput('');
            setLinkTitle('');
            setLinkDescription('');
            setLinkImage('');
            setLinkFavicon('');
            setLinkDomain('');
            setLinkCaption('');
            setLinkCaptionColor('#1F2937');
            setCardColor('#ffffff');
            setTopStrip(null);
            setReactions([]);
            setComments([]);
            setBadgeColor('#facc15');
            setPreviewLoaded(false);
            // Focus URL input
            setTimeout(() => urlInputRef.current?.focus(), 100);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Fetch link preview
    const fetchLinkPreview = async (url: string) => {
        if (!url) return;

        setIsLoading(true);
        try {
            const response = await fetch('/api/link-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });

            if (response.ok) {
                const data = await response.json();
                setLinkUrl(data.url || url);
                setLinkTitle(data.title || '');
                setLinkDescription(data.description || '');
                setLinkImage(data.image || '');
                setLinkFavicon(data.favicon || '');
                setLinkDomain(data.domain || '');
                setPreviewLoaded(true);
            }
        } catch (error) {
            console.error('Failed to fetch link preview:', error);
            // Still set the URL even if preview fails
            setLinkUrl(url);
            setPreviewLoaded(true);
        } finally {
            setIsLoading(false);
        }
    };

    // Handle URL submit
    const handleUrlSubmit = () => {
        let url = urlInput.trim();
        if (!url) return;

        // Add https:// if no protocol
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
            setUrlInput(url);
        }

        fetchLinkPreview(url);
    };

    // Handle save
    const handleSave = () => {
        if (!linkUrl) {
            onClose();
            return;
        }

        onSave({
            linkUrl,
            linkTitle: linkTitle || undefined,
            linkDescription: linkDescription || undefined,
            linkImage: linkImage || undefined,
            linkFavicon: linkFavicon || undefined,
            linkDomain: linkDomain || undefined,
            linkCaption: linkCaption || undefined,
            linkCaptionColor: linkCaptionColor !== '#1F2937' ? linkCaptionColor : undefined,
            cardColor: cardColor !== '#ffffff' ? cardColor : undefined,
            topStrip: topStrip || undefined,
            reactions: reactions.length > 0 ? reactions : undefined,
            displayMode: displayMode !== 'both' ? displayMode : undefined,
            detachedComments: comments,
            badgeColor: badgeColor || '#facc15',
        });
        onClose();
    };

    // Toggle reaction
    const toggleReaction = (emoji: string) => {
        setReactions(prev =>
            prev.includes(emoji)
                ? prev.filter(r => r !== emoji)
                : [...prev, emoji]
        );
        setShowReactionPicker(false);
    };

    const activeComment = comments.find((comment) => comment.id === activeCommentId) || null;

    if (!isOpen) return null;

    const showMedia = displayMode !== 'info-only';
    const showInfo = displayMode !== 'image-only';
    const embedKind = showMedia && linkUrl ? getLinkEmbedKind(linkUrl) : 'none';
    const showEmbed = embedKind !== 'none';

    return (
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/30"
            onClick={handleSave}
        >
            <div
                className="flex items-start gap-3"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Left Toolbar */}
                <div className="flex flex-col items-center bg-gray-50 rounded-lg shadow-lg border border-gray-200 p-2 gap-1">
                    {/* Color */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setShowColorPicker(!showColorPicker);
                                setShowReactionPicker(false);
                            }}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showColorPicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                }`}
                            title="Card Color"
                        >
                            <Palette className="w-5 h-5" />
                        </button>
                        <span className="text-[9px] text-gray-500 text-center w-full block">Color</span>

                    </div>

                    {/* Image - toggle to image-only mode */}
                    <button
                        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${displayMode === 'image-only' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                            }`}
                        title="Image Only (hide text)"
                        onClick={() => {
                            setDisplayMode(displayMode === 'image-only' ? 'both' : 'image-only');
                            setShowColorPicker(false);
                            setShowReactionPicker(false);
                        }}
                    >
                        <ImageIcon className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block">Image</span>

                    {/* Link info - toggle to info-only mode */}
                    <button
                        className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${displayMode === 'info-only' ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                            }`}
                        title="Link Info Only (hide image)"
                        onClick={() => {
                            setDisplayMode(displayMode === 'info-only' ? 'both' : 'info-only');
                            setShowColorPicker(false);
                            setShowReactionPicker(false);
                        }}
                    >
                        <Link2 className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block">Link info</span>

                    {/* Caption */}
                    <button
                        className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                        title="Add Caption"
                        onClick={() => {
                            setIsEditingCaption(true);
                            setShowColorPicker(false);
                            setShowReactionPicker(false);
                        }}
                    >
                        <Type className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block">Caption</span>

                    {/* Reactions */}
                    <div className="relative">
                        <button
                            onClick={() => {
                                setShowReactionPicker(!showReactionPicker);
                                setShowColorPicker(false);
                            }}
                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showReactionPicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                }`}
                            title="Add Reaction"
                        >
                            <Smile className="w-5 h-5" />
                        </button>
                        <span className="text-[9px] text-gray-500 text-center w-full block">Reaction</span>

                        {/* Reaction picker - now rendered at card level */}
                    </div>

                    {/* Comment */}
                    <div className="relative">
                        <button
                            className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showCommentsPopup ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                }`}
                            title="Comments"
                            onClick={() => {
                                const isOpening = !showCommentsPopup;
                                setShowCommentsPopup(isOpening);
                                setShowColorPicker(false);
                                setShowReactionPicker(false);
                                if (isOpening) {
                                    setActiveCommentId(comments[comments.length - 1]?.id || null);
                                    setEditingCommentId(null);
                                    setEditingCommentText('');
                                    setCommentColorPopupId(null);
                                    setShowBadgeColorPicker(false);
                                }
                            }}
                        >
                            <MessageSquare className="w-5 h-5" />
                            {comments.length > 0 && (
                                <span
                                    className="absolute -top-1 -right-1 w-4 h-4 text-white text-[10px] rounded-full flex items-center justify-center"
                                    style={{ backgroundColor: badgeColor }}
                                >
                                    {comments.length}
                                </span>
                            )}
                        </button>
                        <span className="text-[9px] text-gray-500 text-center w-full block">Comment</span>
                    </div>
                </div>

                {/* Main Card */}
                <div
                    className="relative rounded-lg shadow-lg border border-gray-200 overflow-visible"
                    style={{
                        backgroundColor: cardColor,
                        width: '400px',
                        minHeight: '300px',
                    }}
                >
                    {showColorPicker && (
                        <div
                            className="absolute left-full top-0 ml-2 z-[60] w-[320px] rounded-xl bg-white p-4 shadow-sm border border-gray-200"
                            onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-3 flex items-center justify-between">
                                <div className="text-sm font-semibold text-slate-800">Card Color</div>
                                <button
                                    type="button"
                                    onClick={() => setShowColorPicker(false)}
                                    className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-100"
                                >
                                    <X className="w-3 h-3 text-gray-400" />
                                </button>
                            </div>

                            <div className="mb-3 inline-flex rounded-lg border bg-slate-50 p-1">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("background")}
                                    className={[
                                        "px-3 py-1 text-xs font-medium rounded-md",
                                        activeTab === "background" ? "bg-white shadow-sm" : "text-slate-600",
                                    ].join(" ")}
                                >
                                    Background
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("topstrip")}
                                    className={[
                                        "px-3 py-1 text-xs font-medium rounded-md",
                                        activeTab === "topstrip" ? "bg-white shadow-sm" : "text-slate-600",
                                    ].join(" ")}
                                >
                                    Top Strip
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("text")}
                                    className={[
                                        "px-3 py-1 text-xs font-medium rounded-md",
                                        activeTab === "text" ? "bg-white shadow-sm" : "text-slate-600",
                                    ].join(" ")}
                                >
                                    Text
                                </button>
                            </div>

                            <ColorPickerContent
                                color={
                                    activeTab === "background"
                                        ? cardColor
                                        : activeTab === "topstrip"
                                            ? (topStrip || "transparent")
                                            : linkCaptionColor
                                }
                                onChange={(val) => {
                                    if (activeTab === "background") {
                                        setCardColor(val);
                                        return;
                                    }
                                    if (activeTab === "topstrip") {
                                        setTopStrip(val === "transparent" ? null : val);
                                        return;
                                    }
                                    setLinkCaptionColor(val);
                                }}
                                hasOpacity={true}
                                presets={activeTab === "background" ? BACKGROUND_COLORS : activeTab === "topstrip" ? TOP_STRIP_COLORS : undefined}
                            />
                        </div>
                    )}

                    {/* Reaction Picker Popup - positioned to the right of the card */}
                    {showReactionPicker && (
                        <div
                            className="absolute left-full top-0 ml-2 z-[60]"
                            onMouseDown={(e) => e.preventDefault()}
                        >
                            <EmojiPicker
                                onEmojiClick={(emojiData) => {
                                    toggleReaction(emojiData.emoji);
                                }}
                                width={320}
                                height={400}
                                searchPlaceHolder="Search emojis..."
                                previewConfig={{ showPreview: false }}
                            />
                        </div>
                    )}

                    {showCommentsPopup && commentColorPopupId && (
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
                                onSelectHeading={() => { }}
                                hideHeadingSelect={true}
                                onSelectColor={(color) => {
                                    setComments((prev) => prev.map((comment) =>
                                        comment.id === commentColorPopupId
                                            ? { ...comment, textColor: color }
                                            : comment
                                    ));
                                }}
                                onSelectHighlight={(color) => {
                                    setComments((prev) => prev.map((comment) =>
                                        comment.id === commentColorPopupId
                                            ? { ...comment, backgroundColor: color }
                                            : comment
                                    ));
                                }}
                                currentHeading="normal"
                                currentColor={comments.find(c => c.id === commentColorPopupId)?.textColor || comments.find(c => c.id === commentColorPopupId)?.color}
                                currentHighlight={comments.find(c => c.id === commentColorPopupId)?.backgroundColor}
                            />
                        </div>
                    )}

                    {showCommentsPopup && (
                        <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                            <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                                <div className="flex items-center justify-between mb-3">
                                    <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => {
                                                setShowBadgeColorPicker((prev) => !prev);
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
                                        <button
                                            onClick={() => {
                                                setShowCommentsPopup(false);
                                                setActiveCommentId(null);
                                                setEditingCommentId(null);
                                                setEditingCommentText('');
                                                setCommentColorPopupId(null);
                                                setShowBadgeColorPicker(false);
                                            }}
                                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                {showBadgeColorPicker && (
                                    <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                                        <div className="grid grid-cols-6 gap-1.5">
                                            {BADGE_COLORS.map((color) => (
                                                <button
                                                    key={color}
                                                    onClick={() => {
                                                        setBadgeColor(color);
                                                        setShowBadgeColorPicker(false);
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
                                    <div className="flex gap-3">
                                        <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto pr-1 scrollbar-ultrathin">
                                            {comments.map((comment) => {
                                                const isEditing = editingCommentId === comment.id;
                                                const isActive = activeCommentId === comment.id;
                                                const commitEdit = () => {
                                                    const trimmed = editingCommentText.trim();
                                                    if (!trimmed) {
                                                        setEditingCommentId(null);
                                                        setEditingCommentText('');
                                                        setCommentColorPopupId(null);
                                                        return;
                                                    }
                                                    setComments((prev) => prev.map((c) =>
                                                        c.id === comment.id ? { ...c, text: trimmed } : c
                                                    ));
                                                    setEditingCommentId(null);
                                                    setEditingCommentText('');
                                                    setCommentColorPopupId(null);
                                                };

                                                return (
                                                    <div
                                                        key={comment.id}
                                                        className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                                        onClick={() => setActiveCommentId(comment.id)}
                                                    >
                                                        <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                                            {comment.userName?.charAt(0) || 'U'}
                                                        </div>
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-medium text-gray-700">{comment.userName || 'User'}</span>
                                                                <span className="text-[10px] text-gray-400">{new Date(comment.timestamp).toLocaleDateString()}</span>
                                                            </div>
                                                            {isEditing ? (
                                                                <textarea
                                                                    value={editingCommentText}
                                                                    onChange={(e) => setEditingCommentText(e.target.value)}
                                                                    onInput={(e) => {
                                                                        const el = e.currentTarget;
                                                                        el.style.height = 'auto';
                                                                        el.style.height = `${el.scrollHeight}px`;
                                                                    }}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter' && !e.shiftKey) {
                                                                            e.preventDefault();
                                                                            commitEdit();
                                                                        }
                                                                        if (e.key === 'Escape') {
                                                                            setEditingCommentId(null);
                                                                            setEditingCommentText('');
                                                                            setCommentColorPopupId(null);
                                                                        }
                                                                    }}
                                                                    onBlur={() => {
                                                                        if (commentColorPopupId === comment.id) return;
                                                                        commitEdit();
                                                                    }}
                                                                    className="w-full text-xs mt-0.5 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                                                    style={{
                                                                        wordBreak: 'break-word',
                                                                        color: comment.textColor || comment.color,
                                                                        backgroundColor: comment.backgroundColor || undefined,
                                                                    }}
                                                                    rows={1}
                                                                    autoFocus
                                                                />
                                                            ) : (
                                                                <p
                                                                    className={`text-xs text-gray-600 mt-0.5 break-words whitespace-pre-wrap ${comment.isStrikethrough ? 'line-through' : ''}`}
                                                                    style={{
                                                                        wordBreak: 'break-word',
                                                                        color: comment.textColor || comment.color,
                                                                        backgroundColor: comment.backgroundColor || undefined,
                                                                    }}
                                                                >
                                                                    {comment.text}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                                            {editingCommentId && activeComment && editingCommentId === activeComment.id ? (
                                                <button
                                                    onMouseDown={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setCommentColorPopupId((prev) => (prev === activeComment.id ? null : activeComment.id));
                                                    }}
                                                    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                                    title="Color"
                                                    disabled={!activeComment}
                                                >
                                                    <Palette className="w-3 h-3" />
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => {
                                                        if (!activeComment) return;
                                                        setEditingCommentId(activeComment.id);
                                                        setEditingCommentText(activeComment.text || '');
                                                        setCommentColorPopupId(null);
                                                    }}
                                                    className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
                                                    title="Edit"
                                                    disabled={!activeComment}
                                                >
                                                    <PenTool className="w-3 h-3" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => {
                                                    if (!activeComment) return;
                                                    setComments((prev) => prev.map((comment) =>
                                                        comment.id === activeComment.id
                                                            ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                                            : comment
                                                    ));
                                                }}
                                                className={`p-1 rounded transition-colors ${activeComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                                                title="Strikethrough"
                                                disabled={!activeComment}
                                            >
                                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                                                    <path d="M14 12a4 4 0 0 1 0 8H6" />
                                                    <line x1="4" y1="12" x2="20" y2="12" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => {
                                                    if (!activeComment) return;
                                                    setComments((prev) => prev.filter((comment) => comment.id !== activeComment.id));
                                                    setActiveCommentId(null);
                                                    setEditingCommentId(null);
                                                    setEditingCommentText('');
                                                    setCommentColorPopupId(null);
                                                }}
                                                className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
                                                title="Delete"
                                                disabled={!activeComment}
                                            >
                                                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                    <path d="M3 6h18" />
                                                    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                                    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                                    <line x1="10" x2="10" y1="11" y2="17" />
                                                    <line x1="14" x2="14" y1="11" y2="17" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                )}
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                    <input
                                        type="text"
                                        value={newCommentText}
                                        onChange={(e) => setNewCommentText(e.target.value)}
                                        placeholder="Add a comment..."
                                        className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newCommentText.trim()) {
                                                const commentText = newCommentText.trim();
                                                const newComment = {
                                                    id: `comment-${Date.now()}`,
                                                    text: commentText,
                                                    userId: 'current-user',
                                                    userName: 'You',
                                                    timestamp: Date.now(),
                                                };
                                                setComments((prev) => [...prev, newComment]);
                                                setNewCommentText('');
                                                setActiveCommentId(newComment.id);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                    {/* Top strip */}
                    {topStrip && (
                        <div className="h-2" style={{ backgroundColor: topStrip }} />
                    )}

                    {/* Close button */}
                    <button
                        onClick={handleSave}
                        className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-black/20 hover:bg-black/40 text-white z-10"
                    >
                        <X className="w-4 h-4" />
                    </button>

                    {/* Content */}
                    <div className="p-4">
                        {/* URL Input - shown when no preview */}
                        {!previewLoaded ? (
                            <div className="py-8">
                                <div className="text-center mb-4">
                                    <Link2 className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500">Paste a URL to create a link card</p>
                                </div>
                                <div className="flex gap-2">
                                    <input
                                        ref={urlInputRef}
                                        type="text"
                                        value={urlInput}
                                        onChange={(e) => setUrlInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleUrlSubmit();
                                            }
                                        }}
                                        placeholder="https://example.com"
                                        className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                    />
                                    <button
                                        onClick={handleUrlSubmit}
                                        disabled={isLoading}
                                        className="px-5 py-2 bg-white text-gray-600 rounded-md text-sm font-medium border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                                    >
                                        {isLoading ? 'Loading...' : 'Add'}
                                    </button>
                                </div>
                                {/* Supported service icons */}
                                <div className="flex items-center justify-center gap-4 mt-5">
                                    {/* YouTube */}
                                    <div className="flex flex-col items-center gap-1 opacity-40">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                            <rect width="24" height="24" rx="5" fill="#FF0000"/>
                                            <path d="M19.6 7.8a2.1 2.1 0 0 0-1.48-1.48C16.8 6 12 6 12 6s-4.8 0-6.12.32A2.1 2.1 0 0 0 4.4 7.8C4.08 9.12 4.08 12 4.08 12s0 2.88.32 4.2a2.1 2.1 0 0 0 1.48 1.48C7.2 18 12 18 12 18s4.8 0 6.12-.32a2.1 2.1 0 0 0 1.48-1.48C19.92 14.88 19.92 12 19.92 12s0-2.88-.32-4.2z" fill="white"/>
                                            <path d="M10 15l5-3-5-3v6z" fill="#FF0000"/>
                                        </svg>
                                        <span className="text-[9px] text-gray-400">YouTube</span>
                                    </div>
                                    {/* X (Twitter) */}
                                    <div className="flex flex-col items-center gap-1 opacity-40">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                            <rect width="24" height="24" rx="5" fill="#000000"/>
                                            <path d="M17.5 4h2.5l-5.5 6.3L21 20h-5.1l-3.5-4.6L8.1 20H5.6l5.9-6.7L4 4h5.2l3.2 4.2L17.5 4zm-.9 14.4h1.4L7.5 5.4H6l10.6 13z" fill="white"/>
                                        </svg>
                                        <span className="text-[9px] text-gray-400">X</span>
                                    </div>
                                    {/* Instagram */}
                                    <div className="flex flex-col items-center gap-1 opacity-40">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                            <defs>
                                                <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                                                    <stop offset="0%" stopColor="#FFDC80"/>
                                                    <stop offset="25%" stopColor="#FCAF45"/>
                                                    <stop offset="50%" stopColor="#F77737"/>
                                                    <stop offset="75%" stopColor="#C13584"/>
                                                    <stop offset="100%" stopColor="#405DE6"/>
                                                </linearGradient>
                                            </defs>
                                            <rect width="24" height="24" rx="6" fill="url(#ig-grad)"/>
                                            <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" stroke="white" strokeWidth="1.5" fill="none"/>
                                            <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="1.5" fill="none"/>
                                            <circle cx="16.5" cy="7.5" r="0.75" fill="white"/>
                                        </svg>
                                        <span className="text-[9px] text-gray-400">Instagram</span>
                                    </div>
                                    {/* TikTok */}
                                    <div className="flex flex-col items-center gap-1 opacity-40">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                            <rect width="24" height="24" rx="5" fill="#000000"/>
                                            <path d="M17 8.5a3.5 3.5 0 0 1-3.5-3.5h-2v10a1.5 1.5 0 1 1-2-1.41V11.5a3.5 3.5 0 1 0 4 3.5V8.9A5.5 5.5 0 0 0 17 9.5V8.5z" fill="white"/>
                                        </svg>
                                        <span className="text-[9px] text-gray-400">TikTok</span>
                                    </div>
                                    {/* Facebook */}
                                    <div className="flex flex-col items-center gap-1 opacity-40">
                                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="none">
                                            <rect width="24" height="24" rx="5" fill="#1877F2"/>
                                            <path d="M16 8h-2a1 1 0 0 0-1 1v2h3l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2v3z" fill="white"/>
                                        </svg>
                                        <span className="text-[9px] text-gray-400">Facebook</span>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* Link Preview - Media */}
                                {showMedia && showEmbed && (
                                    <div className="relative -mx-4 -mt-4 mb-4">
                                        <LinkMediaEmbed url={linkUrl} />
                                    </div>
                                )}

                                {/* Link Preview - Image (hide if info-only / when embed exists) */}
                                {showMedia && !showEmbed && linkImage && (
                                    <div className="relative -mx-4 -mt-4 mb-4">
                                        <img
                                            src={linkImage}
                                            alt={linkTitle}
                                            className="w-full h-48 object-cover"
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Domain and URL (hide if image-only) */}
                                {showInfo && (
                                    <div className="flex items-center gap-2 mb-2">
                                        {linkFavicon && (
                                            <img
                                                src={linkFavicon}
                                                alt=""
                                                className="w-4 h-4"
                                                onError={(e) => {
                                                    (e.target as HTMLImageElement).style.display = 'none';
                                                }}
                                            />
                                        )}
                                        <a
                                            href={linkUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-gray-500 hover:text-blue-500 truncate flex items-center gap-1"
                                        >
                                            {linkDomain || linkUrl}
                                            <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                )}

                                {/* Title (hide if image-only) */}
                                {showInfo && (isEditingTitle ? (
                                    <input
                                        type="text"
                                        value={linkTitle}
                                        onChange={(e) => setLinkTitle(e.target.value)}
                                        onBlur={() => setIsEditingTitle(false)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') setIsEditingTitle(false);
                                        }}
                                        className="w-full text-lg font-semibold bg-transparent border-b border-blue-400 outline-none mb-2"
                                        autoFocus
                                        placeholder="Add a title..."
                                    />
                                ) : (
                                    <h3
                                        className="text-lg font-semibold text-blue-600 mb-2 cursor-pointer hover:text-blue-700"
                                        onClick={() => setIsEditingTitle(true)}
                                    >
                                        {linkTitle || 'Click to add title'}
                                    </h3>
                                ))}

                                {/* Description (hide if image-only) */}
                                {showInfo && (isEditingDescription ? (
                                    <textarea
                                        value={linkDescription}
                                        onChange={(e) => setLinkDescription(e.target.value)}
                                        onBlur={() => setIsEditingDescription(false)}
                                        className="w-full text-sm text-gray-600 bg-transparent border border-gray-200 rounded p-2 outline-none resize-none"
                                        rows={3}
                                        autoFocus
                                        placeholder="Add a description..."
                                    />
                                ) : (
                                    <p
                                        className="text-sm text-gray-600 mb-4 cursor-pointer hover:bg-gray-50 rounded p-1 -m-1"
                                        onClick={() => setIsEditingDescription(true)}
                                    >
                                        {linkDescription || 'Click to add description'}
                                    </p>
                                ))}

                                {/* Caption - always visible so you can add caption in image-only mode */}
                                <div className="border-t border-gray-100 pt-3 mt-3">
                                    {isEditingCaption ? (
                                        <textarea
                                            value={linkCaption}
                                            onChange={(e) => setLinkCaption(e.target.value)}
                                            onBlur={() => setIsEditingCaption(false)}
                                            className="w-full text-sm bg-gray-50 rounded p-2 outline-none resize-none border border-gray-200 focus:border-blue-400"
                                            rows={2}
                                            autoFocus
                                            placeholder="Add your caption..."
                                        />
                                    ) : (
                                        <div className="group relative">
                                            <div
                                                className="text-sm italic cursor-pointer hover:bg-gray-50 rounded p-2 -m-2"
                                                style={{ color: linkCaptionColor }}
                                                onClick={() => setIsEditingCaption(true)}
                                            >
                                                {linkCaption || 'Click to add caption...'}
                                            </div>
                                            {/* Delete caption button - shows when there's caption text */}
                                            {linkCaption && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLinkCaption('');
                                                    }}
                                                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                    title="Delete caption"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Reactions */}
                                {reactions.length > 0 && (
                                    <div className="flex gap-1 mt-3 pt-3 border-t border-gray-100">
                                        {reactions.map((emoji, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-1 bg-gray-100 rounded-full text-sm cursor-pointer hover:bg-gray-200"
                                                onClick={() => toggleReaction(emoji)}
                                            >
                                                {emoji}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
