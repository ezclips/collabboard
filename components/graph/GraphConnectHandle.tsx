"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';

import { createFreeformGraphRepo } from '@/lib/graph/graphRepo';
import { findConnectTargetId } from '@/lib/graph/connectTarget';

/**
 * PATCH-227. The dot on a selected post's right edge: drag it onto another
 * post to create a graph edge. The whole interaction (pointer capture, the
 * dashed preview, the target outline) lives here so FreeformPadletCards only
 * has to decide whether to show it.
 */

type GraphConnectHandleProps = {
  boardId: string;
  postId: string;
  /** A candidate id is a valid drop target only when its post is top-level. */
  isTopLevel: (id: string) => boolean;
  /** Called after a new edge is written, so the board can refresh the layer. */
  onEdgesChanged?: () => void;
};

type TargetRect = { left: number; top: number; width: number; height: number };

type DragState = {
  startX: number;
  startY: number;
  x: number;
  y: number;
  targetId: string | null;
  targetRect: TargetRect | null;
};

/** PATCH-230: one dot on the middle of each edge, half outside the post. */
const CONNECT_SIDES = [
  { side: 'top', position: 'left-1/2 -top-2.5 -translate-x-1/2' },
  { side: 'right', position: '-right-2.5 top-1/2 -translate-y-1/2' },
  { side: 'bottom', position: 'left-1/2 -bottom-2.5 -translate-x-1/2' },
  { side: 'left', position: '-left-2.5 top-1/2 -translate-y-1/2' },
] as const;

export default function GraphConnectHandle({
  boardId,
  postId,
  isTopLevel,
  onEdgesChanged,
}: GraphConnectHandleProps) {
  const [drag, setDrag] = useState<DragState | null>(null);

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
      {CONNECT_SIDES.map(({ side, position }) => (
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
          className={`absolute ${position} z-20 h-3.5 w-3.5 rounded-full border-2 border-indigo-500 bg-white shadow-sm`}
          style={{ cursor: 'crosshair', touchAction: 'none' }}
        />
      ))}
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
