"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import type { Padlet } from '@/types/collabboard';
import dynamic from 'next/dynamic';
import { getExcalidrawLibrary } from '@/lib/collabboard/excalidrawLibrary';
import LibraryPanel from '@/components/collabboard/LibraryPanel';
import PostCardContent from '@/components/collabboard/PostCardContent';
import EmbeddedCommentList from '@/components/collabboard/EmbeddedCommentList';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';
import ZoomControls from '@/components/collabboard/canvas/ui/ZoomControls';
import { PresentationPanel } from '@/components/presentation/PresentationPanel';
import { FullscreenPresentation, type RuntimeSlideHelpers } from '@/components/presentation/FullscreenPresentation';
import type { FrameSlide, RenderSlideOptions } from '@/components/presentation/PresentationPanel';
import { createSlideRenderer } from '@/components/presentation/slide-renderer/createSlideRenderer';
import { CanvasContextMenu } from '@/components/collabboard/canvas/ui/CanvasContextMenu';
import { useCanvasActions } from '@/components/collabboard/canvas/hooks/useCanvasActions';
import { MessageSquarePlus, Library, MonitorPlay, X, Workflow, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { contrastIconColor } from '@/components/collabboard/shells/CardShell';
import CustomMermaidModal from './CustomMermaidModal';

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
  onDropExistingPadlet?: (containerId: string, droppedId: string) => void;
  onDropDraftIntoContainer?: (containerId: string, draftPayload: any) => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments?: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
  onScanChild?: () => void;
  isExpanded?: boolean;
  onExpandAvailabilityChange?: (available: boolean) => void;
};
function AutoHeightContainer({ padlet, allPadlets, onNaturalHeight, onDropExistingPadlet, onDropDraftIntoContainer, currentUserId, currentUserName, currentUserAvatar, onUpdateChildComments, onScanChild, isExpanded, onExpandAvailabilityChange }: AutoHeightContainerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const cbRef = useRef(onNaturalHeight);
  cbRef.current = onNaturalHeight;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    cbRef.current(el.scrollHeight);
    const ro = new ResizeObserver(() => cbRef.current(el.scrollHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref}>
      <RowColumnContainerCard
        padlet={padlet}
        allPadlets={allPadlets}
        showHeader={false}
        isExpanded={isExpanded}
        canvasContext="drawing"
        onDropExistingPadlet={onDropExistingPadlet}
        onDropDraftIntoContainer={onDropDraftIntoContainer}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserAvatar={currentUserAvatar}
        onUpdateChildComments={onUpdateChildComments}
        onScanChild={onScanChild}
        onExpandAvailabilityChange={onExpandAvailabilityChange}
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
const BACK_LINE_INTERACTIVE_ROLE_PRIORITY = [
  'point-handle',
  'midpoint-handle',
  'start-handle',
  'control-handle',
  'end-handle',
  'label-handle',
  'hit-path',
] as const;

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

type DrawingEmbeddableCardProps = {
  padlet: Padlet;
  allPadlets: Padlet[];
  readOnly: boolean;
  excalidrawAPIRef: React.RefObject<any>;
  appStateRef: React.RefObject<any>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onAddPadlet: (postData: Partial<Padlet>) => Promise<Padlet | null>;
  canvasId: string;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  onUpdateChildComments: (childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => void;
  fetchData?: () => void;
  onContextMenu: (e: React.MouseEvent, padlet: Padlet) => void;
  onPadletEditRef: React.RefObject<((padlet: Padlet) => void) | undefined>;
  onBeforePadletEdit?: () => void;
  onDragEnd?: (padletId: string, x: number, y: number) => void;
  onNaturalResize?: (padletId: string, height: number) => void;
};

function DrawingEmbeddableCard({
  padlet,
  allPadlets,
  readOnly,
  excalidrawAPIRef,
  appStateRef,
  onUpdatePadlet,
  onAddPadlet,
  canvasId,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  onUpdateChildComments,
  fetchData,
  onContextMenu,
  onPadletEditRef,
  onBeforePadletEdit,
  onDragEnd,
  onNaturalResize,
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
        try {
          const libData = JSON.parse(libPayload);
          const _as = appStateRef.current;
          const _zoom = _as?.zoom?.value || 1;
          const _centerX = (window.innerWidth / 2 / _zoom) - (_as?.scrollX || 0);
          const _centerY = (window.innerHeight / 2 / _zoom) - (_as?.scrollY || 0);
          const created = await onAddPadlet({
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
          if (created) {
            const container = allPadlets.find(p => p.id === padlet.id);
            const kids = (container?.metadata as any)?.childPadletIds ?? [];
            await onUpdatePadlet(padlet.id, {
              metadata: { ...(container?.metadata as any), childPadletIds: [...kids, created.id] }
            });
          }
        } catch { /* silent */ }
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

            const updatedSceneEl = { ...sceneEl, x: newX, y: newY };

            excAPI.updateScene({
              elements: excAPI.getSceneElements().map((el2: any) =>
                el2.id === sceneEl.id ? updatedSceneEl : el2
              ),
              commitToHistory: false,
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
            const updatedSceneEl = { ...sceneEl, x: newX, y: newY };

            excAPI.updateScene({
              elements: excAPI.getSceneElements().map((el2: any) =>
                el2.id === sceneEl.id ? updatedSceneEl : el2
              ),
              commitToHistory: true,
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
            onScanChild={fetchData}
            onExpandAvailabilityChange={setCanExpand}
            onNaturalHeight={(h) => {
              const stripH = 28;
              const newHeight = Math.max(stripH + 20 + h, 80); // p-2 (16px) + 2px border + 2px buffer
              const excAPI = excalidrawAPIRef.current;
              if (!excAPI) return;
              const existing = excAPI.getSceneElements().find(
                (el: any) => el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
              );
              if (!existing || Math.abs(existing.height - newHeight) < 1) return;
              excAPI.updateScene({
                elements: excAPI.getSceneElements().map((el: any) =>
                  el.type === 'embeddable' && el.link === `padlet://${padlet.id}` && !el.isDeleted
                    ? { ...el, height: newHeight }
                    : el
                ),
                commitToHistory: false,
              });
              onNaturalResize?.(padlet.id, newHeight);
            }}
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
              const created = await onAddPadlet({
                ...draftPayload,
                board_id: canvasId,
                position_x: draftPayload.position_x ?? _centerX2,
                position_y: draftPayload.position_y ?? _centerY2,
                metadata: {
                  ...draftPayload.metadata,
                  parentId: containerId
                }
              });
              if (created) {
                const container = allPadlets.find(p => p.id === containerId);
                if (!container) return;
                const currentChildren = container.metadata?.childPadletIds || [];
                await onUpdatePadlet(containerId, {
                  metadata: {
                    ...container.metadata,
                    childPadletIds: [...currentChildren, created.id]
                  }
                });
              }
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
                onSubmit={(text) => {
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
                }}
                onEditComment={(commentId, newText) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.map((c: any) =>
                    c.id === commentId ? { ...c, text: newText } : c
                  ), { field: 'comments' });
                }}
                onRemoveComment={(commentId) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.filter((c: any) => c.id !== commentId), { field: 'comments' });
                }}
                onToggleStrikethrough={(commentId) => {
                  const existing = (padlet.metadata as any)?.comments || [];
                  onUpdateChildComments(padlet.id, existing.map((c: any) =>
                    c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                  ), { field: 'comments' });
                }}
              />
            );
          }
          return <PostCardContent padlet={padlet} onScan={fetchData} canvasContext="drawing" />;
        })()}
      </div>
    </div>
  );
}

