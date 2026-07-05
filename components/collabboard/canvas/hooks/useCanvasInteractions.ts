"use client";

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { NewPostDragState, Padlet } from '@/types/collabboard';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { isContainerPadlet } from '@/components/collabboard/canvas/engine/utils';

interface UseCanvasInteractionsParams {
  containerRef: React.RefObject<HTMLDivElement | null>;
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
}

export function useCanvasInteractions({
  containerRef,
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
}: UseCanvasInteractionsParams) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draggingPadletId, setDraggingPadletId] = useState<string | null>(null);
  const [lastMousePosition, setLastMousePosition] = useState({ x: 0, y: 0 });

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
    selectOnDragStart: boolean;
  } | null>(null);

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

    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;
    const mouseX = (e.clientX - containerRect.left + scrollLeft) / canvasZoom;
    const mouseY = (e.clientY - containerRect.top + scrollTop) / canvasZoom;

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
        if (pending.padletIds.length > 1) {
          dragSelectionStartPositionsRef.current = Object.fromEntries(
            padlets
              .filter((padlet) => pending.padletIds.includes(padlet.id))
              .map((padlet) => [
                padlet.id,
                { x: padlet.position_x || 0, y: padlet.position_y || 0 },
              ])
          );
        } else {
          dragSelectionStartPositionsRef.current = {};
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

    const updatedScrollLeft = containerRef.current?.scrollLeft || 0;
    const updatedScrollTop = containerRef.current?.scrollTop || 0;

    const newX = (e.clientX - containerRect.left + updatedScrollLeft) / canvasZoom - dragOffset.x;
    const newY = (e.clientY - containerRect.top + updatedScrollTop) / canvasZoom - dragOffset.y;

    setLastMousePosition({ x: mouseX, y: mouseY });

    debugCanvasLogger('dragMove', { padletId: draggingPadletId, x: newX, y: newY });

    const clampedX = Math.max(0, newX);
    const clampedY = Math.max(0, newY);
    const draggedPadletIds = draggingPadletIdsRef.current;

    if (draggedPadletIds.length > 1) {
      const startPositions = dragSelectionStartPositionsRef.current;
      const anchorStart = startPositions[draggingPadletId];
      if (!anchorStart) return;
      const dx = clampedX - anchorStart.x;
      const dy = clampedY - anchorStart.y;
      lastDragDeltaRef.current = { dx, dy };

      setPadlets(prev => prev.map((padlet) => {
        if (!draggedPadletIds.includes(padlet.id)) return padlet;
        const start = startPositions[padlet.id];
        if (!start) return padlet;
        return {
          ...padlet,
          position_x: Math.max(0, start.x + dx),
          position_y: Math.max(0, start.y + dy),
        };
      }));
      return;
    }

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
              await Promise.all(
                currentDraggingIds.map(async (padletId) => {
                  const start = startPositions[padletId];
                  if (!start) return;
                  const nextX = Math.max(0, Math.round(start.x + dragDelta.dx));
                  const nextY = Math.max(0, Math.round(start.y + dragDelta.dy));
                  markPadletLocallyModified(padletId);
                  const { error } = await supabase
                    .from('padlets')
                    .update({
                      position_x: nextX,
                      position_y: nextY,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', padletId);
                  if (error) throw error;
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

        const containers = padlets.filter(p => p.type === 'container' && p.id !== currentDraggingId && !p.metadata?.parentId);
        let droppedOnContainer: typeof containers[0] | null = null;

        for (const container of containers) {
          const containerLeft = container.position_x || 0;
          const containerTop = container.position_y || 0;
          const containerWidth = 280;
          const containerHeight = 200;

          if (
            lastMousePosition.x >= containerLeft &&
            lastMousePosition.x <= containerLeft + containerWidth &&
            lastMousePosition.y >= containerTop &&
            lastMousePosition.y <= containerTop + containerHeight
          ) {
            droppedOnContainer = container;
            break;
          }
        }

        if (droppedOnContainer) {
          lastDragPositionRef.current = null;
          const childIds = droppedOnContainer.metadata?.childPadletIds || [];
          if (!childIds.includes(currentDraggingId)) {
            const newChildIds = [...childIds, currentDraggingId];
            try {
              markPadletLocallyModified(droppedOnContainer.id);
              markPadletLocallyModified(currentDraggingId);

              await supabase
                .from('padlets')
                .update({
                  metadata: { ...droppedOnContainer.metadata, childPadletIds: newChildIds },
                  updated_at: new Date().toISOString(),
                })
                .eq('id', droppedOnContainer.id);

              const newMetadata = { ...draggedPadlet.metadata, parentId: droppedOnContainer.id };
              await supabase
                .from('padlets')
                .update({
                  metadata: newMetadata,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentDraggingId);

              setPadlets(prev => prev.map(p => {
                if (p.id === droppedOnContainer!.id) {
                  return { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } };
                }
                if (p.id === currentDraggingId) {
                  return { ...p, metadata: newMetadata };
                }
                return p;
              }));

              fetchData();
            } catch (err) {
              console.error('Failed to add padlet to container:', err);
            }
          }
        } else {
          const finalPos = lastDragPositionRef.current;
          lastDragPositionRef.current = null;
          if (finalPos) {
            const committedX = Math.round(finalPos.x);
            const committedY = Math.round(finalPos.y);
            markPadletLocallyModified(currentDraggingId);
            try {
              const { error } = await supabase
                .from('padlets')
                .update({
                  position_x: committedX,
                  position_y: committedY,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', currentDraggingId);
              if (error) {
                throw error;
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
    handlePadletMouseDown,
    handleImagePadletDrag,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  };
}
