/**
 * Action types for the canvas store (PR4 scope: editors + selection groups only).
 */

import type { CanvasEditorsState, CanvasSelectionState } from './types';

export type CanvasAction =
  /**
   * Patch one or more fields in the editors slice.
   * Functional-update values are pre-computed at the call site before dispatch.
   */
  | { type: 'EDITORS_PATCH'; payload: Partial<CanvasEditorsState> }
  /**
   * Patch one or more fields in the selection slice.
   * Functional-update values are pre-computed at the call site before dispatch.
   */
  | { type: 'SELECTION_PATCH'; payload: Partial<CanvasSelectionState> };
