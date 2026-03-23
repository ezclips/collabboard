/**
 * Canvas store reducer (PR4 scope: editors + selection groups).
 */

import type { CanvasStoreState } from './types';
import type { CanvasAction } from './actions';

export function canvasReducer(
  state: CanvasStoreState,
  action: CanvasAction
): CanvasStoreState {
  switch (action.type) {
    case 'EDITORS_PATCH':
      return { ...state, editors: { ...state.editors, ...action.payload } };
    case 'SELECTION_PATCH':
      return { ...state, selection: { ...state.selection, ...action.payload } };
    default:
      return state;
  }
}
