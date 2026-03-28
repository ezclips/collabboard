'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Palette, ArrowLeft, ArrowRight, Tag, MoreHorizontal, Trash2, Edit3, Type, PaintBucket, Layers, ArrowDown, ArrowUp, ArrowDownToLine, ArrowUpToLine } from 'lucide-react';
import * as Popover from '@radix-ui/react-popover';
import { ColorPickerContent } from './ColorPicker';
import type { CanvasLine } from '@/types/collabboard';

interface LineToolbarProps {
    line: CanvasLine;
    onUpdate: (updates: Partial<CanvasLine>) => void;
    onDelete: () => void;
    onClose: () => void;
    isEditMode: boolean;
    onToggleEditMode: () => void;
    onChangeLayer: (action: 'front' | 'back' | 'forward' | 'backward') => void;
}

const LINE_COLORS = [
    '#ffffff', '#fee2e2', '#ffedd5', '#fef3c7', '#dcfce7',
    '#dbeafe', '#e0e7ff', '#f3e8ff', '#fce7f3', '#ffe4e6',
    '#f87171', '#fb923c', '#fbbf24', '#34d399', '#60a5fa',
    '#818cf8', '#a78bfa', '#f472b6', '#fb7185', '#374151',
];

const STROKE_WIDTHS = [1, 2, 3, 4, 6];

