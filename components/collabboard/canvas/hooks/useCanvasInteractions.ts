"use client";

import { useEffect, useRef, useState } from 'react';
import { createUpdatePostPositionCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import type { NewPostDragState, Padlet } from '@/types/collabboard';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { findContainerOverlappingRect } from '@/components/collabboard/canvas/engine/utils';
import { attachPostToContainer } from '@/components/collabboard/canvas/hooks/attachPostToContainer';
import {
  clampGroupDragDeltaToFreeformBounds,
  clampRectPositionToFreeformBounds,
  type FreeformGroupDragBounds,
} from '@/components/collabboard/canvas/engine/freeformStageGeometry';

const DEFAULT_DRAG_RECT_WIDTH = 180;
const DEFAULT_DRAG_RECT_HEIGHT = 220;

interface DragRectSize {
  width: number;
  height: number;
}

/**
 * PATCH 9V.2B Phase 6: posts are not all 180x220 -- Notes, Images, Links,
 * Todos, Containers, expanded Comments, Documents and AI components all size
 * themselves, several of them by auto-height at runtime. Signed-world bounds
 * apply to the WHOLE rectangle, so the clamp needs the post's real size.
 *
 * The live rect measured at mousedown (already normalized out of zoom) is the
 * best available runtime geometry and costs nothing extra -- the drag path
 * measures that element anyway to compute the grab offset. Declared
 * width/height, then the historical defaults, back it up.
 */
function resolveDragRectSize(
  measured: DragRectSize | null,
  declaredWidth: unknown,
  declaredHeight: unknown
): DragRectSize {
  const width = measured && measured.width > 0 ? measured.width : (Number(declaredWidth) || DEFAULT_DRAG_RECT_WIDTH);
  const height = measured && measured.height > 0 ? measured.height : (Number(declaredHeight) || DEFAULT_DRAG_RECT_HEIGHT);
  return { width, height };
}

/** Combined world bounds of a multi-selection at drag start. */
function computeGroupDragBounds(
  padlets: Padlet[],
  selectedIds: string[]
): FreeformGroupDragBounds | null {
  const members = padlets.filter((padlet) => selectedIds.includes(padlet.id));
  if (members.length === 0) return null;
  const lefts = members.map((padlet) => padlet.position_x || 0);
  const tops = members.map((padlet) => padlet.position_y || 0);
  const rights = members.map((padlet) => (padlet.position_x || 0) + (Number(padlet.width) || DEFAULT_DRAG_RECT_WIDTH));
  const bottoms = members.map((padlet) => (padlet.position_y || 0) + (Number(padlet.height) || DEFAULT_DRAG_RECT_HEIGHT));
  return {
    minX: Math.min(...lefts),
    minY: Math.min(...tops),
    maxX: Math.max(...rights),
    maxY: Math.max(...bottoms),
  };
}

interface UseCanvasInteractionsParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
  // PATCH 9S.2: canonical Freeform world-origin reference (see CanvasClient's
  // freeformWorldOriginRef doc comment). Its live getBoundingClientRect()
  // gives the on-screen position of world (0,0), already including the
  // camera gutter -- replaces manual containerRect+scrollLeft/scrollTop math.
  freeformWorldOriginRef: React.RefObject<HTMLDivElement | null>;
  canvasZoom: number;
  canEditCanvas: boolean;
  padlets: Padlet[];
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  selectedPadletIds: string[];
  isLineMode: boolean;
  isAnyEditorOpen: boolean;
  isFreeformGraphMode: boolean;
  isGraphConnectMode: boolean;
  setSelectedPadletId: (v: string | null) => void;
  newPostDragState: NewPostDragState;
  setNewPostDragState: React.Dispatch<React.SetStateAction<NewPostDragState>>;
  setNewPostHoverContainerId: React.Dispatch<React.SetStateAction<string | null>>;
  newPostHoverContainerId: string | null;
  handlePlaceInExisting: (containerId: string) => void;
  setIsPlacementPromptOpen: (v: boolean) => void;
  markPadletLocallyModified: (padletId: string) => void;
  fetchData: (showLoading?: boolean) => Promise<void>;
  PADLET_DRAG_START_DISTANCE: number;
  setGraphRefreshToken?: React.Dispatch<React.SetStateAction<number>>;
}

