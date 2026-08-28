"use client";

import React, { useCallback, useEffect, useRef, useState } from 'react';
import KnowledgeDocumentPageImage from '@/components/collabboard/KnowledgeDocumentPageImage';
import {
  displayRegionToSourceRegion,
  isCanonicalPageRotation,
  normalizeDragRectangle,
  sourceRegionToDisplayRegion,
  type KnowledgePageRotation,
  type NormalizedPageRegion,
} from '@/lib/domain/knowledge/knowledgePageRegionGeometry';
import {
  meetsMinimumRegionExtent,
  normalizedPointInContentBox,
  type NormalizedDisplayPoint,
  type PageImageContentBox,
} from '@/lib/domain/knowledge/knowledgePageRegionPointer';

/**
 * P6J-F9-B2 -- region selection for ONE page image. It WRAPS the A2b image
 * unchanged (which keeps the authenticated fetch, lazy loading, decode, failure
 * state and layout reservation); all DOM measurement lives here alone, and the
 * rectangle leaves in the page's INTRINSIC UNROTATED system via the one geometry
 * authority: no rotation algebra, nothing cropped, no bytes read.
 */

export interface KnowledgeDocumentPageRegionSelectorProps {
  readonly boardId: string;
  readonly documentId: string;
  readonly pageNumber: number;
  readonly originalFilename: string;
  readonly widthPoints?: number | null;
  readonly heightPoints?: number | null;
  readonly rotation?: number | null;
  /** Document-level Select area mode; `armedRegion` is this page's SOURCE rectangle. */
  readonly enabled: boolean;
  readonly armedRegion: NormalizedPageRegion | null;
  readonly onArm: (region: NormalizedPageRegion, appliedRotation: KnowledgePageRotation) => void;
  readonly onClear: () => void;
  /** P6J-F9-D. One explicitly navigated SOURCE-space region, or null. Suppressed whenever `enabled`. */
  readonly highlightRegion?: NormalizedPageRegion | null;
}

/** Raster rounding shifts the aspect by ~1/(2*natural); a transposition doubles it. */
const ASPECT_TOLERANCE = 0.02;

interface DragState {
  readonly pointerId: number;
  readonly start: NormalizedDisplayPoint; readonly current: NormalizedDisplayPoint;
}

/** NULL means no rotation was recorded, exactly as A2b and B1 read it. */
const canonicalRotation = (rotation: number | null | undefined): KnowledgePageRotation | null =>
  (isCanonicalPageRotation(rotation ?? 0) ? (rotation ?? 0) as KnowledgePageRotation : null);

const usablePoints = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** The aspect STORED geometry predicts, transposed for a quarter turn because A1
 * bakes rotation in -- natural dimensions' one and only use. */
function aspectMatches(
  image: HTMLImageElement, widthPoints: number, heightPoints: number, turn: KnowledgePageRotation,
): boolean {
  const quarter = turn === 90 || turn === 270;
  const expected = (quarter ? heightPoints : widthPoints) / (quarter ? widthPoints : heightPoints);
  const actual = image.naturalWidth / image.naturalHeight;
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected <= 0) return false;
  return Math.abs(actual - expected) / expected <= ASPECT_TOLERANCE;
}

/** The border sits INSIDE the border box, so it must come off the rectangle. */
function contentBoxOf(image: HTMLImageElement): PageImageContentBox {
  const rect = image.getBoundingClientRect();
  return { left: rect.left + image.clientLeft, top: rect.top + image.clientTop,
    width: image.clientWidth, height: image.clientHeight };
}
const percent = (value: number): string => `${value * 100}%`;

