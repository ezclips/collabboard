"use client";

import { useEffect } from 'react';

interface UseCanvasShortcutsParams {
  selectedPadletId: string | null;
  selectedPadletIds: string[];
  showDeleteConfirm: boolean;
  isNoteEditorOpen: boolean;
  isTableEditorOpen: boolean;
  isLinkEditorOpen: boolean;
  isTodoEditorOpen: boolean;
  isWallLayout: boolean;
  isGridLayout: boolean;
  requestDeletePadlet: (padletId: string) => Promise<void>;
  setShowDeleteConfirm: (v: boolean) => void;
  setSelectedPadletId: (v: string | null) => void;
  setSelectedPadletIds: (v: string[]) => void;
  isLineMode: boolean;
  lineEditModeId: string | null;
  selectedLineId: string | null;
  newPostDragState: { isActive: boolean };
  setNewPostDragState: React.Dispatch<React.SetStateAction<any>>;
  setWallPlacementPromptOpen: (v: boolean) => void;
  setIsPlacementPromptOpen: (v: boolean) => void;
  setIsNoteEditorOpen: (v: boolean) => void;
  setIsLineMode: (v: boolean) => void;
  setLineEditModeId: (v: string | null) => void;
  setSelectedLineId: (v: string | null) => void;
  movePadletLayer: (padletId: string, direction: 'front' | 'back') => void;
  deleteLine: (lineId: string) => Promise<void>;
  onSelectAll: () => void;
  onUndoPaste: () => void;
}

export function useCanvasShortcuts({
  selectedPadletId,
  selectedPadletIds,
  showDeleteConfirm,
  isNoteEditorOpen,
  isTableEditorOpen,
  isLinkEditorOpen,
  isTodoEditorOpen,
  isWallLayout,
  isGridLayout,
  requestDeletePadlet,
  setShowDeleteConfirm,
  setSelectedPadletId,
  setSelectedPadletIds,
  isLineMode,
  lineEditModeId,
  selectedLineId,
  newPostDragState,
  setNewPostDragState,
  setWallPlacementPromptOpen,
  setIsPlacementPromptOpen,
  setIsNoteEditorOpen,
  setIsLineMode,
  setLineEditModeId,
  setSelectedLineId,
  movePadletLayer,
  deleteLine,
  onSelectAll,
  onUndoPaste,
}: UseCanvasShortcutsParams) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedPadletId && !showDeleteConfirm) {
        if (isNoteEditorOpen || isTableEditorOpen || isLinkEditorOpen || isTodoEditorOpen) return;

        if (isWallLayout || isGridLayout) {
          requestDeletePadlet(selectedPadletId);
        } else {
          setShowDeleteConfirm(true);
        }
      }
      if (e.key === 'Escape' && (selectedPadletId || selectedPadletIds.length > 0)) {
        setSelectedPadletId(null);
        setSelectedPadletIds([]);
        setShowDeleteConfirm(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedPadletId, selectedPadletIds.length, showDeleteConfirm, isNoteEditorOpen, isTableEditorOpen, isLinkEditorOpen, isTodoEditorOpen, isWallLayout, isGridLayout, requestDeletePadlet, setShowDeleteConfirm, setSelectedPadletId, setSelectedPadletIds]);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (newPostDragState.isActive) {
          setNewPostDragState((prev: any) => ({ ...prev, isActive: false }));
          if (isWallLayout) {
            setWallPlacementPromptOpen(true);
          } else {
            setIsPlacementPromptOpen(true);
          }
          return;
        }
        if (isNoteEditorOpen) setIsNoteEditorOpen(false);
        if (isLineMode || lineEditModeId || selectedLineId) {
          setIsLineMode(false);
          setLineEditModeId(null);
          setSelectedLineId(null);
          window.getSelection()?.removeAllRanges();
        }
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        onSelectAll();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        onUndoPaste();
        return;
      }

      if (e.ctrlKey && e.shiftKey && selectedPadletId) {
        if (e.key === ']' || e.key === '}') {
          movePadletLayer(selectedPadletId, 'front');
        } else if (e.key === '[' || e.key === '{') {
          movePadletLayer(selectedPadletId, 'back');
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [isLineMode, lineEditModeId, selectedLineId, newPostDragState.isActive, isNoteEditorOpen, selectedPadletId, isWallLayout, isGridLayout, setNewPostDragState, setWallPlacementPromptOpen, setIsPlacementPromptOpen, setIsNoteEditorOpen, setIsLineMode, setLineEditModeId, setSelectedLineId, movePadletLayer, onSelectAll, onUndoPaste]);

  useEffect(() => {
    const handleLineDeleteKey = (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedLineId && !lineEditModeId) {
        e.preventDefault();
        deleteLine(selectedLineId);
      }
    };

    window.addEventListener('keydown', handleLineDeleteKey);
    return () => window.removeEventListener('keydown', handleLineDeleteKey);
  }, [selectedLineId, lineEditModeId, deleteLine]);
}
