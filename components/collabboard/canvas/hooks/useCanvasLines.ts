"use client";

import { useCallback, useState } from 'react';
import type { CanvasLine } from '@/types/collabboard';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';

interface UseCanvasLinesParams {
  canvasId?: string;
  canvasZoom: number;
  setLines: React.Dispatch<React.SetStateAction<CanvasLine[]>>;
  setSelectedLineId: (v: string | null) => void;
  supabase: any;
}

export function useCanvasLines({
  canvasId,
  canvasZoom,
  setLines,
  setSelectedLineId,
  supabase,
}: UseCanvasLinesParams) {
  const [lineEditModeId, setLineEditModeId] = useState<string | null>(null);
  const [isLineMode, setIsLineModeState] = useState(false);
  const [draggingLineId, setDraggingLineId] = useState<string | null>(null);
  const [lineContextMenuState, setLineContextMenuState] = useState<{
    lineId: string;
    x: number;
    y: number;
  } | null>(null);

  const createLine = useCallback(async (lineData: Omit<CanvasLine, 'id' | 'created_at' | 'updated_at'>) => {
    if (!canvasId) return;

    const newLine = {
      ...lineData,
      board_id: canvasId,
    };

    try {
      const { data, error } = await supabase
        .from('canvas_lines')
        .insert(newLine)
        .select()
        .single();

      if (error) {
        const tempLine: CanvasLine = {
          ...newLine,
          id: `temp-${Date.now()}`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setLines(prev => [...prev, tempLine]);
        setSelectedLineId(tempLine.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
        return;
      }

      if (data) {
        setLines(prev => [...prev, data]);
        setSelectedLineId(data.id);
        setIsLineModeState(false);
        setLineEditModeId(null);
        window.getSelection()?.removeAllRanges();
      }
    } catch (e) {
      console.error('Failed to create line:', e);
    }
  }, [canvasId, supabase, setLines, setSelectedLineId]);

  const createLineFromCoords = useCallback((
    rawStartX: number, rawStartY: number, rawEndX: number, rawEndY: number,
    geoPoints?: { startLng: number; startLat: number; endLng: number; endLat: number }
  ) => {
    const startX = rawStartX / canvasZoom;
    const startY = rawStartY / canvasZoom;
    const endX = rawEndX / canvasZoom;
    const endY = rawEndY / canvasZoom;

    const controlX = (startX + endX) / 2;
    const controlY = Math.min(startY, endY) - 50;

    createLine({
      board_id: canvasId || '',
      start_x: startX,
      start_y: startY,
      control_x: controlX,
      control_y: controlY,
      end_x: endX,
      end_y: endY,
      points: [
        { x: startX, y: startY, type: 'smooth', ...(geoPoints ? { lng: geoPoints.startLng, lat: geoPoints.startLat } : {}) },
        { x: endX, y: endY, type: 'smooth', ...(geoPoints ? { lng: geoPoints.endLng, lat: geoPoints.endLat } : {}) },
      ],
      color: '#374151',
      stroke_width: 2,
      start_arrow: false,
      end_arrow: true,
      dashed: false,
    });
  }, [canvasId, createLine, canvasZoom]);

  /** Reset all line-specific state (edit mode, dragging, context menu). */
  const clearLineState = useCallback(() => {
    setSelectedLineId(null);
    setLineEditModeId(null);
  }, [setSelectedLineId]);

  const handleLineSelect = useCallback((id: string | null) => {
    setSelectedLineId(id);
    if (!id) {
      setLineEditModeId(null);
    }
  }, [setSelectedLineId]);

  const handleToggleLineEditMode = useCallback((id: string | null) => {
    setLineEditModeId(id);
  }, []);

  const handleLineDragChange = useCallback((lineId: string | null) => {
    setDraggingLineId(lineId);
  }, []);

  const setIsLineMode = useCallback((v: boolean) => {
    debugCanvasLogger('selectionChange', { type: 'line_mode', id: v ? 'on' : 'off' });
    setIsLineModeState(v);
  }, []);

  return {
    lineEditModeId,
    setLineEditModeId,
    isLineMode,
    setIsLineMode,
    draggingLineId,
    setDraggingLineId,
    lineContextMenuState,
    setLineContextMenuState,
    createLine,
    createLineFromCoords,
    clearLineState,
    handleLineSelect,
    handleToggleLineEditMode,
    handleLineDragChange,
  };
}
