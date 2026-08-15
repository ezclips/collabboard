"use client";

import { useLayoutEffect, useState } from 'react';
import type React from 'react';
import { getViewportWorldRect, type WorldRect } from './freeformMinimapGeometry';

export interface UseFreeformMinimapViewportOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  worldOriginRef: React.RefObject<HTMLDivElement | null>;
  canvasZoom: number;
}

export function useFreeformMinimapViewport({
  containerRef,
  worldOriginRef,
  canvasZoom,
}: UseFreeformMinimapViewportOptions): WorldRect | null {
  const [viewportWorldRect, setViewportWorldRect] = useState<WorldRect | null>(null);

  useLayoutEffect(() => {
    const viewport = containerRef.current;
    const worldOrigin = worldOriginRef.current;
    if (!viewport || !worldOrigin) {
      setViewportWorldRect(null);
      return;
    }

    let mounted = true;
    let frameId: number | null = null;

    const measure = () => {
      frameId = null;
      if (!mounted) return;
      const next = getViewportWorldRect({
        viewportRect: viewport.getBoundingClientRect(),
        clientLeft: viewport.clientLeft,
        clientTop: viewport.clientTop,
        clientWidth: viewport.clientWidth,
        clientHeight: viewport.clientHeight,
        worldOriginRect: worldOrigin.getBoundingClientRect(),
        zoom: canvasZoom,
      });
      setViewportWorldRect((current) => {
        if (!next) return current === null ? current : null;
        if (current
          && current.x === next.x
          && current.y === next.y
          && current.width === next.width
          && current.height === next.height) {
          return current;
        }
        return next;
      });
    };

    const scheduleMeasure = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(measure);
    };

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    resizeObserver?.observe(viewport);
    resizeObserver?.observe(worldOrigin);

    const originMutationObserver = typeof MutationObserver === 'undefined'
      ? null
      : new MutationObserver(scheduleMeasure);
    originMutationObserver?.observe(worldOrigin, {
      attributes: true,
      attributeFilter: ['style', 'class'],
    });

    viewport.addEventListener('scroll', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    scheduleMeasure();

    return () => {
      mounted = false;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      viewport.removeEventListener('scroll', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      resizeObserver?.disconnect();
      originMutationObserver?.disconnect();
    };
  }, [containerRef, worldOriginRef, canvasZoom]);

  return viewportWorldRect;
}
