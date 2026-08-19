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
 * physical world stage, sized to a full viewport dimension per side (the worst
 * case: pointer anchored at the far viewport edge, focal point at the
 * opposite world edge, needs exactly that much slack). The gutter is applied
 * entirely at the DOM/layout level by the caller. This hook tracks the
 * gutter and accepts a fixed world-origin offset solely for the initial seed;
 * anchored zoom continues to operate in physical-stage coordinates.
 */
export function useCanvasCamera(
  containerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  initialWorldOriginOffsetX = 0,
  initialWorldOriginOffsetY = 0,
  // PATCH FREEFORM-ZOOM-A: the fallback zoom when there is no existing/
  // restored camera state -- defaults to the pre-patch value of 1 so every
  // OTHER caller of this generic hook (e.g. Gantt, which reuses the same
  // canvasZoom/handleZoomIn/Out/Reset for its own unrelated zoom feature) is
  // completely unaffected. CanvasClient passes FREEFORM_DEFAULT_ZOOM here
  // only when the active layout is actually Freeform.
  initialZoom = 1,
) {
  const [canvasZoom, setCanvasZoom] = useState(initialZoom);
  // Mirrors canvasZoom but updated synchronously (not batched), so rapid
  // consecutive zoomAtViewportPoint calls within the same tick (e.g. a burst
  // of Ctrl+wheel events) each compose on top of the previous call's result
  // instead of a stale pre-render closure value.
  const zoomRef = useRef(initialZoom);
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
  const [viewportElement, setViewportElementState] = useState<HTMLDivElement | null>(null);
  const seededViewportRef = useRef<HTMLDivElement | null>(null);

  // Ref mutation is not reactive. CanvasViewport calls this stable callback
  // when its real DOM node mounts or unmounts so camera setup can run only
  // after dimensions are available.
  const setViewportElement = useCallback((element: HTMLDivElement | null) => {
    if (!element) seededViewportRef.current = null;
    setViewportElementState((current) => current === element ? current : element);
  }, []);

  useEffect(() => {
    zoomRef.current = canvasZoom;
  }, [canvasZoom]);

  useEffect(() => {
    gutterRef.current = { x: gutterX, y: gutterY };
  }, [gutterX, gutterY]);

  // Measures the real viewport size once mounted/enabled (synchronously,
  // before paint) and seeds the initial camera to the logical-world-origin scroll
  // position -- both together, so the first frame ever shown already has
  // world (0,0) positioned deliberately, not wherever the raw gutter math
  // happens to land it. Runs once per enabling; guarded so later re-renders
  // (or later gutter changes, handled separately below) never reseed and
  // jump the user's camera back.
  //
  // PATCH FREEFORM-ZOOM-B: the gutter itself stays a full viewport per side
  // (unchanged -- shrinking it would reintroduce PATCH 9S.1's low-zoom clamp
  // defect), but the SEED TARGET within that gutter now lands world (0,0) at
  // screen CENTER (measuredX/Y / 2) instead of the pre-patch screen (0,0)
  // top-left corner -- the confirmed live problem ("Freeform starts near the
  // upper-left of the viewport"). Math.max(0, ...) guards the formula the
  // same way every other scroll write in this hook does; in practice
  // initialWorldOriginOffsetX/Y * zoom is always far larger than half a
  // viewport for real Freeform geometry, so this never actually clamps.
  useLayoutEffect(() => {
    if (!enabled || !viewportElement || seededViewportRef.current === viewportElement) return;
    const container = viewportElement;
    const measuredX = Math.max(container.clientWidth, 1);
    const measuredY = Math.max(container.clientHeight, 1);
    gutterRef.current = { x: measuredX, y: measuredY };
    setGutterX(measuredX);
    setGutterY(measuredY);
    container.scrollLeft = Math.max(0, measuredX / 2 + initialWorldOriginOffsetX * zoomRef.current);
    container.scrollTop = Math.max(0, measuredY / 2 + initialWorldOriginOffsetY * zoomRef.current);
    seededViewportRef.current = viewportElement;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, viewportElement, initialWorldOriginOffsetX, initialWorldOriginOffsetY]);

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
    if (!viewportElement || typeof ResizeObserver === 'undefined') return;
    const container = viewportElement;

    const observer = new ResizeObserver(() => {
      const el = viewportElement;
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
  }, [enabled, viewportElement]);

  /**
   * The single camera primitive every zoom entry point (toolbar +/-, reset,
   * Ctrl+wheel) funnels through. anchorX/anchorY are viewport-local SCREEN
   * pixels -- the world point currently under that pixel stays under it
   * after the zoom, by compensating scroll rather than the transform origin.
   * Folds in the current gutter so the formula matches the physical-stage
   * DOM contract. The fixed logical-origin offset is already part of the
   * physical coordinate and therefore needs no special zoom compensation.
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

  /**
   * Moves the native scroll camera by a WORLD-space delta. When a zoom is
   * pending, compose onto its logical target so the zoom's post-render apply
   * cannot overwrite this pan. Otherwise mutate the live viewport directly.
   */
  const panByWorldDelta = useCallback((dxWorld: number, dyWorld: number) => {
    if (!Number.isFinite(dxWorld) || !Number.isFinite(dyWorld)) return;
    const container = containerRef.current;
    if (!container) return;

    const zoom = zoomRef.current;
    const pending = pendingLogicalScrollRef.current;
    const next = {
      left: (pending?.left ?? container.scrollLeft) + dxWorld * zoom,
      top: (pending?.top ?? container.scrollTop) + dyWorld * zoom,
    };

    if (pendingApplyRef.current) {
      pendingLogicalScrollRef.current = next;
      pendingApplyRef.current = next;
      return;
    }

    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const maxScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
    container.scrollLeft = clamp(next.left, 0, maxScrollLeft);
    container.scrollTop = clamp(next.top, 0, maxScrollTop);
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
    panByWorldDelta,
    handleZoomIn,
    handleZoomOut,
    handleZoomReset,
    gutterX,
    gutterY,
    setViewportElement,
  };
}
