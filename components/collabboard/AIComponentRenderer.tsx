"use client";

import React, { useCallback, useEffect, useRef } from 'react';
import { useAIComponent } from '@/hooks/useAIComponent';

type AIImageAttribution = {
  source?: string | null;
  author?: string | null;
  authorLink?: string | null;
};

interface AIComponentRendererProps {
  code: string;
  className?: string;
  fallbackImageSrc?: string;
  minHeight?: number;
  imageAttributions?: AIImageAttribution[];
  padletId?: string;
  width?: number;
  height?: number;
  canvasZoom?: number;
  onResize?: (w: number, h: number) => void;
  onResizeEnd?: (w: number, h: number) => void;
  isExpanded?: boolean;
  onExpandAvailabilityChange?: (available: boolean) => void;
  onExportTargetReady?: (element: HTMLDivElement | null) => void;
}

function cn(...classes: Array<string | undefined | false | null>) {
  return classes.filter(Boolean).join(' ');
}

export default function AIComponentRenderer({
  code,
  className,
  fallbackImageSrc = '/images/ai-placeholder.svg',
  minHeight = 280,
  imageAttributions,
  padletId,
  width = 500,
  height = 400,
  canvasZoom = 1,
  onResize,
  onResizeEnd,
  isExpanded = false,
  onExpandAvailabilityChange,
  onExportTargetReady,
}: AIComponentRendererProps) {
  const { containerRef, isLoading, hasError, errorMessage } = useAIComponent({
    html: code,
    fallbackImageSrc,
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const collapsedHeight = Math.max(height, minHeight, 150);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, w: width, h: height };
  }, [height, width]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = (e.clientX - startRef.current.x) / canvasZoom;
    const dy = (e.clientY - startRef.current.y) / canvasZoom;
    const newW = Math.max(200, Math.round(startRef.current.w + dx));
    const newH = Math.max(150, Math.round(startRef.current.h + dy));

    onResize?.(newW, newH);
  }, [canvasZoom, onResize]);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!startRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = (e.clientX - startRef.current.x) / canvasZoom;
    const dy = (e.clientY - startRef.current.y) / canvasZoom;
    const newW = Math.max(200, Math.round(startRef.current.w + dx));
    const newH = Math.max(150, Math.round(startRef.current.h + dy));

    startRef.current = null;
    onResizeEnd?.(newW, newH);
  }, [canvasZoom, onResizeEnd]);

  const handlePointerCancel = useCallback(() => {
    startRef.current = null;
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onExpandAvailabilityChange) return;

    const updateAvailability = () => {
      const needsExpand = container.scrollHeight > collapsedHeight + 1;
      onExpandAvailabilityChange(needsExpand);
    };

    updateAvailability();

    const resizeObserver = new ResizeObserver(() => updateAvailability());
    resizeObserver.observe(container);

    const mutationObserver = new MutationObserver(() => updateAvailability());
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    const timer = window.setTimeout(updateAvailability, 0);

    return () => {
      window.clearTimeout(timer);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [collapsedHeight, containerRef, onExpandAvailabilityChange, code]);

  useEffect(() => {
    onExportTargetReady?.(containerRef.current);
    return () => onExportTargetReady?.(null);
  }, [containerRef, onExportTargetReady, code]);

  if (!code) {
    return (
      <div className="flex h-full min-h-[100px] w-full items-center justify-center text-xs text-gray-400">
        No AI component generated yet
      </div>
    );
  }

  const firstAttribution = imageAttributions?.find((item) =>
    Boolean(item?.author || item?.authorLink || item?.source)
  );
  const attributionLink = firstAttribution?.authorLink || firstAttribution?.source || null;
  const attributionLabel = firstAttribution?.author
    ? `Photo by ${firstAttribution.author} on Unsplash`
    : 'Photo via Unsplash';

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm',
        className
      )}
      style={{ minHeight: Math.max(minHeight, 150) }}
      data-padlet-id={padletId}
    >
      {isLoading && (
        <div className="absolute inset-0 z-10 animate-pulse bg-gradient-to-br from-neutral-100 via-neutral-50 to-neutral-100">
          <div className="flex h-full w-full flex-col gap-3 p-4">
            <div className="h-40 w-full rounded-xl bg-neutral-200" />
            <div className="h-5 w-2/3 rounded-md bg-neutral-200" />
            <div className="h-4 w-full rounded-md bg-neutral-200" />
            <div className="h-4 w-5/6 rounded-md bg-neutral-200" />
            <div className="mt-auto h-10 w-28 rounded-lg bg-neutral-200" />
          </div>
        </div>
      )}

      {hasError && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-white p-6">
          <div className="max-w-sm rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
            <div className="font-semibold">Component failed to render</div>
            <div className="mt-1 text-red-600">{errorMessage || 'Unknown renderer error.'}</div>
          </div>
        </div>
      )}

      <div
        ref={viewportRef}
        className="w-full overflow-hidden rounded-lg bg-gray-50/30"
        style={isExpanded ? undefined : { maxHeight: `${collapsedHeight}px` }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          ref={containerRef}
          className={cn(
            'ai-component-renderer flex min-h-[150px] w-full items-center justify-center overflow-hidden',
            isLoading && 'opacity-0',
            !isLoading && 'opacity-100 transition-opacity duration-200'
          )}
        />
      </div>
      {firstAttribution && (
        <div className="pointer-events-auto px-2 pb-1 pt-1 text-[10px] text-black/60">
          {attributionLink ? (
            <a
              href={attributionLink}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:underline"
            >
              {attributionLabel}
            </a>
          ) : (
            <span>{attributionLabel}</span>
          )}
        </div>
      )}
      {onResize && (
        <div
          data-no-drag="true"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          className="absolute bottom-1 right-1 z-10 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-sm bg-white/80 opacity-50 shadow-sm transition-opacity hover:opacity-100"
          title="Resize"
          aria-label="Resize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
            <line x1="9" y1="1" x2="1" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="5" x2="5" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="9" y1="8" x2="8" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      )}
    </div>
  );
}
