'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { CanvasLine } from '@/types/collabboard';

interface SimpleLineRendererProps {
    lines: CanvasLine[];
    selectedLineId: string | null;
    onSelectLine: (lineId: string | null) => void;
    onUpdateLine: (lineId: string, updates: Partial<CanvasLine>) => void;
    onSaveLine: (lineId: string) => void;
    isLineMode: boolean;
    onCreateLine: (startX: number, startY: number, endX: number, endY: number) => void;
    isEditMode: boolean;
    onToggleEditMode: (lineId: string | null) => void;
    layer?: 'back' | 'front';
    draggingLineId?: string | null;
    onDragChange?: (lineId: string | null) => void;
    onContextMenu?: (lineId: string, x: number, y: number) => void;
    canvasZoom?: number;
    forcePointerEvents?: boolean;
}

// Catmull-Rom to Cubic Bezier conversion for smooth paths
function getCurvePath(points: Array<{ x: number; y: number; type: 'corner' | 'smooth' }>, tension: number = 0.5) {
    if (points.length < 2) return '';
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    let path = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(i - 1, 0)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(i + 2, points.length - 1)];

        // Always smooth Catmull-Rom -> Bezier
        // tension: 0..1, lower = tighter/less overshoot (0.5 is standard/good)
        const cp1x = p1.x + ((p2.x - p0.x) * tension) / 6;
        const cp1y = p1.y + ((p2.y - p0.y) * tension) / 6;
        const cp2x = p2.x - ((p3.x - p1.x) * tension) / 6;
        const cp2y = p2.y - ((p3.y - p1.y) * tension) / 6;

        path += ` C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${p2.x} ${p2.y}`;
    }
    return path;
}

// Helper to get distance between points
function getDist(p1: { x: number; y: number }, p2: { x: number; y: number }) {
    return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

// Calculate point on quadratic bezier curve at position t (0-1)
function getPointOnBezier(
    startX: number, startY: number,
    controlX: number, controlY: number,
    endX: number, endY: number,
    t: number
): { x: number; y: number } {
    const x = Math.pow(1 - t, 2) * startX + 2 * (1 - t) * t * controlX + Math.pow(t, 2) * endX;
    const y = Math.pow(1 - t, 2) * startY + 2 * (1 - t) * t * controlY + Math.pow(t, 2) * endY;
    return { x, y };
}

// Get point on multi-point path at t (0-1)
function getPointOnPath(line: CanvasLine, t: number) {
    // Clamp t
    t = Math.max(0, Math.min(1, t));

    if (line.points && line.points.length > 0) {
        if (line.points.length < 2) return { x: 0, y: 0 };

        // Total segments
        const segments = line.points.length - 1;
        // Which segment is t in?
        const segmentIndex = Math.min(Math.floor(t * segments), segments - 1);
        // t within that segment
        const segmentT = (t * segments) - segmentIndex;

        const p1 = line.points[segmentIndex];
        const p2 = line.points[segmentIndex + 1];

        // Linear interpolation for now (easiest to implement correctly without full spline re-calc)
        return {
            x: p1.x + (p2.x - p1.x) * segmentT,
            y: p1.y + (p2.y - p1.y) * segmentT
        };
    } else {
        // Legacy Bezier
        return getPointOnBezier(line.start_x, line.start_y, line.control_x, line.control_y, line.end_x, line.end_y, t);
    }
}

// Project point onto line to find closest t (0-1)
function getClosestT(line: CanvasLine, px: number, py: number): number {
    const points = line.points || [
        { x: line.start_x, y: line.start_y },
        { x: line.control_x, y: line.control_y }, // Approx for legacy
        { x: line.end_x, y: line.end_y }
    ];

    let minDst = Infinity;
    let closestT = 0.5;

    // Approximate by checking discrete steps
    const STEPS = 50;
    for (let i = 0; i <= STEPS; i++) {
        const t = i / STEPS;
        const pos = getPointOnPath(line, t);
        const dist = Math.sqrt(Math.pow(pos.x - px, 2) + Math.pow(pos.y - py, 2));
        if (dist < minDst) {
            minDst = dist;
            closestT = t;
        }
    }
    return closestT;
}

// Get bounding box for a line selection
function getBoundingBox(line: CanvasLine) {
    if (line.points && line.points.length > 0) {
        let minX = line.points[0].x, minY = line.points[0].y;
        let maxX = minX, maxY = minY;
        line.points.forEach(p => {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
        });
        return { x: minX - 10, y: minY - 10, width: maxX - minX + 20, height: maxY - minY + 20 };
    }
    // Legacy support
    const points = [
        { x: line.start_x, y: line.start_y },
        { x: line.control_x, y: line.control_y },
        { x: line.end_x, y: line.end_y }
    ];
    let minX = points[0].x, minY = points[0].y;
    let maxX = minX, maxY = minY;
    points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    });
    return { x: minX - 10, y: minY - 10, width: maxX - minX + 20, height: maxY - minY + 20 };
}

