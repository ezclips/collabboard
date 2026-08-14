"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type ZoomInput = number | ((oldZoom: number) => number);

interface PendingCameraScroll {
  left: number;
  top: number;
}

/**
 * PATCH 9S: camera-anchored Freeform zoom. canvasZoom is the sole camera
 * state (scrollLeft/scrollTop of the caller's viewport element ARE the
 * camera position -- there is no separate cameraX/cameraY). transformOrigin
 * stays '0 0' everywhere; anchoring is achieved purely by compensating
 * scroll after the new zoom renders, never by moving the transform origin.
 */
export function useCanvasCamera(containerRef: React.RefObject<HTMLDivElement | null>) {
  const [canvasZoom, setCanvasZoom] = useState(1);
  // Mirrors canvasZoom but updated synchronously (not batched), so rapid
  // consecutive zoomAtViewportPoint calls within the same tick (e.g. a burst
  // of Ctrl+wheel events) each compose on top of the previous call's result
  // instead of a stale pre-render closure value.
  const zoomRef = useRef(1);
  // The scroll target computed by the MOST RECENT zoomAtViewportPoint call
  // that has not yet actually committed to the DOM. React batches all
  // zoomAtViewportPoint calls inside one synchronous burst into a single
  // commit, so container.scrollLeft/scrollTop do NOT move between calls in
  // that burst -- without this, a second call in the same burst would build
  // its anchor math on the still-stale pre-burst scroll position instead of
  // the first call's (not-yet-applied) result, breaking anchor composition.
  // Cleared the instant the batch commits (see the layout effect below), so
  // any real scroll/pan that happens between batches is read fresh from the
  // DOM on the next call, never from a cross-batch-stale cached value.
  const pendingLogicalScrollRef = useRef<PendingCameraScroll | null>(null);
  const pendingApplyRef = useRef<PendingCameraScroll | null>(null);

  useEffect(() => {
    zoomRef.current = canvasZoom;
  }, [canvasZoom]);

  /**
   * The single camera primitive every zoom entry point (toolbar +/-, reset,
   * Ctrl+wheel) funnels through. anchorX/anchorY are viewport-local SCREEN
   * pixels -- the world point currently under that pixel stays under it
   * after the zoom, by compensating scroll rather than the transform origin.
   */
  const zoomAtViewportPoint = useCallback((zoomInput: ZoomInput, anchorX: number, anchorY: number) => {
    const oldZoom = zoomRef.current;
    const desiredZoom = typeof zoomInput === 'function' ? zoomInput(oldZoom) : zoomInput;
    const newZoom = clamp(desiredZoom, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;

    const container = containerRef.current;
    if (container) {
      const logical = pendingLogicalScrollRef.current;
      const oldScrollLeft = logical ? logical.left : container.scrollLeft;
      const oldScrollTop = logical ? logical.top : container.scrollTop;
      const worldX = (oldScrollLeft + anchorX) / oldZoom;
      const worldY = (oldScrollTop + anchorY) / oldZoom;
      const next = {
        left: worldX * newZoom - anchorX,
        top: worldY * newZoom - anchorY,
      };
      pendingLogicalScrollRef.current = next;
      pendingApplyRef.current = next;
    }

    zoomRef.current = newZoom;
    setCanvasZoom(newZoom);
  }, [containerRef]);

  // Applies the pending scroll compensation after the new zoom's transform
  // has actually committed to the DOM, reading LIVE post-render
  // scrollWidth/scrollHeight/clientWidth/clientHeight -- never a
  // worldStageSize*zoom estimate, which can diverge from real DOM extent.
  useLayoutEffect(() => {
    const pending = pendingApplyRef.current;
    pendingApplyRef.current = null;
    pendingLogicalScrollRef.current = null;
    if (!pending) return;
    const container = containerRef.current;
    if (!container) return;
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollLeft = clamp(pending.left, 0, maxScrollLeft);
    container.scrollTop = clamp(pending.top, 0, maxScrollTop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasZoom]);

  const centerAnchor = useCallback((): { anchorX: number; anchorY: number } => {
    const container = containerRef.current;
    return {
      anchorX: container ? container.clientWidth / 2 : 0,
      anchorY: container ? container.clientHeight / 2 : 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleZoomIn = useCallback(() => {
    const { anchorX, anchorY } = centerAnchor();
    zoomAtViewportPoint((z) => z + ZOOM_STEP, anchorX, anchorY);
  }, [centerAnchor, zoomAtViewportPoint]);

  const handleZoomOut = useCallback(() => {
    const { anchorX, anchorY } = centerAnchor();
    zoomAtViewportPoint((z) => z - ZOOM_STEP, anchorX, anchorY);
  }, [centerAnchor, zoomAtViewportPoint]);

  const handleZoomReset = useCallback(() => {
    const { anchorX, anchorY } = centerAnchor();
    zoomAtViewportPoint(1, anchorX, anchorY);
  }, [centerAnchor, zoomAtViewportPoint]);

  return {
    canvasZoom,
    setCanvasZoom,
    zoomAtViewportPoint,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
  };
}
