import { buildDrawingSceneUpdate } from '@/lib/infra/drawing/importScene';

/**
 * Minimal shape of the live Excalidraw imperative API this module needs --
 * intentionally untyped against the full `ExcalidrawImperativeAPI` so this
 * file has no dependency on the Excalidraw package's own type exports.
 */
export interface DrawingMinimapExcalidrawAPI {
  getAppState?: () => any;
  getSceneElements?: () => readonly any[];
  updateScene: (sceneData: any) => void;
}

/**
 * Pans the Drawing viewport by a WORLD-unit delta, view-only: reads the
 * live scene elements and passes them straight back through unchanged (no
 * element is added, removed, or mutated), and updates only scrollX/scrollY
 * on appState. Uses the exact same `buildDrawingSceneUpdate(..., {
 * commitToHistory: false })` call shape DrawingLayout's own `applyZoom`
 * already uses for its zoom in/out/reset buttons -- the established,
 * already-shipped pattern in this codebase for a view-only appState change
 * that must not create a durable undo entry or touch drawing content.
 */
export function panDrawingViewportByWorldDelta(
  excalidrawAPI: DrawingMinimapExcalidrawAPI | null | undefined,
  deltaWorldX: number,
  deltaWorldY: number,
): void {
  if (!excalidrawAPI || typeof excalidrawAPI.updateScene !== 'function') return;
  if (!Number.isFinite(deltaWorldX) || !Number.isFinite(deltaWorldY)) return;
  if (deltaWorldX === 0 && deltaWorldY === 0) return;

  const appState = excalidrawAPI.getAppState?.();
  const elements = excalidrawAPI.getSceneElements?.();
  if (!appState || !elements) return;

  excalidrawAPI.updateScene({
    ...buildDrawingSceneUpdate({
      elements: elements as unknown[],
      appState: {
        ...appState,
        scrollX: (appState.scrollX || 0) - deltaWorldX,
        scrollY: (appState.scrollY || 0) - deltaWorldY,
      },
      commitToHistory: false,
    }),
  });
}
