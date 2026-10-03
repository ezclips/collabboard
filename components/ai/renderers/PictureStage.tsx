'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import {
  STAGE_ZOOM_STEP,
  clampZoom,
  fitScale,
  parseViewBox,
  scaleViewBox,
  viewBoxToString,
  type ViewBox,
} from '@/lib/ai/antv/viewbox';

/**
 * PATCH-245. One shared interactive stage for AI pictures: the Edit window's
 * picture-first view and its "Live preview", and the Show options large preview.
 * It fills its box (no inner scrollbars, a light dotted background like the
 * board) and lets the picture be zoomed and moved the way the board can.
 *
 * View only: zoom/pan are never saved, make no request, and reset to Fit when
 * the design or theme changes. It scales in one of two ways:
 *   - `css`  -- a CSS transform on one inner wrapper that holds the picture AND
 *              its overlay, so handles/inputs move with it.
 *   - `antv` -- the SVG's own `viewBox`, the mechanism AntV's ZoomWheel/
 *              DragCanvas use, so AntV's state stays consistent and its edit bar
 *              (positioned from getBoundingClientRect) is never scaled twice.
 */

export type PictureStageMode = 'css' | 'antv';

/**
 * PATCH-245 Addendum 1. The stage's current zoom, so overlay chrome (the +/−
 * circles, the rename input, the colour popover) can counter-scale to stay a
 * constant size on screen. Defaults to 1 outside a stage.
 */
export const PictureZoomContext = React.createContext(1);

/**
 * PATCH-263 Addendum 3. The SVG-fill rule must match only the picture's own AntV
 * svg, never a lucide icon inside our overlay chrome (`[data-picture-control]`,
 * `[data-ai-edit-overlay]`), which the old bare `[data-picture-content] svg`
 * stretched to the popover width (the ~250px "Reset colour" icon).
 */
export const ANTV_PICTURE_SVG_SELECTOR =
  '[data-picture-stage][data-picture-mode="antv"] [data-picture-content] [data-antv-container] svg';

/**
 * PATCH-263 Addendum 3. The picture's own svg, never an overlay icon even when
 * the overlay (with its own svgs) precedes the picture in the DOM.
 */
export function findPictureSvg(stage: HTMLElement | null): SVGSVGElement | null {
  if (!stage) return null;
  const scoped = stage.querySelector('[data-antv-container] svg');
  if (scoped) return scoped as SVGSVGElement;
  const fallback = Array.from(stage.querySelectorAll('svg')).find(
    (svg) => !svg.closest('[data-picture-control], [data-ai-edit-overlay]'),
  );
  return (fallback as SVGSVGElement | undefined) ?? null;
}

export interface PictureStageProps {
  mode?: PictureStageMode;
  /** Changing this resets to Fit (design/theme identity). */
  resetKey?: string | number;
  children: React.ReactNode;
  className?: string;
  'aria-label'?: string;
  /** PATCH-245. Called after the AntV viewBox changes so overlays can recompute. */
  onViewBoxChange?: () => void;
}

/** A pointer press that starts on one of these never pans the stage. */
const PAN_BLOCK_SELECTOR =
  '[data-ai-edit-ref],[data-ai-edit-add],[data-ai-edit-remove],[data-ai-edit-shape],input,[data-element-type],[data-picture-control]';

function isTextEntry(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element?.tagName) return false;
  const tag = element.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || element.isContentEditable === true;
}

