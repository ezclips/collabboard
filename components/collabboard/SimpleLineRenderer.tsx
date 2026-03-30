'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import type { CanvasLine } from '@/types/collabboard';

const DEV_LINE_RENDER_DIAGNOSTICS = process.env.NODE_ENV !== 'production';

function logLineEventDiagnostics(
    phase: string,
    rendererLabel: 'back' | 'front',
    lineId: string | null,
    event: React.MouseEvent | MouseEvent,
    extra?: Record<string, unknown>,
) {
    if (!DEV_LINE_RENDER_DIAGNOSTICS) return;

    const target = event.target instanceof Element ? event.target : null;
    const currentTarget = event.currentTarget instanceof Element ? event.currentTarget : null;

    console.debug('[SimpleLineRenderer:event]', {
        phase,
        rendererLabel,
        lineId,
        type: event.type,
        button: event.button,
        buttons: event.buttons,
        defaultPrevented: event.defaultPrevented,
        eventPhase: event.eventPhase,
        target: target ? {
            tag: target.tagName,
            className: target.getAttribute('class'),
            lineId: target.getAttribute('data-line-id'),
            lineRenderer: target.getAttribute('data-line-renderer'),
            lineRole: target.getAttribute('data-line-role'),
        } : null,
        currentTarget: currentTarget ? {
            tag: currentTarget.tagName,
            className: currentTarget.getAttribute('class'),
            lineId: currentTarget.getAttribute('data-line-id'),
            lineRenderer: currentTarget.getAttribute('data-line-renderer'),
            lineRole: currentTarget.getAttribute('data-line-role'),
        } : null,
        ...extra,
    });
}

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
    excalidrawAPIRef?: React.RefObject<any>;
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
    excalidrawAPIRef,
}: SimpleLineRendererProps) {
    const svgRef = useRef<SVGSVGElement>(null);
    const rendererLabel = layer === 'back' ? 'back' : 'front';

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
        logLineEventDiagnostics('point-drag-start:before-stop', rendererLabel, lineId, e, {
            index: index ?? null,
            point: point ?? null,
        });
        e.preventDefault();
        e.stopPropagation();
        logLineEventDiagnostics('point-drag-start:after-stop', rendererLabel, lineId, e, {
            index: index ?? null,
            point: point ?? null,
        });
        setDraggingPoint({ lineId, index, point });
        setSelectedPoint({ lineId, index }); // Select point on click/drag
        onSelectLine(lineId);
    };

    const handleMidpointDragStart = (e: React.MouseEvent, lineId: string, segmentIndex: number) => {
        logLineEventDiagnostics('midpoint-drag-start:before-stop', rendererLabel, lineId, e, {
            segmentIndex,
        });
        e.preventDefault();
        e.stopPropagation();
        logLineEventDiagnostics('midpoint-drag-start:after-stop', rendererLabel, lineId, e, {
            segmentIndex,
        });
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
        logLineEventDiagnostics('line-drag-start:entry', rendererLabel, lineId, e, {
            isEditMode,
            selectedLineId,
        });
        if (e.button !== 0) return; // ignore right-click / middle-click
        // In Edit mode for this line, clicking the path should add a point, not drag
        if (isEditMode && selectedLineId === lineId) {
            e.stopPropagation();
            e.preventDefault();
            logLineEventDiagnostics('line-drag-start:add-point-branch', rendererLabel, lineId, e, {
                isEditMode,
                selectedLineId,
            });

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
        logLineEventDiagnostics('line-drag-start:drag-branch', rendererLabel, lineId, e, {
            isEditMode,
            selectedLineId,
        });
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
        logLineEventDiagnostics('canvas-mousedown', rendererLabel, null, e, {
            isLineMode,
            isEditMode,
        });
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
        logLineEventDiagnostics('path-click:before-stop', rendererLabel, line.id, e, {
            isEditMode,
            selectedLineId,
        });
        e.stopPropagation(); // Always stop propagation to prevent canvas deselect
        e.preventDefault(); // Prevent any default behavior
        logLineEventDiagnostics('path-click:after-stop', rendererLabel, line.id, e, {
            isEditMode,
            selectedLineId,
        });

        const api = excalidrawAPIRef?.current;
        if (api && typeof api.updateScene === "function") {
            api.updateScene({
                appState: {
                    selectedElementIds: {},
                    selectedGroupIds: {},
                    activeEmbeddable: null,
                    selectedLinearElement: null,
                    openPopup: null,
                },
            });
        }

        // Always select the line on click
        onSelectLine(line.id);

        // Make sure we don't have a point selected when clicking the line logic (though line drag start handles most now)
        // If we reached here, it might be a click that wasn't caught by drag start (shouldn't happen in edit mode)
        if (isEditMode && selectedLineId === line.id) {
            // Deselect specific point if clicking on the line segment itself
            setSelectedPoint(null);
        }
    };

    // Sort lines within this plane by z_index (ascending), with the selected line
    // rendered last (on top) within the same plane.
    // Incoming lines are already filtered to this plane by the caller — no sign-based
    // plane detection here.
    const orderedLines = useMemo(() => {
        const sorted = lines
            .map((line, index) => ({ line, index }))
            .sort((a, b) => {
                const zDiff = (a.line.z_index ?? 0) - (b.line.z_index ?? 0);
                if (zDiff !== 0) return zDiff;
                return a.index - b.index;
            })
            .map(({ line }) => line);

        if (!selectedLineId) return sorted;

        // Place selected line last so it paints on top within this plane.
        const selected = sorted.find(l => l.id === selectedLineId);
        const rest = sorted.filter(l => l.id !== selectedLineId);
        return selected ? [...rest, selected] : sorted;
    }, [lines, selectedLineId]);

    // Both visual strokes and hit areas use the same ordered set.
    const visualLines = orderedLines;
    const interactionLines = orderedLines;
    const renderedVisibleLines = visualLines;

    const propsLineIds = useMemo(() => lines.map((line) => line.id), [lines]);
    const orderedLineIds = useMemo(() => orderedLines.map((line) => line.id), [orderedLines]);
    const visualLineIds = useMemo(() => visualLines.map((line) => line.id), [visualLines]);
    const renderedVisibleLineIds = useMemo(
        () => renderedVisibleLines.map((line) => line.id),
        [renderedVisibleLines]
    );

    useEffect(() => {
        if (!DEV_LINE_RENDER_DIAGNOSTICS) return;

        const selectedLine =
            lines.find((line) => line.id === selectedLineId) ??
            orderedLines.find((line) => line.id === selectedLineId) ??
            null;

        console.debug('[SimpleLineRenderer]', {
            rendererLabel,
            selectedLineId,
            isLineMode,
            isEditMode,
            forcePointerEvents,
            propsLines: {
                count: propsLineIds.length,
                ids: propsLineIds,
            },
            orderedLines: {
                count: orderedLineIds.length,
                ids: orderedLineIds,
            },
            visualLines: {
                count: visualLineIds.length,
                ids: visualLineIds,
            },
            renderedVisibleLines: {
                count: renderedVisibleLineIds.length,
                ids: renderedVisibleLineIds,
            },
            selectedLine:
                selectedLine
                    ? {
                        id: selectedLine.id,
                        layer_plane: selectedLine.layer_plane,
                        z_index: selectedLine.z_index ?? 0,
                        color: selectedLine.color,
                        stroke_width: selectedLine.stroke_width,
                        points: selectedLine.points?.length ?? 0,
                    }
                    : null,
        });
    }, [
        forcePointerEvents,
        isEditMode,
        isLineMode,
        lines,
        orderedLines,
        orderedLineIds,
        propsLineIds,
        renderedVisibleLineIds,
        renderedVisibleLines,
        rendererLabel,
        selectedLineId,
        visualLineIds,
    ]);

    useEffect(() => {
        if (!DEV_LINE_RENDER_DIAGNOSTICS) return;
        if (rendererLabel !== 'back') return;
        if (!selectedLineId) return;

        const selector =
            `[data-line-role="visible-path"]` +
            `[data-line-renderer="${rendererLabel}"]` +
            `[data-line-id="${selectedLineId}"]`;

        const node = document.querySelector(selector);

        if (!(node instanceof SVGPathElement)) {
            console.debug('[SimpleLineRenderer:dom]', {
                rendererLabel,
                selectedLineId,
                selector,
                exists: false,
            });
            return;
        }

        let bbox:
            | { x: number; y: number; width: number; height: number }
            | { error: string }
            | null = null;

        try {
            const nextBBox = node.getBBox();
            bbox = {
                x: nextBBox.x,
                y: nextBBox.y,
                width: nextBBox.width,
                height: nextBBox.height,
            };
        } catch (error) {
            bbox = {
                error: error instanceof Error ? error.message : String(error),
            };
        }

        const computedStyle = window.getComputedStyle(node);

        console.debug('[SimpleLineRenderer:dom]', {
            rendererLabel,
            selectedLineId,
            selector,
            exists: true,
            attrs: {
                stroke: node.getAttribute('stroke'),
                'stroke-width': node.getAttribute('stroke-width'),
                opacity: node.getAttribute('opacity'),
                display: node.getAttribute('display'),
                visibility: node.getAttribute('visibility'),
                d: node.getAttribute('d'),
                'marker-start': node.getAttribute('marker-start'),
                'marker-end': node.getAttribute('marker-end'),
            },
            computedStyle: {
                opacity: computedStyle.opacity,
                display: computedStyle.display,
                visibility: computedStyle.visibility,
            },
            bbox,
        });
    }, [rendererLabel, selectedLineId, renderedVisibleLineIds]);

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
                {renderedVisibleLines.map((line: CanvasLine) => (
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
                            data-line-id={line.id}
                            data-line-renderer={rendererLabel}
                            data-line-role="hit-path"
                            style={{
                                cursor: (isEditMode && isSelected) ? 'cell' : (isEditMode ? 'default' : 'move'),
                                pointerEvents: 'auto'
                            }}
                            onMouseDown={(e) => handleLineDragStart(e, line.id)}
                            onDoubleClick={() => onToggleEditMode(line.id)}
                            onClick={(e) => handlePathClick(e, line)}
                            onContextMenu={(e) => {
                                logLineEventDiagnostics('hit-path-contextmenu:before-stop', rendererLabel, line.id, e, {
                                    isEditMode,
                                    selectedLineId,
                                });
                                e.preventDefault();
                                e.stopPropagation();
                                logLineEventDiagnostics('hit-path-contextmenu:after-stop', rendererLabel, line.id, e, {
                                    isEditMode,
                                    selectedLineId,
                                });
                                onSelectLine(line.id);
                                onContextMenu?.(line.id, e.clientX, e.clientY);
                            }}
                        />
                    </g>
                );
            })}

            {/* Visible lines - only lines belonging to this layer */}
            {renderedVisibleLines.map((line: CanvasLine) => {
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
                            data-line-id={line.id}
                            data-line-renderer={rendererLabel}
                            data-line-role="visible-path"
                            strokeDasharray={line.dashed ? "5,5" : "none"}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            markerStart={line.start_arrow ? `url(#${layer}-arrow-start-${line.id})` : "none"}
                            markerEnd={line.end_arrow ? `url(#${layer}-arrow-end-${line.id})` : "none"}
                            className="transition-all duration-200"
                            style={{
                                filter: isSelected ? 'drop-shadow(0 0 2px rgba(59, 130, 246, 0.5))' : 'none',
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
                                        data-line-id={line.id}
                                        data-line-renderer={rendererLabel}
                                        data-line-role="label-handle"
                                        onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'label')}
                                        onClick={(e) => e.stopPropagation()}
                                        onDoubleClick={(e) => e.stopPropagation()}
                                    >
                                        {line.label}
                                    </div>
                                </div>
                            </foreignObject>
                        )}

                        {/* Edit handles - render on the selected line in either plane so DrawingLayout can bridge to the real DOM target */}
                        {isEditMode && isSelected && (
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
                                                data-line-id={line.id}
                                                data-line-renderer={rendererLabel}
                                                data-line-role="point-handle"
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
                                                data-line-id={line.id}
                                                data-line-renderer={rendererLabel}
                                                data-line-role="midpoint-handle"
                                                style={{ cursor: 'crosshair', pointerEvents: 'auto' }}
                                                onMouseDown={(e) => handleMidpointDragStart(e, line.id, i)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        ))}
                                    </>
                                ) : (
                                    <>
                                        <circle cx={line.start_x} cy={line.start_y} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} data-line-id={line.id} data-line-renderer={rendererLabel} data-line-role="start-handle" style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'start')} onClick={(e) => e.stopPropagation()} />
                                        <circle cx={line.control_x} cy={line.control_y} r={6} fill="white" stroke="#10b981" strokeWidth={2} data-line-id={line.id} data-line-renderer={rendererLabel} data-line-role="control-handle" style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'control')} onClick={(e) => e.stopPropagation()} />
                                        <circle cx={line.end_x} cy={line.end_y} r={6} fill="white" stroke="#3b82f6" strokeWidth={2} data-line-id={line.id} data-line-renderer={rendererLabel} data-line-role="end-handle" style={{ cursor: 'grab', pointerEvents: 'auto' }} onMouseDown={(e) => handlePointDragStart(e, line.id, undefined, 'end')} onClick={(e) => e.stopPropagation()} />
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

export default SimpleLineRenderer;
