"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useContext, useRef, useMemo, useLayoutEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import type { CanvasLine, Padlet } from '@/types/collabboard';
import dynamic from 'next/dynamic';
import { getExcalidrawLibrary } from '@/lib/collabboard/excalidrawLibrary';
import {
  buildDrawingSceneUpdate,
  collectDrawingLinkedContainerDeletionPlan,
  prepareImportedSceneForAdd,
  shouldAutoCreateDrawingContainer,
  type ImportedDrawingScene,
} from '@/lib/infra/drawing/importScene';
import { getContainerEditTargetLabel } from '@/lib/infra/collabboard/containerEditTargetLabel';
import { sortSlidesByPresentationOrder } from '@/lib/infra/presentation/slideOrder';
import { syncInvalidIndicesImmutable, validateFractionalIndices, getSceneVersion } from '@excalidraw/element';
import { createSettledScenePropagation } from '@/lib/infra/drawing/settledScenePropagation';
import { computePostRenderRevision } from '@/lib/infra/drawing/postRenderRevision';
import LibraryPanel from '@/components/collabboard/LibraryPanel';
import PostCardContent from '@/components/collabboard/PostCardContent';
import EmbeddedCommentList from '@/components/collabboard/EmbeddedCommentList';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';
import { resolveContainerOrientation } from '@/lib/domain/canvas/containerModel';
import ZoomControls from '@/components/collabboard/canvas/ui/ZoomControls';
import { PresentationPanel } from '@/components/presentation/PresentationPanel';
import { FullscreenPresentation, type RuntimeSlideHelpers } from '@/components/presentation/FullscreenPresentation';
import type { FrameSlide, RenderSlideOptions } from '@/components/presentation/PresentationPanel';
import { createSlideRenderer } from '@/components/presentation/slide-renderer/createSlideRenderer';
import { CanvasContextMenu } from '@/components/collabboard/canvas/ui/CanvasContextMenu';
import { useCanvasActions } from '@/components/collabboard/canvas/hooks/useCanvasActions';
import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';
import {
  isSectionHeading,
  getSectionHeadingHeight,
  SECTION_HEADING_UNBOUNDED_WORLD,
  type SectionHeadingLevel,
  type SectionHeadingRect,
} from '@/components/collabboard/canvas/engine/sectionHeading';
import type { CaptionStyle } from '@/lib/domain/canvas/captionStyle';
import type { SectionHeadingColorTarget } from '@/components/collabboard/canvas/ui/SectionHeadingAppearancePanel';
import { MessageSquarePlus, Library, MonitorPlay, X, Workflow, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { contrastIconColor } from '@/components/collabboard/shells/CardShell';
import CustomMermaidModal from './CustomMermaidModal';
import { sanitizeClonedPostMetadata } from '@/lib/infra/collabboard/clonedPostMetadata';
import { resolveFrameMembership } from '@/lib/infra/drawing/frameMembership';
import type { DrawingViewport } from '@/lib/infra/drawing/canvasLineCoordinates';
import { registerE2EBridge } from '@/lib/e2e/bridgeRegistration';
import { isElementBeingLaidOut } from '@/lib/infra/drawing/isElementBeingLaidOut';
import { guardCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';

const ExcalidrawWrapper = dynamic(
  () => import('@/components/collabboard/editors/ExcalidrawWrapper'),
  { ssr: false, loading: () => <div className="flex items-center justify-center h-full text-gray-400">Loading editor...</div> }
);

// Measures the natural height of a container card and reports it upward so the
// Excalidraw embeddable element can be resized to fit the content exactly.
type AutoHeightContainerProps = {
  padlet: Padlet;
  allPadlets: Padlet[];
  onNaturalHeight: (h: number) => void;
  onRequiredWidthChange?: (w: number) => void;
  onDropExistingPadlet?: (containerId: string, droppedId: string) => void;
  onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
  commentAccessMode?: CommentAccessMode;
  onScanChild?: () => void;
  isExpanded?: boolean;
  onExpandAvailabilityChange?: (available: boolean) => void;
  onOpenDocument?: (post: Padlet) => void;
};
function AutoHeightContainer({ padlet, allPadlets, onNaturalHeight, onRequiredWidthChange, onDropExistingPadlet, onDropDraftIntoContainer, currentUserId, currentUserName, currentUserAvatar, onUpdateChildComments, commentAccessMode, onScanChild, isExpanded, onExpandAvailabilityChange, onOpenDocument }: AutoHeightContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onNaturalHeight);
  cbRef.current = onNaturalHeight;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const report = () => {
      if (isElementBeingLaidOut(el)) cbRef.current(el.scrollHeight);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref}>
      <RowColumnContainerCard
        padlet={padlet}
        allPadlets={allPadlets}
        orientation={resolveContainerOrientation(padlet.metadata)}
        onRequiredWidthChange={onRequiredWidthChange}
        showHeader={false}
        isExpanded={isExpanded}
        canvasContext="drawing"
        onDropExistingPadlet={onDropExistingPadlet}
        onDropDraftIntoContainer={onDropDraftIntoContainer}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserAvatar={currentUserAvatar}
        onUpdateChildComments={onUpdateChildComments}
        accessMode={commentAccessMode}
        onScanChild={onScanChild}
        onExpandAvailabilityChange={onExpandAvailabilityChange}
        onOpenDocument={onOpenDocument}
      />
    </div>
  );
}

// At zoom levels below 100%, one screen pixel spans more than 1 scene unit
// (e.g. at 90% zoom, 1px = 1 / 0.9 = 1.111... scene units). The DB round-trip
// can quantize fractional positions, so the "DB caught up" comparison needs to
// tolerate a little more than one scene pixel to avoid snapping back on release.
const POSITION_SYNC_EPSILON = 1.25;
const DEV_DRAWING_BRIDGE_DIAGNOSTICS = process.env.NODE_ENV !== 'production';
const DRAWING_BRIDGE_LOG_PREFIX = '[DrawingLayout:back-line-bridge]';
const INITIAL_VIEWPORT_SETTLE_MAX_FRAMES = 12;
const PRESENTATION_FRAME_NAVIGATION_PADDING_PX = 48;
const PRESENTATION_FRAME_NAVIGATION_MAX_ZOOM = 1;
const BACK_LINE_INTERACTIVE_ROLE_PRIORITY = [
  'point-handle',
  'midpoint-handle',
  'start-handle',
  'control-handle',
  'end-handle',
  'label-handle',
  'hit-path',
] as const;

type DrawingSceneSnapshot = {
  elements: any[];
  appState: any;
  files: any;
  generation: number;
};

const preserveImportedTransientAppState = (nextAppState: any, currentAppState: any) => ({
  ...nextAppState,
  collaborators: currentAppState?.collaborators ?? new Map(),
  activeTool: currentAppState?.activeTool,
  openDialog: currentAppState?.openDialog ?? null,
  openSidebar: currentAppState?.openSidebar ?? null,
  openPopup: null,
  activeEmbeddable: null,
  selectedElementIds: {},
  selectedGroupIds: {},
  selectedLinearElement: null,
  editingElement: null,
  editingGroupId: null,
  editingLinearElement: null,
});

const syncSceneElementIndices = (elements: any[]): any[] => {
  const syncedElements = syncInvalidIndicesImmutable(elements as any);
  return syncedElements ? Array.from(syncedElements.values()) : elements;
};

const hasInvalidFractionalIndex = (elements: any[]): boolean => {
  try {
    validateFractionalIndices(elements as any, {
      shouldThrow: true,
      includeBoundTextValidation: false,
      ignoreLogs: true,
      reconciliationContext: undefined,
    });
    return false;
  } catch (error) {
    if ((error as { code?: string })?.code === 'ELEMENT_HAS_INVALID_INDEX') {
      return true;
    }
    throw error;
  }
};

const buildActiveFrameNameSignature = (elements: readonly any[]) => {
  let signature = '';
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el?.isDeleted || el?.type !== 'frame') continue;
    signature += `${JSON.stringify([el.id, el.name ?? null])}\n`;
  }
  return signature;
};

const getElementClassNameForDiagnostics = (node: Element | null) => {
  if (!node) return null;
  const className = node.className as string | { baseVal?: string } | undefined;
  if (typeof className === 'string') return className;
  if (className && typeof className === 'object' && 'baseVal' in className) {
    return className.baseVal ?? null;
  }
  return node.getAttribute('class');
};

const getElementDatasetForDiagnostics = (node: Element | null) => {
  if (!node) return null;
  if (node instanceof HTMLElement || node instanceof SVGElement) {
    return { ...node.dataset };
  }
  return null;
};

const summarizeElementForDiagnostics = (node: Element | null) => {
  if (!node) return null;
  return {
    tagName: node.tagName,
    className: getElementClassNameForDiagnostics(node),
    dataset: getElementDatasetForDiagnostics(node),
    lineId: node.getAttribute('data-line-id'),
    lineRole: node.getAttribute('data-line-role'),
    lineRenderer: node.getAttribute('data-line-renderer'),
  };
};

const getElementsFromPointSummaryForDiagnostics = (clientX: number, clientY: number) => {
  if (typeof document === 'undefined' || typeof document.elementsFromPoint !== 'function') {
    return [];
  }

  return document
    .elementsFromPoint(clientX, clientY)
    .slice(0, 8)
    .map((node) => ({
      tagName: node.tagName,
      className: getElementClassNameForDiagnostics(node),
      lineId: node.getAttribute('data-line-id'),
      lineRole: node.getAttribute('data-line-role'),
      lineRenderer: node.getAttribute('data-line-renderer'),
    }));
};

const toSceneCoords = (
  clientX: number,
  clientY: number,
  appState: any,
) => {
  const zoom = appState?.zoom?.value || 1;
  const offsetLeft = appState?.offsetLeft || 0;
  const offsetTop = appState?.offsetTop || 0;
  const scrollX = appState?.scrollX || 0;
  const scrollY = appState?.scrollY || 0;

  return {
    x: (clientX - offsetLeft) / zoom - scrollX,
    y: (clientY - offsetTop) / zoom - scrollY,
  };
};

/**
 * PATCH SECTION-H3C -- Section Heading's whole-body drag start.
 *
 * Same underlying mechanism as DrawingEmbeddableCard's drag-handle strip
 * below (mirror the scene element live via excAPI.updateScene, commit the
 * canonical position on release via onDragEnd), reimplemented rather than
 * shared because the two are driven by different event types: the strip
 * starts from a real `onPointerDown` (PointerEvent, so it can use
 * setPointerCapture), while Section Heading starts from SectionHeadingPost's
 * renderer-neutral `onMouseDownCapture` contract (a plain MouseEvent, shared
 * with Freeform) -- so this tracks the gesture via document mousemove/mouseup
 * instead of pointer capture.
 */
/**
 * PATCH SECTION-H3C: an external store for "which heading is selected",
 * subscribed to via useSyncExternalStore -- NOT plain React state relayed
 * through props or a reactive Context value.
 *
 * Excalidraw's `renderEmbeddable` output is portaled per-element through the
 * fork's `tunnel-rat` mechanism. Two things were empirically confirmed (via a
 * real browser, see the RETURN report) to cascade into an infinite React
 * update loop the moment a Section Heading became selected:
 *   1. giving `renderEmbeddable` a new identity on every selection change
 *      (i.e. passing isSelected/onSelect as plain closure props);
 *   2. a REACTIVE Context value (one whose reference changes when selection
 *      changes) -- confirmed even with the consuming component's OWN JSX
 *      output hardcoded to ignore the new value entirely; the mere act of
 *      that component re-rendering because its Context subscription fired
 *      was sufight to trigger the loop.
 * A stable-identity external store, subscribed to with useSyncExternalStore,
 * re-renders ONLY the specific subscribed component through React's normal
 * (non-Context) scheduling path, which does not exhibit this behavior.
 */
/**
 * PATCH SECTION-H3C: horizontal-only padding added around a Section Heading's
 * OWN embeddable scene frame -- Drawing-specific, not part of the shared
 * canonical geometry contract (padlet.position_x/width are never touched by
 * this; only the SCENE ELEMENT the embeddable bridge creates is widened).
 *
 * Empirically confirmed necessary: `excalidraw__embeddable-container__inner`
 * (part of the vendored fork, not modified) clips content to the frame's
 * exact width via `overflow: hidden`. SectionHeadingPost's own left/right
 * resize handles are a deliberate constant SCREEN-space grab target that
 * protrudes slightly past the heading surface's own edge (H2 Phase 36, "so
 * the handle stays comfortably clickable... instead of shrinking to a 1px
 * sliver") -- without this padding, that protrusion falls outside the
 * frame's clip box and the handles become unclickable (dead pixels; a real
 * click there hits the raw Excalidraw canvas underneath instead).
 *
 * Sized for the worst case in the patch's own tested zoom range (25%-200%):
 * the handle's hit-width is `SECTION_HEADING_HANDLE_HIT_PX / zoom` scene
 * units, i.e. up to 14/0.25 = 56 units wide (28 each side) at 25% zoom.
 */
const SECTION_HEADING_DRAWING_FRAME_PADDING_PX = 40;

class SectionHeadingSelectionStore {
  private selectedId: string | null = null;
  private listeners = new Set<() => void>();
  getSnapshot = () => this.selectedId;
  getServerSnapshot = () => null;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  setSelected = (id: string | null) => {
    if (this.selectedId === id) return;
    this.selectedId = id;
    this.listeners.forEach((listener) => listener());
  };
}

const SectionHeadingDrawingContext = React.createContext<{
  store: SectionHeadingSelectionStore;
  setSelectedId: (id: string | null) => void;
  registerElement: (padletId: string, el: HTMLElement | null) => void;
} | null>(null);

function startSectionHeadingBodyDrag(
  padletId: string,
  startEvent: { clientX: number; clientY: number },
  deps: {
    excalidrawAPIRef: React.RefObject<any>;
    appStateRef: React.RefObject<any>;
    onDragEnd?: (padletId: string, x: number, y: number) => void;
  },
) {
  const excAPI = deps.excalidrawAPIRef.current;
  if (!excAPI) return;
  const sceneEl = excAPI.getSceneElements().find(
    (el: any) => el.type === 'embeddable' && el.link === `padlet://${padletId}` && !el.isDeleted
  );
  if (!sceneEl) return;
  const initialAppState = deps.appStateRef.current;
  if (!initialAppState) return;
  const startPointerScene = toSceneCoords(startEvent.clientX, startEvent.clientY, initialAppState);
  const grabOffsetX = startPointerScene.x - sceneEl.x;
  const grabOffsetY = startPointerScene.y - sceneEl.y;

  const handleMove = (me: MouseEvent) => {
    const appState = deps.appStateRef.current;
    if (!appState) return;
    const pointerScene = toSceneCoords(me.clientX, me.clientY, appState);
    const newX = pointerScene.x - grabOffsetX;
    const newY = pointerScene.y - grabOffsetY;
    const liveSceneEl = excAPI.getSceneElements().find((el2: any) => el2.id === sceneEl.id) ?? sceneEl;
    const updatedSceneEl = {
      ...liveSceneEl,
      x: newX,
      y: newY,
      version: (liveSceneEl.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      updated: Date.now(),
    };
    excAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: excAPI.getSceneElements().map((el2: any) => (el2.id === sceneEl.id ? updatedSceneEl : el2)),
        commitToHistory: false,
      }),
    });
    if (typeof (excAPI as any).updateBoundElements === 'function') {
      (excAPI as any).updateBoundElements(updatedSceneEl);
    }
  };

  const handleUp = (ue: MouseEvent) => {
    document.removeEventListener('mousemove', handleMove);
    const appState = deps.appStateRef.current;
    if (!appState) return;
    const pointerScene = toSceneCoords(ue.clientX, ue.clientY, appState);
    const newX = pointerScene.x - grabOffsetX;
    const newY = pointerScene.y - grabOffsetY;
    const membership = resolveFrameMembership(
      { ...sceneEl, x: newX, y: newY, frameId: null },
      excAPI.getSceneElements().filter((el: any) => el.type === 'frame' && !el.isDeleted),
    );
    const liveSceneElFinal = excAPI.getSceneElements().find((el2: any) => el2.id === sceneEl.id) ?? sceneEl;
    const updatedSceneEl = {
      ...liveSceneElFinal,
      x: newX,
      y: newY,
      frameId: membership.frameId,
      version: (liveSceneElFinal.version ?? 1) + 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      updated: Date.now(),
    };
    excAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: excAPI.getSceneElements().map((el2: any) => (el2.id === sceneEl.id ? updatedSceneEl : el2)),
        commitToHistory: true,
      }),
    });
    if (typeof (excAPI as any).updateBoundElements === 'function') {
      (excAPI as any).updateBoundElements(updatedSceneEl);
    }
    deps.onDragEnd?.(padletId, newX, newY);
  };

  document.addEventListener('mousemove', handleMove);
  document.addEventListener('mouseup', handleUp, { once: true });
}

type DrawingSectionHeadingCardProps = {
  padlet: Padlet;
  readOnly: boolean;
  excalidrawAPIRef: React.RefObject<any>;
  appStateRef: React.RefObject<any>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onContextMenu: (e: React.MouseEvent, padlet: Padlet) => void;
  onDragEnd?: (padletId: string, x: number, y: number) => void;
};

/**
 * PATCH SECTION-H3C -- the Drawing host adapter for Section Heading.
 *
 * A "very small host adapter wrapper" (per the patch spec): it owns nothing
 * about Section Heading's presentation, geometry contract, selection ring,
 * inline editing or resize math -- all of that is the SAME SectionHeadingPost
 * used in Freeform. This component only translates between Drawing's own
 * primitives (Excalidraw scene coordinates, the embeddable body-drag
 * mechanism, Drawing's generic context-menu/canonical-update plumbing) and
 * SectionHeadingPost's renderer-neutral prop contract -- exactly the same
 * shape of adapter FreeformPadletCards already is, just for a different host.
 */