export default function KnowledgeDocumentPageRegionSelector({
  boardId, documentId, pageNumber, originalFilename,
  widthPoints, heightPoints, rotation,
  enabled, armedRegion, onArm, onClear, highlightRegion = null,
}: KnowledgeDocumentPageRegionSelectorProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [overlay, setOverlay] = useState<PageImageContentBox | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const turn = canonicalRotation(rotation);
  /**
   * Re-resolved, never held: the A2b image unmounts itself on failure, and a
   * remembered node keeps a selection alive over a page that renders none.
   */
  const readyImage = useCallback((): HTMLImageElement | null => {
    const image = wrapperRef.current?.querySelector('img') ?? null;
    if (image === null || turn === null) return null;
    if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
    if (image.clientWidth <= 0 || image.clientHeight <= 0) return null;
    if (!usablePoints(widthPoints) || !usablePoints(heightPoints)) return null;
    return aspectMatches(image, widthPoints, heightPoints, turn) ? image : null;
  }, [turn, widthPoints, heightPoints]);

  /** Hit-layer placement, inset off the border exactly like the pointer maths. */
  const refresh = useCallback(() => {
    const image = readyImage();
    if (image === null) { setOverlay(null); setDrag(null); return; }
    setOverlay({
      left: image.offsetLeft + image.clientLeft, top: image.offsetTop + image.clientTop,
      width: image.clientWidth, height: image.clientHeight });
  }, [readyImage]);

  // A cached image is already complete on mount and fires no load event.
  useEffect(() => { refresh(); }, [refresh, boardId, documentId, pageNumber, enabled]);

  // P6J-F9-D widens this beyond `enabled`: an arrival highlight also needs its
  // measured content box kept fresh across a resize, not just an armed drag.
  useEffect(() => {
    if ((!enabled && highlightRegion === null) || typeof ResizeObserver === 'undefined') return undefined;
    const wrapper = wrapperRef.current;
    if (wrapper === null) return undefined;
    const observer = new ResizeObserver(() => { refresh(); });
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [enabled, highlightRegion, refresh]);

  /**
   * Escape precedence. The reader closes itself on Escape, so clearing a
   * rectangle would take the reader with it. An armed rectangle is the more
   * specific state and stands in front of that handler, the rule the reader
   * already applies to the library modal. Unarmed, Escape closes it as before.
   */
  useEffect(() => {
    if (!enabled || armedRegion === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      setDrag(null);
      onClear();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [enabled, armedRegion, onClear]);

  /** Measured per event, so a scroll mid-drag cannot skew the mapping. */
  const pointAt = (event: React.PointerEvent<HTMLDivElement>): NormalizedDisplayPoint | null => {
    const image = readyImage();
    return image === null ? null
      : normalizedPointInContentBox(event.clientX, event.clientY, contentBoxOf(image));
  };

  const beginDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!enabled || !event.isPrimary || drag !== null) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const point = pointAt(event);
    if (point === null) return;
    event.preventDefault();
    // A new drag replaces whatever was armed: two rectangles are two answers.
    if (armedRegion !== null) onClear();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ pointerId: event.pointerId, start: point, current: point });
  };

  const extendDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    const point = pointAt(event);
    if (point === null) return;
    event.preventDefault();
    setDrag({ ...drag, current: point });
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    const { start, current } = drag;
    setDrag(null);
    // Re-measured, not remembered: the image can fail mid-drag, and the reader
    // can scroll under it, so the box a normalised point is judged against is
    // always the one on screen now.
    const image = readyImage();
    if (image === null || turn === null) return;
    if (!meetsMinimumRegionExtent(start, current, contentBoxOf(image))) return;
    const source = displayRegionToSourceRegion(
      normalizeDragRectangle(start.x, start.y, current.x, current.y), turn);
    if (source !== null) onArm(source, turn);
  };

  /** Cancellation never arms: an interrupted gesture stated no intent. */
  const abandonDrag = () => setDrag(null);

  const live = drag === null
    ? null
    : normalizeDragRectangle(drag.start.x, drag.start.y, drag.current.x, drag.current.y);
  const shown = live ?? (armedRegion === null || turn === null
    ? null
    : sourceRegionToDisplayRegion(armedRegion, turn));
  // P6J-F9-D. Suppressed whenever Select-area is enabled: the armed rectangle
  // above is the only region presentation during active selection.
  const arrivalShown = enabled || highlightRegion === null || turn === null
    ? null
    : sourceRegionToDisplayRegion(highlightRegion, turn);

  // React propagates the image's load/error here, so A2b needs no new prop, and
  // failure drops the armed rectangle: the page it described is gone.
  return (
    <div ref={wrapperRef} className="relative" onLoad={refresh}
      onError={() => { refresh(); if (armedRegion !== null) onClear(); }}>
      <KnowledgeDocumentPageImage
        boardId={boardId} documentId={documentId} pageNumber={pageNumber}
        originalFilename={originalFilename} widthPoints={widthPoints}
        heightPoints={heightPoints} rotation={rotation}
      />
      {enabled && overlay !== null ? (
        <div
          data-knowledge-region-layer={pageNumber}
          className="absolute cursor-crosshair"
          style={{
            left: overlay.left, top: overlay.top, width: overlay.width,
            height: overlay.height, touchAction: 'none',
          }}
          onPointerDown={beginDrag}
          onPointerMove={extendDrag}
          onPointerUp={finishDrag}
          onPointerCancel={abandonDrag}
          onLostPointerCapture={abandonDrag}
        >
          {shown === null ? null : (
            <div
              data-knowledge-region-rectangle={pageNumber}
              className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/20"
              style={{
                left: percent(shown.x), top: percent(shown.y),
                width: percent(shown.width), height: percent(shown.height) }}
            />
          )}
        </div>
      ) : null}
      {overlay !== null && arrivalShown !== null ? (
        <div
          data-knowledge-source-region-overlay="true"
          className="pointer-events-none absolute border-2 border-amber-500 bg-amber-500/20"
          style={{
            left: overlay.left + arrivalShown.x * overlay.width,
            top: overlay.top + arrivalShown.y * overlay.height,
            width: arrivalShown.width * overlay.width,
            height: arrivalShown.height * overlay.height,
          }}
        />
      ) : null}
    </div>
  );
}
