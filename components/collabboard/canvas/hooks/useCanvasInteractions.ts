"use client";

import { useEffect, useRef, useState } from 'react';
import { createUpdatePostPositionCommand } from '@/lib/domain/canvas/posts';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import type { FreeformAlignmentGuideKindState, FreeformAlignmentGuideState, FreeformSpacingGuideState, NewPostDragState, Padlet } from '@/types/collabboard';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { findContainerOverlappingRect } from '@/components/collabboard/canvas/engine/utils';
import { attachPostToContainer } from '@/components/collabboard/canvas/hooks/attachPostToContainer';
import {
  clampGroupDragDeltaToFreeformBounds,
  clampRectPositionToFreeformBounds,
  detectHorizontalAlignmentMatch,
  detectHorizontalSpacingGap,
  detectVerticalAlignmentMatch,
  detectVerticalSpacingGap,
  snapWorldValueToGrid,
  FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX,
  FREEFORM_SPACING_GUIDE_MAX_DISTANCE_SCREEN_PX,
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

/**
 * PATCH ALIGN-E1: same measured-DOM-first convention as resolveDragRectSize
 * above, applied to an OTHER (non-dragged) root post's alignment-candidate
 * box. Stored `padlet.width`/`height` can go stale relative to what is
 * actually on screen -- most visibly for Image posts, whose outer frame
 * height is intentionally CSS `auto` (PATCH FREEFORM-IMAGE-R7) and is never
 * written back to the stored field outside a manual resize commit. Reading
 * the live `[data-padlet-id]` box (which hugs its content exactly -- see
 * ALIGN-E LIVE DIAG) sidesteps that drift entirely; the stored width/height
 * remains the fallback for a post with no mounted DOM node (off-screen
 * virtualized, or mid-unmount).
 */
function measureLiveCandidateSize(padletId: string, canvasZoom: number): DragRectSize | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector<HTMLElement>(`[data-padlet-id="${padletId}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const zoom = canvasZoom > 0 ? canvasZoom : 1;
  return { width: rect.width / zoom, height: rect.height / zoom };
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
  // PATCH SNAP-GRID-B: rounds a ROOT post's world x/y to the nearest 20
  // world units while dragging and on commit. OFF leaves every existing
  // drag number untouched (same fractional preview, same Math.round(v) at
  // commit as before this patch). WORLD-space only -- never scaled by
  // canvasZoom, which stays a dot-grid rendering concern.
  snapToGrid: boolean;
  // PATCH ALIGN-D: personal, client-local visual preference -- same
  // never-gated-on-edit-permission treatment as snapToGrid above. OFF
  // suppresses BOTH detection calls below (no wasted computation during
  // drag) and, via the effect right after this hook's state declarations,
  // immediately clears any guide already on screen the instant it flips off
  // -- not just at the next mousemove.
  alignmentGuidesEnabled: boolean;
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
  snapToGrid,
  alignmentGuidesEnabled,
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
  // PATCH ALIGN-A: Smart Alignment Guide foundation -- transient, never
  // persisted, cleared on every drag end (see handleCanvasMouseUp's cleanup
  // below). Nothing in this patch sets it to a non-null value; detection
  // (comparing the dragged post's edges/center against other ROOT posts,
  // see the marked point in the single-post branch of handleCanvasMouseMove
  // below) is ALIGN-B's job.
  const [alignmentGuides, setAlignmentGuides] = useState<FreeformAlignmentGuideState>({
    verticalX: null,
    horizontalY: null,
  });
  // PATCH ALIGN-E2: presentation-only sibling of alignmentGuides -- which
  // axis, if any, is currently showing an ADJACENCY match rather than an
  // ordinary same-edge/center one. Kept as its own state (not new fields on
  // alignmentGuides) so it never changes alignmentGuides' own shape -- see
  // FreeformAlignmentGuideKindState's doc comment.
  const [alignmentGuideKinds, setAlignmentGuideKinds] = useState<FreeformAlignmentGuideKindState>({
    verticalIsAdjacency: false,
    horizontalIsAdjacency: false,
    verticalMarkerY: null,
    horizontalMarkerX: null,
  });
  // PATCH SPACE-P1: transient "spacing guide" state -- a measurement-only
  // bracket showing the actual positive gap to the nearest non-overlapping
  // neighbour on each axis. Same lifecycle as alignmentGuides above (cleared
  // on drag end, cleared immediately when alignmentGuidesEnabled flips off --
  // this prototype rides the SAME preference, per patch spec) but kept as
  // its own state rather than new fields on alignmentGuides: geometry (an
  // edge/center MATCH) and a gap MEASUREMENT are different concepts that can
  // both be present, absent, or independently null per axis.
  const [spacingGuides, setSpacingGuides] = useState<FreeformSpacingGuideState>({
    horizontalGap: null,
    verticalGap: null,
  });

  // PATCH ALIGN-D: flipping the preference off must clear an already-visible
  // guide IMMEDIATELY, not just withhold new ones starting at the next
  // mousemove -- the toggle lives in a menu the user can open mid-drag.
  useEffect(() => {
    if (!alignmentGuidesEnabled) {
      setAlignmentGuides({ verticalX: null, horizontalY: null });
      setAlignmentGuideKinds({ verticalIsAdjacency: false, horizontalIsAdjacency: false, verticalMarkerY: null, horizontalMarkerX: null });
      // PATCH SPACE-P1: same OFF-means-off contract as the two lines above.
      setSpacingGuides({ horizontalGap: null, verticalGap: null });
    }
  }, [alignmentGuidesEnabled]);

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

  // PATCH SNAP-GRID-C: Alt/Option temporarily bypasses snap for the CURRENT
  // gesture only -- the stored `snapToGrid` preference itself is never
  // touched. Synced from two sources so it's correct even at release with no
  // intervening mousemove: the live mousemove event's own altKey (most
  // authoritative while dragging) and dedicated keydown/keyup listeners
  // (covers Alt pressed/released between the last move and mouseup).
  const altKeyRef = useRef(false);

  useEffect(() => {
    const handleAltKeyChange = (e: KeyboardEvent) => {
      if (e.key === 'Alt') altKeyRef.current = e.type === 'keydown';
    };
    const handleWindowBlur = () => { altKeyRef.current = false; };
    window.addEventListener('keydown', handleAltKeyChange);
    window.addEventListener('keyup', handleAltKeyChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleAltKeyChange);
      window.removeEventListener('keyup', handleAltKeyChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

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
    // PATCH SNAP-GRID-C: the live event's altKey is the freshest signal while
    // a drag is in progress; keydown/keyup (above) cover the gap between the
    // last move and mouseup.
    altKeyRef.current = e.altKey;
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
      const clampedDelta = clampGroupDragDeltaToFreeformBounds(groupBounds, {
        dx: newX - anchorStart.x,
        dy: newY - anchorStart.y,
      });
      // PATCH SNAP-GRID-C: the ref stores the RAW (pre-snap) delta -- the
      // commit re-derives the snapped/bypassed delta itself from this, using
      // whatever Alt state is authoritative AT RELEASE (see
      // handleCanvasMouseUp), not whatever this particular mousemove decided.
      lastDragDeltaRef.current = clampedDelta;

      // PATCH SNAP-GRID-C: snap the DELTA once, off the anchor (the post the
      // user is actually holding), then apply that identical delta to every
      // member -- never snap each member's x/y independently, which would
      // round every post toward its own nearest grid line and destroy the
      // group's relative spacing (post A at x=13, post B at x=47 must still
      // differ by exactly 34 after a snapped group drag). Alt/Option
      // temporarily bypasses snapping for this gesture without touching the
      // stored preference.
      const effectiveSnapToGrid = snapToGrid && !altKeyRef.current;
      const dx = effectiveSnapToGrid
        ? snapWorldValueToGrid(anchorStart.x + clampedDelta.dx) - anchorStart.x
        : clampedDelta.dx;
      const dy = effectiveSnapToGrid
        ? snapWorldValueToGrid(anchorStart.y + clampedDelta.dy) - anchorStart.y
        : clampedDelta.dy;

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

    // PATCH SNAP-GRID-C: the ref stores the RAW (pre-snap) clamped position --
    // the commit re-derives snapped-or-bypassed from this using whatever Alt
    // state is authoritative AT RELEASE, not whatever this mousemove decided.
    lastDragPositionRef.current = { x: clampedX, y: clampedY };

    // PATCH SNAP-GRID-B/C: snapped AFTER the existing bounds clamp, so the
    // preview the user sees during the drag is exactly the value that will
    // be committed (see handleCanvasMouseUp) -- unless Alt/Option is held,
    // which bypasses snapping for this gesture without touching the stored
    // preference. Plain OFF path is byte-for-byte the pre-patch clampedX/Y.
    const effectiveSnapToGrid = snapToGrid && !altKeyRef.current;
    const previewX = effectiveSnapToGrid ? snapWorldValueToGrid(clampedX) : clampedX;
    const previewY = effectiveSnapToGrid ? snapWorldValueToGrid(clampedY) : clampedY;

    // PATCH ALIGN-B/C/D: alignment guide detection OBSERVES the final preview
    // position (previewX/Y -- already bounds-clamped and, if Snap-to-Grid is
    // on, already snapped) -- it never feeds back into previewX/Y, so
    // Snap-to-Grid's own output is byte-for-byte unaffected by this block.
    // Root posts only (mirrors CanvasClient's rootPadlets predicate exactly),
    // dragged post excluded by id. Both axes are computed independently from
    // the SAME candidate list and may both be non-null at once.
    //
    // ALIGN-D: when the personal preference is OFF, skip BOTH detectors
    // entirely (no wasted computation every mousemove) rather than compute
    // and then discard -- the guide stays cleared via the effect above, and
    // post movement (previewX/Y, already computed above) is untouched either
    // way.
    if (alignmentGuidesEnabled) {
      const alignmentToleranceWorld = FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX / (canvasZoom > 0 ? canvasZoom : 1);
      const alignmentCandidates = padlets
        .filter((p) => !p.metadata?.parentId && p.id !== draggingPadletId)
        .map((p) => {
          // PATCH ALIGN-E1: prefer the OTHER post's live rendered OUTER
          // frame over its stored width/height -- x/y still come straight
          // from position_x/position_y, unchanged.
          //
          // PATCH SPACE-P2: the outer `[data-padlet-id]` frame is the SOLE
          // canonical rect for every post type, with no per-type exception.
          // PATCH ALIGN-E3/E4 previously special-cased Image/AI to measure
          // their inner visible CONTENT instead (excluding the top strip,
          // Reactions row, or Caption footer) -- reverted here per product
          // decision: guides/spacing must attach to the same visible blue
          // post border the user actually sees and drags, for every type,
          // Full View included.
          const liveSize = measureLiveCandidateSize(p.id, canvasZoom);
          return {
            x: p.position_x || 0,
            width: liveSize?.width ?? (Number(p.width) || DEFAULT_DRAG_RECT_WIDTH),
            y: p.position_y || 0,
            height: liveSize?.height ?? (Number(p.height) || DEFAULT_DRAG_RECT_HEIGHT),
          };
        });
      // PATCH ALIGN-E2: the richer *Match variants report which pair family
      // won (adjacency vs same-edge/center) alongside the value -- purely
      // presentational, threaded into the separate alignmentGuideKinds
      // state below. alignmentGuides itself still receives only the value,
      // exactly as every prior patch left it.
      const verticalMatch = detectVerticalAlignmentMatch(
        { x: previewX, width: dragSize.width },
        alignmentCandidates,
        alignmentToleranceWorld,
      );
      const horizontalMatch = detectHorizontalAlignmentMatch(
        { y: previewY, height: dragSize.height },
        alignmentCandidates,
        alignmentToleranceWorld,
      );
      setAlignmentGuides({ verticalX: verticalMatch?.value ?? null, horizontalY: horizontalMatch?.value ?? null });
      // PATCH ALIGN-E2: an adjacency marker's cross-axis position is the
      // DRAGGED post's own center on that axis -- the vertical (X-axis)
      // guide line runs its full length at a fixed X, so the marker needs a
      // Y to sit at; the dragged post's vertical center is the simplest
      // stable answer without tracking which candidate rect won.
      setAlignmentGuideKinds({
        verticalIsAdjacency: verticalMatch?.isAdjacency ?? false,
        horizontalIsAdjacency: horizontalMatch?.isAdjacency ?? false,
        verticalMarkerY: verticalMatch?.isAdjacency ? previewY + dragSize.height / 2 : null,
        horizontalMarkerX: horizontalMatch?.isAdjacency ? previewX + dragSize.width / 2 : null,
      });

      // PATCH SPACE-P1: spacing-gap bracket detection -- reuses the SAME
      // alignmentCandidates list and preview position above (this is purely
      // an additional read of already-computed geometry, nothing here feeds
      // back into previewX/Y or dragSize). Screen-constant max distance
      // converted through canvasZoom the same way the alignment tolerance
      // is, just above.
      const spacingMaxDistanceWorld = FREEFORM_SPACING_GUIDE_MAX_DISTANCE_SCREEN_PX / (canvasZoom > 0 ? canvasZoom : 1);
      const draggedSpacingRect = { x: previewX, y: previewY, width: dragSize.width, height: dragSize.height };
      const horizontalSpacingMatch = detectHorizontalSpacingGap(draggedSpacingRect, alignmentCandidates, spacingMaxDistanceWorld);
      const verticalSpacingMatch = detectVerticalSpacingGap(draggedSpacingRect, alignmentCandidates, spacingMaxDistanceWorld);
      setSpacingGuides({
        horizontalGap: horizontalSpacingMatch,
        verticalGap: verticalSpacingMatch,
      });
    }

    setPadlets(prev => prev.map(p =>
      p.id === draggingPadletId
        ? { ...p, position_x: previewX, position_y: previewY }
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
          // PATCH SNAP-GRID-C: rawDelta is the pre-snap delta captured by the
          // last mousemove. The snap-or-bypass decision is made HERE, fresh,
          // from the Alt state as it stands AT RELEASE -- not inherited from
          // whatever the last mousemove happened to decide -- so "release
          // with Alt held commits unsnapped" holds even if Alt changed after
          // the final pointer move.
          const rawDelta = lastDragDeltaRef.current;
          const startPositions = dragSelectionStartPositionsRef.current;
          const anchorStart = startPositions[currentDraggingId];
          lastDragDeltaRef.current = null;
          dragSelectionStartPositionsRef.current = {};
          if (rawDelta && anchorStart) {
            const effectiveSnapToGrid = snapToGrid && !altKeyRef.current;
            const dx = effectiveSnapToGrid
              ? snapWorldValueToGrid(anchorStart.x + rawDelta.dx) - anchorStart.x
              : rawDelta.dx;
            const dy = effectiveSnapToGrid
              ? snapWorldValueToGrid(anchorStart.y + rawDelta.dy) - anchorStart.y
              : rawDelta.dy;
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
                  //
                  // PATCH SNAP-GRID-C: dx/dy are the SAME single value for
                  // every member -- applying an identical delta to each
                  // (never re-snapping per member) is what preserves the
                  // group's relative spacing.
                  const nextX = Math.round(start.x + dx);
                  const nextY = Math.round(start.y + dy);
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
            // PATCH SNAP-GRID-C: finalPos is the RAW (pre-snap) clamped
            // position from the last mousemove; the snap-or-bypass decision
            // is made fresh here from the Alt state at release, matching the
            // group path above.
            const effectiveSnapToGrid = snapToGrid && !altKeyRef.current;
            const committedX = effectiveSnapToGrid ? snapWorldValueToGrid(finalPos.x) : Math.round(finalPos.x);
            const committedY = effectiveSnapToGrid ? snapWorldValueToGrid(finalPos.y) : Math.round(finalPos.y);
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
      // PATCH ALIGN-A: no persistence -- every drag end clears any guide,
      // matching every other per-gesture ref reset in this block.
      setAlignmentGuides({ verticalX: null, horizontalY: null });
      // PATCH ALIGN-E2: its presentation-only sibling resets alongside it.
      setAlignmentGuideKinds({ verticalIsAdjacency: false, horizontalIsAdjacency: false, verticalMarkerY: null, horizontalMarkerX: null });
      // PATCH SPACE-P1: same per-gesture reset as the two lines above.
      setSpacingGuides({ horizontalGap: null, verticalGap: null });
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
    alignmentGuides,
    setAlignmentGuides,
    alignmentGuideKinds,
    setAlignmentGuideKinds,
    spacingGuides,
    setSpacingGuides,
    handlePadletMouseDown,
    handleImagePadletDrag,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  };
}
