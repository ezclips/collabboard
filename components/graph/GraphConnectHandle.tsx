"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
import { findConnectTargetId } from '@/lib/graph/connectTarget';
import { measureAnchorRect } from '@/lib/graph/anchorRect';
import type { Padlet } from '@/types/collabboard';

/**
 * PATCH-227/230/231. The connect knobs on a post: drag one onto another post to
 * create a graph edge. The whole interaction (pointer capture, the dashed
 * preview, the target outline) lives here so FreeformPadletCards only has to
 * decide whether to show it.
 *
 * PATCH-231: the knobs sit on the SAME box the lines attach to
 * (`measureAnchorRect`), so they land on the visible card -- on a frameless
 * drawing, the drawing itself -- not the post's outer wrapper. Each knob is a
 * small filled half-circle with a larger invisible grab area.
 */

type GraphConnectHandleProps = {
  boardId: string;
  postId: string;
  /** The post this handle belongs to (for `measureAnchorRect`). */
  post: Padlet;
  /** A candidate id is a valid drop target only when its post is top-level. */
  isTopLevel: (id: string) => boolean;
  /** Called after a new edge is written, so the board can refresh the layer. */
  onEdgesChanged?: () => void;
};

type TargetRect = { left: number; top: number; width: number; height: number };

type LocalBox = { left: number; top: number; width: number; height: number };

type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  targetId: string | null;
  targetRect: TargetRect | null;
};

/**
 * One knob per edge. `hit` is the transparent grab area (centred on the visible
 * knob); `knob` is the small filled semicircle whose flat side lies on the box
 * edge -- 12px along the edge by 6px outward (or 6x12 for left/right).
 */
const KNOBS = [
  {
    side: 'top',
    hit: { width: 20, height: 14, left: 'calc(50% - 10px)', top: '-10px' },
    knob: { width: 12, height: 6, radius: '6px 6px 0 0' },
  },
  {
    side: 'right',
    hit: { width: 14, height: 20, left: 'calc(100% - 4px)', top: 'calc(50% - 10px)' },
    knob: { width: 6, height: 12, radius: '0 6px 6px 0' },
  },
  {
    side: 'bottom',
    hit: { width: 20, height: 14, left: 'calc(50% - 10px)', top: 'calc(100% - 4px)' },
    knob: { width: 12, height: 6, radius: '0 0 6px 6px' },
  },
  {
    side: 'left',
    hit: { width: 14, height: 20, left: '-10px', top: 'calc(50% - 10px)' },
    knob: { width: 6, height: 12, radius: '6px 0 0 6px' },
  },
] as const;