function DrawingSectionHeadingCard({
  padlet,
  readOnly,
  excalidrawAPIRef,
  appStateRef,
  onUpdatePadlet,
  onContextMenu,
  onDragEnd,
}: DrawingSectionHeadingCardProps) {
  // Context here is stable-identity (never changes) -- only used to hand
  // down the store/registerElement references. The actual selection VALUE is
  // read via useSyncExternalStore, which re-renders only this component
  // through React's normal scheduling, not Context propagation. See
  // SectionHeadingSelectionStore's own comment for why that distinction
  // matters here.
  const selection = useContext(SectionHeadingDrawingContext)!;
  const selectedId = useSyncExternalStore(
    selection.store.subscribe,
    selection.store.getSnapshot,
    selection.store.getServerSnapshot,
  );
  const isSelected = selectedId === padlet.id;
  const onSelect = selection.setSelectedId;
  const registerElement = selection.registerElement;
  const [resizePreview, setResizePreview] = useState<SectionHeadingRect | null>(null);
  // Local-only preview during a resize drag (no DB write per frame) -- the
  // SAME split Freeform's previewSectionHeadingRect/commitSectionHeadingRect
  // use, just held in this adapter's own state instead of the host's padlets
  // array, since Drawing does not expose a setPadlets-style setter here.
  const displayPadlet = resizePreview
    ? { ...padlet, position_x: resizePreview.x, width: resizePreview.width }
    : padlet;

  const clientToWorld = useCallback((clientX: number, clientY: number) => {
    return toSceneCoords(clientX, clientY, appStateRef.current);
  }, [appStateRef]);

  const handleMouseDownCapture = useCallback((event: React.MouseEvent, padletId: string) => {
    if (readOnly) return;
    onSelect(padletId);
    // Resize handles own their own gesture (SectionHeadingPost's internal
    // pointerdown handlers, unchanged) -- the body drag must not compete
    // with them for the same mousedown.
    const targetEl = event.target as HTMLElement;
    if (targetEl.closest?.('[data-section-heading-handle]')) return;
    startSectionHeadingBodyDrag(
      padletId,
      { clientX: event.clientX, clientY: event.clientY },
      { excalidrawAPIRef, appStateRef, onDragEnd },
    );
  }, [readOnly, onSelect, excalidrawAPIRef, appStateRef, onDragEnd]);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    registerElement(padlet.id, el);
  }, [registerElement, padlet.id]);

  return (
    <div
      ref={setRef}
      data-padlet-id={padlet.id}
      className="w-full h-full relative"
      onMouseDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
    >
      {/*
        PATCH SECTION-H3C: the Excalidraw embeddable container already
        positions this whole card at (padlet.position_x - PADDING,
        padlet.position_y) in scene space via its OWN CSS transform (the
        frame is widened by SECTION_HEADING_DRAWING_FRAME_PADDING_PX so the
        resize handles are not overflow-clipped -- see that constant's own
        comment). SectionHeadingPost's root, built for Freeform's single
        absolute world layer, ALSO applies `left: position_x; top:
        position_y` as its own inline style -- left uncancelled, the two
        positioning systems compound, rendering the heading far outside its
        own embeddable frame (empirically confirmed: it renders, fully
        interactive, just invisible off to the side).
        This wrapper cancels using the STABLE (last-committed) position, not
        the live resize-preview one, which is what keeps a live left-edge
        resize visually anchoring the RIGHT edge exactly like Freeform: the
        wrapper's offset stays fixed at PADDING-padlet.position_x while
        SectionHeadingPost's own left grows to displayPadlet.position_x, so
        their sum is PADDING plus the live delta -- not PADDING alone, not
        the full position.
      */}
      <div
        className="absolute"
        style={{
          left: SECTION_HEADING_DRAWING_FRAME_PADDING_PX - (padlet.position_x || 0),
          top: -(padlet.position_y || 0),
        }}
      >
        <SectionHeadingPost
          padlet={displayPadlet}
          isSelected={isSelected}
          canEdit={!readOnly}
          isDraggingThis={false}
          onMouseDownCapture={handleMouseDownCapture}
          onCommitText={(padletId, text) => { void onUpdatePadlet(padletId, { title: text }); }}
          onContextMenu={(event) => onContextMenu(event, padlet)}
          clientToWorld={clientToWorld}
          worldBounds={SECTION_HEADING_UNBOUNDED_WORLD}
          canResize
          onResizePreview={(_padletId, rect) => setResizePreview(rect)}
          onResizeCommit={(padletId, rect) => {
            setResizePreview(null);
            // Push the scene element's OWN x/width immediately, the same way
            // startSectionHeadingBodyDrag's handleUp does for body moves --
            // relying solely on the passive reconciliation effect to pick up
            // the canonical write was empirically confirmed to race: its own
            // "did position change" staleness tracking (previousSceneSync,
            // shared by every padlet type) can settle to the NEW value
            // before the scene element itself was ever actually updated,
            // permanently leaving el.x stale (width -- a separate,
            // unconditional check -- updates fine either way, which is what
            // made this a position-only bug).
            const excAPI = excalidrawAPIRef.current;
            if (excAPI) {
              const link = `padlet://${padletId}`;
              const sceneEl = excAPI.getSceneElements().find(
                (el: any) => el.type === 'embeddable' && el.link === link && !el.isDeleted
              );
              if (sceneEl) {
                const updatedSceneEl = {
                  ...sceneEl,
                  x: rect.x - SECTION_HEADING_DRAWING_FRAME_PADDING_PX,
                  width: rect.width + SECTION_HEADING_DRAWING_FRAME_PADDING_PX * 2,
                  version: (sceneEl.version ?? 1) + 1,
                  versionNonce: Math.floor(Math.random() * 1e9),
                  updated: Date.now(),
                };
                excAPI.updateScene({
                  ...buildDrawingSceneUpdate({
                    elements: excAPI.getSceneElements().map((el2: any) => (el2.id === sceneEl.id ? updatedSceneEl : el2)),
                    commitToHistory: true,
                  }),
                });
              }
            }
            void onUpdatePadlet(padletId, { position_x: rect.x, width: rect.width });
          }}
        />
      </div>
    </div>
  );
}

type DrawingEmbeddableCardProps = {
  padlet: Padlet;
  allPadlets: Padlet[];
  readOnly: boolean;
  excalidrawAPIRef: React.RefObject<any>;
  appStateRef: React.RefObject<any>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onUpdatePadletStrict: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onAddPadlet: (postData: Partial<Padlet>) => Promise<Padlet | null>;
  onDeletePadlet?: (id: string) => Promise<void>;
  canvasId: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
  commentAccessMode?: CommentAccessMode;
  fetchData?: () => void;
  onContextMenu: (e: React.MouseEvent, padlet: Padlet) => void;
  onPadletEditRef: React.RefObject<((padlet: Padlet) => void) | undefined>;
  onBeforePadletEdit?: () => void;
  onDragEnd?: (padletId: string, x: number, y: number) => void;
  onNaturalResize?: (padletId: string, size: { width?: number; height?: number }) => void;
  onOpenDocument?: (padlet: Padlet) => void; // PATCH-149B1b-iii §27.4
};

function DrawingEmbeddableCard({
  padlet,
  allPadlets,
  readOnly,
  excalidrawAPIRef,
  appStateRef,
  onUpdatePadlet,
  onUpdatePadletStrict,
  onAddPadlet,
  onDeletePadlet,
  canvasId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
  commentAccessMode,
  fetchData,
  onContextMenu,
  onPadletEditRef,
  onBeforePadletEdit,
  onDragEnd,
  onNaturalResize,
  onOpenDocument,
}: DrawingEmbeddableCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);

  const md = padlet.metadata as any;
  const isContainer = md?.isContainer === true || (md?.childPadletIds && md.childPadletIds.length > 0) || padlet.type === "container";

  const stripColor = padlet.metadata?.topStrip && padlet.metadata.topStrip !== 'transparent'
    ? padlet.metadata.topStrip
    : null;

  const stripBg = stripColor ?? 'rgba(0,0,0,0.04)';
  const stripMinHeight = isContainer ? '28px' : '22px';
  const iconColor = stripColor ? contrastIconColor(stripColor) : '#9ca3af';
  const titleColor = stripColor ? contrastIconColor(stripColor) : '#374151';

  const showExpandToggle = isContainer && canExpand;

  const updateHorizontalSceneWidth = (requiredWidth: number) => {
    if (resolveContainerOrientation(padlet.metadata) !== 'horizontal') return;
    const excAPI = excalidrawAPIRef.current;
    if (!excAPI || !Number.isFinite(requiredWidth)) return;
    const existing = excAPI.getSceneElements().find(
      (el: any) => el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
    );
    if (!existing) return;
    const nextWidth = Math.max(existing.width ?? 0, Math.ceil(requiredWidth + 16));
    if (nextWidth <= (existing.width ?? 0) + 1) return;
    excAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: excAPI.getSceneElements().map((el: any) => el.id === existing.id
          ? { ...el, width: nextWidth, version: (el.version ?? 1) + 1, versionNonce: Math.floor(Math.random() * 1e9), updated: Date.now() }
          : el),
        commitToHistory: false,
      }),
    });
    onNaturalResize?.(padlet.id, { width: nextWidth });
  };

  const createAndLinkChildToContainer = async (
    containerId: string,
    postData: Partial<Padlet>,
  ): Promise<Padlet | null> => {
    const created = await onAddPadlet(postData);
    if (!created) return null;

    try {
      const container = allPadlets.find(p => p.id === containerId);
      if (!container) throw new Error(`Container ${containerId} not found`);
      const currentChildren = Array.isArray(container.metadata?.childPadletIds)
        ? container.metadata.childPadletIds.map((childId) => String(childId))
        : [];
      const nextChildren = currentChildren.includes(created.id)
        ? currentChildren
        : [...currentChildren, created.id];

      await onUpdatePadletStrict(containerId, {
        metadata: {
          ...container.metadata,
          childPadletIds: nextChildren,
        },
      });

      return created;
    } catch (error) {
      if (onDeletePadlet) {
        await Promise.allSettled([onDeletePadlet(created.id)]);
      }
      console.error('Failed to link child to container', error);
      return null;
    }
  };

  return (
    <div
      data-padlet-id={padlet.id}
      className={`w-full overflow-hidden rounded-xl bg-white flex flex-col border border-gray-200 ${isContainer ? '' : 'h-full'}`}
      onMouseDown={(e) => { if (e.button === 2) e.stopPropagation(); }}
      onContextMenu={(e) => {
        const target = e.target as HTMLElement | null;
        if (!target?.closest?.('[data-post-menu-trigger="true"]')) {
          return;
        }
        onContextMenu(e, padlet);
      }}
      onDragOver={isContainer ? (e) => {
        if (e.dataTransfer.types.includes('application/collabboard-library')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      } : undefined}
      onDrop={isContainer ? async (e) => {
        // Fires only when the inner RowColumnContainerCard drop zone did NOT handle it
        // (e.g. cursor on header strip). Inner onDrop calls stopPropagation so it won't bubble here.
        const libPayload = e.dataTransfer.getData('application/collabboard-library');
        if (!libPayload) return;
        e.preventDefault();
        e.stopPropagation();
        let libData: any;
        try {
          libData = JSON.parse(libPayload);
        } catch (error) {
          console.error('Failed to parse drawing library drop payload', error);
          return;
        }
        const _as = appStateRef.current;
        const _zoom = _as?.zoom?.value || 1;
        const _centerX = (window.innerWidth / 2 / _zoom) - (_as?.scrollX || 0);
        const _centerY = (window.innerHeight / 2 / _zoom) - (_as?.scrollY || 0);
        await createAndLinkChildToContainer(padlet.id, {
          board_id: canvasId,
          type: (libData.type || libData.kind || 'text') as Padlet['type'],
          title: libData.title || 'New Post',
          content: typeof libData.content === 'string' ? libData.content : JSON.stringify(libData.content ?? ''),
          file_url: libData.file_url || undefined,
          position_x: _centerX,
          position_y: _centerY,
          metadata: { parentId: padlet.id } as any,
          width: libData.width || 300,
          height: libData.height || 200,
        });
      } : undefined}
    >
      {/* Drag handle -- 3-column grid: [expand | title | pencil] */}
      <div
        className="w-full flex-shrink-0 cursor-grab active:cursor-grabbing grid group/strip"
        style={{
          gridTemplateColumns: 'auto 1fr auto',
          minHeight: stripMinHeight,
          backgroundColor: stripBg,
          userSelect: 'none',
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return; // left-click only -- ignore right-click so it doesn't set pointer capture
          e.stopPropagation();
          const excAPI = excalidrawAPIRef.current;
          if (!excAPI) return;
          const sceneEl = excAPI.getSceneElements().find(
            (el: any) => el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
          );
          if (!sceneEl) return;
          const initialAppState = appStateRef.current;
          if (!initialAppState) return;
          const startPointerScene = toSceneCoords(e.clientX, e.clientY, initialAppState);
          const grabOffsetX = startPointerScene.x - sceneEl.x;
          const grabOffsetY = startPointerScene.y - sceneEl.y;
          const target = e.currentTarget as HTMLElement;
          target.setPointerCapture(e.pointerId);

          const handleMove = (me: PointerEvent) => {
            const appState = appStateRef.current;
            if (!appState) return;
            const pointerScene = toSceneCoords(me.clientX, me.clientY, appState);
            const newX = pointerScene.x - grabOffsetX;
            const newY = pointerScene.y - grabOffsetY;

            // Bump the standard Excalidraw revision fields off the live element (not
            // the pointerdown-time snapshot) so version strictly increases per frame,
            // matching the convention used elsewhere in this file. Without this,
            // getSceneVersion never reflects this app-owned move.
            const liveSceneEl = excAPI.getSceneElements().find((el2: any) => el2.id === sceneEl.id) ?? sceneEl;
            const updatedSceneEl = {
              ...liveSceneEl,
              x: newX,
              y: newY,
              version: (liveSceneEl.version ?? 1) + 1,
              versionNonce: Math.floor(Math.random() * 1e9),
              updated: Date.now(),
            };

            excAPI.updateScene({
              ...buildDrawingSceneUpdate({
                elements: excAPI.getSceneElements().map((el2: any) =>
                  el2.id === sceneEl.id ? updatedSceneEl : el2
                ),
                commitToHistory: false,
              }),
            });

            // Force update bindings for arrows connected to this container
            if (typeof (excAPI as any).updateBoundElements === 'function') {
              (excAPI as any).updateBoundElements(updatedSceneEl);
            }
          };

          const handleUp = (ue: PointerEvent) => {
            target.removeEventListener('pointermove', handleMove);
            target.releasePointerCapture(ue.pointerId);
            const appState = appStateRef.current;
            if (!appState) return;
            const pointerScene = toSceneCoords(ue.clientX, ue.clientY, appState);
            const newX = pointerScene.x - grabOffsetX;
            const newY = pointerScene.y - grabOffsetY;
            const membership = resolveFrameMembership(
              { ...sceneEl, x: newX, y: newY, frameId: null },
              excAPI.getSceneElements().filter((el: any) => el.type === 'frame' && !el.isDeleted),
            );
            // Same live-element revision bump as handleMove, applied to the final
            // history commit.
            const liveSceneElFinal = excAPI.getSceneElements().find((el2: any) => el2.id === sceneEl.id) ?? sceneEl;
            const updatedSceneEl = {
              ...liveSceneElFinal,
              x: newX,
              y: newY,
              frameId: membership.frameId,
              version: (liveSceneElFinal.version ?? 1) + 1,
              versionNonce: Math.floor(Math.random() * 1e9),
              updated: Date.now(),
            };

            excAPI.updateScene({
              ...buildDrawingSceneUpdate({
                elements: excAPI.getSceneElements().map((el2: any) =>
                  el2.id === sceneEl.id ? updatedSceneEl : el2
                ),
                commitToHistory: true,
              }),
            });

            if (typeof (excAPI as any).updateBoundElements === 'function') {
              (excAPI as any).updateBoundElements(updatedSceneEl);
            }

            onDragEnd?.(padlet.id, newX, newY);
          };

          target.addEventListener('pointermove', handleMove);
          target.addEventListener('pointerup', handleUp, { once: true });
          target.addEventListener('pointercancel', handleUp, { once: true });
        }}
      >
        {/* Left: expand button for containers, placeholder if pencil present */}
        <div className="flex items-center pl-1.5">
          {showExpandToggle ? (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setIsExpanded(prev => !prev); }}
              className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-colors"
              style={{ color: iconColor }}
              title={isExpanded ? 'Collapse' : 'Expand'}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          ) : !readOnly ? (
            <div className="w-5 h-5 shrink-0" aria-hidden="true" />
          ) : null}
        </div>
        {/* Center: title */}
        <div className="flex items-center justify-center px-1 min-w-0">
          {isContainer && padlet.title && (
            <span
              className="text-xs font-semibold text-center break-words leading-snug py-1"
              style={{ color: titleColor }}
            >
              {padlet.title}
            </span>
          )}
        </div>
        {/* Right: pencil hover-only */}
        <div className="flex items-center pr-1.5">
          {!readOnly && (
            <button
              type="button"
              data-post-menu-trigger="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onBeforePadletEdit?.();
                onPadletEditRef.current?.(padlet);
              }}
              className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 opacity-0 group-hover/strip:opacity-100 transition-opacity"
              style={{ color: iconColor }}
              title="Edit"
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
      {/* Content area -- stop propagation so clicks/inputs don't trigger Excalidraw drag */}
      <div
        className={isContainer ? 'overflow-hidden p-2' : 'flex-1 overflow-hidden p-3'}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {isContainer ? (
          <AutoHeightContainer
            padlet={padlet}
            allPadlets={allPadlets}
            isExpanded={isExpanded}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            currentUserAvatar={currentUserAvatar}
            onUpdateChildComments={onUpdateChildComments}
            commentAccessMode={commentAccessMode}
            onScanChild={fetchData}
            onExpandAvailabilityChange={setCanExpand}
            onOpenDocument={onOpenDocument}
            onNaturalHeight={(h) => {
              const stripH = 28;
              const newHeight = Math.max(stripH + 22 + h, 80); // p-2 (16px) + 2px border + 4px buffer
              const excAPI = excalidrawAPIRef.current;
              if (!excAPI) return;
              const existing = excAPI.getSceneElements().find(
                (el: any) => el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
              );
              if (!existing || Math.abs(existing.height - newHeight) < 1) return;
              excAPI.updateScene({
                ...buildDrawingSceneUpdate({
                  elements: excAPI.getSceneElements().map((el: any) =>
                    el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
                      ? {
                          ...el,
                          height: newHeight,
                          version: (el.version ?? 1) + 1,
                          versionNonce: Math.floor(Math.random() * 1e9),
                          updated: Date.now(),
                        }
                      : el
                  ),
                  commitToHistory: false,
                }),
              });
              onNaturalResize?.(padlet.id, { height: newHeight });
            }}
            onRequiredWidthChange={updateHorizontalSceneWidth}
            onDropExistingPadlet={async (containerId, droppedId) => {
              const container = allPadlets.find(p => p.id === containerId);
              if (!container) return;
              const currentChildren = container.metadata?.childPadletIds || [];
              if (!currentChildren.includes(droppedId)) {
                await onUpdatePadlet(containerId, {
                  metadata: {
                    ...container.metadata,
                    childPadletIds: [...currentChildren, droppedId]
                  }
                });
              }
              const droppedPadding = allPadlets.find(p => p.id === droppedId);
              if (droppedPadding) {
                await onUpdatePadlet(droppedId, {
                  metadata: { ...droppedPadding.metadata, parentId: containerId }
                });
              }
            }}
            onDropDraftIntoContainer={async (containerId, draftPayload) => {
              const _as2 = appStateRef.current;
              const _zoom2 = _as2?.zoom?.value || 1;
              const _centerX2 = (window.innerWidth / 2 / _zoom2) - (_as2?.scrollX || 0);
              const _centerY2 = (window.innerHeight / 2 / _zoom2) - (_as2?.scrollY || 0);
              await createAndLinkChildToContainer(containerId, {
                ...draftPayload,
                board_id: canvasId,
                position_x: draftPayload.position_x ?? _centerX2,
                position_y: draftPayload.position_y ?? _centerY2,
                metadata: {
                  ...draftPayload.metadata,
                  parentId: containerId
                }
              });
            }}
          />
        ) : (() => {
          const isCommentPost =
            String(padlet.type ?? '').trim().toLowerCase() === 'comment' ||
            (!padlet.type && Array.isArray((padlet.metadata as any)?.comments));
          if (isCommentPost) {
            return (
              <EmbeddedCommentList
                comments={(padlet.metadata as any)?.comments || []}
                badgeColor={(padlet.metadata as any)?.badgeColor}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                currentUserAvatar={currentUserAvatar}
                onSubmit={guardCommentMutation(commentAccessMode ?? 'manage', (text) => {
                  const newComment = {
                    id: `comment-${Date.now()}`,
                    text,
                    userId: currentUserId || 'anonymous',
                    userName: currentUserName || 'Anonymous',
                    userAvatar: currentUserAvatar,
                    timestamp: Date.now(),
                  };
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, [...existing, newComment], { field: 'comments' });
                })}
                onEditComment={guardCommentMutation(commentAccessMode ?? 'manage', (commentId, newText) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.map((c: any) =>
                    c.id === commentId ? { ...c, text: newText } : c
                  ), { field: 'comments' });
                })}
                onRemoveComment={guardCommentMutation(commentAccessMode ?? 'manage', (commentId) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.filter((c: any) => c.id !== commentId), { field: 'comments' });
                })}
                onToggleStrikethrough={guardCommentMutation(commentAccessMode ?? 'manage', (commentId) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.map((c: any) =>
                    c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                  ), { field: 'comments' });
                })}
                onColorChange={guardCommentMutation(commentAccessMode ?? 'manage', (commentId, textColor, backgroundColor) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.map((c: any) =>
                    c.id === commentId ? { ...c, textColor, backgroundColor } : c
                  ), { field: 'comments' });
                })}
                accessMode={commentAccessMode}
              />
            );
          }
          return <PostCardContent padlet={padlet} onScan={fetchData} canvasContext="drawing" onOpenDocument={onOpenDocument ? () => onOpenDocument(padlet) : undefined} accessMode={commentAccessMode} />;
        })()}
      </div>
    </div>
  );
}