export function useCanvasInteractions({
  containerRef,
  freeformWorldOriginRef,
  canvasZoom,
  canEditCanvas,
  padlets,
  setPadlets,
  selectedPadletIds,
  isLineMode,
  isAnyEditorOpen,
  isFreeformGraphMode,
  isGraphConnectMode,
  setSelectedPadletId,
  newPostDragState,
  setNewPostDragState,
  setNewPostHoverContainerId,
  newPostHoverContainerId,
  handlePlaceInExisting,
  setIsPlacementPromptOpen,
  markPadletLocallyModified,
  fetchData,
  PADLET_DRAG_START_DISTANCE,
  setGraphRefreshToken,
}: UseCanvasInteractionsParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingPadletId, setDraggingPadletId] = useState<string | null>(null);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });
  // Which container the cursor is currently over while dragging a single
  // padlet -- drives the live "drop here" highlight. Null for group drags
  // (dropping a multi-select into a container isn't supported, same as the
  // drop handler below).
  const [dragOverContainerId, setDragOverContainerId] = useState<string | null>(null);

  const dragEndInFlightRef = useRef(false);
  const isDraggingRef = useRef(false);
  const draggingPadletIdRef = useRef<string | null>(null);
  const draggingPadletIdsRef = useRef<string[]>([]);
  const handleCanvasMouseUpRef = useRef<() => void>(() => { });
  const bodyUserSelectRef = useRef<{ userSelect: string; webkitUserSelect: string } | null>(null);

  const pendingDragRef = useRef<{
    padletId: string;
    padletIds: string[];
    startX: number;
    startY: number;
    offsetX: number;
    offsetY: number;
    rectWidth: number;
    rectHeight: number;
    selectOnDragStart: boolean;
  } | null>(null);

  // Runtime geometry of the grabbed post, in world units (see
  // resolveDragRectSize) -- used only to bound the drag, never to change
  // container-overlap detection.
  const dragRectSizeRef = useRef<DragRectSize | null>(null);
  const dragGroupStartBoundsRef = useRef<FreeformGroupDragBounds | null>(null);

  // Tracks the committed drag position so handleCanvasMouseUp always saves
  // the correct coordinates even when the last setPadlets hasn't re-rendered yet.
  const lastDragPositionRef = useRef<{ x: number; y: number } | null>(null);
  const lastDragDeltaRef = useRef<{ dx: number; dy: number } | null>(null);
  const dragSelectionStartPositionsRef = useRef<Record<string, { x: number; y: number }>>({});

  const lockBodySelection = () => {
    if (bodyUserSelectRef.current) return;
    const body = document.body;
    bodyUserSelectRef.current = {
      userSelect: body.style.userSelect,
      webkitUserSelect: (body.style as any).webkitUserSelect || '',
    };
    body.style.userSelect = 'none';
    (body.style as any).webkitUserSelect = 'none';
  };

  const unlockBodySelection = () => {
    const body = document.body;
    const prev = bodyUserSelectRef.current;
    if (!prev) return;
    body.style.userSelect = prev.userSelect;
    (body.style as any).webkitUserSelect = prev.webkitUserSelect;
    bodyUserSelectRef.current = null;
  };

  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);

  useEffect(() => {
    draggingPadletIdRef.current = draggingPadletId;
  }, [draggingPadletId]);

  useEffect(() => {
    if (isDragging) {
      lockBodySelection();
    }
  }, [isDragging]);

  useEffect(() => {
    return () => {
      unlockBodySelection();
    };
  }, []);

  const handlePadletMouseDown = (e: React.MouseEvent, padletId: string) => {
    debugCanvasLogger('pointerDown', { padletId, x: e.clientX, y: e.clientY });
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (!canEditCanvas) return;

    if (isFreeformGraphMode && isGraphConnectMode) {
      e.preventDefault();
      e.stopPropagation();
      setSelectedPadletId(padletId);
      return;
    }

    lockBodySelection();

    const padlet = padlets.find(p => p.id === padletId);
    if (!padlet || isLineMode) return;
    if ((padlet.metadata as any)?.isLocked) return;
    if (isAnyEditorOpen) {
      return;
    }

    const isTemporaryGroupDrag =
      selectedPadletIds.length > 1 &&
      selectedPadletIds.includes(padletId);
    const dragPadletIds = isTemporaryGroupDrag ? [...selectedPadletIds] : [padletId];

    const rect = e.currentTarget.getBoundingClientRect();
    pendingDragRef.current = {
      padletId,
      padletIds: dragPadletIds,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: (e.clientX - rect.left) / canvasZoom,
      offsetY: (e.clientY - rect.top) / canvasZoom,
      rectWidth: rect.width / canvasZoom,
      rectHeight: rect.height / canvasZoom,
      selectOnDragStart: !isTemporaryGroupDrag,
    };
    if (!isTemporaryGroupDrag) {
      setSelectedPadletId(padletId);
    }
  };

  const handleImagePadletDrag = (e: React.MouseEvent, padletId: string) => {
    if ((e.target as HTMLElement).closest('[data-no-drag="true"]')) return;
    if (!canEditCanvas) return;
    lockBodySelection();

    const padlet = padlets.find(p => p.id === padletId);
    if (!padlet || isLineMode) return;
    if ((padlet.metadata as any)?.isLocked) return;
    if (isAnyEditorOpen) {
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    pendingDragRef.current = {
      padletId,
      padletIds: [padletId],
      startX: e.clientX,
      startY: e.clientY,
      offsetX: (e.clientX - rect.left) / canvasZoom,
      offsetY: (e.clientY - rect.top) / canvasZoom,
      rectWidth: rect.width / canvasZoom,
      rectHeight: rect.height / canvasZoom,
      selectOnDragStart: false,
    };
  };

  const handleCanvasMouseMove = (e: React.MouseEvent) => {
    if (!canEditCanvas) return;
    if (isDragging && e.buttons === 0) {
      handleCanvasMouseUp();
      return;
    }
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    // PATCH 9S.2: freeformWorldOriginRef's live rect already includes the
    // camera gutter + current scroll -- no manual scrollLeft/scrollTop math.
    const origin = freeformWorldOriginRef.current?.getBoundingClientRect();
    const mouseX = origin ? (e.clientX - origin.left) / canvasZoom : 0;
    const mouseY = origin ? (e.clientY - origin.top) / canvasZoom : 0;

    if (!isDragging && pendingDragRef.current) {
      const pending = pendingDragRef.current;
      const dx = (e.clientX - pending.startX) / canvasZoom;
      const dy = (e.clientY - pending.startY) / canvasZoom;
      if (Math.hypot(dx, dy) >= PADLET_DRAG_START_DISTANCE) {
        e.preventDefault();
        setDragOffset({ x: pending.offsetX, y: pending.offsetY });
        debugCanvasLogger('dragStart', { padletId: pending.padletId });
        setIsDragging(true);
        setDraggingPadletId(pending.padletId);
        draggingPadletIdsRef.current = pending.padletIds;
        dragRectSizeRef.current = { width: pending.rectWidth, height: pending.rectHeight };
        if (pending.padletIds.length > 1) {
          dragSelectionStartPositionsRef.current = Object.fromEntries(
            padlets
              .filter((padlet) => pending.padletIds.includes(padlet.id))
              .map((padlet) => [
                padlet.id,
                { x: padlet.position_x || 0, y: padlet.position_y || 0 },
              ])
          );
          dragGroupStartBoundsRef.current = computeGroupDragBounds(padlets, pending.padletIds);
        } else {
          dragSelectionStartPositionsRef.current = {};
          dragGroupStartBoundsRef.current = null;
        }
        if (pending.selectOnDragStart) {
          setSelectedPadletId(pending.padletId);
        }
        pendingDragRef.current = null;
      }
    }

    // Ghost drag tracking is handled by the useEffect in CanvasClient
    if (newPostDragState.isActive) return;

    if (!isDragging || !draggingPadletId) return;

    const edgeThreshold = 60;
    const scrollSpeed = 15;
    const container = containerRef.current;

    if (container) {
      const mouseRelX = e.clientX - containerRect.left;
      const mouseRelY = e.clientY - containerRect.top;

      if (mouseRelX < edgeThreshold) {
        container.scrollLeft -= scrollSpeed;
      } else if (mouseRelX > containerRect.width - edgeThreshold) {
        container.scrollLeft += scrollSpeed;
      }

      if (mouseRelY < edgeThreshold) {
        container.scrollTop -= scrollSpeed;
      } else if (mouseRelY > containerRect.height - edgeThreshold) {
        container.scrollTop += scrollSpeed;
      }
    }

    // Re-read the origin AFTER the edge-scroll nudge above -- its live rect
    // already reflects the just-applied scrollLeft/scrollTop change
    // (getBoundingClientRect is always current), so no separate "updated
    // scroll" bookkeeping is needed the way the old formula required.
    const updatedOrigin = freeformWorldOriginRef.current?.getBoundingClientRect();
    const newX = updatedOrigin ? (e.clientX - updatedOrigin.left) / canvasZoom - dragOffset.x : mouseX - dragOffset.x;
    const newY = updatedOrigin ? (e.clientY - updatedOrigin.top) / canvasZoom - dragOffset.y : mouseY - dragOffset.y;

    setLastMousePosition({ x: mouseX, y: mouseY });

    debugCanvasLogger('dragMove', { padletId: draggingPadletId, x: newX, y: newY });

    const draggedPadletIds = draggingPadletIdsRef.current;

    if (draggedPadletIds.length > 1) {
      setDragOverContainerId((prev) => (prev === null ? prev : null));

      const startPositions = dragSelectionStartPositionsRef.current;
      const anchorStart = startPositions[draggingPadletId];
      const groupBounds = dragGroupStartBoundsRef.current;
      if (!anchorStart || !groupBounds) return;
      // PATCH 9V.2B: bound the group's DELTA against the selection's combined
      // bounds, then hand every member that identical delta. Clamping members
      // individually would let the ones already at an edge stop while the
      // rest kept moving, silently collapsing the selection's spacing.
      const { dx, dy } = clampGroupDragDeltaToFreeformBounds(groupBounds, {
        dx: newX - anchorStart.x,
        dy: newY - anchorStart.y,
      });
      lastDragDeltaRef.current = { dx, dy };

      setPadlets(prev => prev.map((padlet) => {
        if (!draggedPadletIds.includes(padlet.id)) return padlet;
        const start = startPositions[padlet.id];
        if (!start) return padlet;
        return {
          ...padlet,
          position_x: start.x + dx,
          position_y: start.y + dy,
        };
      }));
      return;
    }

    const draggedPadlet = padlets.find((p) => p.id === draggingPadletId);
    // PATCH 9V.2B: signed world placement -- the post may travel left/up past
    // logical (0,0) and stops only at the finite signed world edge, with its
    // whole rectangle kept inside.
    const dragSize = resolveDragRectSize(dragRectSizeRef.current, draggedPadlet?.width, draggedPadlet?.height);
    const { x: clampedX, y: clampedY } = clampRectPositionToFreeformBounds({
      x: newX,
      y: newY,
      width: dragSize.width,
      height: dragSize.height,
    });
    // Container-overlap detection keeps using the post's DECLARED dimensions
    // (PATCH 9V.2B freezes findContainerOverlappingRect's inputs).
    const draggedRect = {
      x: clampedX,
      y: clampedY,
      width: Number(draggedPadlet?.width) || DEFAULT_DRAG_RECT_WIDTH,
      height: Number(draggedPadlet?.height) || DEFAULT_DRAG_RECT_HEIGHT,
    };
    const hoveredContainer = findContainerOverlappingRect(padlets, draggedRect, draggingPadletId);
    setDragOverContainerId((prev) => {
      const nextId = hoveredContainer?.id ?? null;
      return prev === nextId ? prev : nextId;
    });

    lastDragPositionRef.current = { x: clampedX, y: clampedY };

    setPadlets(prev => prev.map(p =>
      p.id === draggingPadletId
        ? { ...p, position_x: clampedX, position_y: clampedY }
        : p
    ));
  };

  const handleCanvasMouseUp = async () => {
    debugCanvasLogger('pointerUp', {});
    if (dragEndInFlightRef.current) return;
    dragEndInFlightRef.current = true;
    setDragOverContainerId(null);
    try {
      if (!canEditCanvas) {
        pendingDragRef.current = null;
        draggingPadletIdsRef.current = [];
        dragSelectionStartPositionsRef.current = {};
        lastDragDeltaRef.current = null;
        lastDragPositionRef.current = null;
        setIsDragging(false);
        setDraggingPadletId(null);
        return;
      }
      const currentDraggingId = draggingPadletIdRef.current;
      const currentIsDragging = isDraggingRef.current;
      const currentDraggingIds = draggingPadletIdsRef.current;
      if (pendingDragRef.current) {
        pendingDragRef.current = null;
      }

      // Ghost drag drop is handled by the useEffect in CanvasClient
      if (newPostDragState.isActive) return;

      if (currentIsDragging && currentDraggingId) {
        if (currentDraggingIds.length > 1) {
          const dragDelta = lastDragDeltaRef.current;
          const startPositions = dragSelectionStartPositionsRef.current;
          lastDragDeltaRef.current = null;
          dragSelectionStartPositionsRef.current = {};
          if (dragDelta) {
            try {
              const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());
              await Promise.all(
                currentDraggingIds.map(async (padletId) => {
                  const start = startPositions[padletId];
                  if (!start) return;
                  // PATCH 9V.2B: the delta was already bounded once, against
                  // the group's combined rect (see handleCanvasMouseMove).
                  // Re-clamping per post here is exactly the optimistic-vs-
                  // persisted divergence this patch removes: the DB must
                  // receive the same coordinates the user just saw.
                  const nextX = Math.round(start.x + dragDelta.dx);
                  const nextY = Math.round(start.y + dragDelta.dy);
                  markPadletLocallyModified(padletId);
                  const result = await updatePostPosition({ postId: padletId, positionX: nextX, positionY: nextY }, { userId: null });
                  if (!result.ok) throw result.error.cause ?? result.error;
                })
              );
            } catch (err) {
              console.error('Failed to save grouped padlet positions:', err);
              fetchData();
            }
          }
          draggingPadletIdsRef.current = [];
          setIsDragging(false);
          setDraggingPadletId(null);
          return;
        }

        const draggedPadlet = padlets.find(p => p.id === currentDraggingId);
        if (!draggedPadlet) {
          lastDragPositionRef.current = null;
          draggingPadletIdsRef.current = [];
          setIsDragging(false);
          setDraggingPadletId(null);
          return;
        }

        const finalDragPosition = lastDragPositionRef.current ?? {
          x: draggedPadlet.position_x || 0,
          y: draggedPadlet.position_y || 0,
        };
        const finalDragRect = {
          x: finalDragPosition.x,
          y: finalDragPosition.y,
          width: Number(draggedPadlet.width) || DEFAULT_DRAG_RECT_WIDTH,
          height: Number(draggedPadlet.height) || DEFAULT_DRAG_RECT_HEIGHT,
        };
        const droppedOnContainer = findContainerOverlappingRect(padlets, finalDragRect, currentDraggingId);

        if (droppedOnContainer) {
          lastDragPositionRef.current = null;
          await attachPostToContainer({
            padlets,
            containerId: droppedOnContainer.id,
            postId: currentDraggingId,
            setPadlets,
            fetchData,
            markPadletLocallyModified,
            onGraphEdgesChanged: () => setGraphRefreshToken?.((token) => token + 1),
          });
        } else {
          const finalPos = lastDragPositionRef.current;
          lastDragPositionRef.current = null;
          if (finalPos) {
            const committedX = Math.round(finalPos.x);
            const committedY = Math.round(finalPos.y);
            markPadletLocallyModified(currentDraggingId);
            try {
              const updatePostPosition = createUpdatePostPositionCommand(createPostsRepository());
              const result = await updatePostPosition({ postId: currentDraggingId, positionX: committedX, positionY: committedY }, { userId: null });
              if (!result.ok) {
                throw result.error.cause ?? result.error;
              }
            } catch (err) {
              console.error('Failed to save padlet position:', err);
            }
          }
        }
      }
      debugCanvasLogger('dragEnd', { padletId: currentDraggingId });
      draggingPadletIdsRef.current = [];
      dragSelectionStartPositionsRef.current = {};
      lastDragDeltaRef.current = null;
      setIsDragging(false);
      setDraggingPadletId(null);
    } finally {
      dragEndInFlightRef.current = false;
      dragRectSizeRef.current = null;
      dragGroupStartBoundsRef.current = null;
      unlockBodySelection();
    }
  };

  useEffect(() => {
    handleCanvasMouseUpRef.current = () => {
      handleCanvasMouseUp();
    };
  });

  useEffect(() => {
    if (!canEditCanvas) return;
    const handleWindowMouseUp = () => {
      handleCanvasMouseUpRef.current();
    };
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('pointerup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('pointerup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowMouseUp);
    };
  }, [canEditCanvas]);


  return {
    isDragging,
    setIsDragging,
    dragOffset,
    setDragOffset,
    draggingPadletId,
    setDraggingPadletId,
    lastMousePosition,
    setLastMousePosition,
    dragOverContainerId,
    handlePadletMouseDown,
    handleImagePadletDrag,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  };
}
