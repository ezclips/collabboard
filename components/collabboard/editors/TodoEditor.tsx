"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Palette, Type, Calendar, User, Smile, MessageSquare, Trash2, ChevronLeft, ChevronRight, Clock, Bell, X, Share2, GripVertical, PenTool } from 'lucide-react';
import ShareModal from './ShareModal';
import { ColorPickerContent } from '../ColorPicker';
import TextStylePopup from './TextStylePopup';
import EmojiReactionPicker from './EmojiReactionPicker';
import { CAPTION_STYLE_PRESETS, resolveCaptionStyle, type CaptionHeading, type CaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { nextTextAlign } from './textAlignCycle';
import { contrastIconColor } from '../shells/CardShell';

// Extends CaptionStyle so a task carries the exact same style fields as the
// title (color/heading/bold/italic/underline/strikethrough/align) -- each
// one is a per-task override, independent of every other task and of the
// title's own captionStyle. `color` is also read by presentation-mode's
// slide renderer for the completed-task marker fill (PresentationPadletCard.tsx).
interface Task extends Partial<CaptionStyle> {
    id: string;
    text: string;
    completed: boolean;
    dueDate?: string;
    dueTime?: string;
    reminder?: string;
    assignee?: string;
    indentLevel?: number; // 0, 1, or 2 - for sub-task hierarchy
}

interface PadletComment {
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

interface TodoEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: {
        todoTitle?: string;
        tasks: Task[];
        cardColor?: string;
        topStrip?: string;
        reactions?: string[];
        isCollapsed?: boolean;
        detachedComments?: PadletComment[];
        comments?: PadletComment[];
        badgeColor?: string;
        captionStyle?: CaptionStyle;
    }) => void;
    initialData?: {
        todoTitle?: string;
        tasks?: Task[];
        cardColor?: string;
        topStrip?: string;
        reactions?: string[];
        isCollapsed?: boolean;
        detachedComments?: PadletComment[];
        comments?: PadletComment[];
        badgeColor?: string;
        captionStyle?: CaptionStyle;
    };
    padletId?: string; // For share functionality
    boardId?: string; // For share functionality (fallback when no padletId)
}

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

const REMINDER_OPTIONS = [
    { value: '', label: 'No reminder' },
    { value: '0', label: 'At time of due date' },
    { value: '10', label: '10 minutes before' },
    { value: '30', label: '30 minutes before' },
    { value: '60', label: '1 hour before' },
];

