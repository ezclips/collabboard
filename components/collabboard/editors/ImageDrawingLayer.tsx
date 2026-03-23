"use client";

import React, { useRef, useState, useCallback } from 'react';
import {
    Pencil,
    Eraser,
    Undo2,
    Redo2,
    Square,
    PenTool,
    Move,
    Trash2,
    PaintBucket,
    Maximize,
    Type,
    ChevronDown
} from 'lucide-react';
import { ReactSketchCanvas, ReactSketchCanvasRef } from 'react-sketch-canvas';
import { DrawingColorPopup, DrawingStylePopup } from './DrawingPopups';
import * as Popover from '@radix-ui/react-popover';

interface ImageDrawingLayerProps {
    imageUrl: string;
    initialDrawing?: string;
    initialPaths?: any[];
    initialTextElements?: TextElement[];
    onSave: (drawingDataUrl: string, paths: any[], textElements: TextElement[]) => void;
    onCancel: () => void;
    onChangeColor?: () => void;
    onCaption?: () => void;
    onEditImage?: () => void;
    onDelete?: () => void;
    onAddReaction?: () => void;
}

// Text element type
interface TextElement {
    id: string;
    x: number;
    y: number;
    content: string;
    fontSize: number;
    color: string;
    borderColor?: string;
    bgOpacity?: number;
}

interface CompletedRect {
    x1: number; y1: number; x2: number; y2: number;
    color: string; strokeWidth: number;
    path: string; // pre-computed hand-drawn SVG path
}

// Generate a slightly wobbly closed rect path to simulate a hand-drawn look.
// Each corner gets a small random offset so it looks naturally imperfect.
function makeWobblyRectPath(
    x1: number, y1: number, x2: number, y2: number, sw: number
): string {
    const jitter = () => (Math.random() - 0.5) * sw * 0.9;
    // corners with tiny random offsets
    const corners = [
        [x1 + jitter(), y1 + jitter()],
        [x2 + jitter(), y1 + jitter()],
        [x2 + jitter(), y2 + jitter()],
        [x1 + jitter(), y2 + jitter()],
    ];
    // close back to start with a slight overshoot for the marker-like look
    return (
        `M ${corners[0][0]} ${corners[0][1]} ` +
        `L ${corners[1][0]} ${corners[1][1]} ` +
        `L ${corners[2][0]} ${corners[2][1]} ` +
        `L ${corners[3][0]} ${corners[3][1]} ` +
        `L ${corners[0][0] + jitter()} ${corners[0][1] + jitter()} Z`
    );
}

// Text style presets
const TEXT_SIZES = [
    { label: 'Small', size: 14 },
    { label: 'Normal', size: 18 },
    { label: 'Medium', size: 24 },
    { label: 'Large', size: 32 },
    { label: 'Huge', size: 48 },
];

const TEXT_COLORS = ['#ffffff', '#000000', '#ef4444', '#22c55e', '#3b82f6', '#f97316', '#a855f7', '#facc15'];