export default function LineToolbar({
    line,
    onUpdate,
    onDelete,
    onClose,
    isEditMode,
    onToggleEditMode,
    onChangeLayer,
}: LineToolbarProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: 100, y: 200 });
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

    const [showColorPicker, setShowColorPicker] = useState(false);
    const [showWeightPicker, setShowWeightPicker] = useState(false);
    const [showLayerPicker, setShowLayerPicker] = useState(false);
    const [editingLabel, setEditingLabel] = useState(false);
    const [labelText, setLabelText] = useState(line.label || '');

    // Sync labelText when line changes or editing starts
    React.useEffect(() => {
        setLabelText(line.label || '');
    }, [line.label, editingLabel]);

    // Label specific pickers
    const [showLabelTextPicker, setShowLabelTextPicker] = useState(false);
    const [showLabelBgPicker, setShowLabelBgPicker] = useState(false);

    // Auto-resize textarea
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    React.useEffect(() => {
        if (editingLabel && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [labelText, editingLabel]);

    const toolbarRef = useRef<HTMLDivElement>(null);

    // Handle drag start
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest('button') ||
            (e.target as HTMLElement).closest('input')) return;

        setIsDragging(true);
        setDragOffset({
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        });
    }, [position]);

    // Handle drag move
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - dragOffset.x,
            y: e.clientY - dragOffset.y,
        });
    }, [isDragging, dragOffset]);

    // Handle drag end
    const handleMouseUp = useCallback(() => {
        setIsDragging(false);
    }, []);

    // Add/remove global listeners
    React.useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, handleMouseMove, handleMouseUp]);

    // Save label on blur or enter
    const handleLabelSave = () => {
        onUpdate({ label: labelText || undefined });
        setEditingLabel(false);
    };

    return (
        <div
            ref={toolbarRef}
            className="fixed bg-white rounded-lg shadow-xl border border-gray-200 z-[2500] select-none"
            style={{
                left: position.x,
                top: position.y,
                cursor: isDragging ? 'grabbing' : 'grab',
                pointerEvents: 'auto',
            }}
            onMouseDown={handleMouseDown}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-2 flex flex-col gap-1">
                {/* Color */}
                <Popover.Root
                    open={showColorPicker}
                    onOpenChange={(open) => {
                        if (open) {
                            setShowWeightPicker(false);
                            setEditingLabel(false);
                        }
                        setShowColorPicker(open);
                    }}
                >
                    <Popover.Trigger asChild>
                        <button
                            className="w-9 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                            title="Color"
                        >
                            <Palette className="w-5 h-5 text-gray-600" />
                        </button>
                    </Popover.Trigger>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Color</span>

                    <Popover.Portal>
                        <Popover.Content
                            className="z-[250] w-64 p-3 bg-white rounded-xl shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-200"
                            side="right"
                            sideOffset={10}
                        >
                            <ColorPickerContent
                                color={line.color}
                                onChange={(c) => onUpdate({ color: c })}
                                hasOpacity={true}
                            />
                            <Popover.Arrow className="fill-white" />
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                {/* Start Arrow */}
                <div>
                    <button
                        onClick={() => {
                            setEditingLabel(false);
                            onUpdate({ start_arrow: !line.start_arrow });
                        }}
                        className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-colors ${line.start_arrow
                            ? 'bg-gray-100 border-gray-300 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        title="Start Arrow"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Start</span>
                </div>

                {/* End Arrow */}
                <div>
                    <button
                        onClick={() => {
                            setEditingLabel(false);
                            onUpdate({ end_arrow: !line.end_arrow });
                        }}
                        className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-colors ${line.end_arrow
                            ? 'bg-gray-100 border-gray-300 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        title="End Arrow"
                    >
                        <ArrowRight className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">End</span>
                </div>

                {/* Label */}
                <div className="relative">
                    <button
                        onClick={() => {
                            const newState = !editingLabel;
                            if (newState) {
                                setShowColorPicker(false);
                                setShowWeightPicker(false);
                            }
                            setEditingLabel(newState);
                        }}
                        className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-colors ${line.label
                            ? 'bg-gray-100 border-gray-300 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        title="Add Label"
                    >
                        <Tag className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Label</span>

                    {/* Label editing popup - appears to the right */}
                    {editingLabel && (
                        <div className="absolute left-full ml-2 top-0 bg-white rounded-lg shadow-lg border border-gray-200 p-2 z-50 flex flex-col gap-1 items-center">
                            <textarea
                                ref={textareaRef}
                                value={labelText}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setLabelText(val);

                                    // ✅ allow empty string = remove label
                                    // Treat empty string (after trim) as empty label.
                                    // Save raw value if user is typing (to allow spaces), but if it becomes empty string visually, clear it.
                                    // Actually user request: "const updates: Partial<CanvasLine> = { label: val.trim() ? val : '' };"
                                    const updates: Partial<CanvasLine> = { label: val.trim() ? val : '' };
                                    onUpdate(updates);
                                }}
                                onBlur={() => {
                                    // already saved on change
                                }}
                                onKeyDown={(e) => {
                                    e.stopPropagation(); // Prevent canvas hotkeys like Backspace/Delete
                                    if (e.key === 'Escape') {
                                        setEditingLabel(false);
                                    }
                                }}
                                className="w-32 min-h-[24px] text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-gray-400 resize-none overflow-hidden"
                                placeholder="Label..."
                                autoFocus
                                style={{ lineHeight: '1.2' }}
                            />

                            {/* Label Controls */}
                            <div className="flex gap-1 label-controls">
                                {/* Text Color */}
                                <Popover.Root>
                                    <Popover.Trigger asChild>
                                        <button
                                            className="w-7 h-7 bg-white border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                                            title="Text Color"
                                        >
                                            <Type
                                                className="w-3.5 h-3.5"
                                                style={{
                                                    color: line.label_text_color || '#374151',
                                                    filter: 'drop-shadow(0 0 1px rgba(0,0,0,0.5))'
                                                }}
                                            />
                                        </button>
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Content
                                            className="z-[250] w-64 p-3 bg-white rounded-xl shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-200"
                                            side="right"
                                            sideOffset={5}
                                        >
                                            <ColorPickerContent
                                                color={line.label_text_color || '#374151'}
                                                onChange={(c) => onUpdate({ label_text_color: c })}
                                                hasOpacity={true}
                                            />
                                            <Popover.Arrow className="fill-white" />
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover.Root>

                                {/* Bg Color */}
                                <Popover.Root>
                                    <Popover.Trigger asChild>
                                        <button
                                            className="w-7 h-7 bg-white border border-gray-200 rounded-md flex items-center justify-center hover:bg-gray-50 transition-colors"
                                            title="Background Color"
                                        >
                                            <div className="w-4 h-4 rounded-sm border border-gray-300" style={{ backgroundColor: line.label_background_color || '#ffffff' }} />
                                        </button>
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Content
                                            className="z-[250] w-64 p-3 bg-white rounded-xl shadow-2xl border border-gray-200 animate-in fade-in zoom-in duration-200"
                                            side="right"
                                            sideOffset={5}
                                        >
                                            <ColorPickerContent
                                                color={line.label_background_color || '#ffffff'}
                                                onChange={(c) => onUpdate({ label_background_color: c })}
                                                hasOpacity={true}
                                            />
                                            <Popover.Arrow className="fill-white" />
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover.Root>
                            </div>
                        </div>
                    )}
                </div>

                {/* Dashed */}
                <div>
                    <button
                        onClick={() => {
                            setEditingLabel(false);
                            onUpdate({ dashed: !line.dashed });
                        }}
                        className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-colors ${line.dashed
                            ? 'bg-gray-100 border-gray-300 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        title="Dashed Line"
                    >
                        {/* Dashed line icon */}
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M5 12h3M10 12h4M18 12h3" strokeLinecap="round" />
                        </svg>
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Dashed</span>
                </div>

                {/* Weight */}
                <Popover.Root
                    open={showWeightPicker}
                    onOpenChange={(open) => {
                        if (open) {
                            setShowColorPicker(false);
                            setEditingLabel(false);
                        }
                        setShowWeightPicker(open);
                    }}
                >
                    <Popover.Trigger asChild>
                        <button
                            className="w-9 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                            title="Line Weight"
                        >
                            <MoreHorizontal className="w-5 h-5 text-gray-600" />
                        </button>
                    </Popover.Trigger>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Weight</span>

                    <Popover.Portal>
                        <Popover.Content
                            className="z-[250] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 animate-in fade-in zoom-in duration-200"
                            side="right"
                            sideOffset={10}
                        >
                            <div className="flex flex-col gap-1">
                                {STROKE_WIDTHS.map((weight) => (
                                    <button
                                        key={weight}
                                        onClick={() => {
                                            onUpdate({ stroke_width: weight });
                                            setShowWeightPicker(false);
                                        }}
                                        className={`px-3 py-1 rounded flex items-center gap-2 hover:bg-gray-100 ${line.stroke_width === weight ? 'bg-gray-200 font-medium' : ''
                                            }`}
                                    >
                                        <div
                                            className="w-12 rounded-full"
                                            style={{
                                                height: weight,
                                                backgroundColor: line.color
                                            }}
                                        />
                                        <span className="text-xs text-gray-600">{weight}px</span>
                                    </button>
                                ))}
                            </div>
                            <Popover.Arrow className="fill-white" />
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                {/* Layer Control */}
                <Popover.Root
                    open={showLayerPicker}
                    onOpenChange={(open) => {
                        if (open) {
                            setShowColorPicker(false);
                            setShowWeightPicker(false);
                            setEditingLabel(false);
                        }
                        setShowLayerPicker(open);
                    }}
                >
                    <Popover.Trigger asChild>
                        <button
                            className="w-9 h-9 bg-white border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors"
                            title="Layers"
                        >
                            <Layers className="w-5 h-5 text-gray-600" />
                        </button>
                    </Popover.Trigger>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Layers</span>

                    <Popover.Portal>
                        <Popover.Content
                            className="z-[250] bg-white rounded-xl shadow-2xl border border-gray-200 p-2 animate-in fade-in slide-in-from-left-2 duration-200"
                            side="right"
                            sideOffset={10}
                        >
                            <div className="flex gap-2">
                                <button
                                    onClick={() => onChangeLayer('back')}
                                    className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600"
                                    title="Send to Back"
                                >
                                    <ArrowDownToLine className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => onChangeLayer('backward')}
                                    className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600"
                                    title="Move Backward"
                                >
                                    <ArrowDown className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => onChangeLayer('forward')}
                                    className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600"
                                    title="Move Forward"
                                >
                                    <ArrowUp className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => onChangeLayer('front')}
                                    className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-600"
                                    title="Bring to Front"
                                >
                                    <ArrowUpToLine className="w-4 h-4" />
                                </button>
                            </div>
                            <Popover.Arrow className="fill-white" />
                        </Popover.Content>
                    </Popover.Portal>
                </Popover.Root>

                {/* Edit Points */}
                <div>
                    <button
                        onClick={() => {
                            setEditingLabel(false);
                            onToggleEditMode();
                        }}
                        className={`w-9 h-9 border rounded-lg flex items-center justify-center transition-colors ${isEditMode
                            ? 'bg-gray-100 border-gray-300 text-gray-900'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                        title="Edit Points"
                    >
                        <Edit3 className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Edit</span>
                </div>


                {/* Delete */}
                <div>
                    <button
                        onClick={onDelete}
                        className="w-9 h-9 border border-gray-200 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-50 transition-colors"
                        title="Delete Line"
                    >
                        <Trash2 className="w-5 h-5" />
                    </button>
                    <span className="text-[9px] text-gray-500 text-center w-full block mt-0.5">Delete</span>
                </div>
            </div>
        </div>
    );
}
