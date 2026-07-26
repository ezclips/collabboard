"use client";

import { useCallback, useState } from 'react';
import type { CanvasLine } from '@/types/collabboard';
import { createCreateLineAndSelectCommand } from '@/lib/domain/canvas/lines';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import {
  createCanvasLineGeometryFromLayerCoords,
  type DrawingViewport,
} from '@/lib/infra/drawing/canvasLineCoordinates';

interface UseCanvasLinesParams {
  canvasId?: string;
  canvasZoom: number;
  setLines: React.Dispatch<React.SetStateAction<CanvasLine[]>>;
  setSelectedLineId: (v: string | null) => void;
  drawingViewport?: DrawingViewport;
}

export function useCanvasLines({
  canvasId,
  canvasZoom,
  setLines,
  setSelectedLineId,
  drawingViewport,
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
      const createLineAndSelect = createCreateLineAndSelectCommand(createLinesRepository());
      const result = await createLineAndSelect({ row: newLine }, { userId: null });

      // Channel split PRESERVED (no convergence authorization): a THROWN
      // insert failure carries code 'unknown' out of defineCommand's catch
      // and re-throws its original cause into the catch below (the legacy
      // console.error); a RESOLVED insert error takes the temp-line
      // fallback (the legacy if (error) branch).
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }

      if (!result.ok) {
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

      const data = result.value as unknown as CanvasLine | null;
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
  }, [canvasId, setLines, setSelectedLineId]);

  const createLineFromCoords = useCallback((
    rawStartX: number, rawStartY: number, rawEndX: number, rawEndY: number,
    geoPoints?: { startLng: number; startLat: number; endLng: number; endLat: number }
  ) => {
    const geometry = createCanvasLineGeometryFromLayerCoords({
      rawStartX,
      rawStartY,
      rawEndX,
      rawEndY,
      canvasZoom,
      drawingViewport,
      geoPoints,
    });

    createLine({
      board_id: canvasId || '',
      ...geometry,
      color: '#374151',
      stroke_width: 2,
      start_arrow: false,
      end_arrow: true,
      dashed: false,
      layer_plane: 'front',
    });
  }, [canvasId, createLine, canvasZoom, drawingViewport]);

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