interface DrawingLayoutProps {
  canvasId: string;
  padlets: Padlet[];
  canvasLines: CanvasLine[];
  padletsLoaded?: boolean;
  onAddPadlet: (postData: Partial<Padlet>) => Promise<Padlet | null>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onUpdatePadletStrict: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onDeletePadlet?: (id: string) => Promise<void>;
  onDeleteOverlayPadlets?: (rootIds: string[]) => Promise<void>;
  onPadletEdit?: (padlet: Padlet) => void;
  onEditPadletAsPost?: (padlet: Padlet) => void;
  onOpenDocument?: (padlet: Padlet) => void; // PATCH-149B1b-iii §27.4
  readOnly?: boolean;
  fetchData?: () => void;
  ghostDraft?: Partial<Padlet> | null;
  onGhostDraftDropped?: () => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  // PATCH 8AD: gates every EmbeddedCommentList mutation reachable from this
  // layout (standalone Drawing-canvas comment posts, and container children
  // via AutoHeightContainer -> RowColumnContainerCard). Defaults to 'manage'
  // so every pre-existing caller keeps today's behavior unchanged.
  commentAccessMode?: CommentAccessMode;
  viewportContainerRef?: React.RefObject<HTMLDivElement | null>;
  drawingAppStateRef?: React.RefObject<any>;
  drawingExcalidrawAPIRef?: React.RefObject<any>;
  onDrawingViewportChange?: (viewport: DrawingViewport) => void;
}

