'use client';

import { useCallback } from 'react';
import { PendingPostDraft } from '@/types/collabboard';

type PlacementDraft = {
  kind: PendingPostDraft['kind'];
  content: string;
  metadata: any;
  title?: string;
  file_url?: string;
};

type UseGridPadletSaveParams = {
  isWallLayout: boolean;
  isColumnsLayout: boolean;
  isGridLayout: boolean;
  setPendingPostDraft: (d: PendingPostDraft | null) => void;
  setIsPlacementPromptOpen: (v: boolean) => void;
  setWallPendingPostDraft: (d: PendingPostDraft | null) => void;
  setWallPlacementPromptOpen: (v: boolean) => void;
};

type GridPlacementParams = {
  draft: PlacementDraft;
  hasParentId: boolean;
  hasSectionId: boolean;
  closeEditor: () => void;
};

export function useGridPadletSave(params: UseGridPadletSaveParams) {
  const {
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
  } = params;

  return useCallback((placementParams: GridPlacementParams): boolean => {
    const {
      draft,
      hasParentId,
      hasSectionId,
      closeEditor,
    } = placementParams;

    // Grid Layout: always require a container for new posts
    if (isGridLayout && !hasParentId) {
      setPendingPostDraft({
        ...draft,
        createdAt: Date.now(),
      });
      setIsPlacementPromptOpen(true);
      closeEditor();
      return true;
    }

    // Columns Layout: require section or container for new posts
    // Posts can be directly in a section (sectionId) OR inside a container (parentId)
    if (isColumnsLayout && !hasSectionId && !hasParentId) {
      setPendingPostDraft({
        ...draft,
        createdAt: Date.now(),
      });
      setIsPlacementPromptOpen(true);
      closeEditor();
      return true;
    }

    // Wall Layout: require container for new posts
    if (isWallLayout && !hasParentId) {
      setWallPendingPostDraft({
        ...draft,
        createdAt: Date.now(),
      });
      setWallPlacementPromptOpen(true);
      closeEditor();
      return true;
    }

    return false;
  }, [
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
  ]);
}