function PictureStage({
  mode = 'css',
  resetKey,
  children,
  className,
  'aria-label': ariaLabel,
  onViewBoxChange,
}: PictureStageProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  // css view: zoom is the scale, pan is the translation away from the fitted
  // (centred) position, in stage pixels.
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sizes, setSizes] = useState({ stageW: 0, stageH: 0, pictureW: 0, pictureH: 0 });

  // antv view: the SVG's viewBox. `natural` is its fitted viewBox at open.
  const [box, setBox] = useState<ViewBox | null>(null);
  const naturalRef = useRef<ViewBox | null>(null);
  // PATCH-258. `appliedRef` is the viewBox string the stage last wrote, so a
  // later AntV write can be told apart from the stage's own write-back (which is
  // what stops the observer from looping). `atFitRef` records whether the
  // current view is Fit, so an AntV rewrite re-fits when fitted but restores the
  // user's view when zoomed/panned.
  const appliedRef = useRef<string | null>(null);
  const atFitRef = useRef(true);

  const [panning, setPanning] = useState(false);
  const spaceRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    startBox: ViewBox | null;
  } | null>(null);

  // Refs mirror the state so pointer/wheel handlers read fresh values without
  // re-binding listeners on every frame.
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const panRef = useRef(pan);
  panRef.current = pan;
  const boxRef = useRef(box);
  boxRef.current = box;
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const onViewBoxChangeRef = useRef(onViewBoxChange);
  onViewBoxChangeRef.current = onViewBoxChange;

  const findSvg = (): SVGSVGElement | null => findPictureSvg(stageRef.current);

  /**
   * PATCH-245 Addendum 2. AntV renders the svg at `height: auto` (a thin strip in
   * a large stage). Inside the stage the svg fills it; AntV may rewrite the
   * attributes on every render/update, so this is re-applied from the observer.
   */
  const fillSvg = useCallback((svg: SVGSVGElement) => {
    if (svg.getAttribute('width') !== '100%') svg.setAttribute('width', '100%');
    if (svg.getAttribute('height') !== '100%') svg.setAttribute('height', '100%');
    if (svg.style.width !== '100%') svg.style.width = '100%';
    if (svg.style.height !== '100%') svg.style.height = '100%';
    svg.style.maxHeight = 'none';
    if (svg.getAttribute('preserveAspectRatio') !== 'xMidYMid meet') {
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
  }, []);

  /**
   * The on-screen scale of a viewBox inside the stage's SVG viewport, computed
   * with `preserveAspectRatio="xMidYMid meet"` (so letterboxing is accounted
   * for). Used for the zoom display AND to convert screen deltas to viewBox
   * units when panning.
   */
  const antvScale = useCallback((box: ViewBox) => {
    const s = sizesRef.current;
    const svg = findSvg();
    const rect = svg?.getBoundingClientRect();
    const width = rect?.width || s.stageW || box.width;
    const height = rect?.height || s.stageH || box.height;
    return Math.min(width / box.width, height / box.height);
  }, []);

  /**
   * PATCH-258 addendum. The scale shown in the zoom display. Inside the stage
   * the svg is forced to fill it, so the STAGE is the real on-screen viewport;
   * a freshly re-rendered svg is transiently its thin auto-height strip, and
   * reading that (as `antvScale` must, for pointer math) made a fitted picture
   * report e.g. 16% instead of 60%. Prefer the measured stage, and only fall
   * back to the svg rect when the stage has not been measured yet.
   */
  const antvDisplayScale = useCallback((box: ViewBox) => {
    const s = sizesRef.current;
    if (s.stageW > 0 && s.stageH > 0) {
      return Math.min(s.stageW / box.width, s.stageH / box.height);
    }
    return antvScale(box);
  }, [antvScale]);

  const applyBox = useCallback((next: ViewBox) => {
    const svg = findSvg();
    if (!svg) return;
    fillSvg(svg);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    const raw = viewBoxToString(next);
    appliedRef.current = raw;
    svg.setAttribute('viewBox', raw);
    onViewBoxChangeRef.current?.();
  }, [fillSvg]);

  const setPanValue = useCallback((next: { x: number; y: number }) => {
    panRef.current = next;
    setPan(next);
  }, []);

  const setZoomValue = useCallback((next: number) => {
    zoomRef.current = next;
    setZoom(next);
  }, []);

  const setBoxValue = useCallback((next: ViewBox | null) => {
    boxRef.current = next;
    setBox(next);
  }, []);

  // ── Fit / measure ──────────────────────────────────────────────────────────

  const measure = useCallback(() => {
    const stage = stageRef.current;
    const content = contentRef.current;
    const stageW = stage?.clientWidth || Math.round(stage?.getBoundingClientRect().width ?? 0);
    const stageH = stage?.clientHeight || Math.round(stage?.getBoundingClientRect().height ?? 0);
    const measuredW = content?.offsetWidth || 0;
    const measuredH = content?.offsetHeight || 0;
    // jsdom and a not-yet-laid-out picture report 0: fall back to the stage so
    // Fit never collapses the picture to the 25% floor.
    const pictureW = measuredW > 0 ? measuredW : stageW;
    const pictureH = measuredH > 0 ? measuredH : stageH;
    const next = { stageW, stageH, pictureW, pictureH };
    sizesRef.current = next;
    setSizes(next);
  }, []);

  const fit = useCallback(() => {
    atFitRef.current = true;
    if (modeRef.current === 'antv') {
      const natural = naturalRef.current;
      if (!natural) return;
      const s = sizesRef.current;
      const svg = findSvg();
      const rect = svg?.getBoundingClientRect();
      const stageW = s.stageW || rect?.width || 0;
      const stageH = s.stageH || rect?.height || 0;
      if (!(stageW > 0) || !(stageH > 0)) {
        setBoxValue(natural);
        applyBox(natural);
        return;
      }
      // PATCH-245 Addendum 2. Fit to the clamped meet scale, expressed as a
      // viewBox that fills the stage: content-to-stage scale = min(stageW /
      // contentW, stageH / contentH), clamped 25%–200%.
      const scale = fitScale(stageW, stageH, natural.width, natural.height);
      const width = stageW / scale;
      const height = stageH / scale;
      const centreX = natural.x + natural.width / 2;
      const centreY = natural.y + natural.height / 2;
      const next = { x: centreX - width / 2, y: centreY - height / 2, width, height };
      setBoxValue(next);
      applyBox(next);
      return;
    }
    const s = sizesRef.current;
    const next = fitScale(s.stageW, s.stageH, s.pictureW, s.pictureH);
    setZoomValue(next);
    setPanValue({ x: 0, y: 0 });
  }, [applyBox, setBoxValue, setPanValue, setZoomValue]);

  // PATCH-265. A stage resize (a side panel opening/closing, a window resize,
  // the modal changing width) must not throw away a user's zoom/pan. A fitted
  // view re-fits as before; a user-chosen view keeps its on-screen scale and the
  // content point that was at the old stage centre at the new stage centre.
  const keepViewOnResize = useCallback(() => {
    const prev = sizesRef.current;
    measure();
    if (atFitRef.current) {
      fit();
      return;
    }
    const next = sizesRef.current;
    if (modeRef.current === 'antv') {
      const current = boxRef.current;
      const scale = current && prev.stageW > 0 ? prev.stageW / current.width : 0;
      if (!current || !(scale > 0) || !(next.stageW > 0) || !(next.stageH > 0)) {
        fit();
        return;
      }
      const width = next.stageW / scale;
      const height = next.stageH / scale;
      const centreX = current.x + current.width / 2;
      const centreY = current.y + current.height / 2;
      const box = { x: centreX - width / 2, y: centreY - height / 2, width, height };
      setBoxValue(box);
      applyBox(box);
      return;
    }
    if (!(prev.stageW > 0) || !(prev.stageH > 0)) {
      fit();
      return;
    }
    // CSS: keep the zoom; the fitted picture is always centred, so pan only
    // shifts if the measured picture size itself changed.
    const zoom = zoomRef.current;
    const pan = panRef.current;
    setPanValue({
      x: pan.x + ((next.pictureW - prev.pictureW) * zoom) / 2,
      y: pan.y + ((next.pictureH - prev.pictureH) * zoom) / 2,
    });
  }, [applyBox, fit, measure, setBoxValue, setPanValue]);

  // Keep Fit correct when the box resizes.
  useLayoutEffect(() => {
    measure();
    const onResize = () => keepViewOnResize();
    window.addEventListener('resize', onResize);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => keepViewOnResize());
    if (observer && stageRef.current) observer.observe(stageRef.current);
    return () => {
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, [measure, keepViewOnResize]);

  // Reset to Fit when the design/theme changes.
  useEffect(() => {
    if (modeRef.current === 'antv') {
      naturalRef.current = null;
      atFitRef.current = true;
      setBoxValue(null);
      return;
    }
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // AntV: read the SVG's fitted viewBox once it exists, and write the view back
  // whenever it changes. Also re-init after a design/theme reset.
  useEffect(() => {
    if (mode !== 'antv') return;
    const stage = stageRef.current;
    if (!stage) return;

    const syncSvg = () => {
      const svg = findSvg();
      if (!svg) return false;
      fillSvg(svg);
      const current = svg.getAttribute('viewBox');
      if (!naturalRef.current) {
        // PATCH-258 addendum. After a reset the DOM may still hold the box the
        // stage itself last wrote (the old design's fit). Never take that as the
        // new natural: wait for AntV to write its own final fitted box, so the
        // display is computed against the right one.
        if (current && appliedRef.current && current === appliedRef.current) return true;
        const viewBox = parseViewBox(current);
        if (!viewBox) return false;
        naturalRef.current = viewBox;
        fit();
        onViewBoxChangeRef.current?.();
        return true;
      }
      // PATCH-258. The stage's own writes are ignored; anything else is AntV
      // rewriting the viewBox after an update. Take its box as the new natural
      // (the content may have changed size) and put the user's view back, so an
      // edit never resets the zoom/position. A fitted picture instead stays
      // fitted to the new content.
      if (!current || current === appliedRef.current) return true;
      const rewritten = parseViewBox(current);
      if (!rewritten) return true;
      naturalRef.current = rewritten;
      if (atFitRef.current || !boxRef.current) {
        fit();
      } else {
        applyBox(boxRef.current);
      }
      return true;
    };

    syncSvg();
    const observer = new MutationObserver(() => {
      // AntV rewrites width/height on every render/update: re-fill, and fit once
      // the svg first appears.
      syncSvg();
    });
    observer.observe(stage, { childList: true, subtree: true, attributes: true });
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, resetKey, fillSvg, fit, applyBox]);

  // ── Zoom / pan operations ──────────────────────────────────────────────────

  const stagePoint = useCallback((clientX: number, clientY: number) => {
    const rect = stageRef.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  const zoomCssAt = useCallback(
    (factor: number, point: { x: number; y: number }) => {
      const s = sizesRef.current;
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      const nextZoom = clampZoom(currentZoom * factor);
      const baseX = (s.stageW - s.pictureW * currentZoom) / 2 + currentPan.x;
      const baseY = (s.stageH - s.pictureH * currentZoom) / 2 + currentPan.y;
      const contentX = (point.x - baseX) / currentZoom;
      const contentY = (point.y - baseY) / currentZoom;
      const nextOriginX = point.x - contentX * nextZoom;
      const nextOriginY = point.y - contentY * nextZoom;
      const nextBaseX = (s.stageW - s.pictureW * nextZoom) / 2;
      const nextBaseY = (s.stageH - s.pictureH * nextZoom) / 2;
      atFitRef.current = false;
      setZoomValue(nextZoom);
      setPanValue({ x: nextOriginX - nextBaseX, y: nextOriginY - nextBaseY });
    },
    [setPanValue, setZoomValue],
  );

  const zoomAntvAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      const currentBox = boxRef.current;
      if (!currentBox) return;
      const svg = findSvg();
      const rect = svg?.getBoundingClientRect();
      const rectWidth = rect?.width || sizesRef.current.stageW || 1;
      const rectHeight = rect?.height || sizesRef.current.stageH || 1;
      const currentZoom = antvScale(currentBox);
      const nextZoom = clampZoom(currentZoom * factor);
      const pivot = {
        x: currentBox.x + ((clientX - (rect?.left ?? 0)) / rectWidth) * currentBox.width,
        y: currentBox.y + ((clientY - (rect?.top ?? 0)) / rectHeight) * currentBox.height,
      };
      const next = scaleViewBox(currentBox, currentZoom / nextZoom, pivot);
      atFitRef.current = false;
      setBoxValue(next);
      applyBox(next);
    },
    [antvScale, applyBox, setBoxValue],
  );

  const applyZoomAt = useCallback(
    (factor: number, clientX: number, clientY: number) => {
      if (modeRef.current === 'antv') zoomAntvAt(factor, clientX, clientY);
      else zoomCssAt(factor, stagePoint(clientX, clientY));
    },
    [stagePoint, zoomAntvAt, zoomCssAt],
  );

  const centreClient = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    return {
      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
    };
  }, []);

  // ── Wheel ──────────────────────────────────────────────────────────────────

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      // PATCH-247. A plain wheel belongs to the window: no pan, no preventDefault,
      // so the surrounding panel scrolls as usual. Only Ctrl/⌘+wheel (a trackpad
      // pinch also arrives as ctrl+wheel) zooms at the pointer, and it is kept
      // from reaching the board behind the window.
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      event.stopPropagation();
      const factor = event.deltaY < 0 ? STAGE_ZOOM_STEP : 1 / STAGE_ZOOM_STEP;
      applyZoomAt(factor, event.clientX, event.clientY);
    },
    [applyZoomAt],
  );

  // PATCH-245 Addendum 1. React's `onWheel` is passive, so the Ctrl+wheel case
  // attaches explicitly non-passive to be able to preventDefault.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    stage.addEventListener('wheel', handleWheel, { passive: false });
    return () => stage.removeEventListener('wheel', handleWheel);
  }, [handleWheel]);

  // ── Drag to pan (empty background, or Space anywhere) ──────────────────────

  const onPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as Element | null;
    const blocked = !spaceRef.current && Boolean(target?.closest?.(PAN_BLOCK_SELECTOR));
    if (blocked) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPan: panRef.current,
      startBox: boxRef.current,
    };
    setPanning(true);
    try {
      (event.currentTarget as HTMLDivElement).setPointerCapture?.(event.pointerId);
    } catch {
      /* jsdom/no-capture environments: panning still works via window listeners */
    }

    const move = (moveEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || moveEvent.pointerId !== drag.pointerId) return;
      const dx = moveEvent.clientX - drag.startX;
      const dy = moveEvent.clientY - drag.startY;
      if (modeRef.current === 'antv') {
        const startBox = drag.startBox;
        if (!startBox) return;
        // Screen delta / the SVG's meet scale -> viewBox units; same sign on
        // both axes, so the content follows the pointer exactly.
        const scale = antvScale(startBox) || 1;
        const next = {
          ...startBox,
          x: startBox.x - dx / scale,
          y: startBox.y - dy / scale,
        };
        boxRef.current = next;
        atFitRef.current = false;
        setBox(next);
        applyBox(next);
      } else {
        atFitRef.current = false;
        setPanValue({ x: drag.startPan.x + dx, y: drag.startPan.y + dy });
      }
    };
    const up = (upEvent: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || upEvent.pointerId !== drag.pointerId) return;
      dragRef.current = null;
      setPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }, [antvScale, applyBox, setPanValue]);

  // Space + drag pans anywhere.
  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = true;
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') spaceRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  // ── Keyboard: + / - / 0 when the stage has focus and no input is focused ────

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (isTextEntry(event.target)) return;
      const centre = centreClient();
      if (event.key === '+' || event.key === '=') {
        event.preventDefault();
        applyZoomAt(STAGE_ZOOM_STEP, centre.x, centre.y);
      } else if (event.key === '-' || event.key === '_') {
        event.preventDefault();
        applyZoomAt(1 / STAGE_ZOOM_STEP, centre.x, centre.y);
      } else if (event.key === '0') {
        event.preventDefault();
        fit();
      }
    },
    [applyZoomAt, centreClient, fit],
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  const isAntv = mode === 'antv';
  const displayZoom = isAntv ? (box ? antvDisplayScale(box) : 1) : zoom;

  const transform = (() => {
    const originX = (sizes.stageW - sizes.pictureW * zoom) / 2 + pan.x;
    const originY = (sizes.stageH - sizes.pictureH * zoom) / 2 + pan.y;
    return `translate(${originX}px, ${originY}px) scale(${zoom})`;
  })();

  return (
    <div
      ref={stageRef}
      data-picture-stage="true"
      data-picture-mode={mode}
      aria-label={ariaLabel}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={`relative h-full w-full overflow-hidden rounded-2xl border border-black/10 shadow-inner outline-none ${className ?? ''}`}
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.12) 1px, transparent 1px)',
        backgroundSize: '18px 18px',
        cursor: panning ? 'grabbing' : 'grab',
      }}
    >
      {isAntv && (
        // PATCH-245 Addendum 2. The AntV card is `h-full` but its inner chain is
        // auto-height; make it a column so the svg (forced to 100%) fills the
        // stage below the small header.
        <style data-picture-antv-fill="true">{`
[data-picture-stage][data-picture-mode="antv"] [data-picture-content] > *:not(style) { display: flex; flex-direction: column; height: 100%; min-height: 0; }
[data-picture-stage][data-picture-mode="antv"] [data-picture-content] > *:not(style) > div { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
[data-picture-stage][data-picture-mode="antv"] [data-picture-content] > *:not(style) > div > *:last-child { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 0; }
[data-picture-stage][data-picture-mode="antv"] [data-picture-content] [data-antv-container] { flex: 1 1 auto; min-height: 0; height: 100%; }
${ANTV_PICTURE_SVG_SELECTOR} { width: 100% !important; height: 100% !important; max-height: none !important; display: block; }
[data-picture-stage][data-picture-mode="antv"] [data-picture-content] style { display: none !important; }
`}</style>
      )}
      <div
        ref={contentRef}
        data-picture-content="true"
        className={isAntv ? 'absolute inset-0' : 'absolute left-0 top-0'}
        style={
          isAntv
            ? undefined
            : {
                transform,
                transformOrigin: '0 0',
                width: 'max-content',
                height: 'max-content',
                willChange: 'transform',
              }
        }
        data-picture-zoom={displayZoom}
      >
        <PictureZoomContext.Provider value={displayZoom}>{children}</PictureZoomContext.Provider>
      </div>

      <div
        data-picture-controls="true"
        className="absolute bottom-3 right-3 z-40 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-1.5 py-1 shadow-md backdrop-blur"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          data-picture-control="true"
          data-picture-zoom-out="true"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => applyZoomAt(1 / STAGE_ZOOM_STEP, centreClient().x, centreClient().y)}
          className="flex h-6 w-6 items-center justify-center rounded text-sm text-gray-600 hover:bg-gray-100"
        >
          −
        </button>
        <button
          type="button"
          data-picture-control="true"
          data-picture-zoom-value="true"
          aria-label="Fit"
          title="Fit"
          onClick={() => fit()}
          className="min-w-[44px] rounded px-1 text-xs font-medium tabular-nums text-gray-700 hover:bg-gray-100"
        >
          {Math.round(displayZoom * 100)}%
        </button>
        <button
          type="button"
          data-picture-control="true"
          data-picture-zoom-in="true"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => applyZoomAt(STAGE_ZOOM_STEP, centreClient().x, centreClient().y)}
          className="flex h-6 w-6 items-center justify-center rounded text-sm text-gray-600 hover:bg-gray-100"
        >
          +
        </button>
        <button
          type="button"
          data-picture-control="true"
          data-picture-zoom-fit="true"
          onClick={() => fit()}
          className="rounded px-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Fit
        </button>
      </div>
    </div>
  );
}

export default PictureStage;
