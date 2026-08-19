"use client";

import { useEffect, useState } from 'react';
import {
  getDrawingViewportWorldRect,
  getExcalidrawElementBounds,
  type WorldRect,
} from './drawingMinimapGeometry';
import type { DrawingMinimapExcalidrawAPI } from './drawingMinimapNavigation';

interface DrawingMinimapExcalidrawAPIWithReaders extends DrawingMinimapExcalidrawAPI {
  onChange?: (callback: (elements: readonly any[], appState: any, files: any) => void) => (() => void) | void;
}

export interface DrawingMinimapSceneState {
  elementRects: WorldRect[];
  viewportWorldRect: WorldRect | null;
}

const EMPTY_STATE: DrawingMinimapSceneState = { elementRects: [], viewportWorldRect: null };

/**
 * Tracks a lightweight, rAF-throttled snapshot of the live Excalidraw scene
 * for the Drawing minimap: each element's bounding footprint, and the
 * current viewport rect derived from appState. Subscribes directly to the
 * live `excalidrawAPI.onChange` -- a wholly separate, self-contained
 * subscription from DrawingLayout's own `handleChange` pipeline, so this
 * hook cannot regress persistence/save/undo/embeddable-sync behavior no
 * matter what it reads. Read-only, never calls any mutating API.
 *
 * PATCH DRAWING-MINIMAP-B: the scheduled-frame id MUST be a plain local
 * variable, not a `useRef`. React 18 dev-mode Strict Mode mounts this
 * effect, immediately runs its cleanup, then mounts it again for the same
 * commit; a `useRef`-held id survives that cleanup (refs are not reset
 * between the two invocations), so the first invocation's cleanup cancels
 * the just-scheduled frame without clearing the ref, leaving it non-null --
 * the second (real, persisting) invocation's own `scheduleMeasure` then
 * sees a stale non-null id and skips scheduling forever, so `measure` never
 * runs even once and this hook's state never leaves EMPTY_STATE. A local
 * `let` gets a fresh binding on every effect invocation, exactly like the
 * (unaffected) Freeform minimap's own `useFreeformMinimapViewport` already
 * does -- mirrored here deliberately, not copied by import (Freeform stays
 * untouched).
 */
export function useDrawingMinimapScene(
  excalidrawAPI: DrawingMinimapExcalidrawAPIWithReaders | null | undefined,
): DrawingMinimapSceneState {
  const [state, setState] = useState<DrawingMinimapSceneState>(EMPTY_STATE);

  useEffect(() => {
    if (!excalidrawAPI || typeof excalidrawAPI.onChange !== 'function') {
      setState(EMPTY_STATE);
      return;
    }

    let mounted = true;
    let frameId: number | null = null;

    const measure = () => {
      frameId = null;
      if (!mounted) return;
      const elements = typeof excalidrawAPI.getSceneElements === 'function'
        ? excalidrawAPI.getSceneElements()
        : [];
      const elementRects: WorldRect[] = [];
      for (const el of elements ?? []) {
        const rect = getExcalidrawElementBounds(el);
        if (rect) elementRects.push(rect);
      }
      const appState = typeof excalidrawAPI.getAppState === 'function' ? excalidrawAPI.getAppState() : null;
      const viewportWorldRect = getDrawingViewportWorldRect(appState);
      setState({ elementRects, viewportWorldRect });
    };

    const scheduleMeasure = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const unsubscribe = excalidrawAPI.onChange(scheduleMeasure);

    return () => {
      mounted = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [excalidrawAPI]);

  return state;
}
