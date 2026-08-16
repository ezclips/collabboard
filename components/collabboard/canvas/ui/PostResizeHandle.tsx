'use client';

import React, { useCallback, useRef } from 'react';
import { isMeaningfulPostResize, resizePostBox } from '@/lib/domain/canvas/postResizeBox';
import type { PostResizeConstraints } from '@/lib/domain/canvas/postResizePolicy';

/**
 * Screen-space sizes for the grip. The handle is rendered inside the
 * world-scaled Freeform stage, so every dimension below is multiplied by
 * world-per-client-pixel (derived from the SAME host converter SectionHeading
 * uses) to stay an approximately constant screen size at any zoom -- the grip
 * must not collapse toward ~2px at 10% the way a fixed world-unit handle does.
 */
export const POST_RESIZE_HANDLE_GRIP_SCREEN_PX = 20;
export const POST_RESIZE_HANDLE_HIT_SCREEN_PX = 28;

export interface PostResizeHandleProps {
  /**
   * Host-provided absolute client->world conversion (Freeform:
   * getCanvasPointFromClient). The handle performs NO camera arithmetic of
   * its own -- no canvasZoom division, no scroll offsets -- so the same
   * gesture is engine- and zoom-neutral.
   */
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number };
  /** Gesture-origin width/height in world units (used when getStartSize is absent). */
  startWidth: number;
  startHeight: number;
  constraints?: PostResizeConstraints | null;
  /** World-unit maxima; the host derives them from the signed world extent. */
  maxWidth?: number;
  maxHeight?: number;
  /** Local/optimistic preview per pointermove. Must NOT persist. */
  onResizePreview: (width: number, height: number) => void;
  /** ONE persistence call per gesture, only when the size meaningfully changed. */
  onResizeCommit: (width: number, height: number, originWidth: number, originHeight: number) => void;
  /**
   * Optional: captures the ACTUAL rendered post rectangle at pointerdown, in
   * world units. Needed for legacy posts whose rendered size (e.g. an Image's
   * natural height) differs from canonical width/height.
   */
  getStartSize?: () => { width: number; height: number } | null | undefined;
  /** Positioning/visibility classes from the host (e.g. selected-only opacity). */
  className?: string;
  title?: string;
}

interface Gesture {
  originPointerWorld: { x: number; y: number };
  startWidth: number;
  startHeight: number;
}

/**
 * Renderer-neutral bottom-right post resize grip.
 *
 * Interaction contract (mirrors SectionHeading's proven shape):
 * - pointer capture on the handle element;
 * - right-button presses never start a gesture (they bubble to the post's
 *   context menu instead);
 * - pointermove previews only; pointerup performs ONE commit call;
 * - a gesture that ends at (essentially) its origin writes nothing;
 * - data-no-drag isolates the grip from the post-drag / canvas-pan systems;
 * - Shift locks the starting aspect ratio.
 */
export default function PostResizeHandle({
  clientToWorld,
  startWidth,
  startHeight,
  constraints,
  maxWidth,
  maxHeight,
  onResizePreview,
  onResizeCommit,
  getStartSize,
  className,
  title = 'Resize',
}: PostResizeHandleProps) {
  const gestureRef = useRef<Gesture | null>(null);

  // SectionHeading's world-per-client-pixel technique: measure how much world
  // a 100px client span covers with the SAME converter the gesture uses, so
  // the grip's on-screen size is approximately constant across zoom levels.
  const worldPerClientPx = (() => {
    const scale = Math.abs(clientToWorld(100, 0).x - clientToWorld(0, 0).x) / 100;
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  })();
  const hitSize = POST_RESIZE_HANDLE_HIT_SCREEN_PX * worldPerClientPx;
  const gripSize = POST_RESIZE_HANDLE_GRIP_SCREEN_PX * worldPerClientPx;

  const computeSize = useCallback((clientX: number, clientY: number, lockAspect: boolean) => {
    const gesture = gestureRef.current;
    if (!gesture) return null;
    const point = clientToWorld(clientX, clientY);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    return resizePostBox({
      startWidth: gesture.startWidth,
      startHeight: gesture.startHeight,
      deltaX: point.x - gesture.originPointerWorld.x,
      deltaY: point.y - gesture.originPointerWorld.y,
      minWidth: constraints?.minWidth,
      minHeight: constraints?.minHeight,
      maxWidth,
      maxHeight,
      lockAspect,
    });
  }, [constraints, maxWidth, maxHeight]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button === 2) return;
    event.preventDefault();
    event.stopPropagation();
    const point = clientToWorld(event.clientX, event.clientY);
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
    const measured = getStartSize?.();
    gestureRef.current = {
      originPointerWorld: point,
      startWidth: measured && Number.isFinite(measured.width) ? measured.width : startWidth,
      startHeight: measured && Number.isFinite(measured.height) ? measured.height : startHeight,
    };
  }, [clientToWorld, getStartSize, startWidth, startHeight]);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!gestureRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const next = computeSize(event.clientX, event.clientY, event.shiftKey);
    if (next) onResizePreview(next.width, next.height);
  }, [computeSize, onResizePreview]);

  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    event.preventDefault();
    event.stopPropagation();
    const next = computeSize(event.clientX, event.clientY, event.shiftKey);
    (event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId);
    gestureRef.current = null;
    if (!next) return;
    if (isMeaningfulPostResize(gesture.startWidth, gesture.startHeight, next)) {
      onResizeCommit(next.width, next.height, gesture.startWidth, gesture.startHeight);
    }
  }, [computeSize, onResizeCommit]);

  const handlePointerCancel = useCallback(() => {
    gestureRef.current = null;
  }, []);

  return (
    <div
      data-no-drag="true"
      data-post-resize-handle="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      title={title}
      aria-label={title}
      className={`absolute bottom-0 right-0 z-20 flex cursor-nwse-resize items-end justify-end ${className ?? ''}`}
      style={{ width: hitSize, height: hitSize }}
    >
      <div
        className="flex items-center justify-center rounded-sm bg-white/80 shadow-sm"
        style={{ width: gripSize, height: gripSize }}
      >
        {/* Same three-line diagonal grip visual as the original AI handle,
            sized as a percentage of the world-scaled box so it stays
            screen-constant with it. */}
        <svg width="60%" height="60%" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="9" y1="1" x2="1" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="5" x2="5" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
          <line x1="9" y1="8" x2="8" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}