interface DrawingLayoutProps {
  canvasId: string;
  padlets: Padlet[];
  padletsLoaded?: boolean;
  onAddPadlet: (postData: Partial<Padlet>) => Promise<Padlet | null>;
  onUpdatePadlet: (id: string, updates: Partial<Padlet>) => Promise<void>;
  onDeletePadlet?: (id: string) => Promise<void>;
  onPadletEdit?: (padlet: Padlet) => void;
  onEditPadletAsPost?: (padlet: Padlet) => void;
  readOnly?: boolean;
  fetchData?: () => void;
  ghostDraft?: Partial<Padlet> | null;
  onGhostDraftDropped?: () => void;
  currentUserId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
  viewportContainerRef?: React.RefObject<HTMLDivElement | null>;
  drawingAppStateRef?: React.RefObject<any>;
  drawingExcalidrawAPIRef?: React.RefObject<any>;
}

export default function DrawingLayout({
  canvasId,
  padlets,
  padletsLoaded = false,
  onAddPadlet,
  onUpdatePadlet,
  onDeletePadlet,
  onPadletEdit,
  onEditPadletAsPost,
  readOnly = false,
  fetchData,
  ghostDraft,
  onGhostDraftDropped,
  currentUserId,
  currentUserName,
  currentUserAvatar,
  viewportContainerRef,
  drawingAppStateRef,
  drawingExcalidrawAPIRef,
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

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const dirtyDataRef = useRef<{ elements: any[], appState: any, files: any } | null>(null);
  // Per-frame content version tracking: increments when elements inside a frame change
  const frameVersionsRef = useRef<Record<string, number>>({});
  const frameSigsRef = useRef<Record<string, string>>({});
  const initializedRef = useRef(false);
  const drawingRootRef = useRef<HTMLDivElement | null>(null);
  const topFloatingToolbarRef = useRef<HTMLDivElement | null>(null);
  const presentationSidebarRef = useRef<HTMLDivElement | null>(null);
  const paddletsRef = useRef<Padlet[]>(padlets);
  // Track active element count to avoid O(N) reduce on every Excalidraw onChange (60fps during drag)
  const activeElementCountRef = useRef(0);
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
  const recentlyNaturalResizedRef = useRef<Map<string, number>>(new Map());
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
  const [activeTool, setActiveTool] = useState<'select' | 'comment' | 'library' | 'present' | 'group'>('select');
  const [excalidrawAPI, setExcalidrawAPI] = useState<any>(null);
  const [isInitialViewportSettled, setIsInitialViewportSettled] = useState(true);
  // Ref so renderEmbeddable can read the API without recreating on every API change
  const excalidrawAPIRef = useRef<any>(null);
  // Ref so renderEmbeddable can call onPadletEdit without adding it to deps
  const onPadletEditRef = useRef(onPadletEdit);
  useEffect(() => { onPadletEditRef.current = onPadletEdit; }, [onPadletEdit]);
  const [activeSlideId, setActiveSlideId] = useState<string | null>(null);
  const [presentationActive, setPresentationActive] = useState(false);
  const [presentationStartId, setPresentationStartId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; padlet: Padlet } | null>(null);
  // Track current binary files (images embedded in drawing) for export
  const currentFilesRef = useRef<any>(null);
  const runtimeSceneElementsRef = useRef<readonly any[]>([]);
  const runtimePadletsRef = useRef<Padlet[]>(padlets);
  const runtimeInitialFilesRef = useRef<any>(null);

  // Lasso and selection state
  const [mermaidModalOpen, setMermaidModalOpen] = useState(false);

  runtimeSceneElementsRef.current = elements;
  runtimePadletsRef.current = padlets;
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
      const viewportRight = viewportContainerRef?.current?.getBoundingClientRect().right ?? window.innerWidth;
      const reservedSidebarLeft = presentationSidebarRef.current?.getBoundingClientRect().left ?? (viewportRight - 320);
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

  const performSave = useCallback(async () => {
    const mp = masterPadletRef.current;
    if (!dirtyDataRef.current || !mp || readOnly) return;

    const { elements, appState, files } = dirtyDataRef.current;

    // Guard: if we've never seen non-empty elements in this session, don't save empty canvas
    // (protects against hot-reload remounting before real data arrives)
    if (elements.length === 0 && !hasSeenElementsRef.current) return;

    dirtyDataRef.current = null; // Clear dirty flag

    try {
      await onUpdatePadlet(mp.id, {
        content: JSON.stringify(elements),
        metadata: {
          ...mp.metadata,
          drawingAppState: JSON.stringify(appState),
          drawingFiles: JSON.stringify(files)
        }
      });
    } catch (e) {
      console.error("Failed to save drawing to master padlet", e);
    }
  }, [onUpdatePadlet, readOnly]); // masterPadlet removed -- read from ref inside

  const handleChange = useCallback((elements: readonly any[], newAppState: any, files: any) => {
    if (readOnly) return;

    const newZoomValue = newAppState.zoom?.value || 1;
    const zoomChanged = newZoomValue !== prevZoomValueRef.current;
    prevZoomValueRef.current = newZoomValue;

    // Always write latest appState to ref (no re-render).
    appStateRef.current = newAppState;
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

    for (let i = 0; i < elements.length; i++) {
      const el = elements[i];
      if (!el.isDeleted) {
        activeCount++;
        activeElements.push(el);
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
          if (!isSyncingEmbeddablesRef.current && !zoomChanged) {
            const lastPos = lastEmbeddablePosRef.current.get(pId);
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
          lastEmbeddablePosRef.current.set(pId, { x: el.x, y: el.y });
        }
      } else if (onDeletePadlet && el.type === "embeddable" && typeof el.link === "string" && el.link.startsWith("padlet://")) {
        if (!deletedEmbeddables) deletedEmbeddables = [];
        deletedEmbeddables.push(el);
      }
    }

    // Only trigger a React re-render of the DrawingLayout if the number of active elements changed
    // (e.g. user added or deleted something, not just dragging an existing element)
    // Uses a ref counter (O(1)) instead of prev.reduce() (O(N)) to avoid 60fps GC pauses during drag.
    if (activeElementCountRef.current !== activeCount) {
      activeElementCountRef.current = activeCount;
      setElements(elements);
    }

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
    if (unboundEmbeddable && !createdContainerEmbeddableIdsRef.current.has(unboundEmbeddable.id)) {
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
    if (!isSyncingEmbeddablesRef.current) {
      dirtyDataRef.current = { elements: activeElements, appState: newAppState, files };

      // Debounce save (e.g., 2 seconds after last change)
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      autoSaveTimerRef.current = setTimeout(() => {
        performSave();
      }, 2000);
    }

  }, [onDeletePadlet, performSave, readOnly, schedulePadletPositionSave]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        performSave(); // final save on unmount just in case
      }
    };
  }, [performSave]);

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
    index: null,
    boundElements: null,
    link: null,
    locked: false,
  }), []);

  const handleAddSlide = useCallback(() => {
    if (!excalidrawAPI) return;
    const activeFrames = elements.filter((el: any) => el.type === 'frame' && !el.isDeleted);
    let x = 0, y = 0;
    if (activeFrames.length > 0) {
      const last = activeFrames.reduce((best: any, el: any) =>
        el.x + el.width > best.x + best.width ? el : best, activeFrames[0]);
      x = last.x + last.width + 80;
      y = last.y;
    }
    const newFrame = makeFrameElement(x, y, `Slide ${activeFrames.length + 1}`);
    excalidrawAPI.updateScene({ elements: [...elements, newFrame] });
    setTimeout(() => excalidrawAPI.scrollToContent([newFrame], { fitToContent: true, animate: true, duration: 400 }), 50);
  }, [excalidrawAPI, elements, makeFrameElement]);

  const handleAddSlideBelow = useCallback((id: string) => {
    if (!excalidrawAPI) return;
    const frame = elements.find((el: any) => el.id === id && el.type === 'frame');
    if (!frame) return;
    const activeFrames = elements.filter((el: any) => el.type === 'frame' && !el.isDeleted);
    const newFrame = makeFrameElement(
      frame.x,
      frame.y + frame.height + 80,
      `Slide ${activeFrames.length + 1}`
    );
    excalidrawAPI.updateScene({ elements: [...elements, newFrame] });
    setTimeout(() => excalidrawAPI.scrollToContent([newFrame], { fitToContent: true, animate: true, duration: 400 }), 50);
  }, [excalidrawAPI, elements, makeFrameElement]);

  const handleDuplicateSlide = useCallback((id: string) => {
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

    const newChildren = children.map((child: any) => ({
      ...child,
      id: crypto.randomUUID(),
      x: child.x + dx,
      frameId: newFrameId,
      versionNonce: Math.floor(Math.random() * 1e9),
      updated: Date.now(),
    }));

    excalidrawAPI.updateScene({ elements: [...elements, newFrame, ...newChildren] });
  }, [excalidrawAPI, elements]);

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
    setPresentationStartId(fromSlideId ?? activeFrames[0].id);
    setPresentationActive(true);
  }, [elements]);

  // â”€â”€ Context menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Outside-close is handled by a transparent backdrop overlay in JSX (see below)

  const handleContextMenu = useCallback((e: React.MouseEvent, padlet: Padlet) => {
    e.preventDefault();
    e.stopPropagation();
    closeSelectedShapePanel();
    setContextMenu({ x: e.clientX, y: e.clientY, padlet });
  }, [closeSelectedShapePanel]);

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
    return {
      id: crypto.randomUUID(),
      type: "embeddable" as const,
      x: padlet.position_x,
      y: padlet.position_y,
      width: padlet.width ?? 320,
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
      index: null,
      isDeleted: false,
      groupIds: [],
      frameId: null,
      boundElements: null,
      updated: Date.now(),
      link: `padlet://${padlet.id}`,
      locked: false,
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
    excalidrawAPI.updateScene({
      elements: [...currentElements, embeddable],
      appState: {
        ...excalidrawAPI.getAppState()
      },
      commitToHistory: true,
    });
  }, [createEmbeddableElementForPadlet, excalidrawAPI]);

  useEffect(() => {
    if (!excalidrawAPI) return;
    const nonDrawingRootPadlets = padlets.filter((p) => p.type !== "drawing" && !p.metadata?.parentId);
    const previousSceneSync = lastPadletSceneSyncRef.current;
    const nextSceneSync = new Map(
      nonDrawingRootPadlets.map((p) => [String(p.id), { x: p.position_x ?? 0, y: p.position_y ?? 0 }] as const)
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

        const nextX = linkedPadlet.position_x ?? 0;
        const nextY = linkedPadlet.position_y ?? 0;
        const nextWidth = linkedPadlet.width ?? 320;
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
        const pendingHeight = recentlyNaturalResizedRef.current.get(padletIdFromLink);
        const heightLocked = pendingHeight !== undefined && el.height === pendingHeight;
        if (pendingHeight !== undefined && nextHeight === pendingHeight) {
          recentlyNaturalResizedRef.current.delete(padletIdFromLink); // DB caught up
        }

        const needsRefresh =
          (positionChangedInPadletData &&
            !positionLocked &&
            (Math.abs(el.x - nextX) >= POSITION_SYNC_EPSILON || Math.abs(el.y - nextY) >= POSITION_SYNC_EPSILON)) ||
          el.width !== nextWidth ||
          (!heightLocked && el.height !== nextHeight) ||
          currentSignature !== nextSignature;

        if (!needsRefresh) return el;

        needsSceneRefresh = true;
        // [DBG] log what triggered the sync overwrite
        const reasons: string[] = [];
        if (positionChangedInPadletData && !positionLocked && Math.abs(el.x - nextX) >= POSITION_SYNC_EPSILON) reasons.push(`x: ${el.x} -> ${nextX}`);
        if (positionChangedInPadletData && !positionLocked && Math.abs(el.y - nextY) >= POSITION_SYNC_EPSILON) reasons.push(`y: ${el.y} -> ${nextY}`);
        if (el.width !== nextWidth) reasons.push(`width: ${el.width} -> ${nextWidth}`);
        if (!heightLocked && el.height !== nextHeight) reasons.push(`height: ${el.height} -> ${nextHeight}`);
        if (currentSignature !== nextSignature) reasons.push('signature changed');
        const timerActive = pendingPosTimersRef.current.has(padletIdFromLink);
        if (positionLocked) reasons.push(`pos LOCKED${timerActive ? '[timer]' : '[coord]'} (scene=${el.x},${el.y} db=${nextX},${nextY})`);
        if (heightLocked) reasons.push(`height LOCKED (scene=${el.height} db=${nextHeight})`);
        const refreshed = {
          ...el,
          x: positionLocked || !positionChangedInPadletData ? el.x : nextX,
          y: positionLocked || !positionChangedInPadletData ? el.y : nextY,
          width: nextWidth,
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
    if (missingEmbeddables.length === 0 && orphanedIds.size === 0 && !needsSceneRefresh) return;

    // Pre-update lastEmbeddablePosRef to match what we're about to write.
    // If handleChange fires asynchronously (after setTimeout clears isSyncingEmbeddablesRef),
    // the detection code would see lastPos == el.x and skip false user-drag detection.
    // This is belt-and-suspenders alongside the isSyncingEmbeddablesRef guard.
    for (const el of [...refreshedEmbeddables, ...missingEmbeddables]) {
      if (typeof el.link === "string" && el.link.startsWith("padlet://")) {
        lastEmbeddablePosRef.current.set(el.link.replace("padlet://", ""), { x: el.x, y: el.y });
      }
    }

    // Flag handleChange to skip auto-save for this synthetic scene update.
    // React batches setState (used inside updateScene) as microtasks, so handleChange
    // fires before the setTimeout(0) reset — giving us a clean one-shot guard.
    isSyncingEmbeddablesRef.current = true;
    excalidrawAPI.updateScene({
      elements: [
        ...nextElements,
        ...missingEmbeddables,
      ],
      commitToHistory: false,
    });
    if (typeof (excalidrawAPI as any).updateBoundElements === "function") {
      [...refreshedEmbeddables, ...missingEmbeddables].forEach((el: any) => {
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
        elements: refreshedElements,
        commitToHistory: false,
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
  const handleUpdateChildComments = useCallback((childId: string, comments: any[], options?: { field?: 'comments' | 'detachedComments' }) => {
    const child = paddletsRef.current.find(p => p.id === childId);
    if (!child) return;
    const field = options?.field || 'comments';
    onUpdatePadlet(childId, { metadata: { ...(child.metadata as any), [field]: comments } });
  }, [onUpdatePadlet]);

  const renderEmbeddable = useCallback((element: any) => {
    const link = typeof element?.link === "string" ? element.link : "";
    if (!link.startsWith("padlet://")) return null;
    const padletId = link.replace("padlet://", "");
    const padlet = paddletsRef.current.find((p) => String(p.id) === padletId && p.type !== "drawing");
    if (!padlet) return null;
    return (
      <DrawingEmbeddableCard
        key={padletId}
        padlet={padlet}
        allPadlets={paddletsRef.current}
        readOnly={readOnly}
        excalidrawAPIRef={excalidrawAPIRef}
        appStateRef={appStateRef}
        onUpdatePadlet={onUpdatePadlet}
        onAddPadlet={onAddPadlet}
        canvasId={canvasId}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        currentUserAvatar={currentUserAvatar}
        onUpdateChildComments={handleUpdateChildComments}
        fetchData={fetchData}
        onContextMenu={handleContextMenu}
        onPadletEditRef={onPadletEditRef}
        onBeforePadletEdit={closeSelectedShapePanel}
        onDragEnd={(id, x, y) => {
          recentlyDraggedRef.current.set(id, { x, y, expiresAt: Date.now() + 5000 });
          savePadletPositionWithLock(id, x, y);
        }}
        onNaturalResize={(id, h) => {
          recentlyNaturalResizedRef.current.set(id, h);
        }}
      />
    );
  }, [canvasId, currentUserAvatar, currentUserId, currentUserName, fetchData, handleContextMenu, handleUpdateChildComments, onAddPadlet, readOnly, savePadletPositionWithLock]);

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
      elements: nextElements as any[],
      commitToHistory: options?.commitToHistory ?? true,
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
    getSceneElements: () => elements,
    getPadlets: () => padlets,
    getFiles: () => currentFilesRef.current ?? initialFiles ?? null,
  }), [elements, initialFiles, padlets]);

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
  }), []);

  const handleActivateSlide = useCallback((slideId: string) => {
    setActiveSlideId(slideId);
    const frameElement = elements.find((el: any) => el.id === slideId);
    if (excalidrawAPI && frameElement) {
      excalidrawAPI.scrollToContent([frameElement], {
        fitToContent: true,
        animate: true,
        duration: 500,
      });
    }
  }, [elements, excalidrawAPI]);

  const frames: FrameSlide[] = (elements as any[])
    .filter((el: any) => el.type === 'frame' && !el.isDeleted)
    .map((el: any) => {
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
      return {
        ...baseSlide,
        contentVersion: frameVersionsRef.current[el.id] ?? 0,
        renderSignature: sig,
      };
    }); const contentPadlets = padlets.filter(p => p.type !== 'drawing' && p.type !== 'comment' && p.id !== masterPadlet?.id);

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
      elements: [...currentElements, ...finalElements],
      appState: {
        ...appStateRef.current,
        selectedElementIds: finalElements.reduce((acc: any, el: any) => ({ ...acc, [el.id]: true }), {}),
      },
      files: newFiles ? { ...currentFilesRef.current, ...newFiles } : currentFilesRef.current,
      commitToHistory: true,
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
      appState: {
        ...latest,
        zoom: { value: nextZoom },
      },
      commitToHistory: false,
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

    logBackLineBridgeDiagnostics({
      phase: 'contextmenu-capture',
      event,
      activeToolType,
      guardPassed: true,
      guardFailedReason: null,
      backTargetResolutionAttempted: true,
      backTargetFound: true,
      foundTarget: interactiveTarget,
    });

    bridgedBackLineInteractiveTargetRef.current = null;
    event.preventDefault();
    event.stopPropagation();

    isDispatchingBackLineBridgeEventRef.current = true;
    try {
      interactiveTarget.dispatchEvent(new MouseEvent('contextmenu', {
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
      >
        <ExcalidrawWrapper
          excalidrawAPI={(api) => { setExcalidrawAPI(api); excalidrawAPIRef.current = api; if (drawingExcalidrawAPIRef) drawingExcalidrawAPIRef.current = api; }}
          excalidrawKey={key}
          initialData={excalidrawInitialData}
          onChange={handleChange}
          readOnly={readOnly}
          onShowHelp={() => { }}
          renderEmbeddable={renderEmbeddable}
          validateEmbeddable={(link: string) => link.startsWith('padlet://')}
        />
      </div>

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
          className="absolute bottom-6 right-6 z-[130] flex items-center bg-white rounded-lg shadow-md border border-gray-200 pointer-events-auto"
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
          getOpenTargetLabel={(p) => {
            const title = String(p.title ?? "").trim();
            if (title) return title;
            return String(p.type ?? (p.metadata as any)?.kind ?? "post").replace(/_/g, " ");
          }}
          hasPaste={!!clipboard}
          onEdit={(p) => { onPadletEdit?.(p); setContextMenu(null); }}
          onEditPadletAsPost={onEditPadletAsPost ? (p) => { onEditPadletAsPost(p); setContextMenu(null); } : undefined}
          onCut={(p) => { handleCutPadlet(p); setContextMenu(null); }}
          onCopy={(p) => { handleCopyPadlet(p); setContextMenu(null); }}
          onPaste={(sx, sy) => { handlePastePadlet(sx, sy); setContextMenu(null); }}
          onDuplicate={(p) => { handleDuplicatePadlet(p); setContextMenu(null); }}
          onDelete={onDeletePadlet ? (p) => { handleDeletePadlet(p); setContextMenu(null); } : undefined}
          onSendToBack={(p) => { handleSendToBack(p); setContextMenu(null); }}
          onSendBackward={(p) => { handleSendBackward(p); setContextMenu(null); }}
          onBringForward={(p) => { handleBringForward(p); setContextMenu(null); }}
          onBringToFront={(p) => { handleBringToFront(p); setContextMenu(null); }}
          onCopyAsPNG={(p) => { handleCopyAsPNG(p); setContextMenu(null); }}
          onExportAsPNG={(p) => { handleExportAsPNG(p); setContextMenu(null); }}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Custom Mermaid Modal */}
      <CustomMermaidModal
        isOpen={mermaidModalOpen}
        onClose={() => setMermaidModalOpen(false)}
        onInsert={handleInsertMermaid}
      />
    </div>
  );
}