export default function TodoEditor({
    isOpen,
    onClose,
    onSave,
    initialData,
    padletId,
    boardId,
}: TodoEditorProps) {
    const [todoTitle, setTodoTitle] = useState('');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [newTaskText, setNewTaskText] = useState('');
    const [cardColor, setCardColor] = useState('#ffffff');
    const [topStrip, setTopStrip] = useState<string | null>(null);
    const [reactions, setReactions] = useState<string[]>([]);
    const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
    const [isCollapsed, setIsCollapsed] = useState(false);

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showReactionPicker, setShowReactionPicker] = useState(false);
    const [showShareModal, setShowShareModal] = useState(false);
    const [activeTab, setActiveTab] = useState<'background' | 'topstrip'>('background');

    // Text style (title + task text heading/color/highlight) -- same
    // captionStyle preset mechanism Document/Clipart's own Caption tool uses.
    const [showTextStylePanel, setShowTextStylePanel] = useState(false);
    const [captionStyle, setCaptionStyle] = useState<CaptionStyle>({});
    // Heading/bold/italic/underline/strikethrough/align stay shared across the
    // whole card (captionStyle above), but text COLOR is per-item: 'title' or
    // a task id. Whichever was last clicked is where the color swatch writes.
    const [activeStyleTargetId, setActiveStyleTargetId] = useState<string>('title');

    // Comments state
    const [comments, setComments] = useState<PadletComment[]>([]);
    const [showCommentPopup, setShowCommentPopup] = useState(false);
    const [newCommentText, setNewCommentText] = useState('');
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
    const [editingCommentText, setEditingCommentText] = useState('');
    const [commentColorPopupId, setCommentColorPopupId] = useState<string | null>(null);
    const [badgeColor, setBadgeColor] = useState('#facc15');
    const [showBadgeColorPicker, setShowBadgeColorPicker] = useState(false);

    // Date picker state
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [datePickerTaskId, setDatePickerTaskId] = useState<string | null>(null);
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [viewMonth, setViewMonth] = useState(new Date());
    const [dueTimeHour, setDueTimeHour] = useState('');
    const [dueTimeMinute, setDueTimeMinute] = useState('');
    const [selectedReminder, setSelectedReminder] = useState('');
    const [datePickerPosition, setDatePickerPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
    const taskListRef = useRef<HTMLDivElement>(null);
    // Only reset state when the modal transitions from closed → open.
    // initialData is an inline object (new reference every parent render), so using it
    // as a dep would wipe local state on every ancestor re-render.
    const prevOpenRef = useRef(false);
    useEffect(() => {
        if (isOpen && !prevOpenRef.current) {
            // Modal just opened — seed state from initialData
            if (initialData) {
                setTodoTitle(initialData.todoTitle || '');
                setTasks(initialData.tasks || []);
                setCardColor(initialData.cardColor || '#ffffff');
                setTopStrip(initialData.topStrip || null);
                setReactions(initialData.reactions || []);
                setIsCollapsed(initialData.isCollapsed || false);
                const incomingComments = initialData.detachedComments || initialData.comments || [];
                setComments(incomingComments.map((comment) => ({
                    ...comment,
                    textColor: comment.textColor || comment.color,
                    backgroundColor: comment.backgroundColor,
                    isStrikethrough: comment.isStrikethrough,
                })));
                setBadgeColor(initialData.badgeColor || '#facc15');
                setCaptionStyle(initialData.captionStyle || {});
                setActiveStyleTargetId('title');
            } else {
                setTodoTitle('');
                setTasks([]);
                setNewTaskText('');
                setHoveredTaskId(null);
                setIsCollapsed(false);
                setCardColor('#ffffff');
                setTopStrip(null);
                setReactions([]);
                setComments([]);
                setBadgeColor('#facc15');
                setCaptionStyle({});
                setActiveStyleTargetId('title');
            }
        }
        prevOpenRef.current = isOpen;
    }, [isOpen, initialData]);

    const handleSave = () => {
        onSave({
            todoTitle: todoTitle || undefined,
            tasks,
            cardColor: cardColor !== '#ffffff' ? cardColor : undefined,
            topStrip: topStrip || undefined,
            reactions: reactions.length > 0 ? reactions : undefined,
            isCollapsed,
            detachedComments: comments,
            comments,
            badgeColor: badgeColor || '#facc15',
            captionStyle: Object.keys(captionStyle).length > 0 ? captionStyle : undefined,
        });
        onClose();
    };

    const addTask = () => {
        if (newTaskText.trim()) {
            const newTask: Task = {
                id: Date.now().toString(),
                text: newTaskText.trim(),
                completed: false,
            };
            setTasks(prev => [...prev, newTask]);
            setNewTaskText('');
        }
    };

    const toggleTask = (taskId: string) => {
        setTasks(prev => prev.map(task =>
            task.id === taskId ? { ...task, completed: !task.completed } : task
        ));
    };

    const deleteTask = (taskId: string) => {
        setTasks(prev => prev.filter(task => task.id !== taskId));
    };

    const moveTask = (taskId: string, direction: 'up' | 'down') => {
        const index = tasks.findIndex(t => t.id === taskId);
        if (index === -1) return;
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === tasks.length - 1) return;

        const newTasks = [...tasks];
        const swapIndex = direction === 'up' ? index - 1 : index + 1;
        [newTasks[index], newTasks[swapIndex]] = [newTasks[swapIndex], newTasks[index]];
        setTasks(newTasks);
    };

    const updateTask = (taskId: string, updates: Partial<Task>) => {
        setTasks(prev => prev.map(task =>
            task.id === taskId ? { ...task, ...updates } : task
        ));
    };

    const toggleReaction = (emoji: string) => {
        setReactions(prev =>
            prev.includes(emoji)
                ? prev.filter(r => r !== emoji)
                : [...prev, emoji]
        );
    };

    const writeCaptionStyle = (updates: Partial<CaptionStyle>) => {
        setCaptionStyle((prev) => ({ ...prev, ...updates }));
    };

    // Every style attribute (heading/color/highlight/bold/italic/underline/
    // strikethrough/align) is per-item -- title or exactly one task -- not
    // shared across the whole card. Writes go to whichever text was last
    // clicked; a task with no override of its own falls back to
    // resolveCaptionStyle's own fixed defaults, never to the title's style,
    // so styling the title can never bleed into an untouched task.
    const writeActiveTargetStyle = (updates: Partial<CaptionStyle>) => {
        if (activeStyleTargetId === 'title') {
            writeCaptionStyle(updates);
        } else {
            updateTask(activeStyleTargetId, updates);
        }
    };
    const activeTargetStyle: Partial<CaptionStyle> =
        activeStyleTargetId === 'title'
            ? captionStyle
            : (tasks.find((task) => task.id === activeStyleTargetId) ?? {});
    // Shown at the top of the Text style panel so it's never ambiguous which
    // text a style pick is about to apply to.
    const activeTargetLabel =
        activeStyleTargetId === 'title'
            ? (todoTitle || 'Post name')
            : tasks.find((task) => task.id === activeStyleTargetId)?.text || 'Task';

    const applyActiveTargetHeading = (level: CaptionHeading) => {
        const selectedPreset = level === 'callout' && activeTargetStyle.backgroundColor
            ? { ...CAPTION_STYLE_PRESETS.callout, backgroundColor: activeTargetStyle.backgroundColor }
            : CAPTION_STYLE_PRESETS[level];
        writeActiveTargetStyle(selectedPreset);
    };

    // Bold/Italic/Underline/Strikethrough/Align (TextFormattingButtons,
    // shared component across every Text style panel) toggle on top of
    // whichever heading preset is active, same layering as a TipTap mark
    // over a paragraph -- but scoped to the active target, same as color.
    const isActiveTargetBold = activeTargetStyle.fontWeight === '700' || activeTargetStyle.fontWeight === 'bold';
    const isActiveTargetItalic = activeTargetStyle.fontStyle === 'italic';
    const toggleActiveTargetBold = () => writeActiveTargetStyle({ fontWeight: isActiveTargetBold ? '400' : '700' });
    const toggleActiveTargetItalic = () => writeActiveTargetStyle({ fontStyle: isActiveTargetItalic ? 'normal' : 'italic' });
    const toggleActiveTargetUnderline = () => writeActiveTargetStyle({ underline: !activeTargetStyle.underline });
    const toggleActiveTargetStrikethrough = () => writeActiveTargetStyle({ strikethrough: !activeTargetStyle.strikethrough });
    const cycleActiveTargetAlign = () => writeActiveTargetStyle({ textAlign: nextTextAlign(activeTargetStyle.textAlign || 'left') });

    const resolvedTitleStyle = resolveCaptionStyle(captionStyle, topStrip ? contrastIconColor(topStrip) : undefined);

    const activeComment = comments.find((comment) => comment.id === activeCommentId) || null;

    const getTimeAgo = (ts: number) => {
        const now = Date.now();
        const diff = now - ts;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        if (minutes < 1) return 'just now';
        if (minutes < 60) return `${minutes}m ago`;
        if (hours < 24) return `${hours}h ago`;
        return `${days}d ago`;
    };

    const renderTextWithLinks = (text: string) => {
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        const parts = text.split(urlRegex);
        return parts.map((part, i) => {
            if (part.match(urlRegex)) {
                return (
                    <a
                        key={i}
                        href={part}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline break-all"
                    >
                        {part}
                    </a>
                );
            }
            return <span key={i}>{part}</span>;
        });
    };

    const getInitial = (name: string) => name.charAt(0).toUpperCase();

    const openDatePicker = (taskId: string, event?: React.MouseEvent) => {
        const task = tasks.find(t => t.id === taskId);
        setDatePickerTaskId(taskId);

        // Track position for calendar placement
        if (event) {
            const rect = (event.target as HTMLElement).getBoundingClientRect();
            const editorRect = taskListRef.current?.closest('.relative')?.getBoundingClientRect();
            if (editorRect) {
                setDatePickerPosition({
                    top: rect.bottom - editorRect.top + 8, // 8px below the clicked element
                    left: rect.left - editorRect.left,
                });
            }
        }

        if (task?.dueDate) {
            setSelectedDate(new Date(task.dueDate));
            setViewMonth(new Date(task.dueDate));
        } else {
            // Pre-select today's date when no existing date
            const today = new Date();
            setSelectedDate(today);
            setViewMonth(today);
        }
        if (task?.dueTime) {
            const [h, m] = task.dueTime.split(':');
            setDueTimeHour(h);
            setDueTimeMinute(m);
        } else {
            setDueTimeHour('');
            setDueTimeMinute('');
        }
        setSelectedReminder(task?.reminder || '');
        setShowDatePicker(true);
    };

    const saveDatePicker = () => {
        if (datePickerTaskId) {
            const updates: Partial<Task> = {};
            if (selectedDate) {
                updates.dueDate = selectedDate.toISOString().split('T')[0];
            }
            if (dueTimeHour && dueTimeMinute) {
                updates.dueTime = `${dueTimeHour.padStart(2, '0')}:${dueTimeMinute.padStart(2, '0')}`;
            }
            updates.reminder = selectedReminder || undefined;
            updateTask(datePickerTaskId, updates);
        }
        setShowDatePicker(false);
        setDatePickerTaskId(null);
    };

    const clearDueTime = () => {
        setDueTimeHour('');
        setDueTimeMinute('');
    };

    // Calendar helpers
    const getDaysInMonth = (date: Date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (Date | null)[] = [];

        // Add empty slots for days before the first day of the month
        const startDay = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1; // Monday start
        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }

        // Add all days of the month
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(new Date(year, month, d));
        }

        return days;
    };

    const formatMonth = (date: Date) => {
        return date.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    };

    const isToday = (date: Date) => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    const isSelected = (date: Date) => {
        return selectedDate && date.toDateString() === selectedDate.toDateString();
    };

    if (!isOpen) return null;

    return (
        <>
            <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4"
                onClick={handleSave}
            >
                {/* Main container - uses flexbox to center all three columns */}
                <div className="flex items-start gap-3" onClick={(e) => e.stopPropagation()}>
                    {/* Left Toolbar - top-aligned with the card and side panels
                        (self-center previously made it sit below their top
                        edge whenever the card/panel were taller). */}
                    <div className={`flex flex-col items-center bg-white rounded-lg shadow-lg p-2 gap-1 self-start flex-shrink-0 ${commentColorPopupId ? "opacity-0 pointer-events-none" : ""}`}>
                        {/* Text style */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={() => {
                                    setShowTextStylePanel(!showTextStylePanel);
                                    setShowColorPicker(false);
                                    setShowReactionPicker(false);
                                }}
                                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showTextStylePanel ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                    }`}
                                title="Text style"
                            >
                                <Type className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">Text style</span>
                        </div>

                        {/* Color */}
                        <div className="relative flex flex-col items-center">
                            <button
                                onClick={() => {
                                    setShowColorPicker(!showColorPicker);
                                    setShowReactionPicker(false);
                                    setShowTextStylePanel(false);
                                }}
                                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showColorPicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                    }`}
                                title="Color"
                            >
                                <Palette className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">Color</span>


                        </div>

                        {/* Due date */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={() => {
                                    if (hoveredTaskId) {
                                        openDatePicker(hoveredTaskId);
                                    }
                                }}
                                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${hoveredTaskId
                                    ? 'hover:bg-gray-200 text-gray-600 cursor-pointer'
                                    : 'text-gray-300 cursor-not-allowed'
                                    }`}
                                title={hoveredTaskId ? "Set Due Date" : "Hover over a task first"}
                                disabled={!hoveredTaskId}
                            >
                                <Calendar className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">Due date</span>
                        </div>

                        {/* Share/Assign */}
                        <div className="flex flex-col items-center">
                            <button
                                onClick={() => setShowShareModal(true)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-gray-200 text-gray-600 transition-colors"
                                title="Share"
                            >
                                <Share2 className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">Share</span>
                        </div>

                        {/* Reactions */}
                        <div className="relative flex flex-col items-center">
                            <button
                                onClick={() => {
                                    const isOpening = !showReactionPicker;
                                    setShowReactionPicker(isOpening);
                                    setShowColorPicker(false);
                                    setShowTextStylePanel(false);
                                    if (isOpening) {
                                        setShowCommentPopup(false);
                                        setActiveCommentId(null);
                                        setEditingCommentId(null);
                                        setEditingCommentText('');
                                        setCommentColorPopupId(null);
                                        setShowBadgeColorPicker(false);
                                    }
                                }}
                                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showReactionPicker ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                    }`}
                                title="Reaction"
                            >
                                <Smile className="w-5 h-5" />
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">Reaction</span>
                        </div>

                        {/* Comment */}
                        <div className="relative flex flex-col items-center">
                            <button
                                onClick={() => {
                                    const isOpening = !showCommentPopup;
                                    setShowCommentPopup(isOpening);
                                    setShowColorPicker(false);
                                    setShowReactionPicker(false);
                                    setShowTextStylePanel(false);
                                    if (isOpening) {
                                        setActiveCommentId(comments[comments.length - 1]?.id || null);
                                        setEditingCommentId(null);
                                        setEditingCommentText('');
                                        setCommentColorPopupId(null);
                                        setShowBadgeColorPicker(false);
                                    }
                                }}
                                className={`w-10 h-10 flex items-center justify-center rounded-lg transition-colors ${showCommentPopup ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-200 text-gray-600'
                                    }`}
                                title="Comment"
                            >
                                <MessageSquare className="w-5 h-5" />
                                {comments.length > 0 && (
                                    <span
                                        className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold text-gray-800 flex items-center justify-center"
                                        style={{ backgroundColor: badgeColor }}
                                    >
                                        {comments.length}
                                    </span>
                                )}
                            </button>
                            <span className="text-[9px] text-gray-500 text-center">Comment</span>
                        </div>
                    </div>

                    {/* Main Card - scrollable content, limited max height */}
                    <div
                        className="rounded-lg shadow-lg border border-gray-200 overflow-visible relative bg-white flex-shrink-0"
                        style={{
                            backgroundColor: cardColor,
                            width: '320px',
                            minHeight: '280px',
                            maxHeight: 'calc(100vh - 100px)',
                            display: 'flex',
                            flexDirection: 'column',
                        }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {showReactionPicker && (
                            <div
                                className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in zoom-in duration-200 pointer-events-auto"
                                onClick={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                <div>
                                    <EmojiReactionPicker
                                        isOpen={showReactionPicker}
                                        onOpenChange={setShowReactionPicker}
                                        onSelectEmoji={(emoji) => {
                                            toggleReaction(emoji);
                                        }}
                                        inline
                                    />
                                </div>
                            </div>
                        )}
                        {/* Top strip -- Title lives inside it, same as the canvas
                            card's own top strip, matching every other post
                            type's edit window. Flush against this card's own
                            edges -- no inset wrapper here to create a gap. */}
                        <div
                            className="w-full flex-shrink-0 flex items-center px-2 rounded-t-lg"
                            style={{ minHeight: '22px', backgroundColor: topStrip || 'rgba(0,0,0,0.04)' }}
                        >
                            <input
                                type="text"
                                value={todoTitle}
                                onChange={(e) => setTodoTitle(e.target.value)}
                                onFocus={() => setActiveStyleTargetId('title')}
                                className={`w-full text-sm font-semibold bg-transparent outline-none border-b placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1 ${
                                    activeStyleTargetId === 'title' ? 'border-blue-400 bg-blue-50/40' : 'border-transparent focus:border-blue-400'
                                }`}
                                placeholder="Post name"
                                style={resolvedTitleStyle}
                            />
                        </div>

                        {showCommentPopup && commentColorPopupId && (
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

                        <div className="p-4 overflow-y-auto flex-1" ref={taskListRef}>
                            {/* Task list */}
                            <div className="space-y-1">
                                {tasks.map((task, index) => (
                                    <div
                                        key={task.id}
                                        className={`group relative flex flex-col gap-1 py-1 rounded px-1 -mx-1 ${
                                            activeStyleTargetId === task.id ? 'bg-blue-50' : 'hover:bg-gray-50'
                                        }`}
                                        style={{ marginLeft: `${(task.indentLevel || 0) * 24}px` }}
                                        onMouseEnter={() => setHoveredTaskId(task.id)}
                                        onMouseLeave={() => setHoveredTaskId(null)}
                                        tabIndex={0}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Tab') {
                                                e.preventDefault();
                                                const currentIndent = task.indentLevel || 0;
                                                if (e.shiftKey) {
                                                    // Shift+Tab: decrease indent (cycle backwards: 0 -> 2 -> 1 -> 0)
                                                    const nextIndent = currentIndent === 0 ? 2 : currentIndent - 1;
                                                    updateTask(task.id, { indentLevel: nextIndent });
                                                } else {
                                                    // Tab: increase indent (cycle: 0 -> 1 -> 2 -> 0)
                                                    const nextIndent = (currentIndent + 1) % 3;
                                                    updateTask(task.id, { indentLevel: nextIndent });
                                                }
                                            }
                                        }}
                                    >
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                checked={task.completed}
                                                onChange={() => toggleTask(task.id)}
                                                className="w-4 h-4 flex-shrink-0 accent-blue-500 rounded border-gray-300"
                                            />
                                            <span
                                                onMouseDown={() => setActiveStyleTargetId(task.id)}
                                                className={`text-sm flex-1 break-words cursor-text rounded ${task.completed ? 'line-through text-gray-400' : 'text-gray-800'} ${
                                                    activeStyleTargetId === task.id ? 'ring-1 ring-blue-400' : ''
                                                }`}
                                                style={task.completed ? undefined : resolveCaptionStyle(task)}
                                            >
                                                {task.text}
                                            </span>

                                            {/* Action buttons (Indent / Delete / Move) */}
                                            <div className={`flex items-center gap-1 ${hoveredTaskId === task.id ? 'opacity-100' : 'opacity-0'} transition-opacity`}>
                                                {/* Indent/Outdent buttons */}
                                                <div className="flex items-center">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const currentIndent = task.indentLevel || 0;
                                                            const nextIndent = currentIndent === 0 ? 0 : currentIndent - 1;
                                                            updateTask(task.id, { indentLevel: nextIndent });
                                                        }}
                                                        disabled={(task.indentLevel || 0) === 0}
                                                        className={`p-0.5 ${(task.indentLevel || 0) === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-blue-500'}`}
                                                        title="Outdent (Shift+Tab)"
                                                    >
                                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M6 1L2 4L6 7" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const currentIndent = task.indentLevel || 0;
                                                            const nextIndent = currentIndent >= 2 ? 2 : currentIndent + 1;
                                                            updateTask(task.id, { indentLevel: nextIndent });
                                                        }}
                                                        disabled={(task.indentLevel || 0) >= 2}
                                                        className={`p-0.5 ${(task.indentLevel || 0) >= 2 ? 'text-gray-200' : 'text-gray-400 hover:text-blue-500'}`}
                                                        title="Indent (Tab)"
                                                    >
                                                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M4 1L8 4L4 7" />
                                                        </svg>
                                                    </button>
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                                                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                                                    title="Delete"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                                <div className="flex flex-col">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveTask(task.id, 'up'); }}
                                                        disabled={index === 0}
                                                        className={`p-0.5 ${index === 0 ? 'text-gray-200' : 'text-gray-400 hover:text-blue-500'}`}
                                                        title="Move up"
                                                    >
                                                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M1 5L5 1L9 5" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); moveTask(task.id, 'down'); }}
                                                        disabled={index === tasks.length - 1}
                                                        className={`p-0.5 ${index === tasks.length - 1 ? 'text-gray-200' : 'text-gray-400 hover:text-blue-500'}`}
                                                        title="Move down"
                                                    >
                                                        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                                            <path d="M1 1L5 5L9 1" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Set due date button on hover (when no date set) */}
                                        {hoveredTaskId === task.id && !task.dueDate && (
                                            <div className="pl-6">
                                                <button
                                                    className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-100 transition-colors"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        openDatePicker(task.id, e);
                                                    }}
                                                >
                                                    Set due date
                                                </button>
                                            </div>
                                        )}

                                        {/* Due date display - styled like mockup with bell and red dot */}
                                        {task.dueDate && (() => {
                                            const dueDateTime = new Date(task.dueDate);
                                            const now = new Date();
                                            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                                            const dueDay = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());

                                            // Check if due today or past due (including time)
                                            const isToday = dueDay.getTime() === today.getTime();

                                            // For checking if overdue, we need to consider time too
                                            let isPastDue = false;
                                            if (dueDay < today) {
                                                isPastDue = true;
                                            } else if (isToday && task.dueTime) {
                                                // If due today, check if the time has passed
                                                const [dueHour, dueMin] = task.dueTime.split(':').map(Number);
                                                if (now.getHours() > dueHour || (now.getHours() === dueHour && now.getMinutes() > dueMin)) {
                                                    isPastDue = true;
                                                }
                                            }
                                            const showRedDot = isToday || isPastDue || (task.reminder && !task.completed);

                                            // Format the display text
                                            let displayText = '';
                                            if (isToday) {
                                                displayText = `Due today${task.dueTime ? ` (${task.dueTime})` : ''}`;
                                            } else if (isPastDue) {
                                                displayText = `Overdue${task.dueTime ? ` (${task.dueTime})` : ''}`;
                                            } else {
                                                displayText = `${dueDateTime.toLocaleDateString('de-DE', {
                                                    day: '2-digit',
                                                    month: '2-digit',
                                                    year: 'numeric'
                                                })}${task.dueTime ? ` / ${task.dueTime}` : ''}`;
                                            }

                                            return (
                                                <div className="pl-6 flex items-center gap-2 relative">
                                                    <button
                                                        onClick={(e) => openDatePicker(task.id, e)}
                                                        className={`text-[11px] flex items-center gap-1 ${isPastDue ? 'text-red-500' : isToday ? 'text-orange-500' : 'text-gray-500'
                                                            }`}
                                                    >
                                                        <Bell className="w-3 h-3" />
                                                        {displayText}
                                                    </button>
                                                    {/* Red dot indicator */}
                                                    {showRedDot && (
                                                        <div
                                                            className="w-2 h-2 rounded-full bg-red-500"
                                                            title={isPastDue ? 'Overdue' : isToday ? 'Due today' : 'Reminder set'}
                                                        />
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                ))}

                                {/* Add task input */}
                                <div className="flex items-center gap-2 py-1 mt-1">
                                    <div className="w-4 h-4 border border-gray-300 rounded flex-shrink-0" />
                                    <input
                                        type="text"
                                        value={newTaskText}
                                        onChange={(e) => setNewTaskText(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                addTask();
                                            }
                                        }}
                                        className="flex-1 text-sm bg-transparent outline-none text-gray-700 placeholder-gray-400"
                                        placeholder="Add a task..."
                                    />
                                </div>
                            </div>

                            {/* Reactions display */}
                            {reactions.length > 0 && (
                                <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
                                    {reactions.map((emoji, index) => (
                                        <span key={index} className="text-lg">{emoji}</span>
                                    ))}
                                </div>
                            )}
                        </div>

                            {/* Date Picker - same overlay treatment; kept in
                                its own relative wrapper since its Close
                                button is itself absolutely positioned
                                within it. */}
                            {showDatePicker && (
                                <div className="absolute left-full top-0 ml-3 z-[1100]">
                                    <div
                                        className="relative bg-white rounded-lg shadow-xl p-4 w-80 border border-gray-200"
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        {/* Close button */}
                                        <button
                                            onClick={() => saveDatePicker()}
                                            className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                                            title="Close"
                                        >
                                            <X className="h-3.5 w-3.5" />
                                        </button>

                                        {/* Calendar Header */}
                                        <div className="flex items-center justify-between mb-4">
                                            <button
                                                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))}
                                                className="p-1 hover:bg-gray-100 rounded"
                                            >
                                                <ChevronLeft className="w-5 h-5" />
                                            </button>
                                            <span className="font-medium capitalize">{formatMonth(viewMonth)}</span>
                                            <button
                                                onClick={() => setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))}
                                                className="p-1 hover:bg-gray-100 rounded"
                                            >
                                                <ChevronRight className="w-5 h-5" />
                                            </button>
                                        </div>

                                        {/* Weekday headers */}
                                        <div className="grid grid-cols-7 gap-1 mb-2">
                                            {['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((day, i) => (
                                                <div key={i} className="text-center text-xs text-gray-400 font-medium py-1">
                                                    {day}
                                                </div>
                                            ))}
                                        </div>

                                        {/* Calendar days */}
                                        <div className="grid grid-cols-7 gap-1 mb-4">
                                            {getDaysInMonth(viewMonth).map((date, i) => (
                                                <button
                                                    key={i}
                                                    disabled={!date}
                                                    onClick={() => date && setSelectedDate(date)}
                                                    className={`w-8 h-8 text-sm rounded flex items-center justify-center ${!date ? '' :
                                                        isSelected(date) ? 'bg-gray-800 text-white' :
                                                            isToday(date) ? 'border border-gray-800' :
                                                                'hover:bg-gray-100'
                                                        }`}
                                                >
                                                    {date?.getDate() || ''}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Due time */}
                                        <div className="border-t border-gray-100 pt-3 mb-3">
                                            <div className="flex items-center gap-2 mb-2">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                <span className="text-sm text-gray-500">Add due time...</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Clock className="w-4 h-4 text-gray-400" />
                                                <input
                                                    type="text"
                                                    value={dueTimeHour}
                                                    onChange={(e) => setDueTimeHour(e.target.value.replace(/\D/g, '').slice(0, 2))}
                                                    placeholder="00"
                                                    className="w-10 text-center border border-gray-200 rounded px-1 py-1 text-sm"
                                                    maxLength={2}
                                                />
                                                <span>:</span>
                                                <input
                                                    type="text"
                                                    value={dueTimeMinute}
                                                    onChange={(e) => setDueTimeMinute(e.target.value.replace(/\D/g, '').slice(0, 2))}
                                                    placeholder="00"
                                                    className="w-10 text-center border border-gray-200 rounded px-1 py-1 text-sm"
                                                    maxLength={2}
                                                />
                                                {(dueTimeHour || dueTimeMinute) && (
                                                    <button
                                                        onClick={clearDueTime}
                                                        className="text-xs text-blue-500 hover:underline ml-2"
                                                    >
                                                        Clear
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Reminder */}
                                        <div className="border-t border-gray-100 pt-3">
                                            <div className="flex items-center gap-2">
                                                <Bell className="w-4 h-4 text-gray-400" />
                                                <select
                                                    value={selectedReminder}
                                                    onChange={(e) => setSelectedReminder(e.target.value)}
                                                    className="flex-1 text-sm border border-gray-200 rounded px-2 py-1"
                                                >
                                                    {REMINDER_OPTIONS.map(opt => (
                                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                    </div>

                    {/* Text style / Color / Comment panels -- real flex
                        siblings of the toolbar/card row (same architecture
                        as Note/Document's shared panel slot), so a tall
                        panel grows the row and the outer items-center
                        recentres the whole row upward instead of the panel
                        running off the bottom of the screen. */}
                    {showTextStylePanel && (
                        <div
                            className="relative bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-64 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setShowTextStylePanel(false)}
                                className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                                title="Close"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2 truncate pr-4">
                                Editing: {activeTargetLabel}
                            </div>
                            <TextStylePopup
                                isOpen={true}
                                onOpenChange={(open) => setShowTextStylePanel(open)}
                                onSelectHeading={applyActiveTargetHeading}
                                onSelectColor={(color) => writeActiveTargetStyle({ color })}
                                onSelectHighlight={(color) => writeActiveTargetStyle({ backgroundColor: color })}
                                currentHeading={activeTargetStyle.heading || 'normal'}
                                currentColor={activeTargetStyle.color}
                                currentHighlight={activeTargetStyle.backgroundColor}
                                hideCloseButton
                                onBold={toggleActiveTargetBold}
                                onItalic={toggleActiveTargetItalic}
                                onUnderline={toggleActiveTargetUnderline}
                                onStrikethrough={toggleActiveTargetStrikethrough}
                                onAlign={cycleActiveTargetAlign}
                                isBold={isActiveTargetBold}
                                isItalic={isActiveTargetItalic}
                                isUnderline={!!activeTargetStyle.underline}
                                isStrikethrough={!!activeTargetStyle.strikethrough}
                            />
                        </div>
                    )}

                    {showColorPicker && (
                        <div
                            className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 w-64 flex-shrink-0"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">List Color</span>
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

                            <ColorPickerContent
                                color={activeTab === "background" ? cardColor : (topStrip || 'transparent')}
                                onChange={(c) => activeTab === "background" ? setCardColor(c) : setTopStrip(c)}
                                hasOpacity={true}
                                presets={activeTab === "background" ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
                            />
                        </div>
                    )}

                    {showCommentPopup && (
                        <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px] flex-shrink-0 animate-in fade-in slide-in-from-left-2 duration-200">
                            <button
                                onClick={() => {
                                    setShowCommentPopup(false);
                                    setActiveCommentId(null);
                                    setEditingCommentId(null);
                                    setEditingCommentText('');
                                    setCommentColorPopupId(null);
                                    setShowBadgeColorPicker(false);
                                }}
                                className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                                title="Close"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                            <div className="flex items-center justify-between mb-3">
                                <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
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
                                                        {getInitial(comment.userName)}
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs font-medium text-gray-700">{comment.userName || 'User'}</span>
                                                            <span className="text-[10px] text-gray-400">{getTimeAgo(comment.timestamp)}</span>
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
                                                                {renderTextWithLinks(comment.text)}
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
                                            <Trash2 className="w-3 h-3" />
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
                                                userId: 'user1',
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
                    )}
                </div>
            </div>

            {/* Share Modal */}
            <ShareModal
                isOpen={showShareModal}
                onClose={() => setShowShareModal(false)}
                padletId={padletId}
                boardId={boardId}
                itemTitle={todoTitle || 'To-Do List'}
            />
        </>
    );
}
