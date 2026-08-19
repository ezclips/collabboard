"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  createMinimapProjection,
  getSceneDisplayBounds,
  projectWorldRect,
  unprojectMinimapPoint,
  type MinimapInnerRect,
  type MinimapProjection,
  type WorldPoint,
  type WorldRect,
} from './drawingMinimapGeometry';
import { panDrawingViewportByWorldDelta, type DrawingMinimapExcalidrawAPI } from './drawingMinimapNavigation';
import { useDrawingMinimapScene } from './useDrawingMinimapScene';

const MINIMAP_WIDTH = 176;
const MINIMAP_HEIGHT = 112;
const MINIMAP_PADDING = 8;
const DRAG_THRESHOLD_CSS_PX = 4;
const MINIMAP_INNER_RECT: MinimapInnerRect = {
  left: MINIMAP_PADDING,
  top: MINIMAP_PADDING,
  width: MINIMAP_WIDTH - MINIMAP_PADDING * 2,
  height: MINIMAP_HEIGHT - MINIMAP_PADDING * 2,
};

interface MinimapPointerGesture {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  lastPoint: WorldPoint;
  startedOnViewport: boolean;
  dragging: boolean;
  projection: MinimapProjection;
}

function getLocalMinimapPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): WorldPoint | null {
  const rect = svg.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: (clientX - rect.left) * (MINIMAP_WIDTH / rect.width),
    y: (clientY - rect.top) * (MINIMAP_HEIGHT / rect.height),
  };
}

function isInsideFittedMap(point: WorldPoint, projection: MinimapProjection): boolean {
  const fitRight = projection.offsetX + projection.displayBounds.width * projection.scale;
  const fitBottom = projection.offsetY + projection.displayBounds.height * projection.scale;
  return point.x >= projection.offsetX
    && point.x <= fitRight
    && point.y >= projection.offsetY
    && point.y <= fitBottom;
}

export interface DrawingMinimapProps {
  excalidrawAPI: DrawingMinimapExcalidrawAPI | null | undefined;
  /**
   * PATCH DRAWING-MINIMAP-C: when true, renders as a plain 176x112 block
   * child with no absolute placement/z-index/border/background of its own
   * -- the composing DrawingNavigationControl owns the outer shell's
   * position, stacking, and chrome instead. Geometry, projection, and
   * pointer math below are completely unaffected by this flag. Mirrors
   * FreeformMinimap's own `embedded` prop (see its own doc comment) --
   * deliberately duplicated, not imported, to keep Freeform untouched.
   */
  embedded?: boolean;
}

const STANDALONE_HOST_CLASSNAME =
  'pointer-events-auto absolute bottom-[84px] right-[var(--drawing-zoom-controls-right,1.5rem)] z-[130] hidden h-[112px] w-[176px] overflow-hidden rounded-md border border-gray-300 bg-white shadow-md md:block';
const EMBEDDED_HOST_CLASSNAME =
  'pointer-events-auto hidden h-[112px] w-[176px] overflow-hidden md:block';

/**
 * PATCH DRAWING-MINIMAP-B: a synthetic single-rect scene used only when
 * there is truly nothing else to frame the minimap around (excalidrawAPI
 * not yet available, before the very first measurement). Centered on the
 * origin at exactly the display-bounds floor size, so it produces the same
 * "default" fitted view getSceneDisplayBounds already falls back to for a
 * tiny/empty scene -- not a new geometry rule, just a stand-in input.
 */
const ORIGIN_PLACEHOLDER_RECT: WorldRect = { x: 0, y: 0, width: 1, height: 1 };