// Helper: calculate distance from point to line segment
function pointToSegmentDistance(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);

    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = Math.max(0, Math.min(1, t));
    const cx = x1 + tt * dx;
    const cy = y1 + tt * dy;
    return Math.hypot(px - cx, py - cy);
}

function SimpleLineRenderer({
    lines,
    selectedLineId,
    onSelectLine,
    onUpdateLine,
    onSaveLine,
    isLineMode,
    onCreateLine,
    isEditMode,
    onToggleEditMode,
    layer = 'front',
    onContextMenu,
    canvasZoom = 1,
    forcePointerEvents = false,
}: SimpleLineRendererProps) {
    const svgRef = useRef<SVGSVGElement>(null);

    // Refs to avoid useEffect re-runs during drag
    const linesRef = useRef(lines);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    // Keep linesRef in sync
    useEffect(() => { linesRef.current = lines; }, [lines]);

    const [draggingPoint, setDraggingPoint] = useState<{
        lineId: string;
        index?: number;
        point?: 'start' | 'control' | 'end' | 'label';
    } | null>(null);

    const [selectedPoint, setSelectedPoint] = useState<{
        lineId: string;
        index?: number;
    } | null>(null);
    // draggingLine now only stores lineId - offset is in ref
    const [draggingLine, setDraggingLine] = useState<{
        lineId: string;
    } | null>(null);

    const [drawing, setDrawing] = useState<{
        startX: number;
        startY: number;
        endX: number;
        endY: number;
    } | null>(null);

    const getMousePos = useCallback((e: React.MouseEvent | MouseEvent) => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / canvasZoom,
            y: (e.clientY - rect.top) / canvasZoom,
        };
    }, [canvasZoom]);

    const handlePointDragStart = (e: React.MouseEvent, lineId: string, index?: number, point?: any) => {
        e.preventDefault();
        e.stopPropagation();
        setDraggingPoint({ lineId, index, point });
        setSelectedPoint({ lineId, index }); // Select point on click/drag
        onSelectLine(lineId);
    };

    const handleMidpointDragStart = (e: React.MouseEvent, lineId: string, segmentIndex: number) => {
        e.preventDefault();
        e.stopPropagation();
        const line = lines.find(l => l.id === lineId);
        if (!line?.points || line.points.length < 2) return;
        const p1 = line.points[segmentIndex];
        const p2 = line.points[segmentIndex + 1];
        const newPoints = [...line.points];
        newPoints.splice(segmentIndex + 1, 0, { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, type: 'smooth' });
        const newIndex = segmentIndex + 1;
        onUpdateLine(lineId, { points: newPoints });
        onSelectLine(lineId);
        setSelectedPoint({ lineId, index: newIndex });
        setDraggingPoint({ lineId, index: newIndex });
    };

    const handleLineDragStart = (e: React.MouseEvent, lineId: string) => {
        if (e.button !== 0) return; // ignore right-click / middle-click
        // In Edit mode for this line, clicking the path should add a point, not drag
        if (isEditMode && selectedLineId === lineId) {
            e.stopPropagation();
            e.preventDefault();

            // Get the line and add a point
            const line = lines.find(l => l.id === lineId);
            if (!line) return;

            const pos = getMousePos(e);

            // If line has no points array (legacy format), create one from legacy from legacy coordinates
            let workingPoints = line.points;
            if (!workingPoints || workingPoints.length < 2) {
                workingPoints = [
                    { x: line.start_x, y: line.start_y, type: 'smooth' as const },
                    { x: line.end_x, y: line.end_y, type: 'smooth' as const }
                ];
            }

            // Find the segment closest to the click position
            let bestSegIdx = 0;
            let minDist = Infinity;
            for (let i = 0; i < workingPoints.length - 1; i++) {
                const p1 = workingPoints[i];
                const p2 = workingPoints[i + 1];
                const dist = pointToSegmentDistance(pos.x, pos.y, p1.x, p1.y, p2.x, p2.y);
                if (dist < minDist) {
                    minDist = dist;
                    bestSegIdx = i;
                }
            }

            // Insert the new point after bestSegIdx
            const newPoints = [...workingPoints];
            newPoints.splice(bestSegIdx + 1, 0, { x: pos.x, y: pos.y, type: 'smooth' });

            onUpdateLine(lineId, { points: newPoints });
            onSaveLine(lineId);

            // Immediately start dragging the newly added point
            const newPointIndex = bestSegIdx + 1;
            setSelectedPoint({ lineId, index: newPointIndex });
            setDraggingPoint({ lineId, index: newPointIndex });
            return;
        }

        e.preventDefault();
        e.stopPropagation();
        const pos = getMousePos(e);
        dragOffsetRef.current = { x: pos.x, y: pos.y };
        setDraggingLine({ lineId });
        onSelectLine(lineId);
    };

    // Stable drag effect - only re-binds when drag starts/ends, not during movement
    const isDragging = !!(draggingPoint || draggingLine);
    const draggingPointRef = useRef(draggingPoint);
    const draggingLineRef = useRef(draggingLine);
    draggingPointRef.current = draggingPoint;
    draggingLineRef.current = draggingLine;

    // RAF throttle ref
    const rafRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            // Throttle updates to animation frame rate (~60fps)
            if (rafRef.current !== null) return;

            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;

                const pos = getMousePos(e);
                const currentDraggingPoint = draggingPointRef.current;
                const currentDraggingLine = draggingLineRef.current;

                if (currentDraggingPoint) {
                    const line = linesRef.current.find(l => l.id === currentDraggingPoint.lineId);
                    if (!line) return;
                    const updates: Partial<CanvasLine> = {};

                    if (currentDraggingPoint.index !== undefined && line.points) {
                        const newPoints = [...line.points];
                        newPoints[currentDraggingPoint.index] = { ...newPoints[currentDraggingPoint.index], x: pos.x, y: pos.y };
                        updates.points = newPoints;

                        // Legacy sync
                        if (currentDraggingPoint.index === 0) {
                            updates.start_x = pos.x;
                            updates.start_y = pos.y;
                        } else if (currentDraggingPoint.index === line.points.length - 1) {
                            updates.end_x = pos.x;
                            updates.end_y = pos.y;
                        }
                    } else if (currentDraggingPoint.point === 'label') {
                        // Update label position (t)
                        const t = getClosestT(line, pos.x, pos.y);
                        updates.label_position = t;
                    } else {
                        if (currentDraggingPoint.point === 'start') { updates.start_x = pos.x; updates.start_y = pos.y; }
                        else if (currentDraggingPoint.point === 'control') { updates.control_x = pos.x; updates.control_y = pos.y; }
                        else if (currentDraggingPoint.point === 'end') { updates.end_x = pos.x; updates.end_y = pos.y; }
                    }

                    onUpdateLine(currentDraggingPoint.lineId, updates);
                } else if (currentDraggingLine) {
                    const line = linesRef.current.find(l => l.id === currentDraggingLine.lineId);
                    if (!line) return;
                    const dx = pos.x - dragOffsetRef.current.x;
                    const dy = pos.y - dragOffsetRef.current.y;

                    const updates: Partial<CanvasLine> = {
                        start_x: line.start_x + dx,
                        start_y: line.start_y + dy,
                        control_x: line.control_x + dx,
                        control_y: line.control_y + dy,
                        end_x: line.end_x + dx,
                        end_y: line.end_y + dy,
                    };

                    if (line.points) {
                        updates.points = line.points.map(p => ({ ...p, x: p.x + dx, y: p.y + dy }));
                    }

                    // Update offset ref, not state
                    dragOffsetRef.current = { x: pos.x, y: pos.y };
                    onUpdateLine(currentDraggingLine.lineId, updates);
                }
            });
        };

        const handleMouseUp = () => {
            // Cancel any pending RAF
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
            const id = draggingPointRef.current?.lineId || draggingLineRef.current?.lineId;
            if (id) onSaveLine(id);
            setDraggingPoint(null);
            setDraggingLine(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [isDragging, onUpdateLine, onSaveLine, getMousePos]);

    // Separate useEffect for drawing preview
    useEffect(() => {
        if (!drawing) return;
        const handleMouseMove = (e: MouseEvent) => {
            const pos = getMousePos(e);
            setDrawing(prev => prev ? { ...prev, endX: pos.x, endY: pos.y } : null);
        };
        const handleMouseUp = (e: MouseEvent) => {
            const pos = getMousePos(e);
            if (drawing && (Math.abs(pos.x - drawing.startX) > 10 || Math.abs(pos.y - drawing.startY) > 10)) {
                onCreateLine(drawing.startX, drawing.startY, pos.x, pos.y);
            }
            setDrawing(null);
        };
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [drawing, onCreateLine, getMousePos]);

    // Separate useEffect for keyboard shortcuts (Delete point)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isTyping = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || (target as any).isContentEditable);
            if (isTyping) return;

            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPoint && isEditMode) {
                const line = lines.find(l => l.id === selectedPoint.lineId);
                // Only delete if points exist and we have more than 2 (need 2 to make a line)
                if (line && line.points && line.points.length > 2 && selectedPoint.index !== undefined) {
                    e.preventDefault(); // Prevent browser back navigation on Backspace
                    const newPoints = [...line.points];
                    newPoints.splice(selectedPoint.index, 1);
                    onUpdateLine(line.id, { points: newPoints });
                    onSaveLine(line.id);
                    setSelectedPoint(null); // Clear selection after delete
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [selectedPoint, lines, isEditMode, onUpdateLine, onSaveLine]);

    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        // Prevent background clicks from firing when clicking children
        if (e.target !== e.currentTarget) return;

        if (!isLineMode) {
            onSelectLine(null);
            onToggleEditMode(null);
            setSelectedPoint(null); // Deselect point when clicking canvas
            return;
        }
        const pos = getMousePos(e);
        setDrawing({ startX: pos.x, startY: pos.y, endX: pos.x, endY: pos.y });
    };

    const handlePathClick = (e: React.MouseEvent, line: CanvasLine) => {
        e.stopPropagation(); // Always stop propagation to prevent canvas deselect
        e.preventDefault(); // Prevent any default behavior

        // Always select the line on click
        onSelectLine(line.id);

        // Make sure we don't have a point selected when clicking the line logic (though line drag start handles most now)
        // If we reached here, it might be a click that wasn't caught by drag start (shouldn't happen in edit mode)
        if (isEditMode && selectedLineId === line.id) {
            // Deselect specific point if clicking on the line segment itself
            setSelectedPoint(null);
        }
    };

    // NEW APPROACH:
    // - Back layer: Renders ONLY visible strokes for z_index < 0 lines (visual only, no interaction)
    // - Front layer: Renders ALL hit areas (so every line is clickable) + visible strokes for z_index >= 0

    // Lines to render visually in this layer
    const visualLines = useMemo(() => {
        if (layer === 'back') {
            // Back: only lines with z_index < 0 (but not the selected one - it shows in front)
            return lines.filter(line => (line.z_index ?? 0) < 0 && line.id !== selectedLineId);
        } else {
            // Front: lines with z_index >= 0 OR the selected line
            return lines.filter(line => (line.z_index ?? 0) >= 0 || line.id === selectedLineId);
        }
    }, [lines, layer, selectedLineId]);

    // Lines that need hit areas (interaction) - ONLY in front layer, but for ALL lines
    const interactionLines = useMemo(() => {
        if (layer === 'front') {
            return lines; // All lines are interactable via the front layer
        }
        return []; // Back layer has no interaction
    }, [lines, layer]);

    // For rendering order: selected line should be on top
    const renderVisualLines = useMemo(() => {
        if (layer === 'front' && selectedLineId) {
            const selected = visualLines.find(l => l.id === selectedLineId);
            const rest = visualLines.filter(l => l.id !== selectedLineId);
            return selected ? [...rest, selected] : visualLines;
        }
        return visualLines;
    }, [visualLines, layer, selectedLineId]);

    return (
        <svg
            ref={svgRef}
            className="absolute inset-0 overflow-visible"
            style={{
                width: '100%',
                height: '100%',
                pointerEvents: (isLineMode || forcePointerEvents) ? 'auto' : 'none',
                cursor: isLineMode ? 'crosshair' : 'default',
                zIndex: layer === 'back' ? 0 : (isLineMode || selectedLineId || isEditMode) ? 1000 : 10,
            }}
            onMouseDown={handleCanvasMouseDown}
            onContextMenu={(e) => {
                if (isEditMode || isLineMode) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }}
        >
            <defs>
                {renderVisualLines.map((line: CanvasLine) => (
                    <React.Fragment key={`${layer}-markers-${line.id}`}>
                        <marker
                            id={`${layer}-arrow-end-${line.id}`}
                            markerWidth="10"
                            markerHeight="10"
                            viewBox="-10 -5 10 10"
                            refX="0"
                            refY="0"
                            orient="auto"
                        >
                            <path
                                d="M0,0 L-10,-5 L-7,0 L-10,5 Z"
                                fill={line.color}
                            />
                        </marker>
                        <marker
                            id={`${layer}-arrow-start-${line.id}`}
                            markerWidth="10"
                            markerHeight="10"
                            viewBox="0 -5 10 10"
                            refX="0"
                            refY="0"
                            orient="auto"
                        >
                            <path
                                d="M0,0 L10,-5 L7,0 L10,5 Z"
                                fill={line.color}
                            />
                        </marker>
                    </React.Fragment>
                ))}
            </defs>

            {/* Interactive hit areas - front layer renders ALL lines' hit areas */}
            {interactionLines.map((line: CanvasLine) => {
                const pathData = (line.points && line.points.length > 0)
                    ? getCurvePath(line.points)
                    : `M ${line.start_x} ${line.start_y} Q ${line.control_x} ${line.control_y} ${line.end_x} ${line.end_y}`;
                const isSelected = selectedLineId === line.id;
                const bbox = getBoundingBox(line);

                return (
                    <g key={`hit-${line.id}`}>
                        {/* Selection Box */}
                        {isSelected && !isEditMode && (
                            <rect
                                x={bbox.x}
                                y={bbox.y}
                                width={bbox.width}
                                height={bbox.height}
                                fill="rgba(59, 130, 246, 0.05)"
                                stroke="rgba(59, 130, 246, 0.3)"
                                strokeDasharray="4 4"
                                className="pointer-events-none"
                            />
                        )}

                        {/* Hit Area */}
                        <path
                            d={pathData}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={20}
                            style={{
                                cursor: (isEditMode && isSelected) ? 'cell' : (isEditMode ? 'default' : 'move'),
                                pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => handleLineDragStart(e, line.id)}
                            onDoubleClick={() => onToggleEditMode(line.id)}
                            onClick={(e) => handlePathClick(e, line)}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onSelectLine(line.id);
                                onContextMenu?.(line.id, e.clientX, e.clientY);
                            }}
                        />
                    </g>
                );
            })}

            {/* Visible lines - only lines belonging to this layer */}
            {renderVisualLines.map((line: CanvasLine) => {
                const isSelected = selectedLineId === line.id;
                const pathData = (line.points && line.points.length > 0)
                    ? getCurvePath(line.points)
                    : `M ${line.start_x} ${line.start_y} Q ${line.control_x} ${line.control_y} ${line.end_x} ${line.end_y}`;
                const bbox = getBoundingBox(line);

                return (
                    <g key={line.id}>

                        {/* Visible Line */}
                        <path
                            d={pathData}
                            fill="none"
                            stroke={line.color}
                            strokeWidth={line.stroke_width}
                            strokeDasharray={line.dashed ? "5,5" : "none"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            markerStart={line.start_arrow ? `url(#${layer}-arrow-start-${line.id})` : "none"}
                            markerEnd={line.end_arrow ? `url(#${layer}-arrow-end-${line.id})` : "none"}
                            className="transition-all duration-200"
                            style={{
                                filter: isSelected && layer === 'front' ? 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.5))' : 'none',
                                pointerEvents: 'none'
                            }}
                        />

                        {/* Label */}
                        {line.label && (
                            <foreignObject
                                x={getPointOnPath(line, line.label_position ?? 0.5).x - 100}
                                y={getPointOnPath(line, line.label_position ?? 0.5).y - 50}
                                width="200"
                                height="100"
                                style={{
                                    overflow: 'visible',
                                    pointerEvents: 'none'
                                }}
                            >
                                <div
                                    className="group relative"
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        width: '100%',
                                        height: '100%'
                                    }}
                                >
                                    <div
                                        style={{
                                            backgroundColor: line.label_background_color || 'white',
                                            color: line.label_text_color || '#374151',
                                            padding: '4px 8px',
                                            borderRadius: '6px',
                                            fontSize: '11px',
                                            lineHeight: '1.4',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                                            border: isSelected && layer === 'front' ? '1px solid #3b82f6' : '1px solid #e5e7eb',
                                            cursor: layer === 'front' ? 'grab' : 'default',
                                            pointerEvents: layer === 'front' ? 'auto' : 'none',
                                            userSelect: 'none',
                                            whiteSpace: 'pre-wrap',
                                            textAlign: 'center',
                                            minWidth: '20px',
                                            maxWidth: '180px',
                                        }}
                                        onMouseDown={layer === 'front' ? (e) => handlePointDragStart(e, line.id, undefined, 'label') : undefined}
                                        onClick={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                    >
                                        {line.label}
                                    </div>
                                </div>
                            </foreignObject>
                        )}

                        {/* Handles - only in front layer */}
                        {layer === 'front' && isEditMode && isSelected && (
                            <>
                                {line.points ? (
                                    <>
                                        {line.points.map((p: { x: number; y: number; type: 'corner' | 'smooth' }, i: number) => (
                                            <circle
                                                key={i}
                                                cx={p.x}
                                                cy={p.y}
                                                r={6}
                                                fill={selectedPoint?.lineId === line.id && selectedPoint?.index === i ? "#3b82f6" : "white"}
                                                stroke="#3b82f6"
                                                strokeWidth={2}
                                                style={{ cursor: 'grab', pointerEvents: 'auto' }}
                                                onMouseDown={(e) => handlePointDragStart(e, line.id, i)}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (e.shiftKey) {
                                                        const newPoints = [...line.points!];
                                                        newPoints[i] = { ...newPoints[i], type: newPoints[i].type === 'corner' ? 'smooth' : 'corner' };
                                                        onUpdateLine(line.id, { points: newPoints });
                                                        onSaveLine(line.id);
                                                    }
                                                }}
                                            />
                                        ))}
                                        {/* Midpoint handles — one per segment, drag inserts a new draggable point */}
                                        {line.points.slice(0, -1).map((_: unknown, i: number) => (
                                            <circle
                                                key={`mid-${i}`}
                                                cx={(line.points![i].x + line.points![i + 1].x) / 2}
                                                cy={(line.points![i].y + line.points![i + 1].y) / 2}
                                                r={4}
                                                fill="#10b981"
                                                stroke="white"
                                                strokeWidth={1.5}
                                                style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
                                                onMouseDown={(e) => handleMidpointDragStart(e, line.id, i)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        <circle cx={line.start_x} cy={line.start_y} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'start')} onClick={(e) => e.stopPropagation()} />
                                        <circle cx={line.control_x} cy={line.control_y} r={6} fill="white" stroke="#10b981" strokeWidth={2} style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'control')} onClick={(e) => e.stopPropagation()} />
                                        <circle cx={line.end_x} cy={line.end_y} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'end')} onClick={(e) => e.stopPropagation()} />
                                    </>
                                )}
                            </>
                        )}
                    </g>
                );
            })}

            {/* Drawing preview */}
            {drawing && (
                <line
                    x1={drawing.startX}
                    y1={drawing.startY}
                    x2={drawing.endX}
                    y2={drawing.endY}
                    stroke="#3b82f6"
                    strokeWidth={2}
                    strokeDasharray="4,4"
                />
            )}
        </svg>
    );
}

