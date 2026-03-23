/**
 * Canvas store state shape for editors + selection groups.
 * Only these two groups live here (PR4 scope).
 * data/interaction/ui groups are added in later PRs.
 */

import type { Padlet } from '@/types/collabboard';
import type { GraphSide } from '@/lib/graph/edgeRouting';

// ── Editors group ──────────────────────────────────────────────────────────────
export interface CanvasEditorsState {
  isNoteEditorOpen: boolean;
  isTableEditorOpen: boolean;
  isLinkEditorOpen: boolean;
  isTodoEditorOpen: boolean;
  isContainerEditorOpen: boolean;
  isCommentEditorOpen: boolean;
  isImageEditorOpen: boolean;
  isDrawingEditorOpen: boolean;
  isCardEditorOpen: boolean;
  isAIComponentEditorOpen: boolean;
  isAIContentEditModalOpen: boolean;
  isAIContentConvertModalOpen: boolean;
  padletToEdit: Padlet | null;
  viewDrawingPadlet: Padlet | null;
}

// ── Selection group ────────────────────────────────────────────────────────────
export interface CanvasSelectionState {
  selectedPadletId: string | null;
  selectedLineId: string | null;
  isGraphConnectMode: boolean;
  graphConnectSource: { id: string; side: GraphSide } | null;
  graphConnectSelection: { id: string; side: GraphSide; nonce: number } | null;
  graphRefreshToken: number;
  selectedSchedulerSlot: { start: Date; end: Date } | null;
  selectedSchedulerContainerId: string | null;
  schedulerPopoverPadletId: string | null;
}

// ── Combined ───────────────────────────────────────────────────────────────────
export interface CanvasStoreState {
  editors: CanvasEditorsState;
  selection: CanvasSelectionState;
}

export const initialCanvasState: CanvasStoreState = {
  editors: {
    isNoteEditorOpen: false,
    isTableEditorOpen: false,
    isLinkEditorOpen: false,
    isTodoEditorOpen: false,
    isContainerEditorOpen: false,
    isCommentEditorOpen: false,
    isImageEditorOpen: false,
    isDrawingEditorOpen: false,
    isCardEditorOpen: false,
    isAIComponentEditorOpen: false,
    isAIContentEditModalOpen: false,
    isAIContentConvertModalOpen: false,
    padletToEdit: null,
    viewDrawingPadlet: null,
  },
  selection: {
    selectedPadletId: null,
    selectedLineId: null,
    isGraphConnectMode: false,
    graphConnectSource: null,
    graphConnectSelection: null,
    graphRefreshToken: 0,
    selectedSchedulerSlot: null,
    selectedSchedulerContainerId: null,
    schedulerPopoverPadletId: null,
  },
};