export default function DrawingMinimap({ excalidrawAPI, embedded = false }: DrawingMinimapProps) {
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const gestureRef = useRef<MinimapPointerGesture | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const clipId = `drawing-minimap-${useId().replace(/:/g, '')}`;
  const { elementRects, viewportWorldRect } = useDrawingMinimapScene(excalidrawAPI);
  // PATCH DRAWING-MINIMAP-B: the minimap shell must stay visible for an
  // empty drawing (and before the scene subscription's first measurement),
  // not just once real elements exist. getSceneDisplayBounds itself is
  // untouched (still returns null for an empty input) -- this only widens
  // what gets fed into it: real element footprints when there are any,
  // otherwise the current viewport rect (so an empty drawing shows "you are
  // here" against its own padded surroundings), otherwise a single-point
  // placeholder at the origin (so the shell still has a valid, if
  // arbitrary, frame before the very first measurement lands).
  const displayBounds = useMemo(() => {
    if (elementRects.length > 0) return getSceneDisplayBounds(elementRects);
    if (viewportWorldRect) return getSceneDisplayBounds([viewportWorldRect]);
    return getSceneDisplayBounds([ORIGIN_PLACEHOLDER_RECT]);
  }, [elementRects, viewportWorldRect]);
  const projection = useMemo(
    () => displayBounds ? createMinimapProjection(displayBounds, MINIMAP_INNER_RECT) : null,
    [displayBounds],
  );

  const navigateToPoint = useCallback((point: WorldPoint) => {
    if (!projection || !viewportWorldRect || !isInsideFittedMap(point, projection)) return;
    const targetWorld = unprojectMinimapPoint(point, projection);
    const currentCenter = {
      x: viewportWorldRect.x + viewportWorldRect.width / 2,
      y: viewportWorldRect.y + viewportWorldRect.height / 2,
    };
    panDrawingViewportByWorldDelta(excalidrawAPI, targetWorld.x - currentCenter.x, targetWorld.y - currentCenter.y);
  }, [excalidrawAPI, projection, viewportWorldRect]);

  const finishGesture = useCallback((svg: SVGSVGElement, pointerId: number) => {
    gestureRef.current = null;
    setIsDragging(false);
    if (svg.hasPointerCapture?.(pointerId)) svg.releasePointerCapture(pointerId);
  }, []);

  const handlePointerDown = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || !projection) return;
    event.preventDefault();
    event.stopPropagation();
    const point = getLocalMinimapPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point || !isInsideFittedMap(point, projection)) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    gestureRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      lastPoint: point,
      startedOnViewport: event.target instanceof Element
        && event.target.closest('[data-drawing-minimap-viewport="true"]') !== null,
      dragging: false,
      projection,
    };
  }, [projection]);

  const handlePointerMove = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (gesture.projection !== projection) {
      finishGesture(event.currentTarget, event.pointerId);
      return;
    }
    const point = getLocalMinimapPoint(event.currentTarget, event.clientX, event.clientY);
    if (!point) return;
    const distance = Math.hypot(
      event.clientX - gesture.startClientX,
      event.clientY - gesture.startClientY,
    );
    if (!gesture.dragging && distance <= DRAG_THRESHOLD_CSS_PX) return;
    if (!gesture.dragging) {
      gesture.dragging = true;
      setIsDragging(true);
    }
    if (gesture.startedOnViewport) {
      panDrawingViewportByWorldDelta(
        excalidrawAPI,
        (point.x - gesture.lastPoint.x) / gesture.projection.scale,
        (point.y - gesture.lastPoint.y) / gesture.projection.scale,
      );
    }
    gesture.lastPoint = point;
  }, [excalidrawAPI, finishGesture, projection]);

  const handlePointerUp = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (gesture.projection !== projection) {
      finishGesture(event.currentTarget, event.pointerId);
      return;
    }
    const point = getLocalMinimapPoint(event.currentTarget, event.clientX, event.clientY);
    const shouldNavigate = !gesture.dragging;
    finishGesture(event.currentTarget, event.pointerId);
    if (shouldNavigate && point) navigateToPoint(point);
  }, [finishGesture, navigateToPoint, projection]);

  const handlePointerCancel = useCallback((event: React.PointerEvent<SVGSVGElement>) => {
    if (gestureRef.current?.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    finishGesture(event.currentTarget, event.pointerId);
  }, [finishGesture]);

  const isolateEvent = useCallback((event: React.SyntheticEvent) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  useEffect(() => {
    const minimap = minimapRef.current;
    if (!minimap) return;
    const isolateWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };
    minimap.addEventListener('wheel', isolateWheel, { passive: false });
    return () => minimap.removeEventListener('wheel', isolateWheel);
  }, [projection]);

  // PATCH DRAWING-MINIMAP-B: the shell (host box + background surface) now
  // ALWAYS renders once this component is mounted -- it is never hidden for
  // an empty scene, unavailable bounds, or a subscription that has not
  // emitted yet. Only the projection-dependent content (element footprints,
  // the viewport rectangle) is conditional; the 3-tier fallback above means
  // `projection` is realistically always defined, but this guard keeps the
  // shell itself visible even in the theoretically-unreachable case where
  // it somehow isn't, rather than ever falling back to rendering nothing.
  const projectedViewport = projection && viewportWorldRect
    ? projectWorldRect(viewportWorldRect, projection)
    : null;

  return (
    <div
      ref={minimapRef}
      data-drawing-minimap="true"
      aria-hidden="true"
      className={embedded ? EMBEDDED_HOST_CLASSNAME : STANDALONE_HOST_CLASSNAME}
      onMouseDown={isolateEvent}
      onClick={isolateEvent}
      onDoubleClick={isolateEvent}
      onWheel={isolateEvent}
      onContextMenu={isolateEvent}
    >
      <svg
        data-drawing-minimap-map="true"
        viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
        className="h-full w-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              x={MINIMAP_INNER_RECT.left}
              y={MINIMAP_INNER_RECT.top}
              width={MINIMAP_INNER_RECT.width}
              height={MINIMAP_INNER_RECT.height}
            />
          </clipPath>
        </defs>

        <rect
          data-drawing-minimap-surface="true"
          x={MINIMAP_INNER_RECT.left}
          y={MINIMAP_INNER_RECT.top}
          width={MINIMAP_INNER_RECT.width}
          height={MINIMAP_INNER_RECT.height}
          rx="3"
          style={{ fill: '#e5e7eb', cursor: projection ? 'pointer' : 'default' }}
        />

        {projection && (
          <g data-drawing-minimap-items="true" pointerEvents="none">
            {elementRects.map((rect, index) => {
              const projected = projectWorldRect(rect, projection);
              return (
                <rect
                  key={index}
                  data-minimap-item-index={index}
                  x={projected.x}
                  y={projected.y}
                  width={Math.max(projected.width, 0.75)}
                  height={Math.max(projected.height, 0.75)}
                  rx="0.5"
                  style={{ fill: 'var(--foreground)', fillOpacity: 0.45 }}
                />
              );
            })}
          </g>
        )}

        {projectedViewport && (
          <g clipPath={`url(#${clipId})`}>
            <rect
              data-drawing-minimap-viewport="true"
              x={projectedViewport.x}
              y={projectedViewport.y}
              width={projectedViewport.width}
              height={projectedViewport.height}
              rx="1.5"
              style={{
                fill: 'var(--foreground)',
                fillOpacity: 0.1,
                stroke: 'var(--foreground)',
                cursor: isDragging ? 'grabbing' : 'grab',
              }}
              strokeWidth="1.5"
            />
          </g>
        )}
      </svg>
    </div>
  );
}
