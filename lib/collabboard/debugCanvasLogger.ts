/**
 * Canvas debug event logger.
 * Activated by setting NEXT_PUBLIC_DEBUG_CANVAS=true in your environment.
 *
 * Instrument points (see canvas-refactor-contracts.md §0.2):
 *   pointerDown    – handlePadletMouseDown
 *   pointerUp      – handleCanvasMouseUp
 *   dragStart      – handleCanvasMouseMove when isDragging flips true
 *   dragMove       – handleCanvasMouseMove position update
 *   dragEnd        – handleCanvasMouseUp cleanup path
 *   selectionChange – setSelectedPadletId / setSelectedLineId
 *   saveStart      – saveLineToDb, updateLine, deletePadletById, requestDeletePadlet
 *   saveEnd        – saveLineToDb, updateLine, deletePadletById, requestDeletePadlet
 *   realtimeUpdate – handleRealtimePadletChange
 */

const isEnabled =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_DEBUG_CANVAS === 'true';

export type CanvasDebugEvent =
  | 'pointerDown'
  | 'pointerUp'
  | 'dragStart'
  | 'dragMove'
  | 'dragEnd'
  | 'selectionChange'
  | 'saveStart'
  | 'saveEnd'
  | 'realtimeUpdate';

export function debugCanvasLogger(
  event: CanvasDebugEvent,
  payload: Record<string, unknown>
): void {
  if (!isEnabled) return;
  // eslint-disable-next-line no-console
  console.log(`[canvas:${event}]`, { t: Date.now(), ...payload });
}
