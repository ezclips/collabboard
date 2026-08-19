"use client";

import { useEffect, useRef, useState } from 'react';
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
 */
export function useDrawingMinimapScene(
  excalidrawAPI: DrawingMinimapExcalidrawAPIWithReaders | null | undefined,
): DrawingMinimapSceneState {
  const [state, setState] = useState<DrawingMinimapSceneState>(EMPTY_STATE);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!excalidrawAPI || typeof excalidrawAPI.onChange !== 'function') {
      setState(EMPTY_STATE);
      return;
    }

    let mounted = true;

    const measure = () => {
      rafRef.current = null;
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
      if (rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const unsubscribe = excalidrawAPI.onChange(scheduleMeasure);

    return () => {
      mounted = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [excalidrawAPI]);

  return state;
}
