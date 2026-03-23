/**
 * Selector helpers for the canvas store.
 * Components/hooks call these instead of reading raw state.
 */

import type { CanvasStoreState } from './types';

export const selectEditors = (s: CanvasStoreState) => s.editors;
export const selectSelection = (s: CanvasStoreState) => s.selection;

// ── Editors ────────────────────────────────────────────────────────────────────
export const selectIsNoteEditorOpen = (s: CanvasStoreState) => s.editors.isNoteEditorOpen;
export const selectIsTableEditorOpen = (s: CanvasStoreState) => s.editors.isTableEditorOpen;
export const selectIsLinkEditorOpen = (s: CanvasStoreState) => s.editors.isLinkEditorOpen;
export const selectIsTodoEditorOpen = (s: CanvasStoreState) => s.editors.isTodoEditorOpen;
export const selectIsContainerEditorOpen = (s: CanvasStoreState) => s.editors.isContainerEditorOpen;
export const selectIsCommentEditorOpen = (s: CanvasStoreState) => s.editors.isCommentEditorOpen;
export const selectIsImageEditorOpen = (s: CanvasStoreState) => s.editors.isImageEditorOpen;
export const selectIsDrawingEditorOpen = (s: CanvasStoreState) => s.editors.isDrawingEditorOpen;
export const selectIsCardEditorOpen = (s: CanvasStoreState) => s.editors.isCardEditorOpen;
export const selectPadletToEdit = (s: CanvasStoreState) => s.editors.padletToEdit;
export const selectViewDrawingPadlet = (s: CanvasStoreState) => s.editors.viewDrawingPadlet;

// ── Selection ──────────────────────────────────────────────────────────────────
export const selectSelectedPadletId = (s: CanvasStoreState) => s.selection.selectedPadletId;
export const selectSelectedLineId = (s: CanvasStoreState) => s.selection.selectedLineId;
export const selectIsGraphConnectMode = (s: CanvasStoreState) => s.selection.isGraphConnectMode;
export const selectGraphConnectSource = (s: CanvasStoreState) => s.selection.graphConnectSource;
export const selectGraphConnectSelection = (s: CanvasStoreState) => s.selection.graphConnectSelection;
export const selectGraphRefreshToken = (s: CanvasStoreState) => s.selection.graphRefreshToken;
export const selectSelectedSchedulerSlot = (s: CanvasStoreState) => s.selection.selectedSchedulerSlot;
export const selectSelectedSchedulerContainerId = (s: CanvasStoreState) => s.selection.selectedSchedulerContainerId;
export const selectSchedulerPopoverPadletId = (s: CanvasStoreState) => s.selection.schedulerPopoverPadletId;