export default function ImageDrawingLayer({
    imageUrl,
    initialDrawing,
    initialPaths,
    initialTextElements,
    onSave,
    onCancel,
}: ImageDrawingLayerProps) {
    const canvasRef = useRef<ReactSketchCanvasRef>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [tool, setTool] = useState<'pencil' | 'eraser' | 'highlighter' | 'text' | 'square'>('pencil');
    const [color, setColor] = useState('#ffffff');
    const [strokeWidth, setStrokeWidth] = useState(5);

    // Shape drawing state
    const [isDrawingShape, setIsDrawingShape] = useState(false);
    const [shapeStart, setShapeStart] = useState<{ x: number, y: number } | null>(null);
    const [shapeCurrent, setShapeCurrent] = useState<{ x: number, y: number } | null>(null);

    // Completed rectangles — rendered via native SVG (no react-sketch-canvas async lag)
    const [completedRects, setCompletedRects] = useState<CompletedRect[]>([]);
    // Unified action history for correct undo ordering across rects and strokes
    const [actionHistory, setActionHistory] = useState<Array<'stroke' | 'rect'>>([]);
    const lastPathCountRef = useRef<number>(initialPaths?.length ?? 0);

    // Text tool state
    const [textElements, setTextElements] = useState<TextElement[]>(initialTextElements || []);
    const [editingTextId, setEditingTextId] = useState<string | null>(null);
    const [textFontSize, setTextFontSize] = useState(24);
    const [textColor, setTextColor] = useState('#ffffff');
    const [textBorderColor, setTextBorderColor] = useState<string | undefined>(undefined);
    const [textBgOpacity, setTextBgOpacity] = useState(40);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const [dragOffset, setDragOffset] = useState<{ x: number, y: number } | null>(null);

    // Load initial paths on mount
    React.useEffect(() => {
        if (initialPaths && initialPaths.length > 0) {
            let attempts = 0;
            const maxAttempts = 10;

            const loadPaths = () => {
                if (canvasRef.current) {
                    canvasRef.current.loadPaths(initialPaths);
                } else if (attempts < maxAttempts) {
                    attempts++;
                    setTimeout(loadPaths, 100);
                }
            };

            // Initial delay to let canvas mount
            setTimeout(loadPaths, 100);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only on mount

    // Effect to handle window mouse move/up for dragging
    React.useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingId || !containerRef.current || !dragOffset) return;

            const rect = containerRef.current.getBoundingClientRect();
            // Calculate mouse position relative to image container
            let nextX = e.clientX - rect.left - dragOffset.x;
            let nextY = e.clientY - rect.top - dragOffset.y;

            // Simple clamping to container bounds
            const maxX = rect.width;
            const maxY = rect.height;

            nextX = Math.max(0, Math.min(nextX, maxX - 50)); // Keep some width visible
            nextY = Math.max(0, Math.min(nextY, maxY - 30)); // Keep some height visible

            setTextElements(prev => prev.map(t =>
                t.id === draggingId ? { ...t, x: nextX, y: nextY } : t
            ));
        };

        const handleMouseUp = () => {
            if (draggingId) setDraggingId(null);
        };

        if (draggingId) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggingId, dragOffset]);

    const measureTextBox = useCallback((content: string, fontSize: number) => {
        if (!measureCanvasRef.current) {
            measureCanvasRef.current = document.createElement('canvas');
        }
        const ctx = measureCanvasRef.current.getContext('2d');
        const safeContent = content && content.length > 0 ? content : ' ';
        const lines = safeContent.split('\n');
        const padding = 12;
        const lineHeight = fontSize * 1.2;
        let maxWidth = 0;

        if (ctx) {
            ctx.font = `600 ${fontSize}px "Inter", sans-serif`;
            lines.forEach((line) => {
                const width = ctx.measureText(line.length > 0 ? line : ' ').width;
                if (width > maxWidth) maxWidth = width;
            });
        }

        const boxWidth = Math.max(50, maxWidth + (padding * 2));
        const boxHeight = Math.max((lineHeight + (padding * 2)), (lines.length * lineHeight) + (padding * 2));
        return { lines, padding, lineHeight, boxWidth, boxHeight };
    }, []);

    const handleSave = async () => {
        if (canvasRef.current) {
            // Export just the strokes (no background)
            const strokesDataUrl = await canvasRef.current.exportImage('png');

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            // First, load and draw the original image
            const originalImg = new Image();
            originalImg.crossOrigin = 'anonymous';
            originalImg.src = imageUrl;
            await new Promise((resolve, reject) => {
                originalImg.onload = resolve;
                originalImg.onerror = reject;
            });

            canvas.width = originalImg.width;
            canvas.height = originalImg.height;
            ctx.drawImage(originalImg, 0, 0);

            // Then, draw the strokes on top
            const strokesImg = new Image();
            strokesImg.src = strokesDataUrl;
            await new Promise((resolve) => { strokesImg.onload = resolve; });
            ctx.drawImage(strokesImg, 0, 0, canvas.width, canvas.height);

            // Draw completed rectangles scaled from display coords to actual image coords
            if (containerRef.current && completedRects.length > 0) {
                const scaleX = canvas.width / containerRef.current.clientWidth;
                const scaleY = canvas.height / containerRef.current.clientHeight;
                ctx.save();
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                completedRects.forEach(r => {
                    ctx.strokeStyle = r.color;
                    ctx.lineWidth = r.strokeWidth * ((scaleX + scaleY) / 2);
                    // Re-generate a wobbly path at full image resolution
                    const scaledPath = makeWobblyRectPath(
                        r.x1 * scaleX, r.y1 * scaleY,
                        r.x2 * scaleX, r.y2 * scaleY,
                        ctx.lineWidth
                    );
                    const p2d = new Path2D(scaledPath);
                    ctx.stroke(p2d);
                });
                ctx.restore();
            }

            // Draw Text Elements (map display coordinates to original image pixels)
            const textScaleX = containerRef.current ? (canvas.width / containerRef.current.clientWidth) : 1;
            const textScaleY = containerRef.current ? (canvas.height / containerRef.current.clientHeight) : 1;
            textElements.forEach(text => {
                const measured = measureTextBox(text.content, text.fontSize);
                const x = text.x * textScaleX;
                const y = text.y * textScaleY;
                const boxWidth = measured.boxWidth * textScaleX;
                const boxHeight = measured.boxHeight * textScaleY;
                const paddingX = measured.padding * textScaleX;
                const paddingY = measured.padding * textScaleY;
                const lineHeight = measured.lineHeight * textScaleY;
                const radius = 8 * ((textScaleX + textScaleY) / 2);
                const borderWidth = 2 * ((textScaleX + textScaleY) / 2);
                const scaledFontSize = text.fontSize * ((textScaleX + textScaleY) / 2);

                ctx.font = `600 ${scaledFontSize}px "Inter", sans-serif`;

                // Draw Box
                if (text.bgOpacity !== undefined && text.bgOpacity > 0) {
                    ctx.fillStyle = `rgba(0, 0, 0, ${text.bgOpacity / 100})`;
                    ctx.beginPath();
                    ctx.roundRect(x, y, boxWidth, boxHeight, radius);
                    ctx.fill();
                }

                if (text.borderColor && text.borderColor !== 'transparent') {
                    ctx.strokeStyle = text.borderColor;
                    ctx.lineWidth = borderWidth;
                    ctx.beginPath();
                    ctx.roundRect(x, y, boxWidth, boxHeight, radius);
                    ctx.stroke();
                }

                ctx.fillStyle = text.color;
                ctx.textBaseline = 'top';

                measured.lines.forEach((line, index) => {
                    ctx.fillText(line, x + paddingX, y + paddingY + (index * lineHeight));
                });
            });

            const paths = await canvasRef.current.exportPaths();
            onSave(canvas.toDataURL(), paths, textElements);
        }
    };

    const handleUndo = useCallback(() => {
        const last = actionHistory[actionHistory.length - 1];
        setActionHistory(prev => prev.slice(0, -1));
        if (last === 'rect') {
            setCompletedRects(prev => prev.slice(0, -1));
        } else {
            canvasRef.current?.undo();
        }
    }, [actionHistory]);

    const handleToolSelect = useCallback((selectedTool: 'pencil' | 'eraser' | 'highlighter' | 'text' | 'square') => {
        setTool(selectedTool);
        if (selectedTool === 'eraser') {
            canvasRef.current?.eraseMode(true);
        } else {
            canvasRef.current?.eraseMode(false);
        }
    }, []);

    const getRelativePoint = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    }, []);

    // Handle click on canvas for text placement or deselection
    const handleCanvasClick = (e: React.MouseEvent) => {
        if (tool !== 'text') return;

        // If clicking on the overlay (not a text box), deselect current text
        if (editingTextId) {
            setEditingTextId(null);
            // Don't create new text if we just clicked to deselect
            return;
        }

        // Only create new text if we are strictly clicking the empty canvas overlay
        if (e.target !== e.currentTarget) return;

        const newId = Date.now().toString();
        const x = e.nativeEvent.offsetX;
        const y = e.nativeEvent.offsetY;

        setTextElements(prev => [...prev, {
            id: newId,
            x,
            y,
            content: '',
            fontSize: textFontSize,
            color: textColor,
            borderColor: textBorderColor,
            bgOpacity: textBgOpacity
        }]);
        setEditingTextId(newId);
    };

    // Shape Drawing Handlers
    const handleShapePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        if (tool !== 'square' || !containerRef.current) return;
        const pt = getRelativePoint(e);
        e.currentTarget.setPointerCapture(e.pointerId);
        setShapeStart(pt);
        setShapeCurrent(pt);
        setIsDrawingShape(true);
    };

    const handleShapePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!isDrawingShape) return;
        setShapeCurrent(getRelativePoint(e));
    };

    const handleShapePointerUp = () => {
        if (!isDrawingShape || !shapeStart || !shapeCurrent) return;
        setIsDrawingShape(false);

        const x1 = Math.min(shapeStart.x, shapeCurrent.x);
        const y1 = Math.min(shapeStart.y, shapeCurrent.y);
        const x2 = Math.max(shapeStart.x, shapeCurrent.x);
        const y2 = Math.max(shapeStart.y, shapeCurrent.y);

        // Only record if the rectangle has meaningful size
        if (x2 - x1 > 2 && y2 - y1 > 2) {
            const path = makeWobblyRectPath(x1, y1, x2, y2, strokeWidth);
            setCompletedRects(prev => [...prev, { x1, y1, x2, y2, color, strokeWidth, path }]);
            setActionHistory(prev => [...prev, 'rect']);
        }

        setShapeStart(null);
        setShapeCurrent(null);
    };

    // Get currently editing text element
    const editingText = textElements.find(t => t.id === editingTextId);

    // Helper to auto-resize textarea
    const adjustTextareaHeight = (element: HTMLTextAreaElement) => {
        element.style.height = 'auto';
        element.style.height = `${element.scrollHeight}px`;
    };

    return (
        <div
            className="fixed inset-0 z-[200] bg-black flex overflow-hidden animate-in fade-in duration-300"
            onMouseDown={(e) => {
                // Global click handler to handle deselection if clicking outside everything
                // e.stopPropagation() is already on the root div, so this captures clicks inside the modal
                // We only deselect if the click target is the backdrop or something unrelated
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex-1 flex flex-col min-w-0">
                <div className="flex-1 flex items-center justify-center p-4 relative">
                    <div
                        ref={containerRef}
                        className="relative"
                        style={{ maxWidth: '90vw', maxHeight: 'calc(100vh - 150px)' }}
                    >
                        <img
                            src={imageUrl}
                            alt="Drawing background"
                            className="block w-full h-auto object-contain"
                            style={{ maxWidth: '90vw', maxHeight: 'calc(100vh - 150px)' }}
                            draggable={false}
                        />

                        {/* Canvas Overlay for Drawing */}
                        <div className="absolute inset-0 pointer-events-auto">
                            <ReactSketchCanvas
                                ref={canvasRef}
                                className="!w-full !h-full"
                                strokeColor={tool === 'highlighter' ? color + '80' : color}
                                strokeWidth={tool === 'highlighter' ? strokeWidth * 2 : strokeWidth}
                                eraserWidth={strokeWidth * 3}
                                canvasColor="transparent"
                                exportWithBackgroundImage={false}
                                onChange={(paths) => {
                                    if (paths.length > lastPathCountRef.current) {
                                        setActionHistory(prev => [...prev, 'stroke']);
                                    }
                                    lastPathCountRef.current = paths.length;
                                }}
                                style={{
                                    backgroundColor: 'transparent',
                                    cursor: tool === 'text' ? 'text' : 'crosshair',
                                    touchAction: 'none',
                                    pointerEvents: tool === 'text' ? 'none' : 'auto'
                                }}
                            />
                        </div>

                        {/* Permanent rectangle layer — native SVG, renders instantly with hand-drawn style */}
                        {completedRects.length > 0 && (
                            <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" overflow="visible">
                                {completedRects.map((r, i) => (
                                    <path
                                        key={i}
                                        d={r.path}
                                        fill="none"
                                        stroke={r.color}
                                        strokeWidth={r.strokeWidth}
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />
                                ))}
                            </svg>
                        )}

                        {/* Square Tool Overlay */}
                        {tool === 'square' && (
                            <div
                                className="absolute inset-0 z-50 cursor-crosshair touch-none"
                                onPointerDown={handleShapePointerDown}
                                onPointerMove={handleShapePointerMove}
                                onPointerUp={handleShapePointerUp}
                                onPointerCancel={handleShapePointerUp}
                                onPointerLeave={handleShapePointerUp}
                            >
                                {isDrawingShape && shapeStart && shapeCurrent && (
                                    <svg className="absolute inset-0 w-full h-full pointer-events-none">
                                        <rect
                                            x={Math.min(shapeStart.x, shapeCurrent.x)}
                                            y={Math.min(shapeStart.y, shapeCurrent.y)}
                                            width={Math.abs(shapeCurrent.x - shapeStart.x)}
                                            height={Math.abs(shapeCurrent.y - shapeStart.y)}
                                            fill="none"
                                            stroke={color}
                                            strokeWidth={strokeWidth}
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeDasharray={`${strokeWidth * 2} ${strokeWidth}`}
                                            opacity={0.7}
                                        />
                                    </svg>
                                )}
                            </div>
                        )}

                        {/* Text Tool Overlay - Click to Add Text OR Deselect */}
                        {tool === 'text' && (
                            <div
                                className="absolute inset-0 z-50 cursor-text touch-none"
                                onClick={handleCanvasClick}
                            />
                        )}

                        {/* Text Elements Layer - Above overlay */}
                        <div className="absolute inset-0 z-[60] pointer-events-none">
                            {textElements.map(el => {
                                const measured = measureTextBox(el.content, el.fontSize);
                                const maxAllowedWidth = containerRef.current
                                    ? Math.max(80, containerRef.current.clientWidth - el.x - 20)
                                    : 400;
                                const editorWidth = Math.min(measured.boxWidth, maxAllowedWidth);
                                const editorHeight = measured.boxHeight;

                                return (
                                <div
                                    key={el.id}
                                    className={`absolute pointer-events-auto flex flex-col group ${draggingId === el.id ? 'opacity-70' : ''}`}
                                    style={{
                                        left: el.x,
                                        top: el.y,
                                        maxWidth: containerRef.current ? `${containerRef.current.clientWidth - el.x - 20}px` : '400px'
                                    }}
                                >
                                    {/* Action Group: Move & Delete */}
                                    <div
                                        className={`absolute -top-8 left-0 flex items-center gap-1 transition-opacity duration-200 ${editingTextId === el.id ? 'opacity-100 z-50' : 'opacity-0 group-hover:opacity-100'}`}
                                    >
                                        <div
                                            className="bg-black/60 backdrop-blur-md rounded-md px-1.5 py-1 cursor-move flex items-center gap-1 hover:bg-black/80 text-white"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setDraggingId(el.id);
                                                setDragOffset({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY - 32 });
                                                setEditingTextId(el.id);
                                            }}
                                            title="Move"
                                        >
                                            <Move className="w-3.5 h-3.5" />
                                        </div>
                                        <button
                                            className="bg-red-500/80 backdrop-blur-md rounded-md p-1 cursor-pointer hover:bg-red-600 text-white"
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                e.preventDefault();
                                                setTextElements(prev => prev.filter(t => t.id !== el.id));
                                                setEditingTextId(null);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    <textarea
                                        autoFocus={editingTextId === el.id}
                                        value={el.content}
                                        placeholder="Type here..."
                                        onChange={(e) => {
                                            setTextElements(prev => prev.map(t => t.id === el.id ? { ...t, content: e.target.value } : t));
                                            adjustTextareaHeight(e.target);
                                        }}
                                        onInput={(e) => adjustTextareaHeight(e.currentTarget)}
                                        onFocus={() => {
                                            setEditingTextId(el.id);
                                            requestAnimationFrame(() => {
                                                const target = document.getElementById(`textarea-${el.id}`) as HTMLTextAreaElement;
                                                if (target) adjustTextareaHeight(target);
                                            });
                                        }}
                                        id={`textarea-${el.id}`}
                                        className={`rounded-lg px-3 py-1.5 outline-none transition-all placeholder:text-white/40 shadow-xl overflow-hidden resize-none ${editingTextId === el.id ? 'ring-2 ring-blue-400/50' : 'hover:ring-1 hover:ring-white/30'}`}
                                        style={{
                                            color: el.color,
                                            // Dynamic Border
                                            border: (el.borderColor && el.borderColor !== 'transparent') ? `2px solid ${el.borderColor}` : '2px solid transparent',
                                            // Dynamic Background
                                            backgroundColor: `rgba(0, 0, 0, ${(el.bgOpacity ?? 40) / 100})`,
                                            fontSize: `${el.fontSize}px`,
                                            fontWeight: 600,
                                            textShadow: '0 1px 4px rgba(0,0,0,0.8)',
                                            width: `${editorWidth}px`,
                                            height: `${editorHeight}px`,
                                            minWidth: '50px',
                                            lineHeight: '1.2'
                                        }}
                                        rows={1}
                                    />
                                </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bottom Floating Drawing Toolbar */}
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[210] w-fit">
                    <div className="bg-white rounded-xl shadow-2xl p-1.5 flex items-center gap-1 border border-gray-200">
                        {/* Tool Group: Basic Tools */}
                        <div className="flex items-center gap-1.5 px-1.5 border-r border-gray-100">
                            <button
                                onClick={() => handleToolSelect('text')}
                                className={`p-2.5 rounded-xl transition-all ${tool === 'text' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'hover:bg-gray-50 text-gray-500'}`}
                                title="Add Text"
                            >
                                <Type className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => handleToolSelect('pencil')}
                                className={`p-2.5 rounded-xl transition-all ${tool === 'pencil' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'hover:bg-gray-50 text-gray-500'}`}
                                title="Pencil"
                            >
                                <Pencil className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => handleToolSelect('highlighter')}
                                className={`p-2.5 rounded-xl transition-all ${tool === 'highlighter' ? 'bg-orange-50 text-orange-600 shadow-sm' : 'hover:bg-gray-50 text-orange-400'}`}
                                title="Highlighter"
                            >
                                <PenTool className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => handleToolSelect('eraser')}
                                className={`p-2.5 rounded-xl transition-all ${tool === 'eraser' ? 'bg-gray-100 text-red-600 shadow-sm' : 'hover:bg-gray-50 text-gray-500'}`}
                                title="Eraser"
                            >
                                <Eraser className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Text Tool Specific Controls */}
                        {tool === 'text' && (
                            <div className="flex items-center gap-1.5 px-2 border-r border-gray-100">
                                {/* Font Size Selector */}
                                <Popover.Root>
                                    <Popover.Trigger asChild onMouseDown={(e) => e.preventDefault()}>
                                        <button className="px-3 py-1.5 rounded-lg hover:bg-gray-50 text-gray-700 text-sm font-medium flex items-center gap-1 border border-gray-200" title="Font Size">
                                            {TEXT_SIZES.find(s => s.size === textFontSize)?.label || 'Medium'}
                                            <ChevronDown className="w-4 h-4" />
                                        </button>
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Content
                                            className="z-[220] bg-white rounded-xl shadow-2xl border border-gray-200 p-1 animate-in fade-in zoom-in duration-200"
                                            sideOffset={5}
                                            onOpenAutoFocus={(e) => e.preventDefault()} // Prevent stealing focus
                                        >
                                            <div className="flex flex-col">
                                                {TEXT_SIZES.map(size => (
                                                    <button
                                                        key={size.size}
                                                        onClick={() => {
                                                            setTextFontSize(size.size);
                                                            // Update currently editing text
                                                            if (editingTextId) {
                                                                setTextElements(prev => prev.map(t =>
                                                                    t.id === editingTextId ? { ...t, fontSize: size.size } : t
                                                                ));
                                                            }
                                                        }}
                                                        className={`px-4 py-2 text-left rounded-lg transition-colors ${textFontSize === size.size ? 'bg-blue-50 text-blue-600' : 'hover:bg-gray-50 text-gray-700'}`}
                                                    >
                                                        <span style={{ fontSize: Math.min(size.size, 20) }}>{size.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover.Root>

                                {/* Text Color Selector */}
                                <Popover.Root>
                                    <Popover.Trigger asChild onMouseDown={(e) => e.preventDefault()}>
                                        <button className="p-2 rounded-lg hover:bg-gray-50 border border-gray-200" title="Text Color">
                                            <div
                                                className="w-5 h-5 rounded border border-gray-300 flex items-center justify-center text-[10px] font-bold"
                                                style={{ backgroundColor: textColor, color: textColor === '#ffffff' || textColor === '#facc15' ? '#000' : '#fff' }}
                                            >
                                                A
                                            </div>
                                        </button>
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Content
                                            className="z-[220] bg-white rounded-xl shadow-2xl border border-gray-200 p-3 animate-in fade-in zoom-in duration-200"
                                            sideOffset={5}
                                            onOpenAutoFocus={(e) => e.preventDefault()}
                                        >
                                            <div className="grid grid-cols-4 gap-2">
                                                {TEXT_COLORS.map(c => (
                                                    <button
                                                        key={c}
                                                        onClick={() => {
                                                            setTextColor(c);
                                                            if (editingTextId) {
                                                                setTextElements(prev => prev.map(t =>
                                                                    t.id === editingTextId ? { ...t, color: c } : t
                                                                ));
                                                            }
                                                        }}
                                                        className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center ${textColor === c ? 'border-blue-500 scale-110' : 'border-gray-200 hover:border-gray-400'}`}
                                                        style={{ backgroundColor: c }}
                                                    >
                                                        <span style={{ color: c === '#ffffff' || c === '#facc15' ? '#000' : '#fff' }} className="text-xs font-bold">A</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover.Root>

                                {/* Border Color Selector */}
                                <Popover.Root>
                                    <Popover.Trigger asChild onMouseDown={(e) => e.preventDefault()}>
                                        <button className="p-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 text-gray-700" title="Box Border Color">
                                            <div className={`w-4 h-4 rounded-sm border-2 ${textBorderColor ? '' : 'border-dashed border-gray-400'}`} style={{ borderColor: textBorderColor || 'currentColor' }} />
                                        </button>
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Content
                                            className="z-[220] bg-white rounded-xl shadow-2xl border border-gray-200 p-3 animate-in fade-in zoom-in duration-200"
                                            sideOffset={5}
                                            onOpenAutoFocus={(e) => e.preventDefault()}
                                        >
                                            <div className="flex flex-col gap-2">
                                                <button
                                                    onClick={() => {
                                                        setTextBorderColor(undefined);
                                                        if (editingTextId) {
                                                            setTextElements(prev => prev.map(t =>
                                                                t.id === editingTextId ? { ...t, borderColor: undefined } : t
                                                            ));
                                                        }
                                                    }}
                                                    className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${!textBorderColor ? 'bg-blue-50 border-blue-200 text-blue-600' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                                >
                                                    None
                                                </button>
                                                <div className="grid grid-cols-4 gap-2">
                                                    {TEXT_COLORS.map(c => (
                                                        <button
                                                            key={c}
                                                            onClick={() => {
                                                                setTextBorderColor(c);
                                                                if (editingTextId) {
                                                                    setTextElements(prev => prev.map(t =>
                                                                        t.id === editingTextId ? { ...t, borderColor: c } : t
                                                                    ));
                                                                }
                                                            }}
                                                            className={`w-8 h-8 rounded-lg border-2 transition-all flex items-center justify-center ${textBorderColor === c ? 'border-blue-500 scale-110' : 'border-gray-200 hover:border-gray-400'}`}
                                                            style={{ backgroundColor: c }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover.Root>

                                {/* Background Opacity Slider */}
                                <Popover.Root>
                                    <Popover.Trigger asChild onMouseDown={(e) => e.preventDefault()}>
                                        <button className="p-2.5 rounded-lg hover:bg-gray-50 border border-gray-200 text-gray-700" title="Background Opacity">
                                            <Maximize className="w-4 h-4 text-gray-600" />
                                        </button>
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Content
                                            className="z-[220] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 animate-in fade-in zoom-in duration-200 w-64"
                                            sideOffset={5}
                                            onOpenAutoFocus={(e) => e.preventDefault()}
                                        >
                                            <div className="flex flex-col gap-3">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="font-medium text-gray-700">Background Opacity</span>
                                                    <span className="text-gray-500">{textBgOpacity}%</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="10"
                                                    value={textBgOpacity}
                                                    onChange={(e) => {
                                                        const val = parseInt(e.target.value);
                                                        setTextBgOpacity(val);
                                                        if (editingTextId) {
                                                            setTextElements(prev => prev.map(t =>
                                                                t.id === editingTextId ? { ...t, bgOpacity: val } : t
                                                            ));
                                                        }
                                                    }}
                                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                />
                                            </div>
                                        </Popover.Content>
                                    </Popover.Portal>
                                </Popover.Root>
                            </div>
                        )}

                        {/* Tool Group: Styles & Shapes (for non-text tools) */}
                        {tool !== 'text' && (
                            <div className="flex items-center gap-1.5 px-2 border-r border-gray-100">
                                <button
                                    onClick={() => handleToolSelect('square')}
                                    className={`p-2.5 rounded-xl transition-all ${tool === 'square' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'hover:bg-gray-50 text-gray-500'}`}
                                    title="Square"
                                >
                                    <Square className="w-5 h-5" />
                                </button>
                                <DrawingStylePopup width={strokeWidth} onSelect={setStrokeWidth}>
                                    <button className="p-2.5 rounded-xl hover:bg-gray-50 text-gray-500" title="Brush Size">
                                        <div className="w-5 h-5 flex items-center justify-center">
                                            <div className="rounded-full bg-gray-600 transition-all" style={{ width: Math.max(4, Math.min(strokeWidth, 14)), height: Math.max(4, Math.min(strokeWidth, 14)) }} />
                                        </div>
                                    </button>
                                </DrawingStylePopup>
                                <DrawingColorPopup color={color} onSelect={setColor}>
                                    <button className="p-2.5 rounded-xl hover:bg-gray-50 group" title="Color">
                                        <div className="w-6 h-6 rounded-lg border border-gray-200 group-hover:rotate-12 transition-all shadow-sm" style={{ backgroundColor: color }} />
                                    </button>
                                </DrawingColorPopup>
                            </div>
                        )}

                        {/* Tool Group: History */}
                        <div className="flex items-center gap-1 px-1.5 border-r border-gray-100">
                            <button
                                onClick={handleUndo}
                                className="p-2.5 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors"
                                title="Undo"
                            >
                                <Undo2 className="w-5 h-5" />
                            </button>
                            <button
                                onClick={() => canvasRef.current?.redo()}
                                className="p-2.5 rounded-xl hover:bg-gray-50 text-gray-500 transition-colors"
                                title="Redo"
                            >
                                <Redo2 className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Action Group */}
                        <div className="flex items-center gap-2 pl-2 pr-1">
                            <button
                                onClick={onCancel}
                                className="px-4 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-5 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 text-sm font-bold shadow-sm transition-all hover:scale-105 active:scale-95"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
