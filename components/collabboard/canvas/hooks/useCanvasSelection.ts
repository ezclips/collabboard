"use client";

import type React from 'react';
import type { GraphSide } from '@/lib/graph/edgeRouting';
import type { CanvasAction } from '../store/actions';
import type { CanvasStoreState } from '../store/types';

interface UseCanvasSelectionParams {
  canvasState: CanvasStoreState;
  dispatch: React.Dispatch<CanvasAction>;
}

export function useCanvasSelection({ canvasState, dispatch }: UseCanvasSelectionParams) {
  const selectedPadletId = canvasState.selection.selectedPadletId;
  const setSelectedPadletId = (v: string | null) => dispatch({ type: 'SELECTION_PATCH', payload: { selectedPadletId: v } });

  const isGraphConnectMode = canvasState.selection.isGraphConnectMode;
  const setIsGraphConnectMode = (v: boolean) => dispatch({ type: 'SELECTION_PATCH', payload: { isGraphConnectMode: v } });

  const graphConnectSource = canvasState.selection.graphConnectSource;
  const setGraphConnectSource = (v: { id: string; side: GraphSide } | null) => dispatch({ type: 'SELECTION_PATCH', payload: { graphConnectSource: v } });

  const graphConnectSelection = canvasState.selection.graphConnectSelection;
  const setGraphConnectSelection = (v: { id: string; side: GraphSide; nonce: number } | null) => dispatch({ type: 'SELECTION_PATCH', payload: { graphConnectSelection: v } });

  const graphRefreshToken = canvasState.selection.graphRefreshToken;
  const setGraphRefreshToken = (v: number | ((prev: number) => number)) => dispatch({
    type: 'SELECTION_PATCH',
    payload: { graphRefreshToken: typeof v === 'function' ? v(canvasState.selection.graphRefreshToken) : v }
  });

  const selectedSchedulerSlot = canvasState.selection.selectedSchedulerSlot;
  const setSelectedSchedulerSlot = (v: { start: Date; end: Date } | null) => dispatch({ type: 'SELECTION_PATCH', payload: { selectedSchedulerSlot: v } });

  const selectedSchedulerContainerId = canvasState.selection.selectedSchedulerContainerId;
  const setSelectedSchedulerContainerId = (v: string | null) => dispatch({ type: 'SELECTION_PATCH', payload: { selectedSchedulerContainerId: v } });

  const schedulerPopoverPadletId = canvasState.selection.schedulerPopoverPadletId;
  const setSchedulerPopoverPadletId = (v: string | null) => dispatch({ type: 'SELECTION_PATCH', payload: { schedulerPopoverPadletId: v } });

  const selectedLineId = canvasState.selection.selectedLineId;
  const setSelectedLineId = (v: string | null) => dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: v } });

  return {
    selectedPadletId,
    setSelectedPadletId,
    isGraphConnectMode,
    setIsGraphConnectMode,
    graphConnectSource,
    setGraphConnectSource,
    graphConnectSelection,
    setGraphConnectSelection,
    graphRefreshToken,
    setGraphRefreshToken,
    selectedSchedulerSlot,
    setSelectedSchedulerSlot,
    selectedSchedulerContainerId,
    setSelectedSchedulerContainerId,
    schedulerPopoverPadletId,
    setSchedulerPopoverPadletId,
    selectedLineId,
    setSelectedLineId,
  };
}