// Custom comparison for React.memo
// Only optimize back layer - front layer always re-renders
function arePropsEqual(
    prevProps: SimpleLineRendererProps,
    nextProps: SimpleLineRendererProps
): boolean {
    if (prevProps.selectedLineId !== nextProps.selectedLineId) return false;
    if (prevProps.isLineMode !== nextProps.isLineMode) return false;
    if (prevProps.isEditMode !== nextProps.isEditMode) return false;
    if (prevProps.layer !== nextProps.layer) return false;

    const layer = nextProps.layer || 'front';

    // Front layer: always re-render for smooth drag updates
    if (layer === 'front') return false;

    // Back layer: only re-render if back-layer lines changed
    const prevBackLines = prevProps.lines.filter(l => (l.z_index ?? 0) < 0 && l.id !== prevProps.selectedLineId);
    const nextBackLines = nextProps.lines.filter(l => (l.z_index ?? 0) < 0 && l.id !== nextProps.selectedLineId);

    if (prevBackLines.length !== nextBackLines.length) return false;

    for (let i = 0; i < prevBackLines.length; i++) {
        const prev = prevBackLines[i];
        const next = nextBackLines.find(l => l.id === prev.id);
        if (!next) return false;
        if (prev.start_x !== next.start_x || prev.start_y !== next.start_y) return false;
        if (prev.end_x !== next.end_x || prev.end_y !== next.end_y) return false;
        if (JSON.stringify(prev.points) !== JSON.stringify(next.points)) return false;
    }

    return true; // Back layer unchanged
}

export default React.memo(SimpleLineRenderer, arePropsEqual);
