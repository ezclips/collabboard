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
 *
 * PATCH 9S.2: native scroll cannot go negative, so a focal point near the
 * world's own edges became unrepresentable at low zoom (PATCH 9S.1's root
 * cause). Fixed by a CAMERA GUTTER -- blank scrollable space surrounding the
 * 10000x10000 world, sized to a full viewport dimension per side (the worst
 * case: pointer anchored at the far viewport edge, focal point at the
 * opposite world edge, needs exactly that much slack). The gutter is applied
 * entirely at the DOM/layout level by the caller (CanvasClient positions the
 * scaled world-stage wrapper at `left: gutterX, top: gutterY` instead of
 * `inset-0`); this hook only tracks the gutter's live size and folds it into
 * the same zoomAtViewportPoint formula.
 */
export function useCanvasCamera(containerRef: React.RefObject<HTMLDivElement | null>, enabled: boolean) {
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

  // Camera gutter (screen px, unscaled): blank scrollable space before/after
  // the world on each axis. Starts at 0 -- the mount-time layout effect
  // below measures and seeds it, synchronously, before first paint, so
  // there is never a visible "gutter appears" flash.
  const [gutterX, setGutterX] = useState(0);
  const [gutterY, setGutterY] = useState(0);
  const gutterRef = useRef({ x: 0, y: 0 });
  const hasSeededRef = useRef(false);

  useEffect(() => {
    zoomRef.current = canvasZoom;
  }, [canvasZoom]);

  useEffect(() => {
    gutterRef.current = { x: gutterX, y: gutterY };
  }, [gutterX, gutterY]);

  // Measures the real viewport size once mounted/enabled (synchronously,
  // before paint) and seeds the initial camera to the world-origin scroll
  // position -- both together, so the first frame ever shown already has
  // world (0,0) at the top-left of the WORLD, not of the gutter. Runs once
  // per enabling; guarded so later re-renders (or later gutter changes,
  // handled separately below) never reseed and jump the user's camera back.
  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;
    const measuredX = Math.max(container.clientWidth, 1);
    const measuredY = Math.max(container.clientHeight, 1);
    gutterRef.current = { x: measuredX, y: measuredY };
    setGutterX(measuredX);
    setGutterY(measuredY);
    if (!hasSeededRef.current) {
      container.scrollLeft = measuredX;
      container.scrollTop = measuredY;
      hasSeededRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  // Keeps the gutter tracking the viewport's LIVE size on resize (browser
  // resize, sidebar toggle, devtools opening). A gutter smaller than the
  // current viewport would reintroduce PATCH 9S.1's clamp defect at some
  // anchor position, so it cannot be a fixed value measured only once.
  // When the gutter changes, every world point's screen position would
  // otherwise shift by exactly that delta -- compensated here by adjusting
  // scroll by the same delta, a pure scroll adjustment (no second camera
  // translation state; native scroll remains the only camera).
  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(() => {
      const el = containerRef.current;
      if (!el) return;
      const nextX = Math.max(el.clientWidth, 1);
      const nextY = Math.max(el.clientHeight, 1);
      const prev = gutterRef.current;
      if (nextX === prev.x && nextY === prev.y) return;

      const deltaX = nextX - prev.x;
      const deltaY = nextY - prev.y;
      el.scrollLeft = Math.max(0, el.scrollLeft + deltaX);
      el.scrollTop = Math.max(0, el.scrollTop + deltaY);

      gutterRef.current = { x: nextX, y: nextY };
      setGutterX(nextX);
      setGutterY(nextY);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [enabled, containerRef]);

  /**
   * The single camera primitive every zoom entry point (toolbar +/-, reset,
   * Ctrl+wheel) funnels through. anchorX/anchorY are viewport-local SCREEN
   * pixels -- the world point currently under that pixel stays under it
   * after the zoom, by compensating scroll rather than the transform origin.
   * Folds in the current gutter so the formula matches the DOM contract:
   * screen = world*zoom + gutter - scroll  =>  world = (scroll+anchor-gutter)/zoom.
   */
  const zoomAtViewportPoint = useCallback((zoomInput: ZoomInput, anchorX: number, anchorY: number) => {
    const oldZoom = zoomRef.current;
    const desiredZoom = typeof zoomInput === 'function' ? zoomInput(oldZoom) : zoomInput;
    const newZoom = clamp(desiredZoom, MIN_ZOOM, MAX_ZOOM);
    if (newZoom === oldZoom) return;

    const container = containerRef.current;
    if (container) {
      const { x: gx, y: gy } = gutterRef.current;
      const logical = pendingLogicalScrollRef.current;
      const oldScrollLeft = logical ? logical.left : container.scrollLeft;
      const oldScrollTop = logical ? logical.top : container.scrollTop;
      const worldX = (oldScrollLeft + anchorX - gx) / oldZoom;
      const worldY = (oldScrollTop + anchorY - gy) / oldZoom;
      const next = {
        left: worldX * newZoom + gx - anchorX,
        top: worldY * newZoom + gy - anchorY,
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
    gutterX,
    gutterY,
  };
}
