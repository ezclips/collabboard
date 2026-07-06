"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/exhaustive-deps */
// Legacy canvas client: lint cleanup here needs a larger refactor than is safe for an isolated fix.

import ImageDrawingLayer from '@/components/collabboard/editors/ImageDrawingLayer';
import ImageCropLayer from '@/components/collabboard/editors/ImageCropLayer';
import CardEditor from '@/components/collabboard/CardEditor';
import ClipartCardDraftModal from '@/components/collabboard/editors/ClipartCardDraftModal';
import ImageActionsToolbar from '@/components/collabboard/editors/ImageActionsToolbar';
import TextStylePopup from '@/components/collabboard/editors/TextStylePopup';
import ReactionDisplay from '@/components/collabboard/editors/ReactionDisplay';
import InlineCaption from '@/components/collabboard/editors/InlineCaption';
import SimpleLineRenderer from '@/components/collabboard/SimpleLineRenderer';
import ColumnsLayout from '@/components/canvas/layouts/ColumnsLayout';
import DrawingLayout from '@/components/collabboard/canvas/layouts/DrawingLayout';
import ChronoTimelineCanvas from '@/components/canvas/ChronoTimelineCanvas';
import TimelineHeaderBar from '@/components/canvas/TimelineHeaderBar';
import ChronoModeSelectionModal from '@/components/canvas/ChronoModeSelectionModal';
import type { ChronoMode } from '@/types/collabboard';
import WallCanvas from '@/components/canvas/WallCanvas';
import StandaloneSchedulerCanvas from '@/components/canvas/StandaloneSchedulerCanvas';
import WallPlacementPrompt from '@/components/canvas/wall/WallPlacementPrompt';
import LineToolbar from '@/components/collabboard/LineToolbar';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';
import RowCanvasDnD from '@/components/collabboard/row/RowCanvasDnD';
import { routeEdge, type GraphSide } from '@/lib/graph/edgeRouting';
import { FreeformGraphRepo } from '@/lib/graph/graphRepo';
import { canEditWorkspace, canManageWorkspace, resolveCurrentWorkspace, type WorkspaceRole } from '@/lib/workspace/context';
import '@/components/kanban-canvas/kanban-canvas.css';
import ColumnContainerCreationPrompt from '@/components/canvas/layouts/ColumnContainerCreationPrompt';
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, useReducer } from 'react';
import DOMPurify from 'dompurify';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { Padlet, BoardSection, PendingPostDraft, NewPostDragState, DropIndicatorState, CanvasLine } from '@/types/collabboard';
import { User, Session } from '@supabase/supabase-js';
import {
  StickyNote, Link, CheckSquare, MoveRight, MessageCircle,
  Image as ImageIcon, Upload, PenTool, Trash2, Bell, Table, X, Columns3,
  Map as MapIcon, BookOpen, Plus, CloudDownload, Sparkles, Palette, Strikethrough, UserPlus, Settings
} from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import AIComponentEditor from '@/components/collabboard/editors/AIComponentEditor';
import LibraryPanel from '@/components/collabboard/LibraryPanel';
import ImportsDialog from '@/components/collabboard/imports/ImportsDialog';
import { LibraryItemContent } from '@/lib/collabboard/library';
import { clipboardManager } from '@/lib/collabboard/ClipboardManager';
import { toast } from 'sonner';
import PlacementPrompt from '@/components/collabboard/PlacementPrompt';
import { usePadletSave } from '@/hooks/canvas';
import { useStableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { debounce, sanitizeLibraryMetadata } from '@/components/collabboard/canvas/engine/utils';
import { segmentsIntersect } from '@/components/collabboard/canvas/engine/geometry';
import { computeClickedSide } from '@/components/collabboard/canvas/engine/hitTest';
import { computeNormalizedZIndexes } from '@/components/collabboard/canvas/engine/zIndex';
import { canvasReducer } from '@/components/collabboard/canvas/store/canvasReducer';
import { initialCanvasState } from '@/components/collabboard/canvas/store/types';
import { useCanvasData } from '@/components/collabboard/canvas/hooks/useCanvasData';
import { useCanvasCamera } from '@/components/collabboard/canvas/hooks/useCanvasCamera';
import { useCanvasSelection } from '@/components/collabboard/canvas/hooks/useCanvasSelection';
import { useCanvasOverlays } from '@/components/collabboard/canvas/hooks/useCanvasOverlays';
import { useCanvasLines } from '@/components/collabboard/canvas/hooks/useCanvasLines';
import { useCanvasInteractions } from '@/components/collabboard/canvas/hooks/useCanvasInteractions';
import { useCanvasShortcuts } from '@/components/collabboard/canvas/hooks/useCanvasShortcuts';
import KanbanShell from '@/components/collabboard/canvas/ui/KanbanShell';
import GanttShell from '@/components/collabboard/canvas/ui/GanttShell';
import MapCanvas from '@/components/map/MapCanvas';
import type mapboxgl from 'mapbox-gl';
import MapStylePanel from '@/components/map/MapStylePanel';
import { getPadletMapLocation } from '@/lib/map/geojson';
import CanvasSidebar from '@/components/collabboard/canvas/ui/CanvasSidebar';
import CanvasShareModal from '@/components/collabboard/canvas/ui/CanvasShareModal';
import CanvasSettingsModal from '@/components/collabboard/canvas/ui/CanvasSettingsModal';
import CanvasTitleHeader, { CANVAS_TITLE_HEADER_HEIGHT } from '@/components/collabboard/canvas/ui/CanvasTitleHeader';
import CanvasModals from '@/components/collabboard/canvas/ui/CanvasModals';
import CanvasViewport from '@/components/collabboard/canvas/ui/CanvasViewport';
import PadletLayer from '@/components/collabboard/canvas/ui/PadletLayer';
import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';
import OverlayLayer from '@/components/collabboard/canvas/ui/OverlayLayer';
import ZoomControls from '@/components/collabboard/canvas/ui/ZoomControls';
import GhostDragElement from '@/components/collabboard/canvas/ui/GhostDragElement';
import FreeformCanvasBoardMenu from '@/components/collabboard/canvas/ui/FreeformCanvasBoardMenu';
import WallpaperSelector from '@/components/collabboard/canvas/WallpaperSelector';
import { CanvasEditorProvider, type CanvasEditorState } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { CanvasConfigProvider, type CanvasConfigState } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';
import { ColorPickerContent } from '@/components/collabboard/ColorPicker';
import { isStripVisible } from '@/components/collabboard/canvas/engine/utils';

// === BEGIN TYPES + CONSTANTS REGION ===

const PADLET_DRAG_START_DISTANCE = 8;

const BADGE_COLORS = [
  "#fef9c3", "#fef08a", "#fde047", "#facc15", "#eab308", "#ca8a04",
  "#f3f4f6", "#e5e7eb", "#d1d5db", "#9ca3af", "#6b7280", "#4b5563",
  "#ffedd5", "#fed7aa", "#fdba74", "#fb923c", "#f97316", "#ea580c",
  "#fce7f3", "#fbcfe8", "#f9a8d4", "#f472b6", "#ec4899", "#db2777",
  "#dbeafe", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6", "#2563eb",
  "#dcfce7", "#bbf7d0", "#86efac", "#4ade80", "#22c55e", "#16a34a",
  "#f3e8ff", "#e9d5ff", "#d8b4fe", "#c084fc", "#a855f7", "#9333ea",
  "#ccfbf1", "#99f6e4", "#5eead4", "#2dd4bf", "#14b8a6", "#0d9488",
];

const BACKGROUND_COLORS = [
  "#ffffff", "#f3f4f6", "#fee2e2", "#ffedd5", "#fef3c7",
  "#dcfce7", "#dbeafe", "#f3e8ff", "#fce7f3", "#ccfbf1",
  "#fefce8", "#f0fdf4", "#eff6ff", "#faf5ff", "#fff1f2",
];

const TOP_STRIP_COLORS = [
  "transparent", "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#10b981", "#14b8a6", "#06b6d4",
  "#0ea5e9", "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e",
];

type FreeformBoardMenuState = {
  x: number;
  y: number;
  canvasX: number;
  canvasY: number;
} | null;

function getFreeformDotGridStorageKey(boardId?: string) {
  return boardId ? `freeform-board-dot-grid:${boardId}` : null;
}


function GraphLineToolIcon({ size = 18, className, ...rest }: { size?: number; className?: string;[key: string]: unknown }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <circle cx="5" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="5" r="2" fill="currentColor" />
      <circle cx="19" cy="12" r="2" fill="currentColor" />
      <circle cx="19" cy="19" r="2" fill="currentColor" />
      <path d="M7 12L17 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12L17 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M7 12L17 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MapPinToolbarIcon({ size = 18, className, ...rest }: { size?: number; className?: string;[key: string]: unknown }) {
  const iconSize = Math.max(size, 22);
  return (
    <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true" {...rest}>
      <circle cx="12" cy="9" r="6" fill="currentColor" />
      <rect x="8.5" y="13" width="7" height="7" transform="rotate(45 12 16.5)" fill="currentColor" />
    </svg>
  );
}


// === END TYPES + CONSTANTS REGION ===

export default function CanvasClient({ canvasId, openPadletId }: { canvasId?: string; openPadletId?: string }) {
  // Canvas store (PR4) — declared first so useCanvasData can receive dispatch
  const [canvasState, dispatch] = useReducer(canvasReducer, initialCanvasState);
  const supabase = useMemo(() => supabaseBrowser(), []);
  // === BEGIN SESSION + AUTH REGION ===
  // Session state - fetch once on mount and listen for changes
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const freeformPanStartRef = useRef<{ clientX: number; clientY: number; scrollLeft: number; scrollTop: number } | null>(null);
  const router = useRouter();

  // Prevent hydration mismatch by only rendering after mount
  const [hasMounted, setHasMounted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [currentWorkspaceRole, setCurrentWorkspaceRole] = useState<WorkspaceRole | null>(null);
  const [isToolbarCollapsed, setIsToolbarCollapsed] = useState(false);
  const [isMapToolbarCollapsed, setIsMapToolbarCollapsed] = useState(false);
  const [isFreeformPanning, setIsFreeformPanning] = useState(false);
  const [freeformBoardMenu, setFreeformBoardMenu] = useState<FreeformBoardMenuState>(null);
  const [freeformWallpaperDialogOpen, setFreeformWallpaperDialogOpen] = useState(false);
  const [lastPastedPadletIds, setLastPastedPadletIds] = useState<string[]>([]);
  const [canPasteFromClipboard, setCanPasteFromClipboard] = useState(false);
  const [freeformBoardAppearance, setFreeformBoardAppearance] = useState({
    backgroundType: 'color' as 'color' | 'gradient' | 'image',
    backgroundValue: '#f3f4f6',
    showDotGrid: false,
  });

  // === BEGIN CAMERA REGION ===
  const { canvasZoom, setCanvasZoom, handleZoomIn, handleZoomOut, handleZoomReset } = useCanvasCamera();
  // === END CAMERA REGION ===

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    const metadata = user?.user_metadata as Record<string, unknown> | undefined;
    const preferences =
      metadata?.preferences && typeof metadata.preferences === 'object' && !Array.isArray(metadata.preferences)
        ? metadata.preferences as Record<string, unknown>
        : {};
    setIsToolbarCollapsed(preferences.toolbarCollapsed === true);
  }, [user]);

  useEffect(() => {
    let cancelled = false;

    const loadWorkspaceRole = async () => {
      if (!user?.id) {
        setCurrentWorkspaceRole(null);
        return;
      }

      try {
        const workspace = await resolveCurrentWorkspace(supabase, user);
        if (!cancelled) {
          setCurrentWorkspaceRole(workspace?.role ?? 'member');
        }
      } catch (error) {
        console.error('Error resolving workspace role:', error);
        if (!cancelled) {
          // Fail closed so edit controls never appear when role resolution breaks.
          setCurrentWorkspaceRole(null);
        }
      }
    };

    loadWorkspaceRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const canUseFreeformEditButton = canEditWorkspace(currentWorkspaceRole);
  // Keep the canvas creation toolbar aligned with board editability.
  // Otherwise editable member accounts can open and modify a board but lose the
  // left toolbar entirely because they are not workspace admins.
  const canUseCanvasToolbar = canUseFreeformEditButton;
  const canManageCanvasShare = canManageWorkspace(currentWorkspaceRole);
  const handleToggleMapToolbarCollapsed = useCallback(() => {
    setIsMapToolbarCollapsed((prev) => !prev);
  }, []);
  const handleToggleToolbarCollapsed = useCallback(() => {
    setIsToolbarCollapsed((prev) => {
      const next = !prev;

      if (user) {
        const metadata = user.user_metadata as Record<string, unknown> | undefined;
        const existingPreferences =
          metadata?.preferences && typeof metadata.preferences === 'object' && !Array.isArray(metadata.preferences)
            ? metadata.preferences as Record<string, unknown>
            : {};
        const nextPreferences = {
          ...existingPreferences,
          toolbarCollapsed: next,
        };
        const nextMetadata = {
          ...(metadata || {}),
          preferences: nextPreferences,
          preferences_updated_at: new Date().toISOString(),
        };

        void supabase.auth.updateUser({
          data: nextMetadata,
        });

        setUser((prevUser) => prevUser ? ({ ...prevUser, user_metadata: nextMetadata } as User) : prevUser);
      }

      return next;
    });
  }, [user]);

  // Fetch user on mount and listen for auth changes (using getUser like dashboard does)
  useEffect(() => {
    let mounted = true;

    const fetchUser = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (mounted) {
        setUser(currentUser ?? null);
        // Create a minimal session-like object for compatibility
        if (currentUser) {
          setSession({ user: currentUser } as Session);
        } else {
          setSession(null);
        }
        setSessionReady(true);
      }
    };

    fetchUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (mounted) {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setSessionReady(true);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);
  // === END SESSION + AUTH REGION ===

  // Data layer — canvas/padlets/lines/sections state + CRUD (PR5)
  const {
    canvas, padlets, setPadlets, lines, setLines, sections, setSections,
    loading, error, fetchData,
    markPadletLocallyModified,
    updateLineLocal, saveLineToDb, updateLine, deleteLine, duplicateLine, handleChangeLineLayer,
    updatePadletContent, updatePadletTitle,
    addPadletFromLibraryItem, addFreeformCardPadlet, addDrawingLayoutPadlet, updateDrawingLayoutPadlet,
    insertPadlet, insertPadletAndSelectSingle, updatePadletById, deletePadletByIdRaw,
  } = useCanvasData({ canvasId, dispatch });

  // Auto-open a specific padlet from a share link (?openPadlet=id).
  // These hooks must be here — before the loading/canvas early returns below.
  const openPadletHandledRef = useRef(false);
  const openPadletInTypeEditorRef = useRef<((p: any) => void) | null>(null);
  useEffect(() => {
    if (!openPadletId || openPadletHandledRef.current || padlets.length === 0) return;
    const target = padlets.find((p) => p.id === openPadletId);
    if (!target || !openPadletInTypeEditorRef.current) return;
    openPadletHandledRef.current = true;
    openPadletInTypeEditorRef.current(target);
  }, [openPadletId, padlets]);

  // === BEGIN OVERLAYS + UI STATE REGION ===

  // === BEGIN EDITORS REGION ===
  // Separate modal states for different editors (11 vars → canvas store, PR4)
  const isNoteEditorOpen = canvasState.editors.isNoteEditorOpen; // SHARED: overlays + editors
  const setIsNoteEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isNoteEditorOpen: v } });
  const [isCanvasShareModalOpen, setIsCanvasShareModalOpen] = useState(false);
  const [isCanvasSettingsModalOpen, setIsCanvasSettingsModalOpen] = useState(false);
  const isTableEditorOpen = canvasState.editors.isTableEditorOpen; // SHARED: overlays + editors
  const setIsTableEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isTableEditorOpen: v } });
  const isLinkEditorOpen = canvasState.editors.isLinkEditorOpen; // SHARED: overlays + editors
  const setIsLinkEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isLinkEditorOpen: v } });
  const isTodoEditorOpen = canvasState.editors.isTodoEditorOpen; // SHARED: overlays + editors
  const setIsTodoEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isTodoEditorOpen: v } });
  const isContainerEditorOpen = canvasState.editors.isContainerEditorOpen; // SHARED: overlays + editors
  const setIsContainerEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isContainerEditorOpen: v } });
  const {
    chronoMode,
    setChronoMode,
    showChronoModeModal,
    setShowChronoModeModal,
    imageColorTab,
    setImageColorTab,
    cardToolbarPadletId,
    setCardToolbarPadletId,
    commentPopupOpen,
    setCommentPopupOpen,
    commentPopupPosition,
    setCommentPopupPosition,
    commentPopupComments,
    setCommentPopupComments,
    commentPopupPadletId,
    setCommentPopupPadletId,
    commentPopupCommentId,
    setCommentPopupCommentId,
    textLinkColorPickerOpen,
    setTextLinkColorPickerOpen,
    textLinkColorPickerPosition,
    setTextLinkColorPickerPosition,
    commentPopupHighlightColor,
    setCommentPopupHighlightColor,
    wallPlacementPromptOpen,
    setWallPlacementPromptOpen,
    wallPendingPostDraft,
    setWallPendingPostDraft,
    wallPlacementMode,
    setWallPlacementMode,
    containerCreationPromptOpen,
    setContainerCreationPromptOpen,
    containerCreationLocation,
    setContainerCreationLocation,
    detachedPopupOpen,
    setDetachedPopupOpen,
    detachedPopupPosition,
    setDetachedPopupPosition,
    detachedPopupPadletId,
    setDetachedPopupPadletId,
    detachedBadgeColorOpen,
    setDetachedBadgeColorOpen,
    detachedPopupComments,
    setDetachedPopupComments,
    cardCommentPopupPadletId,
    setCardCommentPopupPadletId,
    cardCommentList,
    setCardCommentList,
    activeCardCommentId,
    setActiveCardCommentId,
    editingCardCommentId,
    setEditingCardCommentId,
    editingCardCommentText,
    setEditingCardCommentText,
    commentColorPopupId,
    setCommentColorPopupId,
    noteBadgeColorPadletId,
    setNoteBadgeColorPadletId,
    internalBadgeColorPopupId,
    setInternalBadgeColorPopupId,
    internalBadgePopupPosition,
    setInternalBadgePopupPosition,
    isLibraryOpen,
    setIsLibraryOpen,
    reminderPopupOpen,
    setReminderPopupOpen,
    reminderPopupPosition,
    setReminderPopupPosition,
    reminderPopupTasks,
    setReminderPopupTasks,
    setReminderPopupPadletId,
    showDeleteConfirm,
    setShowDeleteConfirm,
    collapsedPopupPadletId,
    setCollapsedPopupPadletId,
    collapsedBadgeColorOpen,
    setCollapsedBadgeColorOpen,
    collapsedActiveCommentId,
    setCollapsedActiveCommentId,
    collapsedEditingCommentId,
    setCollapsedEditingCommentId,
    collapsedEditingText,
    setCollapsedEditingText,
    collapsedCommentColorPopupId,
    setCollapsedCommentColorPopupId,
    imageToolbarPadletId,
    setImageToolbarPadletId,
    isDrawingMode,
    setIsDrawingMode,
    drawingPadlet,
    setDrawingPadlet,
    editingCaption,
    setEditingCaption,
    isImageEmojiOpen,
    setIsImageEmojiOpen,
    imageEditorTab,
    setImageEditorTab,
    isCropMode,
    setIsCropMode,
    cropPadlet,
    setCropPadlet,
    captionPopupPadletId,
    setCaptionPopupPadletId,
    textStylePadletId,
    setTextStylePadletId,
    isCardViewerOpen,
    setIsCardViewerOpen,
    isCardColorPickerOpen,
    setIsCardColorPickerOpen,
    isImageColorPickerOpen,
    setIsImageColorPickerOpen,
    cardColorTab,
    setCardColorTab,
    captionEditorPadletId,
    setCaptionEditorPadletId,
    iconReplaceTargetPadlet,
    setIconReplaceTargetPadlet,
  } = useCanvasOverlays();
  const isCommentEditorOpen = canvasState.editors.isCommentEditorOpen; // SHARED: overlays + editors
  const setIsCommentEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isCommentEditorOpen: v } });
  const isImageEditorOpen = canvasState.editors.isImageEditorOpen; // SHARED: overlays + editors
  const setIsImageEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isImageEditorOpen: v } });
  const isDrawingEditorOpen = canvasState.editors.isDrawingEditorOpen; // SHARED: overlays + editors
  const setIsDrawingEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isDrawingEditorOpen: v } });
  const isCardEditorOpen = canvasState.editors.isCardEditorOpen; // SHARED: overlays + editors
  const setIsCardEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isCardEditorOpen: v } });
  const isAIComponentEditorOpen = canvasState.editors.isAIComponentEditorOpen;
  const setIsAIComponentEditorOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isAIComponentEditorOpen: v } });
  const isAIContentEditModalOpen = canvasState.editors.isAIContentEditModalOpen;
  const setIsAIContentEditModalOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isAIContentEditModalOpen: v } });
  const isAIContentConvertModalOpen = canvasState.editors.isAIContentConvertModalOpen;
  const setIsAIContentConvertModalOpen = (v: boolean) => dispatch({ type: 'EDITORS_PATCH', payload: { isAIContentConvertModalOpen: v } });
  const padletToEdit = canvasState.editors.padletToEdit; // SHARED: overlays + editors
  const setPadletToEdit = (v: Padlet | null) => dispatch({ type: 'EDITORS_PATCH', payload: { padletToEdit: v } });
  const viewDrawingPadlet = canvasState.editors.viewDrawingPadlet; // SHARED: overlays + editors
  const setViewDrawingPadlet = (v: Padlet | null) => dispatch({ type: 'EDITORS_PATCH', payload: { viewDrawingPadlet: v } });
  const [isClipartDraftModalOpen, setIsClipartDraftModalOpen] = useState(false);
  const [isClipartDraftReplaceMode, setIsClipartDraftReplaceMode] = useState(false);
  // === END EDITORS REGION (state declarations; wiring at usePadletSave call below) ===

  // --- Container Creation Logic (Column Layout) ---
  const handleTriggerContainerCreation = (sectionId: number, position: number) => {
    setContainerCreationLocation({ sectionId, position });
    setContainerCreationPromptOpen(true);
  };

  const handleCreateContainerFromPrompt = async () => {
    if (!containerCreationLocation || !canvasId) {
      return;
    }
    const { sectionId, position } = containerCreationLocation;

    const containerId = crypto.randomUUID();

    const newContainer: Padlet = {
      id: containerId,
      board_id: canvasId,
      title: 'New Container',
      content: '', // Description
      type: 'container',
      position_x: 0,
      position_y: 0,
      width: 280,
      height: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        childPadletIds: [],
        sectionId: sectionId.toString(), // Convert to string for consistency
        sectionPosition: position,
        kind: 'container',
        isContainer: true,
        cardColor: '#ffffff',
        zIndex: Date.now(),
      }
    };

    // Optimistic Update
    setPadlets(prev => [...prev, newContainer]);

    // Close prompt
    setContainerCreationPromptOpen(false);
    setContainerCreationLocation(null);

    // Persist
    try {
      const { error } = await insertPadlet(newContainer);
      if (error) throw error;
      toast.success('Container created');
    } catch (err) {
      console.error("Failed to create container:", err);
      toast.error("Failed to create container");
      // Rollback
      setPadlets(prev => prev.filter(p => p.id !== newContainer.id));
    }
  };

  const handleDragToExistingFromPrompt = () => {
    setContainerCreationPromptOpen(false);
    setContainerCreationLocation(null);
    toast.info("Drag a post into an existing container");
  };

  // Create empty container at specific section/position
  const handleCreateContainerAt = async (sectionId: number, position: number) => {
    if (!canvasId) return;
    const containerId = crypto.randomUUID();
    const newContainer: Padlet = {
      id: containerId,
      board_id: canvasId,
      title: 'New Container',
      content: '',
      type: 'container',
      position_x: 0,
      position_y: 0,
      width: 280,
      height: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        childPadletIds: [],
        sectionId: sectionId.toString(),
        sectionPosition: position,
        kind: 'container',
        isContainer: true,
        cardColor: '#ffffff',
        zIndex: Date.now(),
      },
    };
    setPadlets(prev => [...prev, newContainer]);
    try {
      const { error } = await insertPadlet(newContainer);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to create container:', err);
      toast.error('Failed to create container');
      setPadlets(prev => prev.filter(p => p.id !== newContainer.id));
    }
  };
  const handleDropDraftIntoContainer = async (containerId: string, draftPayload: any) => {
    if (!canvasId) return;
    const newPadletData = {
      ...draftPayload,
      board_id: canvasId,
      position_x: 0,
      position_y: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        ...draftPayload.metadata,
        parentId: containerId,
      },
    };
    try {
      const { data: created, error } = await insertPadletAndSelectSingle(newPadletData);
      if (error || !created) throw error || new Error('Insert returned no data');
      setPadlets(prev => [...prev, created]);
      const container = padlets.find(p => p.id === containerId);
      if (container) {
        const currentChildren = (container.metadata as any)?.childPadletIds ?? [];
        await updatePadletById(containerId, {
          metadata: {
            ...(container.metadata as any),
            childPadletIds: [...currentChildren, created.id],
          },
        });
      }
    } catch (err) {
      console.error('Failed to drop draft into container:', err);
      toast.error('Failed to add to container');
    }
  };
  // --- End Container Creation Logic ---

  // === BEGIN SELECTION REGION ===
  // Padlet selection and delete state (9 vars → canvas store, PR4)
  const {
    selectedPadletId,
    setSelectedPadletId,
    selectedPadletIds,
    setSelectedPadletIds,
    isGraphConnectMode,
    setIsGraphConnectMode,
    graphConnectSource,
    setGraphConnectSource,
    graphConnectSelection,
    setGraphConnectSelection,
    graphRefreshToken,
    setGraphRefreshToken,
    selectedSchedulerSlot,
    setSelectedSchedulerSlot,
    selectedSchedulerContainerId,
    setSelectedSchedulerContainerId,
    schedulerPopoverPadletId,
    setSchedulerPopoverPadletId,
    selectedLineId,
    setSelectedLineId,
  } = useCanvasSelection({ canvasState, dispatch });
  const activeCardComment = cardCommentList.find((comment) => comment.id === activeCardCommentId) || null;
  const getImageEditSource = useCallback((padlet: Padlet | null | undefined): string | null => {
    if (!padlet) return null;
    return (
      padlet.metadata?.imageUrl ||
      (padlet.metadata as any)?.fileUrl ||
      (padlet.metadata as any)?.file_url ||
      padlet.image_url ||
      padlet.file_url ||
      padlet.metadata?.drawing ||
      (typeof padlet.content === 'string' && /^https?:\/\//i.test(padlet.content) ? padlet.content : null)
    );
  }, []);
  const isImageEditPadlet = useCallback((padlet: Padlet | null | undefined): boolean => {
    if (!padlet) return false;
    const normalizedType = String(padlet.type || '').toLowerCase();
    if (normalizedType === 'image') return true;
    if (normalizedType === 'drawing' || normalizedType === 'link' || normalizedType === 'todo' || normalizedType === 'table' || normalizedType === 'container' || normalizedType === 'comment') {
      return false;
    }
    const fileType = String(padlet.file_type || (padlet.metadata as any)?.fileType || '').toLowerCase();
    return fileType.startsWith('image/') && Boolean(getImageEditSource(padlet));
  }, [getImageEditSource]);
  const activeImageToolbarPadlet = imageToolbarPadletId
    ? padlets.find((padlet) => padlet.id === imageToolbarPadletId) ?? null
    : null;
  const activeImageToolbarSrc = getImageEditSource(activeImageToolbarPadlet);
  // === END SELECTION REGION ===

  // === BEGIN LINE REGION ===
  const {
    lineEditModeId,
    setLineEditModeId,
    isLineMode,
    setIsLineMode,
    draggingLineId,
    lineContextMenuState,
    setLineContextMenuState,
    createLineFromCoords,
    clearLineState,
    handleLineSelect,
    handleToggleLineEditMode,
    handleLineDragChange,
  } = useCanvasLines({
    canvasId,
    canvasZoom,
    setLines,
    setSelectedLineId,
    supabase,
  });

  // Helper to close all toolbars and popups when opening a new one
  const closeAllToolbars = useCallback((except?: {
    cardToolbar?: boolean;
    imageToolbar?: boolean;
    line?: boolean;
    colorPicker?: boolean;
    emoji?: boolean;
  }) => {
    if (!except?.cardToolbar) setCardToolbarPadletId(null);
    if (!except?.imageToolbar) setImageToolbarPadletId(null);
    if (!except?.line) clearLineState();
    if (!except?.colorPicker) {
      setIsCardColorPickerOpen(false);
      setIsImageColorPickerOpen(false);
    }
    if (!except?.emoji) setIsImageEmojiOpen(false);
    setCardCommentPopupPadletId(null);
    setCommentColorPopupId(null);
    setCaptionPopupPadletId(null);
    setTextStylePadletId(null);
    setDetachedPopupPadletId(null);
    setCollapsedPopupPadletId(null);
    setCommentPopupPadletId(null);
    setReminderPopupOpen(false);
    setReminderPopupPadletId(null);
  }, [clearLineState]);
  // Debug: trace selection changes (PR1 instrumentation)
  useEffect(() => { debugCanvasLogger('selectionChange', { type: 'padlet', id: selectedPadletId }); }, [selectedPadletId]);
  useEffect(() => { debugCanvasLogger('selectionChange', { type: 'line', id: selectedLineId }); }, [selectedLineId]);
  // === END OVERLAYS + UI STATE REGION ===

  // Column Layout Post Placement States
  const [pendingPostDraft, setPendingPostDraft] = useState<PendingPostDraft | null>(null);
  const pendingPostDraftRef = useRef<PendingPostDraft | null>(null);
  // Keep ref in sync with state to avoid stale closure issues
  useEffect(() => {
    pendingPostDraftRef.current = pendingPostDraft;
  }, [pendingPostDraft]);
  const [isImportBrowserOpen, setIsImportBrowserOpen] = useState(false);
  const [isPlacementPromptOpen, setIsPlacementPromptOpen] = useState(false);
  const [mapActiveContainerId, setMapActiveContainerId] = useState<string | null>(null);
  const [isMapStylePanelOpen, setIsMapStylePanelOpen] = useState(false);
  const [mapStyleIdOverride, setMapStyleIdOverride] = useState<string | null>(null);
  const [isMapSidebarOpen, setIsMapSidebarOpen] = useState(true);
  const [newPostDragState, setNewPostDragState] = useState<NewPostDragState>({
    isActive: false,
    draft: null,
    cursor: { x: 0, y: 0 },
    grabOffset: { x: 0, y: 0 }
  });
  const [newPostHoverContainerId, setNewPostHoverContainerId] = useState<string | null>(null);
  const [placementContext, setPlacementContext] = useState<'columns' | 'wall' | 'timeline-horizontal-all' | 'scheduler' | null>(null);
  const [placementPromptMode, setPlacementPromptMode] = useState<'columns' | 'timeline-horizontal-all' | null>(null);
  const [activeSectionId] = useState<string | null>(null);

  // Global Drop Indicator State
  const [dropIndicator, setDropIndicator] = useState<DropIndicatorState>({
    sectionId: null,
    index: null,
  });
  const timelineAutoInitAttemptedRef = useRef<Set<string>>(new Set());

  // Global Drag Cleanup
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      setDropIndicator({ sectionId: null, index: null });
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => window.removeEventListener('dragend', handleGlobalDragEnd);
  }, []);

  // Guard flag to check if any editor or modal is open
  const isAnyEditorOpen = useMemo(() => {
    return (
      isNoteEditorOpen ||
      isTableEditorOpen ||
      isLinkEditorOpen ||
      isTodoEditorOpen ||
      isContainerEditorOpen ||
      isCommentEditorOpen ||
      isImageEditorOpen ||
      isDrawingEditorOpen ||
      isAIComponentEditorOpen ||
      isAIContentEditModalOpen ||
      isAIContentConvertModalOpen ||
      isCardEditorOpen ||
      isLibraryOpen ||
      isMapStylePanelOpen ||
      isPlacementPromptOpen ||
      isDrawingMode ||
      isCropMode ||
      isImageEmojiOpen ||
      isCardColorPickerOpen ||
      isImageColorPickerOpen ||
      isCardViewerOpen ||
      commentPopupOpen ||
      detachedPopupOpen ||
      !!padletToEdit
    );
  }, [
    isNoteEditorOpen,
    isTableEditorOpen,
    isLinkEditorOpen,
    isTodoEditorOpen,
    isContainerEditorOpen,
    isCommentEditorOpen,
    isImageEditorOpen,
    isDrawingEditorOpen,
    isAIComponentEditorOpen,
    isAIContentEditModalOpen,
    isAIContentConvertModalOpen,
    isCardEditorOpen,
    isLibraryOpen,
    isMapStylePanelOpen,
    isPlacementPromptOpen,
    isDrawingMode,
    isCropMode,
    isImageEmojiOpen,
    isCardColorPickerOpen,
    isImageColorPickerOpen,
    isCardViewerOpen,
    commentPopupOpen,
    detachedPopupOpen,
    padletToEdit
  ]);

  const handleColumnReorder = async (postId: string, fromSectionId: string, toSectionId: string, newIndex: number) => {
    const post = padlets.find(p => p.id === postId);
    if (!post) return;

    // Optimistic update
    const oldMetadata = { ...post.metadata };

    // Get posts in target section to calculate new position
    const targetPosts = padlets
      .filter(p => {
        const pSectionId = (p.metadata as any)?.sectionId;
        const hasParent = (p.metadata as any)?.parentId;
        return String(pSectionId) === String(toSectionId) && !hasParent && p.id !== postId;
      })
      .sort((a, b) => ((a.metadata as any)?.sectionPosition || 0) - ((b.metadata as any)?.sectionPosition || 0));

    // Calculate new position
    let newPosition = 0;
    if (targetPosts.length === 0) {
      newPosition = 1000;
    } else if (newIndex === 0) {
      newPosition = ((targetPosts[0].metadata as any)?.sectionPosition || 0) - 1000;
    } else if (newIndex >= targetPosts.length) {
      newPosition = ((targetPosts[targetPosts.length - 1].metadata as any)?.sectionPosition || 0) + 1000;
    } else {
      const prev = (targetPosts[newIndex - 1].metadata as any)?.sectionPosition || 0;
      const next = (targetPosts[newIndex].metadata as any)?.sectionPosition || 0;
      newPosition = (prev + next) / 2;
    }

    // Apply optimistic update
    setPadlets(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          metadata: {
            ...p.metadata,
            sectionId: toSectionId,
            sectionPosition: newPosition
          }
        };
      }
      return p;
    }));

    try {
      await supabase
        .from('padlets')
        .update({
          metadata: {
            ...post.metadata,
            sectionId: toSectionId,
            sectionPosition: newPosition
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', postId);
    } catch (err) {
      console.error('Failed to reorder post:', err);
      // Rollback
      setPadlets(prev => prev.map(p => {
        if (p.id === postId) {
          return { ...p, metadata: oldMetadata };
        }
        return p;
      }));
    }
  };



  // Memoized background style object - recomputed only when background fields change
  useEffect(() => {
    const dotGridStorageKey = getFreeformDotGridStorageKey(canvas?.id);
    const storedDotGrid =
      typeof window !== 'undefined' && dotGridStorageKey
        ? window.localStorage.getItem(dotGridStorageKey)
        : null;

    setFreeformBoardAppearance({
      backgroundType: (canvas?.background_type as 'color' | 'gradient' | 'image') || 'color',
      backgroundValue: canvas?.background_value || '#f3f4f6',
      showDotGrid: storedDotGrid === 'true',
    });
  }, [canvas?.id, canvas?.background_type, canvas?.background_value]);

  const canvasBackgroundStyle = useMemo((): React.CSSProperties => {
    if (!canvas) return { backgroundColor: '#f3f4f6' };

    const bgType = freeformBoardAppearance.backgroundType;
    const bgValue = freeformBoardAppearance.backgroundValue;
    const showDotGrid = freeformBoardAppearance.showDotGrid;
    const dotPattern = 'radial-gradient(rgba(148, 163, 184, 0.38) 1px, transparent 1.2px)';

    if (bgType === 'color' && bgValue) {
      return showDotGrid
        ? {
          backgroundColor: bgValue,
          backgroundImage: dotPattern,
          backgroundSize: '18px 18px',
          backgroundPosition: '0 0',
        }
        : { backgroundColor: bgValue };
    }
    if (bgType === 'gradient' && bgValue) {
      return showDotGrid
        ? {
          backgroundImage: `${dotPattern}, ${bgValue}`,
          backgroundSize: '18px 18px, auto',
          backgroundPosition: '0 0, center',
        }
        : { background: bgValue };
    }
    if (bgType === 'image' && bgValue) {
      return showDotGrid
        ? {
          backgroundImage: `${dotPattern}, url("${bgValue}")`,
          backgroundSize: '18px 18px, cover',
          backgroundPosition: '0 0, center',
          backgroundRepeat: 'repeat, no-repeat',
        }
        : {
          backgroundImage: `url("${bgValue}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        };
    }
    return showDotGrid
      ? {
        backgroundColor: '#f3f4f6',
        backgroundImage: dotPattern,
        backgroundSize: '18px 18px',
      }
      : { backgroundColor: '#f3f4f6' };
  }, [canvas, freeformBoardAppearance]);

  const getGraphConnectHintStyle = useCallback((): React.CSSProperties => {
    const bgType = canvas?.background_type;
    const bgValue = canvas?.background_value;

    let isDark = true; // default to dark bg assumption

    if (bgType === 'color' && typeof bgValue === 'string') {
      let hex = bgValue.trim();

      if (/^#[0-9a-f]{3}$/i.test(hex)) {
        hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
      }

      if (/^#[0-9a-f]{6}$/i.test(hex)) {
        const red = parseInt(hex.slice(1, 3), 16);
        const green = parseInt(hex.slice(3, 5), 16);
        const blue = parseInt(hex.slice(5, 7), 16);
        const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
        isDark = luminance <= 0.65;
      }
    }

    return isDark
      ? { color: 'rgba(255, 255, 255, 0.72)', fontSize: '0.75rem' }
      : { color: 'rgba(15, 23, 42, 0.55)', fontSize: '0.75rem' };
  }, [canvas?.background_type, canvas?.background_value]);

  const canvasTitleHeaderSettings = (canvas?.settings as any)?.titleHeader || {};
  const showCanvasTitleHeaderIcon = Boolean(canvasTitleHeaderSettings.showIcon);
  const showCanvasTitleHeaderTitle = Boolean(canvasTitleHeaderSettings.showTitle);
  const showCanvasTitleHeaderDescription = Boolean(canvasTitleHeaderSettings.showDescription);
  const showCanvasTitleHeader = showCanvasTitleHeaderIcon || showCanvasTitleHeaderTitle || showCanvasTitleHeaderDescription;

  // Determine active layout
  const isWallLayout = canvas?.layout === 'wall';
  const isColumnsLayout = canvas?.layout === 'columns';
  const isKanbanLayout = canvas?.layout === 'kanban';
  const isGanttLayout = canvas?.layout === 'gantt';
  const isSchedulerLayout = canvas?.layout === 'scheduler';
  const enableGantt = process.env.NEXT_PUBLIC_ENABLE_GANTT === 'true';
  const enableScheduler = process.env.NEXT_PUBLIC_ENABLE_SCHEDULER === 'true';
  const [isGanttVisible, setIsGanttVisible] = useState(true);
  const [isSchedulerVisible, setIsSchedulerVisible] = useState(false);
  const isGridLayout = canvas?.layout === 'grid';
  const isDrawingLayout = canvas?.layout === 'drawing';
  const isTimelineLayout = canvas?.layout === 'timeline';
  const isMapLayout = canvas?.layout === 'map';
  const isFreeformLayout = canvas?.layout === 'freeform' || (!isWallLayout && !isColumnsLayout && !isKanbanLayout && !isGanttLayout && !isSchedulerLayout && !isGridLayout && !isDrawingLayout && !isTimelineLayout && !isMapLayout);
  // Map boards keep a local collapse state so the button is available without
  // inheriting a saved global collapsed preference from other layouts.
  const effectiveToolbarCollapsed = isMapLayout ? isMapToolbarCollapsed : isToolbarCollapsed;
  const handleToolbarCollapseToggle = isMapLayout ? handleToggleMapToolbarCollapsed : handleToggleToolbarCollapsed;
  const usesConstantCanvasToolbarInset = canUseCanvasToolbar && (isFreeformLayout || isDrawingLayout);
  const sharedCanvasToolbarInsetPx =
    usesConstantCanvasToolbarInset
      ? 56
      : canUseCanvasToolbar && !effectiveToolbarCollapsed && (isMapLayout || isTimelineLayout || isSchedulerLayout || isColumnsLayout || isGridLayout)
        ? 56
        : 0;
  const currentMapStyleId =
    mapStyleIdOverride ||
    ((canvas?.settings as any)?.mapStyleId as string | undefined) ||
    'mapbox://styles/mapbox/streets-v11';

  useEffect(() => {
    if (!isMapLayout && isMapStylePanelOpen) {
      setIsMapStylePanelOpen(false);
    }
  }, [isMapLayout, isMapStylePanelOpen]);

  useEffect(() => {
    if (!isMapLayout) return;
    setIsMapSidebarOpen(true);
  }, [isMapLayout]);

  useEffect(() => {
    const styleId = (canvas?.settings as any)?.mapStyleId as string | undefined;
    if (styleId) setMapStyleIdOverride(styleId);
  }, [canvas?.id, (canvas?.settings as any)?.mapStyleId]);

  const handleMapStyleChange = useCallback(async (styleId: string) => {
    setMapStyleIdOverride(styleId);

    if (!canvasId) return;

    try {
      const nextSettings = {
        ...((canvas?.settings as any) || {}),
        mapStyleId: styleId,
      };
      const { error } = await supabase
        .from('boards')
        .update({ settings: nextSettings })
        .eq('id', canvasId);
      if (error) {
        toast.error('Map style changed locally but could not be saved');
        return;
      }
    } catch {
      toast.error('Map style changed locally but could not be saved');
    }
  }, [canvasId, canvas?.settings]);

  const splitContainerRef = useRef<HTMLDivElement>(null);

  const enableFreeformGraph = process.env.NEXT_PUBLIC_ENABLE_FREEFORM_GRAPH === 'true';
  const isFreeformGraphMode = isFreeformLayout && enableFreeformGraph;

  const getNewPostPosition = useCallback((cardWidth: number, cardHeight: number) => {
    const viewport = containerRef.current;
    const viewportWidth = viewport?.clientWidth || 1200;
    const viewportHeight = viewport?.clientHeight || 800;
    const scrollLeft = viewport?.scrollLeft || 0;
    const scrollTop = viewport?.scrollTop || 0;
    return {
      x: Math.max(0, Math.round((scrollLeft + viewportWidth / 2) / canvasZoom - cardWidth / 2)),
      y: Math.max(0, Math.round((scrollTop + viewportHeight / 2) / canvasZoom - cardHeight / 2)),
    };
  }, [canvasZoom]);

  const getCanvasPointFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const scrollLeft = containerRef.current?.scrollLeft || 0;
    const scrollTop = containerRef.current?.scrollTop || 0;
    if (!rect) {
      return { x: 0, y: 0 };
    }

    return {
      x: Math.max(0, Math.round((clientX - rect.left + scrollLeft) / canvasZoom)),
      y: Math.max(0, Math.round((clientY - rect.top + scrollTop) / canvasZoom)),
    };
  }, [canvasZoom]);

  const openFreeformBoardMenuAt = useCallback((clientX: number, clientY: number) => {
    const point = getCanvasPointFromClient(clientX, clientY);
    setFreeformBoardMenu({
      x: clientX,
      y: clientY,
      canvasX: point.x,
      canvasY: point.y,
    });
  }, [getCanvasPointFromClient]);

  const refreshClipboardAvailability = useCallback(async () => {
    setCanPasteFromClipboard(Boolean(await clipboardManager.paste()));
  }, []);

  const persistFreeformBoardAppearance = useCallback(async (
    updates: Partial<{ backgroundType: 'color' | 'gradient' | 'image'; backgroundValue: string; showDotGrid: boolean }>
  ) => {
    if (!canUseFreeformEditButton) {
      toast.error('You do not have permission to change the board background');
      return;
    }

    let nextAppearance = {
      backgroundType: updates.backgroundType ?? freeformBoardAppearance.backgroundType,
      backgroundValue: updates.backgroundValue ?? freeformBoardAppearance.backgroundValue,
      showDotGrid: updates.showDotGrid ?? freeformBoardAppearance.showDotGrid,
    };

    if (nextAppearance.showDotGrid && nextAppearance.backgroundType === 'image') {
      nextAppearance = {
        ...nextAppearance,
        backgroundType: 'color',
        backgroundValue: '#f3f4f6',
      };
    }

    setFreeformBoardAppearance(nextAppearance);

    if (!canvasId) return;

    try {
      const currentBackgroundType = canvas?.background_type || 'color';
      const currentBackgroundValue = canvas?.background_value || '#f3f4f6';
      const dotGridStorageKey = getFreeformDotGridStorageKey(canvasId);
      const currentShowDotGrid =
        typeof window !== 'undefined' && dotGridStorageKey
          ? window.localStorage.getItem(dotGridStorageKey) === 'true'
          : false;

      if (
        nextAppearance.backgroundType !== currentBackgroundType ||
        nextAppearance.backgroundValue !== currentBackgroundValue
      ) {
        const backgroundResponse = await supabase
          .from('boards')
          .update({
            background_type: nextAppearance.backgroundType,
            background_value: nextAppearance.backgroundValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', canvasId);

        if (backgroundResponse.error) {
          throw Object.assign(backgroundResponse.error, { scope: 'background' });
        }
      }

      if (nextAppearance.showDotGrid !== currentShowDotGrid) {
        if (typeof window !== 'undefined' && dotGridStorageKey) {
          window.localStorage.setItem(dotGridStorageKey, String(nextAppearance.showDotGrid));
        }
      }
    } catch (error) {
      const serializedError = (() => {
        if (error instanceof Error) {
          return {
            name: error.name,
            message: error.message,
            stack: error.stack,
          };
        }
        if (error && typeof error === 'object') {
          const record = error as Record<string, unknown>;
          return {
            ownKeys: Object.getOwnPropertyNames(record),
            message: typeof record.message === 'string' ? record.message : undefined,
            details: typeof record.details === 'string' ? record.details : undefined,
            hint: typeof record.hint === 'string' ? record.hint : undefined,
            code: typeof record.code === 'string' ? record.code : undefined,
            status: typeof record.status === 'number' ? record.status : undefined,
            scope: typeof record.scope === 'string' ? record.scope : undefined,
            raw: record,
          };
        }
        return { raw: error };
      })();
      console.warn('Failed to save freeform board appearance:', serializedError);
      toast.error('Board background changed locally but could not be saved');
    }
  }, [canUseFreeformEditButton, canvasId, canvas?.background_type, canvas?.background_value, freeformBoardAppearance]);

  useEffect(() => {
    void refreshClipboardAvailability();
  }, [refreshClipboardAvailability]);

  const {
    saveNote,
    saveLink,
    saveTodo,
    saveTable,
    saveContainer,
    saveComment,
    saveCard,
    saveImage,
    saveDrawing,
    saveAIComponent
  } = usePadletSave({
    canvasId: canvasId ?? null,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isDrawingLayout,
    isTimelineLayout,
    isSchedulerLayout,
    isFreeformLayout,
    isMapLayout,
    setPadletToEdit,
    fetchData,
    setIsNoteEditorOpen,
    setIsLinkEditorOpen,
    setIsTodoEditorOpen,
    setIsTableEditorOpen,
    setIsContainerEditorOpen,
    setIsCommentEditorOpen,
    setIsCardEditorOpen,
    setIsImageEditorOpen,
    setIsDrawingEditorOpen,
    setIsAIComponentEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    padlets,
    setPadlets,
    getNewPostPosition,
    onDrawingPlacementStart: (draft) => {
      const _as = drawingAppStateRef.current;
      const _zoom = (typeof _as?.zoom?.value === 'number' && _as.zoom.value > 0) ? _as.zoom.value : 1;
      const _scrollX = typeof _as?.scrollX === 'number' ? _as.scrollX : 0;
      const _scrollY = typeof _as?.scrollY === 'number' ? _as.scrollY : 0;
      const _offsetLeft = typeof _as?.offsetLeft === 'number' ? _as.offsetLeft : 0;
      const _offsetTop = typeof _as?.offsetTop === 'number' ? _as.offsetTop : 0;
      const _centerX = ((window.innerWidth - _offsetLeft) / 2 / _zoom) - _scrollX;
      const _centerY = ((window.innerHeight - _offsetTop) / 2 / _zoom) - _scrollY;
      const positionFields = (Number.isFinite(_centerX) && Number.isFinite(_centerY))
        ? { position_x: _centerX, position_y: _centerY }
        : {};
      setDrawingPendingDraft({ ...draft, ...positionFields } as any);
      setDrawingContainerPromptOpen(true);
    },
    onTimelinePlacementStart: (draft) => {
      if (chronoMode === 'horizontal-all') {
        setPendingPostDraft(draft);
        setPlacementPromptMode('timeline-horizontal-all');
        setIsPlacementPromptOpen(true);
        return;
      }

      setPendingPostDraft(draft);
      setPlacementContext('columns');
      setNewPostDragState({
        isActive: true,
        draft,
        cursor: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 }
      });
      toast.info('Click a container to place your post');
    },
    onSchedulerPlacementStart: (draft) => {
      setPendingPostDraft(draft);
      setPlacementContext('scheduler');
      setNewPostDragState({
        isActive: true,
        draft,
        cursor: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 }
      });
      toast.info('Drag onto a time slot to place your post');
    },
  });

  // Scroll to bottom when toggling Gantt or Scheduler so they are instantly visible
  useEffect(() => {
    if ((isGanttVisible || isSchedulerVisible) && splitContainerRef.current) {
      setTimeout(() => {
        splitContainerRef.current?.scrollTo({
          top: splitContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      }, 50); // small delay to allow render
    }
  }, [isGanttVisible, isSchedulerVisible]);

  // Initialize chrono mode from canvas settings
  useEffect(() => {
    if (canvas && canvas.layout === 'timeline') {
      const saved = (canvas as any)?.settings?.chronoMode as ChronoMode | undefined;
      if (saved) {
        setChronoMode(saved);
      } else {
        setShowChronoModeModal(true);
      }
    }
  }, [canvas?.id, canvas?.layout]);

  // Check B — Confirm runtime is grid
  useEffect(() => {
  }, [canvas?.layout]);

  // === BEGIN INTERACTIONS REGION ===

  // Memoized rootPadlets - only recalculates when padlets array changes
  const rootPadlets = useMemo(
    () => padlets.filter(p => !p.metadata?.parentId),
    [padlets]
  );

  useEffect(() => {
    if (!selectedPadletId || selectedPadletIds.length === 0) return;
    setSelectedPadletIds([]);
  }, [selectedPadletId, selectedPadletIds.length, setSelectedPadletIds]);



  // Order padlets for wall layout
  const wallOrderedPadlets = useMemo(() => {
    if (isWallLayout) {
      const rootContainers = rootPadlets.filter(
        p => p.type === 'container' || (p.metadata as any)?.kind === 'container' || (p.metadata as any)?.isContainer
      );

      return [...rootContainers].sort((a, b) => {
        const posA = (a.metadata as any)?.wallPosition ?? Number.MAX_SAFE_INTEGER;
        const posB = (b.metadata as any)?.wallPosition ?? Number.MAX_SAFE_INTEGER;
        if (posA !== posB) return posA - posB;

        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    }

    if (!isGridLayout) return rootPadlets;

    return [...rootPadlets].sort((a, b) => {
      const posA = (a.metadata as any)?.wallPosition ?? Number.MAX_SAFE_INTEGER;
      const posB = (b.metadata as any)?.wallPosition ?? Number.MAX_SAFE_INTEGER;
      if (posA !== posB) return posA - posB;

      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();
      return dateB - dateA; // Newest first
    });
  }, [isWallLayout, isGridLayout, rootPadlets]);

  // Sections sorted by position - stable reference reused by ColumnsLayout and RowCanvasDnD
  const sortedSections = useMemo(
    () => sections.slice().sort((a, b) => a.position - b.position),
    [sections]
  );

  // Derived columns data for ColumnsLayout - avoids recomputing slice+sort+map+filter inline each render
  const columnsLayoutData = useMemo(
    () => sortedSections.map(section => ({
      section,
      posts: padlets.filter(p => {
        const pSectionId = (p.metadata as any)?.sectionId;
        const hasParent = (p.metadata as any)?.parentId;
        return pSectionId == section.id && !hasParent;
      }),
    })),
    [sortedSections, padlets]
  );

  // Stable settings object for WallCanvas - avoids new object reference every render
  const wallCanvasSettings = useMemo(
    () => ({
      ...((canvas as any)?.settings ?? {}),
      background_type: canvas?.background_type,
      background_value: canvas?.background_value,
    }),
    [canvas?.settings, canvas?.background_type, canvas?.background_value]
  );

  const handleWallReorder = useCallback(async (reorderedPadlets: Padlet[]) => {
    if (!reorderedPadlets?.length) return;

    // Safety: only process root containers (in case WallCanvas passes something unexpected)
    const rootContainers = reorderedPadlets.filter(
      p => p.type === 'container' && !(p.metadata as any)?.parentId
    );

    if (rootContainers.length === 0) {
      console.warn('[handleWallReorder] No root containers in reordered array');
      return;
    }

    // Assign new positions with gaps
    const POSITION_GAP = 1000;
    const updates = rootContainers.map((padlet, idx) => ({
      id: padlet.id,
      wallPosition: idx * POSITION_GAP,
    }));

    // Optimistic UI update
    setPadlets(prev =>
      prev.map(p => {
        const update = updates.find(u => u.id === p.id);
        if (update) {
          return {
            ...p,
            metadata: {
              ...p.metadata,
              wallPosition: update.wallPosition,
            },
          };
        }
        return p;
      })
    );

    // Persist only the affected containers
    try {
      for (const { id, wallPosition } of updates) {
        const original = padlets.find(p => p.id === id);
        if (!original) continue;

        const { error } = await supabase
          .from('padlets')
          .update({
            metadata: {
              ...original.metadata,
              wallPosition,
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        if (error) throw error;
      }
    } catch (err) {
      console.error('[handleWallReorder] Save failed:', err);
      toast.error("Could not save new order – changes may be lost on refresh");
      // Optional: refetch to rollback UI
      // await fetchData();
    }
  }, [padlets, supabase]);

  const moveContainerToSection = async (
    containerId: string,
    toSectionId: string,
    targetIndex: number,
    fromSectionIdOverride?: string
  ) => {
    const container = padlets.find((p) => p.id === containerId);

    if (!container) {
      return;
    }

    // Only meaningful for containers in columns layout
    if (!isColumnsLayout || container.type !== 'container') {
      return;
    }

    const fromSectionId = fromSectionIdOverride ?? String((container.metadata as any)?.sectionId ?? '');

    // Allow same-section reorder (removed early return)
    // if (fromSectionId && String(fromSectionId) === String(toSectionId)) return;

    // 1. Get siblings in target section (excluding the moving container)
    // We only care about ROOT containers (no parentId) in that section
    const targetSiblings = padlets
      .filter(p => {
        const md = (p.metadata as any) || {};
        // Must be in target section
        const inTarget = String(md.sectionId) === String(toSectionId);
        // Must be root (unless we support nesting later, but for now containers are root)
        const isRoot = !md.parentId;
        // Exclude self (if reordering in same section)
        const isNotSelf = p.id !== containerId;
        return inTarget && isRoot && isNotSelf;
      })
      .sort((a, b) => Number((a.metadata as any)?.sectionPosition ?? 0) - Number((b.metadata as any)?.sectionPosition ?? 0));

    // 2. Clamp index to valid range
    // Can be 0 to length (insert at end)
    const clampedIndex = Math.max(0, Math.min(targetIndex, targetSiblings.length));

    // 3. Insert container into the siblings array
    const nextOrder = [...targetSiblings];
    nextOrder.splice(clampedIndex, 0, container);

    // 4. Calculate updates for the TARGET section
    // We reassign sectionPosition 0..N for everyone in this list
    const updates: { id: string; sectionId: string; sectionPosition: number }[] = nextOrder.map((p, idx) => ({
      id: p.id,
      sectionId: toSectionId,
      sectionPosition: idx
    }));

    // 5. If moving ACROSS sections, we should also re-index the SOURCE section 
    // to prevent gaps, although gaps are usually harmless. Best practice: reindex source.
    let sourceUpdates: { id: string; sectionId: string; sectionPosition: number }[] = [];
    if (fromSectionId && String(fromSectionId) !== String(toSectionId)) {
      const sourceSiblings = padlets
        .filter(p => {
          const md = (p.metadata as any) || {};
          return String(md.sectionId) === String(fromSectionId) && !md.parentId && p.id !== containerId;
        })
        .sort((a, b) => Number((a.metadata as any)?.sectionPosition ?? 0) - Number((b.metadata as any)?.sectionPosition ?? 0));

      sourceUpdates = sourceSiblings.map((p, idx) => ({
        id: p.id,
        sectionId: fromSectionId, // stays same
        sectionPosition: idx
      }));
    }

    // Children (by parentId) need to move to new section
    const childPadlets = padlets.filter((p) => (p.metadata as any)?.parentId === containerId);

    // Snapshot for rollback
    const oldPadlets = [...padlets];

    // OPTIMISTIC UPDATE
    setPadlets((prev) => {
      // Create a map of updates for fast lookup
      const updateMap = new Map<string, { sectionId?: string; sectionPosition?: number }>();

      updates.forEach(u => updateMap.set(u.id, { sectionId: u.sectionId, sectionPosition: u.sectionPosition }));
      sourceUpdates.forEach(u => updateMap.set(u.id, { sectionPosition: u.sectionPosition })); // sectionId doesn't change for source

      return prev.map((p) => {
        // Apply root updates (target list + source list)
        if (updateMap.has(p.id)) {
          const up = updateMap.get(p.id)!;
          return {
            ...p,
            metadata: {
              ...(p.metadata as any),
              ...up
            }
          };
        }
        // Update children to follow container
        if ((p.metadata as any)?.parentId === containerId) {
          return {
            ...p,
            metadata: {
              ...(p.metadata as any),
              sectionId: toSectionId,
            }
          };
        }
        return p;
      });
    });

    try {
      // We need to persist ALL modified root items (container + target siblings + source siblings)
      // plus children of the moving container.

      const allRootUpdates = [...updates, ...sourceUpdates];

      // Persist root updates
      const rootPromises = allRootUpdates.map(u =>
        supabase
          .from('padlets')
          .update({
            metadata: {
              // We need to merge with existing metadata in DB, but we only have local snap.
              // Ideally we fetch-update, but for speed we merge local.
              ...(padlets.find(p => p.id === u.id)?.metadata as any),
              sectionId: u.sectionId,
              sectionPosition: u.sectionPosition
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', u.id)
      );

      // Persist children updates (sectionId only)
      const childrenPromises = childPadlets.map(p =>
        supabase
          .from('padlets')
          .update({
            metadata: { ...(p.metadata as any), sectionId: toSectionId },
            updated_at: new Date().toISOString()
          })
          .eq('id', p.id)
      );

      await Promise.all([...rootPromises, ...childrenPromises]);
    } catch (err) {
      console.error('❌ Failed to move container, rolling back:', err);
      // ROLLBACK
      setPadlets(oldPadlets);
    }
  };

  // --- Column Layout Post Placement Handlers ---

  // Helper: Convert pendingPostDraft to database insert payload
  // This ensures content is properly set for all post types
  const draftToInsertPayload = (draft: PendingPostDraft, parentId?: string) => {
    const basePayload = {
      board_id: canvasId,
      position_x: 0,
      position_y: 0,
      width: 280,
      height: 280,
    };

    switch (draft.kind) {
      case 'note':
        return {
          ...basePayload,
          title: '',
          content: draft.content,
          type: 'text',
          metadata: { ...draft.metadata, parentId },
        };

      case 'link':
        return {
          ...basePayload,
          title: draft.title || draft.metadata?.linkTitle || draft.metadata?.title || 'Link', // Use draft.title first
          content: draft.content || draft.metadata?.url || '',
          type: 'link',
          metadata: { ...draft.metadata, parentId },
        };

      case 'todo':
        return {
          ...basePayload,
          title: draft.metadata?.todoTitle || 'To-do',
          content: draft.content || JSON.stringify(draft.metadata?.tasks || []),
          type: 'todo',
          metadata: { ...draft.metadata, parentId },
        };

      case 'table':
        return {
          ...basePayload,
          title: draft.metadata?.tableTitle || 'Table',
          content: draft.content || JSON.stringify(draft.metadata?.tableData || []),
          type: 'table',
          metadata: { ...draft.metadata, parentId },
        };

      case 'image':
        return {
          ...basePayload,
          title: draft.title || draft.metadata?.caption || 'Image', // Use draft.title
          // If we have a real file_url in the draft (from upload/image handler), use it.
          // Otherwise fallback to metadata.imageUrl for legacy or external images.
          file_url: draft.metadata?.imageUrl ?? draft.metadata?.fileUrl ?? draft.file_url ?? null,
          content: '', // Images usually have empty content related to text
          type: 'image',
          width: draft.width || 300,
          height: draft.height || 200,
          metadata: {
            ...draft.metadata,
            parentId
          },
        };

      case 'comment':
        return {
          ...basePayload,
          title: 'Comment',
          // Use the draft content (preview text) if available, else JSON stringify comments
          content: typeof draft.content === 'string' ? draft.content : JSON.stringify(draft.metadata?.comments || []),
          type: 'comment',
          width: 50,
          height: 50,
          metadata: { ...draft.metadata, parentId },
        };

      case 'drawing':
        return {
          ...basePayload,
          title: 'Drawing',
          // Use file_url as the previewUrl if set
          file_url: draft.file_url || draft.metadata?.previewUrl,
          content: '',
          type: 'drawing',
          width: 400,
          height: 300,
          metadata: {
            ...draft.metadata,
            previewUrl: draft.file_url || draft.metadata?.previewUrl,
            parentId
          },
        };

      case 'card':
        return {
          ...basePayload,
          title: draft.title || '',
          content: draft.content || '',
          type: 'card',
          width: 180,
          height: 220,
          metadata: { ...draft.metadata, parentId },
        };

      case 'ai-component':
        return {
          ...basePayload,
          title: 'AI Component',
          content: draft.content || '',
          type: 'ai-component',
          width: 500,
          height: 400,
          metadata: { ...draft.metadata, parentId },
        };

      default:
        // Fallback for any other types
        return {
          ...basePayload,
          title: '',
          content: draft.content,
          type: draft.kind,
          metadata: { ...draft.metadata, parentId },
        };
    }
  };

  // Wall Layout Handlers
  const handleCreateWallContainerWithDraft = async () => {
    if (!wallPendingPostDraft || !canvasId) return;

    try {
      // 1. Determine new wall position (Append to end)
      const maxPos = wallOrderedPadlets.reduce((max, p) => Math.max(max, (p.metadata as any)?.wallPosition ?? 0), -1);
      const newPos = maxPos + 1;

      // 2. Create Container
      const containerId = crypto.randomUUID();
      const containerPayload = {
        id: containerId,
        board_id: canvasId,
        title: 'New Container',
        content: '',
        type: 'container',
        position_x: 0, // Ignored by Wall grid, but required
        position_y: 0,
        width: 280, // Standard Wall Container Width
        height: 200, // Standard Min-Height
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          childPadletIds: [], // Will fill next
          wallPosition: newPos,
          kind: 'container',
          isContainer: true
        }
      };

      // Optimistic Container
      setPadlets(prev => [...prev, containerPayload as any]);

      // 3. Create Child Post
      const childPayload = draftToInsertPayload(wallPendingPostDraft, containerId);

      const { data: childData, error: childError } = await supabase
        .from('padlets')
        .insert(childPayload)
        .select()
        .single();

      if (childError) throw childError;

      // 4. Update container metadata with child ID and save container
      const finalContainerPayload = {
        ...containerPayload,
        metadata: {
          ...containerPayload.metadata,
          childPadletIds: [childData.id]
        }
      };

      const { error: containerError } = await supabase
        .from('padlets')
        .insert(finalContainerPayload);

      if (containerError) throw containerError;

      // Update local state with child
      setPadlets(prev => prev.map(p => p.id === containerId ? finalContainerPayload as any : p));
      setPadlets(prev => [...prev, childData as Padlet]);

      setWallPlacementPromptOpen(false);
      setWallPendingPostDraft(null);
      toast.success('Container with post created');

    } catch (e) {
      console.error('Failed to create wall container/post:', e);
      toast.error('Failed to create container');
      fetchData();
    }
  };

  const handleCreateHorizontalAllTimelineContainerWithDraft = async () => {
    const currentDraft = pendingPostDraftRef.current;
    if (!currentDraft || !canvasId || chronoMode !== 'horizontal-all') return;

    const existingContainers = getTimelineContainers();
    const insertPosition = existingContainers.reduce((max, container) => (
      Math.max(max, (container.metadata as any)?.position_in_timeline ?? -1)
    ), -1) + 1;
    const containerId = crypto.randomUUID();

    try {
      const containerPayload = {
        id: containerId,
        board_id: canvasId,
        title: currentDraft.title || 'New Event',
        content: '',
        type: 'container',
        position_x: 0,
        position_y: 0,
        width: 280,
        height: 200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          childPadletIds: [],
          cardColor: '#ffffff',
          topStrip: 'transparent',
          kind: 'container',
          isContainer: true,
          position_in_timeline: insertPosition,
        },
      };

      setPadlets((prev) => [...prev, containerPayload as any]);

      const childPayload = draftToInsertPayload(currentDraft, containerId);
      const { data: childData, error: childError } = await supabase
        .from('padlets')
        .insert(childPayload)
        .select()
        .single();

      if (childError) throw childError;

      const finalContainerPayload = {
        ...containerPayload,
        metadata: {
          ...containerPayload.metadata,
          childPadletIds: [childData.id],
        },
      };

      const { error: containerError } = await supabase
        .from('padlets')
        .insert(finalContainerPayload);

      if (containerError) {
        await deletePadletByIdRaw(childData.id);
        throw containerError;
      }

      setPadlets((prev) => prev.map((p) => (
        p.id === containerId ? finalContainerPayload as any : p
      )));
      setPadlets((prev) => [...prev, childData as Padlet]);

      setIsPlacementPromptOpen(false);
      setPendingPostDraft(null);
      setPlacementPromptMode(null);
      toast.success('Container with post created');
    } catch (err: any) {
      console.error('Failed to create timeline container/post:', err);
      toast.error('Failed to create container');
      setPadlets((prev) => prev.filter((p) => p.id !== containerId));
      fetchData();
    }
  };

  // Helper to create post from draft (Scoped to Component)
  const createRealPostFromDraft = async (draft: PendingPostDraft, containerId: string) => {
    try {
      const container = padlets.find(p => p.id === containerId);
      if (!container) return;

      const newId = crypto.randomUUID();
      const currentChildren = (container.metadata as any)?.childPadletIds || [];

      const newPost: any = {
        id: newId,
        board_id: canvasId,
        title: draft.title || '',
        content: draft.content || '',
        type: draft.kind,
        width: 300,
        height: 200,
        position_x: 0,
        position_y: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          parentId: containerId,
          ...draft.metadata
          // Add other draft fields if relevant
        }
      };

      // 1. Optimistic Post Add
      setPadlets(prev => [...prev, newPost]);

      // 2. Update Container Children (Optimistic)
      const newChildren = [...currentChildren, newId];
      setPadlets(prev => prev.map(p =>
        p.id === containerId
          ? { ...p, metadata: { ...p.metadata, childPadletIds: newChildren } }
          : p
      ));

      // 3. Persist Post
      const { error: postError } = await insertPadlet(newPost);
      if (postError) throw postError;

      // 4. Persist Container Update
      const { error: containerError } = await supabase
        .from('padlets')
        .update({
          metadata: { ...container.metadata, childPadletIds: newChildren },
          updated_at: new Date().toISOString()
        })
        .eq('id', containerId);

      if (containerError) throw containerError;

      toast.success('Post added to container');

    } catch (err) {
      console.error('Failed to place post in container:', err);
      toast.error('Failed to place post');
      fetchData(); // Rollback
    }
  };

  // Keep a ref to always point at the latest createRealPostFromDraft
  // (avoids stale closure when the ghost-drag useEffect captures an old version
  //  whose padlets snapshot was from a previous render — e.g. right after refresh)
  const createRealPostFromDraftRef = useRef(createRealPostFromDraft);
  useEffect(() => { createRealPostFromDraftRef.current = createRealPostFromDraft; });

  const handleCreateEmptyWallContainer = async () => {
    // Mandatory Guards (Top of Function)
    if (!canvasId) {
      return;
    }
    if (canvas?.layout !== 'wall' && canvas?.layout !== 'grid') { // Also allow for grid layout
      return;
    }

    try {
      // 1. Determine next wallPosition based on existing root containers
      const rootContainers = padlets.filter(p => p.type === 'container' && !(p.metadata as any)?.parentId);

      const maxPos = rootContainers.reduce((max, p) => Math.max(max, (p.metadata as any)?.wallPosition ?? 0), -1);
      const nextPos = maxPos + 1;

      // 2. Create one new padlet (Container Only)
      const containerId = crypto.randomUUID();
      const containerPayload = {
        id: containerId,
        board_id: canvasId,
        title: 'New Container',
        content: '',
        type: 'container',
        position_x: 0,
        position_y: 0,
        width: 280,
        height: 200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          childPadletIds: [],
          wallPosition: nextPos,
          kind: 'container',
          isContainer: true,
          zIndex: Date.now(),
        }
      };

      // 3. Optimistically add it to local state
      setPadlets(prev => [...prev, containerPayload as any]);

      // 4. Insert it into the database
      const { error } = await supabase
        .from('padlets')
        .insert(containerPayload);

      if (error) throw error;
      toast.success('Empty container created');

    } catch {
      toast.error('Failed to create container');
      fetchData(); // Rollback state or refetch
    }
  };

  const handleCreateEmptyFreeformContainer = useCallback(async () => {
    if (!canvasId || !isFreeformLayout) return;

    const containerId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const viewport = containerRef.current;
    const viewportWidth = viewport?.clientWidth || 1200;
    const viewportHeight = viewport?.clientHeight || 800;
    const scrollLeft = viewport?.scrollLeft || 0;
    const scrollTop = viewport?.scrollTop || 0;
    const width = 350;
    const height = 300;
    const positionX = Math.max(0, Math.round((scrollLeft + viewportWidth / 2) / canvasZoom - width / 2));
    const positionY = Math.max(0, Math.round((scrollTop + viewportHeight / 2) / canvasZoom - height / 2));

    const containerPayload: Padlet = {
      id: containerId,
      board_id: canvasId,
      title: 'New Column',
      content: '',
      type: 'container',
      position_x: positionX,
      position_y: positionY,
      width,
      height,
      created_at: nowIso,
      updated_at: nowIso,
      metadata: {
        cardColor: '#ffffff',
        childPadletIds: [],
        kind: 'container',
        isContainer: true,
        zIndex: Date.now(),
      } as any,
    };

    setPadlets((prev) => [...prev, containerPayload]);
    setSelectedPadletId(containerId);

    const { error } = await insertPadlet(containerPayload as any);
    if (error) {
      setPadlets((prev) => prev.filter((p) => p.id !== containerId));
      setSelectedPadletId(null);
      console.error('Failed to create freeform column:', {
        error: (() => {
          try {
            return JSON.parse(JSON.stringify(error));
          } catch {
            return {
              message: (error as any)?.message,
              details: (error as any)?.details,
              hint: (error as any)?.hint,
              code: (error as any)?.code,
            };
          }
        })(),
        payload: containerPayload,
      });
      toast.error('Failed to create column');
      fetchData();
      return;
    }

    toast.success('Empty column created');
  }, [canvasId, isFreeformLayout, canvasZoom, insertPadlet, fetchData]);


  // Handle "Add to Existing" from Column Placement Prompt
  const handleStartDragToExisting = () => {
    if (pendingPostDraft) {
      // Defensive - close both prompts to prevent blocking
      setIsPlacementPromptOpen(false);
      setWallPlacementPromptOpen(false);
      setPlacementPromptMode(null);

      // Set origin context
      setPlacementContext('columns');

      // Use the GLOBAL drag state (Ghost) to match Wall layout behavior
      setNewPostDragState({
        isActive: true,
        draft: pendingPostDraft,
        cursor: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 }
      });
      toast.info('Click a container to place your post');
    }
  };

  const handleStartDragToExistingFromHorizontalAll = () => {
    if (!pendingPostDraft || chronoMode !== 'horizontal-all') return;

    setIsPlacementPromptOpen(false);
    setWallPlacementPromptOpen(false);
    setPlacementPromptMode(null);
    setPlacementContext('timeline-horizontal-all');
    setNewPostDragState({
      isActive: true,
      draft: pendingPostDraft,
      cursor: { x: 0, y: 0 },
      grabOffset: { x: 0, y: 0 }
    });
    toast.info('Click a container to place your post');
  };


  // Handle "Add to Existing" from Wall Placement Prompt
  const handleWallStartPickExisting = () => {
    if (wallPendingPostDraft) {
      // Step 5: Defensive - close both prompts to prevent blocking
      setIsPlacementPromptOpen(false);
      setWallPlacementPromptOpen(false);

      // Step 2B: Set origin context
      setPlacementContext('wall');

      // Use the GLOBAL drag state (Ghost) to match Columns layout behavior
      setNewPostDragState({
        isActive: true,
        draft: wallPendingPostDraft,
        cursor: { x: 0, y: 0 },
        grabOffset: { x: 0, y: 0 }
      });
      toast.info('Click a container to place your post');
      // We don't need setWallPlacementMode('picking_container') anymore
      // logic is handled by newPostDragState check in onPadletEdit
    }
  };

  // Handle container selection for placement
  const handleContainerPick = async (containerId: string) => {
    // Check if we are in "Ghost Drag" mode (Columns or Wall unified)
    if (newPostDragState.isActive && newPostDragState.draft) {
      const draft = newPostDragState.draft;

      // Create the real post inside this container
      await createRealPostFromDraft(draft, containerId);

      // Clear state
      setNewPostDragState(prev => ({ ...prev, isActive: false, draft: null }));
      setWallPendingPostDraft(null); // Clear wall draft too just in case
      return;
    }

    // Legacy fallback (shouldn't be hit with new flow, but keeping for safety)
    if (wallPlacementMode === 'pickExistingContainer' && wallPendingPostDraft) {
      await createRealPostFromDraft(wallPendingPostDraft, containerId);
      setWallPlacementMode('idle');
      setWallPendingPostDraft(null);
    }
  };

  const handlePlaceInExisting = handleContainerPick;

  // --- Ghost Drag Mouse Tracking ---
  // Use a ref so handleMouseUp always reads the latest hover target
  // (avoids stale closure when React hasn't flushed the state update from handleMouseMove)
  const hoverContainerRef = useRef<string | null>(null);
  const hoverSchedulerSlotStartRef = useRef<string | null>(null);

  useEffect(() => {
    if (!newPostDragState.isActive) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Use elementsFromPoint to look through the ghost overlay (which has
      // pointer-events:none but still blocks elementFromPoint)
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      let containerEl: Element | null = null;
      let slotStartEl: Element | null = null;
      for (const el of elements) {
        const found = el.closest('[data-container-id], [data-scheduler-container-id]');
        if (found) { containerEl = found; break; }
      }
      if (!containerEl && placementContext === 'scheduler') {
        for (const el of elements) {
          const found = el.closest('[data-scheduler-slot-start]');
          if (found) { slotStartEl = found; break; }
        }
      }

      setNewPostDragState(prev => ({
        ...prev,
        cursor: { x: e.clientX, y: e.clientY }
      }));

      const hoverId = containerEl?.getAttribute('data-container-id')
        || containerEl?.getAttribute('data-scheduler-container-id')
        || null;
      hoverContainerRef.current = hoverId;
      setNewPostHoverContainerId(hoverId);
      hoverSchedulerSlotStartRef.current = hoverId ? null : slotStartEl?.getAttribute('data-scheduler-slot-start') || null;
    };

    const handleMouseUp = (e: MouseEvent) => {
      // Recompute the drop target fresh from the actual mouseup coordinates
      // instead of trusting hoverContainerRef/hoverSchedulerSlotStartRef —
      // those are only updated on mousemove, so a missed/coalesced move event
      // (fast drag, or a stale ref left over from a prior drag session) could
      // otherwise attach the post to whatever container was last hovered
      // instead of where it was actually dropped.
      const elements = document.elementsFromPoint(e.clientX, e.clientY);
      let containerEl: Element | null = null;
      let slotStartEl: Element | null = null;
      for (const el of elements) {
        const found = el.closest('[data-container-id], [data-scheduler-container-id]');
        if (found) { containerEl = found; break; }
      }
      if (!containerEl && placementContext === 'scheduler') {
        for (const el of elements) {
          const found = el.closest('[data-scheduler-slot-start]');
          if (found) { slotStartEl = found; break; }
        }
      }
      const hoverId = containerEl?.getAttribute('data-container-id')
        || containerEl?.getAttribute('data-scheduler-container-id')
        || null;
      const hoverSlotStart = hoverId ? null : slotStartEl?.getAttribute('data-scheduler-slot-start') || null;
      if (hoverId && newPostDragState.draft) {
        createRealPostFromDraftRef.current(newPostDragState.draft, hoverId);
        setWallPendingPostDraft(null);
        setPlacementContext(null);
        setPlacementPromptMode(null);
        setNewPostDragState({ isActive: false, draft: null, cursor: { x: 0, y: 0 }, grabOffset: { x: 0, y: 0 } });
        setNewPostHoverContainerId(null);
        hoverContainerRef.current = null;
        hoverSchedulerSlotStartRef.current = null;
      } else if (placementContext === 'scheduler' && hoverSlotStart && newPostDragState.draft) {
        const draft = newPostDragState.draft;
        const start = new Date(hoverSlotStart);
        const end = new Date(start.getTime() + 60 * 60 * 1000);
        setNewPostDragState({ isActive: false, draft: null, cursor: { x: 0, y: 0 }, grabOffset: { x: 0, y: 0 } });
        setPlacementContext(null);
        hoverContainerRef.current = null;
        hoverSchedulerSlotStartRef.current = null;
        placeDraftInNewSchedulerContainer(draft, start, end);
      } else if (placementContext === 'scheduler') {
        // Dropped outside the scheduler grid entirely — nothing to attach to.
        toast.info('Drop your post onto the scheduler to place it');
        setNewPostDragState({ isActive: false, draft: null, cursor: { x: 0, y: 0 }, grabOffset: { x: 0, y: 0 } });
        setPendingPostDraft(null);
        setPlacementContext(null);
        hoverContainerRef.current = null;
        hoverSchedulerSlotStartRef.current = null;
      } else {
        setNewPostDragState({ isActive: false, draft: null, cursor: { x: 0, y: 0 }, grabOffset: { x: 0, y: 0 } });
        if (placementContext === 'wall') {
          setWallPlacementPromptOpen(true);
        } else {
          if (placementContext === 'timeline-horizontal-all') {
            setPlacementPromptMode('timeline-horizontal-all');
          }
          setIsPlacementPromptOpen(true);
        }
        setPlacementContext(null);
        hoverContainerRef.current = null;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setNewPostDragState({ isActive: false, draft: null, cursor: { x: 0, y: 0 }, grabOffset: { x: 0, y: 0 } });
        setPendingPostDraft(null);
        setPlacementPromptMode(null);
        setPlacementContext(null);
        hoverContainerRef.current = null;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [newPostDragState.isActive, newPostDragState.draft, placementContext]);

  const {
    isDragging,
    draggingPadletId,
    handlePadletMouseDown,
    handleCanvasMouseMove,
    handleCanvasMouseUp,
  } = useCanvasInteractions({
    containerRef,
    canvasZoom,
    canEditCanvas: canUseFreeformEditButton,
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
  });

  const stopFreeformPan = useCallback(() => {
    freeformPanStartRef.current = null;
    setIsFreeformPanning(false);
  }, []);

  const handleFreeformPanMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!isFreeformLayout || isAnyEditorOpen || isDragging || newPostDragState.isActive || isLineMode) return;
    if (e.button !== 0) return;

    const target = e.target as HTMLElement;
    if (target.closest('[data-padlet-id], [data-no-drag="true"], button, input, textarea, select, a, [contenteditable="true"]')) {
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    freeformPanStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
    setIsFreeformPanning(true);
    e.preventDefault();
  }, [isAnyEditorOpen, isDragging, isFreeformLayout, isLineMode, newPostDragState.isActive]);

  const handleViewportMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isFreeformPanning) {
      const container = containerRef.current;
      const panStart = freeformPanStartRef.current;
      if (!container || !panStart) return;

      container.scrollLeft = panStart.scrollLeft - (e.clientX - panStart.clientX);
      container.scrollTop = panStart.scrollTop - (e.clientY - panStart.clientY);
      e.preventDefault();
      return;
    }

    handleCanvasMouseMove(e);
  }, [handleCanvasMouseMove, isFreeformPanning]);

  const handleViewportMouseUp = useCallback(() => {
    if (isFreeformPanning) {
      stopFreeformPan();
      return;
    }

    if (newPostDragState.isActive) {
      handleCanvasMouseUp();
      return;
    }
    if (isAnyEditorOpen) return;
    handleCanvasMouseUp();
  }, [handleCanvasMouseUp, isAnyEditorOpen, isFreeformPanning, newPostDragState.isActive, stopFreeformPan]);

  useEffect(() => {
    if (!isFreeformPanning) return;

    const handleWindowMouseMove = (event: MouseEvent) => {
      const container = containerRef.current;
      const panStart = freeformPanStartRef.current;
      if (!container || !panStart) return;

      container.scrollLeft = panStart.scrollLeft - (event.clientX - panStart.clientX);
      container.scrollTop = panStart.scrollTop - (event.clientY - panStart.clientY);
    };

    const handleWindowMouseUp = () => {
      stopFreeformPan();
    };

    window.addEventListener('mousemove', handleWindowMouseMove);
    window.addEventListener('mouseup', handleWindowMouseUp);
    window.addEventListener('blur', handleWindowMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
      window.removeEventListener('blur', handleWindowMouseUp);
    };
  }, [isFreeformPanning, stopFreeformPan]);

  const handleCreateNewContainerWithDraft = async () => {
    // Use ref to get current value (avoids stale closure)
    const currentDraft = pendingPostDraftRef.current;

    if (!currentDraft || !canvasId) {
      return;
    }

    // 1. Determine target section
    const targetSectionId = activeSectionId || sections[0]?.id;
    if (!targetSectionId) {
      toast.error("Please create a section first");
      setPendingPostDraft(null); // Clear draft to avoid stuck state
      setIsPlacementPromptOpen(false);
      setPlacementPromptMode(null);
      return;
    }

    // 2. Create Container ID first (declared outside try for catch access)
    const containerId = crypto.randomUUID();

    try {
      // 3. Build the container payload (without child yet for optimistic update)
      const containerPayload = {
        id: containerId,
        board_id: canvasId,
        title: 'New Container',
        content: '',
        type: 'container',
        position_x: 0,
        position_y: 0,
        width: 280,
        height: 200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          cardColor: '#ffffff',
          childPadletIds: [], // Will fill after child creation
          sectionId: targetSectionId.toString(),
          kind: 'container',
          isContainer: true
        },
      };

      // Optimistic update for Container (shows immediately)
      setPadlets(prev => [...prev, containerPayload as any]);

      // 4. Create Child Padlet FIRST (like Wall logic)
      const childPayload = draftToInsertPayload(currentDraft, containerId);
      const { data: childData, error: childError } = await supabase
        .from('padlets')
        .insert(childPayload)
        .select()
        .single();

      if (childError) throw childError;

      // 5. Now create the final container payload WITH the child ID
      const finalContainerPayload = {
        ...containerPayload,
        metadata: {
          ...containerPayload.metadata,
          childPadletIds: [childData.id]
        }
      };

      // 6. Insert the container with child ID (single insert, not insert+update)
      const { error: containerError } = await supabase
        .from('padlets')
        .insert(finalContainerPayload);

      if (containerError) {
        // Cleanup child if container fails
        await deletePadletByIdRaw(childData.id);
        throw containerError;
      }


      // 7. Update local state - replace optimistic container with final version
      setPadlets(prev => prev.map(p =>
        p.id === containerId ? finalContainerPayload as any : p
      ));

      // 8. Add the child padlet to local state
      setPadlets(prev => [...prev, childData as Padlet]);

      // Reset states
      setIsPlacementPromptOpen(false);
      setPendingPostDraft(null);
      setPlacementPromptMode(null);
      toast.success("Created new container with post");

      // Force refresh to ensure data consistency
      fetchData();
    } catch (err: any) {
      console.error("Failed to create container/post:", err);
      toast.error("Failed to create post: " + err.message);
      // Remove optimistic container on error
      setPadlets(prev => prev.filter(p => p.id !== containerId));
      fetchData(); // Also refresh on error
    }
  };


  useEffect(() => {
    if (isFreeformGraphMode) return;
    setIsGraphConnectMode(false);
    setGraphConnectSource(null);
    setGraphConnectSelection(null);
  }, [isFreeformGraphMode]);

  const handleToggleGraphConnect = useCallback(() => {
    if (!isFreeformGraphMode) return;
    const next = !isGraphConnectMode;
    setIsGraphConnectMode(next);
    setGraphConnectSource(null);
    setGraphConnectSelection(null);
    if (next) setIsLineMode(false);
    toast.message(next ? 'Graph Line mode on. Click source side, then target side. Right-click line to edit/delete.' : 'Graph Line mode off.');
  }, [isFreeformGraphMode, isGraphConnectMode]);

  useEffect(() => {
    if (!isFreeformGraphMode || !isGraphConnectMode || !canvasId || !graphConnectSelection) return;

    const selected = padlets.find((p) => p.id === graphConnectSelection.id);
    if (!selected) return;
    if (selected.metadata?.parentId) {
      toast.message('Only top-level posts or columns can be connected.');
      return;
    }

    if (!graphConnectSource) {
      setGraphConnectSource({ id: graphConnectSelection.id, side: graphConnectSelection.side });
      setGraphConnectSelection(null);
      toast.message('Source selected. Now click target post.');
      return;
    }

    if (graphConnectSource.id === graphConnectSelection.id) {
      setGraphConnectSelection(null);
      toast.message('Select a different target post.');
      return;
    }

    let cancelled = false;
    const connect = async () => {
      try {
        const repo = new FreeformGraphRepo(supabase, canvasId.toString());
        const edges = await repo.getEdges();
        if (cancelled) return;

        const matchingEdges = edges.filter((edge) =>
          (edge.source_post_id === graphConnectSource.id && edge.target_post_id === graphConnectSelection.id) ||
          (edge.source_post_id === graphConnectSelection.id && edge.target_post_id === graphConnectSource.id)
        );
        if (matchingEdges.length > 0) {
          await Promise.all(matchingEdges.map((edge) => repo.deleteEdge(edge.id)));
          if (cancelled) return;
          setGraphRefreshToken((token) => token + 1);
          toast.success('Connection removed. Click source and target again to redraw.');
        } else {
          const getRect = (id: string) => {
            const p = padlets.find((x) => x.id === id);
            if (!p) return null;
            return {
              x: p.position_x || 0,
              y: p.position_y || 0,
              width: p.width || 280,
              height: p.height || 100,
            };
          };

          const newSourceRect = getRect(graphConnectSource.id);
          const newTargetRect = getRect(graphConnectSelection.id);
          if (!newSourceRect || !newTargetRect) return;
          const newRoute = routeEdge(newSourceRect, newTargetRect, {
            gap: 14,
          });
          const newA = newRoute.path[1];
          const newB = newRoute.path[2];

          for (const existing of edges) {
            if (
              existing.source_post_id === graphConnectSource.id ||
              existing.target_post_id === graphConnectSource.id ||
              existing.source_post_id === graphConnectSelection.id ||
              existing.target_post_id === graphConnectSelection.id
            ) {
              continue;
            }
            const exSourceRect = getRect(existing.source_post_id);
            const exTargetRect = getRect(existing.target_post_id);
            if (!exSourceRect || !exTargetRect) continue;
            const exRoute = routeEdge(exSourceRect, exTargetRect, {
              gap: 14,
            });
            const exA = exRoute.path[1];
            const exB = exRoute.path[2];
            if (segmentsIntersect(newA, newB, exA, exB)) {
              toast.error('Cannot create this line because it would cross an existing line.');
              setGraphConnectSource(null);
              setGraphConnectSelection(null);
              return;
            }
          }

          await repo.upsertEdge({
            id: crypto.randomUUID(),
            board_id: canvasId.toString(),
            source_post_id: graphConnectSource.id,
            target_post_id: graphConnectSelection.id,
            relation_type: 'solid',
            direction: 'forward',
            label: null,
            style: {
              sourceSide: graphConnectSource.side,
              targetSide: graphConnectSelection.side,
              color: '#9ca3af',
            },
          });
          if (cancelled) return;
          setGraphRefreshToken((token) => token + 1);
          toast.success('Posts connected.');
        }
      } catch (error) {
        console.error('Failed to connect freeform posts:', error);
        toast.error('Failed to connect posts.');
      } finally {
        if (!cancelled) {
          setGraphConnectSource(null);
          setGraphConnectSelection(null);
        }
      }
    };

    connect();
    return () => { cancelled = true; };
  }, [isFreeformGraphMode, isGraphConnectMode, canvasId, graphConnectSelection, graphConnectSource, padlets, supabase]);

  const commitPadletMeta = useMemo(() => {
    return debounce(async (padletId: string, fullMetadata: any) => {
      markPadletLocallyModified(padletId);
      try {
        await supabase
          .from("padlets")
          .update({
            metadata: fullMetadata,
            updated_at: new Date().toISOString(),
          })
          .eq("id", padletId);
      } catch {
      }
    }, 500);
  }, [supabase, markPadletLocallyModified]);

  // Direct delete by ID (for context menu)
  const deletePadletById = async (id: string) => {
    debugCanvasLogger('saveStart', { op: 'deletePadletById', id });
    try {
      const { error } = await supabase
        .from('padlets')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPadlets(prev => prev.filter(p => p.id !== id));
      if (selectedPadletId === id) {
        setSelectedPadletId(null);
      }
      if (selectedPadletIds.includes(id)) {
        setSelectedPadletIds(selectedPadletIds.filter((padletId) => padletId !== id));
      }
      toast.success('Post deleted');
      debugCanvasLogger('saveEnd', { op: 'deletePadletById', id });
    } catch (e) {
      console.error('Failed to delete padlet:', e);
      toast.error('Failed to delete post');
    }
  };

  // ============================================================================
  // DELETE ROUTER - Single source of truth for all delete operations
  // ============================================================================
  // ============================================================================
  // DELETE HANDLER - Single source of truth for all deletions
  // ============================================================================
  const requestDeletePadlet = async (padletId: string) => {
    debugCanvasLogger('saveStart', { op: 'requestDeletePadlet', padletId });
    if (!padletId) {
      console.warn('⚠️ Cannot delete – no padletId provided');
      return;
    }

    const padlet = padlets.find(p => p.id === padletId);
    if (!padlet) {
      console.warn('⚠️ Cannot delete – padlet not found:', padletId);
      return;
    }

    try {
      // Optimistic update - remove from UI immediately
      setPadlets(prev => prev.filter(p => p.id !== padletId));

      // Delete from database
      const { error } = await supabase
        .from('padlets')
        .delete()
        .eq('id', padletId);

      if (error) throw error;

      // Success feedback

      const message = padlet.type === 'container' ? 'Container deleted' : 'Post deleted';
      toast.success(message);

      // Delete children too (explicitly to ensure no orphans)
      const children = padlets.filter(p => p.metadata?.parentId === padletId);
      if (children.length > 0) {
        // Optimistic update for children
        setPadlets(prev => prev.filter(p => p.metadata?.parentId !== padletId)); // Remove children from UI

        // DB delete for children
        const { error: childError } = await supabase
          .from('padlets')
          .delete()
          .eq('metadata->>parentId', padletId); // Efficient DB delete

        if (childError) console.error('Failed to delete children:', childError);
      }


      // Clear selection if needed
      if (selectedPadletId === padletId) {
        setSelectedPadletId(null);
      }
      if (selectedPadletIds.includes(padletId)) {
        setSelectedPadletIds(selectedPadletIds.filter((id) => id !== padletId));
      }
      debugCanvasLogger('saveEnd', { op: 'requestDeletePadlet', padletId });
    } catch (err) {
      console.error('❌ Failed to delete:', err);
      toast.error('Failed to delete');
      // Rollback on error
      fetchData();
    }
  };

  // Map-only delete: hard delete the pin container row so the marker disappears immediately.
  const deleteMapPinContainer = useCallback(async (containerId: string) => {
    if (!containerId) return;

    const container = padlets.find((p) => p.id === containerId);
    if (!container) return;

    const childIds = padlets
      .filter((p) => (p.metadata as any)?.parentId === containerId)
      .map((p) => p.id);

    const affectedIds = new Set([containerId, ...childIds]);

    // Optimistic UI update so the pin is removed from map immediately.
    setPadlets((prev) => prev.filter((p) => !affectedIds.has(p.id)));
    if (selectedPadletId === containerId) setSelectedPadletId(null);
    if (mapActiveContainerId === containerId) setMapActiveContainerId(null);

    try {
      const { error: containerError } = await deletePadletByIdRaw(containerId);
      if (containerError) throw containerError;

      if (childIds.length > 0) {
        const { error: childError } = await supabase
          .from('padlets')
          .delete()
          .in('id', childIds);
        if (childError) {
          console.error('Failed to delete map pin children:', childError);
        }
      }

      toast.success('Pin deleted');
    } catch (err) {
      console.error('Failed to delete map pin:', err);
      toast.error('Failed to delete pin');
      fetchData();
    }
  }, [padlets, selectedPadletId, mapActiveContainerId, deletePadletByIdRaw, fetchData]);

  /* -------------------------------------------------------------------------- */
  /*                              Columns Layout Actions                           */
  /* -------------------------------------------------------------------------- */

  const handleAddSection = useCallback(async (baseId?: number, direction: 'left' | 'right' = 'right') => {
    if (!canvasId) {
      console.error('[handleAddSection] No canvasId provided');
      return;
    }

    // Use session from hook instead of calling getSession()
    if (!sessionReady) {
      toast.error('Session loading, please try again');
      return;
    }
    // Skip session check in development for testing
    if (!session && process.env.NODE_ENV !== 'development') {
      console.error('No active session');
      toast.error('You must be logged in to add sections');
      return;
    }

    try {
      let position = 0;
      if (baseId) {
        const baseSection = sections.find(s => s.id === baseId);
        if (baseSection) {
          position = direction === 'right' ? baseSection.position + 1 : baseSection.position;
          // Shift existing sections logic would go here
        }
      } else {
        position = sections.length > 0 ? Math.max(...sections.map(s => s.position)) + 1 : 0;
      }

      const sectionName = `Section ${sections.length + 1}`;

      // Log board_id details for debugging
      console.log('[handleAddSection] Creating section with board_id:', canvasId, 'type:', typeof canvasId);

      // Attempt insert with string ID first (assuming UUID or string-based ID)
      // If your DB expects an integer, ensure canvasId string is a valid number '123'
      const { data, error } = await supabase
        .from('board_sections')
        .insert({
          board_id: canvasId, // Sending as string
          title: sectionName,
          description: '',
          position: position,
        })
        .select()
        .single();

      if (error) {
        console.error('[handleAddSection] Database error:', error);
        throw error;
      }

      if (data) {
        setSections(prev => {
          const newSections = [...prev, data as BoardSection];
          return newSections.sort((a, b) => a.position - b.position);
        });
        toast.success(`Section "${sectionName}" added`);
        // Scroll to the new section after DOM updates (double rAF to ensure React render completes)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            const sectionEl = document.querySelector(`[data-section-id="${data.id}"]`);
            if (sectionEl) {
              // For Row (grid) layout, scroll so section header is at top with room for container area
              if (canvas?.layout === 'grid') {
                const container = containerRef.current;
                if (container) {
                  const sectionRect = sectionEl.getBoundingClientRect();
                  const containerRect = container.getBoundingClientRect();
                  // Calculate scroll position to put section at top with some padding
                  const scrollTarget = container.scrollTop + sectionRect.top - containerRect.top - 20;
                  container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
                }
              } else {
                sectionEl.scrollIntoView({ behavior: 'smooth', inline: 'end', block: 'nearest' });
              }
            }
          });
        });
      }
    } catch (e: any) {
      console.error('[handleAddSection] Failed to add section:', e);
      toast.error(`Failed to add section: ${e?.message || e?.code || 'Unknown error'}`);
    }
  }, [canvasId, sections, supabase, session, sessionReady, canvas?.layout]);

  const handleRenameSection = useCallback(async (sectionId: number, title: string) => {
    try {
      const { error } = await supabase
        .from('board_sections')
        .update({ title, updated_at: new Date().toISOString() })
        .eq('id', sectionId);

      if (error) throw error;
      setSections(prev => prev.map(s => s.id === sectionId ? { ...s, title } : s));
    } catch (e) {
      console.error('Failed to rename section:', e);
      toast.error('Failed to rename section');
    }
  }, [supabase]);

  const handleDeleteSection = useCallback(async (sectionId: number) => {
    try {
      const { error } = await supabase
        .from('board_sections')
        .delete()
        .eq('id', sectionId);

      if (error) throw error;
      setSections(prev => prev.filter(s => s.id !== sectionId));

      // Unlink posts from this section
      setPadlets(prev => prev.map(p =>
        (p.metadata as any)?.sectionId === sectionId.toString()
          ? { ...p, metadata: { ...p.metadata, sectionId: undefined } }
          : p
      ));
      toast.success('Section deleted');
    } catch (e) {
      console.error('Failed to delete section:', e);
      toast.error('Failed to delete section');
    }
  }, [supabase]);

  /**
   * Move a section up (left/earlier) or down (right/later) by swapping positions with the adjacent section.
   * @param sectionId - The ID of the section to move
   * @param direction - 'up' moves to a lower position (swaps with previous), 'down' moves to a higher position (swaps with next)
   */
  const handleMoveSection = useCallback(async (sectionId: number, direction: 'up' | 'down') => {
    // Sort sections by position to find neighbors
    const sortedSections = [...sections].sort((a, b) => a.position - b.position);
    const currentIndex = sortedSections.findIndex(s => s.id === sectionId);

    if (currentIndex === -1) {
      console.error('Section not found:', sectionId);
      return;
    }

    const currentSection = sortedSections[currentIndex];
    let neighborIndex: number;

    if (direction === 'up') {
      neighborIndex = currentIndex - 1;
      if (neighborIndex < 0) {
        // Already at the top, can't move up
        return;
      }
    } else {
      neighborIndex = currentIndex + 1;
      if (neighborIndex >= sortedSections.length) {
        // Already at the bottom, can't move down
        return;
      }
    }

    const neighborSection = sortedSections[neighborIndex];

    // Swap positions
    const currentPosition = currentSection.position;
    const neighborPosition = neighborSection.position;

    // Optimistic update
    setSections(prev => prev.map(s => {
      if (s.id === currentSection.id) {
        return { ...s, position: neighborPosition };
      }
      if (s.id === neighborSection.id) {
        return { ...s, position: currentPosition };
      }
      return s;
    }));

    try {
      // Update both sections in database
      const { error: error1 } = await supabase
        .from('board_sections')
        .update({ position: neighborPosition, updated_at: new Date().toISOString() })
        .eq('id', currentSection.id);

      if (error1) throw error1;

      const { error: error2 } = await supabase
        .from('board_sections')
        .update({ position: currentPosition, updated_at: new Date().toISOString() })
        .eq('id', neighborSection.id);

      if (error2) throw error2;
    } catch (e) {
      console.error('Failed to move section:', e);
      toast.error('Failed to move section');
      // Revert optimistic update on error
      setSections(prev => prev.map(s => {
        if (s.id === currentSection.id) {
          return { ...s, position: currentPosition };
        }
        if (s.id === neighborSection.id) {
          return { ...s, position: neighborPosition };
        }
        return s;
      }));
    }
  }, [sections, supabase]);

  const handleReorderMapSections = useCallback(async (sectionIdsInOrder: string[]) => {
    const numericIds = sectionIdsInOrder.map((id) => Number(id)).filter((id) => Number.isFinite(id));
    if (!numericIds.length) return;

    const previous = sections;
    const positionMap = new Map<number, number>();
    numericIds.forEach((id, idx) => positionMap.set(id, idx));

    setSections((prev) =>
      prev.map((s) =>
        positionMap.has(s.id) ? { ...s, position: positionMap.get(s.id)! } : s
      )
    );

    try {
      await Promise.all(
        numericIds.map((id, idx) =>
          supabase
            .from('board_sections')
            .update({ position: idx, updated_at: new Date().toISOString() })
            .eq('id', id)
        )
      );
    } catch (err) {
      console.error('Failed to reorder sections:', err);
      toast.error('Failed to reorder sections');
      setSections(previous);
    }
  }, [sections, supabase]);

  const handleMoveMapPost = useCallback(async (postId: string, toSectionId: string | null, toIndex: number) => {
    const moving = padlets.find((p) => p.id === postId);
    if (!moving) return;

    const hasMapLocation = (p: Padlet) => getPadletMapLocation(p) !== null;

    const fromSectionIdRaw = (moving.metadata as any)?.sectionId;
    const fromSectionId = fromSectionIdRaw ? String(fromSectionIdRaw) : null;
    const toSectionKey = toSectionId ? String(toSectionId) : '__unplaced__';
    const fromSectionKey = fromSectionId ? String(fromSectionId) : '__unplaced__';

    const mapPosts = padlets.filter((p) => hasMapLocation(p));
    const inGroup = (p: Padlet, key: string) => {
      const sid = (p.metadata as any)?.sectionId;
      const normalized = sid ? String(sid) : '__unplaced__';
      return normalized === key;
    };
    const sortByPosition = (a: Padlet, b: Padlet) =>
      Number((a.metadata as any)?.sectionPosition ?? 0) - Number((b.metadata as any)?.sectionPosition ?? 0);

    const fromSiblings = mapPosts.filter((p) => inGroup(p, fromSectionKey) && p.id !== postId).sort(sortByPosition);
    const toBase = fromSectionKey === toSectionKey
      ? [...fromSiblings]
      : mapPosts.filter((p) => inGroup(p, toSectionKey) && p.id !== postId).sort(sortByPosition);

    const clampedIndex = Math.max(0, Math.min(toIndex, toBase.length));
    const toSiblings = [...toBase];
    toSiblings.splice(clampedIndex, 0, moving);

    const updates: Array<{ id: string; sectionId?: string; sectionPosition: number }> = [];
    toSiblings.forEach((p, idx) => {
      updates.push({
        id: p.id,
        sectionId: toSectionId ?? undefined,
        sectionPosition: idx,
      });
    });
    if (fromSectionKey !== toSectionKey) {
      fromSiblings.forEach((p, idx) => {
        updates.push({
          id: p.id,
          sectionId: fromSectionId ?? undefined,
          sectionPosition: idx,
        });
      });
    }

    const oldPadlets = padlets;
    setPadlets((prev) =>
      prev.map((p) => {
        const up = updates.find((u) => u.id === p.id);
        if (!up) return p;
        const nextMeta: any = { ...(p.metadata as any), sectionPosition: up.sectionPosition };
        if (up.sectionId) nextMeta.sectionId = up.sectionId;
        else delete nextMeta.sectionId;
        return { ...p, metadata: nextMeta, updated_at: new Date().toISOString() };
      })
    );

    try {
      await Promise.all(
        updates.map((u) => {
          const post = padlets.find((p) => p.id === u.id);
          const nextMeta: any = { ...((post?.metadata as any) || {}), sectionPosition: u.sectionPosition };
          if (u.sectionId) nextMeta.sectionId = u.sectionId;
          else delete nextMeta.sectionId;
          return supabase
            .from('padlets')
            .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
            .eq('id', u.id);
        })
      );
    } catch (err) {
      console.error('Failed to move map post:', err);
      toast.error('Failed to move post');
      setPadlets(oldPadlets);
      fetchData();
    }
  }, [padlets, supabase, fetchData]);

  const handleMapPinContainerOpen = useCallback((post: Padlet) => {
    if (post.type === 'container') {
      setMapActiveContainerId(post.id);
      setSelectedPadletId(post.id);
    }
  }, []);

  const handleMapPinContainerClose = useCallback(() => {
    setMapActiveContainerId(null);
    if (isMapLayout) setSelectedPadletId(null);
  }, [isMapLayout]);

  const handleMapSidebarClose = useCallback(() => {
    setIsMapSidebarOpen(false);
  }, []);

  useEffect(() => {
    if (!isMapLayout || !selectedLineId) return;
    setIsMapSidebarOpen(false);
  }, [isMapLayout, selectedLineId]);

  const handleMapRefreshChildren = useCallback(() => {
    fetchData();
  }, [fetchData]);

  const mapInstanceRef = useRef<mapboxgl.Map | null>(null);
  // mapReadyVersion bumps when a new map instance is handed off; drives render-loop re-subscription
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const handleMapReady = useCallback((map: mapboxgl.Map) => {
    mapInstanceRef.current = map;
    setMapReadyVersion(v => v + 1);
  }, []);


  // Map-aware line creation: unprojects pixel coords → lng/lat so lines move with the map
  const createLineForMap = useCallback((
    rawStartX: number, rawStartY: number, rawEndX: number, rawEndY: number
  ) => {
    const mapInst = mapInstanceRef.current;
    if (isMapLayout && mapInst) {
      const startGeo = mapInst.unproject([rawStartX, rawStartY]);
      const endGeo = mapInst.unproject([rawEndX, rawEndY]);
      createLineFromCoords(rawStartX, rawStartY, rawEndX, rawEndY, {
        startLng: startGeo.lng, startLat: startGeo.lat,
        endLng: endGeo.lng, endLat: endGeo.lat,
      });
    } else {
      createLineFromCoords(rawStartX, rawStartY, rawEndX, rawEndY);
    }
  }, [isMapLayout, createLineFromCoords]);

  // Frame-accurate projected lines for map mode
  const [projectedMapLines, setProjectedMapLines] = useState<CanvasLine[]>([]);
  // Keep a ref so the render-loop callback always sees the latest lines without re-subscribing
  const linesRef = useRef(lines);
  useEffect(() => { linesRef.current = lines; }, [lines]);

  // Helper: reproject geo-anchored points to current screen pixels
  const reprojectLines = useCallback((src: CanvasLine[], mapInst: mapboxgl.Map): CanvasLine[] =>
    src.map((line) => {
      if (!line.points?.length || line.points[0].lng == null) return line;
      const pts = line.points.map((p) => {
        if (p.lng == null || p.lat == null) return p;
        const px = mapInst.project({ lng: p.lng, lat: p.lat });
        return { ...p, x: px.x, y: px.y };
      });
      const s = pts[0], e = pts[pts.length - 1];
      return {
        ...line,
        start_x: s.x, start_y: s.y,
        end_x: e.x, end_y: e.y,
        control_x: (s.x + e.x) / 2, control_y: Math.min(s.y, e.y) - 50,
        points: pts,
      };
    })
  , []);

  // Lightweight equality guard — avoids setState churn on every map render frame
  const projectionChanged = useCallback((prev: CanvasLine[], next: CanvasLine[]): boolean => {
    if (prev.length !== next.length) return true;
    for (let i = 0; i < next.length; i++) {
      const ap = prev[i].points, bp = next[i].points;
      if (!ap || !bp || ap.length !== bp.length) return true;
      for (let j = 0; j < bp.length; j++) {
        if (Math.round(ap[j].x) !== Math.round(bp[j].x) ||
            Math.round(ap[j].y) !== Math.round(bp[j].y)) return true;
      }
    }
    return false;
  }, []);

  // Render-loop subscription: reprojects on the same cadence as the Mapbox GL render cycle
  // so arrows stay locked to the map during pan/zoom without React lag
  useEffect(() => {
    const mapInst = mapInstanceRef.current;
    if (!isMapLayout || !mapInst) return;

    const onRender = () => {
      const next = reprojectLines(linesRef.current, mapInst);
      setProjectedMapLines(prev => projectionChanged(prev, next) ? next : prev);
    };

    mapInst.on('render', onRender);
    onRender(); // project immediately on subscription
    return () => { mapInst.off('render', onRender); };
  }, [isMapLayout, mapReadyVersion, reprojectLines, projectionChanged]);

  // Also reproject when lines change due to DB sync / new line creation
  // (the render event may not fire when the map is idle)
  useEffect(() => {
    const mapInst = mapInstanceRef.current;
    if (!isMapLayout || !mapInst) return;
    setProjectedMapLines(reprojectLines(lines, mapInst));
  }, [lines, isMapLayout, reprojectLines]);

  const activeMapLineIds = useMemo(() => {
    const ids = new Set<string>();
    if (selectedLineId) ids.add(selectedLineId);
    if (lineEditModeId) ids.add(lineEditModeId);
    return ids;
  }, [lineEditModeId, selectedLineId]);
  const projectedMapLinesById = useMemo(
    () => new Map(projectedMapLines.map((line) => [line.id, line])),
    [projectedMapLines]
  );
  // Ref so the layout effect can read the latest projected values without depending on them
  // (adding projectedMapLinesById to deps creates a cycle: updateLineLocal → lines changes
  // → projectedMapLines changes → projectedMapLinesById changes → layout effect fires again).
  const projectedMapLinesByIdRef = useRef(projectedMapLinesById);
  projectedMapLinesByIdRef.current = projectedMapLinesById;

  const passiveMapLines = useMemo(
    () => lines.filter((line) => !activeMapLineIds.has(line.id)),
    [activeMapLineIds, lines]
  );

  // When a line first becomes active (selected/editing), seed its x/y in `lines` state
  // from the already-projected passive map snapshot so the SVG edit overlay uses the
  // exact same screen geometry the user was just seeing in Mapbox.
  useLayoutEffect(() => {
    if (!isMapLayout) return;
    for (const id of activeMapLineIds) {
      const projected = projectedMapLinesByIdRef.current.get(id);
      if (projected) {
        updateLineLocal(id, {
          points: projected.points,
          start_x: projected.start_x, start_y: projected.start_y,
          end_x: projected.end_x, end_y: projected.end_y,
          control_x: projected.control_x, control_y: projected.control_y,
        });
      }
    }
    // projectedMapLinesByIdRef is intentionally excluded — it's read via ref to break the
    // update cycle. updateLineLocal is stable ([] deps) so safe to include.
  }, [activeMapLineIds, isMapLayout, updateLineLocal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Active map lines are sourced from live `lines` state (not projectedMapLines) so that
  // drag updates from updateLineLocal(...) are immediately reflected without being
  // overwritten by the passive reproject effect.
  const mapOverlayLines = useMemo(
    () => isMapLayout
      ? lines.filter((line) => activeMapLineIds.has(line.id))
      : lines.filter((line) => (line.layer_plane ?? 'front') === 'front'),
    [lines, activeMapLineIds, isMapLayout]
  );
  const shouldEnableMapLinePointerEvents = isMapLayout && (selectedLineId !== null || lineEditModeId !== null);

  // When a geo-anchored line is saved after editing, recompute its lng/lat from current pixels
  const saveLineToDbMapAware = useCallback(async (lineId: string) => {
    const mapInst = mapInstanceRef.current;
    if (isMapLayout && mapInst) {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const line = linesRef.current.find(l => l.id === lineId);
      if (line?.points?.length && line.points[0].lng != null) {
        const geoPoints = line.points.map((p) => {
          const geo = mapInst.unproject([p.x, p.y]);
          return { ...p, lng: geo.lng, lat: geo.lat };
        });
        await updateLine(lineId, {
          start_x: line.start_x, start_y: line.start_y,
          end_x: line.end_x, end_y: line.end_y,
          control_x: line.control_x, control_y: line.control_y,
          points: geoPoints,
        });
        return;
      }
    }
    await saveLineToDb(lineId);
  }, [isMapLayout, saveLineToDb, updateLine]);

  const handleLineContextMenu = useCallback((lineId: string, x: number, y: number) => {
    if (!canUseFreeformEditButton) return;
    setLineContextMenuState({ lineId, x, y });
  }, [canUseFreeformEditButton]);

  const handleAddPostToSection = useCallback((sectionId: number) => {
    setPadletToEdit({
      id: 'new',  // Mark as new so handleSaveNote does INSERT not UPDATE
      board_id: canvasId!,
      type: 'text',
      metadata: { sectionId: sectionId.toString() }
    } as any);
    setIsNoteEditorOpen(true);
  }, [canvasId]);

  // Copy padlet to clipboard
  const copyPadlet = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet) return;

    await clipboardManager.copy([{ type: 'post', data: padlet }]);
    await refreshClipboardAvailability();
  };

  // Cut padlet (copy + delete)
  const cutPadlet = async (id: string) => {
    await copyPadlet(id);
    await deletePadletById(id);
  };

  const duplicatePadlet = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || !canvasId) return;

    let branch: 'section' | 'freeform' | null = null;
    let newPadletData: any = null;

    try {
      const sectionId = (padlet.metadata as any)?.sectionId;
      const rest = { ...padlet } as Partial<Padlet>;
      delete rest.id;
      delete rest.created_at;
      delete rest.updated_at;
      delete (rest as any).location_geog;

      newPadletData = {
        ...rest,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (sectionId) {
        branch = 'section';
        // COLUMN LAYOUT: Handle sectionPosition
        const currentPos = (padlet.metadata as any)?.sectionPosition || 0;
        const newPos = currentPos + 1;

        // Shift subsequent posts in this section
        const sectionPosts = padlets.filter(p => (p.metadata as any)?.sectionId == sectionId);
        const updates = sectionPosts
          .filter(p => ((p.metadata as any)?.sectionPosition || 0) >= newPos)
          .map(p => ({
            id: p.id,
            metadata: { ...p.metadata, sectionPosition: ((p.metadata as any)?.sectionPosition || 0) + 1 }
          }));

        if (updates.length > 0) {
          // Update local state first for responsiveness
          setPadlets(prev => prev.map(p => {
            const update = updates.find(u => u.id === p.id);
            return update ? { ...p, metadata: update.metadata } : p;
          }));

          // Batch sync updates to DB
          await Promise.all(updates.map(u =>
            updatePadletById(u.id, {
              metadata: u.metadata,
              updated_at: new Date().toISOString()
            })
          ));
        }

        newPadletData.metadata = {
          ...(newPadletData.metadata || {}),
          sectionPosition: newPos
        };
      } else {
        branch = 'freeform';
        // FREEFORM: Apply x/y offset
        newPadletData.position_x = padlet.position_x + 20;
        newPadletData.position_y = padlet.position_y + 20;
      }

      const { data, error } = await insertPadletAndSelectSingle(newPadletData);

      if (error) throw error;
      if (data) {
        setPadlets(prev => [...prev, data as Padlet]);
        setSelectedPadletId(data.id);
      }
    } catch (e) {
      const serializedError = (() => {
        try {
          const json = JSON.parse(JSON.stringify(e));
          if (json && typeof json === 'object' && Object.keys(json).length > 0) {
            return json;
          }
        } catch {
        }

        const err = e as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
          stack?: string;
          name?: string;
        };
        return {
          name: err?.name,
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code,
          stack: err?.stack,
        };
      })();

      console.error('Failed to duplicate padlet', {
        operation: 'duplicatePadlet',
        id,
        branch,
        payload: newPadletData,
        error: serializedError,
      });
    }
  };

  const buildPastedPadletData = useCallback((
    sourcePadlet: Padlet,
    nextId: string,
    targetPosition?: { x: number; y: number },
    anchorPosition?: { x: number; y: number },
  ) => {
    const rest = { ...sourcePadlet } as Partial<Padlet>;
    delete rest.id;
    delete rest.created_at;
    delete rest.updated_at;
    delete (rest as any).location_geog;

    const sourceMetadata = { ...((rest.metadata as Record<string, unknown>) || {}) } as Record<string, unknown>;
    delete sourceMetadata.parentId;
    delete sourceMetadata.sectionId;
    delete sourceMetadata.sectionPosition;
    delete sourceMetadata.childPadletIds;

    const nextPosition = targetPosition && anchorPosition
      ? {
        x: targetPosition.x + ((sourcePadlet.position_x || 0) - anchorPosition.x),
        y: targetPosition.y + ((sourcePadlet.position_y || 0) - anchorPosition.y),
      }
      : {
        x: (sourcePadlet.position_x || 0) + 20,
        y: (sourcePadlet.position_y || 0) + 20,
      };

    return {
      ...rest,
      id: nextId,
      board_id: canvasId,
      position_x: nextPosition.x,
      position_y: nextPosition.y,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: sourceMetadata,
    };
  }, [canvasId]);

  const handlePaste = async (targetPosition?: { x: number; y: number }) => {
    const clipboard = await clipboardManager.paste();
    if (!clipboard || !canvasId) return;

    try {
      const postItems = clipboard.items
        .filter((item): item is { type: 'post'; data: Padlet } => item.type === 'post' && !!item.data);
      const anchorPosition = postItems.length > 0
        ? {
          x: Math.min(...postItems.map((item) => item.data.position_x || 0)),
          y: Math.min(...postItems.map((item) => item.data.position_y || 0)),
        }
        : undefined;
      const pastedIds: string[] = [];

      for (const item of postItems) {
          const nextId = crypto.randomUUID();
          const newPadlet = buildPastedPadletData(item.data, nextId, targetPosition, anchorPosition);
          const { data, error } = await insertPadletAndSelectSingle(newPadlet);

          if (error) throw error;
          if (data) {
            setPadlets(prev => [...prev, data as Padlet]);
            pastedIds.push(data.id);
          }
      }

      setLastPastedPadletIds(pastedIds);
      setSelectedPadletId(null);
      setSelectedPadletIds(pastedIds);
      await refreshClipboardAvailability();
    } catch (e) {
      console.error('Failed to paste padlet:', e);
    }
  };

  const handleUndoPaste = useCallback(async () => {
    if (lastPastedPadletIds.length === 0) return;

    const idsToDelete = [...lastPastedPadletIds];
    setPadlets((prev) => prev.filter((padlet) => !idsToDelete.includes(padlet.id)));
    setLastPastedPadletIds([]);
    setSelectedPadletId(null);
    setSelectedPadletIds([]);

    try {
      const { error } = await supabase
        .from('padlets')
        .delete()
        .in('id', idsToDelete);
      if (error) throw error;
    } catch (error) {
      console.error('Failed to undo pasted padlets:', error);
      toast.error('Failed to undo paste');
      fetchData(false);
    }
  }, [fetchData, lastPastedPadletIds, setSelectedPadletIds, supabase]);

  const handleSelectAllPadlets = useCallback(() => {
    const allPadletIds = rootPadlets.map((padlet) => padlet.id);
    setSelectedLineId(null);
    setSelectedPadletId(null);
    setSelectedPadletIds(allPadletIds);
  }, [rootPadlets, setSelectedLineId, setSelectedPadletIds]);

  // Create a synced copy (duplicate with link to original)
  const createSyncedCopy = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || !canvasId) return;

    let newPadlet: any = null;

    try {
      const newId = crypto.randomUUID();
      const rest = { ...padlet } as Partial<Padlet>;
      delete rest.id;
      delete rest.created_at;
      delete rest.updated_at;
      delete (rest as any).location_geog;
      newPadlet = {
        ...rest,
        id: newId,
        position_x: padlet.position_x + 20,
        position_y: padlet.position_y + 20,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...padlet.metadata,
          syncedWith: id, // Link to source
        },
      };

      const { data, error } = await insertPadletAndSelectSingle(newPadlet);

      if (error) throw error;
      if (data) {
        // Update original to link back
        const updatedOriginalMeta = {
          ...padlet.metadata,
          syncedWith: newId,
        };
        await updatePadletById(id, { metadata: updatedOriginalMeta });

        setPadlets(prev => [
          ...prev.map(p => p.id === id ? { ...p, metadata: updatedOriginalMeta } : p),
          data as Padlet
        ]);
        setSelectedPadletId(data.id);
      }
    } catch (e) {
      const serializedError = (() => {
        try {
          const json = JSON.parse(JSON.stringify(e));
          if (json && typeof json === 'object' && Object.keys(json).length > 0) {
            return json;
          }
        } catch {
        }

        const err = e as {
          message?: string;
          details?: string;
          hint?: string;
          code?: string;
          stack?: string;
          name?: string;
        };
        return {
          name: err?.name,
          message: err?.message,
          details: err?.details,
          hint: err?.hint,
          code: err?.code,
          stack: err?.stack,
        };
      })();

      console.error('Failed to create synced copy', {
        operation: 'createSyncedCopy',
        id,
        payload: newPadlet,
        error: serializedError,
      });
    }
  };

  // Group a post into a new Column/Container
  const groupIntoColumn = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || !canvasId) return;

    try {
      // Create a new container at the padlet's position
      const containerId = crypto.randomUUID();
      const containerPadlet = {
        id: containerId,
        board_id: canvasId,
        title: 'New Column',
        content: '',
        type: 'container',
        position_x: padlet.position_x,
        position_y: padlet.position_y,
        width: 350,
        height: 300,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          childPadletIds: [id],
        },
      };

      const { data: containerData, error: containerError } = await supabase
        .from('padlets')
        .insert(containerPadlet)
        .select()
        .single();

      if (containerError) throw containerError;

      // Update the original padlet to set parentId
      const updatedMeta = {
        ...padlet.metadata,
        parentId: containerId,
      };
      const { error: updateError } = await supabase
        .from('padlets')
        .update({ metadata: updatedMeta })
        .eq('id', id);

      if (updateError) throw updateError;

      // Update local state
      if (containerData) {
        setPadlets(prev => [
          ...prev.map(p => p.id === id ? { ...p, metadata: updatedMeta } : p),
          containerData as Padlet
        ]);
        setSelectedPadletId(containerId);
      }
    } catch (e) {
      console.error('Failed to group into column:', e);
    }
  };

  const lockPadlet = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet) return;

    const isCurrentlyLocked = (padlet.metadata as any)?.isLocked || false;
    const newLockedState = !isCurrentlyLocked;

    markPadletLocallyModified(id);
    try {
      const newMetadata = { ...padlet.metadata, isLocked: newLockedState };
      const { error } = await supabase
        .from('padlets')
        .update({ metadata: newMetadata })
        .eq('id', id);

      if (error) throw error;

      setPadlets(prev => prev.map(p =>
        p.id === id ? { ...p, metadata: newMetadata } : p
      ));
    } catch (e) {
      console.error('Failed to lock/unlock padlet:', e);
    }
  };

  // Link Post specific actions
  const addImageToLink = (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'link') return;

    // Create a hidden file input to trigger native file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      try {
        // Upload image to Supabase storage
        const fileName = `link-images/${id}-${Date.now()}-${file.name}`;
        const { error: uploadError } = await supabase.storage
          .from('padlet-files')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('padlet-files')
          .getPublicUrl(fileName);

        const imageUrl = urlData.publicUrl;

        // Update padlet metadata with new image
        const newMetadata = {
          ...padlet.metadata,
          linkImage: imageUrl,
        };

        markPadletLocallyModified(id);
        const { error: updateError } = await supabase
          .from('padlets')
          .update({ metadata: newMetadata, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (updateError) throw updateError;

        // Update local state
        setPadlets(prev => prev.map(p =>
          p.id === id ? { ...p, metadata: newMetadata } : p
        ));

        toast.success('Image added to link');
      } catch (err) {
        console.error('Failed to add image:', err);
        toast.error('Failed to add image');
      }
    };
    input.click();
  };

  const copyLinkAddress = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'link') return;

    const linkUrl = (padlet.metadata as any)?.linkUrl;
    if (!linkUrl) {
      toast.error('No link URL found');
      return;
    }

    try {
      await navigator.clipboard.writeText(linkUrl);
      toast.success('Link copied to clipboard');
    } catch (e) {
      console.error('Failed to copy link:', e);
      toast.error('Failed to copy link');
    }
  };

  // To-do Post specific action - opens editor for renaming
  const renameTodo = (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'todo') return;

    // Open the Todo Editor to allow renaming
    setPadletToEdit(padlet);
    setIsTodoEditorOpen(true);
  };

  // Container/Column Post specific action - opens editor for renaming
  const renameColumn = (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'container') return;

    // Open the Container Editor to allow renaming
    setPadletToEdit(padlet);
    setIsContainerEditorOpen(true);
  };

  // Comment Post specific action - opens editor for renaming/editing
  const renameComment = (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'comment') return;

    // Open the Comment Editor
    setPadletToEdit(padlet);
    setIsCommentEditorOpen(true);
  };

  const openImagePostEditor = (padlet: Padlet) => {
    if (padlet.type !== 'image') return;
    closeDrawingSelectedShapePanel();
    closeAllToolbars({ imageToolbar: true });
    setPadletToEdit(null);
    setIsImageEditorOpen(false);
    setImageToolbarPadletId(padlet.id);
  };

  const replaceImage = (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'image') return;

    if (isDrawingLayout || isTimelineLayout) {
      openImagePostEditor(padlet);
      return;
    }

    // Open the Image Editor
    setPadletToEdit(padlet);
    setIsImageEditorOpen(true);
  };

  const downloadImage = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'image' || !padlet.metadata?.imageUrl) return;

    try {
      const response = await fetch(padlet.metadata.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = padlet.title || 'downloaded-image';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download image:', err);
      toast.error('Failed to download image');
    }
  };

  const toggleCropToGrid = async (id: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet || padlet.type !== 'image') return;

    const newValue = !(padlet.metadata as any)?.cropToGrid;

    try {
      const { error } = await supabase
        .from('padlets')
        .update({
          metadata: { ...padlet.metadata, cropToGrid: newValue },
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Failed to toggle crop to grid:', err);
      toast.error('Failed to update image setting');
    }
  };

  const movePadletLayer = async (id: string, action: string) => {
    const padlet = padlets.find(p => p.id === id);
    if (!padlet) return;

    const zValues = padlets.map(p => (p.metadata as any)?.zIndex || 100);
    const maxZ = Math.max(...zValues);
    const minZ = Math.min(...zValues);
    const currentZ = (padlet.metadata as any)?.zIndex || 100;

    let newZ: number;

    switch (action) {
      case 'bringToFront':
        newZ = maxZ + 1;
        if (newZ > 9000) setTimeout(() => normalizeZIndexes(), 0);
        break;
      case 'sendToBack':
        newZ = Math.max(10, minZ - 1);
        break;
      case 'bringForward':
        newZ = currentZ + 1;
        break;
      case 'sendBackward':
        newZ = Math.max(10, currentZ - 1);
        break;
      default:
        return;
    }

    markPadletLocallyModified(id);
    try {
      const newMetadata = { ...padlet.metadata, zIndex: newZ };
      const { error } = await supabase
        .from('padlets')
        .update({ metadata: newMetadata })
        .eq('id', id);

      if (error) throw error;

      setPadlets(prev => prev.map(p =>
        p.id === id ? { ...p, metadata: newMetadata } : p
      ));
    } catch (e) {
      console.error(`Failed to move padlet layer (${action}):`, e);
    }
  };

  // --- Column Post Context Menu Handlers ---

  const openPostInNewTab = (post: Padlet) => {
    const url = `${window.location.origin}/dashboard/canvas/${canvasId}?post=${post.id}`;
    window.open(url, '_blank');
  };

  const copyPostLink = async (post: Padlet) => {
    const url = `${window.location.origin}/dashboard/canvas/${canvasId}?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const startSlideshow = (post: Padlet) => {
    const allPosts = padlets
      .filter(p => p.board_id === canvasId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const currentIndex = allPosts.findIndex(p => p.id === post.id);
    router.push(`/dashboard/canvas/${canvasId}/slideshow?start=${currentIndex}`);
  };

  const downloadAttachment = async (post: Padlet) => {
    const fileUrl = (post.metadata as any)?.file_url || (post.metadata as any)?.imageUrl;
    if (fileUrl) {
      try {
        const response = await fetch(fileUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = (post.metadata as any)?.file_name || 'attachment';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        toast.success('Download started');
      } catch {
        toast.error('Failed to download attachment');
      }
    } else {
      toast.error('No attachment found');
    }
  };

  const copyAttachmentLink = async (post: Padlet) => {
    const fileUrl = (post.metadata as any)?.file_url || (post.metadata as any)?.imageUrl;
    if (fileUrl) {
      try {
        await navigator.clipboard.writeText(fileUrl);
        toast.success('Attachment link copied');
      } catch {
        toast.error('Failed to copy attachment link');
      }
    } else {
      toast.error('No attachment found');
    }
  };

  const changeCardColor = async (post: Padlet, color: string) => {
    const nextMeta = { ...(post.metadata || {}), cardColor: color };
    setPadlets(prev => prev.map(p => p.id === post.id ? { ...p, metadata: nextMeta } : p));

    const { error } = await supabase
      .from('padlets')
      .update({
        metadata: nextMeta,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id);

    if (error) {
      toast.error('Failed to update color');
      fetchData();
    }
  };

  const addPostRelative = async (post: Padlet, action: 'before' | 'after') => {
    const sectionId = (post.metadata as any)?.sectionId;
    if (!sectionId) return;

    const currentPos = (post.metadata as any)?.sectionPosition || 0;
    const newPos = action === 'before' ? currentPos : currentPos + 1;

    const sectionPosts = padlets.filter(p => (p.metadata as any)?.sectionId == sectionId);
    const updates = sectionPosts
      .filter(p => (p.metadata as any)?.sectionPosition >= newPos)
      .map(p => ({
        id: p.id,
        metadata: { ...(p.metadata || {}), sectionPosition: ((p.metadata as any)?.sectionPosition || 0) + 1 }
      }));

    const newId = crypto.randomUUID();
    const newPadlet: Padlet = {
      id: newId,
      board_id: canvasId!,
      type: 'text',
      title: '',
      content: '',
      position_x: 0,
      position_y: 0,
      width: 280,
      height: 100,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        sectionId: sectionId,
        sectionPosition: newPos
      }
    };

    try {
      const { error: insertError } = await insertPadlet(newPadlet);
      if (insertError) throw insertError;

      for (const update of updates) {
        await updatePadletById(update.id, { metadata: update.metadata });
      }

      fetchData();
      toast.success('Post added');
      setPadletToEdit(newPadlet);
      setIsNoteEditorOpen(true);
    } catch (err) {
      toast.error('Failed to add post');
      console.error(err);
    }
  };

  const copyToAnotherPadlet = (post: Padlet) => {
    const clipboardData = { type: 'padlet_post', data: post, action: 'copy' };
    localStorage.setItem('padlet_clipboard', JSON.stringify(clipboardData));
    toast.success('Post copied. Go to another board to paste.');
  };

  const transferToAnotherPadlet = (post: Padlet) => {
    const clipboardData = { type: 'padlet_post', data: post, action: 'transfer', sourceBoard: post.board_id };
    localStorage.setItem('padlet_clipboard', JSON.stringify(clipboardData));
    toast.success('Post ready to transfer. Go to another board to paste.');
  };

  const setAsPadletCover = async (post: Padlet) => {
    const imageUrl = (post.metadata as any)?.imageUrl || (post.metadata as any)?.file_url;
    try {
      const { error } = await supabase
        .from('boards')
        .update({
          metadata: {
            cover_post_id: post.id,
            cover_image: imageUrl || null
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', canvasId);

      if (error) throw error;
      toast.success('Set as padlet cover');
    } catch (err) {
      toast.error('Failed to set cover');
      console.error(err);
    }
  };

  const pinPost = async (post: Padlet) => {
    const isLocked = !(post.metadata as any)?.isLocked;
    const nextMeta = { ...(post.metadata || {}), isLocked };
    setPadlets(prev => prev.map(p => p.id === post.id ? { ...p, metadata: nextMeta } : p));

    const { error } = await supabase
      .from('padlets')
      .update({
        metadata: nextMeta,
        updated_at: new Date().toISOString()
      })
      .eq('id', post.id);

    if (error) {
      toast.error('Failed to update pin status');
      fetchData();
    } else {
      toast.success(isLocked ? 'Post pinned' : 'Post unpinned');
    }
  };

  const reportPost = () => {
    toast.info('Post reported for review');
  };

  // Prevent z-index explosion by resetting all to a 10, 20, 30... sequence
  const normalizeZIndexes = useCallback(async () => {
    const updates = computeNormalizedZIndexes(padlets);

    // Local update for instant feedback
    setPadlets(prev => prev.map(p => {
      const update = updates.find(u => u.id === p.id);
      return update ? { ...p, metadata: update.metadata } : p;
    }));

    // Background DB sync
    try {
      for (const update of updates) {
        markPadletLocallyModified(update.id);
        await supabase
          .from('padlets')
          .update({ metadata: update.metadata })
          .eq('id', update.id);
      }
    } catch {
    }
  }, [padlets, supabase, markPadletLocallyModified]);

  // One-time migration for existing posts (runs once on first non-empty padlets load)
  const zIndexMigrationDoneRef = useRef(false);
  useEffect(() => {
    if (!hasMounted || padlets.length === 0) return;
    if (zIndexMigrationDoneRef.current) return;
    zIndexMigrationDoneRef.current = true; // Prevent re-running when new padlets are added optimistically

    const postsWithoutZ = padlets.filter(p => !(p.metadata as any)?.zIndex);
    if (postsWithoutZ.length > 0) {
      const migrate = async () => {
        const zUpdates: { id: string; zIndex: number }[] = [];
        for (let i = 0; i < postsWithoutZ.length; i++) {
          const padlet = postsWithoutZ[i];
          const newZ = 100 + i;
          zUpdates.push({ id: padlet.id, zIndex: newZ });
          markPadletLocallyModified(padlet.id);
          await supabase
            .from('padlets')
            .update({ metadata: { ...padlet.metadata, zIndex: newZ } })
            .eq('id', padlet.id);
        }
        // Update local state directly instead of fetchData() to avoid
        // wiping dev-mode sections that only exist in local state.
        setPadlets(prev => prev.map(p => {
          const upd = zUpdates.find(u => u.id === p.id);
          if (!upd) return p;
          return { ...p, metadata: { ...(p.metadata as any), zIndex: upd.zIndex } };
        }));
      };
      migrate();
    }
  }, [hasMounted, padlets.length, supabase, markPadletLocallyModified, setPadlets]); // Only run when mount status or list length changes

  const getClickedSide = useCallback((event: React.MouseEvent<HTMLElement>): GraphSide => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    return computeClickedSide(rect, x, y);
  }, []);

  // === END INTERACTIONS REGION ===

  useCanvasShortcuts({
    selectedPadletId,
    selectedPadletIds,
    showDeleteConfirm,
    isNoteEditorOpen,
    isTableEditorOpen,
    isLinkEditorOpen,
    isTodoEditorOpen,
    isWallLayout,
    isGridLayout,
    requestDeletePadlet,
    setShowDeleteConfirm,
    setSelectedPadletId,
    setSelectedPadletIds,
    isLineMode,
    lineEditModeId,
    selectedLineId,
    newPostDragState,
    setNewPostDragState,
    setWallPlacementPromptOpen,
    setIsPlacementPromptOpen,
    setIsNoteEditorOpen,
    setIsLineMode,
    setLineEditModeId,
    setSelectedLineId,
    movePadletLayer,
    deleteLine,
    onSelectAll: handleSelectAllPadlets,
    onUndoPaste: handleUndoPaste,
  });
  // === END LINE REGION ===

  const handleDetachChildFromFreeformContainer = useCallback(async (childId: string, containerId: string) => {
    const container = padlets.find(p => p.id === containerId);
    const child = padlets.find(p => p.id === childId);

    if (!container || !child) return;

    const oldChildIds = (container.metadata as any)?.childPadletIds || [];
    const newChildIds = oldChildIds.filter((id: string) => id !== childId);

    // Optimistic update: remove child from container and clear its parent
    setPadlets(prev => prev.map(p => {
      if (p.id === containerId) {
        return { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } };
      }
      if (p.id === childId) {
        return {
          ...p,
          metadata: { ...p.metadata, parentId: undefined }
        };
      }
      return p;
    }));

    try {
      await updatePadletById(containerId, {
        metadata: { ...container.metadata, childPadletIds: newChildIds },
        updated_at: new Date().toISOString(),
      });

      await updatePadletById(childId, {
        metadata: { ...child.metadata, parentId: undefined },
        updated_at: new Date().toISOString(),
      });

      toast.success('Post removed from container');
    } catch (err) {
      console.error('Failed to detach:', err);
      toast.error('Failed to remove post');
      fetchData();
    }
  }, [padlets, supabase, fetchData]);


  const handleDeleteChildFromContainer = useCallback(async (childId: string, containerId: string) => {
    const container = padlets.find(p => p.id === containerId);
    if (!container) return;

    const oldChildIds = (container.metadata as any)?.childPadletIds || [];
    const newChildIds = oldChildIds.filter((id: string) => id !== childId);

    // Optimistic update: remove child and update container
    setPadlets(prev => prev
      .filter(p => p.id !== childId)
      .map(p => p.id === containerId ? { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } } : p)
    );

    try {
      const { error: containerError } = await supabase
        .from('padlets')
        .update({
          metadata: { ...container.metadata, childPadletIds: newChildIds },
          updated_at: new Date().toISOString(),
        })
        .eq('id', containerId);
      if (containerError) throw containerError;

      const { error: childError } = await supabase
        .from('padlets')
        .delete()
        .eq('id', childId);
      if (childError) throw childError;

      toast.success('Post deleted');
    } catch (err) {
      console.error('Failed to delete child:', err);
      toast.error('Failed to delete post');
      fetchData();
    }
  }, [padlets, supabase, fetchData]);

  const updatePadletMetadata = async (padletId: string, metadataUpdates: any) => {
    const padlet = padlets.find(p => p.id === padletId);
    if (!padlet) return;

    // 1. Optimistic local update for IMMEDIATE responsiveness
    const newMetadata = { ...(padlet.metadata || {}), ...(metadataUpdates || {}) };
    setPadlets(prev => prev.map(p =>
      p.id === padletId ? { ...p, metadata: newMetadata } : p
    ));

    // 2. Debounced commit to Supabase to prevent flood (especially during slider drags)
    commitPadletMeta(padletId, newMetadata);
  };

  // Handle chrono mode change (persist to DB)
  const handleChronoModeChange = useCallback(async (mode: ChronoMode) => {
    setChronoMode(mode);
    setShowChronoModeModal(false);
    if (canvasId) {
      const currentSettings = (canvas as any)?.settings || {};
      const updatedSettings = { ...currentSettings, chronoMode: mode };
      try {
        await supabase
          .from('boards')
          .update({
            settings: updatedSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', canvasId);
      } catch (err) {
        console.error('Failed to save chrono mode:', err);
        toast.error('Failed to save timeline mode');
      }
    }
  }, [canvasId, canvas, supabase]);

  // Auto-create empty container on timeline
  const handleCreateEmptyTimelineContainer = useCallback(async (): Promise<boolean> => {
    if (!canvasId) return false;
    const containerCount = padlets.filter(
      (p) => p.type === 'container' && !(p.metadata as any)?.parentId
    ).length;
    const containerId = crypto.randomUUID();
    const newContainer: Padlet = {
      id: containerId,
      board_id: canvasId,
      title: '',
      content: '',
      type: 'container',
      position_x: 0,
      position_y: 0,
      width: 280,
      height: 200,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {
        childPadletIds: [],
        cardColor: '#ffffff',
        topStrip: 'transparent',
        kind: 'container',
        isContainer: true,
        position_in_timeline: containerCount,
        zIndex: Date.now(),
      },
    };
    setPadlets((prev) => [...prev, newContainer]);
    const { error } = await supabase.from('padlets').insert(newContainer);
    if (error) {
      setPadlets((prev) => prev.filter((p) => p.id !== containerId));
      toast.error('Failed to create container');
      return false;
    }
    return true;
  }, [canvasId, padlets, supabase]);

  useEffect(() => {
    if (!isTimelineLayout || !canvasId || loading || !canUseFreeformEditButton) return;
    if (timelineAutoInitAttemptedRef.current.has(canvasId)) return;

    const rootTimelineContainerCount = padlets.filter((p) => {
      const meta = p.metadata as any;
      const isContainer = p.type === 'container' || meta?.kind === 'container' || meta?.isContainer === true;
      return isContainer && !meta?.parentId;
    }).length;

    if (rootTimelineContainerCount > 0) {
      timelineAutoInitAttemptedRef.current.add(canvasId);
      return;
    }

    timelineAutoInitAttemptedRef.current.add(canvasId);
    (async () => {
      const created = await handleCreateEmptyTimelineContainer();
      if (!created) {
        timelineAutoInitAttemptedRef.current.delete(canvasId);
      }
    })();
  }, [isTimelineLayout, canvasId, loading, canUseFreeformEditButton, padlets, handleCreateEmptyTimelineContainer]);

  const getTimelineContainers = useCallback(() => {
    return padlets
      .filter((p) => {
        const meta = p.metadata as any;
        const isContainer = p.type === 'container' || meta?.kind === 'container' || meta?.isContainer === true;
        const isChild = !!meta?.parentId;
        return isContainer && !isChild;
      })
      .sort((a, b) => {
        const posA = (a.metadata as any)?.position_in_timeline ?? 0;
        const posB = (b.metadata as any)?.position_in_timeline ?? 0;
        if (posA !== posB) return posA - posB;
        return new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime();
      });
  }, [padlets]);

  const applyTimelineOrder = useCallback(async (orderedContainers: Padlet[]) => {
    const updates = orderedContainers.map((p, index) => ({
      id: p.id,
      metadata: { ...p.metadata, position_in_timeline: index },
    }));

    setPadlets((prev) =>
      prev.map((p) => {
        const update = updates.find((u) => u.id === p.id);
        return update ? { ...p, metadata: update.metadata } : p;
      })
    );

    await Promise.all(
      updates.map((u) =>
        supabase
          .from('padlets')
          .update({ metadata: u.metadata, updated_at: new Date().toISOString() })
          .eq('id', u.id)
      )
    );
  }, [setPadlets, supabase]);

  const insertTimelineContainerAt = useCallback(async (position: number) => {
    if (!canvasId) return;
    const containers = getTimelineContainers();
    const insertPosition = Math.max(0, Math.min(position, containers.length));

    try {
      const containerId = crypto.randomUUID();
      const newContainer: Padlet = {
        id: containerId,
        board_id: canvasId,
        title: 'New Event',
        content: '',
        type: 'container',
        position_x: 0,
        position_y: 0,
        width: 280,
        height: 200,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          childPadletIds: [],
          cardColor: '#ffffff',
          topStrip: 'transparent',
          kind: 'container',
          isContainer: true,
          position_in_timeline: insertPosition,
        },
      };

      const ordered = [...containers];
      ordered.splice(insertPosition, 0, newContainer);
      setPadlets((prev) => [...prev, newContainer]);
      await applyTimelineOrder(ordered);
      const { error } = await supabase.from('padlets').insert(newContainer);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to insert timeline container:', err);
      toast.error('Failed to create container');
      fetchData();
    }
  }, [canvasId, getTimelineContainers, applyTimelineOrder, supabase, setPadlets, fetchData]);

  const addTimelineContainerBefore = useCallback(async (containerId: string) => {
    const containers = getTimelineContainers();
    const index = containers.findIndex((c) => c.id === containerId);
    await insertTimelineContainerAt(index === -1 ? 0 : index);
  }, [getTimelineContainers, insertTimelineContainerAt]);

  const addTimelineContainerAfter = useCallback(async (containerId: string) => {
    const containers = getTimelineContainers();
    const index = containers.findIndex((c) => c.id === containerId);
    const insertPos = index === -1 ? containers.length : index + 1;
    await insertTimelineContainerAt(insertPos);
  }, [getTimelineContainers, insertTimelineContainerAt]);

  const duplicateTimelineContainer = useCallback(async (containerId: string) => {
    if (!canvasId) return;
    const container = padlets.find((p) => p.id === containerId);
    if (!container) return;
    const containers = getTimelineContainers();
    const index = containers.findIndex((c) => c.id === containerId);
    const insertPos = index === -1 ? containers.length : index + 1;

    try {
      const newContainer: Padlet = {
        ...container,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        metadata: {
          ...container.metadata,
          childPadletIds: [],
          parentId: undefined,
          position_in_timeline: insertPos,
        },
      };

      const ordered = [...containers];
      ordered.splice(insertPos, 0, newContainer);
      setPadlets((prev) => [...prev, newContainer]);
      await applyTimelineOrder(ordered);
      const { error } = await supabase.from('padlets').insert(newContainer);
      if (error) throw error;
    } catch (err) {
      console.error('Failed to duplicate container:', err);
      toast.error('Failed to duplicate container');
      fetchData();
    }
  }, [canvasId, padlets, getTimelineContainers, applyTimelineOrder, supabase, setPadlets, fetchData]);

  const handleDropLibraryCreateContainer = useCallback(async (position: number, draftPayload: any) => {
    console.log('DEBUG: [handleDropLibraryCreateContainer] START', { position, draftPayload });
    if (!canvasId) return;

    const containers = getTimelineContainers();
    const insertPosition = Math.max(0, Math.min(position, containers.length));

    try {
      const now = new Date().toISOString();
      const containerId = crypto.randomUUID();
      const newPadletId = crypto.randomUUID();

      // Create the new padlet from the draft payload
      const padletType = (draftPayload.type || 'text') as Padlet['type'];
      const fileUrl = draftPayload.file_url || draftPayload.metadata?.file_url || draftPayload.metadata?.imageUrl;
      const newPadlet: Padlet = {
        id: newPadletId,
        board_id: canvasId,
        title: draftPayload.title || draftPayload.label || 'New Post',
        content: draftPayload.content || '',
        type: padletType,
        position_x: 0,
        position_y: 0,
        width: draftPayload.width || 300,
        height: draftPayload.height || 200,
        file_url: fileUrl || null,
        created_at: now,
        updated_at: now,
        metadata: {
          ...draftPayload.metadata,
          parentId: containerId,
          cardColor: draftPayload.metadata?.cardColor || '#ffffff',
          imageUrl: fileUrl || draftPayload.metadata?.imageUrl,
          fileUrl: fileUrl,
        },
      };

      // Create the container with the new padlet as its child
      const newContainer: Padlet = {
        id: containerId,
        board_id: canvasId,
        title: draftPayload.title || 'New Event',
        content: '',
        type: 'container',
        position_x: 0,
        position_y: 0,
        width: 280,
        height: 200,
        created_at: now,
        updated_at: now,
        metadata: {
          childPadletIds: [newPadletId],
          cardColor: '#ffffff',
          topStrip: 'transparent',
          kind: 'container',
          isContainer: true,
          position_in_timeline: insertPosition,
        },
      };

      // Optimistic update - add both container and padlet
      const ordered = [...containers];
      ordered.splice(insertPosition, 0, newContainer);
      setPadlets((prev) => [...prev, newContainer, newPadlet]);
      await applyTimelineOrder(ordered);

      // Persist to database
      const { error: containerError } = await supabase.from('padlets').insert(newContainer);
      if (containerError) throw containerError;
      const { error: padletError } = await supabase.from('padlets').insert(newPadlet);
      if (padletError) throw padletError;
    } catch (err) {
      console.error('Failed to create container with library item:', err);
      toast.error('Failed to create container');
      fetchData();
    }
  }, [canvasId, getTimelineContainers, applyTimelineOrder, supabase, setPadlets, fetchData]);

  const handleCreateSchedulerPadlet = useCallback(async (
    start: Date,
    end: Date,
    options?: { title?: string; metadata?: Record<string, unknown> }
  ): Promise<string | null> => {
    if (!canvasId) return null;
    const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
    const safeEnd = Number.isNaN(end.getTime()) || end <= safeStart
      ? new Date(safeStart.getTime() + 60 * 60 * 1000)
      : end;

    try {
      const { data, error } = await insertPadletAndSelectSingle({
        board_id: canvasId,
        title: options?.title || '',
        content: '',
        type: 'container',
        position_x: 0,
        position_y: 0,
        width: 280,
        height: 180,
        metadata: {
          ...(options?.metadata || {}),
          start_date: safeStart.toISOString(),
          end_date: safeEnd.toISOString(),
        },
      });
      if (error) throw error;
      await fetchData();
      if (data?.id) {
        setSelectedSchedulerContainerId(data.id);
        setSelectedSchedulerSlot(null);
      }
      return data?.id ?? null;
    } catch (err) {
      console.error('Failed to create scheduler event:', err);
      return null;
    }
  }, [canvasId, fetchData, insertPadletAndSelectSingle, setSelectedSchedulerContainerId, setSelectedSchedulerSlot]);

  const clearSchedulerSelection = useCallback(() => {
    setSelectedSchedulerSlot(null);
    setSelectedSchedulerContainerId(null);
    setSchedulerPopoverPadletId(null);
  }, [setSelectedSchedulerContainerId, setSelectedSchedulerSlot, setSchedulerPopoverPadletId]);

  const handleOpenSchedulerPadlet = useCallback((padlet: Padlet) => {
    closeAllToolbars();
    setSelectedPadletId(padlet.id);
    const isAllDay = padlet.metadata?.isAllDay === true;
    const startRaw = typeof padlet.metadata?.start_date === 'string' ? padlet.metadata.start_date : null;
    const endRaw = typeof padlet.metadata?.end_date === 'string' ? padlet.metadata.end_date : null;
    const start = startRaw ? new Date(startRaw) : null;
    const end = endRaw ? new Date(endRaw) : null;
    if (
      !isAllDay &&
      start &&
      end &&
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end > start
    ) {
      setSelectedSchedulerSlot({ start, end });
    } else {
      setSelectedSchedulerSlot(null);
    }
    setSelectedSchedulerContainerId(padlet.id);
    // Open the container popover so the user can see child posts.
    setSchedulerPopoverPadletId(padlet.id);
  }, [closeAllToolbars, setSelectedPadletId, setSelectedSchedulerContainerId, setSelectedSchedulerSlot, setSchedulerPopoverPadletId]);

  const handleTargetSchedulerPadlet = useCallback((padlet: Padlet) => {
    closeAllToolbars();
    setSelectedPadletId(padlet.id);
    const isAllDay = padlet.metadata?.isAllDay === true;
    const startRaw = typeof padlet.metadata?.start_date === 'string' ? padlet.metadata.start_date : null;
    const endRaw = typeof padlet.metadata?.end_date === 'string' ? padlet.metadata.end_date : null;
    const start = startRaw ? new Date(startRaw) : null;
    const end = endRaw ? new Date(endRaw) : null;
    if (
      !isAllDay &&
      start &&
      end &&
      !Number.isNaN(start.getTime()) &&
      !Number.isNaN(end.getTime()) &&
      end > start
    ) {
      setSelectedSchedulerSlot({ start, end });
    } else {
      setSelectedSchedulerSlot(null);
    }
    setSelectedSchedulerContainerId(padlet.id);
    // Do not open the modal on "Add post" from context menu.
    setSchedulerPopoverPadletId(null);
  }, [closeAllToolbars, setSelectedPadletId, setSelectedSchedulerContainerId, setSelectedSchedulerSlot, setSchedulerPopoverPadletId]);

  useEffect(() => {
    if (!isSchedulerLayout) return;
    if (!selectedSchedulerContainerId) return;

    const liveSelectedContainer = padlets.find((padlet) =>
      padlet.id === selectedSchedulerContainerId &&
      padlet.type === 'container' &&
      !(padlet.metadata as any)?.parentId
    );

    if (!liveSelectedContainer) {
      setSelectedSchedulerContainerId(null);
      setSelectedSchedulerSlot(null);
      if (schedulerPopoverPadletId === selectedSchedulerContainerId) {
        setSchedulerPopoverPadletId(null);
      }
      return;
    }

    if (liveSelectedContainer.metadata?.isAllDay === true && selectedSchedulerSlot) {
      setSelectedSchedulerSlot(null);
    }
  }, [
    isSchedulerLayout,
    padlets,
    schedulerPopoverPadletId,
    selectedSchedulerContainerId,
    selectedSchedulerSlot,
    setSelectedSchedulerContainerId,
    setSelectedSchedulerSlot,
    setSchedulerPopoverPadletId,
  ]);

  const handleSchedulerExternalDrop = useCallback(async ({
    payload,
    slot,
    targetContainerId,
  }: {
    payload: Record<string, unknown>;
    slot: { start: Date; end: Date };
    targetContainerId?: string | null;
  }) => {
    if (!canvasId) return;

    const safeStart = Number.isNaN(slot.start.getTime()) ? new Date() : slot.start;
    const safeEnd = Number.isNaN(slot.end.getTime()) || slot.end <= safeStart
      ? new Date(safeStart.getTime() + 30 * 60 * 1000)
      : slot.end;

    const start_date = safeStart.toISOString();
    const end_date = safeEnd.toISOString();
    const now = new Date().toISOString();
    const metadata = (payload.metadata && typeof payload.metadata === 'object'
      ? payload.metadata
      : {}) as Record<string, any>;
    const sanitizedMetadata = sanitizeLibraryMetadata(metadata);
    // SVG/clipart items from the external icon library use `svgUrl` directly on
    // the payload (no nested metadata), so check that too.
    const svgUrl = payload.svgUrl as string | undefined;
    const fileUrl = (payload.file_url as string | undefined)
      || svgUrl
      || metadata.file_url
      || metadata.imageUrl
      || metadata.svgUrl;

    const explicitContainer = targetContainerId
      ? padlets.find((p) => p.id === targetContainerId && p.type === 'container')
      : null;
    const slotContainer = padlets.find((p) => {
      if (p.type !== 'container' || p.metadata?.parentId) return false;
      const cStartRaw = typeof p.metadata?.start_date === 'string' ? p.metadata.start_date : null;
      const cEndRaw = typeof p.metadata?.end_date === 'string' ? p.metadata.end_date : null;
      if (!cStartRaw || !cEndRaw) return false;
      const cStart = new Date(cStartRaw);
      const cEnd = new Date(cEndRaw);
      if (Number.isNaN(cStart.getTime()) || Number.isNaN(cEnd.getTime()) || cEnd <= cStart) return false;

      // Use overlap instead of exact equality: drag/drop slot can differ from container range.
      return safeStart < cEnd && safeEnd > cStart;
    });
    const existingContainer = explicitContainer || slotContainer || null;

    try {
      const postId = crypto.randomUUID();
      const containerId = existingContainer?.id || crypto.randomUUID();

      const newPost: Padlet = {
        id: postId,
        board_id: canvasId,
        title: (payload.title as string) || (payload.label as string) || 'New Post',
        content: (payload.content as string) || '',
        type: ((payload.type as string) || (svgUrl ? 'image' : 'text')) as Padlet['type'],
        position_x: 0,
        position_y: 0,
        width: (payload.width as number) || 300,
        height: (payload.height as number) || 200,
        file_url: fileUrl || null,
        file_name: (payload.file_name as string) || undefined,
        file_type: (payload.file_type as string) || undefined,
        file_size: (payload.file_size as number) || undefined,
        created_at: now,
        updated_at: now,
        metadata: {
          ...sanitizedMetadata,
          parentId: containerId,
          start_date,
          end_date,
          imageUrl: fileUrl || sanitizedMetadata.imageUrl || sanitizedMetadata.svgUrl || svgUrl,
          svgUrl: svgUrl || sanitizedMetadata.svgUrl,
          fileUrl: fileUrl,
        },
      };

      if (existingContainer) {
        const childIds = (existingContainer.metadata?.childPadletIds || []) as string[];
        const newChildIds = [postId, ...childIds];

        setPadlets((prev) => [
          ...prev.map((p) =>
            p.id === existingContainer.id
              ? { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } }
              : p
          ),
          newPost,
        ]);

        await supabase.from('padlets').insert(newPost);
        await supabase
          .from('padlets')
          .update({
            metadata: { ...existingContainer.metadata, childPadletIds: newChildIds },
            updated_at: now,
          })
          .eq('id', existingContainer.id);
      } else {
        const newContainer: Padlet = {
          id: containerId,
          board_id: canvasId,
          title: '',
          content: '',
          type: 'container',
          position_x: 0,
          position_y: 0,
          width: 350,
          height: 300,
          created_at: now,
          updated_at: now,
          metadata: {
            start_date,
            end_date,
            childPadletIds: [postId],
            cardColor: '#ffffff',
          },
        };

        setPadlets((prev) => [...prev, newContainer, newPost]);

        await supabase.from('padlets').insert(newContainer);
        await supabase.from('padlets').insert(newPost);
      }

      setSelectedSchedulerSlot({ start: safeStart, end: safeEnd });
      setSelectedSchedulerContainerId(containerId);
      setSchedulerPopoverPadletId(containerId);
    } catch (err) {
      console.error('Failed to drop item into scheduler container:', err);
      fetchData();
    }
  }, [canvasId, padlets, supabase, setPadlets, fetchData]);

  // Ghost-drag: a toolbar-created post dropped on empty scheduler space gets a
  // brand-new default-duration container, created and attached in one shot so
  // we never depend on a re-fetch landing before the child post is inserted.
  const placeDraftInNewSchedulerContainer = useCallback(async (
    draft: PendingPostDraft,
    start: Date,
    end: Date,
  ) => {
    if (!canvasId) return;
    const now = new Date().toISOString();
    const containerId = crypto.randomUUID();
    const postId = crypto.randomUUID();

    const newContainer: Padlet = {
      id: containerId,
      board_id: canvasId,
      title: '',
      content: '',
      type: 'container',
      position_x: 0,
      position_y: 0,
      width: 350,
      height: 300,
      created_at: now,
      updated_at: now,
      metadata: {
        start_date: start.toISOString(),
        end_date: end.toISOString(),
        childPadletIds: [postId],
        cardColor: '#ffffff',
      },
    };

    const newPost: Padlet = {
      id: postId,
      board_id: canvasId,
      title: draft.title || '',
      content: draft.content || '',
      type: draft.kind,
      width: 300,
      height: 200,
      position_x: 0,
      position_y: 0,
      created_at: now,
      updated_at: now,
      metadata: {
        ...draft.metadata,
        parentId: containerId,
      },
    } as Padlet;

    setPadlets((prev) => [...prev, newContainer, newPost]);

    try {
      await supabase.from('padlets').insert(newContainer);
      await supabase.from('padlets').insert(newPost);
      setSelectedSchedulerSlot({ start, end });
      setSelectedSchedulerContainerId(containerId);
      toast.success('Post added to a new time slot');
    } catch (err) {
      console.error('Failed to create scheduler container for dropped post:', err);
      toast.error('Failed to place post');
      fetchData();
    }
  }, [canvasId, supabase, setPadlets, fetchData, setSelectedSchedulerSlot, setSelectedSchedulerContainerId]);

  // PR11.5 — Hoisted handlers (extracted from inline JSX props)
  // Must stay above early returns so hook count is stable across renders.
  const handleFreeformLibraryDrop = useCallback(async (e: React.DragEvent) => {
    const libraryContentStr = e.dataTransfer.getData('application/collabboard-library');
    if (!libraryContentStr) return;
    try {
      const content: LibraryItemContent = JSON.parse(libraryContentStr);
      const cleanMetadata = sanitizeLibraryMetadata(content.metadata);
      // Calculate position
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;
      const scrollLeft = containerRef.current?.scrollLeft || 0;
      const scrollTop = containerRef.current?.scrollTop || 0;
      const x = (e.clientX - containerRect.left + scrollLeft) / canvasZoom - (content.width / 2);
      const y = (e.clientY - containerRect.top + scrollTop) / canvasZoom - (content.height / 2);
      await addPadletFromLibraryItem({
        board_id: canvasId,
        title: content.title,
        content: content.content,
        type: content.type || 'text',
        position_x: Math.max(0, x),
        position_y: Math.max(0, y),
        width: content.width,
        height: content.height,
        metadata: cleanMetadata,
        file_url: content.file_url,
        file_name: content.file_name,
        file_type: content.file_type,
        file_size: content.file_size,
      });
    } catch (err) {
      console.error('Failed to create padlet from library item:', err);
    }
  }, [canvasId, canvasZoom, addPadletFromLibraryItem]);

  const handleFreeformCardDrop = useCallback(async (svgDataStr: string, dropX: number, dropY: number) => {
    const { svgUrl, title } = JSON.parse(svgDataStr);
    const newPadlet: Padlet = {
      id: crypto.randomUUID(),
      board_id: canvasId!,
      type: 'card',
      title: title || 'Untitled Card',
      content: '',
      position_x: dropX,
      position_y: dropY,
      width: 180,
      height: 220,
      metadata: {
        svgUrl,
        iconColor: '#000000',
        iconBgColor: '#ec4899',
        counterType: 'words',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    // ✅ OPTIMISTIC: instant UI update
    setPadlets((prev) => {
      const next = [...prev, newPadlet];
      return next;
    });
    // ✅ background sync (no fetchData)
    await addFreeformCardPadlet(newPadlet);
  }, [canvasId, setPadlets, addFreeformCardPadlet]);

  const handleDrawingLayoutAddPadlet = useCallback(async (postData: any) => {
    const { forceContainerPrompt: _forceContainerPrompt, ...cleanMetadata } = postData.metadata || {};
    const newId = crypto.randomUUID();
    const rawPositionX = postData.x_position ?? postData.position_x ?? 0;
    const rawPositionY = postData.y_position ?? postData.position_y ?? 0;
    const newPadlet = {
      ...postData,
      id: newId,
      board_id: canvasId,
      metadata: cleanMetadata,
      position_x: Math.round(rawPositionX),
      position_y: Math.round(rawPositionY),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    delete newPadlet.x_position;
    delete newPadlet.y_position;
    delete newPadlet.canvas_id;
    setPadlets(prev => [...prev, newPadlet as any]);

    return await addDrawingLayoutPadlet(newPadlet, newId);
  }, [canvasId, setPadlets, addDrawingLayoutPadlet]);

  const handleDrawingLayoutUpdatePadlet = useCallback(async (id: string, updates: any) => {
    const normalizedUpdates = { ...updates };
    if (typeof normalizedUpdates.position_x === 'number') {
      normalizedUpdates.position_x = Math.round(normalizedUpdates.position_x);
    }
    if (typeof normalizedUpdates.position_y === 'number') {
      normalizedUpdates.position_y = Math.round(normalizedUpdates.position_y);
    }
    await updateDrawingLayoutPadlet(id, normalizedUpdates);
  }, [updateDrawingLayoutPadlet]);

  const handleDrawingLayoutDeletePadlet = useCallback(async (id: string) => {
    await deletePadletById(id);
  }, []);

  // --- Drawing Canvas image placement flow ---
  const [drawingPendingDraft, setDrawingPendingDraft] = useState<Partial<Padlet> | null>(null);
  const [drawingContainerPromptOpen, setDrawingContainerPromptOpen] = useState(false);
  const [drawingGhostDraft, setDrawingGhostDraft] = useState<Partial<Padlet> | null>(null);
  // Ref populated by DrawingLayout so we can read live Excalidraw viewport state here
  const drawingAppStateRef = useRef<any>(null);
  // Ref populated by DrawingLayout so we can call Excalidraw API methods (e.g. scrollToContent) after modal creation
  const drawingExcalidrawAPIRef = useRef<any>(null);

  const closeAllToolbarLaunchedUi = useCallback(() => {
    closeAllToolbars();
    dispatch({
      type: 'EDITORS_PATCH',
      payload: {
        isNoteEditorOpen: false,
        isTableEditorOpen: false,
        isLinkEditorOpen: false,
        isTodoEditorOpen: false,
        isContainerEditorOpen: false,
        isCommentEditorOpen: false,
        isImageEditorOpen: false,
        isDrawingEditorOpen: false,
        isCardEditorOpen: false,
        isAIComponentEditorOpen: false,
        isAIContentEditModalOpen: false,
        isAIContentConvertModalOpen: false,
        padletToEdit: null,
        viewDrawingPadlet: null,
      },
    });
    setIsCanvasShareModalOpen(false);
    setIsCanvasSettingsModalOpen(false);
    setIsImportBrowserOpen(false);
    setIsClipartDraftModalOpen(false);
    setIsLibraryOpen(false);
    setIsMapStylePanelOpen(false);
    setFreeformWallpaperDialogOpen(false);
    setShowChronoModeModal(false);
    setIsPlacementPromptOpen(false);
    setWallPlacementPromptOpen(false);
    setContainerCreationPromptOpen(false);
    setDrawingContainerPromptOpen(false);
  }, [
    closeAllToolbars,
    dispatch,
    setIsLibraryOpen,
    setShowChronoModeModal,
    setWallPlacementPromptOpen,
    setContainerCreationPromptOpen,
    setDrawingContainerPromptOpen,
  ]);

  const closeDrawingSelectedShapePanel = useCallback(() => {
    if (!isDrawingLayout) return;
    const api = drawingExcalidrawAPIRef.current;
    if (!api?.updateScene) return;
    api.updateScene({
      appState: {
        selectedElementIds: {},
        selectedGroupIds: {},
        activeEmbeddable: null,
        selectedLinearElement: null,
        openPopup: null,
      },
    });
  }, [isDrawingLayout]);

  const handleDrawingLayoutAddPadletWithContainerCheck = useCallback(async (postData: any) => {
    const needsContainerPrompt =
      !postData.metadata?.parentId &&
      (postData.type === 'image' || postData.metadata?.forceContainerPrompt);

    if (needsContainerPrompt) {
      setDrawingPendingDraft(postData);
      setDrawingContainerPromptOpen(true);
      return null;
    }

    return handleDrawingLayoutAddPadlet(postData);
  }, [handleDrawingLayoutAddPadlet]);

  const handleDrawingNewContainer = useCallback(async () => {
    if (!drawingPendingDraft || !canvasId) return;
    setDrawingContainerPromptOpen(false);
    setDrawingPendingDraft(null);

    const containerId = crypto.randomUUID();
    const childId = crypto.randomUUID();
    const rawPosX = (drawingPendingDraft as any).position_x;
    const rawPosY = (drawingPendingDraft as any).position_y;
    let posX = Number.isFinite(rawPosX) ? Math.round(rawPosX) : 100;
    const posY = Number.isFinite(rawPosY) ? Math.round(rawPosY) : 100;

    const containerW = 380;
    const containerH = 320;
    const existingContainers = padlets.filter(
      p => p.type === 'container' || (p.metadata as any)?.isContainer
    );
    let attempts = 0;
    while (
      attempts < 20 &&
      existingContainers.some(
        p =>
          Math.abs(p.position_x - posX) < containerW &&
          Math.abs(p.position_y - posY) < containerH
      )
    ) {
      posX += containerW;
      attempts++;
    }

    const nowIso = new Date().toISOString();
    const { forceContainerPrompt: _forceContainerPrompt, ...childMetadata } = (drawingPendingDraft.metadata as any) || {};
    const containerPadlet: Padlet = {
      id: containerId,
      board_id: canvasId,
      type: 'container',
      title: 'New Container',
      content: '',
      position_x: posX,
      position_y: posY,
      width: 360,
      height: 300,
      created_at: nowIso,
      updated_at: nowIso,
      metadata: { childPadletIds: [childId], cardColor: '#ffffff' } as any,
    };
    const childPadlet: Padlet = {
      id: childId,
      board_id: canvasId,
      type: ((drawingPendingDraft as any).type || (drawingPendingDraft as any).kind || 'image') as Padlet['type'],
      title: (drawingPendingDraft as any).title || 'Image',
      content: typeof (drawingPendingDraft as any).content === 'string'
        ? (drawingPendingDraft as any).content
        : ((drawingPendingDraft as any).content != null ? JSON.stringify((drawingPendingDraft as any).content) : ''),
      file_url: (drawingPendingDraft as any).file_url || undefined,
      position_x: 0,
      position_y: 0,
      width: (drawingPendingDraft as any).width || 300,
      height: (drawingPendingDraft as any).height || 200,
      created_at: nowIso,
      updated_at: nowIso,
      metadata: { ...childMetadata, parentId: containerId } as any,
    };

    setPadlets(prev => [...prev, containerPadlet, childPadlet]);
    // Smooth pan to new container after scene sync (no zoom change)
    setTimeout(() => {
      const excAPI = drawingExcalidrawAPIRef.current;
      if (!excAPI) return;
      const el = excAPI.getSceneElements().find(
        (e: any) => e.type === 'embeddable' && e.link === `padlet://${containerId}` && !e.isDeleted
      );
      if (el) excAPI.scrollToContent([el], { fitToContent: false, animate: true, duration: 400 });
    }, 200);
    try {
      const { error: containerError } = await insertPadlet(containerPadlet);
      if (containerError) throw containerError;
      const { error: childError } = await insertPadlet(childPadlet);
      if (childError) throw childError;
    } catch (err: any) {
      console.error('Failed to create drawing container with image:', err?.message || err?.code || err?.details || err, { posX, posY });
      toast.error('Failed to create container');
      setPadlets(prev => prev.filter(p => p.id !== containerId && p.id !== childId));
    }
  }, [canvasId, drawingPendingDraft, insertPadlet, padlets]);

  const handleDrawingAddToExisting = useCallback(() => {
    setDrawingContainerPromptOpen(false);
    const ghost = drawingPendingDraft
      ? {
          ...drawingPendingDraft,
          metadata: (() => {
            const { forceContainerPrompt: _forceContainerPrompt, ...ghostMetadata } = (drawingPendingDraft.metadata as any) || {};
            return ghostMetadata;
          })(),
          type: (drawingPendingDraft as any).type || (drawingPendingDraft as any).kind || 'image',
        }
      : null;
    setDrawingGhostDraft(ghost as any);
    setDrawingPendingDraft(null);
  }, [drawingPendingDraft]);

  // --- End Drawing Canvas image placement flow ---

  const rawActions = {
    duplicatePadlet,
    requestDeletePadlet,
    cutPadlet,
    copyPadlet,
    lockPadlet,
    movePadletLayer,
    groupIntoColumn,
    replaceImage,
    downloadImage,
    toggleCropToGrid,
    handlePaste,
    renameComment,
    renameColumn,
    renameTodo,
    createSyncedCopy,
    addImageToLink,
    copyLinkAddress,
    deletePadletById,
    fetchData,
    updatePadletMetadata,
    updatePadletTitle,
    updatePadletContent,
    commitPadletMeta,
  };

  const stableActions = useStableCanvasActions(rawActions);

  const configState: CanvasConfigState = useMemo(() => ({
    canvasZoom,
    canvasId,
    isFreeformGraphMode,
    canUseFreeformEditButton,
    isColumnsLayout,
  }), [canvasZoom, canvasId, isFreeformGraphMode, canUseFreeformEditButton, isColumnsLayout]);

  const editorState: CanvasEditorState = {
    padletToEdit,
    setPadletToEdit,
    setIsNoteEditorOpen,
    setIsTableEditorOpen,
    setIsLinkEditorOpen,
    setIsTodoEditorOpen,
    setIsContainerEditorOpen,
    setIsCommentEditorOpen,
    setIsImageEditorOpen,
    setIsDrawingEditorOpen,
    setIsCardEditorOpen,
    setIsCardViewerOpen,
    setIsAIComponentEditorOpen,
    setIsAIContentEditModalOpen,
    setIsAIContentConvertModalOpen,
    imageToolbarPadletId,
    setImageToolbarPadletId,
    isImageColorPickerOpen,
    setIsImageColorPickerOpen,
    isImageEmojiOpen,
    setIsImageEmojiOpen,
    imageColorTab,
    setImageColorTab: (v: string) => setImageColorTab(v as any),
    setCropPadlet,
    setIsCropMode,
    setDrawingPadlet,
    setIsDrawingMode,
    editingCaption,
    setEditingCaption,
    captionPopupPadletId,
    setCaptionPopupPadletId,
    textStylePadletId,
    setTextStylePadletId,
    cardToolbarPadletId,
    setCardToolbarPadletId,
    isCardColorPickerOpen,
    setIsCardColorPickerOpen,
    cardColorTab,
    setCardColorTab: (v: string) => setCardColorTab(v as any),
    captionEditorPadletId,
    setCaptionEditorPadletId,
    setIsLibraryOpen,
    setIconReplaceTargetPadlet,
    cardCommentPopupPadletId,
    setCardCommentPopupPadletId,
    cardCommentList,
    setCardCommentList,
    activeCardCommentId,
    setActiveCardCommentId,
    editingCardCommentId,
    setEditingCardCommentId,
    editingCardCommentText,
    setEditingCardCommentText,
    commentColorPopupId,
    setCommentColorPopupId,
    activeCardComment,
    noteBadgeColorPadletId,
    setNoteBadgeColorPadletId,
    internalBadgeColorPopupId,
    setInternalBadgeColorPopupId,
    internalBadgePopupPosition,
    setInternalBadgePopupPosition: (v) => setInternalBadgePopupPosition(v as any),
    setDetachedPopupPosition,
    setDetachedPopupPadletId,
    setDetachedBadgeColorOpen,
    setDetachedPopupComments,
    setDetachedPopupOpen,
    collapsedPopupPadletId,
    setCollapsedPopupPadletId,
    collapsedBadgeColorOpen,
    setCollapsedBadgeColorOpen,
    collapsedActiveCommentId,
    setCollapsedActiveCommentId,
    collapsedEditingCommentId,
    setCollapsedEditingCommentId,
    collapsedEditingText,
    setCollapsedEditingText,
    collapsedCommentColorPopupId,
    setCollapsedCommentColorPopupId,
    setReminderPopupPosition,
    setReminderPopupTasks,
    setReminderPopupPadletId,
    setReminderPopupOpen,
    setShowDeleteConfirm,
    setViewDrawingPadlet,
    setCommentPopupPosition,
    setCommentPopupComments,
    setCommentPopupPadletId,
    setCommentPopupCommentId,
    setCommentPopupOpen,
    setCommentPopupHighlightColor,
    setTextLinkColorPickerPosition,
    setTextLinkColorPickerOpen,
    commentPopupPosition,
    commentPopupHighlightColor,
  };

  // Show loading state during SSR and initial hydration to prevent mismatch
  if (!hasMounted || loading) {
    return (
      <div
        className="h-screen flex items-center justify-center"
        suppressHydrationWarning
      >
        Loading...
      </div>
    );
  }
  if (!canvasId) return <div className="h-screen flex items-center justify-center text-red-600">Missing canvas ID</div>;
  if (error || !canvas) return <div className="h-screen flex items-center justify-center text-red-600">{error || 'Canvas not found'}</div>;

  // Canvas-specific tools: only tools that are unique to the active canvas type
  const canvasSpecificTools = [
    { icon: MoveRight, label: "Line", color: "text-gray-600", bg: "hover:bg-gray-50", type: "line" },
    ...(isMapLayout ? [
      { icon: MapPinToolbarIcon, label: "Pins panel", color: "text-slate-700", bg: "hover:bg-slate-100", type: "map-sidebar" },
      { icon: MapIcon, label: "Map", color: "text-emerald-600", bg: "hover:bg-emerald-50", type: "map-style" },
    ] : []),
    ...(isFreeformLayout ? [
      ...(isFreeformGraphMode ? [{ icon: GraphLineToolIcon, label: "Graph Line", color: "text-indigo-600", bg: "hover:bg-indigo-50", type: "graph-line" }] : []),
      { icon: Columns3, label: "Column", color: "text-violet-700", bg: "hover:bg-violet-50", type: "container" },
    ] : []),
  ];

  const toolbarGroups = [
    // Group 1 — Canvas-specific (always visible, priority 1); only rendered when there are canvas-specific tools
    ...(canvasSpecificTools.length > 0 ? [{
      id: 'canvas',
      label: isMapLayout ? 'Map' : 'Canvas',
      tools: canvasSpecificTools,
      priority: 1,
      alwaysVisible: true,
    }] : []),
    // Group 2 — Create (always visible, priority 2); AI is always first
    {
      id: 'create',
      label: 'Create',
      tools: [
        { icon: Sparkles, label: "AI", color: "text-purple-600", bg: "hover:bg-purple-50", type: "ai-component" },
        { icon: StickyNote, label: "Note", color: "text-yellow-600", bg: "hover:bg-yellow-50", type: "note" },
        { icon: CheckSquare, label: "To-do", color: "text-green-600", bg: "hover:bg-green-50", type: "todo" },
        { icon: MessageCircle, label: "Comment", color: "text-orange-600", bg: "hover:bg-orange-50", type: "comment" },
        { icon: Table, label: "Table", color: "text-purple-600", bg: "hover:bg-purple-50", type: "table" },
      ],
      priority: 2,
      alwaysVisible: true,
    },
    // Group 3 — Structure (priority 3)
    {
      id: 'structure',
      label: 'Blocks',
      tools: [
        { icon: BookOpen, label: "Library", color: "text-blue-600", bg: "hover:bg-blue-50", type: "library",
          disabled: isTimelineLayout && chronoMode === 'vertical',
          hint: "Switch to Horizontal or Alternating view to use the Library." },
      ],
      priority: 4,
    },
    // Group 4 — Media (priority 4)
    {
      id: 'media',
      label: 'Media',
      tools: [
        { icon: Link, label: "Link", color: "text-blue-600", bg: "hover:bg-blue-50", type: "link" },
        { icon: ImageIcon, label: "Add image", color: "text-pink-600", bg: "hover:bg-pink-50", type: "image" },
        { icon: Upload, label: "Upload", color: "text-cyan-600", bg: "hover:bg-cyan-50", type: "upload" },
        { icon: CloudDownload, label: "Import", color: "text-sky-600", bg: "hover:bg-sky-50", type: "import" },
      ],
      priority: 5,
    },
    // Group 5 — Draw (priority 5, collapsed first on small screens)
    {
      id: 'draw',
      label: 'Draw',
      tools: [
        { icon: PenTool, label: "Draw", color: "text-red-600", bg: "hover:bg-red-50", type: "draw" },
      ],
      priority: 6,
    },
    ...(canManageCanvasShare ? [{
      id: 'share',
      label: 'Share',
      tools: [
        { icon: UserPlus, label: 'Share canvas', color: 'text-slate-700', bg: 'hover:bg-slate-100', type: 'share' },
      ],
      priority: 7,
      alwaysVisible: true,
    }] : []),
    ...(canUseFreeformEditButton ? [{
      id: 'settings',
      label: 'Settings',
      tools: [
        { icon: Settings, label: 'Canvas settings', color: 'text-slate-700', bg: 'hover:bg-slate-100', type: 'canvas-settings' },
      ],
      priority: 8,
      alwaysVisible: true,
    }] : []),
  ];

  const handleToolClick = (toolType: string) => {
    if (selectedPadletIds.length > 0) {
      setSelectedPadletIds([]);
    }

    if (toolType !== 'graph-line' && isGraphConnectMode) {
      setIsGraphConnectMode(false);
      setGraphConnectSource(null);
      setGraphConnectSelection(null);
    }

    if (toolType !== 'line' && isLineMode) {
      setIsLineMode(false);
      setSelectedLineId(null);
    }

    // Close all editors when opening a new one - there can't be two open at the same time
    if (toolType !== 'trash' && toolType !== 'library' && toolType !== 'map-style' && toolType !== 'line' && toolType !== 'graph-line') {
      setIsNoteEditorOpen(false);
      setIsLinkEditorOpen(false);
      setIsTableEditorOpen(false);
      setIsTodoEditorOpen(false);
      setIsCommentEditorOpen(false);
      setIsImageEditorOpen(false);
      setIsDrawingEditorOpen(false);
      setIsAIComponentEditorOpen(false);
      setIsAIContentEditModalOpen(false);
      setIsAIContentConvertModalOpen(false);
      setIsContainerEditorOpen(false);
    }
    const baseMetadata = isSchedulerLayout && selectedSchedulerSlot ? {
      start_date: selectedSchedulerSlot.start.toISOString(),
      end_date: selectedSchedulerSlot.end.toISOString(),
    } : {};
    const mapContainerId =
      isMapLayout && mapActiveContainerId && padlets.some((p) => p.id === mapActiveContainerId && p.type === 'container')
        ? mapActiveContainerId
        : null;
    const schedulerContainerId =
      isSchedulerLayout && selectedSchedulerContainerId && padlets.some((p) => p.id === selectedSchedulerContainerId && p.type === 'container')
        ? selectedSchedulerContainerId
        : null;
    const createMetadata = mapContainerId
      ? { ...baseMetadata, parentId: mapContainerId }
      : schedulerContainerId
        ? { ...baseMetadata, parentId: schedulerContainerId }
        : baseMetadata;

    switch (toolType) {
      case 'note':
        // Open Note Editor
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'New Note',
          content: '',
          type: 'text',
          position_x: 0,
          position_y: 0,
          width: 280,
          height: 250,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsNoteEditorOpen(true);
        break;
      case 'table':
        // Open Table/Spreadsheet Editor
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'New Table',
          content: '{"columns":["A","B","C"],"rows":[["","",""],["","",""],["","",""]]}',
          type: 'table',
          position_x: 0,
          position_y: 0,
          width: 280,
          height: 250,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsTableEditorOpen(true);
        break;
      case 'link':
        // Open Link Editor
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'New Link',
          content: '',
          type: 'link',
          position_x: 0,
          position_y: 0,
          width: 280,
          height: 250,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsLinkEditorOpen(true);
        break;
      case 'todo':
        // Open Todo Editor
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'New To-Do',
          content: '',
          type: 'todo',
          position_x: 0,
          position_y: 0,
          width: 280,
          height: 250,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsTodoEditorOpen(true);
        break;
      case 'line':
        // Close native Excalidraw selected-shape panel before line-post flow begins
        closeDrawingSelectedShapePanel();
        const api = drawingExcalidrawAPIRef.current;
        if (isDrawingLayout && api && typeof api.setActiveTool === "function") {
          api.setActiveTool({ type: "selection" });
        }
        // Toggle line drawing mode
        if (isLineMode) {
          // Deactivate line mode
          setIsLineMode(false);
          setSelectedLineId(null);
        } else {
          // Activate line mode
          if (isFreeformGraphMode) {
            setIsGraphConnectMode(false);
            setGraphConnectSource(null);
          }
          setIsLineMode(true);
          setSelectedPadletId(null); // Deselect any padlet
        }
        break;
      case 'graph-line':
        handleToggleGraphConnect();
        break;
      case 'trash':
        // Delete selected post or line
        if (selectedLineId) {
          deleteLine(selectedLineId);
        } else if (selectedPadletId) {
          requestDeletePadlet(selectedPadletId);
        }
        break;
      case 'container':
        if (isFreeformLayout) {
          closeAllToolbarLaunchedUi();
          void handleCreateEmptyFreeformContainer();
          break;
        }

        // Open Container Editor
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'New Container',
          content: '',
          type: 'container',
          position_x: 0,
          position_y: 0,
          width: 350,
          height: 300,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...baseMetadata },
        });
        setIsContainerEditorOpen(true);
        break;
      case 'comment':
        // Open Comment Editor for standalone comment post
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'Comment',
          content: '',
          type: 'comment',
          position_x: 0,
          position_y: 0,
          width: 50,
          height: 50,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsCommentEditorOpen(true);
        break;
      case 'image':
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        if (mapContainerId) {
          setPadletToEdit({
            id: 'new',
            board_id: canvasId,
            title: 'New Image',
            content: '',
            type: 'image',
            position_x: 0,
            position_y: 0,
            width: 280,
            height: 250,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: { ...createMetadata },
          });
        } else {
          setPadletToEdit(null);
        }
        setIsImageEditorOpen(true);
        setImageEditorTab('search');
        break;
      case 'upload':
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        if (mapContainerId) {
          setPadletToEdit({
            id: 'new',
            board_id: canvasId,
            title: 'Upload Image',
            content: '',
            type: 'image',
            position_x: 0,
            position_y: 0,
            width: 280,
            height: 250,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            metadata: { ...createMetadata },
          });
        } else {
          setPadletToEdit(null);
        }
        setIsImageEditorOpen(true);
        setImageEditorTab('upload');
        break;
      case 'import':
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setIsImportBrowserOpen(true);
        break;
      case 'draw':
        // Open Excalidraw Editor
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'Drawing',
          content: '',
          type: 'drawing',
          position_x: 0,
          position_y: 0,
          width: 400,
          height: 300,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsDrawingEditorOpen(true);
        break;
      case 'ai-component':
        closeDrawingSelectedShapePanel();
        closeAllToolbarLaunchedUi();
        setPadletToEdit({
          id: 'new',
          board_id: canvasId,
          title: 'AI Component',
          content: '',
          type: 'ai-component',
          position_x: 0,
          position_y: 0,
          width: 500,
          height: 400,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: { ...createMetadata },
        });
        setIsAIComponentEditorOpen(true);
        break;
      case 'library':
        {
          const shouldOpenLibrary = !isLibraryOpen;
          closeAllToolbarLaunchedUi();
          if (shouldOpenLibrary) {
            setIsLibraryOpen(true);
          }
        }
        break;
      case 'map-style':
        {
          const shouldOpenMapStylePanel = !isMapStylePanelOpen;
          closeAllToolbarLaunchedUi();
          if (shouldOpenMapStylePanel) {
            setIsMapStylePanelOpen(true);
          }
        }
        break;
      case 'map-sidebar':
        if (!isMapLayout) break;
        setIsMapSidebarOpen((prev) => !prev);
        break;
      case 'share':
        closeAllToolbarLaunchedUi();
        setIsCanvasShareModalOpen(true);
        break;
      case 'canvas-settings':
        closeAllToolbarLaunchedUi();
        setIsCanvasSettingsModalOpen(true);
        break;
      default:
        break;
    }
  };

  const openPadletInTypeEditor = (post: Padlet) => {
    closeDrawingSelectedShapePanel();
    closeAllToolbarLaunchedUi();
    if (post.type === 'image' && (isDrawingLayout || isTimelineLayout)) {
      openImagePostEditor(post);
      return;
    }
    setPadletToEdit(post);
    if (post.type === 'image') setIsImageEditorOpen(true);
    else if (post.type === 'todo') setIsTodoEditorOpen(true);
    else if (post.type === 'link') setIsLinkEditorOpen(true);
    else if (post.type === 'table') setIsTableEditorOpen(true);
    else if (post.type === 'container') setIsContainerEditorOpen(true);
    else if (post.type === 'comment') setIsCommentEditorOpen(true);
    else if (post.type === 'drawing') setIsDrawingEditorOpen(true);
    else if (post.type === 'ai-component') setIsAIComponentEditorOpen(true);
    else if (post.type === 'card' && post.metadata?.svgUrl) setIsClipartDraftModalOpen(true);
    else if (post.type === 'card') setIsCardEditorOpen(true);
    else setIsNoteEditorOpen(true);
  };
  // Keep the ref current so the early-mounted useEffect can call this function
  openPadletInTypeEditorRef.current = openPadletInTypeEditor;

  const openPadletTargetFromContextMenu = (post: Padlet) => {
    if (post.type === 'image') {
      window.setTimeout(() => {
        openPadletInTypeEditor(post);
      }, 0);
      return;
    }
    openPadletInTypeEditor(post);
  };

  const closeDrawingEditorsBeforePadletEdit = () => {
    setIsNoteEditorOpen(false);
    setIsLinkEditorOpen(false);
    setIsTableEditorOpen(false);
    setIsTodoEditorOpen(false);
    setIsCommentEditorOpen(false);
    setIsImageEditorOpen(false);
    setIsDrawingEditorOpen(false);
    setIsAIComponentEditorOpen(false);
    setIsAIContentEditModalOpen(false);
    setIsAIContentConvertModalOpen(false);
    setIsCardEditorOpen(false);
    setIsContainerEditorOpen(false);
  };

  // === BEGIN RENDER REGION (JSX ONLY) ===
  // All hooks are declared above the early returns to preserve hook ordering.
  if (isKanbanLayout) {
    return (
      <KanbanShell
        canvasId={canvas.id}
        canvasTitle={canvas.title || 'Untitled canvas'}
        enableGantt={enableGantt}
        enableScheduler={enableScheduler}
        isGanttVisible={isGanttVisible}
        isSchedulerVisible={isSchedulerVisible}
        setIsGanttVisible={setIsGanttVisible}
        setIsSchedulerVisible={setIsSchedulerVisible}
        currentWorkspaceRole={currentWorkspaceRole}
        onBack={() => router.push('/dashboard')}
      />
    );
  }

  if (isGanttLayout) {
    return (
      <GanttShell
        canvasId={canvas.id}
        canvasTitle={canvas.title || 'Untitled canvas'}
        currentWorkspaceRole={currentWorkspaceRole}
        onBack={() => router.push('/dashboard')}
      />
    );
  }

  return (
    <div className={`h-screen w-full flex overflow-y-hidden overflow-x-visible min-w-0 ${isWallLayout || isGridLayout ? '' : ''} ${isSchedulerLayout ? 'scheduler-mode' : ''}`}>
      {/* Main Canvas */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col relative">
        {showCanvasTitleHeader && (
          <CanvasTitleHeader
            title={canvas.title || 'Untitled canvas'}
            description={canvas.description}
            icon={(canvas as any).thumbnail}
            showTitle={showCanvasTitleHeaderTitle}
            showDescription={showCanvasTitleHeaderDescription}
            showIcon={showCanvasTitleHeaderIcon}
          />
        )}
        {/* Container size controls removed */}
        {canUseCanvasToolbar && !effectiveToolbarCollapsed && (
          <div
            className="absolute left-0 bottom-0 z-[3000]"
            style={{ top: showCanvasTitleHeader ? CANVAS_TITLE_HEADER_HEIGHT : 0 }}
          >
            <CanvasSidebar
              groups={toolbarGroups}
              isLineMode={isLineMode}
              isGraphConnectMode={isGraphConnectMode}
              isCollapsed={effectiveToolbarCollapsed}
              onToggleCollapse={handleToolbarCollapseToggle}
              onBeforeToolClick={closeDrawingSelectedShapePanel}
              handleToolClick={handleToolClick}
              onBack={() => router.push('/dashboard')}
            />
          </div>
        )}

        {/* Editor Modals - Wrapped with stopPropagation for defense-in-depth */}
        <CanvasShareModal
          isOpen={isCanvasShareModalOpen}
          onClose={() => setIsCanvasShareModalOpen(false)}
          canvasId={canvas.id}
          canvasTitle={canvas.title || 'Untitled canvas'}
          currentWorkspaceRole={currentWorkspaceRole}
        />

        <CanvasSettingsModal
          isOpen={isCanvasSettingsModalOpen}
          onClose={() => setIsCanvasSettingsModalOpen(false)}
          canvasId={canvas.id}
          canvas={canvas}
          hasSections={sections.length > 0}
          currentWorkspaceRole={currentWorkspaceRole}
          onSaved={() => fetchData()}
        />

        <CanvasModals
          isNoteEditorOpen={isNoteEditorOpen}
          setIsNoteEditorOpen={setIsNoteEditorOpen}
          isLinkEditorOpen={isLinkEditorOpen}
          setIsLinkEditorOpen={setIsLinkEditorOpen}
          isTableEditorOpen={isTableEditorOpen}
          setIsTableEditorOpen={setIsTableEditorOpen}
          isTodoEditorOpen={isTodoEditorOpen}
          setIsTodoEditorOpen={setIsTodoEditorOpen}
          isContainerEditorOpen={isContainerEditorOpen}
          setIsContainerEditorOpen={setIsContainerEditorOpen}
          isCommentEditorOpen={isCommentEditorOpen}
          setIsCommentEditorOpen={setIsCommentEditorOpen}
          isImageEditorOpen={isImageEditorOpen}
          setIsImageEditorOpen={setIsImageEditorOpen}
          isDrawingEditorOpen={isDrawingEditorOpen}
          setIsDrawingEditorOpen={setIsDrawingEditorOpen}
          isAIComponentEditorOpen={isAIComponentEditorOpen}
          setIsAIComponentEditorOpen={setIsAIComponentEditorOpen}
          isAIContentEditModalOpen={isAIContentEditModalOpen}
          setIsAIContentEditModalOpen={setIsAIContentEditModalOpen}
          isAIContentConvertModalOpen={isAIContentConvertModalOpen}
          setIsAIContentConvertModalOpen={setIsAIContentConvertModalOpen}
          padletToEdit={padletToEdit}
          setPadletToEdit={setPadletToEdit}
          padlets={padlets}
          setPadlets={setPadlets}
          selectedPadletId={selectedPadletId}
          viewDrawingPadlet={viewDrawingPadlet}
          setViewDrawingPadlet={setViewDrawingPadlet}
          imageEditorTab={imageEditorTab}
          user={user}
          canvasLayout={canvas?.layout}
          canvasId={canvasId}
          saveNote={saveNote}
          saveLink={saveLink}
          saveTable={saveTable}
          saveTodo={saveTodo}
          saveContainer={saveContainer}
          saveComment={saveComment}
          saveImage={saveImage}
          saveDrawing={saveDrawing}
          saveAIComponent={saveAIComponent}
          closeAllToolbars={closeAllToolbars}
          openPadletInTypeEditor={openPadletInTypeEditor}
          handleDetachChildFromFreeformContainer={handleDetachChildFromFreeformContainer}
          handleDeleteChildFromContainer={handleDeleteChildFromContainer}
          fetchData={fetchData}
          updatePadletById={updatePadletById}
        />

        {/* Canvas Content - Vertical scrolling for Wall, Horizontal for others */}
        <CanvasViewport
          className={`flex-1 min-h-0 min-w-0 relative no-scrollbar ${isWallLayout || isGridLayout
            ? 'overflow-x-hidden overflow-y-auto overscroll-x-none'
            : isColumnsLayout
              ? 'overflow-x-auto overflow-y-hidden p-6'
              : isTimelineLayout || isDrawingLayout || isMapLayout
                ? 'overflow-hidden p-0'
                : 'overflow-x-auto overflow-y-auto p-6'
            }`}
          style={{
            ...canvasBackgroundStyle,
            ...(sharedCanvasToolbarInsetPx > 0 ? { paddingLeft: `${sharedCanvasToolbarInsetPx}px` } : {}),
            ...(isWallLayout || isGridLayout ? { scrollbarGutter: 'stable' } : {}),
          }}
          overlay={canUseCanvasToolbar && effectiveToolbarCollapsed ? (
            <button
              type="button"
              className="absolute left-4 top-4 z-[3000] flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white/95 text-gray-600 shadow-sm transition hover:bg-gray-50"
              onClick={handleToolbarCollapseToggle}
              aria-label="Expand toolbar"
            >
              <span className="text-sm leading-none" aria-hidden="true">{'>'}</span>
            </button>
          ) : undefined}
          containerRef={containerRef}
          onWheel={(e) => {
            // Zoom with Ctrl + Wheel
            if (e.ctrlKey) {
              e.preventDefault();
              e.stopPropagation();
              const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
              setCanvasZoom(z => {
                const newZoom = Math.max(0.1, Math.min(3, z + zoomDelta));
                return newZoom;
              });
            }
          }}
          onMouseDown={handleFreeformPanMouseDown}
          onDragOver={(e) => {
            e.preventDefault();
            // Edge-scroll when dragging near container edges (outer container handler)
            const container = containerRef.current;
            if (container) {
              const containerRect = container.getBoundingClientRect();
              const edgeThreshold = 60;
              const scrollSpeed = 15;

              const mouseRelX = e.clientX - containerRect.left;
              const mouseRelY = e.clientY - containerRect.top;

              // Horizontal edge scrolling
              if (mouseRelX < edgeThreshold) {
                container.scrollLeft -= scrollSpeed;
              } else if (mouseRelX > containerRect.width - edgeThreshold) {
                container.scrollLeft += scrollSpeed;
              }

              // Vertical edge scrolling
              if (mouseRelY < edgeThreshold) {
                container.scrollTop -= scrollSpeed;
              } else if (mouseRelY > containerRect.height - edgeThreshold) {
                container.scrollTop += scrollSpeed;
              }
            }
          }}
          onDrop={async (e) => {
            console.log('DEBUG: [CanvasViewport] onDrop', {
              target: e.target,
              isTimelineLayout, isWallLayout, isFreeformLayout,
              isDrawingLayout
            });
            e.preventDefault();
            // 1. Try dealing with a line drop
            // (Lines logic if needed, usually Lines are drag-created, not dropped-moved, 
            // but if we support moving lines later, handled here)

            // 2. Handle Padlet Drop (from container or just moving)
            const padletId = e.dataTransfer.getData('text/padlet-id');
            if (!padletId) return;

            // Calculate drop position relative to canvas container
            // We need to account for scroll position of the container
            const containerRect = containerRef.current?.getBoundingClientRect();
            if (!containerRect) return;

            const scrollLeft = containerRef.current?.scrollLeft || 0;
            const scrollTop = containerRef.current?.scrollTop || 0;

            const x = (e.clientX - containerRect.left + scrollLeft) / canvasZoom - 100; // Center offset approx
            const y = (e.clientY - containerRect.top + scrollTop) / canvasZoom - 50;

            const draggedPadlet = padlets.find(p => p.id === padletId);
            if (!draggedPadlet) return;

            // Check if it's coming from a container (has parentId)
            const oldParentId = draggedPadlet.metadata?.parentId;

            if (oldParentId) {
              // DETACH LOGIC
              try {
                // 1. Remove parentId from the padlet and update position
                const newMetadata = { ...draggedPadlet.metadata };
                delete newMetadata.parentId;

                // Optimistic update for padlet
                setPadlets(prev => prev.map(p =>
                  p.id === padletId
                    ? { ...p, position_x: x, position_y: y, metadata: newMetadata }
                    : p
                ));

                await supabase
                  .from('padlets')
                  .update({
                    metadata: newMetadata,
                    position_x: Math.max(0, x),
                    position_y: Math.max(0, y),
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', padletId);

                // 2. Remove from old container's list
                const oldParent = padlets.find(p => p.id === oldParentId);
                if (oldParent) {
                  const oldChildIds = oldParent.metadata?.childPadletIds || [];
                  const newChildIds = oldChildIds.filter((id: string) => id !== padletId);

                  // Optimistic update for container
                  setPadlets(prev => prev.map(p =>
                    p.id === oldParentId
                      ? { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } }
                      : p
                  ));

                  // **CRITICAL FIX**: If the container we just dragged from is currently OPEN (padletToEdit),
                  // we must update that local state too, otherwise it still shows the child.
                  if (padletToEdit && padletToEdit.id === oldParentId) {
                    setPadletToEdit({
                      ...padletToEdit,
                      metadata: { ...padletToEdit.metadata, childPadletIds: newChildIds }
                    });
                  }

                  await supabase
                    .from('padlets')
                    .update({
                      metadata: { ...oldParent.metadata, childPadletIds: newChildIds },
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', oldParentId);
                }

                fetchData();
              } catch (err) {
                console.error('Failed to detach padlet on drop:', err);
              }
            } else {
              // 3. Handle Library Item Drop
              await handleFreeformLibraryDrop(e);
            }
          }}
          onContextMenu={(e) => {
            if (!isFreeformLayout || isAnyEditorOpen || !canUseFreeformEditButton) return;
            if ((e.target as HTMLElement).closest('[data-padlet-id]')) return;
            e.preventDefault();
            e.stopPropagation();
            openFreeformBoardMenuAt(e.clientX, e.clientY);
          }}
          onClick={() => {
            // Guard: If an editor is open, don't clear state on canvas click
            if (isAnyEditorOpen) return;

            // Click on empty canvas deselects
            // We relax the e.target === e.currentTarget check to catch clicks on grid lines/empty overlays
            // as long as the click wasn't caught and stopped by a padlet

            // If actively editing line points, clicking empty canvas should exit edit mode.
            // Interactions on the line/path/handles call stopPropagation, so they won't reach here.
            if (lineEditModeId) {
              setLineEditModeId(null);
              return;
            }

            if (!isLineMode) {
              setSelectedPadletId(null);
              setSelectedPadletIds([]);
              setSelectedLineId(null);
              setLineEditModeId(null); // Also clear line edit mode
              setFreeformBoardMenu(null);
              setCaptionPopupPadletId(null);
              setTextStylePadletId(null);
              setImageToolbarPadletId(null);
              setIsDrawingMode(false);
              setIsCropMode(false);
              setCardToolbarPadletId(null); // Close card toolbar
              setCaptionEditorPadletId(null); // Close card inline editor
              setCardToolbarPadletId(null); // Close card toolbar
              setCaptionEditorPadletId(null); // Close card inline editor
              setIsCardColorPickerOpen(false); // Close card color picker
              setIsImageColorPickerOpen(false); // Close image color picker
              setIsContainerEditorOpen(false); // Close container editor
            }
          }}
          onMouseMove={handleViewportMouseMove}
          onMouseUp={handleViewportMouseUp}
          onMouseLeave={() => {
            if (isFreeformPanning) return;
            if (newPostDragState.isActive) {
              handleCanvasMouseUp();
              return;
            }
            if (isAnyEditorOpen) return;
            handleCanvasMouseUp();
          }}
        >
          {/* ── Dynamic Excalidraw-style context hints ── */}
          {(() => {
            const hintStyle = getGraphConnectHintStyle();
            const kbdStyle: React.CSSProperties = {
              display: 'inline-block',
              fontFamily: 'monospace',
              border: '1px solid currentColor',
              borderRadius: '4px',
              padding: '1px 5px',
              fontSize: '10px',
              opacity: 0.8,
              lineHeight: '1.4',
            };

            // ── Priority-ordered hint resolution ──
            // Higher-priority states (active tools / interactions) first,
            // then passive states (empty canvas onboarding) last.
            let hintContent: React.ReactNode = null;

            // ▸ P0 – Active tool modes (always shown while tool is active)
            if (isFreeformGraphMode && isGraphConnectMode) {
              hintContent = (
                <>
                  Select post <kbd style={kbdStyle}>FROM</kbd>, then select post <kbd style={kbdStyle}>TO</kbd>.{' '}
                  To delete, select in reverse or <kbd style={kbdStyle}>right-click</kbd> the line → <kbd style={kbdStyle}>Delete</kbd>
                </>
              );
            } else if (isLineMode) {
              hintContent = (
                <>
                  Hold the left mouse button and drag to draw the line.{' '}
                  <kbd style={kbdStyle}>Esc</kbd> to cancel
                </>
              );

            // ▸ P1 – Active selection states
            } else if (selectedLineId && lineEditModeId) {
              hintContent = (
                <>
                  Drag control points to reshape. <kbd style={kbdStyle}>Click</kbd> away or <kbd style={kbdStyle}>Esc</kbd> to finish editing
                </>
              );
            } else if (selectedLineId) {
              hintContent = (
                <>
                  Line selected — <kbd style={kbdStyle}>Double-click</kbd> to edit, <kbd style={kbdStyle}>Delete</kbd> to remove, <kbd style={kbdStyle}>Esc</kbd> to deselect
                </>
              );

            // ▸ P2 – Library panel open (click-to-place workflow)
            } else if (isLibraryOpen) {
              hintContent = isMapLayout ? (
                <>
                  <kbd style={kbdStyle}>Click</kbd> a clipart to edit and place it in the open pin
                </>
              ) : isFreeformLayout ? (
                <>
                  <kbd style={kbdStyle}>Click</kbd> a clipart to edit and place it on the canvas
                </>
              ) : (
                <>
                  <kbd style={kbdStyle}>Click</kbd> a clipart to edit, then choose a container. Use <kbd style={kbdStyle}>✓</kbd> to select for deletion
                </>
              );

            // ▸ P3 – Ghost drag active (toolbar-created post being placed)
            } else if (newPostDragState.isActive) {
              hintContent = isFreeformLayout ? (
                <>
                  <kbd style={kbdStyle}>Drop</kbd> to place the post on the canvas
                </>
              ) : (
                <>
                  <kbd style={kbdStyle}>Drop</kbd> to place the post into a container
                </>
              );

            // ▸ P4 – Empty-canvas onboarding (shown once, disappears when content exists)
            } else if (isWallLayout && padlets.length === 0) {
              hintContent = (
                <>
                  Use the <kbd style={kbdStyle}>toolbar</kbd> to add your first post. <kbd style={kbdStyle}>Drag</kbd> posts to reorder
                </>
              );
            } else if (isColumnsLayout && padlets.filter(p => p.type === 'container').length === 0) {
              hintContent = (
                <>
                  Add a <kbd style={kbdStyle}>Note</kbd> or other post to auto-create the first column. Drag posts between columns to organize
                </>
              );
            } else if (isGridLayout && padlets.filter(p => p.type === 'container').length === 0) {
              hintContent = (
                <>
                  Add a <kbd style={kbdStyle}>Note</kbd> or other post to get started. Posts are arranged in a responsive grid
                </>
              );
            } else if (isTimelineLayout && padlets.length === 0) {
              hintContent = (
                <>
                  Add posts to build your timeline. Use <kbd style={kbdStyle}>toolbar</kbd> to switch between horizontal, vertical &amp; alternating views
                </>
              );
            } else if (isMapLayout && padlets.filter(p => p.type === 'container').length === 0) {
              hintContent = (
                <>
                  <kbd style={kbdStyle}>Click</kbd> on the map to place a pin, then add posts inside it
                </>
              );
            } else if (isFreeformLayout && padlets.length === 0) {
              hintContent = (
                <>
                  <kbd style={kbdStyle}>Double-click</kbd> the canvas to quick-add a note. Use the <kbd style={kbdStyle}>toolbar</kbd> for other post types
                </>
              );
            } else if (isDrawingLayout && padlets.length === 0) {
              hintContent = (
                <>
                  Use the <kbd style={kbdStyle}>Draw</kbd> tool or add posts from the <kbd style={kbdStyle}>toolbar</kbd>
                </>
              );
            } else if (isSchedulerLayout && padlets.length === 0) {
              hintContent = (
                <>
                  <kbd style={kbdStyle}>Click</kbd> a time slot to schedule a post, or use the <kbd style={kbdStyle}>toolbar</kbd> to add one
                </>
              );
            }

            if (!hintContent) return null;

            return (
              <div className="pointer-events-none fixed left-1/2 bottom-4 -translate-x-1/2 z-[2200]">
                <span
                  className="block text-center"
                  style={{
                    ...hintStyle,
                    backgroundColor: 'rgba(229, 231, 235, 0.9)',
                    color: '#111827',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    boxShadow: '0 2px 8px rgba(15, 23, 42, 0.12)',
                  }}
                >
                  {hintContent}
                </span>
              </div>
            );
          })()}

          {/* Layer 1: Background Lines (Behind Padlets) — back-plane only */}
          {/* pointer-events on the div stays 'none' (pass-through); the SVG enables its own
              events via forcePointerEvents so only actual line hit-paths are interactive.
              Padlets above in z-order naturally block clicks on covered segments. */}
          <div className="absolute inset-0" style={{ zIndex: 0, pointerEvents: 'none' }}>
            <SimpleLineRenderer
              lines={isMapLayout ? [] : lines.filter(l => (l.layer_plane ?? 'front') === 'back')}
              selectedLineId={selectedLineId}
              onSelectLine={handleLineSelect}
              onUpdateLine={updateLineLocal}
              onSaveLine={saveLineToDbMapAware}
              isLineMode={false}
              onCreateLine={createLineForMap}
              isEditMode={isMapLayout ? false : lineEditModeId !== null}
              onToggleEditMode={handleToggleLineEditMode}
              layer="back"
              draggingLineId={draggingLineId}
              onDragChange={handleLineDragChange}
              onContextMenu={handleLineContextMenu}
              forcePointerEvents={true}
              excalidrawAPIRef={isDrawingLayout ? drawingExcalidrawAPIRef : undefined}
            />
          </div>

          {/* Layer 2: Padlets - No container z-index so posts can interleave with lines */}
          <PadletLayer
            className={`relative ${(isLineMode || selectedLineId || lineEditModeId) ? 'select-none' : ''}`}
            style={{
              // Wall/Grid layout: responsive sizing; Freeform: large stage for absolute positioning
              // Columns/Timeline/Kanban layout: needs to fit viewport exact height for internal scrolling
              ...(isWallLayout || isGridLayout
                ? { width: '100%', maxWidth: '100%', minWidth: 0, minHeight: '100%' }
                : isColumnsLayout || isTimelineLayout || isKanbanLayout || isSchedulerLayout || isMapLayout
                  ? { width: '100%', height: '100%', minWidth: 0, minHeight: 0, overflow: 'hidden' }
                  : { minWidth: '2000px', minHeight: '1500px' }
              ),
              userSelect: (isLineMode || selectedLineId || lineEditModeId) ? 'none' : 'auto',
              position: 'relative',
              // Removed zIndex: 1 - posts now use their individual z-indexes to layer with lines
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';

              // Edge-scroll when dragging near container edges
              const container = containerRef.current;
              if (container) {
                const containerRect = container.getBoundingClientRect();
                const edgeThreshold = 60;
                const scrollSpeed = 15;

                const mouseRelX = e.clientX - containerRect.left;
                const mouseRelY = e.clientY - containerRect.top;

                // Horizontal edge scrolling
                if (mouseRelX < edgeThreshold) {
                  container.scrollLeft -= scrollSpeed;
                } else if (mouseRelX > containerRect.width - edgeThreshold) {
                  container.scrollLeft += scrollSpeed;
                }

                // Vertical edge scrolling
                if (mouseRelY < edgeThreshold) {
                  container.scrollTop -= scrollSpeed;
                } else if (mouseRelY > containerRect.height - edgeThreshold) {
                  container.scrollTop += scrollSpeed;
                }
              }
            }}
            onDrop={async (e) => {
              console.log('DEBUG: [PadletLayer] onDrop', {
                target: e.target,
                isTimelineLayout, isWallLayout, isFreeformLayout,
                isDrawingLayout
              });
              e.preventDefault();
              // Scheduler removes stopPropagation from its onDrop so that
              // react-big-calendar's document-level _dropFromOutsideListener can
              // fire. Guard here so the scheduler handles its own drops and we
              // don't double-create a freeform post on top.
              if ((e.target as HTMLElement).closest?.('.scheduler-wrapper, .rbc-calendar')) return;
              const containerRect = e.currentTarget.getBoundingClientRect();
              const scrollLeft = containerRef.current?.scrollLeft || 0;
              const scrollTop = containerRef.current?.scrollTop || 0;
              const dropX = (e.clientX - containerRect.left + scrollLeft) / canvasZoom;
              const dropY = (e.clientY - containerRect.top + scrollTop) / canvasZoom;

              // 1. Check for SVG drop (External Clipart)
              let svgData = e.dataTransfer.getData('application/collabboard-svg');

              // Fallback for some browsers/situations
              if (!svgData) {
                const plainText = e.dataTransfer.getData('text/plain');
                if (plainText && plainText.startsWith('svg:')) {
                  svgData = JSON.stringify({ svgUrl: plainText.replace('svg:', ''), title: 'Clipart' });
                }
              }

              if (svgData) {
                try {
                  if (isDrawingLayout) {
                    const svg = JSON.parse(svgData);
                    await handleDrawingLayoutAddPadletWithContainerCheck({
                      board_id: canvasId,
                      type: 'image',
                      title: svg.title || 'Clipart',
                      content: '',
                      file_url: svg.svgUrl,
                      position_x: dropX,
                      position_y: dropY,
                      width: 200,
                      height: 200,
                      metadata: { imageUrl: svg.svgUrl, source: svg.source, forceContainerPrompt: true },
                    });
                  } else {
                    await handleFreeformCardDrop(svgData, dropX, dropY);
                  }
                  return;
                } catch (err) {
                  console.error('❌ Failed to create card from SVG:', err);
                }
              }


              // 2. Check for library item drop first
              // 2. Check for library item drop first
              const libraryData = e.dataTransfer.getData('application/collabboard-library');
              if (libraryData) {
                try {
                  const itemContent = JSON.parse(libraryData);
                  const fileUrl = itemContent.file_url || itemContent.metadata?.file_url || itemContent.metadata?.imageUrl;
                  const cleanMetadata = sanitizeLibraryMetadata(itemContent.metadata);

                  const draftPayload = {
                    type: itemContent.type || 'text',
                    title: itemContent.title || 'Untitled',
                    content: itemContent.content || '',
                    position_x: dropX,
                    position_y: dropY,
                    width: itemContent.width || 300,
                    height: itemContent.height || 200,
                    file_url: fileUrl || null,
                    metadata: {
                      ...cleanMetadata,
                      imageUrl: itemContent.metadata?.imageUrl || fileUrl,
                      file_url: fileUrl,
                      ...(isDrawingLayout ? { forceContainerPrompt: true } : {}),
                    },
                  };

                  if (isDrawingLayout) {
                    await handleDrawingLayoutAddPadletWithContainerCheck(draftPayload);
                    return;
                  }

                  // Create a new padlet from the library item
                  const newPadlet: Padlet = {
                    id: crypto.randomUUID(),
                    board_id: canvasId!,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    ...draftPayload
                  } as Padlet;

                  // OPTIMISTIC: Add immediately to UI
                  setPadlets(prev => [...prev, newPadlet]);

                  // Background sync to Supabase
                  const { error } = await supabase
                    .from('padlets')
                    .insert(newPadlet);

                  if (error) {
                    // Rollback on failure
                    console.error('Failed to insert padlet, rolling back:', error);
                    setPadlets(prev => prev.filter(p => p.id !== newPadlet.id));
                  }
                  return;
                } catch (err) {
                  console.error('Failed to create padlet from library:', err);
                }
              }

              // Handle canvas repositioning (existing padlet move)
              const padletId = e.dataTransfer.getData('text/padlet-id');
              const offsetData = e.dataTransfer.getData('application/json-offset');

              if (padletId && offsetData) {
                try {
                  const { offsetX, offsetY } = JSON.parse(offsetData);
                  // Ensure positions are not negative
                  const newX = Math.max(0, dropX - offsetX);
                  const newY = Math.max(0, dropY - offsetY);

                  const padlet = padlets.find(p => p.id === padletId);
                  if (padlet) {
                    // Store old position for rollback
                    const oldX = padlet.position_x;
                    const oldY = padlet.position_y;

                    // OPTIMISTIC: Update position immediately
                    setPadlets(prev => prev.map(p =>
                      p.id === padletId
                        ? { ...p, position_x: newX, position_y: newY }
                        : p
                    ));


                    // Background sync to Supabase
                    const { error } = await supabase
                      .from('padlets')
                      .update({
                        position_x: Math.round(newX),
                        position_y: Math.round(newY),
                        updated_at: new Date().toISOString()
                      })
                      .eq('id', padletId);

                    if (error) {
                      // Rollback on failure
                      console.error('Failed to update position, rolling back:', error);
                      setPadlets(prev => prev.map(p =>
                        p.id === padletId
                          ? { ...p, position_x: oldX, position_y: oldY }
                          : p
                      ));
                    }
                  }
                } catch (err) {
                  console.error('Canvas Drop Error', err);
                }
              }
            }}
          >
            {/* Filter out child padlets - they should only show inside their parent container */}
            {/* Using memoized rootPadlets for performance */}

            {/* Columns Layout */}
            {isColumnsLayout && (
              <ColumnsLayout
                isEditable={canUseFreeformEditButton}
                columns={columnsLayoutData}
                widthClass="w-[280px]"
                onAddPost={handleAddPostToSection}
                onRenameSection={handleRenameSection}
                onDeleteSection={handleDeleteSection}
                onAddSectionLeft={(id: number) => handleAddSection(id, 'left')}
                onAddSectionRight={(id: number) => handleAddSection(id, 'right')}
                onMoveLeft={(id: number) => handleMoveSection(id, 'up')}
                onMoveRight={(id: number) => handleMoveSection(id, 'down')}
                onAddGlobalSection={() => handleAddSection()}
                onEditPost={openPadletInTypeEditor}
                onOpenPost={(post: Padlet) => {
                  setPadletToEdit(post);
                  setIsNoteEditorOpen(true);
                }}
                onDeletePost={(post: Padlet) => deletePadletById(post.id)}
                onStartSlideshow={(post: Padlet) => startSlideshow(post)}
                onDownloadAttachment={(post: Padlet) => downloadAttachment(post)}
                onCopyAttachmentLink={(post: Padlet) => copyAttachmentLink(post)}
                onColorChange={(post: Padlet, color: string) => changeCardColor(post, color)}
                onAddBefore={(post: Padlet) => addPostRelative(post, 'before')}
                onAddAfter={(post: Padlet) => addPostRelative(post, 'after')}
                onDuplicate={(post: Padlet) => duplicatePadlet(post.id)}
                onCopyToAnotherPadlet={(post: Padlet) => copyToAnotherPadlet(post)}
                onTransferToAnotherPadlet={(post: Padlet) => transferToAnotherPadlet(post)}
                onSetAsCover={(post: Padlet) => setAsPadletCover(post)}
                onPin={(post: Padlet) => pinPost(post)}
                onReport={(_post: Padlet) => reportPost()}
                onCopyLink={(post: Padlet) => copyPostLink(post)}
                onOpenInNewTab={(post: Padlet) => openPostInNewTab(post)}
                onAddContainerAt={handleTriggerContainerCreation}
                onAddEmptyContainerAt={handleCreateContainerAt}
                onDropContainerToSection={moveContainerToSection}
                allPadlets={padlets}
                dropIndicator={dropIndicator}
                setDropIndicator={setDropIndicator}
                onReorderPost={handleColumnReorder}
                onDropDraftIntoContainer={handleDropDraftIntoContainer}
                currentUserId={user?.id}
                currentUserName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                currentUserAvatar={user?.user_metadata?.avatar_url}
                onUpdateChildComments={async (childId, comments) => {
                  // Update the child padlet's comments in the database
                  const { error } = await supabase
                    .from('padlets')
                    .update({
                      metadata: {
                        ...(padlets.find(p => p.id === childId)?.metadata as any),
                        comments
                      },
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', childId);

                  if (error) {
                    console.error('Failed to update comments:', error);
                    toast.error('Failed to update comments');
                    return;
                  }

                  // Update local state
                  setPadlets(prev => prev.map(p =>
                    p.id === childId
                      ? { ...p, metadata: { ...(p.metadata as any), comments } }
                      : p
                  ));
                }}
              />
            )}

            {/* Grid Layout (RowCanvas) */}
            {isGridLayout && (
              <div className="h-full min-h-0 overflow-auto no-scrollbar">
                <div className="min-h-0 w-full flex flex-col items-start px-10 py-6 pb-24 gap-6">
                  {/* Add Section Button (Top) */}
                  {canUseFreeformEditButton && (
                    <button
                      onClick={() => handleAddSection()}
                      className="min-w-[240px] h-12 rounded-full bg-black/40 hover:bg-black/60 text-white flex items-center justify-center gap-2 transition-all shadow-lg border border-white/10 shrink-0"
                    >
                      <Plus size={20} />
                      <span className="font-medium">Add Section</span>
                    </button>
                  )}

                  {/* Render Sections */}
                  {/* Use Shared Row Canvas DnD Controller */}
                  <RowCanvasDnD
                    isEditable={canUseFreeformEditButton}
                    sections={sortedSections}
                    padlets={padlets}
                    allPadlets={padlets}
                    widthClass="w-[280px]"
                    onRename={(id, title) => handleRenameSection(id, title)}
                    onDeleteSection={(id) => handleDeleteSection(id)}
                    onAddSectionLeft={(id) => handleAddSection(id, 'left')}
                    onAddSectionRight={(id) => handleAddSection(id, 'right')}
                    onMoveSectionLeft={(id) => handleMoveSection(id, 'up')}
                    onMoveSectionRight={(id) => handleMoveSection(id, 'down')}
                    onAddContainerAt={handleTriggerContainerCreation}
                    onAddEmptyContainerAt={handleCreateContainerAt}
                    onReorderPost={handleColumnReorder}
                    onDropDraftIntoContainer={handleDropDraftIntoContainer}
                    onEditPost={openPadletInTypeEditor}
                    onDeletePost={(post) => deletePadletById(post.id)}
                    onOpenPost={(post) => {
                      setPadletToEdit(post);
                      setIsNoteEditorOpen(true);
                    }}
                    onOpenTarget={openPadletInTypeEditor}
                    onOpenInNewTab={openPostInNewTab}
                    onCopyLink={copyPostLink}
                    onStartSlideshow={startSlideshow}
                    onDownloadAttachment={downloadAttachment}
                    onCopyAttachmentLink={copyAttachmentLink}
                    onColorChange={changeCardColor}
                    onAddBefore={(post) => addPostRelative(post, 'before')}
                    onAddAfter={(post) => addPostRelative(post, 'after')}
                    onDuplicate={(post) => duplicatePadlet(post.id)}
                    onCopyToAnotherPadlet={copyToAnotherPadlet}
                    onTransferToAnotherPadlet={transferToAnotherPadlet}
                    onSetAsCover={setAsPadletCover}
                    onPin={pinPost}
                    onReport={reportPost}
                    currentUserId={user?.id}
                    currentUserName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                    currentUserAvatar={user?.user_metadata?.avatar_url}
                    onUpdateChildComments={async (childId, comments) => {
                      // Update the child padlet's comments in the database
                      const { error } = await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...(padlets.find(p => p.id === childId)?.metadata as any),
                            comments
                          },
                          updated_at: new Date().toISOString()
                        })
                        .eq('id', childId);

                      if (error) {
                        console.error('Failed to update comments:', error);
                        toast.error('Failed to update comments');
                        return;
                      }

                      // Update local state
                      setPadlets(prev => prev.map(p =>
                        p.id === childId
                          ? { ...p, metadata: { ...(p.metadata as any), comments } }
                          : p
                      ));
                    }}
                  />
                </div>
              </div>
            )}

            {/* Wall Layout - CSS Grid with auto-fit for responsive columns */}
            {isWallLayout && (
              <WallCanvas
                padlets={wallOrderedPadlets}
                allPadlets={padlets} // Pass complete dataset for child lookups
                canvasId={canvas?.id ?? ''}
                canvasSettings={wallCanvasSettings}
                isEditable={canUseFreeformEditButton}
                onPadletUpdate={(updatedPadlet) => {
                  setPadlets(prev => prev.map(p => p.id === updatedPadlet.id ? updatedPadlet : p));
                }}
                onPadletDelete={async (padletId) => {
                  // Find padlet type for toast message
                  const padlet = padlets.find(p => p.id === padletId);
                  const isContainer = padlet?.type === 'container' || (padlet?.metadata as any)?.kind === 'container' || (padlet?.metadata as any)?.isContainer;

                  // Direct delete logic for Wall
                  try {
                    // Optimistic UI update - remove item AND its children
                    setPadlets(prev => prev.filter(p => p.id !== padletId && p.metadata?.parentId !== padletId));

                    // DB delete item
                    const { error } = await supabase
                      .from('padlets')
                      .delete()
                      .eq('id', padletId);

                    if (error) throw error;

                    // Delete children from DB
                    const { error: childError } = await supabase
                      .from('padlets')
                      .delete()
                      .eq('metadata->>parentId', padletId);

                    if (childError) console.error('Failed to delete children:', childError);

                    toast.success(isContainer ? 'Container deleted' : 'Post deleted');
                  } catch (err) {
                    console.error('Delete failed:', err);
                    toast.error('Failed to delete');
                    await fetchData(); // rollback
                  }
                }}
                onPadletEdit={(padlet) => {
                  closeAllToolbars();
                  setPadletToEdit(padlet);
                  setIsContainerEditorOpen(true);
                }}
                onOpenTarget={(post: Padlet) => {
                  openPadletTargetFromContextMenu(post);
                }}
                onPadletCreate={handleCreateEmptyWallContainer}
                onReorder={handleWallReorder}
                currentUserId={user?.id}
                currentUserName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                currentUserAvatar={user?.user_metadata?.avatar_url}
                onUpdateChildComments={async (childId, comments) => {
                  // Update the child padlet's comments in the database
                  const { error } = await supabase
                    .from('padlets')
                    .update({
                      metadata: {
                        ...(padlets.find(p => p.id === childId)?.metadata as any),
                        comments
                      },
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', childId);

                  if (error) {
                    console.error('Failed to update comments:', error);
                    toast.error('Failed to update comments');
                    return;
                  }

                  // Update local state
                  setPadlets(prev => prev.map(p =>
                    p.id === childId
                      ? { ...p, metadata: { ...(p.metadata as any), comments } }
                      : p
                  ));
                }}
              />
            )}



            {/* Drawing Layout */}
            {isDrawingLayout && (
              <DrawingLayout
                canvasId={canvasId || ''}
                padlets={padlets}
                padletsLoaded={!loading}
                onAddPadlet={handleDrawingLayoutAddPadletWithContainerCheck}
                onUpdatePadlet={handleDrawingLayoutUpdatePadlet}
                onDeletePadlet={handleDrawingLayoutDeletePadlet}
                ghostDraft={drawingGhostDraft}
                onGhostDraftDropped={() => setDrawingGhostDraft(null)}
                drawingAppStateRef={drawingAppStateRef}
                drawingExcalidrawAPIRef={drawingExcalidrawAPIRef}
                currentUserId={user?.id}
                currentUserName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                currentUserAvatar={user?.user_metadata?.avatar_url}
                viewportContainerRef={containerRef}
                onPadletEdit={(padlet) => {
                  closeDrawingEditorsBeforePadletEdit();
                  if (isImageEditPadlet(padlet)) {
                    openImagePostEditor(padlet);
                    return;
                  }
                  openPadletInTypeEditor(padlet);
                }}
                onEditPadletAsPost={(padlet) => {
                  closeAllToolbars();
                  setPadletToEdit(padlet);
                  setIsNoteEditorOpen(true);
                }}
                readOnly={currentWorkspaceRole === 'readonly'}
                fetchData={fetchData}
              />
            )}

            {/* Timeline Layout */}
            {isTimelineLayout && chronoMode && (
              <div className="absolute inset-0" style={canvasBackgroundStyle}>
                <TimelineHeaderBar
                  currentMode={chronoMode}
                  onModeChange={handleChronoModeChange}
                />
                <ChronoTimelineCanvas
                  padlets={padlets}
                  canvasId={canvasId || ''}
                  chronoMode={chronoMode}
                  backgroundStyle={canvasBackgroundStyle}
                  isEditable={canUseFreeformEditButton}
                  onOpenContainer={(container) => {
                    if (!canUseFreeformEditButton) return;
                    closeAllToolbars();
                    setPadletToEdit(container);
                    setIsContainerEditorOpen(true);
                  }}
                  onDeleteContainer={canUseFreeformEditButton ? ((containerId) => requestDeletePadlet(containerId)) : undefined}
                  onCreateEmptyContainer={canUseFreeformEditButton ? handleCreateEmptyTimelineContainer : undefined}
                  onOpenTarget={canUseFreeformEditButton ? openPadletTargetFromContextMenu : undefined}
                  allPadlets={padlets}
                  onDropExistingPadlet={canUseFreeformEditButton ? (async (containerId, droppedId) => {
                    const containerPadlet = padlets.find(p => p.id === containerId);
                    if (!containerPadlet) return;
                    const childIds = containerPadlet.metadata?.childPadletIds || [];
                    if (childIds.includes(droppedId)) return;
                    const newChildIds = [...childIds, droppedId];

                    // Optimistic update
                    setPadlets(prev => prev.map(p =>
                      p.id === containerId
                        ? { ...p, metadata: { ...p.metadata, childPadletIds: newChildIds } }
                        : p.id === droppedId
                          ? { ...p, metadata: { ...p.metadata, parentId: containerId } }
                          : p
                    ));

                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...containerPadlet.metadata, childPadletIds: newChildIds },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', containerId);
                      const droppedPadlet = padlets.find(p => p.id === droppedId);
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...droppedPadlet?.metadata, parentId: containerId },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', droppedId);
                    } catch (err) {
                      console.error('Failed to add padlet to container:', err);
                      fetchData(); // Rollback on error
                    }
                  }) : undefined}
                  currentUserId={user?.id}
                  currentUserName={user?.user_metadata?.full_name || user?.email || 'Anonymous'}
                  currentUserAvatar={user?.user_metadata?.avatar_url}
                  onUpdateChildComments={canUseFreeformEditButton ? (async (childId, comments) => {
                    const childPadlet = padlets.find(p => p.id === childId);
                    if (!childPadlet) return;

                    // Optimistic update
                    setPadlets(prev => prev.map(p =>
                      p.id === childId
                        ? { ...p, metadata: { ...p.metadata, comments } }
                        : p
                    ));

                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...childPadlet.metadata, comments },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', childId);
                    } catch (err) {
                      console.error('Failed to update child comments:', err);
                      fetchData(); // Rollback on error
                    }
                  }) : undefined}
                  onUpdateContainerMetadata={canUseFreeformEditButton ? ((containerId, metadataUpdates) => {
                    updatePadletMetadata(containerId, metadataUpdates);
                  }) : undefined}
                  onDuplicateContainer={canUseFreeformEditButton ? ((containerId) => duplicateTimelineContainer(containerId)) : undefined}
                  onRenameContainer={canUseFreeformEditButton ? ((containerId, title) => updatePadletTitle(containerId, title)) : undefined}
                  onAddContainerBefore={canUseFreeformEditButton ? ((containerId) => addTimelineContainerBefore(containerId)) : undefined}
                  onAddContainerAfter={canUseFreeformEditButton ? ((containerId) => addTimelineContainerAfter(containerId)) : undefined}
                  onInsertContainerAt={canUseFreeformEditButton ? ((position) => insertTimelineContainerAt(position)) : undefined}
                  onDropLibraryCreateContainer={canUseFreeformEditButton ? handleDropLibraryCreateContainer : undefined}
                  onDropDraftIntoContainer={canUseFreeformEditButton ? handleDropDraftIntoContainer : undefined}
                />
              </div>
            )}

            {/* Chrono Mode Selection Modal (first-visit) */}
            {isTimelineLayout && showChronoModeModal && (
              <ChronoModeSelectionModal
                isOpen={showChronoModeModal}
                onSelect={handleChronoModeChange}
                onClose={() => void handleChronoModeChange('horizontal')}
              />
            )}

            {isSchedulerLayout && (
              <div className="absolute inset-0 flex flex-col items-stretch justify-stretch pointer-events-auto z-10 bg-white">
                <StandaloneSchedulerCanvas
                  padlets={padlets}
                  canvasId={canvas.id}
                  readOnly={!canUseFreeformEditButton}
                  selectedContainerId={selectedSchedulerContainerId}
                  onUpdatePadletMetadata={updatePadletMetadata}
                  onCreatePadlet={handleCreateSchedulerPadlet}
                  onTargetItem={handleTargetSchedulerPadlet}
                  onEditItem={handleOpenSchedulerPadlet}
                  selectedTimeSlot={selectedSchedulerSlot}
                  onSelectTimeSlot={(slot) => {
                    setSelectedSchedulerSlot(slot);
                    setSelectedSchedulerContainerId(null);
                    setSchedulerPopoverPadletId(null);
                  }}
                  onDeletePadlet={deletePadletById}
                  onExternalDropItem={handleSchedulerExternalDrop}
                />
              </div>
            )}

            {isMapLayout && (
              <div className="absolute inset-0 pointer-events-auto z-10 bg-white">
                <MapCanvas
                  posts={padlets}
                  lines={passiveMapLines}
                  mapStyle={currentMapStyleId}
                  canEditPosts={canUseFreeformEditButton}
                  onPinContainerOpen={handleMapPinContainerOpen}
                  onPinContainerClose={handleMapPinContainerClose}
                  onEditPinContainer={canUseFreeformEditButton ? ((post) => {
                    if (post.type !== 'container') return;
                    setPadletToEdit(post);
                    setIsContainerEditorOpen(true);
                  }) : undefined}
                  onEditPinPost={canUseFreeformEditButton ? ((post) => {
                    openPadletTargetFromContextMenu(post);
                  }) : undefined}
                  onDeletePinContainer={canUseFreeformEditButton ? ((post) => {
                    deleteMapPinContainer(post.id);
                  }) : undefined}
                  onChangePinContainerColor={canUseFreeformEditButton ? ((post, color) => {
                    updatePadletMetadata(post.id, { cardColor: color });
                  }) : undefined}
                  onAddPostToPinContainer={canUseFreeformEditButton ? ((post, toolType) => {
                    handleMapPinContainerOpen(post);
                    handleToolClick(toolType);
                  }) : undefined}
                  sections={sections}
                  canManageSections={canEditWorkspace(currentWorkspaceRole)}
                  canReorderPosts={canEditWorkspace(currentWorkspaceRole)}
                  onAddSection={handleAddSection}
                  onRenameSection={(sectionId, title) => {
                    const numeric = Number(sectionId);
                    if (!Number.isFinite(numeric)) return;
                    handleRenameSection(numeric, title);
                  }}
                  onDeleteSection={(sectionId) => {
                    const numeric = Number(sectionId);
                    if (!Number.isFinite(numeric)) return;
                    handleDeleteSection(numeric);
                  }}
                  onReorderSections={handleReorderMapSections}
                  onMovePostToSection={handleMoveMapPost}
                  isSidebarOpen={isMapSidebarOpen}
                  onSidebarClose={handleMapSidebarClose}
                  currentUserId={user?.id}
                  currentUserName={user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                  currentUserAvatar={user?.user_metadata?.avatar_url}
                  onRefreshChildren={handleMapRefreshChildren}
                  onMapReady={handleMapReady}
                  onSelectLine={handleLineSelect}
                  onLineContextMenu={handleLineContextMenu}
                  onToggleEditMode={handleToggleLineEditMode}
                  onUpdateChildComments={async (childId, comments) => {
                    const nowIso = new Date().toISOString();

                    setPadlets((prev) =>
                      prev.map((p) =>
                        p.id === childId
                          ? {
                            ...p,
                            metadata: { ...(p.metadata as any), comments },
                            content: JSON.stringify(comments),
                            updated_at: nowIso,
                          }
                          : p
                      )
                    );

                    try {
                      const { data: existingChild, error: readError } = await supabase
                        .from('padlets')
                        .select('metadata')
                        .eq('id', childId)
                        .maybeSingle();
                      if (readError) throw readError;

                      const nextMetadataForDb = {
                        ...((existingChild?.metadata as Record<string, unknown> | null) || {}),
                        comments,
                      };

                      await supabase
                        .from('padlets')
                        .update({
                          metadata: nextMetadataForDb,
                          content: JSON.stringify(comments),
                          updated_at: nowIso,
                        })
                        .eq('id', childId);
                    } catch (err) {
                      console.error('Failed to update child comments:', err);
                      toast.error('Failed to update comments');
                      fetchData();
                    }
                  }}
                  onCreatePostAtLocation={async ({ lng, lat, label }) => {
                    if (!canvasId) return null;
                    const nowIso = new Date().toISOString();
                    const id = crypto.randomUUID();
                    const locationText = (label && label.trim()) || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                    const newPost = {
                      id,
                      board_id: canvasId,
                      title: locationText,
                      content: '',
                      type: 'container',
                      position_x: 0,
                      position_y: 0,
                      width: 320,
                      height: 220,
                      created_at: nowIso,
                      updated_at: nowIso,
                      metadata: {
                        mapLocation: { lng, lat, label },
                        childPadletIds: [],
                        cardColor: '#ffffff',
                      } as any,
                      location_lng: lng as any,
                      location_lat: lat as any,
                      location_label: locationText as any,
                    } as Padlet;

                    setPadlets((prev) => [...prev, newPost]);
                    setMapActiveContainerId(newPost.id);
                    setSelectedPadletId(newPost.id);

                    const { error: containerError } = await insertPadlet({
                      ...newPost,
                      location_lng: lng,
                      location_lat: lat,
                      location_label: locationText,
                    } as any);

                    if (containerError) {
                      setPadlets((prev) => prev.filter((p) => p.id !== id));
                      if (mapActiveContainerId === id) setMapActiveContainerId(null);
                      if (selectedPadletId === id) setSelectedPadletId(null);
                      toast.error('Failed to create map post');
                      return null;
                    }
                    return newPost;
                  }}
                  onUpdatePostLocation={async (postId, { lng, lat, label }) => {
                    const existing = padlets.find((p) => p.id === postId);
                    if (!existing) return;
                    const nextTitle = label || existing.title;
                    const nextMetadata = {
                      ...(existing.metadata as any),
                      mapLocation: { lng, lat, label },
                    };

                    setPadlets((prev) =>
                      prev.map((p) =>
                        p.id === postId
                          ? {
                            ...p,
                            title: nextTitle,
                            metadata: nextMetadata,
                            location_lng: lng as any,
                            location_lat: lat as any,
                            location_label: (label ?? null) as any,
                            updated_at: new Date().toISOString(),
                          }
                          : p
                      )
                    );

                    const { error } = await updatePadletById(postId, {
                      title: nextTitle,
                      metadata: nextMetadata,
                      location_lng: lng,
                      location_lat: lat,
                      location_label: label ?? null,
                      updated_at: new Date().toISOString(),
                    } as any);

                    if (error) {
                      toast.error('Failed to update map location');
                      fetchData();
                    }
                  }}
                />
              </div>
            )}

            {/* Freeform Layout - Cards rendered via FreeformPadletCards component */}
            {isFreeformLayout && (
              <CanvasConfigProvider value={configState}>
                <CanvasEditorProvider value={editorState}>
                  <FreeformPadletCards
                    rootPadlets={rootPadlets}
                    padlets={padlets}
                    setPadlets={setPadlets}
                    user={user}
                    containerRef={containerRef}
                    isDragging={isDragging}
                    draggingPadletId={draggingPadletId}
                    isGraphConnectMode={isGraphConnectMode}
                    isLineMode={isLineMode}
                    isDrawingMode={isDrawingMode}
                    selectedPadletId={selectedPadletId}
                    selectedPadletIds={selectedPadletIds}
                    setSelectedPadletId={setSelectedPadletId}
                    setGraphConnectSelection={setGraphConnectSelection}
                    graphRefreshToken={graphRefreshToken}
                    closeAllToolbars={closeAllToolbars}
                    handlePadletMouseDown={handlePadletMouseDown}
                    getClickedSide={(e: React.MouseEvent) => getClickedSide(e as React.MouseEvent<HTMLElement>)}
                    stableActions={stableActions}
                  />
                </CanvasEditorProvider>
              </CanvasConfigProvider>
            )}

          </PadletLayer>

          {/* Layer 3: Foreground Lines (On Top of most Padlets) - z-index 500 */}
          <div
            className="absolute inset-0"
            style={{ zIndex: isFreeformGraphMode ? 2000 : 500, pointerEvents: 'none' }}
          >
            <SimpleLineRenderer
              lines={mapOverlayLines}
              selectedLineId={selectedLineId}
              onSelectLine={handleLineSelect}
              onUpdateLine={updateLineLocal}
              onSaveLine={saveLineToDbMapAware}
              isLineMode={isLineMode}
              onCreateLine={createLineForMap}
              isEditMode={lineEditModeId !== null}
              onToggleEditMode={handleToggleLineEditMode}
              layer="front"
              draggingLineId={draggingLineId}
              onDragChange={handleLineDragChange}
              onContextMenu={handleLineContextMenu}
              canvasZoom={canvasZoom}
              forcePointerEvents={shouldEnableMapLinePointerEvents}
              excalidrawAPIRef={isDrawingLayout ? drawingExcalidrawAPIRef : undefined}
            />
          </div>



          {/* Reminder/Due Tasks Popup */}
          {
            reminderPopupOpen && reminderPopupTasks.length > 0 && (
              <div
                className="fixed z-[100]"
                style={{
                  left: reminderPopupPosition.x,
                  top: reminderPopupPosition.y,
                }}
              >
                <div
                  className="bg-white rounded-lg shadow-lg border border-gray-200 p-3 min-w-[280px] max-w-[320px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                    <span className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                      <Bell className="w-4 h-4 text-red-500" />
                      Due Tasks ({reminderPopupTasks.length})
                    </span>
                    <button
                      onClick={() => setReminderPopupOpen(false)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Tasks list */}
                  <div className="space-y-3 max-h-[300px] overflow-y-auto scrollbar-ultrathin">
                    {reminderPopupTasks.map((task) => {
                      const dueDate = new Date(task.dueDate);
                      const formattedDate = dueDate.toLocaleDateString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric'
                      });

                      return (
                        <div key={task.id} className="flex items-start gap-2 p-2 rounded bg-gray-50">
                          <div className="flex-1">
                            <p className={`text-sm font-medium ${task.isOverdue ? 'text-red-600' : 'text-orange-600'}`}>
                              {task.text}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {task.isOverdue ? '⚠️ Overdue: ' : '📅 Due: '}
                              {formattedDate}
                              {task.dueTime && ` at ${task.dueTime}`}
                            </p>
                          </div>
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${task.isOverdue ? 'bg-red-500' : 'bg-orange-500'}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )
          }



          {/* Detached Comments Popup - shown when clicking comment pin */}
          {detachedPopupOpen && (
            <div
              className="fixed z-50 bg-white rounded-xl shadow-xl border border-gray-200"
              style={{
                left: detachedPopupPosition.x,
                top: detachedPopupPosition.y,
                width: '320px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative p-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDetachedBadgeColorOpen((prev) => !prev)}
                      className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                      title="Badge Color"
                    >
                      <div
                        className="w-4 h-4 rounded border border-gray-300"
                        style={{
                          backgroundColor: padlets.find((p) => p.id === detachedPopupPadletId)?.metadata?.badgeColor || '#facc15',
                        }}
                      />
                    </button>
                    <button
                      onClick={() => {
                        setDetachedPopupOpen(false);
                        setDetachedPopupPadletId(null);
                        setDetachedBadgeColorOpen(false);
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Badge Color Panel */}
                {detachedBadgeColorOpen && (
                  <div className="absolute right-full top-0 mr-3 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                    <div className="grid grid-cols-6 gap-1.5">
                      {BADGE_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={async () => {
                            if (!detachedPopupPadletId) return;
                            await updatePadletMetadata(detachedPopupPadletId, { badgeColor: color });
                            setDetachedBadgeColorOpen(false);
                          }}
                          className={`rounded transition-transform hover:scale-110 ${((padlets.find((p) => p.id === detachedPopupPadletId)?.metadata?.badgeColor) || '#facc15') === color ? 'ring-2 ring-blue-500' : ''}`}
                          style={{
                            width: '20px',
                            height: '20px',
                            backgroundColor: color,
                            border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a'].includes(color) ? '1px solid #d1d5db' : 'none',
                          }}
                          title={color}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Comments list */}
                {detachedPopupComments.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                ) : (
                  <div className="space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin">
                    {detachedPopupComments.map((comment) => (
                      <div
                        key={comment.id}
                        className="flex gap-2 rounded py-0.5 px-0.5"
                      >
                        <div className="flex flex-col items-center gap-0.5 shrink-0 w-[22px]">
                          <div className="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                            {comment.userName?.charAt(0).toUpperCase() || 'U'}
                          </div>
                          <span className="text-[9px] text-gray-400 leading-none text-center">
                            {(() => {
                              const diff = Date.now() - comment.timestamp;
                              const minutes = Math.floor(diff / 60000);
                              const hours = Math.floor(minutes / 60);
                              const days = Math.floor(hours / 24);
                              const years = Math.floor(days / 365);
                              if (minutes < 60) return `${Math.max(1, minutes)}m`;
                              if (hours < 24) return `${hours}h`;
                              if (days < 365) return `${days}d`;
                              return `${years}y`;
                            })()}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-gray-700 truncate">{comment.userName || 'User'}</span>
                          </div>
                          <div
                            className="text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words"
                            dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {
            !isMapLayout && selectedLineId && lines.find(l => l.id === selectedLineId) && (
              <LineToolbar
                line={lines.find(l => l.id === selectedLineId)!}
                onUpdate={(updates) => updateLine(selectedLineId, updates)}
                onDelete={() => deleteLine(selectedLineId)}
                onClose={() => setSelectedLineId(null)}
                isEditMode={lineEditModeId === selectedLineId}
                onToggleEditMode={() => setLineEditModeId(lineEditModeId === selectedLineId ? null : selectedLineId)}
                onChangeLayer={(action) => handleChangeLineLayer(selectedLineId!, action)}
              />
            )
          }

          {/* Top-level Drawing Layer Modal */}
          <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
            {
              isDrawingMode && drawingPadlet && (
                <ImageDrawingLayer
                  imageUrl={drawingPadlet.metadata?.imageUrl || ''}
                  initialDrawing={drawingPadlet.metadata?.drawing}
                  initialPaths={drawingPadlet.metadata?.drawingPaths}
                  initialTextElements={drawingPadlet.metadata?.drawingText}
                  onCancel={() => {
                    setIsDrawingMode(false);
                    setDrawingPadlet(null);
                  }}
                  onSave={async (dataUrl, paths, textElements) => {
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...drawingPadlet.metadata,
                            drawing: dataUrl,
                            drawingPaths: paths,
                            drawingText: textElements
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', drawingPadlet.id);
                      setIsDrawingMode(false);
                      setDrawingPadlet(null);
                      fetchData();
                    } catch (err) {
                      console.error('Failed to save drawing:', err);
                    }
                  }}
                  onChangeColor={() => {
                    // Could open color popup here
                  }}
                  onCaption={() => {
                    setIsDrawingMode(false);
                    setEditingCaption(drawingPadlet.metadata?.caption || '');
                    setSelectedPadletId(drawingPadlet.id);
                    setCaptionPopupPadletId(drawingPadlet.id);
                    setDrawingPadlet(null);
                  }}
                  onEditImage={() => {
                    setIsDrawingMode(false);
                    setCropPadlet(drawingPadlet);
                    setIsCropMode(true);
                    setDrawingPadlet(null);
                  }}
                  onDelete={() => {
                    setIsDrawingMode(false);
                    requestDeletePadlet(drawingPadlet.id);
                    setDrawingPadlet(null);
                  }}
                  onAddReaction={() => {
                    setIsDrawingMode(false);
                    setSelectedPadletId(drawingPadlet.id);
                    setIsImageEmojiOpen(true);
                    setDrawingPadlet(null);
                  }}
                />
              )
            }

            {/* Image Crop Layer - Edit Mode */}
            {
              isCropMode && cropPadlet && (
                <ImageCropLayer
                  imageUrl={cropPadlet.metadata?.imageUrl || ''}
                  onCancel={() => {
                    setIsCropMode(false);
                    setCropPadlet(null);
                  }}
                  onSave={async (croppedDataUrl) => {
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...cropPadlet.metadata,
                            imageUrl: croppedDataUrl,
                            drawing: null,
                            drawingPaths: null,
                            drawingText: null
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', cropPadlet.id);
                      setIsCropMode(false);
                      setCropPadlet(null);
                      fetchData();
                    } catch (err) {
                      console.error('Failed to save cropped image:', err);
                    }
                  }}
                />
              )
            }

            {/* Card View Lightbox (Read Only) */}
            <CardEditor
              isOpen={isCardViewerOpen}
              onClose={() => {
                setIsCardViewerOpen(false);
                setPadletToEdit(null);
              }}
              title={padletToEdit?.title || ''}
              initialContent={padletToEdit?.content || ''}
              initialMetadata={padletToEdit?.metadata || {}}
              onSave={() => setIsCardViewerOpen(false)}
              readOnly={true}
            />

            {/* Card Editor Modal (Edit Mode) */}
            <CardEditor
              isOpen={isCardEditorOpen}
              onClose={() => {
                setIsCardEditorOpen(false);
                setPadletToEdit(null);
              }}
              title={padletToEdit?.title || ''}
              initialContent={padletToEdit?.content || ''}
              initialMetadata={padletToEdit?.metadata || {}}
              onSave={saveCard}
              readOnly={false}
            />

            <ClipartCardDraftModal
              isOpen={isClipartDraftModalOpen}
              padlet={padletToEdit}
              onClose={() => {
                if (!padletToEdit) {
                  setIsClipartDraftModalOpen(false);
                  return;
                }
                setIsClipartDraftReplaceMode(false);
                void saveCard({
                  title: padletToEdit.title || '',
                  content: padletToEdit.content || '',
                  metadata: padletToEdit.metadata || {},
                });
                setIsClipartDraftModalOpen(false);
              }}
              onDiscard={() => {
                if (padletToEdit?.id && padletToEdit.id !== 'new') {
                  setIsClipartDraftModalOpen(false);
                  setIsClipartDraftReplaceMode(false);
                  setSelectedPadletId(padletToEdit.id);
                  setShowDeleteConfirm(true);
                  return;
                }
                setIsClipartDraftModalOpen(false);
                setIsClipartDraftReplaceMode(false);
                setPadletToEdit(null);
              }}
              onChange={(nextPadlet) => setPadletToEdit(nextPadlet)}
              onReplaceIcon={() => {
                if (padletToEdit?.id === 'new') {
                  setIsClipartDraftReplaceMode(true);
                } else if (padletToEdit) {
                  setIconReplaceTargetPadlet(padletToEdit);
                  setIsClipartDraftReplaceMode(false);
                }
                setIsLibraryOpen(true);
              }}
            />

            {/* Column Layout Placement Prompt */}
            <ColumnContainerCreationPrompt
              isOpen={isPlacementPromptOpen}
              onClose={() => {
                setIsPlacementPromptOpen(false);
                setPendingPostDraft(null);
                setPlacementPromptMode(null);
              }}
              onNewContainer={placementPromptMode === 'timeline-horizontal-all'
                ? handleCreateHorizontalAllTimelineContainerWithDraft
                : handleCreateNewContainerWithDraft}
              onAddToExisting={placementPromptMode === 'timeline-horizontal-all'
                ? handleStartDragToExistingFromHorizontalAll
                : handleStartDragToExisting}
            />

            {/* Container Creation Placement Prompt (Triggered by + Container button) */}
            <ColumnContainerCreationPrompt
              isOpen={containerCreationPromptOpen}
              onClose={() => {
                setContainerCreationPromptOpen(false);
                setContainerCreationLocation(null);
              }}
              onNewContainer={handleCreateContainerFromPrompt}
              onAddToExisting={handleDragToExistingFromPrompt}
            />

            {/* Wall Layout Placement Prompt */}
            <WallPlacementPrompt
              isOpen={wallPlacementPromptOpen}
              onClose={() => {
                setWallPlacementPromptOpen(false);
                setWallPendingPostDraft(null);
              }}
              onNewContainer={handleCreateWallContainerWithDraft}
              onAddToExisting={handleWallStartPickExisting}
            />



            {/* Library Panel */}
            <LibraryPanel
              isOpen={isLibraryOpen}
              onClose={() => {
                setIsLibraryOpen(false);
                setIconReplaceTargetPadlet(null);
                if (!isClipartDraftReplaceMode) {
                  setPadletToEdit(null);
                }
                setIsClipartDraftReplaceMode(false);
              }}
              onClipartClick={(svgUrl, title) => {
                // Build metadata for the new card
                const meta: Record<string, unknown> = {
                  svgUrl,
                  iconColor: '#000000',
                  iconBgColor: '#ec4899',
                  counterType: 'words',
                };
                // Map canvas: auto-assign to active pin container
                if (isMapLayout && mapActiveContainerId) {
                  meta.parentId = mapActiveContainerId;
                }
                // Close library, open the clipart draft modal
                setIsLibraryOpen(false);
                setPadletToEdit({
                  id: 'new',
                  board_id: canvasId,
                  title: title || '',
                  content: '',
                  type: 'card',
                  position_x: 0,
                  position_y: 0,
                  width: 180,
                  height: 220,
                  metadata: meta,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                } as Padlet);
                setIsClipartDraftReplaceMode(false);
                setIsClipartDraftModalOpen(true);
              }}
              onSelectClipart={async (svgUrl, title) => {
                if (isClipartDraftReplaceMode && padletToEdit?.id === 'new') {
                  setPadletToEdit({
                    ...padletToEdit,
                    title: padletToEdit.title || title || '',
                    metadata: {
                      ...(padletToEdit.metadata || {}),
                      svgUrl,
                    },
                  });
                  setIsLibraryOpen(false);
                  setIsClipartDraftReplaceMode(false);
                  return;
                }

                if (iconReplaceTargetPadlet) {
                  // Update metadata with new SVG
                  await updatePadletMetadata(iconReplaceTargetPadlet.id, { svgUrl });

                  // ALSO clear the title so it doesn't show the old icon name
                  // We use direct supabase update here for the title field
                  await supabase
                    .from('padlets')
                    .update({ title: '' })
                    .eq('id', iconReplaceTargetPadlet.id);

                  // Optimistic local update
                  setPadlets(prev => prev.map(p =>
                    p.id === iconReplaceTargetPadlet.id
                      ? { ...p, title: '', metadata: { ...p.metadata, svgUrl } }
                      : p
                  ));
                }
                setIsLibraryOpen(false);
                setIconReplaceTargetPadlet(null);
                setPadletToEdit(null);
                setIsClipartDraftReplaceMode(false);
              }}
              isIconReplaceMode={!!iconReplaceTargetPadlet || isClipartDraftReplaceMode}
              onSelect={(item) => {
                if (padletToEdit && padletToEdit.type === 'card') {
                  // If it's an external clipart/iconify selection, we get the SVG URL
                  const svgUrl = item.content.metadata?.svgUrl || item.content.file_url;
                  if (svgUrl) {
                    if (isClipartDraftReplaceMode && padletToEdit.id === 'new') {
                      setPadletToEdit({
                        ...padletToEdit,
                        metadata: {
                          ...(padletToEdit.metadata || {}),
                          svgUrl,
                        },
                      });
                    } else {
                      updatePadletMetadata(padletToEdit.id, { svgUrl });
                    }
                  }
                  setIsLibraryOpen(false);
                  if (!isClipartDraftReplaceMode) {
                    setPadletToEdit(null);
                  }
                  setIconReplaceTargetPadlet(null);
                  setIsClipartDraftReplaceMode(false);
                }
              }}
            />

            {/* Imports Dialog */}
            <ImportsDialog
              isOpen={isImportBrowserOpen}
              onClose={() => setIsImportBrowserOpen(false)}
              onImportResolved={(resolved) => {
                setIsImportBrowserOpen(false);
                setPadletToEdit({
                  id: 'new',
                  board_id: canvasId,
                  title: resolved.name,
                  content: '',
                  type: 'image',
                  position_x: 0,
                  position_y: 0,
                  width: 300,
                  height: 250,
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                  metadata: {
                    imageUrl: resolved.previewImageUrl,
                    source: 'import',
                    importProvider: resolved.provider,
                    importItemId: resolved.itemId,
                    importFileName: resolved.name,
                    importMimeType: resolved.mimeType,
                    importOpenUrl: resolved.openUrl,
                    importKind: resolved.kind,
                    importSizeBytes: resolved.sizeBytes,
                  } as any,
                });
                setIsImageEditorOpen(true);
              }}
            />

            {/* Map Style Panel */}
            <MapStylePanel
              isOpen={isMapStylePanelOpen}
              selectedStyleId={currentMapStyleId}
              accessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
              onClose={() => setIsMapStylePanelOpen(false)}
              onSelectStyle={handleMapStyleChange}
            />

            {/* Scheduler Container Popover */}
            {isSchedulerLayout && schedulerPopoverPadletId && (
              <div
                data-container-id={schedulerPopoverPadletId}
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 backdrop-blur-sm"
                onMouseDown={clearSchedulerSelection}
              >
                <div
                  className="relative w-full max-w-sm max-h-[80vh] flex flex-col scale-100 transition-all duration-200"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="absolute -top-4 -right-4 w-8 h-8 rounded-full bg-white text-gray-800 shadow-xl flex items-center justify-center hover:bg-gray-100 z-10 transition-transform hover:scale-110"
                    onClick={clearSchedulerSelection}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                  </button>
                  <div className="flex-1 w-full bg-transparent flex flex-col justify-center">
                    {(() => {
                      const padlet = padlets.find(p => p.id === schedulerPopoverPadletId);
                      if (!padlet) return null;
                      return (
                        <div className="w-full flex justify-center drop-shadow-2xl">
                          <div
                            data-container-id={padlet.id}
                            className="w-full bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden"
                          >
                            <RowColumnContainerCard
                              padlet={padlet}
                              allPadlets={padlets}
                              onDropDraftIntoContainer={handleDropDraftIntoContainer}
                              currentUserId={user?.id}
                              currentUserName={user?.user_metadata?.full_name || user?.email || 'Anonymous'}
                              currentUserAvatar={user?.user_metadata?.avatar_url}
                              onUpdateChildComments={async (childId, comments) => {
                                const childPadlet = padlets.find(p => p.id === childId);
                                if (!childPadlet) return;
                                setPadlets(prev => prev.map(p =>
                                  p.id === childId
                                    ? { ...p, metadata: { ...p.metadata, comments } }
                                    : p
                                ));
                                try {
                                  await supabase
                                    .from('padlets')
                                    .update({
                                      metadata: { ...childPadlet.metadata, comments },
                                      updated_at: new Date().toISOString(),
                                    })
                                    .eq('id', childId);
                                } catch (err) {
                                  console.error('Failed to update child comments:', err);
                                  fetchData();
                                }
                              }}
                              onEditContainer={(p) => {
                                if (!canUseFreeformEditButton) return;
                                setSchedulerPopoverPadletId(null);
                                setPadletToEdit(p);
                                setIsContainerEditorOpen(true);
                              }}
                              className="w-full bg-white p-4"
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && !isWallLayout && (
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
                <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6" onClick={(e) => e.stopPropagation()}>
                  <h2 className="text-xl font-semibold mb-3 text-gray-900">Delete Post</h2>
                  <p className="text-gray-600 mb-6">Are you sure you want to delete this post? This action cannot be undone.</p>
                  <div className="flex justify-end gap-3">
                    <button onClick={() => { setShowDeleteConfirm(false); setSelectedPadletId(null); }} className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 transition-colors">Cancel</button>
                    <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (selectedPadletId) { deletePadletById(selectedPadletId); setShowDeleteConfirm(false); } }} className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">Delete</button>
                  </div>
                </div>
              </div>
            )}

          </div>

          <OverlayLayer
            commentPopupOpen={commentPopupOpen}
            setCommentPopupOpen={setCommentPopupOpen}
            commentPopupComments={commentPopupComments}
            setCommentPopupComments={setCommentPopupComments}
            commentPopupPadletId={commentPopupPadletId}
            setCommentPopupPadletId={setCommentPopupPadletId}
            commentPopupCommentId={commentPopupCommentId}
            setCommentPopupCommentId={setCommentPopupCommentId}
            commentPopupPosition={commentPopupPosition}
            commentPopupHighlightColor={commentPopupHighlightColor}
            setCommentPopupHighlightColor={setCommentPopupHighlightColor}
            textLinkColorPickerOpen={textLinkColorPickerOpen}
            setTextLinkColorPickerOpen={setTextLinkColorPickerOpen}
            textLinkColorPickerPosition={textLinkColorPickerPosition}
            setTextLinkColorPickerPosition={setTextLinkColorPickerPosition}
            lineContextMenuState={lineContextMenuState}
            setLineContextMenuState={setLineContextMenuState}
            padlets={padlets}
            lines={lines}
            user={user}
            updatePadletContent={updatePadletContent}
            duplicateLine={duplicateLine}
            deleteLine={deleteLine}
            updateLine={updateLine}
            handleChangeLineLayer={handleChangeLineLayer}
          />
        </CanvasViewport>

        {isFreeformLayout && freeformBoardMenu && (
          <FreeformCanvasBoardMenu
            x={freeformBoardMenu.x}
            y={freeformBoardMenu.y}
            isEditable={canUseFreeformEditButton}
            showGraphLine={isFreeformGraphMode}
            canPaste={canPasteFromClipboard}
            canUndoPaste={lastPastedPadletIds.length > 0}
            showDotGrid={freeformBoardAppearance.showDotGrid}
            onClose={() => setFreeformBoardMenu(null)}
            onPaste={() => {
              void handlePaste({ x: freeformBoardMenu.canvasX, y: freeformBoardMenu.canvasY });
              setFreeformBoardMenu(null);
            }}
            onUndo={() => {
              void handleUndoPaste();
              setFreeformBoardMenu(null);
            }}
            onSelectAll={() => {
              handleSelectAllPadlets();
              setFreeformBoardMenu(null);
            }}
            onToolAction={(toolType) => {
              handleToolClick(toolType);
              setFreeformBoardMenu(null);
            }}
            onOpenBackgroundEditor={() => setFreeformWallpaperDialogOpen(true)}
            onToggleDotGrid={() => {
              void persistFreeformBoardAppearance({
                showDotGrid: !freeformBoardAppearance.showDotGrid,
              });
            }}
          />
        )}

        <WallpaperSelector
          isOpen={freeformWallpaperDialogOpen}
          onClose={() => setFreeformWallpaperDialogOpen(false)}
          currentSelection={{
            type: freeformBoardAppearance.backgroundType,
            value: freeformBoardAppearance.backgroundValue,
          }}
          onSelect={(type, value) => {
            setFreeformWallpaperDialogOpen(false);
            void persistFreeformBoardAppearance({
              backgroundType: type as 'color' | 'gradient' | 'image',
              backgroundValue: value,
            });
          }}
        />

        {!isColumnsLayout && !isGridLayout && !isFreeformLayout && imageToolbarPadletId && activeImageToolbarPadlet && activeImageToolbarSrc && (
          <div
            className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
            onClick={() => {
              setImageToolbarPadletId(null);
              setIsImageColorPickerOpen(false);
              setTextStylePadletId(null);
              setCaptionPopupPadletId(null);
              setIsImageEmojiOpen(false);
              setCardCommentPopupPadletId(null);
              setCommentColorPopupId(null);
            }}
          >
            <div
              className="relative flex max-h-[calc(100vh-80px)] max-w-[calc(100vw-80px)] items-start gap-6"
              onClick={(e) => e.stopPropagation()}
            >
              <ImageActionsToolbar
                currentCardColor={activeImageToolbarPadlet.metadata?.cardColor || '#ffffff'}
                commentCount={activeImageToolbarPadlet.metadata?.detachedComments?.length || 0}
                commentBadgeColor={activeImageToolbarPadlet.metadata?.badgeColor || '#facc15'}
                onColorClick={() => {
                  const nextOpen = !isImageColorPickerOpen;
                  setIsImageColorPickerOpen(nextOpen);
                  if (nextOpen) {
                    setTextStylePadletId(null);
                    setCaptionPopupPadletId(null);
                  }
                }}
                isColorPickerOpen={isImageColorPickerOpen}
                isDrawingMode={isDrawingMode}
                isCaptionMode={captionPopupPadletId === activeImageToolbarPadlet.id}
                isTextStyleMode={textStylePadletId === activeImageToolbarPadlet.id}
                onCardColor={async (color) => {
                  await updatePadletMetadata(activeImageToolbarPadlet.id, { cardColor: color });
                }}
                onTopStrip={async (color) => {
                  await updatePadletMetadata(activeImageToolbarPadlet.id, { topStrip: color });
                }}
                onCaptionTextColor={async (color) => {
                  await updatePadletMetadata(activeImageToolbarPadlet.id, {
                    captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color },
                  });
                }}
                currentTopStrip={activeImageToolbarPadlet.metadata?.topStrip || 'transparent'}
                currentCaptionTextColor={activeImageToolbarPadlet.metadata?.captionStyle?.color || '#1F2937'}
                onCaption={() => {
                  const isOpening = captionPopupPadletId !== activeImageToolbarPadlet.id;
                  setCaptionPopupPadletId(isOpening ? activeImageToolbarPadlet.id : null);
                  if (isOpening) {
                    setEditingCaption(activeImageToolbarPadlet.metadata?.caption || '');
                    setIsImageColorPickerOpen(false);
                  }
                }}
                onTextStyle={() => {
                  const isOpening = textStylePadletId !== activeImageToolbarPadlet.id;
                  setTextStylePadletId(isOpening ? activeImageToolbarPadlet.id : null);
                  if (isOpening && captionPopupPadletId !== activeImageToolbarPadlet.id) {
                    setCaptionPopupPadletId(activeImageToolbarPadlet.id);
                    setEditingCaption(activeImageToolbarPadlet.metadata?.caption || '');
                  }
                  if (isOpening) {
                    setIsImageColorPickerOpen(false);
                  }
                }}
                onSelectColor={async (color) => {
                  await updatePadletMetadata(activeImageToolbarPadlet.id, {
                    captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color },
                  });
                }}
                onSelectHighlight={async (highlight) => {
                  await updatePadletMetadata(activeImageToolbarPadlet.id, {
                    captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, backgroundColor: highlight },
                  });
                }}
                currentColor={activeImageToolbarPadlet.metadata?.captionStyle?.color}
                currentHighlight={activeImageToolbarPadlet.metadata?.captionStyle?.backgroundColor}
                onEditImage={() => {
                  setImageToolbarPadletId(null);
                  setCropPadlet(activeImageToolbarPadlet);
                  setIsCropMode(true);
                }}
                onDrawOnTop={() => {
                  closeAllToolbars();
                  setImageToolbarPadletId(null);
                  setDrawingPadlet(activeImageToolbarPadlet);
                  setIsDrawingMode(true);
                }}
                onAddReaction={() => {
                  setIsImageEmojiOpen(true);
                }}
                onComment={() => {
                  const commentsToShow = activeImageToolbarPadlet.metadata?.detachedComments || [];
                  setCardCommentList(commentsToShow);
                  setCardCommentPopupPadletId(activeImageToolbarPadlet.id);
                }}
              />

              <div
                className="overflow-hidden flex flex-col border border-gray-200 shadow-2xl"
                style={{ width: '360px', backgroundColor: activeImageToolbarPadlet.metadata?.cardColor || '#ffffff' }}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div
                  className="w-full flex-shrink-0"
                  style={{
                    minHeight: '22px',
                    backgroundColor: isStripVisible(activeImageToolbarPadlet.metadata?.topStrip)
                      ? activeImageToolbarPadlet.metadata?.topStrip
                      : 'rgba(0,0,0,0.04)',
                  }}
                />
                <div className="relative overflow-hidden bg-gray-50 flex items-center justify-center min-h-[100px]">
                  <img
                    src={activeImageToolbarSrc}
                    alt={activeImageToolbarPadlet.metadata?.caption || 'Image'}
                    className="w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"
                  />
                </div>
                {(activeImageToolbarPadlet.metadata?.reactions?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5">
                    <ReactionDisplay
                      reactions={activeImageToolbarPadlet.metadata?.reactions || []}
                      onAddClick={() => setIsImageEmojiOpen(true)}
                      onReactionClick={async (emoji) => {
                        const currentReactions = activeImageToolbarPadlet.metadata?.reactions || [];
                        const indexToRemove = currentReactions.indexOf(emoji);
                        if (indexToRemove === -1) return;
                        const newReactions = [
                          ...currentReactions.slice(0, indexToRemove),
                          ...currentReactions.slice(indexToRemove + 1),
                        ];
                        await updatePadletMetadata(activeImageToolbarPadlet.id, { reactions: newReactions });
                      }}
                    />
                  </div>
                )}
                <InlineCaption
                  value={(captionPopupPadletId === activeImageToolbarPadlet.id || textStylePadletId === activeImageToolbarPadlet.id)
                    ? editingCaption
                    : (activeImageToolbarPadlet.metadata?.caption || '')}
                  isEditing={captionPopupPadletId === activeImageToolbarPadlet.id || textStylePadletId === activeImageToolbarPadlet.id}
                  color={activeImageToolbarPadlet.metadata?.captionStyle?.color}
                  backgroundColor={activeImageToolbarPadlet.metadata?.captionStyle?.backgroundColor}
                  textStyle={{
                    fontSize: activeImageToolbarPadlet.metadata?.captionStyle?.fontSize,
                    fontWeight: activeImageToolbarPadlet.metadata?.captionStyle?.fontWeight,
                    fontStyle: activeImageToolbarPadlet.metadata?.captionStyle?.fontStyle,
                    fontFamily: activeImageToolbarPadlet.metadata?.captionStyle?.fontFamily,
                    lineHeight: activeImageToolbarPadlet.metadata?.captionStyle?.lineHeight,
                  }}
                  onChange={(next) => setEditingCaption(next)}
                  onCommit={async () => {
                    await updatePadletMetadata(activeImageToolbarPadlet.id, { caption: editingCaption });
                  }}
                />
              </div>

              {activeImageToolbarPadlet && textStylePadletId === activeImageToolbarPadlet.id && (
                <div
                  className="relative animate-in fade-in zoom-in duration-200 bg-white rounded-lg shadow-xl border border-gray-200 px-3 pb-3 pt-8 min-w-[240px]"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => setTextStylePadletId(null)}
                    className="absolute top-2 right-2 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-100"
                    title="Close"
                  >
                    <X className="w-3 h-3 text-gray-400" />
                  </button>
                  <TextStylePopup
                    isOpen={true}
                    onOpenChange={(open) => !open && setTextStylePadletId(null)}
                    onSelectHeading={(level) => {
                      const baseStyle = activeImageToolbarPadlet.metadata?.captionStyle || {};
                      const nextStyle = (() => {
                        switch (level) {
                          case 'h1': return { ...baseStyle, heading: 'h1', fontSize: '18px', fontWeight: '700', fontStyle: 'normal', fontFamily: undefined, lineHeight: '1.3' };
                          case 'h2': return { ...baseStyle, heading: 'h2', fontSize: '16px', fontWeight: '600', fontStyle: 'normal', fontFamily: undefined, lineHeight: '1.35' };
                          case 'small': return { ...baseStyle, heading: 'small', fontSize: '12px', fontWeight: '400', fontStyle: 'normal', fontFamily: undefined, lineHeight: '1.4' };
                          case 'code': return { ...baseStyle, heading: 'code', fontSize: '13px', fontWeight: '400', fontStyle: 'normal', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace", lineHeight: '1.4' };
                          case 'quote': return { ...baseStyle, heading: 'quote', fontSize: '14px', fontWeight: '400', fontStyle: 'italic', fontFamily: undefined, lineHeight: '1.45' };
                          case 'callout': return { ...baseStyle, heading: 'callout', fontSize: '14px', fontWeight: '500', fontStyle: 'normal', fontFamily: undefined, lineHeight: '1.4', backgroundColor: baseStyle.backgroundColor || '#fef3c7' };
                          case 'normal':
                          default: return { ...baseStyle, heading: 'normal', fontSize: '14px', fontWeight: '400', fontStyle: 'normal', fontFamily: undefined, lineHeight: '1.4' };
                        }
                      })();
                      const nextMeta = { ...(activeImageToolbarPadlet.metadata || {}), captionStyle: nextStyle };
                      setPadlets((prev) => prev.map((p) => (p.id === activeImageToolbarPadlet.id ? { ...p, metadata: nextMeta } : p)));
                      commitPadletMeta(activeImageToolbarPadlet.id, nextMeta);
                    }}
                    onSelectColor={(color) => {
                      const nextMeta = { ...(activeImageToolbarPadlet.metadata || {}), captionStyle: { ...(activeImageToolbarPadlet.metadata?.captionStyle || {}), color } };
                      setPadlets((prev) => prev.map((p) => (p.id === activeImageToolbarPadlet.id ? { ...p, metadata: nextMeta } : p)));
                      commitPadletMeta(activeImageToolbarPadlet.id, nextMeta);
                    }}
                    onSelectHighlight={(color) => {
                      const nextMeta = { ...(activeImageToolbarPadlet.metadata || {}), captionStyle: { ...(activeImageToolbarPadlet.metadata?.captionStyle || {}), backgroundColor: color } };
                      setPadlets((prev) => prev.map((p) => (p.id === activeImageToolbarPadlet.id ? { ...p, metadata: nextMeta } : p)));
                      commitPadletMeta(activeImageToolbarPadlet.id, nextMeta);
                    }}
                    currentHeading={activeImageToolbarPadlet.metadata?.captionStyle?.heading || 'normal'}
                    currentColor={activeImageToolbarPadlet.metadata?.captionStyle?.color}
                    currentHighlight={activeImageToolbarPadlet.metadata?.captionStyle?.backgroundColor}
                  />
                </div>
              )}

              {activeImageToolbarPadlet && isImageColorPickerOpen && (
                <div
                  className="animate-in fade-in zoom-in duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden w-[340px]">
                    <div className="p-4 flex flex-col gap-4">
                      <div className="grid items-center gap-3" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
                        <span className="text-sm font-semibold text-slate-800 whitespace-nowrap">Image Color</span>
                        <div className="inline-flex rounded-lg border bg-slate-50 p-1">
                          <button
                            onClick={() => setImageColorTab('background')}
                            className={["px-3 py-1 text-xs font-medium rounded-md", imageColorTab === 'background' ? "bg-white shadow-sm" : "text-slate-600"].join(" ")}
                            title="Background Color"
                          >BG</button>
                          <button
                            onClick={() => setImageColorTab('topstrip')}
                            className={["px-3 py-1 text-xs font-medium rounded-md", imageColorTab === 'topstrip' ? "bg-white shadow-sm" : "text-slate-600"].join(" ")}
                            title="Top Strip Color"
                          >TS</button>
                        </div>
                        <div className="flex justify-end">
                          <button
                            onClick={() => setIsImageColorPickerOpen(false)}
                            className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            title="Close"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <ColorPickerContent
                        color={imageColorTab === 'background' ? (activeImageToolbarPadlet.metadata?.cardColor || '#ffffff') : (activeImageToolbarPadlet.metadata?.topStrip || 'transparent')}
                        onChange={(color) => {
                          setPadlets((prev) =>
                            prev.map((p) => {
                              if (p.id !== activeImageToolbarPadlet.id) return p;
                              const nextMeta = imageColorTab === 'background'
                                ? { ...(p.metadata || {}), cardColor: color }
                                : { ...(p.metadata || {}), topStrip: color };
                              return { ...p, metadata: nextMeta };
                            })
                          );
                          const nextMeta = imageColorTab === 'background'
                            ? { ...(activeImageToolbarPadlet.metadata || {}), cardColor: color }
                            : { ...(activeImageToolbarPadlet.metadata || {}), topStrip: color };
                          commitPadletMeta(activeImageToolbarPadlet.id, nextMeta);
                        }}
                        hasOpacity={true}
                        presets={imageColorTab === 'background' ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Drawing image toolbar — emoji picker */}
              {isImageEmojiOpen && (
                <div
                  className="animate-in fade-in zoom-in duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="relative shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white">
                    <button
                      className="absolute top-2 right-2 translate-x-1 z-10 w-4 h-4 rounded hover:bg-gray-100 flex items-center justify-center"
                      onClick={() => setIsImageEmojiOpen(false)}
                      title="Close"
                    >
                      <X className="w-3 h-3 text-gray-400" />
                    </button>
                    <EmojiPicker
                      onEmojiClick={async (emojiData) => {
                        try {
                          const currentReactions = activeImageToolbarPadlet.metadata?.reactions || [];
                          const newReactions = [...currentReactions, emojiData.emoji];
                          await updatePadletMetadata(activeImageToolbarPadlet.id, { reactions: newReactions });
                          setIsImageEmojiOpen(false);
                        } catch (err) {
                          console.error('Failed to add reaction:', err);
                        }
                      }}
                      width={300}
                      height={400}
                      lazyLoadEmojis={true}
                    />
                  </div>
                </div>
              )}

              {/* Drawing image toolbar — detached comments popup */}
              {cardCommentPopupPadletId === activeImageToolbarPadlet.id && (
                <div
                  className="animate-in fade-in slide-in-from-left-2 duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setNoteBadgeColorPadletId(noteBadgeColorPadletId === activeImageToolbarPadlet.id ? null : activeImageToolbarPadlet.id);
                            setCommentColorPopupId(null);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                          title="Badge Color"
                        >
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: activeImageToolbarPadlet.metadata?.badgeColor || '#facc15' }}
                          />
                        </button>
                        <button
                          onClick={() => {
                            setCardCommentPopupPadletId(null);
                            setActiveCardCommentId(null);
                            setEditingCardCommentId(null);
                            setEditingCardCommentText('');
                            setCommentColorPopupId(null);
                            setNoteBadgeColorPadletId(null);
                          }}
                          className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    {noteBadgeColorPadletId === activeImageToolbarPadlet.id && (
                      <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                        <div className="grid grid-cols-6 gap-1.5">
                          {BADGE_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={async () => {
                                await updatePadletMetadata(activeImageToolbarPadlet.id, { badgeColor: color });
                                setNoteBadgeColorPadletId(null);
                              }}
                              className={`rounded transition-transform hover:scale-110 ${activeImageToolbarPadlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
                              style={{
                                width: '20px',
                                height: '20px',
                                backgroundColor: color,
                                border: ['#f3f4f6', '#e5e7eb', '#fef9c3', '#fef08a'].includes(color) ? '1px solid #d1d5db' : 'none',
                              }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {cardCommentList.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                    ) : (
                      <div className="flex gap-2 relative">
                        <div className="flex-1 space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin">
                          {cardCommentList.map((c: any, i: number) => {
                            const isEditing = editingCardCommentId === c.id;
                            const isActive = activeCardCommentId === c.id;
                            const commitEdit = async () => {
                              const trimmed = editingCardCommentText.trim();
                              if (!trimmed) {
                                setEditingCardCommentId(null);
                                setEditingCardCommentText('');
                                setCommentColorPopupId(null);
                                return;
                              }
                              const currentComments = activeImageToolbarPadlet.metadata?.detachedComments || [];
                              const nextComments = currentComments.map((comment: any) =>
                                comment.id === c.id ? { ...comment, text: trimmed } : comment
                              );
                              await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                              setCardCommentList(nextComments);
                              setEditingCardCommentId(null);
                              setEditingCardCommentText('');
                              setCommentColorPopupId(null);
                            };
                            const startEdit = () => {
                              setEditingCardCommentId(c.id || null);
                              setEditingCardCommentText(c.text || '');
                              setCommentColorPopupId(null);
                            };
                            return (
                              <div
                                key={c.id || i}
                                className={`flex gap-2 rounded py-0.5 px-0.5 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setActiveCardCommentId(c.id || null)}
                                onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
                              >
                                <div className="flex flex-col items-center gap-0.5 shrink-0 w-[22px]">
                                  <div className="w-[22px] h-[22px] rounded-full bg-blue-500 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                                    {c.userName?.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                  <span className="text-[9px] text-gray-400 leading-none text-center">
                                    {(() => {
                                      const diff = Date.now() - c.timestamp;
                                      const minutes = Math.floor(diff / 60000);
                                      const hours = Math.floor(minutes / 60);
                                      const days = Math.floor(hours / 24);
                                      const years = Math.floor(days / 365);
                                      if (minutes < 60) return `${Math.max(1, minutes)}m`;
                                      if (hours < 24) return `${hours}h`;
                                      if (days < 365) return `${days}d`;
                                      return `${years}y`;
                                    })()}
                                  </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-xs font-medium text-gray-700 truncate">{c.userName || 'User'}</span>
                                  </div>
                                  {isEditing ? (
                                    <textarea
                                      value={editingCardCommentText}
                                      onChange={(e) => setEditingCardCommentText(e.target.value)}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); await commitEdit(); }
                                        if (e.key === 'Escape') { setEditingCardCommentId(null); setEditingCardCommentText(''); setCommentColorPopupId(null); }
                                      }}
                                      onBlur={() => { if (commentColorPopupId === c.id) return; commitEdit(); }}
                                      className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                      style={{ color: c.textColor || c.color || '#4b5563', backgroundColor: c.backgroundColor || undefined }}
                                      rows={1}
                                      autoFocus
                                    />
                                  ) : (
                                    <div
                                      className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${c.isStrikethrough ? 'line-through' : ''}`}
                                      style={{ color: c.textColor || c.color, backgroundColor: c.backgroundColor || undefined }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      onDoubleClick={(e) => { e.stopPropagation(); startEdit(); }}
                                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(c.text) }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                          {editingCardCommentId && activeCardComment && editingCardCommentId === activeCardComment.id ? (
                            <button
                              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null)); }}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                              title="Color"
                              disabled={!activeCardComment}
                            >
                              <Palette className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              onClick={() => { if (!activeCardComment) return; setEditingCardCommentId(activeCardComment.id || null); setEditingCardCommentText(activeCardComment.text || ''); setCommentColorPopupId(null); }}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
                              title="Edit"
                              disabled={!activeCardComment}
                            >
                              <PenTool className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!activeCardComment) return;
                              const currentComments = activeImageToolbarPadlet.metadata?.detachedComments || [];
                              const nextComments = currentComments.map((comment: any) =>
                                comment.id === activeCardComment.id ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                              );
                              await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                              setCardCommentList(nextComments);
                            }}
                            className={`p-1 rounded transition-colors ${activeCardComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                            title="Strikethrough"
                            disabled={!activeCardComment}
                          >
                            <Strikethrough className="w-3 h-3" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!activeCardComment) return;
                              const currentComments = activeImageToolbarPadlet.metadata?.detachedComments || [];
                              const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                              await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                              setCardCommentList(nextComments);
                              setActiveCardCommentId(nextComments[nextComments.length - 1]?.id || null);
                              setEditingCardCommentId(null);
                              setEditingCardCommentText('');
                              setCommentColorPopupId(null);
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
                            title="Delete"
                            disabled={!activeCardComment}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <input
                        type="text"
                        placeholder="Add a comment..."
                        className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            const inputElement = e.currentTarget;
                            const commentText = inputElement.value.trim();
                            const newComment = {
                              id: `comment-${Date.now()}`,
                              text: commentText,
                              userId: user?.id || 'anon',
                              userName: user?.email?.split('@')[0] || 'You',
                              timestamp: Date.now(),
                            };
                            const currentComments = activeImageToolbarPadlet.metadata?.detachedComments || [];
                            inputElement.value = '';
                            await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: [...currentComments, newComment] });
                            setCardCommentList([...currentComments, newComment]);
                            setActiveCardCommentId(newComment.id);
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Zoom Controls (Excalidraw-style) */}
        {!isWallLayout && !isColumnsLayout && !isGridLayout && !isDrawingLayout && !isTimelineLayout && !isKanbanLayout && !isSchedulerLayout && !isMapLayout && (
          <ZoomControls
            canvasZoom={canvasZoom}
            handleZoomOut={handleZoomOut}
            handleZoomReset={handleZoomReset}
            handleZoomIn={handleZoomIn}
          />
        )}
      </div >

      {/* Drawing Canvas post placement modal */}
      <PlacementPrompt
        isOpen={drawingContainerPromptOpen}
        onClose={() => { setDrawingContainerPromptOpen(false); setDrawingPendingDraft(null); }}
        draft={drawingPendingDraft as any}
        onPlaceInNew={handleDrawingNewContainer}
        onPlaceInExisting={handleDrawingAddToExisting}
      />

      {/* New Post Ghost Drag Element */}
      <GhostDragElement newPostDragState={newPostDragState} />
    </div >
  );
  // === END RENDER REGION (JSX ONLY) ===
}