export default function GraphConnectHandle({
  boardId,
  postId,
  post,
  isTopLevel,
  onEdgesChanged,
}: GraphConnectHandleProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [box, setBox] = useState<LocalBox | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // PATCH-231: place the knobs on the box the lines attach to. Re-measure after
  // the first render and whenever the wrapper resizes.
  useEffect(() => {
    const wrapper = rootRef.current?.closest('[data-padlet-id]') as HTMLElement | null;
    if (!wrapper) return;
    const measure = () => {
      const a = measureAnchorRect(wrapper, post);
      const w = wrapper.getBoundingClientRect();
      const scale = wrapper.offsetWidth ? w.width / wrapper.offsetWidth : 1;
      setBox({
        left: (a.left - w.left) / scale,
        top: (a.top - w.top) / scale,
        width: a.width / scale,
        height: a.height / scale,
      });
    };
    const raf = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [post]);

  useEffect(() => {
    if (!drag) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDrag(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag]);

  const connect = async (sourceId: string, targetId: string) => {
    try {
      const repo = createFreeformGraphRepo(boardId);
      const existing = await repo.getEdges();
      const already = existing.some(
        (edge) =>
          (edge.source_post_id === sourceId && edge.target_post_id === targetId) ||
          (edge.source_post_id === targetId && edge.target_post_id === sourceId),
      );
      if (already) {
        toast('These posts are already connected.');
        return;
      }
      await repo.upsertEdge({
        id: crypto.randomUUID(),
        board_id: boardId,
        source_post_id: sourceId,
        target_post_id: targetId,
        relation_type: 'solid',
        direction: 'forward',
        label: null,
        style: { color: '#9ca3af' },
      });
      toast.success('Posts connected.');
      onEdgesChanged?.();
    } catch (error) {
      console.error('Could not connect the posts.', error);
      toast.error('Could not connect the posts.');
    }
  };

  const targetAt = (x: number, y: number): { id: string | null; rect: TargetRect | null } => {
    const id = findConnectTargetId(document.elementsFromPoint(x, y), postId, isTopLevel);
    if (!id) return { id: null, rect: null };
    const el = document.querySelector(`[data-padlet-id="${id}"]`) as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return { id, rect: r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null };
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture?.(event.pointerId);
    // The grab area is centred on the visible knob, so its centre IS the
    // pressed knob's visible centre.
    const r = el.getBoundingClientRect();
    setDrag({
      startX: r.left + r.width / 2,
      startY: r.top + r.height / 2,
      x: event.clientX,
      y: event.clientY,
      targetId: null,
      targetRect: null,
    });
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    event.preventDefault();
    const { id, rect } = targetAt(event.clientX, event.clientY);
    setDrag((prev) => (prev ? { ...prev, x: event.clientX, y: event.clientY, targetId: id, targetRect: rect } : prev));
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    event.preventDefault();
    const { id } = targetAt(event.clientX, event.clientY);
    setDrag(null);
    if (id) void connect(postId, id);
  };

  const handlePointerCancel = () => setDrag(null);

  return (
    <>
      <div
        ref={rootRef}
        aria-hidden="true"
        style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none' }}
      />
      {box && (
        <div
          data-graph-connect-knobs="true"
          style={{
            position: 'absolute',
            left: `${box.left}px`,
            top: `${box.top}px`,
            width: `${box.width}px`,
            height: `${box.height}px`,
            pointerEvents: 'none',
          }}
        >
          {KNOBS.map(({ side, hit, knob }) => (
            <div
              key={side}
              data-graph-connect-handle="true"
              data-graph-connect-side={side}
              data-no-drag="true"
              role="button"
              tabIndex={-1}
              aria-label="Drag to connect to another post"
              title="Drag to connect"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              onMouseEnter={() => setHovered(side)}
              onMouseLeave={() => setHovered((prev) => (prev === side ? null : prev))}
              className="z-20"
              style={{
                position: 'absolute',
                left: hit.left,
                top: hit.top,
                width: `${hit.width}px`,
                height: `${hit.height}px`,
                pointerEvents: 'auto',
                cursor: 'crosshair',
                touchAction: 'none',
                background: 'transparent',
              }}
            >
              <div
                data-graph-connect-knob="true"
                data-graph-connect-knob-side={side}
                style={{
                  position: 'absolute',
                  left: '50%',
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: `${knob.width}px`,
                  height: `${knob.height}px`,
                  backgroundColor: hovered === side ? '#4f46e5' : '#6366f1',
                  borderRadius: knob.radius,
                  pointerEvents: 'none',
                }}
              />
            </div>
          ))}
        </div>
      )}
      {drag && typeof document !== 'undefined' && createPortal(
        <svg
          data-graph-connect-preview="true"
          className="pointer-events-none fixed inset-0"
          style={{ zIndex: 8000, width: '100vw', height: '100vh' }}
        >
          <line
            x1={drag.startX}
            y1={drag.startY}
            x2={drag.x}
            y2={drag.y}
            stroke="#6366f1"
            strokeWidth={2}
            strokeDasharray="6 4"
          />
          {drag.targetRect && (
            <rect
              x={drag.targetRect.left}
              y={drag.targetRect.top}
              width={drag.targetRect.width}
              height={drag.targetRect.height}
              rx={6}
              ry={6}
              fill="none"
              stroke="#6366f1"
              strokeWidth={2}
            />
          )}
        </svg>,
        document.body,
      )}
    </>
  );
}