export default function DrawingLayout({
  canvasId,
  padlets,
  canvasLines,
  padletsLoaded = false,
  onAddPadlet,
  onUpdatePadlet,
  onUpdatePadletStrict,
  onDeletePadlet,
  onDeleteOverlayPadlets,
  onPadletEdit,
  onEditPadletAsPost,
  onOpenDocument,
  readOnly = false,
  fetchData,
  ghostDraft,
  onGhostDraftDropped,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  commentAccessMode,
  viewportContainerRef,
  drawingAppStateRef,
  drawingExcalidrawAPIRef,
  onDrawingViewportChange,
}: DrawingLayoutProps) {
  const [masterPadlet, setMasterPadlet] = useState<Padlet | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [key, setKey] = useState(0);
  const [rightClusterAnchorEl, setRightClusterAnchorEl] = useState<HTMLElement | null>(null);
  const [rightClusterLeftPx, setRightClusterLeftPx] = useState<number | null>(null);

  const [initialElements, setInitialElements] = useState<any[]>([]);
  const [initialAppState, setInitialAppState] = useState<any>(null);
  const [initialFiles, setInitialFiles] = useState<any>(null);
  const [libraryItems, setLibraryItems] = useState<any[]>([]);
  const [pendingImportedScene, setPendingImportedScene] = useState<ImportedDrawingScene | null>(null);
  const [isImportingScene, setIsImportingScene] = useState(false);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dirtyDataRef = useRef<DrawingSceneSnapshot | null>(null);
  const saveGenerationRef = useRef(0);
  const saveInFlightRef = useRef<Promise<void> | null>(null);
  // Per-frame content version tracking: increments when elements inside a frame change
  const frameVersionsRef = useRef<Record<string, number>>({});
  const frameSigsRef = useRef<Record<string, string>>({});
  const framesArrayRef = useRef<FrameSlide[]>([]);
  const framesObjectsRef = useRef<Record<string, FrameSlide>>({});
  const initializedRef = useRef(false);
  const drawingRootRef = useRef<HTMLDivElement | null>(null);
  const drawingViewportRafRef = useRef<number | null>(null);
  const topFloatingToolbarRef = useRef<HTMLDivElement | null>(null);
  const presentationSidebarRef = useRef<HTMLDivElement | null>(null);
  const paddletsRef = useRef<Padlet[]>(padlets);
  // Track active element count to avoid O(N) reduce on every Excalidraw onChange (60fps during drag)
  const activeElementCountRef = useRef(0);
  const frameNameSigRef = useRef('');
  // Set to true once we've received at least one onChange with non-empty elements after load
  const hasSeenElementsRef = useRef(false);
  // Run one post-load embeddable refresh so bound arrows/media settle after the
  // stored Excalidraw scene and live padlet data have both mounted.
  const hasPerformedInitialEmbeddableRefreshRef = useRef(false);
  // Set to true while the embeddable-sync useEffect is calling updateScene, so handleChange
  // skips the auto-save timer (preventing a cascade: sync -> save -> fetchData -> editor reset)
  const isSyncingEmbeddablesRef = useRef(false);
  // Tracks locally-set positions: id -> {x,y} we dragged to. Sync effect skips x/y overwrite
  // while scene position matches our dragged-to value; clears when DB catches up.
  // id -> { x, y, expiresAt }. Time-based expiry (5s) prevents stale padlets data from
  // overwriting a dragged container when another container's save triggers a full padlets
  // re-fetch that returns old DB data for unrelated containers.
  const recentlyDraggedRef = useRef<Map<string, { x: number; y: number; expiresAt: number }>>(new Map());
  // Tracks height set by onNaturalHeight: id -> scene height we set. Sync effect skips height
  // overwrite while scene height matches our natural value; clears when DB catches up.
  const recentlyNaturalResizedRef = useRef<Map<string, { width?: number; height?: number }>>(new Map());
  // Tracks last known scene positions so handleChange can detect Excalidraw-native moves
  // (select tool drags that bypass our custom drag handle).
  const lastEmbeddablePosRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  const lastPadletSceneSyncRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  // Debounce timers for Excalidraw-native moves -> DB save
  const pendingPosTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Keep paddletsRef current so onChange can read latest padlets without being a dep
  paddletsRef.current = padlets;

  // Excalidraw view state stored in a ref to avoid 60fps React re-renders during pan/zoom.
  // Only zoomPercent drives a render (zoom display in toolbar).
  const localAppStateRef = useRef<any>(null);
  const appStateRef = drawingAppStateRef ?? localAppStateRef;
  const prevZoomPctRef = useRef(100);
  const prevZoomValueRef = useRef(1);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [elements, setElements] = useState<readonly any[]>([]);
  // PATCH-128: debounces geometry-affecting onChange traffic (app-owned and native)
  // into one settled setElements call per real scene-revision change, beside the
  // existing immediate active-count/frame-name gate below. See settledScenePropagation.ts.
  const settledScenePropagationRef = useRef<ReturnType<typeof createSettledScenePropagation> | null>(null);
  if (settledScenePropagationRef.current === null) {
    settledScenePropagationRef.current = createSettledScenePropagation({
      getSceneVersion: (els) => getSceneVersion(els as any),
      onSettle: (snapshot) => setElements(snapshot),
    });
  }
  useEffect(() => {
    return () => settledScenePropagationRef.current?.cleanup();
  }, []);
  const [activeTool, setActiveTool] = useState<'select' | 'comment' | 'library' | 'present' | 'group'>('select');
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [isInitialViewportSettled, setIsInitialViewportSettled] = useState(true);
  // Ref so renderEmbeddable can read the API without recreating on every API change
  const excalidrawAPIRef = useRef<any>(null);
  useEffect(() => {
    if (!excalidrawAPI) return;
    return registerE2EBridge(excalidrawAPI);
  }, [excalidrawAPI]);
  // Ref so renderEmbeddable can call onPadletEdit without adding it to deps
  const onPadletEditRef = useRef(onPadletEdit);
  useEffect(() => { onPadletEditRef.current = onPadletEdit; }, [onPadletEdit]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [presentationActive, setPresentationActive] = useState(false);
  const [presentationStartId, setPresentationStartId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; padlet: Padlet } | null>(null);
  // PATCH SECTION-H3C: Section Heading selection.
  //
  // Two representations of the SAME fact, deliberately kept separate:
  //   - `sectionHeadingSelectionStoreRef` (a SectionHeadingSelectionStore,
  //     see its own comment) is what the tunneled per-heading card content
  //     subscribes to via useSyncExternalStore. Required to avoid the
  //     infinite-loop failure mode confirmed via real-browser testing.
  //   - `selectedSectionHeadingId` (plain React state) is what THIS
  //     component's own JSX reads to conditionally render the toolbar --
  //     that JSX is NOT inside tunnel-rat's portaled content, so plain state
  //     is safe there (confirmed: unrelated DrawingLayout state changes with
  //     full descendant re-render do not reproduce the loop).
  // setSelectedSectionHeadingId (below) updates BOTH in one call.
  const sectionHeadingSelectionStoreRef = useRef<SectionHeadingSelectionStore | null>(null);
  if (sectionHeadingSelectionStoreRef.current === null) {
    sectionHeadingSelectionStoreRef.current = new SectionHeadingSelectionStore();
  }
  const [selectedSectionHeadingId, setSelectedSectionHeadingIdState] = useState<string | null>(null);
  const setSelectedSectionHeadingId = useCallback((id: string | null) => {
    sectionHeadingSelectionStoreRef.current!.setSelected(id);
    setSelectedSectionHeadingIdState(id);
  }, []);
  // Mirrors selectedSectionHeadingId for handleChange to read WITHOUT being a
  // dependency -- handleChange is passed as ExcalidrawWrapper's `onChange`
  // prop, and giving it a new identity on every selection change was
  // empirically confirmed (alongside the same issue in renderEmbeddable) to
  // cascade into an infinite update loop through the fork's tunnel-rat
  // portal machinery.
  const selectedSectionHeadingIdRef = useRef<string | null>(null);
  selectedSectionHeadingIdRef.current = selectedSectionHeadingId;
  const lastSectionHeadingViewportRef = useRef<{ zoom: number; scrollX: number; scrollY: number }>({ zoom: 1, scrollX: 0, scrollY: 0 });
  const sectionHeadingElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const registerSectionHeadingElement = useCallback((padletId: string, el: HTMLElement | null) => {
    if (el) sectionHeadingElsRef.current.set(padletId, el);
    else sectionHeadingElsRef.current.delete(padletId);
  }, []);
  // Re-measure trigger for SectionHeadingToolbar's fixed-position anchor.
  // Bumped from handleChange (pan/zoom/scroll), but ONLY while a heading is
  // actually selected, so this never adds render cost to the common case.
  const [sectionHeadingViewportRevision, setSectionHeadingViewportRevision] = useState(0);
  // Stable-identity context value (deps never change across this
  // component's lifetime) -- see SectionHeadingSelectionStore's comment for
  // why this must NEVER change reference because of selection.
  const sectionHeadingContextValue = useMemo(() => ({
    store: sectionHeadingSelectionStoreRef.current!,
    setSelectedId: setSelectedSectionHeadingId,
    registerElement: registerSectionHeadingElement,
  }), [setSelectedSectionHeadingId, registerSectionHeadingElement]);
  // Track current binary files (images embedded in drawing) for export
  const currentFilesRef = useRef<any>(null);
  const runtimeSceneElementsRef = useRef<readonly any[]>([]);
  const runtimePadletsRef = useRef<Padlet[]>(padlets);
  const runtimeCanvasLinesRef = useRef<CanvasLine[]>(canvasLines);
  const runtimeInitialFilesRef = useRef<any>(null);
  const isApplyingImportedSceneRef = useRef(false);
  const importPlacementCountRef = useRef(0);

  // Lasso and selection state
  const [mermaidModalOpen, setMermaidModalOpen] = useState(false);

  runtimeSceneElementsRef.current = elements;
  runtimePadletsRef.current = padlets;
  runtimeCanvasLinesRef.current = canvasLines;
  runtimeInitialFilesRef.current = initialFiles;

  useEffect(() => {
    const handleMermaidOpen = () => {
      setMermaidModalOpen(true);
    };
    window.addEventListener('open-custom-mermaid', handleMermaidOpen);
    return () => window.removeEventListener('open-custom-mermaid', handleMermaidOpen);
  }, []);

  useEffect(() => {
    if (isInitializing) {
      setRightClusterAnchorEl(null);
      return;
    }

    let cancelled = false;
    let frameId = 0;
    let attempts = 0;

    const resolveAnchor = () => {
      if (cancelled) return;

      const root = drawingRootRef.current;
      // Keep this fallback order as-tested: app-shell and CanvasViewport anchors
      // shrank with browser width in runtime measurement, while this Excalidraw
      // UI layer stayed stable and prevents the custom cluster from drifting.
      const nextAnchor = root?.querySelector<HTMLElement>('.layer-ui__wrapper')
        ?? root?.querySelector<HTMLElement>('.App-menu_top')
        ?? root?.querySelector<HTMLElement>('.excalidraw')
        ?? null;

      if (nextAnchor || attempts >= 120) {
        setRightClusterAnchorEl(nextAnchor);
        return;
      }

      attempts += 1;
      frameId = window.requestAnimationFrame(resolveAnchor);
    };

    resolveAnchor();

    return () => {
      cancelled = true;
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [isInitializing, key]);

  useLayoutEffect(() => {
    const anchorEl = rightClusterAnchorEl ?? drawingRootRef.current;
    if (!anchorEl) {
      setRightClusterLeftPx(null);
      return;
    }

    let frameId = 0;
    let timeoutId: number | null = null;
    let observer: MutationObserver | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let lastResolvedLeftPx: number | null = null;
    const cleanupViewportEl = viewportContainerRef?.current ?? null;

    const scheduleRetry = (delayMs = 0) => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      if (delayMs > 0) {
        timeoutId = window.setTimeout(() => {
          timeoutId = null;
          frameId = window.requestAnimationFrame(updatePosition);
        }, delayMs);
        return;
      }
      frameId = window.requestAnimationFrame(updatePosition);
    };

    const updatePosition = () => {
      const drawingRoot = drawingRootRef.current;
      const stockToolbarEl = drawingRoot?.querySelector<HTMLElement>('.Island.App-toolbar');
      const clusterEl = topFloatingToolbarRef.current;
      if (!stockToolbarEl || !clusterEl) {
        scheduleRetry(120);
        return;
      }

      const anchorRect = anchorEl.getBoundingClientRect();
      const stockToolbarRect = stockToolbarEl.getBoundingClientRect();
      const clusterRect = clusterEl.getBoundingClientRect();
      if (stockToolbarRect.width === 0 || clusterRect.width === 0) {
        scheduleRetry(120);
        return;
      }
      const viewportEl = viewportContainerRef?.current;
      const viewportRect = viewportEl?.getBoundingClientRect();
      const viewportRight = viewportRect?.right ?? window.innerWidth;
      const sidebarRect = presentationSidebarRef.current?.getBoundingClientRect() ?? null;
      const visibleCanvasRight = sidebarRect ? Math.min(Math.max(sidebarRect.left, viewportRect?.left ?? 0), viewportRight) : null;
      const nextVisibleCanvasRightInsetPx = visibleCanvasRight === null ? null : Math.max(0, viewportRight - visibleCanvasRight);
      if (viewportEl) {
        if (nextVisibleCanvasRightInsetPx === null) {
          viewportEl.style.removeProperty('--drawing-visible-canvas-right-inset');
          viewportEl.style.removeProperty('--drawing-zoom-controls-right');
        } else {
          viewportEl.style.setProperty('--drawing-visible-canvas-right-inset', `${nextVisibleCanvasRightInsetPx}px`);
          viewportEl.style.setProperty('--drawing-zoom-controls-right', `${nextVisibleCanvasRightInsetPx + 24}px`);
        }
      }
      const reservedSidebarLeft = visibleCanvasRight ?? (viewportRight - 320);
      const equalGap = Math.max(16, (reservedSidebarLeft - stockToolbarRect.right - clusterRect.width) / 2);
      const nextLeftPx = stockToolbarRect.right + equalGap - anchorRect.left;

      lastResolvedLeftPx = nextLeftPx;
      setRightClusterLeftPx(nextLeftPx);
    };

    const requestUpdate = () => {
      scheduleRetry();
    };

    observer = new MutationObserver(() => {
      requestUpdate();
    });
    observer.observe(anchorEl, { childList: true, subtree: true, attributes: true });

    resizeObserver = new ResizeObserver(() => {
      requestUpdate();
    });
    resizeObserver.observe(anchorEl);
    if (viewportContainerRef?.current) {
      resizeObserver.observe(viewportContainerRef.current);
    }
    if (presentationSidebarRef.current) {
      resizeObserver.observe(presentationSidebarRef.current);
    }

    requestUpdate();
    window.addEventListener('resize', requestUpdate);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
      observer?.disconnect();
      resizeObserver?.disconnect();
      if (lastResolvedLeftPx === null) {
        setRightClusterLeftPx(null);
      }
      cleanupViewportEl?.style.removeProperty('--drawing-visible-canvas-right-inset');
      cleanupViewportEl?.style.removeProperty('--drawing-zoom-controls-right');
      window.removeEventListener('resize', requestUpdate);
    };
  }, [rightClusterAnchorEl, viewportContainerRef, activeTool, key]);

  // Excalidraw specific refs
  const deletedEmbeddablePadletIdsRef = useRef<Set<string>>(new Set());
  const createdContainerEmbeddableIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (initializedRef.current) return;

    const drawingPadlet = padlets.find(p => p.type === 'drawing');

    if (drawingPadlet) {
      initializedRef.current = true;
      setMasterPadlet(drawingPadlet);

      try {
        if (drawingPadlet.content) setInitialElements(JSON.parse(drawingPadlet.content));
        if (drawingPadlet.metadata?.drawingAppState) {
          const parsedAppState = JSON.parse(drawingPadlet.metadata.drawingAppState);
          setInitialAppState(parsedAppState);
        }
        if (drawingPadlet.metadata?.drawingFiles) setInitialFiles(JSON.parse(drawingPadlet.metadata.drawingFiles));
      } catch (e) {
        console.error("Failed to parse drawing data", e);
      }

      const communityItems = getExcalidrawLibrary();
      setLibraryItems(communityItems.flatMap(item =>
        item.elements.map(el => ({ ...el, metadata: { ...el.metadata, source: item.name } }))
      ));

      setKey(1);
      setIsInitializing(false);
    } else if (padlets.length > 0) {
      // Padlets loaded but no drawing padlet found â€” nothing to initialize
      initializedRef.current = true;
      setIsInitializing(false);
    } else if (!readOnly && padletsLoaded) {
      // Padlets fully loaded and no drawing padlet found — board is new, create master
      initializedRef.current = true;
      const initializeMasterPad = async () => {
        try {
          const newPadlet = await onAddPadlet({
            board_id: canvasId,
            type: 'drawing',
            title: 'Master Drawing',
            content: '[]',
            position_x: 0,
            position_y: 0,
            metadata: {
              drawingAppState: '{}',
              drawingFiles: '{}'
            }
          });
          if (newPadlet) setMasterPadlet(newPadlet);
        } catch (error) {
          console.error("Error creating master padlet:", error);
        } finally {
          setIsInitializing(false);
        }
      };
      initializeMasterPad();
    } else {
      setIsInitializing(false);
    }
  }, [padlets, padletsLoaded, canvasId, readOnly, onAddPadlet]);

  // Keep a ref so performSave always sees the latest masterPadlet without recreating on every
  // padlets state update (which would cascade and recreate handleChange at 60fps during drag).
  const masterPadletRef = useRef<typeof masterPadlet>(null);
  useEffect(() => { masterPadletRef.current = masterPadlet; }, [masterPadlet]);

  const schedulePadletPositionSave = useCallback((padletId: string, x: number, y: number, delayMs = 800) => {
    const prev = pendingPosTimersRef.current.get(padletId);
    if (prev) clearTimeout(prev);
    pendingPosTimersRef.current.set(padletId, setTimeout(() => {
      pendingPosTimersRef.current.delete(padletId);
      onUpdatePadlet(padletId, { position_x: x, position_y: y });
    }, delayMs));
  }, [onUpdatePadlet]);

  const savePadletPositionWithLock = useCallback((padletId: string, x: number, y: number, lockMs = 1500) => {
    const prev = pendingPosTimersRef.current.get(padletId);
    if (prev) clearTimeout(prev);
    pendingPosTimersRef.current.set(padletId, setTimeout(() => {
      pendingPosTimersRef.current.delete(padletId);
    }, lockMs));
    onUpdatePadlet(padletId, { position_x: x, position_y: y });
  }, [onUpdatePadlet]);

  const closeSelectedShapePanel = useCallback(() => {
    const api = excalidrawAPIRef.current ?? excalidrawAPI;
    if (!api) return;

    // Excalidraw v0.18 shows the "Selected Shape Actions" panel when EITHER:
    //   1. activeTool is a shape tool (rectangle, diamond, etc. — anything
    //      not selection/lasso/eraser/hand/laser/custom), OR
    //   2. there are selected elements (getSelectedElements().length > 0)
    //
    // To reliably hide the panel, we must make BOTH conditions false:
    //   - Switch activeTool to "selection" (disables condition 1)
    //   - Clear selectedElementIds (disables condition 2)
    //
    // The pencil button lives inside an Excalidraw embeddable element.
    // Even with stopPropagation, Excalidraw's internal render cycle may
    // re-select the embeddable after a synchronous setActiveTool call.
    // Using a double-RAF ensures our selection clear runs AFTER Excalidraw's
    // state reconciliation is complete.

    // Step 1: Switch tool immediately (clears condition 1 right away)
    if (typeof api.setActiveTool === 'function') {
      api.setActiveTool({ type: 'selection' });
    }

    // Step 2: Clear selection after current call stack / immediate render.
    // We prefer a single deferred clear to allow Excalidraw's internal state
    // reconciliation to finish processing the tool change before we force
    // the selection to clear.
    requestAnimationFrame(() => {
      // Re-read API in case component re-rendered
      const latestApi = excalidrawAPIRef.current ?? api;
      if (typeof latestApi?.updateScene === 'function') {
        latestApi.updateScene({
          appState: {
            selectedElementIds: {},
            selectedGroupIds: {},
            activeEmbeddable: null,
            selectedLinearElement: null,
            openPopup: null,
            activeTool: { type: 'selection', customType: null, lastActiveTool: null, locked: false },
          },
        });
      }
    });
  }, [excalidrawAPI]);

  const saveDrawingSnapshot = useCallback(async (snapshot: DrawingSceneSnapshot) => {
    const mp = masterPadletRef.current;
    if (!mp || readOnly) return;
    if (snapshot.generation !== saveGenerationRef.current) return;

    const { elements, appState, files } = snapshot;

    // Guard: if we've never seen non-empty elements in this session, don't save empty canvas
    // (protects against hot-reload remounting before real data arrives)
    if (elements.length === 0 && !hasSeenElementsRef.current) return;

    try {
      const savePromise = onUpdatePadletStrict(mp.id, {
        content: JSON.stringify(elements),
        metadata: {
          ...mp.metadata,
          drawingAppState: JSON.stringify(appState),
          drawingFiles: JSON.stringify(files)
        }
      });
      const trackedSave = savePromise.then(() => undefined);
      saveInFlightRef.current = trackedSave;
      try {
        await trackedSave;
      } finally {
        if (saveInFlightRef.current === trackedSave) {
          saveInFlightRef.current = null;
        }
      }
    } catch (e) {
      console.error("Failed to save drawing to master padlet", e);
      if (dirtyDataRef.current === null) {
        dirtyDataRef.current = snapshot;
      }
    }
  }, [onUpdatePadletStrict, readOnly]); // masterPadlet removed -- read from ref inside

  const performSave = useCallback(async () => {
    const snapshot = dirtyDataRef.current;
    if (!snapshot) return;
    dirtyDataRef.current = null;
    await saveDrawingSnapshot(snapshot);
  }, [saveDrawingSnapshot]);

  const publishDrawingViewport = useCallback((appState: any) => {
    if (!onDrawingViewportChange || drawingViewportRafRef.current !== null) return;

    drawingViewportRafRef.current = requestAnimationFrame(() => {
      drawingViewportRafRef.current = null;
      const excalidrawCanvas = drawingRootRef.current?.querySelector<HTMLCanvasElement>('canvas.excalidraw__canvas');
      const lineLayer = document.querySelector<SVGSVGElement>('[data-drawing-line-layer="front"]');
      if (!excalidrawCanvas || !lineLayer) return;

      const excalidrawCanvasRect = excalidrawCanvas.getBoundingClientRect();
      const lineLayerRect = lineLayer.getBoundingClientRect();
      onDrawingViewportChange({
        zoom: appState.zoom?.value || 1,
        scrollX: appState.scrollX || 0,
        scrollY: appState.scrollY || 0,
        originOffsetX: excalidrawCanvasRect.left - lineLayerRect.left,
        originOffsetY: excalidrawCanvasRect.top - lineLayerRect.top,
      });
    });
  }, [onDrawingViewportChange]);

  useEffect(() => () => {
    if (drawingViewportRafRef.current !== null) {
      cancelAnimationFrame(drawingViewportRafRef.current);
    }
  }, []);

  const handleChange = useCallback((elements: readonly any[], newAppState: any, files: any) => {
    publishDrawingViewport(newAppState);
    if (readOnly) return;

    const newZoomValue = newAppState.zoom?.value || 1;
    const zoomChanged = newZoomValue !== prevZoomValueRef.current;
    prevZoomValueRef.current = newZoomValue;

    // Always write latest appState to ref (no re-render).
    appStateRef.current = newAppState;
    // PATCH SECTION-H3C: re-anchor the Section Heading toolbar after pan/zoom
    // -- appStateRef is a ref specifically to avoid 60fps re-renders, so this
    // reactive bump only fires while a heading is actually selected, AND only
    // when the camera actually moved since the last bump. Without the
    // actually-moved check this loops: bumping the revision re-renders
    // DrawingLayout, which (empirically confirmed) causes Excalidraw to fire
    // onChange again on the SAME frame, which reads the same non-null
    // selectedSectionHeadingIdRef and bumps again -- forever, regardless of
    // whether the camera moved at all.
    if (selectedSectionHeadingIdRef.current) {
      const lastViewport = lastSectionHeadingViewportRef.current;
      const nextZoom = newAppState.zoom?.value || 1;
      const nextScrollX = newAppState.scrollX || 0;
      const nextScrollY = newAppState.scrollY || 0;
      if (lastViewport.zoom !== nextZoom || lastViewport.scrollX !== nextScrollX || lastViewport.scrollY !== nextScrollY) {
        lastSectionHeadingViewportRef.current = { zoom: nextZoom, scrollX: nextScrollX, scrollY: nextScrollY };
        setSectionHeadingViewportRevision((rev) => rev + 1);
      }
    }
    // Only trigger a render when rounded zoom percent changes (drives toolbar zoom display).
    const newZoomPct = Math.round(newZoomValue * 100);
    if (newZoomPct !== prevZoomPctRef.current) {
      prevZoomPctRef.current = newZoomPct;
      setZoomPercent(newZoomPct);
    }

    currentFilesRef.current = files;

    // Fast pass to find active elements and newly drawn containers without allocating if not needed
    let activeCount = 0;
    const activeElements = [];
    let unboundEmbeddable = null;
    let deletedEmbeddables = null;
    let frameNameSig = '';

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el.isDeleted) {
        activeCount++;
        activeElements.push(el);
        if (el.type === 'frame') {
          frameNameSig += `${JSON.stringify([el.id, el.name ?? null])}\n`;
        }
        if (el.type === "embeddable" && !el.link) {
          unboundEmbeddable = el;
        }
        // Detect Excalidraw-native moves (select/move tool) so we can lock and debounce-save.
        // Skip during sync effect writes (isSyncingEmbeddablesRef) to avoid false detections.
        // Skip when zoom just changed: zoom can cause Excalidraw to report slightly different
        // scene coordinates (pixel-snapping at the new zoom level), which would falsely appear
        // as a user drag and schedule an 800ms position save -> fetchData -> sync cascade.
        if (el.type === "embeddable" && typeof el.link === "string" && el.link.startsWith("padlet://")) {
          const pId = el.link.replace("padlet://", "");
          const embeddableKey = el.id;
          if (!isSyncingEmbeddablesRef.current && !zoomChanged) {
            const lastPos = lastEmbeddablePosRef.current.get(embeddableKey);
            if (
              lastPos &&
              (Math.abs(lastPos.x - el.x) >= POSITION_SYNC_EPSILON ||
                Math.abs(lastPos.y - el.y) >= POSITION_SYNC_EPSILON)
            ) {
              // Position changed -- lock it immediately so sync effect can't overwrite
              recentlyDraggedRef.current.set(pId, { x: el.x, y: el.y, expiresAt: Date.now() + 5000 });
              // Debounce DB save: reset timer on each frame, fires after drag settles.
              schedulePadletPositionSave(pId, el.x, el.y);
            }
          }
          // Always track last known position (including sync-effect writes and zoom changes)
          // so the next handleChange after a sync/zoom doesn't falsely detect a user drag.
          lastEmbeddablePosRef.current.set(embeddableKey, { x: el.x, y: el.y });
        }
      } else if (onDeletePadlet && el.type === "embeddable" && typeof el.link === "string" && el.link.startsWith("padlet://")) {
        if (!deletedEmbeddables) deletedEmbeddables = [];
        deletedEmbeddables.push(el);
      }
    }

    // Only trigger a React re-render of the DrawingLayout if the number of active elements changed
    // (e.g. user added or deleted something, not just dragging an existing element)
    // Uses a ref counter (O(1)) instead of prev.reduce() (O(N)) to avoid 60fps GC pauses during drag.
    if (activeElementCountRef.current !== activeCount || frameNameSigRef.current !== frameNameSig) {
      activeElementCountRef.current = activeCount;
      frameNameSigRef.current = frameNameSig;
      setElements(elements);
    }

    // PATCH-128: additive settled propagation for geometry changes the immediate
    // gate above does not cover (e.g. an in-place move/resize that changes neither
    // active count nor frame names). No-op onChange traffic is ignored internally.
    settledScenePropagationRef.current?.onChange(activeElements);

    if (deletedEmbeddables) {
      deletedEmbeddables.forEach((el: any) => {
        const padletId = String(el.link).replace("padlet://", "");
        if (!padletId || deletedEmbeddablePadletIdsRef.current.has(padletId)) return;
        // Never delete a padlet that is still a child of a container — it was swept
        // by orphan cleanup or the user accidentally deleted a stale scene element.
        const record = paddletsRef.current.find((p) => String(p.id) === padletId);
        if (record?.metadata?.parentId) return;
        deletedEmbeddablePadletIdsRef.current.add(padletId);
        if (onDeletePadlet) {
          onDeletePadlet(padletId).catch((error) => {
            console.error("Failed to delete padlet after embeddable deletion", error);
          });
        }
      });
    }

    if (activeCount > 0) hasSeenElementsRef.current = true;

    // Intercept new unbound embeddables (drawn using the Container tool) to create container padlets
    if (
      unboundEmbeddable &&
      shouldAutoCreateDrawingContainer({
        isApplyingImportedScene: isApplyingImportedSceneRef.current,
        embeddableId: unboundEmbeddable.id,
        createdEmbeddableIds: createdContainerEmbeddableIdsRef.current,
      })
    ) {
      createdContainerEmbeddableIdsRef.current.add(unboundEmbeddable.id);

      const initializeContainerPadlet = async () => {
        try {
          const newPadlet = await onAddPadlet({
            board_id: canvasId,
            type: 'container',
            title: 'New Container',
            content: '[]',
            position_x: unboundEmbeddable.x,
            position_y: unboundEmbeddable.y,
            width: unboundEmbeddable.width,
            height: unboundEmbeddable.height,
            metadata: {
              isContainer: true
            } as any
          });

          if (newPadlet && excalidrawAPI) {
            const currentSceneElements = excalidrawAPI.getSceneElements();
            const updatedSceneElements = currentSceneElements.map((el: any) =>
              el.id === unboundEmbeddable.id ? { ...el, link: `padlet://${newPadlet.id}` } : el
            );
            excalidrawAPI.updateScene({ elements: updatedSceneElements });
          }
        } catch (error) {
          console.error("Created container padlet failed", error);
        }
      };
      initializeContainerPadlet();
    }

    // Skip auto-save when the change came from our own embeddable-sync updateScene call.
    // Those changes don't represent user drawing content and would trigger an unnecessary
    // save -> fetchData -> padlets refresh -> editor state reset cascade.
    if (!isSyncingEmbeddablesRef.current && !isApplyingImportedSceneRef.current) {
      dirtyDataRef.current = {
        elements: activeElements,
        appState: newAppState,
        files,
        generation: saveGenerationRef.current,
      };

      // Debounce save (e.g., 2 seconds after last change)
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        performSave();
      }, 2000);
    }

  }, [onDeletePadlet, performSave, publishDrawingViewport, readOnly, schedulePadletPositionSave]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        performSave(); // final save on unmount just in case
      }
    };
  }, [performSave]);

  const handleImportedSceneReady = useCallback((scene: ImportedDrawingScene) => {
    setPendingImportedScene(scene);
  }, []);

  const handleCancelImportedScene = useCallback(() => {
    setPendingImportedScene(null);
  }, []);

  const clearDrawingOverlayRuntimeState = useCallback(() => {
    setContextMenu(null);
    recentlyDraggedRef.current.clear();
    recentlyNaturalResizedRef.current.clear();
    lastEmbeddablePosRef.current.clear();
    lastPadletSceneSyncRef.current.clear();
    deletedEmbeddablePadletIdsRef.current.clear();
    createdContainerEmbeddableIdsRef.current.clear();
  }, []);

  const getViewportCenter = useCallback(() => {
    const latest = (excalidrawAPIRef.current ?? excalidrawAPI)?.getAppState?.() || appStateRef.current;
    const zoom = latest?.zoom?.value || 1;
    const scrollX = latest?.scrollX || 0;
    const scrollY = latest?.scrollY || 0;
    return {
      x: (window.innerWidth / 2 / zoom) - scrollX,
      y: (window.innerHeight / 2 / zoom) - scrollY,
    };
  }, [appStateRef, excalidrawAPI]);

  const handleImportScene = useCallback(async (mode: 'replace' | 'add') => {
    const scene = pendingImportedScene;
    const api = excalidrawAPIRef.current ?? excalidrawAPI;
    if (!scene || !api) return;

    setIsImportingScene(true);

    try {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      dirtyDataRef.current = null;
      saveGenerationRef.current += 1;

      pendingPosTimersRef.current.forEach((timer) => clearTimeout(timer));
      pendingPosTimersRef.current.clear();
      clearDrawingOverlayRuntimeState();

      if (saveInFlightRef.current) {
        await saveInFlightRef.current;
      }

      const { loadFromBlob } = await import("@excalidraw/excalidraw");
      const latestAppState = api.getAppState?.() || appStateRef.current;
      const currentSceneElements = api.getSceneElements?.() || runtimeSceneElementsRef.current;
      const restoredScene = await loadFromBlob(
        new Blob([JSON.stringify(scene)], { type: "application/json" }),
        latestAppState,
        currentSceneElements,
      );
      const existingFilesBeforeImport = currentFilesRef.current ?? {};
      const overlayDeletionPlan =
        mode === 'replace'
          ? collectDrawingLinkedContainerDeletionPlan({
              elements: currentSceneElements as Array<{ id?: string; type?: string | null; link?: string | null; isDeleted?: boolean }>,
              padlets: paddletsRef.current as Array<{ id: string; type?: string | null; metadata?: Record<string, unknown> | null }>,
            })
          : { rootIds: [], affectedIds: [] };

      const importedFiles = (restoredScene.files ?? {}) as Record<string, any>;
      const importedElements = restoredScene.elements as any[];

      const snapshot: DrawingSceneSnapshot =
        mode === 'replace'
          ? {
              elements: importedElements,
              appState: preserveImportedTransientAppState(restoredScene.appState, latestAppState),
              files: importedFiles,
              generation: saveGenerationRef.current,
            }
          : (() => {
              const preparedImport = prepareImportedSceneForAdd({
                elements: importedElements,
                files: importedFiles,
                viewportCenter: getViewportCenter(),
                placementOffset: {
                  x: importPlacementCountRef.current * 40,
                  y: importPlacementCountRef.current * 40,
                },
              });
              importPlacementCountRef.current += 1;
              const currentElements = api.getSceneElements?.() || runtimeSceneElementsRef.current;
              const selectedElementIds = preparedImport.elements.reduce((acc: Record<string, boolean>, element: any) => {
                acc[element.id] = true;
                return acc;
              }, {});

              return {
                elements: [...currentElements, ...preparedImport.elements],
                appState: preserveImportedTransientAppState({
                  ...latestAppState,
                  selectedElementIds,
                  selectedGroupIds: {},
                  activeTool: latestAppState?.activeTool,
                }, latestAppState),
                files: { ...existingFilesBeforeImport, ...preparedImport.files },
                generation: saveGenerationRef.current,
              };
            })();

      isApplyingImportedSceneRef.current = true;
      currentFilesRef.current = snapshot.files;
      appStateRef.current = snapshot.appState;
      hasSeenElementsRef.current = snapshot.elements.length > 0;
      activeElementCountRef.current = snapshot.elements.length;
      frameNameSigRef.current = buildActiveFrameNameSignature(snapshot.elements);
      setElements(snapshot.elements);

      api.updateScene({
        ...buildDrawingSceneUpdate({
          elements: snapshot.elements,
          appState: snapshot.appState,
          commitToHistory: true,
        }),
      });

      const filesToRegister =
        mode === 'replace'
          ? importedFiles
          : Object.fromEntries(
              Object.entries(snapshot.files).filter(([fileId]) => !existingFilesBeforeImport[fileId]),
            );

      if (typeof api.addFiles === "function" && Object.keys(filesToRegister).length > 0) {
        api.addFiles(Object.values(filesToRegister));
      }

      dirtyDataRef.current = snapshot;
      await saveDrawingSnapshot(snapshot);
      dirtyDataRef.current = null;

      if (mode === 'replace' && overlayDeletionPlan.rootIds.length > 0) {
        await onDeleteOverlayPadlets?.(overlayDeletionPlan.rootIds);
      }

      setPendingImportedScene(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Import failed.";
      window.alert(message);
    } finally {
      isApplyingImportedSceneRef.current = false;
      setIsImportingScene(false);
    }
  }, [
    appStateRef,
    clearDrawingOverlayRuntimeState,
    excalidrawAPI,
    getViewportCenter,
    onDeleteOverlayPadlets,
    pendingImportedScene,
    saveDrawingSnapshot,
  ]);

  // â”€â”€ Slide CRUD helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  const makeFrameElement = useCallback((
    x: number, y: number, name: string
  ) => ({
    id: crypto.randomUUID(),
    type: 'frame' as const,
    name,
    x,
    y,
    width: 1280,
    height: 720,
    angle: 0,
    strokeColor: '#000000',
    backgroundColor: 'transparent',
    fillStyle: 'solid' as const,
    strokeWidth: 2,
    strokeStyle: 'solid' as const,
    roughness: 0,
    opacity: 100,
    frameId: null,
    groupIds: [] as string[],
    isDeleted: false,
    version: 1,
    versionNonce: Math.floor(Math.random() * 1e9),
    updated: Date.now(),
    boundElements: null,
    link: null,
    locked: false,
  }), []);

  const getPresentationNavigationUsableRect = useCallback((appState: any) => {
    const viewportRect =
      viewportContainerRef?.current?.getBoundingClientRect()
      ?? drawingRootRef.current?.getBoundingClientRect()
      ?? null;
    if (!viewportRect || viewportRect.width <= 0 || viewportRect.height <= 0) return null;

    const sidebarRect = presentationSidebarRef.current?.getBoundingClientRect() ?? null;
    const visibleRight = sidebarRect
      ? Math.min(Math.max(sidebarRect.left, viewportRect.left), viewportRect.right)
      : viewportRect.right;
    const measuredLeftInset = Number.isFinite(appState?.offsetLeft)
      ? Math.max(0, Number(appState.offsetLeft) - viewportRect.left)
      : 0;
    const measuredTopInset = Number.isFinite(appState?.offsetTop)
      ? Math.max(0, Number(appState.offsetTop) - viewportRect.top)
      : 0;
    const left = Math.min(viewportRect.right, viewportRect.left + measuredLeftInset);
    const top = Math.min(viewportRect.bottom, viewportRect.top + measuredTopInset);
    const right = Math.max(left, visibleRight);
    const bottom = Math.max(top, viewportRect.bottom);

    return {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
      centerX: left + (right - left) / 2,
      centerY: top + (bottom - top) / 2,
    };
  }, [viewportContainerRef]);

  const navigateToPresentationFrame = useCallback((slideId: string): boolean => {
    const api = excalidrawAPIRef.current ?? excalidrawAPI;
    if (!api || typeof api.getSceneElements !== 'function' || typeof api.updateScene !== 'function') {
      return false;
    }

    const liveFrame = api.getSceneElements().find((el: any) =>
      el?.id === slideId && el.type === 'frame' && !el.isDeleted
    );
    if (!liveFrame || liveFrame.width <= 0 || liveFrame.height <= 0) return false;

    const appState = api.getAppState?.() ?? appStateRef.current ?? {};
    const usableRect = getPresentationNavigationUsableRect(appState);
    if (!usableRect || usableRect.width <= 0 || usableRect.height <= 0) return false;

    const currentZoom = Number(appState?.zoom?.value ?? 1);
    const fitZoom = Math.min(
      usableRect.width / (liveFrame.width + 2 * PRESENTATION_FRAME_NAVIGATION_PADDING_PX),
      usableRect.height / (liveFrame.height + 2 * PRESENTATION_FRAME_NAVIGATION_PADDING_PX),
      PRESENTATION_FRAME_NAVIGATION_MAX_ZOOM,
    );
    const finiteFitZoom = Number.isFinite(fitZoom) && fitZoom > 0 ? fitZoom : PRESENTATION_FRAME_NAVIGATION_MAX_ZOOM;
    const finiteCurrentZoom = Number.isFinite(currentZoom) && currentZoom > 0 ? currentZoom : PRESENTATION_FRAME_NAVIGATION_MAX_ZOOM;
    const targetZoom = Math.min(finiteCurrentZoom, finiteFitZoom, PRESENTATION_FRAME_NAVIGATION_MAX_ZOOM);
    const offsetLeft = Number.isFinite(appState?.offsetLeft) ? Number(appState.offsetLeft) : 0;
    const offsetTop = Number.isFinite(appState?.offsetTop) ? Number(appState.offsetTop) : 0;
    const frameCenterX = liveFrame.x + liveFrame.width / 2;
    const frameCenterY = liveFrame.y + liveFrame.height / 2;

    api.updateScene({
      appState: {
        zoom: { ...(appState?.zoom ?? {}), value: targetZoom },
        scrollX: (usableRect.centerX - offsetLeft) / targetZoom - frameCenterX,
        scrollY: (usableRect.centerY - offsetTop) / targetZoom - frameCenterY,
        selectedElementIds: { [liveFrame.id]: true },
        selectedGroupIds: {},
        selectedLinearElement: null,
        activeEmbeddable: null,
      },
      commitToHistory: false,
    });
    return true;
  }, [excalidrawAPI, getPresentationNavigationUsableRect]);

  const navigateToPresentationFrameSoon = useCallback((slideId: string) => {
    window.requestAnimationFrame(() => {
      if (navigateToPresentationFrame(slideId)) return;
      window.requestAnimationFrame(() => {
        navigateToPresentationFrame(slideId);
      });
    });
  }, [navigateToPresentationFrame]);

  const handleAddSlide = useCallback(() => {
    if (!excalidrawAPI) return;
    const currentElements = excalidrawAPI.getSceneElements();
    const activeFrames = currentElements.filter((el: any) => el.type === 'frame' && !el.isDeleted);
    let x = 0, y = 0;
    if (activeFrames.length > 0) {
      const last = activeFrames.reduce((best: any, el: any) =>
        el.x + el.width > best.x + best.width ? el : best, activeFrames[0]);
      x = last.x + last.width + 80;
      y = last.y;
    }
    const newFrame = makeFrameElement(x, y, `Slide ${activeFrames.length + 1}`);
    const indexedElements = syncSceneElementIndices([...currentElements, newFrame]);
    const indexedFrame = indexedElements.find((el: any) => el.id === newFrame.id) ?? newFrame;
    excalidrawAPI.updateScene({ elements: indexedElements });
    setActiveSlideId(indexedFrame.id);
    navigateToPresentationFrameSoon(indexedFrame.id);
  }, [excalidrawAPI, makeFrameElement, navigateToPresentationFrameSoon]);

  const handleAddSlideBelow = useCallback((id: string) => {
    if (!excalidrawAPI) return;
    const currentElements = excalidrawAPI.getSceneElements();
    const frame = currentElements.find((el: any) => el.id === id && el.type === 'frame');
    if (!frame) return;
    const activeFrames = currentElements.filter((el: any) => el.type === 'frame' && !el.isDeleted);
    const newFrame = makeFrameElement(
      frame.x,
      frame.y + frame.height + 80,
      `Slide ${activeFrames.length + 1}`
    );
    const indexedElements = syncSceneElementIndices([...currentElements, newFrame]);
    const indexedFrame = indexedElements.find((el: any) => el.id === newFrame.id) ?? newFrame;
    excalidrawAPI.updateScene({ elements: indexedElements });
    setActiveSlideId(indexedFrame.id);
    navigateToPresentationFrameSoon(indexedFrame.id);
  }, [excalidrawAPI, makeFrameElement, navigateToPresentationFrameSoon]);

  const cloneLinkedRowsForDuplicateSlide = useCallback(async (children: any[], dx: number) => {
    const createdIds: string[] = [];
    const clonedLinkByElementId = new Map<string, string>();
    const padletsById = new Map(padlets.map((padlet) => [String(padlet.id), padlet] as const));

    const createClone = async (
      source: Padlet,
      metadata: Padlet['metadata'],
      position: { x: number; y: number },
    ) => {
      const created = await onAddPadlet({
        board_id: canvasId,
        type: source.type,
        title: source.title,
        content: source.content,
        file_url: source.file_url,
        file_name: source.file_name,
        file_type: source.file_type,
        file_size: source.file_size,
        image_url: source.image_url,
        position_x: position.x,
        position_y: position.y,
        width: source.width,
        height: source.height,
        metadata,
      });
      if (!created) {
        throw new Error(`Failed to clone drawing duplicate row ${source.id}`);
      }
      createdIds.push(created.id);
      return created;
    };

    try {
      for (const child of children) {
        if (child.type !== 'embeddable' || typeof child.link !== 'string' || !child.link.startsWith('padlet://')) {
          continue;
        }

        const sourceContainerId = child.link.replace('padlet://', '');
        const sourceContainer = padletsById.get(sourceContainerId);
        if (!sourceContainer) {
          throw new Error(`Cannot duplicate slide: missing linked row ${sourceContainerId}`);
        }

        const sourceMetadata = (sourceContainer.metadata ?? {}) as Record<string, any>;
        const sourceChildIds = Array.isArray(sourceMetadata.childPadletIds)
          ? sourceMetadata.childPadletIds.map((childId: unknown) => String(childId))
          : [];
        const sourceChildRows = sourceChildIds.map((childId) => {
          const sourceChild = padletsById.get(childId);
          if (!sourceChild) {
            throw new Error(`Cannot duplicate slide: missing linked child row ${childId}`);
          }
          return sourceChild;
        });

        const clonedContainerMetadata = {
          ...sanitizeClonedPostMetadata(sourceMetadata),
          childPadletIds: [],
        } as Padlet['metadata'];
        const clonedContainer = await createClone(sourceContainer, clonedContainerMetadata, {
          x: (sourceContainer.position_x ?? child.x ?? 0) + dx,
          y: sourceContainer.position_y ?? child.y ?? 0,
        });

        const clonedChildIds: string[] = [];
        for (const sourceChild of sourceChildRows) {
          const clonedChildMetadata = {
            ...sanitizeClonedPostMetadata((sourceChild.metadata ?? {}) as Record<string, any>),
            parentId: clonedContainer.id,
          } as Padlet['metadata'];
          const clonedChild = await createClone(sourceChild, clonedChildMetadata, {
            x: sourceChild.position_x ?? 0,
            y: sourceChild.position_y ?? 0,
          });
          clonedChildIds.push(clonedChild.id);
        }

        await onUpdatePadletStrict(clonedContainer.id, {
          metadata: {
            ...clonedContainerMetadata,
            childPadletIds: clonedChildIds,
          },
        });
        clonedLinkByElementId.set(child.id, `padlet://${clonedContainer.id}`);
      }
    } catch (error) {
      if (onDeletePadlet) {
        await Promise.allSettled([...createdIds].reverse().map((createdId) => onDeletePadlet(createdId)));
      }
      throw error;
    }

    return clonedLinkByElementId;
  }, [canvasId, onAddPadlet, onDeletePadlet, onUpdatePadletStrict, padlets]);

  const handleDuplicateSlide = useCallback(async (id: string) => {
    if (!excalidrawAPI) return;
    const frame = elements.find((el: any) => el.id === id && el.type === 'frame');
    if (!frame) return;
    const children = elements.filter((el: any) => el.frameId === id && !el.isDeleted);

    const newFrameId = crypto.randomUUID();
    const dx = frame.width + 80;

    const newFrame = {
      ...frame,
      id: newFrameId,
      x: frame.x + dx,
      versionNonce: Math.floor(Math.random() * 1e9),
      updated: Date.now(),
    };

    try {
      const clonedLinkByElementId = await cloneLinkedRowsForDuplicateSlide(children, dx);
      const newChildren = children.map((child: any) => ({
        ...child,
        id: crypto.randomUUID(),
        x: child.x + dx,
        frameId: newFrameId,
        link: clonedLinkByElementId.get(child.id) ?? child.link,
        versionNonce: Math.floor(Math.random() * 1e9),
        updated: Date.now(),
      }));

      excalidrawAPI.updateScene({ elements: syncSceneElementIndices([...elements, newFrame, ...newChildren]) });
    } catch (error) {
      console.error('Failed to duplicate drawing slide:', error);
    }
  }, [cloneLinkedRowsForDuplicateSlide, excalidrawAPI, elements]);

  const handleRemoveSlide = useCallback((id: string) => {
    if (!excalidrawAPI) return;
    const updated = elements.map((el: any) =>
      el.id === id || el.frameId === id
        ? { ...el, isDeleted: true, updated: Date.now() }
        : el
    );
    excalidrawAPI.updateScene({ elements: updated });
    if (activeSlideId === id) setActiveSlideId(null);
  }, [excalidrawAPI, elements, activeSlideId]);

  const handleRenameSlide = useCallback((id: string, name: string) => {
    if (!excalidrawAPI) return;
    const updated = elements.map((el: any) =>
      el.id === id ? { ...el, name, updated: Date.now() } : el
    );
    excalidrawAPI.updateScene({ elements: updated });
  }, [excalidrawAPI, elements]);

  const handleArrangeLayout = useCallback((
    type: 'row' | 'column' | 'grid', columns = 3
  ) => {
    if (!excalidrawAPI) return;
    const GAP = 80;
    const activeFrames = elements
      .filter((el: any) => el.type === 'frame' && !el.isDeleted)
      .sort((a: any, b: any) => a.y !== b.y ? a.y - b.y : a.x - b.x);

    const updated = [...elements];

    activeFrames.forEach((frame: any, i: number) => {
      let newX = 0, newY = 0;
      if (type === 'row') {
        newX = i * (frame.width + GAP);
        newY = 0;
      } else if (type === 'column') {
        newX = 0;
        newY = i * (frame.height + GAP);
      } else {
        const col = i % columns;
        const row = Math.floor(i / columns);
        newX = col * (frame.width + GAP);
        newY = row * (frame.height + GAP);
      }

      const dx = newX - frame.x;
      const dy = newY - frame.y;

      // Move frame
      const fi = updated.findIndex((el: any) => el.id === frame.id);
      if (fi >= 0) updated[fi] = { ...updated[fi], x: newX, y: newY, updated: Date.now() };

      // Move children
      updated.forEach((el: any, idx: number) => {
        if (el.frameId === frame.id && !el.isDeleted) {
          updated[idx] = { ...el, x: el.x + dx, y: el.y + dy, updated: Date.now() };
        }
      });
    });

    excalidrawAPI.updateScene({ elements: updated });
    setTimeout(() => excalidrawAPI.scrollToContent(
      activeFrames.map((f: any) => ({ ...f })),
      { fitToContent: true, animate: true, duration: 500 }
    ), 100);
  }, [excalidrawAPI, elements]);

  const handleStartPresentation = useCallback((fromSlideId?: string) => {
    const activeFrames = elements.filter((el: any) => el.type === 'frame' && !el.isDeleted);
    if (activeFrames.length === 0) return;
    setPresentationStartId(fromSlideId ?? sortSlidesByPresentationOrder(activeFrames)[0]?.id ?? null);
    setPresentationActive(true);
  }, [elements]);

  // â”€â”€ Context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Outside-close is handled by a transparent backdrop overlay in JSX (see below)

  const handleContextMenu = useCallback((e: React.MouseEvent, padlet: Padlet) => {
    e.preventDefault();
    e.stopPropagation();
    if (readOnly) return;
    closeSelectedShapePanel();
    setContextMenu({ x: e.clientX, y: e.clientY, padlet });
  }, [closeSelectedShapePanel, readOnly]);

  /**
   * PATCH SECTION-H3C Phase 26 -- Section Heading's OWN z-order, via the SAME
   * canonical metadata.zIndex infrastructure Freeform's movePadletLayer uses.
   *
   * Every OTHER Drawing post type's Bring to Front/Send to Back
   * (useCanvasActions.ts's handleBringToFront/handleSendToBack) reorders
   * Excalidraw's OWN scene element array -- canvas-draw-order ownership, not
   * canonical data. That is explicitly what this phase forbids for Section
   * Heading ("No Excalidraw-only order as semantic ownership"), because its
   * CSS z-index is driven by metadata.zIndex (SectionHeadingPost's own
   * style), which scene-array reordering never touches at all -- confirmed
   * empirically (z-index stayed unchanged after using the generic path).
   * Reusing Freeform's own max+1 / max(10,min-1) formula against the SAME
   * `padlets` array keeps one z-order convention across the whole board.
   */
  const moveSectionHeadingZOrder = useCallback(async (padlet: Padlet, action: 'bringToFront' | 'sendToBack') => {
    const zValues = padlets.map((p) => (p.metadata as { zIndex?: number } | undefined)?.zIndex || 100);
    const maxZ = Math.max(...zValues);
    const minZ = Math.min(...zValues);
    const newZ = action === 'bringToFront' ? maxZ + 1 : Math.max(10, minZ - 1);
    await onUpdatePadlet(padlet.id, { metadata: { ...padlet.metadata, zIndex: newZ } });
  }, [padlets, onUpdatePadlet]);

  const getPadletRenderSignature = useCallback((padlet: Padlet) => {
    return JSON.stringify({
      id: padlet.id,
      type: padlet.type,
      title: padlet.title ?? '',
      content: padlet.content ?? '',
      file_url: padlet.file_url ?? null,
      // position_x/y intentionally excluded: position is checked separately in scene sync
      // (el.x !== nextX || el.y !== nextY) and including it causes key change on every drag,
      // which unmounts/remounts DrawingEmbeddableCard, resetting isExpanded state.
      width: padlet.width ?? 320,
      height: padlet.height ?? 280,
      metadata: padlet.metadata ?? null,
    });
  }, []);

  useEffect(() => {
    hasPerformedInitialEmbeddableRefreshRef.current = false;
  }, [key]);


  const createEmbeddableElementForPadlet = useCallback((padlet: Padlet) => {
    // See SECTION_HEADING_DRAWING_FRAME_PADDING_PX's own comment -- widens
    // ONLY the scene frame so the heading's own resize handles are not
    // clipped by the embeddable's overflow:hidden container. The canonical
    // padlet.position_x/width are never touched; DrawingSectionHeadingCard
    // cancels this same padding back out when positioning its content.
    const framePadding = isSectionHeading(padlet) ? SECTION_HEADING_DRAWING_FRAME_PADDING_PX : 0;
    return {
      id: crypto.randomUUID(),
      type: "embeddable" as const,
      x: padlet.position_x - framePadding,
      y: padlet.position_y,
      width: (padlet.width ?? 320) + framePadding * 2,
      height: padlet.height ?? 280,
      angle: 0,
      strokeColor: "transparent",
      backgroundColor: "transparent",
      fillStyle: "solid" as const,
      strokeWidth: 1,
      strokeStyle: "solid" as const,
      roundness: null,
      roughness: 0,
      opacity: 100,
      seed: Math.floor(Math.random() * 2000000000),
      version: 1,
      versionNonce: Math.floor(Math.random() * 1e9),
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: Date.now(),
      link: `padlet://${padlet.id}`,
      // PATCH SECTION-H3C Phase 18-21: a Section Heading's only visible
      // transform handles are its own left/right horizontal ones
      // (SectionHeadingPost). Locking the embeddable removes Excalidraw's
      // native corner/edge/rotation selection chrome entirely while leaving
      // its React content (rendered via renderEmbeddable) fully interactive
      // -- body drag and resize are both app-owned already (see
      // startSectionHeadingBodyDrag / SectionHeadingPost's own handles), so
      // nothing native is lost. Every other embeddable keeps `locked: false`
      // unchanged.
      locked: isSectionHeading(padlet),
      customData: {
        renderSignature: getPadletRenderSignature(padlet),
      },
    };
  }, [getPadletRenderSignature]);

  const insertPadletEmbeddable = useCallback((padlet: Padlet) => {
    if (!excalidrawAPI || padlet.type === "drawing" || padlet.metadata?.parentId) return;
    const currentElements = excalidrawAPI.getSceneElements();
    const link = `padlet://${padlet.id}`;
    const alreadyExists = currentElements.some(
      (el: any) => el.type === "embeddable" && !el.isDeleted && el.link === link
    );
    if (alreadyExists) return;
    const embeddable = createEmbeddableElementForPadlet(padlet);
    const indexedElements = syncSceneElementIndices([...currentElements, embeddable]);
    excalidrawAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: indexedElements,
        appState: {
          ...excalidrawAPI.getAppState()
        },
        commitToHistory: true,
      }),
    });
  }, [createEmbeddableElementForPadlet, excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    const nonDrawingRootPadlets = padlets.filter((p) => p.type !== "drawing" && !p.metadata?.parentId);
    const previousSceneSync = lastPadletSceneSyncRef.current;
    const nextSceneSync = new Map(
      nonDrawingRootPadlets.map((p) => [
        String(p.id),
        {
          x: (p.position_x ?? 0) - (isSectionHeading(p) ? SECTION_HEADING_DRAWING_FRAME_PADDING_PX : 0),
          y: p.position_y ?? 0,
        },
      ] as const)
    );

    const currentElements = excalidrawAPI.getSceneElements();
    const activePadletLinks = new Set(nonDrawingRootPadlets.map((p) => `padlet://${p.id}`));
    const padletsByLink = new Map(nonDrawingRootPadlets.map((p) => [`padlet://${p.id}`, p] as const));

    const existingLinks = new Set(
      currentElements
        .filter((el: any) => el.type === "embeddable" && !el.isDeleted && typeof el.link === "string")
        .map((el: any) => el.link)
    );

    // Orphaned: scene embeddable whose padlet no longer exists / is now a child / is drawing type
    const orphanedIds = new Set(
      currentElements
        .filter((el: any) =>
          el.type === "embeddable" &&
          !el.isDeleted &&
          typeof el.link === "string" &&
          el.link.startsWith("padlet://") &&
          !activePadletLinks.has(el.link)
        )
        .map((el: any) => el.id)
    );

    const missingEmbeddables = nonDrawingRootPadlets
      .filter((p) => !existingLinks.has(`padlet://${p.id}`))
      .map((p) => createEmbeddableElementForPadlet(p));

    const refreshedEmbeddables: any[] = [];
    let needsSceneRefresh = false;

    const nextElements = currentElements
      .filter((el: any) => !orphanedIds.has(el.id))
      .map((el: any) => {
        if (el.type !== "embeddable" || el.isDeleted || typeof el.link !== "string") {
          return el;
        }

        const linkedPadlet = padletsByLink.get(el.link);
        if (!linkedPadlet) return el;

        // See SECTION_HEADING_DRAWING_FRAME_PADDING_PX's comment -- the
        // embeddable's OWN scene frame stays padded on every reconciliation
        // pass too, not just at creation.
        const framePadding = isSectionHeading(linkedPadlet) ? SECTION_HEADING_DRAWING_FRAME_PADDING_PX : 0;
        const nextX = (linkedPadlet.position_x ?? 0) - framePadding;
        const nextY = linkedPadlet.position_y ?? 0;
        const nextWidth = (linkedPadlet.width ?? 320) + framePadding * 2;
        const nextHeight = linkedPadlet.height ?? 280;
        const nextSignature = getPadletRenderSignature(linkedPadlet);
        const currentSignature = el.customData?.renderSignature;

        const padletIdFromLink = el.link.replace("padlet://", "");
        const previousSyncedPos = previousSceneSync.get(padletIdFromLink);
        const positionChangedInPadletData =
          !previousSyncedPos ||
          previousSyncedPos.x !== nextX ||
          previousSyncedPos.y !== nextY;

        // Position lock: hold scene x/y while dragging or waiting for DB to confirm.
        // Two-phase lock:
        //   Phase 1 (timer active): debounce timer is still ticking = user is actively
        //     dragging right now. Lock unconditionally -- getSceneElements() is always
        //     one frame ahead of recentlyDraggedRef (set by handleChange), so coordinate
        //     comparison would fail mid-drag and let the sync overwrite mid-drag position.
        //   Phase 2 (timer fired, DB pending): timer has settled, DB save is in flight.
        //     Use pendingPos coordinate match with epsilon to hold until DB confirms.
        // Use epsilon (0.5 scene units) to absorb float precision loss in DB round-trips:
        //   at non-100% zoom, positions like 100/0.9 = 111.111... may not survive exactly
        //   through a numeric DB column, causing strict === to fail and the lock to miss.
        const pendingPos = recentlyDraggedRef.current.get(padletIdFromLink);
        // Only clear when the 5s window expires. Do NOT clear early when DB catches up —
        // that would allow a stale padlets re-fetch (triggered by another container's save)
        // to overwrite this container's position before the window is up.
        if (pendingPos && Date.now() > pendingPos.expiresAt) {
          recentlyDraggedRef.current.delete(padletIdFromLink);
        }
        const activePendingPos = recentlyDraggedRef.current.get(padletIdFromLink);
        const positionLocked =
          pendingPosTimersRef.current.has(padletIdFromLink) ||   // phase 1: mid-drag (timer active)
          (!!activePendingPos &&                                  // phase 2: within 5s window
            Math.abs(el.x - activePendingPos.x) < POSITION_SYNC_EPSILON &&
            Math.abs(el.y - activePendingPos.y) < POSITION_SYNC_EPSILON);

        // Height lock: hold scene height while the scene has the value onNaturalHeight set.
        // Cleared automatically when DB catches up (nextHeight matches our natural value).
        const pendingNaturalSize = recentlyNaturalResizedRef.current.get(padletIdFromLink);
        const heightLocked = pendingNaturalSize?.height !== undefined && el.height === pendingNaturalSize.height;
        const widthLocked = pendingNaturalSize?.width !== undefined && el.width === pendingNaturalSize.width;
        if (pendingNaturalSize) {
          if (pendingNaturalSize.height !== undefined && nextHeight === pendingNaturalSize.height) delete pendingNaturalSize.height;
          if (pendingNaturalSize.width !== undefined && nextWidth === pendingNaturalSize.width) delete pendingNaturalSize.width;
          if (pendingNaturalSize.height === undefined && pendingNaturalSize.width === undefined) {
            recentlyNaturalResizedRef.current.delete(padletIdFromLink);
          }
        }

        const needsRefresh =
          (positionChangedInPadletData &&
            !positionLocked &&
            (Math.abs(el.x - nextX) >= POSITION_SYNC_EPSILON || Math.abs(el.y - nextY) >= POSITION_SYNC_EPSILON)) ||
          (!widthLocked && el.width !== nextWidth) ||
          (!heightLocked && el.height !== nextHeight) ||
          currentSignature !== nextSignature;

        if (!needsRefresh) return el;

        needsSceneRefresh = true;
        // [DBG] log what triggered the sync overwrite
        const reasons: string[] = [];
        if (positionChangedInPadletData && !positionLocked && Math.abs(el.x - nextX) >= POSITION_SYNC_EPSILON) reasons.push(`x: ${el.x} -> ${nextX}`);
        if (positionChangedInPadletData && !positionLocked && Math.abs(el.y - nextY) >= POSITION_SYNC_EPSILON) reasons.push(`y: ${el.y} -> ${nextY}`);
        if (!widthLocked && el.width !== nextWidth) reasons.push(`width: ${el.width} -> ${nextWidth}`);
        if (!heightLocked && el.height !== nextHeight) reasons.push(`height: ${el.height} -> ${nextHeight}`);
        if (currentSignature !== nextSignature) reasons.push('signature changed');
        const timerActive = pendingPosTimersRef.current.has(padletIdFromLink);
        if (positionLocked) reasons.push(`pos LOCKED${timerActive ? '[timer]' : '[coord]'} (scene=${el.x},${el.y} db=${nextX},${nextY})`);
        if (heightLocked) reasons.push(`height LOCKED (scene=${el.height} db=${nextHeight})`);
        const refreshed = {
          ...el,
          x: positionLocked || !positionChangedInPadletData ? el.x : nextX,
          y: positionLocked || !positionChangedInPadletData ? el.y : nextY,
          width: widthLocked ? el.width : nextWidth,
          height: heightLocked ? el.height : nextHeight,
          version: (el.version ?? 1) + 1,
          versionNonce: Math.floor(Math.random() * 1e9),
          updated: Date.now(),
          customData: {
            ...(el.customData ?? {}),
            renderSignature: nextSignature,
          },
        };
        refreshedEmbeddables.push(refreshed);
        return refreshed;
      });

    lastPadletSceneSyncRef.current = nextSceneSync;
    const combinedElements = [
      ...nextElements,
      ...missingEmbeddables,
    ];
    const needsIndexSync = hasInvalidFractionalIndex(combinedElements);
    if (missingEmbeddables.length === 0 && orphanedIds.size === 0 && !needsSceneRefresh && !needsIndexSync) return;

    // Pre-update lastEmbeddablePosRef to match what we're about to write.
    // If handleChange fires asynchronously (after setTimeout clears isSyncingEmbeddablesRef),
    // the detection code would see lastPos == el.x and skip false user-drag detection.
    // This is belt-and-suspenders alongside the isSyncingEmbeddablesRef guard.
    for (const el of [...refreshedEmbeddables, ...missingEmbeddables]) {
      if (typeof el.link === "string" && el.link.startsWith("padlet://")) {
        lastEmbeddablePosRef.current.set(el.id, { x: el.x, y: el.y });
      }
    }

    // Flag handleChange to skip auto-save for this synthetic scene update.
    // React batches setState (used inside updateScene) as microtasks, so handleChange
    // fires before the setTimeout(0) reset — giving us a clean one-shot guard.
    isSyncingEmbeddablesRef.current = true;
    const indexedElements = needsIndexSync ? syncSceneElementIndices(combinedElements) : combinedElements;
    const indexedElementsById = new Map(indexedElements.map((el: any) => [el.id, el]));
    const syncedEmbeddables = [...refreshedEmbeddables, ...missingEmbeddables].map((el: any) =>
      indexedElementsById.get(el.id) ?? el
    );
    excalidrawAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: indexedElements,
        commitToHistory: false,
      }),
    });
    if (typeof (excalidrawAPI as any).updateBoundElements === "function") {
      syncedEmbeddables.forEach((el: any) => {
        (excalidrawAPI as any).updateBoundElements(el);
      });
    }
    setTimeout(() => { isSyncingEmbeddablesRef.current = false; }, 0);
  }, [createEmbeddableElementForPadlet, excalidrawAPI, getPadletRenderSignature, padlets]);

  useEffect(() => {
    if (!excalidrawAPI || !padletsLoaded || hasPerformedInitialEmbeddableRefreshRef.current) return;

    const embeddables = excalidrawAPI
      .getSceneElements()
      .filter((el: any) => el.type === "embeddable" && !el.isDeleted && typeof el.link === "string" && el.link.startsWith("padlet://"));

    if (embeddables.length === 0) return;

    hasPerformedInitialEmbeddableRefreshRef.current = true;

    const refreshTimer = window.setTimeout(() => {
      const currentElements = excalidrawAPI.getSceneElements();
      const refreshedIds = new Set(embeddables.map((el: any) => el.id));
      const refreshedElements = currentElements.map((el: any) => {
        if (!refreshedIds.has(el.id)) return el;
        return {
          ...el,
          version: (el.version ?? 1) + 1,
          versionNonce: Math.floor(Math.random() * 1e9),
          updated: Date.now(),
        };
      });

      isSyncingEmbeddablesRef.current = true;
      excalidrawAPI.updateScene({
        ...buildDrawingSceneUpdate({
          elements: refreshedElements,
          commitToHistory: false,
        }),
      });

      if (typeof (excalidrawAPI as any).updateBoundElements === "function") {
        refreshedElements
          .filter((el: any) => refreshedIds.has(el.id))
          .forEach((el: any) => {
            (excalidrawAPI as any).updateBoundElements(el);
          });
      }

      setTimeout(() => { isSyncingEmbeddablesRef.current = false; }, 0);
    }, 80);

    return () => window.clearTimeout(refreshTimer);
  }, [excalidrawAPI, key, padletsLoaded]);

  // Persists updated comments array for any padlet (root comment posts + container children)
  const handleUpdateChildComments = useCallback(async (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => {
    const child = paddletsRef.current.find(p => p.id === childId);
    if (!child) return;
    const field = options?.field || 'comments';
    try {
      await onUpdatePadletStrict(childId, { metadata: { ...(child.metadata as any), [field]: comments } });
    } catch (error) {
      console.error('Failed to update comment', error);
    }
  }, [onUpdatePadletStrict]);

  const renderEmbeddable = useCallback((element: any) => {
    const link = typeof element?.link === "string" ? element.link : "";
    if (!link.startsWith("padlet://")) return null;
    const padletId = link.replace("padlet://", "");
    const padlet = paddletsRef.current.find((p) => String(p.id) === padletId && p.type !== "drawing");
    if (!padlet) return null;
    // PATCH SECTION-H3C Phase 6: Section Heading owns its entire presentation
    // (same as Freeform), so it is routed to its dedicated adapter INSTEAD OF
    // the generic DrawingEmbeddableCard -- not layered on top of it. This
    // keeps it free of the title-bar/pencil-edit/comment-badge chrome every
    // other Drawing card has, without touching DrawingEmbeddableCard at all.
    if (isSectionHeading(padlet)) {
      return (
        <DrawingSectionHeadingCard
          key={padletId}
          padlet={padlet}
          readOnly={readOnly}
          excalidrawAPIRef={excalidrawAPIRef}
          appStateRef={appStateRef}
          onUpdatePadlet={onUpdatePadlet}
          onContextMenu={handleContextMenu}
          onDragEnd={(id, x, y) => {
            // startSectionHeadingBodyDrag operates purely in "this
            // embeddable's own scene frame" terms, which is padded (see
            // SECTION_HEADING_DRAWING_FRAME_PADDING_PX) -- un-pad before this
            // reaches canonical position_x, or every drag would permanently
            // shift the heading left by the padding amount.
            const canonicalX = x + SECTION_HEADING_DRAWING_FRAME_PADDING_PX;
            recentlyDraggedRef.current.set(id, { x: canonicalX, y, expiresAt: Date.now() + 5000 });
            savePadletPositionWithLock(id, canonicalX, y);
          }}
        />
      );
    }
    return (
      <DrawingEmbeddableCard
        key={padletId}
        padlet={padlet}
        allPadlets={paddletsRef.current}
        readOnly={readOnly}
        excalidrawAPIRef={excalidrawAPIRef}
        appStateRef={appStateRef}
        onUpdatePadlet={onUpdatePadlet}
        onUpdatePadletStrict={onUpdatePadletStrict}
        onAddPadlet={onAddPadlet}
        onDeletePadlet={onDeletePadlet}
        canvasId={canvasId}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserAvatar={currentUserAvatar}
        onUpdateChildComments={handleUpdateChildComments}
        commentAccessMode={commentAccessMode}
        fetchData={fetchData}
        onContextMenu={handleContextMenu}
        onPadletEditRef={onPadletEditRef}
        onBeforePadletEdit={closeSelectedShapePanel}
        onDragEnd={(id, x, y) => {
          recentlyDraggedRef.current.set(id, { x, y, expiresAt: Date.now() + 5000 });
          savePadletPositionWithLock(id, x, y);
        }}
        onNaturalResize={(id, size) => {
          const previous = recentlyNaturalResizedRef.current.get(id) ?? {};
          recentlyNaturalResizedRef.current.set(id, { ...previous, ...size });
          if (size.width !== undefined) {
            const current = paddletsRef.current.find((p) => p.id === id);
            if (current && size.width > (Number(current.width) || 0) + 1) {
              void onUpdatePadlet(id, { width: size.width });
            }
          }
        }}
        onOpenDocument={onOpenDocument}
      />
    );
  }, [canvasId, commentAccessMode, currentUserAvatar, currentUserId, currentUserName, fetchData, handleContextMenu, handleUpdateChildComments, onAddPadlet, onDeletePadlet, onUpdatePadlet, onUpdatePadletStrict, readOnly, savePadletPositionWithLock, onOpenDocument]);

  // Stable viewport accessor for useCanvasActions -- reads appStateRef at call time so
  // callbacks never stale-close over scroll/zoom and never recreate on pan.
  const stableViewport = useMemo(() => ({
    get zoom() { return appStateRef.current?.zoom; },
    get scrollX() { return appStateRef.current?.scrollX ?? 0; },
    get scrollY() { return appStateRef.current?.scrollY ?? 0; },
  }), []);

  const getDrawingSceneElements = useCallback(() => {
    if (!excalidrawAPI) return [] as any[];
    return excalidrawAPI.getSceneElements();
  }, [excalidrawAPI]);

  const updateDrawingSceneElements = useCallback((nextElements: readonly any[], options?: { commitToHistory?: boolean }) => {
    if (!excalidrawAPI) return;
    excalidrawAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: nextElements as any[],
        commitToHistory: options?.commitToHistory ?? true,
      }),
    });
  }, [excalidrawAPI]);

  const {
    clipboard,
    handleDuplicatePadlet,
    handleDeletePadlet,
    handleSendToBack,
    handleSendBackward,
    handleBringForward,
    handleBringToFront,
    handleCopyPadlet,
    handleCutPadlet,
    handlePastePadlet,
    handleCopyAsPNG,
    handleExportAsPNG,
  } = useCanvasActions({
    canvasId,
    padlets,
    masterPadletId: masterPadlet?.id,
    appState: stableViewport as any,
    onAddPadlet,
    onUpdatePadlet,
    onDeletePadlet,
    onPadletCreated: insertPadletEmbeddable,
    getSceneElements: getDrawingSceneElements,
    updateSceneElements: updateDrawingSceneElements,
  });

  const slideRenderer = useMemo(() => createSlideRenderer({
    getSceneElements: () => runtimeSceneElementsRef.current,
    getPadlets: () => runtimePadletsRef.current,
    getFiles: () => currentFilesRef.current ?? runtimeInitialFilesRef.current ?? null,
    getCanvasLines: () => runtimeCanvasLinesRef.current,
  }), []);

  // Render a single Excalidraw frame to a PNG dataURL (used by PresentationPanel + export path)
  const renderSlideToPNG = useCallback((slide: FrameSlide, opts: RenderSlideOptions): Promise<string> => (
    slideRenderer.renderSlideToPNG(slide, opts)
  ), [slideRenderer]);

  // Helpers for the runtime live slideshow path in FullscreenPresentation.
  // Keep the helper identity stable and read fresh scene data from refs at call time.
  const runtimeSlideHelpers = useMemo((): RuntimeSlideHelpers => ({
    getSceneElements: () => runtimeSceneElementsRef.current,
    getPadlets: () => runtimePadletsRef.current,
    getFiles: () => currentFilesRef.current ?? runtimeInitialFilesRef.current ?? null,
    getCanvasLines: () => runtimeCanvasLinesRef.current,
  }), []);

  const handleActivateSlide = useCallback((slideId: string) => {
    setActiveSlideId(slideId);
    if (navigateToPresentationFrame(slideId)) return;
    navigateToPresentationFrameSoon(slideId);
  }, [navigateToPresentationFrame, navigateToPresentationFrameSoon]);

  // PATCH-128: deterministic revision over canonical padlet render state, used
  // below purely as an additional frames-memo dependency so metadata-only edits
  // (which never change `elements` or `canvasLines`) still invalidate slide
  // signatures. Does not replace or duplicate getSlideRenderSignature's logic.
  const postRenderRevision = useMemo(() => computePostRenderRevision(padlets), [padlets]);

  const frames: FrameSlide[] = useMemo(() => {
    const frameEls = (elements as any[]).filter((el: any) => el.type === 'frame' && !el.isDeleted);
    let changed = frameEls.length !== framesArrayRef.current.length;
    const next: FrameSlide[] = frameEls.map((el: any) => {
      const baseSlide = {
        id: el.id,
        name: el.name ?? null,
        x: el.x,
        y: el.y,
        width: el.width,
        height: el.height,
        order: null,
      } satisfies FrameSlide;
      const sig = slideRenderer.getSlideRenderSignature(baseSlide);
      if (frameSigsRef.current[el.id] !== sig) {
        frameSigsRef.current[el.id] = sig;
        frameVersionsRef.current[el.id] = (frameVersionsRef.current[el.id] ?? 0) + 1;
      }
      const contentVersion = frameVersionsRef.current[el.id] ?? 0;
      const prev = framesObjectsRef.current[el.id];
      if (
        prev &&
        prev.id === baseSlide.id &&
        prev.name === baseSlide.name &&
        prev.x === baseSlide.x &&
        prev.y === baseSlide.y &&
        prev.width === baseSlide.width &&
        prev.height === baseSlide.height &&
        prev.contentVersion === contentVersion &&
        prev.renderSignature === sig
      ) {
        return prev;
      }
      changed = true;
      const slide: FrameSlide = { ...baseSlide, contentVersion, renderSignature: sig };
      framesObjectsRef.current[el.id] = slide;
      return slide;
    });
    if (!changed) {
      changed = next.some((s, i) => framesArrayRef.current[i]?.id !== s.id);
    }
    if (changed) {
      framesArrayRef.current = next;
    }
    return framesArrayRef.current;
    // PATCH-115: canvasLines is load-bearing. getSlideRenderSignature folds
    // CanvasLine state in via a []-deps ref-backed getter, so this dep is the
    // only trigger that recomputes renderSignature/contentVersion. Removing it
    // silently stops thumbnails refreshing on CanvasLine edits. Do not remove.
    // PATCH-128: postRenderRevision is additive -- it does not replace elements or
    // canvasLines as triggers, it adds metadata-only edits as a third one.
  }, [elements, canvasLines, postRenderRevision]);
  const contentPadlets = padlets.filter(p => p.type !== 'drawing' && p.type !== 'comment' && p.id !== masterPadlet?.id);

  const hasSavedViewportOnInit = useMemo(() => {
    const scrollX = initialAppState?.scrollX;
    const scrollY = initialAppState?.scrollY;
    const zoomValue =
      typeof initialAppState?.zoom === "number"
        ? initialAppState.zoom
        : initialAppState?.zoom?.value;

    const hasSavedViewport =
      Number.isFinite(scrollX) ||
      Number.isFinite(scrollY) ||
      Number.isFinite(zoomValue);

    return hasSavedViewport;
  }, [initialAppState]);

  useEffect(() => {
    setIsInitialViewportSettled(!hasSavedViewportOnInit);
  }, [hasSavedViewportOnInit, key]);

  useEffect(() => {
    if (!hasSavedViewportOnInit || isInitialViewportSettled || !excalidrawAPI) return;

    const expectedScrollX = initialAppState?.scrollX;
    const expectedScrollY = initialAppState?.scrollY;
    const expectedZoom =
      typeof initialAppState?.zoom === "number"
        ? initialAppState.zoom
        : initialAppState?.zoom?.value;

    let cancelled = false;
    let attempts = 0;
    let rafId = 0;

    const markSettled = () => {
      rafId = window.requestAnimationFrame(() => {
        if (!cancelled) {
          setIsInitialViewportSettled(true);
        }
      });
    };

    const hasExpectedViewport = () => {
      const latestAppState = excalidrawAPI.getAppState?.() || appStateRef.current;
      const latestZoom =
        typeof latestAppState?.zoom === "number"
          ? latestAppState.zoom
          : latestAppState?.zoom?.value;

      const scrollXMatches =
        !Number.isFinite(expectedScrollX) ||
        (Number.isFinite(latestAppState?.scrollX) && Math.abs(latestAppState.scrollX - expectedScrollX) <= 1);
      const scrollYMatches =
        !Number.isFinite(expectedScrollY) ||
        (Number.isFinite(latestAppState?.scrollY) && Math.abs(latestAppState.scrollY - expectedScrollY) <= 1);
      const zoomMatches =
        !Number.isFinite(expectedZoom) ||
        (Number.isFinite(latestZoom) && Math.abs(latestZoom - expectedZoom) <= 0.01);

      return scrollXMatches && scrollYMatches && zoomMatches;
    };

    const settleViewport = () => {
      if (cancelled) return;

      if (hasExpectedViewport() || attempts >= INITIAL_VIEWPORT_SETTLE_MAX_FRAMES) {
        markSettled();
        return;
      }

      attempts += 1;
      rafId = window.requestAnimationFrame(settleViewport);
    };

    rafId = window.requestAnimationFrame(settleViewport);

    return () => {
      cancelled = true;
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [appStateRef, excalidrawAPI, hasSavedViewportOnInit, initialAppState, isInitialViewportSettled]);

  const excalidrawInitialData = useMemo(() => ({
    elements: initialElements,
    appState: {
      ...initialAppState,
      viewBackgroundColor: "transparent",
      theme: "light",
      collaborators: new Map(),
    },
    files: initialFiles,
    scrollToContent: !hasSavedViewportOnInit,
    libraryItems: libraryItems,
  }), [hasSavedViewportOnInit, initialElements, initialAppState, initialFiles, libraryItems]);

  const handleInsertMermaid = useCallback((newElements: any[], newFiles?: any) => {
    if (!excalidrawAPI) return;

    const currentElements = excalidrawAPI.getSceneElements();

    // Ensure all elements, even ones we didn't explicitly position like bound text, have colors
    const applyFallbacks = (elements: any[]) => elements.map(el => ({
      ...el,
      backgroundColor: el.backgroundColor || "transparent",
      strokeColor: el.strokeColor || "#000000",
    }));

    const safeNewElements = applyFallbacks(newElements);

    // Position the new elements in the center of the viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const as = appStateRef.current;
    const zoom = as?.zoom?.value || 1;
    const scrollX = as?.scrollX || 0;
    const scrollY = as?.scrollY || 0;

    const centerX = (viewportWidth / 2 / zoom) - scrollX;
    const centerY = (viewportHeight / 2 / zoom) - scrollY;

    // Calculate bounding box of new elements to center them
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    safeNewElements.forEach(el => {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + (el.width || 0));
      maxY = Math.max(maxY, el.y + (el.height || 0));
    });

    const elCenterX = (minX + maxX) / 2;
    const elCenterY = (minY + maxY) / 2;

    const offsetX = centerX - elCenterX;
    const offsetY = centerY - elCenterY;

    const finalElements = safeNewElements.map(el => ({
      ...el,
      x: el.x + offsetX,
      y: el.y + offsetY,
    }));

    excalidrawAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: [...currentElements, ...finalElements],
        appState: {
          ...appStateRef.current,
          selectedElementIds: finalElements.reduce((acc: any, el: any) => ({ ...acc, [el.id]: true }), {}),
        },
        commitToHistory: true,
      }),
    });

    // Register image files so Excalidraw can render image-based diagrams
    if (newFiles) {
      excalidrawAPI.addFiles(Object.values(newFiles));
    }
  }, [excalidrawAPI]); // appState removed -- reads from ref at call time

  const applyZoom = useCallback((direction: 'in' | 'out' | 'reset') => {
    if (!excalidrawAPI) return;
    const latest = excalidrawAPI.getAppState?.() || appStateRef.current;
    const current = latest?.zoom?.value || 1;
    const nextZoom = direction === 'reset'
      ? 1
      : direction === 'in'
        ? Math.min(3, current + 0.1)
        : Math.max(0.1, current - 0.1);

    excalidrawAPI.updateScene({
      ...buildDrawingSceneUpdate({
        elements: excalidrawAPI.getSceneElements(),
        appState: {
          ...latest,
          zoom: { value: nextZoom },
        },
        commitToHistory: false,
      }),
    });
  }, [excalidrawAPI]); // appState removed -- reads from ref at call time

  const contextMenuOpenTargets = useMemo(() => {
    if (!contextMenu) return [] as Padlet[];
    const menuPadlet = contextMenu.padlet;
    const isContainer =
      menuPadlet.type === "container" ||
      !!(menuPadlet.metadata as any)?.isContainer ||
      Array.isArray((menuPadlet.metadata as any)?.childPadletIds);
    if (!isContainer) return [] as Padlet[];

    const childIds = ((menuPadlet.metadata as any)?.childPadletIds ?? []).map((id: any) => String(id));
    const byId = new Map(padlets.map((p) => [String(p.id), p]));
    const ordered = childIds
      .map((id: string) => byId.get(id))
      .filter((p: Padlet | undefined): p is Padlet => Boolean(p));
    const extras = padlets.filter(
      (p) => p.metadata?.parentId === menuPadlet.id && !childIds.includes(String(p.id))
    );
    return [...ordered, ...extras];
  }, [contextMenu, padlets]);

  const bridgedBackLineInteractiveTargetRef = useRef<Element | null>(null);
  const isDispatchingBackLineBridgeEventRef = useRef(false);

  const logBackLineBridgeDiagnostics = useCallback((params: {
    phase: string;
    event: Pick<MouseEvent, 'type' | 'button' | 'buttons' | 'clientX' | 'clientY' | 'target' | 'currentTarget'>;
    activeToolType?: string;
    guardPassed?: boolean | null;
    guardFailedReason?: string | null;
    backTargetResolutionAttempted?: boolean;
    backTargetFound?: boolean;
    foundTarget?: Element | null;
    bridgedTarget?: Element | null;
    extra?: Record<string, unknown>;
  }) => {
    if (!DEV_DRAWING_BRIDGE_DIAGNOSTICS) return;

    const target = params.event.target instanceof Element ? params.event.target : null;
    const currentTarget = params.event.currentTarget instanceof Element ? params.event.currentTarget : null;
    const embeddableOuter = target?.closest('.excalidraw__embeddable__outer') ?? null;
    const embeddableContainer = target?.closest('.excalidraw__embeddable-container') ?? null;
    const targetIsCanvas = target instanceof HTMLCanvasElement;
    const targetHasExcalidrawCanvasClass = target?.classList.contains('excalidraw__canvas') ?? false;
    const foundTarget = params.foundTarget ?? params.bridgedTarget ?? null;

    console.debug(DRAWING_BRIDGE_LOG_PREFIX, {
      phase: params.phase,
      eventType: params.event.type,
      activeToolType: params.activeToolType ?? null,
      button: params.event.button,
      buttons: params.event.buttons,
      targetTagName: target?.tagName ?? null,
      targetClassName: getElementClassNameForDiagnostics(target),
      targetDataset: getElementDatasetForDiagnostics(target),
      currentTargetTagName: currentTarget?.tagName ?? null,
      currentTargetClassName: getElementClassNameForDiagnostics(currentTarget),
      currentTargetDataset: getElementDatasetForDiagnostics(currentTarget),
      targetIsCanvas,
      targetHasExcalidrawCanvasClass,
      closestEmbeddableOuter: summarizeElementForDiagnostics(embeddableOuter),
      closestEmbeddableContainer: summarizeElementForDiagnostics(embeddableContainer),
      topStack: getElementsFromPointSummaryForDiagnostics(params.event.clientX, params.event.clientY),
      guardPassed: params.guardPassed ?? null,
      guardFailedReason: params.guardFailedReason ?? null,
      backTargetResolutionAttempted: params.backTargetResolutionAttempted ?? false,
      backTargetFound: params.backTargetFound ?? null,
      foundTargetLineId: foundTarget?.getAttribute('data-line-id') ?? null,
      foundTargetLineRole: foundTarget?.getAttribute('data-line-role') ?? null,
      foundTargetLineRenderer: foundTarget?.getAttribute('data-line-renderer') ?? null,
      ...params.extra,
    });
  }, []);

  const findBackLineInteractiveTargetAtPoint = useCallback((clientX: number, clientY: number, sourcePhase?: string) => {
    const stack = document.elementsFromPoint(clientX, clientY);
    let resolvedTarget: Element | null = null;

    for (const role of BACK_LINE_INTERACTIVE_ROLE_PRIORITY) {
      for (const node of stack) {
        if (!(node instanceof Element)) continue;
        if (node.getAttribute('data-line-renderer') !== 'back') continue;
        if (node.getAttribute('data-line-role') !== role) continue;
        resolvedTarget = node;
        break;
      }
      if (resolvedTarget) break;
    }

    if (DEV_DRAWING_BRIDGE_DIAGNOSTICS) {
      console.debug(DRAWING_BRIDGE_LOG_PREFIX, {
        phase: sourcePhase ?? 'target-lookup',
        eventType: 'target-lookup',
        backTargetResolutionAttempted: true,
        backTargetFound: Boolean(resolvedTarget),
        foundTargetLineId: resolvedTarget?.getAttribute('data-line-id') ?? null,
        foundTargetLineRole: resolvedTarget?.getAttribute('data-line-role') ?? null,
        foundTargetLineRenderer: resolvedTarget?.getAttribute('data-line-renderer') ?? null,
        topStack: stack.slice(0, 8).map((node) => ({
          tagName: node.tagName,
          className: getElementClassNameForDiagnostics(node),
          lineId: node.getAttribute('data-line-id'),
          lineRole: node.getAttribute('data-line-role'),
          lineRenderer: node.getAttribute('data-line-renderer'),
        })),
      });
    }

    return resolvedTarget;
  }, []);

  const handleBackLineBridgeMouseDownCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const activeToolType = appStateRef.current?.activeTool?.type ?? 'selection';

    if (isDispatchingBackLineBridgeEventRef.current) {
      logBackLineBridgeDiagnostics({
        phase: 'mouse-down-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'reentrant-bridge-guard',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    bridgedBackLineInteractiveTargetRef.current = null;

    if (activeToolType !== 'selection') {
      logBackLineBridgeDiagnostics({
        phase: 'mouse-down-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'missing-selection-tool',
        backTargetResolutionAttempted: false,
      });
      return;
    }
    if (event.button !== 0) {
      logBackLineBridgeDiagnostics({
        phase: 'mouse-down-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'non-left-button',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!(target instanceof HTMLCanvasElement)) {
      logBackLineBridgeDiagnostics({
        phase: 'mouse-down-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-not-canvas',
        backTargetResolutionAttempted: false,
      });
      return;
    }
    if (!target.classList.contains('excalidraw__canvas')) {
      logBackLineBridgeDiagnostics({
        phase: 'mouse-down-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-missing-excalidraw-canvas-class',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const interactiveTarget = findBackLineInteractiveTargetAtPoint(event.clientX, event.clientY, 'mouse-down-capture:target-lookup');

    if (!interactiveTarget) {
      logBackLineBridgeDiagnostics({
        phase: 'mouse-down-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'no-back-line-target-found',
        backTargetResolutionAttempted: true,
        backTargetFound: false,
      });
      return;
    }

    logBackLineBridgeDiagnostics({
      phase: 'mouse-down-capture',
      event,
      activeToolType,
      guardPassed: true,
      guardFailedReason: null,
      backTargetResolutionAttempted: true,
      backTargetFound: true,
      foundTarget: interactiveTarget,
    });

    bridgedBackLineInteractiveTargetRef.current = interactiveTarget;
    event.preventDefault();
    event.stopPropagation();

    isDispatchingBackLineBridgeEventRef.current = true;
    try {
      interactiveTarget.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    } finally {
      isDispatchingBackLineBridgeEventRef.current = false;
    }
  }, [appStateRef, findBackLineInteractiveTargetAtPoint]);

  const handleBackLineBridgeClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const activeToolType = appStateRef.current?.activeTool?.type ?? 'selection';

    if (isDispatchingBackLineBridgeEventRef.current) {
      logBackLineBridgeDiagnostics({
        phase: 'click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'reentrant-bridge-guard',
        backTargetResolutionAttempted: false,
      });
      return;
    }
    if (event.button !== 0) {
      logBackLineBridgeDiagnostics({
        phase: 'click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'non-left-button',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const bridgedTarget = bridgedBackLineInteractiveTargetRef.current;
    bridgedBackLineInteractiveTargetRef.current = null;

    if (!bridgedTarget) {
      logBackLineBridgeDiagnostics({
        phase: 'click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'missing-bridged-target',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!(target instanceof HTMLCanvasElement)) {
      logBackLineBridgeDiagnostics({
        phase: 'click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-not-canvas',
        backTargetResolutionAttempted: false,
        bridgedTarget,
      });
      return;
    }
    if (!target.classList.contains('excalidraw__canvas')) {
      logBackLineBridgeDiagnostics({
        phase: 'click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-missing-excalidraw-canvas-class',
        backTargetResolutionAttempted: false,
        bridgedTarget,
      });
      return;
    }

    logBackLineBridgeDiagnostics({
      phase: 'click-capture',
      event,
      activeToolType,
      guardPassed: true,
      guardFailedReason: null,
      backTargetResolutionAttempted: false,
      backTargetFound: true,
      bridgedTarget,
    });

    event.preventDefault();
    event.stopPropagation();

    isDispatchingBackLineBridgeEventRef.current = true;
    try {
      bridgedTarget.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    } finally {
      isDispatchingBackLineBridgeEventRef.current = false;
    }
  }, [appStateRef, logBackLineBridgeDiagnostics]);

  const handleBackLineBridgeDoubleClickCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const activeToolType = appStateRef.current?.activeTool?.type ?? 'selection';

    if (isDispatchingBackLineBridgeEventRef.current) {
      logBackLineBridgeDiagnostics({
        phase: 'double-click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'reentrant-bridge-guard',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    if (activeToolType !== 'selection') {
      logBackLineBridgeDiagnostics({
        phase: 'double-click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'missing-selection-tool',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!(target instanceof HTMLCanvasElement)) {
      logBackLineBridgeDiagnostics({
        phase: 'double-click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-not-canvas',
        backTargetResolutionAttempted: false,
      });
      return;
    }
    if (!target.classList.contains('excalidraw__canvas')) {
      logBackLineBridgeDiagnostics({
        phase: 'double-click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-missing-excalidraw-canvas-class',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const interactiveTarget = findBackLineInteractiveTargetAtPoint(event.clientX, event.clientY, 'double-click-capture:target-lookup');

    if (!interactiveTarget) {
      logBackLineBridgeDiagnostics({
        phase: 'double-click-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'no-back-line-target-found',
        backTargetResolutionAttempted: true,
        backTargetFound: false,
      });
      return;
    }

    logBackLineBridgeDiagnostics({
      phase: 'double-click-capture',
      event,
      activeToolType,
      guardPassed: true,
      guardFailedReason: null,
      backTargetResolutionAttempted: true,
      backTargetFound: true,
      foundTarget: interactiveTarget,
    });

    event.preventDefault();
    event.stopPropagation();

    isDispatchingBackLineBridgeEventRef.current = true;
    try {
      interactiveTarget.dispatchEvent(new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    } finally {
      isDispatchingBackLineBridgeEventRef.current = false;
    }
  }, [appStateRef, findBackLineInteractiveTargetAtPoint, logBackLineBridgeDiagnostics]);

  const handleBackLineBridgePointerDownCapture = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    logBackLineBridgeDiagnostics({
      phase: 'pointer-down-capture',
      event,
      activeToolType: appStateRef.current?.activeTool?.type ?? 'selection',
      guardPassed: null,
      guardFailedReason: null,
      backTargetResolutionAttempted: false,
    });
  }, [appStateRef, logBackLineBridgeDiagnostics]);

  const resolveBackLineContextMenuDispatchTarget = useCallback((interactiveTarget: Element) => {
    const interactiveRole = interactiveTarget.getAttribute('data-line-role');
    if (interactiveRole !== 'midpoint-handle' && interactiveRole !== 'point-handle') {
      return interactiveTarget;
    }

    const lineId = interactiveTarget.getAttribute('data-line-id');
    if (!lineId) {
      return interactiveTarget;
    }

    const sameLineHitPath = document.querySelector(
      `[data-line-id="${CSS.escape(lineId)}"][data-line-role="hit-path"][data-line-renderer="back"]`,
    );
    return sameLineHitPath ?? interactiveTarget;
  }, []);

  const handleBackLineBridgeContextMenuCapture = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const activeToolType = appStateRef.current?.activeTool?.type ?? 'selection';

    if (isDispatchingBackLineBridgeEventRef.current) {
      logBackLineBridgeDiagnostics({
        phase: 'contextmenu-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'reentrant-bridge-guard',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    if (activeToolType !== 'selection') {
      logBackLineBridgeDiagnostics({
        phase: 'contextmenu-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'missing-selection-tool',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    if (!(target instanceof HTMLCanvasElement)) {
      logBackLineBridgeDiagnostics({
        phase: 'contextmenu-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-not-canvas',
        backTargetResolutionAttempted: false,
      });
      return;
    }
    if (!target.classList.contains('excalidraw__canvas')) {
      logBackLineBridgeDiagnostics({
        phase: 'contextmenu-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'target-missing-excalidraw-canvas-class',
        backTargetResolutionAttempted: false,
      });
      return;
    }

    const interactiveTarget = findBackLineInteractiveTargetAtPoint(event.clientX, event.clientY, 'contextmenu-capture:target-lookup');

    if (!interactiveTarget) {
      logBackLineBridgeDiagnostics({
        phase: 'contextmenu-capture',
        event,
        activeToolType,
        guardPassed: false,
        guardFailedReason: 'no-back-line-target-found',
        backTargetResolutionAttempted: true,
        backTargetFound: false,
      });
      return;
    }

    const dispatchTarget = resolveBackLineContextMenuDispatchTarget(interactiveTarget);

    logBackLineBridgeDiagnostics({
      phase: 'contextmenu-capture',
      event,
      activeToolType,
      guardPassed: true,
      guardFailedReason: null,
      backTargetResolutionAttempted: true,
      backTargetFound: true,
      foundTarget: interactiveTarget,
      extra: {
        normalizedDispatchTargetLineId: dispatchTarget.getAttribute('data-line-id') ?? null,
        normalizedDispatchTargetLineRole: dispatchTarget.getAttribute('data-line-role') ?? null,
        normalizedDispatchTargetLineRenderer: dispatchTarget.getAttribute('data-line-renderer') ?? null,
      },
    });

    bridgedBackLineInteractiveTargetRef.current = null;
    event.preventDefault();
    event.stopPropagation();

    isDispatchingBackLineBridgeEventRef.current = true;
    try {
      dispatchTarget.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: event.clientX,
        clientY: event.clientY,
        button: event.button,
        buttons: event.buttons,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      }));
    } finally {
      isDispatchingBackLineBridgeEventRef.current = false;
    }
  }, [appStateRef, findBackLineInteractiveTargetAtPoint, resolveBackLineContextMenuDispatchTarget]);

  if (isInitializing) {
    return <div className="flex-1 flex items-center justify-center p-8 text-gray-500">Initializing drawing canvas...</div>;
  }

  const topFloatingToolbar = !readOnly ? (
      <div
        ref={topFloatingToolbarRef}
        className="absolute top-4 z-[130] pointer-events-none"
        style={{
          left: rightClusterLeftPx !== null ? `${rightClusterLeftPx}px` : undefined,
          opacity: rightClusterLeftPx !== null ? 1 : 0,
        }}
      >
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 flex items-center p-1 gap-1 pointer-events-auto">
        <button
          onClick={() => setActiveTool(activeTool === 'comment' ? 'select' : 'comment')}
          className={`p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium ${activeTool === 'comment' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          title="Add Comment"
        >
          <MessageSquarePlus size={18} />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          onClick={() => setActiveTool(activeTool === 'library' ? 'select' : 'library')}
          className={`p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium ${activeTool === 'library' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          title="Open Library"
        >
          <Library size={18} />
        </button>

        <button
          onClick={() => setActiveTool(activeTool === 'present' ? 'select' : 'present')}
          className={`p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium ${activeTool === 'present' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          title="Present Frames"
        >
          <MonitorPlay size={18} />
        </button>

        <div className="w-px h-6 bg-gray-200 mx-1" />

        <button
          onClick={() => setMermaidModalOpen(true)}
          className="p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-medium hover:bg-gray-100 text-gray-700"
          title="Insert Mermaid Diagram"
        >
          <Workflow size={18} />
        </button>
      </div>
    </div>
  ) : null;

  return (
    <SectionHeadingDrawingContext.Provider value={sectionHeadingContextValue}>
    <div

      className="flex-1 w-full h-full absolute inset-0 bg-transparent"
      onPointerDownCapture={handleBackLineBridgePointerDownCapture}
      onMouseDownCapture={handleBackLineBridgeMouseDownCapture}
      onClickCapture={handleBackLineBridgeClickCapture}
      onDoubleClickCapture={handleBackLineBridgeDoubleClickCapture}
      onContextMenuCapture={handleBackLineBridgeContextMenuCapture}

    >
      <div
        ref={drawingRootRef}
        style={{
          width: '100%',
          height: '100%',
          visibility: isInitialViewportSettled ? 'visible' : 'hidden',
        }}
        // PATCH SECTION-H3C: blank-canvas click deselects a selected Section
        // Heading -- the SAME mechanism as Freeform's viewport blank-click
        // deselect. A click landing ON a heading never reaches here because
        // SectionHeadingPost's own onClick already stops propagation
        // (SECTION-H3B.1, unchanged); a click on raw Excalidraw canvas does.
        onClick={() => setSelectedSectionHeadingId(null)}
      >
        <ExcalidrawWrapper
          excalidrawAPI={(api) => { setExcalidrawAPI(api); excalidrawAPIRef.current = api; if (drawingExcalidrawAPIRef) drawingExcalidrawAPIRef.current = api; }}
          excalidrawKey={key}
          initialData={excalidrawInitialData}
          onChange={handleChange}
          readOnly={readOnly}
          onShowHelp={() => { }}
          onImportScene={readOnly ? undefined : handleImportedSceneReady}
          renderEmbeddable={renderEmbeddable}
          validateEmbeddable={(link: string) => link.startsWith('padlet://')}
          useCollabBoardContextMenu
        />
      </div>

      {pendingImportedScene && !readOnly && (
        <div className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-gray-900">Import drawing</h2>
            <p className="mt-2 text-sm text-gray-600">
              Choose how to apply the imported drawing.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => handleImportScene('add')}
                disabled={isImportingScene}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Add to current drawing
              </button>
              <button
                type="button"
                onClick={handleCancelImportedScene}
                disabled={isImportingScene}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleImportScene('replace')}
                disabled={isImportingScene}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isImportingScene ? 'Importing...' : 'Replace current drawing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Floating Toolbar (Pro Features) */}
      {isInitialViewportSettled && (rightClusterAnchorEl ?? drawingRootRef.current)
        ? createPortal(topFloatingToolbar, rightClusterAnchorEl ?? drawingRootRef.current!)
        : null}

      {isInitialViewportSettled && viewportContainerRef?.current ? createPortal(
        <ZoomControls
          canvasZoom={zoomPercent / 100}
          handleZoomOut={() => applyZoom('out')}
          handleZoomReset={() => applyZoom('reset')}
          handleZoomIn={() => applyZoom('in')}
          className="absolute bottom-6 right-[var(--drawing-zoom-controls-right,1.5rem)] z-[130] flex items-center bg-white rounded-lg shadow-md border border-gray-200 pointer-events-auto"
        />,
        viewportContainerRef.current
      ) : null}

      {/* Overlay for catching clicks when in comment mode */}
      {activeTool === 'comment' && (
        <div
          className="absolute inset-0 z-40 cursor-crosshair"
          onClick={(e) => {
            e.stopPropagation();
            const as = appStateRef.current;
            if (!as) return;

            // Calculate canvas coordinates based on screen click
            const rect = e.currentTarget.getBoundingClientRect();
            const clientX = e.clientX - rect.left;
            const clientY = e.clientY - rect.top;

            const zoom = as.zoom?.value || 1;
            const scrollX = as.scrollX || 0;
            const scrollY = as.scrollY || 0;

            const canvasX = (clientX / zoom) - scrollX;
            const canvasY = (clientY / zoom) - scrollY;

            // Create the new comment padlet
            onAddPadlet({
              board_id: canvasId,
              type: 'comment',
              title: 'New Comment',
              content: '',
              position_x: canvasX,
              position_y: canvasY,
              width: 320,
              height: 200,
            });

            // Revert tool back to select
            setActiveTool('select');
          }}
        >
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm font-medium flex items-center gap-2">
            Click anywhere on the canvas to place a comment pin
            <button
              onClick={(e) => { e.stopPropagation(); setActiveTool('select'); }}
              className="p-1 hover:bg-blue-700 rounded-full"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Ghost draft — draggable card for "Add to Existing" container flow */}
      {ghostDraft && excalidrawAPI && (() => {
        // Position ghost draft in the exact center of the current screen to ensure it's always visible and grabbable
        const rect = document.body.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;

        // Subtract half the card's estimated width/height to truly center it
        const left = centerX - 100;
        const top = centerY - 50;

        return (
          <div
            className="absolute z-50 cursor-grab opacity-100 shadow-2xl pointer-events-auto"
            style={{ left, top }}
            draggable
            onDragStart={(e) =>
              e.dataTransfer.setData('application/collabboard-library', JSON.stringify(ghostDraft))
            }
            onDragEnd={() => onGhostDraftDropped?.()}
          >
            <div className="bg-white rounded-xl border-2 border-blue-500 p-3 min-w-[200px]">
              <div className="text-sm font-semibold text-gray-700">
                {(ghostDraft as any).title || 'New Post'}
              </div>
              <div className="text-xs text-blue-500 mt-1">Drop into a container</div>
            </div>
          </div>
        );
      })()}

      {/* Library Panel Feature */}
      <LibraryPanel
        isOpen={activeTool === 'library'}
        onClose={() => setActiveTool('select')}
        onSelect={async (item) => {
          const as = appStateRef.current;
          if (!as) return;
          // Add to center of current view
          const rect = document.body.getBoundingClientRect();
          const zoom = as.zoom?.value || 1;
          const scrollX = as.scrollX || 0;
          const scrollY = as.scrollY || 0;

          const centerClientX = rect.width / 2;
          const centerClientY = rect.height / 2;

          const canvasX = (centerClientX / zoom) - scrollX;
          const canvasY = (centerClientY / zoom) - scrollY;

          // item is LibraryItem; the actual padlet fields live in item.content (LibraryItemContent)
          const c = (item.content || {}) as any;
          const { parentId: _p2, childPadletIds: _c2, ...cleanMeta2 } = c.metadata || {};
          await onAddPadlet({
            board_id: canvasId,
            type: (c.type || item.type || 'note') as Padlet['type'],
            title: c.title || item.title || 'Library Item',
            content: typeof c.content === 'string' ? c.content : (c.content != null ? JSON.stringify(c.content) : ''),
            file_url: c.file_url || c.metadata?.imageUrl || undefined,
            position_x: canvasX,
            position_y: canvasY,
            width: c.width || 320,
            height: c.height || 280,
            metadata: { ...cleanMeta2, forceContainerPrompt: true },
          });
          setActiveTool('select');
        }}
      />

      {/* Invisible drop target over Excalidraw for library items */}
      <div
        className="absolute inset-0 pointer-events-none z-30"
        onDragOver={(e) => {
          if (
            e.dataTransfer.types.includes('application/collabboard-library') ||
            e.dataTransfer.types.includes('application/collabboard-svg')
          ) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={async (e) => {
          const as = appStateRef.current;
          const libData = e.dataTransfer.getData('application/collabboard-library');
          const svgData = e.dataTransfer.getData('application/collabboard-svg');
          if (!as || (!libData && !svgData)) return;
          e.preventDefault();
          e.stopPropagation();
          // Close library panel so PlacementPrompt is not hidden behind it
          setActiveTool('select');

          const rect = e.currentTarget.getBoundingClientRect();
          const clientX = e.clientX - rect.left;
          const clientY = e.clientY - rect.top;
          const zoom = as.zoom?.value || 1;
          const scrollX = as.scrollX || 0;
          const scrollY = as.scrollY || 0;
          const canvasX = (clientX / zoom) - scrollX;
          const canvasY = (clientY / zoom) - scrollY;

          if (libData) {
            const item = JSON.parse(libData);
            // Strip parentId/childPadletIds so the PlacementPrompt always shows
            const { parentId: _p, childPadletIds: _c, ...cleanMeta } = item.metadata || {};
            await onAddPadlet({
              board_id: canvasId,
              type: (item.type || item.kind || 'note') as any,
              title: item.title || 'Library Item',
              content: typeof item.content === 'string'
                ? item.content
                : (item.content != null ? JSON.stringify(item.content) : ''),
              file_url: item.file_url || item.metadata?.imageUrl || item.metadata?.file_url || undefined,
              position_x: canvasX,
              position_y: canvasY,
              width: item.width || 320,
              height: item.height || 280,
              metadata: { ...cleanMeta, forceContainerPrompt: true },
            });
          } else if (svgData) {
            const svg = JSON.parse(svgData);
            await onAddPadlet({
              board_id: canvasId,
              type: 'image' as any,
              title: svg.title || 'Clipart',
              content: '',
              file_url: svg.svgUrl,
              position_x: canvasX,
              position_y: canvasY,
              width: 200,
              height: 200,
              metadata: { imageUrl: svg.svgUrl, source: svg.source, forceContainerPrompt: true } as any,
            });
          }
        }}
        style={{ pointerEvents: activeTool === 'library' ? 'auto' : 'none' }}
      />

      {/* Presentation Sidebar */}
      {activeTool === 'present' && (
        <div ref={presentationSidebarRef} className="fixed top-0 right-0 bottom-0 w-80 z-[500] pointer-events-auto shadow-2xl border-l border-gray-200">
          <PresentationPanel
            slides={frames}
            activeSlideId={activeSlideId}
            onActivateSlide={handleActivateSlide}
            onClose={() => setActiveTool('select')}
            renderSlideToPNG={renderSlideToPNG}
            thumbnail={{ width: 240, height: 160 }}
            accentClassName="text-violet-600"
            onAddSlide={handleAddSlide}
            onAddSlideBelow={handleAddSlideBelow}
            onDuplicateSlide={handleDuplicateSlide}
            onRemoveSlide={handleRemoveSlide}
            onRenameSlide={handleRenameSlide}
            onArrangeLayout={handleArrangeLayout}
            onStartPresentation={handleStartPresentation}
          />
        </div>
      )}

      {/* Fullscreen Presentation Overlay */}
      {presentationActive && (
        <FullscreenPresentation
          slides={frames}
          startSlideId={presentationStartId}
          renderSlideToPNG={renderSlideToPNG}
          onClose={() => setPresentationActive(false)}
          contentPadlets={contentPadlets}
          runtimeHelpers={runtimeSlideHelpers}
        />
      )}

      {/* Canvas context menu — backdrop closes menu on outside click, menu sits above it */}
      {contextMenu && (
        <div
          className="fixed inset-0 z-[9998]"
          onMouseDown={() => setContextMenu(null)}
        />
      )}
      {contextMenu && (
        <CanvasContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          padlet={contextMenu.padlet}
          openTargets={contextMenuOpenTargets}
          onOpenTarget={(p) => { onPadletEdit?.(p); setContextMenu(null); }}
          getOpenTargetLabel={getContainerEditTargetLabel}
          hasPaste={!!clipboard}
          onEdit={(p) => { onPadletEdit?.(p); setContextMenu(null); }}
          onEditPadletAsPost={onEditPadletAsPost ? (p) => { onEditPadletAsPost(p); setContextMenu(null); } : undefined}
          onCut={(p) => { handleCutPadlet(p); setContextMenu(null); }}
          onCopy={(p) => { handleCopyPadlet(p); setContextMenu(null); }}
          onPaste={(sx, sy) => { handlePastePadlet(sx, sy); setContextMenu(null); }}
          onDuplicate={(p) => { handleDuplicatePadlet(p); setContextMenu(null); }}
          onDelete={onDeletePadlet ? (p) => { handleDeletePadlet(p); setContextMenu(null); } : undefined}
          onSendToBack={(p) => { if (isSectionHeading(p)) { void moveSectionHeadingZOrder(p, 'sendToBack'); } else { handleSendToBack(p); } setContextMenu(null); }}
          onSendBackward={(p) => { handleSendBackward(p); setContextMenu(null); }}
          onBringForward={(p) => { handleBringForward(p); setContextMenu(null); }}
          onBringToFront={(p) => { if (isSectionHeading(p)) { void moveSectionHeadingZOrder(p, 'bringToFront'); } else { handleBringToFront(p); } setContextMenu(null); }}
          onCopyAsPNG={(p) => { handleCopyAsPNG(p); setContextMenu(null); }}
          onExportAsPNG={(p) => { handleExportAsPNG(p); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* PATCH SECTION-H3C: the SAME SectionHeadingToolbar Freeform uses,
          rendered once here (not per-heading) and anchored to whichever
          heading is currently selected -- identical pattern to
          FreeformPadletCards' own single toolbar instance. A sibling of
          drawingRootRef's div, so it can never trip that div's blank-click
          deselect handler regardless of its own internal isolation. */}
      {!readOnly && selectedSectionHeadingId && (() => {
        const selectedHeading = paddletsRef.current.find((p) => p.id === selectedSectionHeadingId);
        if (!selectedHeading || !isSectionHeading(selectedHeading)) return null;
        const headingElement = sectionHeadingElsRef.current.get(selectedSectionHeadingId) ?? null;
        return (
          <SectionHeadingToolbar
            padlet={selectedHeading}
            headingElement={headingElement}
            viewportRevision={sectionHeadingViewportRevision}
            onChangeLevel={(padletId, level: SectionHeadingLevel) => {
              void onUpdatePadlet(padletId, {
                metadata: { ...selectedHeading.metadata, headingLevel: level },
                height: getSectionHeadingHeight(level),
              });
            }}
            onChangeTextStyle={(padletId, style: Partial<CaptionStyle>) => {
              void onUpdatePadlet(padletId, {
                metadata: { ...selectedHeading.metadata, titleStyle: { ...(selectedHeading.metadata as any)?.titleStyle, ...style } },
              });
            }}
            onChangeColor={(padletId, target: SectionHeadingColorTarget, color: string) => {
              const key = target === 'text' ? 'textColor' : target === 'background' ? 'backgroundColor' : 'accentColor';
              void onUpdatePadlet(padletId, {
                metadata: { ...selectedHeading.metadata, [key]: color },
              });
            }}
          />
        );
      })()}

      {/* Custom Mermaid Modal */}
      <CustomMermaidModal
        isOpen={mermaidModalOpen}
        onClose={() => setMermaidModalOpen(false)}
        onInsert={handleInsertMermaid}
      />
    </div>
    </SectionHeadingDrawingContext.Provider>
  );
}
