"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @next/next/no-img-element */

import React from 'react';
import DOMPurify from 'dompurify';
import type { AuthUser } from '@/lib/domain/auth/user';
import type { Padlet } from '@/types/collabboard';
import { createUpdatePostFieldsCommand } from '@/lib/domain/canvas/posts';
import { selectCardModalRoute } from '@/lib/domain/canvas/cardModalRoute';
import { selectDocumentModalDestination, type DocumentModalDestination } from '@/lib/domain/canvas/documentModalRoute';
import { isDocumentPost } from '@/lib/domain/canvas/documentPost';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import ImageActionsToolbar from '@/components/collabboard/editors/ImageActionsToolbar';
import ImageDrawingLayer from '@/components/collabboard/editors/ImageDrawingLayer';
import ImageCropLayer from '@/components/collabboard/editors/ImageCropLayer';
import CardPreview from '@/components/collabboard/CardPreview';
import CardEditor from '@/components/collabboard/CardEditor';
import CommentPost from '@/components/collabboard/CommentPost';
import { handleSafeCommentLinkClick } from '@/components/collabboard/commentLinkSafety';
import TextStylePopup from '@/components/collabboard/editors/TextStylePopup';
import CommentPopup from '@/components/collabboard/editors/CommentPopup';
import { guardCommentMutation, guardCommentComposition, guardOwnCommentMutation, type CommentAccessMode } from '@/lib/domain/canvas/comments';
import type { CommentModeMutations } from '@/lib/infra/canvas/commentMutations';
import { nextTextAlign } from '@/components/collabboard/editors/textAlignCycle';
import { normalizeCaptionStyle, resolveCaptionStyle, resolvePadletTitleStyle, type CaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { CardColorPanel } from '@/components/collabboard/editors/CardColorPanel';
import ReactionDisplay from '@/components/collabboard/editors/ReactionDisplay';
import EmojiReactionPicker from '@/components/collabboard/editors/EmojiReactionPicker';
import InlineCaption from '@/components/collabboard/editors/InlineCaption';
import { ColorPickerContent } from '@/components/collabboard/ColorPicker';
import AIContentRenderer from '@/components/ai/AIContentRenderer';
import PostCardContent from '@/components/collabboard/PostCardContent';
import AIComponentExportMenu from '@/components/collabboard/AIComponentExportMenu';
import RowColumnContainerCard from '@/components/collabboard/RowColumnContainerCard';
import { contrastIconColor } from '@/components/collabboard/shells/CardShell';
import LinkMediaEmbed, { getLinkEmbedKind } from '@/components/collabboard/LinkMediaEmbed';
import FreeformGraphLayer from '@/components/graph/FreeformGraphLayer';
import { buildYouTubeThumbCandidates, extractYouTubeId } from '@/lib/media/youtubeThumb';
import { NotePostContextMenu } from '@/components/collabboard/menus/NotePostContextMenu';
import { LinkPostContextMenu } from '@/components/collabboard/menus/LinkPostContextMenu';
import { TodoPostContextMenu } from '@/components/collabboard/menus/TodoPostContextMenu';
import { ColumnPostContextMenu } from '@/components/collabboard/menus/ColumnPostContextMenu';
import { CommentPostContextMenu } from '@/components/collabboard/menus/CommentPostContextMenu';
import { ImagePostContextMenu } from '@/components/collabboard/context-menus/ImagePostContextMenu';
import { SectionHeadingContextMenu } from '@/components/collabboard/menus/SectionHeadingContextMenu';
import { isStripVisible, htmlToText, getEligibleContainerDestinations, IMAGE_CROP_TO_GRID_HEIGHT_PX } from '@/components/collabboard/canvas/engine/utils';
import { getSectionHeadingHeight, isSectionHeading, type SectionHeadingLevel, type SectionHeadingRect, type SectionHeadingWorldBounds } from '@/components/collabboard/canvas/engine/sectionHeading';
import SectionHeadingPost from '@/components/collabboard/canvas/ui/SectionHeadingPost';
import SectionHeadingToolbar from '@/components/collabboard/canvas/ui/SectionHeadingToolbar';
import type { SectionHeadingColorTarget } from '@/components/collabboard/canvas/ui/SectionHeadingAppearancePanel';
import { FREEFORM_WORLD_WIDTH_PX, FREEFORM_WORLD_HEIGHT_PX, FREEFORM_WORLD_MIN_X, FREEFORM_WORLD_MAX_X } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { getContainerEditTargetLabel } from '@/lib/infra/collabboard/containerEditTargetLabel';
import { getEffectiveVisibleChildTitleIds, toggleChildPostTitleVisibility } from '@/lib/infra/collabboard/containerChildTitleVisibility';
import {
  Bell, X, Edit2, PenTool, Trash2, Palette, Strikethrough, ChevronDown, ChevronUp, RefreshCw, Pencil, ArrowLeftRight, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  extractAIContentFromPadletMetadata,
  normalizeAIContent,
  resolveSavedAIHtmlFromMetadata,
} from '@/lib/ai/normalize-ai-content';
import { getConversionTargets } from '@/lib/ai/conversion-matrix';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import type { AIContentData, DiagramSubtype } from '@/lib/ai/contracts';
import type { StableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';
import { useCanvasEditor } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { useCanvasConfig } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';
import { getMeaningfulTitle } from '@/lib/infra/collabboard/postTitle';

const DND_KIND_CONTAINER_MOVE = 'columns-container-move';

/**
 * PATCH SECTION-H3B Phase 4/5/16: the Freeform host states its OWN horizontal
 * stage policy here, at the call site, reading the canonical signed-stage
 * contract. The generic Section Heading geometry helpers hold no default and
 * import nothing from freeformStageGeometry, so a Drawing host in SECTION-H3C
 * cannot silently inherit -5000..15000.
 */
const FREEFORM_SECTION_HEADING_WORLD_BOUNDS: SectionHeadingWorldBounds = {
  minX: FREEFORM_WORLD_MIN_X,
  maxX: FREEFORM_WORLD_MAX_X,
};

type FreeformPadletActionMap = {
  duplicatePadlet: (id: string) => void;
  addPadletToLibrary: (id: string) => void;
  requestDeletePadlet: (id: string) => void;
  cutPadlet: (id: string) => void;
  copyPadlet: (id: string) => void;
  lockPadlet: (id: string) => void;
  movePadletLayer: (id: string, action: string) => void;
  groupIntoColumn: (id: string, targetContainerId?: string) => void;
  replaceImage: (id: string) => void;
  downloadImage: (id: string) => void;
  toggleCropToGrid: (id: string) => void;
  handlePaste: () => void;
  renameComment: (id: string) => void;
  renameColumn: (id: string) => void;
  renameTodo: (id: string) => void;
  createSyncedCopy: (id: string) => void;
  addImageToLink: (id: string) => void;
  copyLinkAddress: (id: string) => void;
  deletePadletById: (id: string) => void;
  fetchData: () => void;
  updatePadletMetadata: (id: string, meta: any) => void;
  updatePadletTitle: (id: string, title: string) => Promise<any>;
  updatePadletContent: (id: string, content: string) => Promise<any>;
  commitPadletMeta: (id: string, meta: any) => void;
};

// Priority order for resolving which back-line DOM target receives a bridged event.
// Handles take precedence over the hit-path so that drag-from-handle works correctly
// even when the line is in the back plane and the FPC surface is the first hit.
const BACK_LINE_INTERACTIVE_ROLE_PRIORITY = [
  'point-handle',
  'midpoint-handle',
  'start-handle',
  'control-handle',
  'end-handle',
  'label-handle',
  'hit-path',
] as const;

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

function getAIImageAttributions(metadata?: Padlet["metadata"]): Array<{
  source?: string | null;
  author?: string | null;
  authorLink?: string | null;
}> {
  const images =
    metadata?.savedAIComponent?.assets?.images ||
    (metadata?.aiAssets?.images || []).map((image) => ({
      source: image.source,
      author: image.author,
      authorLink: image.authorLink,
    }));

  return images
    .map((image) => ({
      source: image.source || null,
      author: image.author || null,
      authorLink: image.authorLink || null,
    }))
    .filter((image) => image.source || image.author || image.authorLink);
}

// -- Props --------------------------------------------------------------------- 
export interface FreeformPadletCardsProps {
  // Core data
  rootPadlets: Padlet[];
  padlets: Padlet[];
  setPadlets: React.Dispatch<React.SetStateAction<Padlet[]>>;
  user: AuthUser | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  // PATCH 9S.2: forwarded straight through to FreeformGraphLayer below --
  // the canonical Freeform world-origin reference (see CanvasClient's
  // freeformWorldOriginRef doc comment). Optional so any existing test
  // harness that mounts this component without it keeps working (Graph
  // measuredRects falls back to its pre-9S.2 formula when absent).
  worldOriginRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * PATCH SECTION-H3B Phase 8: the canonical Freeform client -> world
   * conversion (CanvasClient's `getCanvasPointFromClient`), threaded through
   * rather than re-derived. Section Headings consume it as their host
   * converter, so this component defines no second conversion formula.
   */
  getWorldPointFromClient: (clientX: number, clientY: number) => { x: number; y: number };

  // Flags
  isDragging: boolean;
  draggingPadletId: string | null;
  dragOverContainerId: string | null;
  isGraphConnectMode: boolean;
  isLineMode: boolean;
  isDrawingMode: boolean;

  // Selection
  selectedPadletId: string | null;
  selectedPadletIds: string[];
  setSelectedPadletId: (id: string | null) => void;
  setGraphConnectSelection: (sel: { id: string; side: any; nonce: number }) => void;
  graphRefreshToken: number;

  // Callbacks
  closeAllToolbars: (except?: Record<string, boolean>) => void;
  handlePadletMouseDown: (e: React.MouseEvent, padletId: string) => void;
  getClickedSide: (e: React.MouseEvent) => any;
  stableActions: StableCanvasActions<FreeformPadletActionMap>;
  // PATCH-149B2-ii §34: guarded Document open (dirty-draft protection, §32.14 6-8).
  requestOpenDocument: (post: Padlet, destination: DocumentModalDestination) => void;
  // PATCH 8O.1 -- explicit comment access contract, resolved once by the
  // caller (CanvasClient.tsx) from the effective workspace/board permission
  // and threaded straight through to every canonical CommentPopup instance
  // this component renders (Clipart Site B, Image on-canvas, Image toolbar).
  // Optional/defaulted so any existing test harness that mounts this
  // component without the prop keeps today's fully writable behavior.
  commentAccessMode?: CommentAccessMode;
  // PATCH 8O.2 -- persistence path for 'comment'-mode own-comment mutations
  // at the three canonical call sites below (Image on-canvas, Clipart Site
  // B, Image toolbar). Optional so any existing test harness that mounts
  // this component without it keeps working -- 'comment' mode simply cannot
  // persist without it (see each call site's own branch).
  commentModeMutations?: CommentModeMutations;
}



// -- Component -----------------------------------------------------------------
function FreeformPadletCards(props: FreeformPadletCardsProps) {
  const {
    rootPadlets, padlets, setPadlets, user, containerRef, worldOriginRef, getWorldPointFromClient,
    isDragging, draggingPadletId, dragOverContainerId, isGraphConnectMode,
    isLineMode, isDrawingMode,
    selectedPadletId, selectedPadletIds, setSelectedPadletId, setGraphConnectSelection, graphRefreshToken,
    closeAllToolbars, handlePadletMouseDown, getClickedSide,
    stableActions,
    requestOpenDocument,
    commentAccessMode = 'manage',
    commentModeMutations,
  } = props;
  /**
   * PATCH-053: image-reaction writes already ignore a resolved Supabase error
   * but route a rejected builder into their local catch. Preserve both
   * channels while consuming the existing canvas.updatePostFields command.
   */
  const updatePostFieldsPreservingFailureChannels = React.useCallback(async (id: string, fields: object) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
    return result;
  }, []);
  /**
   * PATCH-056: the task toggle is check-and-throw - BOTH legacy channels
   * (the resolved { error } thrown at the site, the rejected builder)
   * already converge into its existing catch, so ANY command failure
   * rethrows the original cause (a resolved failure's cause is the raw
   * Supabase error object the legacy site threw).
   */
  const updatePostFieldsOrThrow = React.useCallback(async (id: string, fields: object) => {
    const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
    const result = await updatePostFields({ postId: id, fields }, { userId: null });
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);
  /**
   * PATCH-059 (P3 fix, owner-authorized): AI-card resize persistence. The
   * legacy bare builder statements were INERT (PATCH-058 ruling) - this
   * helper is the first code that actually saves the resize. Launched
   * without awaiting so the pointer path never blocks; the command never
   * throws (defineCommand converts every failure into a Result), so the
   * void'd promise cannot reject. Failure behavior, ruled deliberately:
   * console.error only - the optimistic local size stays (no rollback, no
   * toast, no fetch), matching the component's freeform failure posture.
   */
  const persistPostFieldsBestEffort = React.useCallback((id: string, fields: object) => {
    void (async () => {
      const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
      const result = await updatePostFields({ postId: id, fields }, { userId: null });
      if (!result.ok) {
        console.error('Failed to persist AI card resize:', result.error.cause ?? result.error);
      }
    })();
  }, []);
  const isPadletSelected = React.useCallback(
    (padletId: string) => selectedPadletId === padletId || selectedPadletIds.includes(padletId),
    [selectedPadletId, selectedPadletIds]
  );

  const {
    canvasZoom,
    canvasId,
    isFreeformGraphMode,
    canUseFreeformEditButton,
    isColumnsLayout,
    worldOriginLeft,
    worldOriginTop,
  } = useCanvasConfig();

  /**
   * PATCH SECTION-H2 Phase 17/50 -- Section Heading geometry persistence.
   *
   * Deliberately NOT the AI card's `persistPostFieldsBestEffort` above: that
   * helper documents a legacy console.error-only posture with no rollback.
   * An honest command exists (`updatePostFieldsOrThrow`), so this uses it and
   * genuinely restores the pre-drag rect when the write fails, rather than
   * leaving the screen showing a size the database never accepted.
   *
   * Called ONCE, from pointerup -- pointermove only previews through local
   * state (`previewSectionHeadingRect`).
   */
  const commitSectionHeadingRect = React.useCallback(async (
    padletId: string,
    rect: SectionHeadingRect,
    originRect: SectionHeadingRect,
  ) => {
    setPadlets(prev => prev.map(p => (
      p.id === padletId ? { ...p, position_x: rect.x, width: rect.width } : p
    )));
    try {
      await updatePostFieldsOrThrow(padletId, {
        position_x: rect.x,
        width: rect.width,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to persist section heading size:', err);
      setPadlets(prev => prev.map(p => (
        p.id === padletId ? { ...p, position_x: originRect.x, width: originRect.width } : p
      )));
      toast.error('Failed to resize section heading');
    }
  }, [setPadlets, updatePostFieldsOrThrow]);

  const previewSectionHeadingRect = React.useCallback((padletId: string, rect: SectionHeadingRect) => {
    setPadlets(prev => prev.map(p => (
      p.id === padletId ? { ...p, position_x: rect.x, width: rect.width } : p
    )));
  }, [setPadlets]);

  /**
   * PATCH SECTION-H2 Phase 7/50 -- heading level and appearance persistence.
   * PATCH SECTION-H3B.2 Phase 15 -- extended with an optional `geometry.height`
   * so a level change persists `metadata.headingLevel` AND `height` through
   * this SAME `updatePostFieldsOrThrow` call rather than two independent
   * writes: one honest command, one optimistic update, one rollback.
   *
   * Same honest posture as the geometry write above, and deliberately not the
   * `commitPadletMeta` debounce, whose documented contract swallows both
   * resolved and thrown failures.
   */
  const commitSectionHeadingMetadata = React.useCallback(async (
    padletId: string,
    updates: Record<string, unknown>,
    geometry?: { height?: number },
  ) => {
    const previous = padlets.find(p => p.id === padletId);
    if (!previous) return;
    const previousMetadata = previous.metadata;
    const previousHeight = previous.height;
    const nextMetadata = { ...(previousMetadata || {}), ...updates };
    const heightUpdate = geometry?.height !== undefined ? { height: geometry.height } : {};
    setPadlets(prev => prev.map(p => (p.id === padletId ? { ...p, metadata: nextMetadata, ...heightUpdate } : p)));
    try {
      await updatePostFieldsOrThrow(padletId, {
        metadata: nextMetadata,
        ...heightUpdate,
        updated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('Failed to persist section heading appearance:', err);
      setPadlets(prev => prev.map(p => (p.id === padletId ? { ...p, metadata: previousMetadata, height: previousHeight } : p)));
      toast.error('Failed to update section heading');
    }
  }, [padlets, setPadlets, updatePostFieldsOrThrow]);

  const setSectionHeadingLevel = React.useCallback((padletId: string, level: SectionHeadingLevel) => {
    // Phase 5/6: x/y/width are never named here, so they are structurally
    // untouched -- only headingLevel and its canonical height move together.
    void commitSectionHeadingMetadata(padletId, { headingLevel: level }, { height: getSectionHeadingHeight(level) });
  }, [commitSectionHeadingMetadata]);

  const setSectionHeadingTextStyle = React.useCallback((padletId: string, style: Partial<CaptionStyle>) => {
    // Stored through the app's existing generic title-style normalizer, so a
    // heading can never persist a style shape the shared resolver rejects.
    void commitSectionHeadingMetadata(padletId, { titleStyle: normalizeCaptionStyle(style) ?? {} });
  }, [commitSectionHeadingMetadata]);

  /**
   * The heading that owns the formatting toolbar. Single selection only: a
   * multi-selection is a group-move gesture, not a formatting context.
   */
  const selectedSectionHeading = React.useMemo(() => {
    if (!canUseFreeformEditButton || selectedPadletIds.length > 1) return null;
    const found = rootPadlets.find(p => p.id === selectedPadletId);
    return found && isSectionHeading(found) ? found : null;
  }, [canUseFreeformEditButton, rootPadlets, selectedPadletId, selectedPadletIds]);

  // Measured through the SAME generic `[data-padlet-id]` selector the minimap
  // uses, so the heading needs no bespoke ref plumbing to be anchorable.
  const [selectedSectionHeadingElement, setSelectedSectionHeadingElement] =
    React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    if (!selectedSectionHeading) {
      setSelectedSectionHeadingElement(null);
      return;
    }
    setSelectedSectionHeadingElement(
      document.querySelector<HTMLElement>(`[data-padlet-id="${selectedSectionHeading.id}"]`)
    );
  }, [selectedSectionHeading]);

  const setSectionHeadingColor = React.useCallback((
    padletId: string,
    target: SectionHeadingColorTarget,
    color: string,
  ) => {
    const field = target === 'text' ? 'textColor' : target === 'accent' ? 'accentColor' : 'backgroundColor';
    void commitSectionHeadingMetadata(padletId, { [field]: color });
  }, [commitSectionHeadingMetadata]);

  const {
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
    setIsCardViewerOpen,
    setIsClipartDraftModalOpen,
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
    setImageColorTab,
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
    captionEditorPadletId,
    setCaptionEditorPadletId,
    editingNoteTitleId,
    setEditingNoteTitleId,
    noteTitleDraft,
    setNoteTitleDraft,
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
    setInternalBadgePopupPosition,
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
  } = useCanvasEditor();

  const {
    duplicatePadlet,
    addPadletToLibrary,
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
  } = stableActions;

  // "Full view" -- per-post toggle for a frameless, title-less display,
  // right-click menu only (Image/Card-Clipart/Drawing/AI Component). Stored
  // in metadata like every other display preference (cropToGrid, showCardView).
  const toggleFullView = React.useCallback((id: string) => {
    const padlet = padlets.find((p) => p.id === id);
    if (!padlet) return;
    updatePadletMetadata(id, { fullView: !(padlet.metadata as any)?.fullView });
  }, [padlets, updatePadletMetadata]);

  // PATCH SECTION-H3B.4: the Section Heading right-click menu's open/position
  // state, owned by this host (Phase 25) exactly like SectionHeadingToolbar's
  // own state is -- the heading component itself only reports the raw event.
  const [sectionHeadingContextMenu, setSectionHeadingContextMenu] = React.useState<{ padletId: string; x: number; y: number } | null>(null);

  const handleSectionHeadingContextMenu = React.useCallback((event: React.MouseEvent, padletId: string) => {
    // Mirrors every other post-type menu's `disabled={!canUseFreeformEditButton}`
    // convention: in read-only mode, no CollabBoard menu opens and the
    // browser's native context menu is left alone (no preventDefault).
    if (!canUseFreeformEditButton) return;
    event.preventDefault();
    event.stopPropagation();
    closeAllToolbars();
    setSelectedPadletId(padletId);
    setSectionHeadingContextMenu({ padletId, x: event.clientX, y: event.clientY });
  }, [canUseFreeformEditButton, closeAllToolbars, setSelectedPadletId]);

  const [expandedContainers, setExpandedContainers] = React.useState<Record<string, boolean>>({});
  const [expandableContainers, setExpandableContainers] = React.useState<Record<string, boolean>>({});
  const [expandedAIPosts, setExpandedAIPosts] = React.useState<Record<string, boolean>>({});
  const [expandableAIPosts, setExpandableAIPosts] = React.useState<Record<string, boolean>>({});
  const aiExportTargetsRef = React.useRef<Record<string, HTMLDivElement | null>>({});
  const aiResizeRef = React.useRef<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  const activeImageToolbarPadlet = imageToolbarPadletId
    ? padlets.find((padlet) => padlet.id === imageToolbarPadletId) ?? null
    : null;
  // Image editing modal's own Title field -- independent of the caption
  // below it. `activeImageStyleTarget` tracks which of the two the Text
  // style panel is currently formatting (default 'caption' preserves the
  // existing behaviour of the toolbar's own "Text style" button; clicking
  // into the Title input switches it, same click-to-target pattern as
  // Todo's per-item color).
  const [activeImageStyleTarget, setActiveImageStyleTarget] = React.useState<'title' | 'caption'>('caption');
  const [imageTitleDraft, setImageTitleDraft] = React.useState('');
  React.useEffect(() => {
    if (imageToolbarPadletId && activeImageToolbarPadlet) {
      setImageTitleDraft(getMeaningfulTitle(activeImageToolbarPadlet.title, activeImageToolbarPadlet.type));
      setActiveImageStyleTarget('caption');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per modal open (id change), not on every padlet field update
  }, [imageToolbarPadletId]);
  // Blur alone isn't a reliable commit trigger for this input: clicking a
  // control inside the Text style panel (heading, color swatch) calls
  // preventDefault on mousedown so it doesn't steal focus away from a live
  // text selection elsewhere (see TextStylePopup's preventFocusLoss) --
  // which also means it never blurs THIS input, so clearing the title and
  // clicking straight into the panel would silently discard the change.
  // Debounce-commit on every change too, so the title always saves without
  // requiring Enter first.
  React.useEffect(() => {
    if (!activeImageToolbarPadlet) return;
    const persistedTitle = getMeaningfulTitle(activeImageToolbarPadlet.title, activeImageToolbarPadlet.type);
    if (imageTitleDraft === persistedTitle) return;
    const timeout = setTimeout(() => {
      updatePadletTitle(activeImageToolbarPadlet.id, imageTitleDraft.trim());
    }, 500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire only on draft changes; activeImageToolbarPadlet is read fresh from the same render
  }, [imageTitleDraft]);
  const activeImageToolbarSrc = activeImageToolbarPadlet
    ? (
      activeImageToolbarPadlet.metadata?.imageUrl ||
      activeImageToolbarPadlet.metadata?.drawing ||
      (activeImageToolbarPadlet as any).file_url ||
      (typeof activeImageToolbarPadlet.content === 'string' && /^https?:\/\//i.test(activeImageToolbarPadlet.content)
        ? activeImageToolbarPadlet.content
        : null)
    )
    : null;

  const openFreeformImageEditModal = React.useCallback((padlet: Padlet) => {
    // imageToolbarPadletId drives a self-contained `fixed inset-0` overlay
    // (its own centered card preview + ImageActionsToolbar, further down in
    // this file) that looks the padlet up directly from the `padlets` array
    // -- it is NOT anchored to that padlet's own on-canvas DOM element, so
    // it works the same whether the padlet is a top-level card or a
    // container child. Do not special-case container children here again:
    // an earlier attempt assumed this needed a real on-canvas anchor and
    // routed container children to the legacy ImageEditor modal instead --
    // wrong, and the wrong editor (no crop/color/caption/reaction controls).
    closeAllToolbars({ imageToolbar: true });
    setPadletToEdit(null);
    setIsImageEditorOpen(false);
    setImageToolbarPadletId(padlet.id);
  }, [
    closeAllToolbars,
    setImageToolbarPadletId,
    setPadletToEdit,
    setIsImageEditorOpen,
  ]);

  const openFreeformPadletModal = React.useCallback((padlet: Padlet) => {
    const padletType = String(padlet.type || '').toLowerCase();
    if (padletType === 'image') {
      openFreeformImageEditModal(padlet);
      return;
    }
    // PATCH-149B2-ii §34: resolved before setPadletToEdit below (§26.4 C7 unchanged).
    if (padletType === 'card') {
      const destination = selectDocumentModalDestination(padlet, canUseFreeformEditButton);
      if (destination) { requestOpenDocument(padlet, destination); return; }
    }
    closeAllToolbars();
    setPadletToEdit(padlet);
    if (padletType === 'table') {
      setIsTableEditorOpen(true);
    } else if (padletType === 'link') {
      setIsLinkEditorOpen(true);
    } else if (padletType === 'todo') {
      setIsTodoEditorOpen(true);
    } else if (padletType === 'comment') {
      setIsCommentEditorOpen(true);
    } else if (padletType === 'drawing') {
      setIsDrawingEditorOpen(true);
    } else if (padletType === 'card') {
      // Reaching here means selectDocumentModalDestination above returned
      // null -- a real (svgUrl-bearing) clipart card, not a Document. The
      // modern clipart editor is ClipartCardDraftModal; setIsCardEditorOpen
      // opens the legacy CardEditor (plain title/body/description text
      // fields, no icon/color/caption/reaction controls at all) that
      // predates it -- mirror onOpenToolbar's pencil-button routing here
      // instead of the stale editor-selection this had drifted out of sync
      // with.
      if (selectCardModalRoute(canUseFreeformEditButton) === 'editor') {
        setIsClipartDraftModalOpen(true);
      } else {
        setIsCardViewerOpen(true);
      }
    } else if (padletType === 'container') {
      setIsContainerEditorOpen(true);
    } else if (padletType === 'ai-component') {
      setIsAIComponentEditorOpen(true);
    } else {
      setIsNoteEditorOpen(true);
    }
  }, [
    closeAllToolbars,
    setPadletToEdit,
    setIsTableEditorOpen,
    setIsLinkEditorOpen,
    setIsTodoEditorOpen,
    setIsCommentEditorOpen,
    setIsDrawingEditorOpen,
    setIsClipartDraftModalOpen,
    setIsCardViewerOpen,
    requestOpenDocument,
    canUseFreeformEditButton,
    setIsContainerEditorOpen,
    setIsAIComponentEditorOpen,
    setIsAIContentEditModalOpen,
    setIsAIContentConvertModalOpen,
    setIsNoteEditorOpen,
    openFreeformImageEditModal,
  ]);

  // ── Freeform back-line bridge ──────────────────────────────────────────────
  // The FPC surface div sits above the back-plane SVG in CSS stacking order
  // (PadletLayer comes after the back-plane container in the DOM and therefore
  // wins all pointer events even though the back SVG has pointer-events:auto).
  // This bridge mirrors the DrawingLayout pattern: capture events on the
  // surface, scan the DOM stack for a back-line interactive target at the same
  // point, guard against real padlet targets, and re-dispatch to the line element.

  const bridgedBackLineInteractiveTargetRef = React.useRef<Element | null>(null);
  const isDispatchingFreeformBackLineBridgeRef = React.useRef(false);

  const findBackLineInteractiveTargetAtPoint = React.useCallback(
    (clientX: number, clientY: number): Element | null => {
      const stack = document.elementsFromPoint(clientX, clientY);
      for (const role of BACK_LINE_INTERACTIVE_ROLE_PRIORITY) {
        for (const node of stack) {
          if (!(node instanceof Element)) continue;
          if ((node as HTMLElement).dataset?.lineRenderer !== 'back') continue;
          if ((node as HTMLElement).dataset?.lineRole !== role) continue;
          return node;
        }
      }
      return null;
    },
    [],
  );

  /** Returns true when the direct event target is inside a real padlet card — padlet should win. */
  const isPadletTarget = React.useCallback((target: EventTarget | null): boolean => {
    if (!(target instanceof Element)) return false;
    return target.closest('[data-padlet-id]') !== null;
  }, []);

  const handleFreeformBackLineBridgeMouseDownCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDispatchingFreeformBackLineBridgeRef.current) return;
      bridgedBackLineInteractiveTargetRef.current = null;

      if (isGraphConnectMode) return;
      if (isLineMode) return;
      if (event.button !== 0) return;
      if (isPadletTarget(event.target)) return;

      const interactiveTarget = findBackLineInteractiveTargetAtPoint(event.clientX, event.clientY);
      if (!interactiveTarget) return;

      bridgedBackLineInteractiveTargetRef.current = interactiveTarget;
      event.preventDefault();
      event.stopPropagation();

      isDispatchingFreeformBackLineBridgeRef.current = true;
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
        isDispatchingFreeformBackLineBridgeRef.current = false;
      }
    },
    [isGraphConnectMode, isLineMode, isPadletTarget, findBackLineInteractiveTargetAtPoint],
  );

  const handleFreeformBackLineBridgeClickCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDispatchingFreeformBackLineBridgeRef.current) return;
      if (event.button !== 0) return;

      const bridgedTarget = bridgedBackLineInteractiveTargetRef.current;
      bridgedBackLineInteractiveTargetRef.current = null;
      if (!bridgedTarget) return;

      event.preventDefault();
      event.stopPropagation();

      isDispatchingFreeformBackLineBridgeRef.current = true;
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
        isDispatchingFreeformBackLineBridgeRef.current = false;
      }
    },
    [],
  );

  const handleFreeformBackLineBridgeDoubleClickCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDispatchingFreeformBackLineBridgeRef.current) return;
      if (isGraphConnectMode) return;
      if (isLineMode) return;
      if (isPadletTarget(event.target)) return;

      const interactiveTarget = findBackLineInteractiveTargetAtPoint(event.clientX, event.clientY);
      if (!interactiveTarget) return;

      event.preventDefault();
      event.stopPropagation();

      isDispatchingFreeformBackLineBridgeRef.current = true;
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
        isDispatchingFreeformBackLineBridgeRef.current = false;
      }
    },
    [isGraphConnectMode, isLineMode, isPadletTarget, findBackLineInteractiveTargetAtPoint],
  );

  const handleFreeformBackLineBridgeContextMenuCapture = React.useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      if (isDispatchingFreeformBackLineBridgeRef.current) return;
      if (isGraphConnectMode) return;
      if (isPadletTarget(event.target)) return;

      const interactiveTarget = findBackLineInteractiveTargetAtPoint(event.clientX, event.clientY);
      if (!interactiveTarget) return;

      bridgedBackLineInteractiveTargetRef.current = null;
      event.preventDefault();
      event.stopPropagation();

      isDispatchingFreeformBackLineBridgeRef.current = true;
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
        isDispatchingFreeformBackLineBridgeRef.current = false;
      }
    },
    [isGraphConnectMode, isPadletTarget, findBackLineInteractiveTargetAtPoint],
  );
  // ── end Freeform back-line bridge ───────────────────────────────────────────

  return (
    <>
      <div
        data-freeform-world-layer="posts"
        className="absolute inset-0 transform-origin-top-left"
        style={{
          // PATCH 9V.2A: remains logical world (0,0), now positioned after
          // both the camera gutter and the signed-stage negative lead-in.
          // CanvasClient's back/front Line planes use these identical values.
          left: worldOriginLeft,
          top: worldOriginTop,
          width: FREEFORM_WORLD_WIDTH_PX,
          height: FREEFORM_WORLD_HEIGHT_PX,
          transform: `scale(${canvasZoom})`,
          transformOrigin: '0 0'
        }}
        onMouseDownCapture={handleFreeformBackLineBridgeMouseDownCapture}
        onClickCapture={handleFreeformBackLineBridgeClickCapture}
        onDoubleClickCapture={handleFreeformBackLineBridgeDoubleClickCapture}
        onContextMenuCapture={handleFreeformBackLineBridgeContextMenuCapture}
      >
      {/* PATCH SECTION-H1: Section Headings own their entire presentation,
          so they are routed to their dedicated renderer INSTEAD of the
          generic post card below -- not layered on top of it. Splitting the
          list here (rather than branching inside the generic body) is what
          keeps them free of Note chrome, comment badges, the graph-connect
          mousedown branch, and Group-into-Column targets, without touching
          any existing type's rendering. */}
      {rootPadlets.filter(padlet => isSectionHeading(padlet)).map(padlet => (
        <SectionHeadingPost
          key={padlet.id}
          padlet={padlet}
          isSelected={isPadletSelected(padlet.id)}
          canEdit={canUseFreeformEditButton}
          isDraggingThis={draggingPadletId === padlet.id}
          onMouseDownCapture={handlePadletMouseDown}
          onCommitText={(padletId, nextText) => { void updatePadletTitle(padletId, nextText); }}
          onContextMenu={handleSectionHeadingContextMenu}
          clientToWorld={getWorldPointFromClient}
          worldBounds={FREEFORM_SECTION_HEADING_WORLD_BOUNDS}
          // PATCH SECTION-H2 Phase 20: a heading inside a multi-selection
          // keeps group drag but drops its own width handles, so the two
          // interaction models can never fight over the same pointer.
          canResize={selectedPadletIds.length <= 1}
          onResizePreview={previewSectionHeadingRect}
          onResizeCommit={commitSectionHeadingRect}
        />
      ))}

      {sectionHeadingContextMenu && (
        <SectionHeadingContextMenu
          isOpen
          position={{ x: sectionHeadingContextMenu.x, y: sectionHeadingContextMenu.y }}
          padlet={padlets.find((p) => p.id === sectionHeadingContextMenu.padletId) ?? null}
          onClose={() => setSectionHeadingContextMenu(null)}
          onCopy={() => copyPadlet(sectionHeadingContextMenu.padletId)}
          onPaste={handlePaste}
          onDelete={() => requestDeletePadlet(sectionHeadingContextMenu.padletId)}
          onBringToFront={() => movePadletLayer(sectionHeadingContextMenu.padletId, 'bringToFront')}
          onSendToBack={() => movePadletLayer(sectionHeadingContextMenu.padletId, 'sendToBack')}
        />
      )}

      {rootPadlets.filter(padlet => !isSectionHeading(padlet)).map(padlet => (
    <div
      key={padlet.id}
      data-padlet-id={padlet.id}
      className="absolute"
      onMouseDownCapture={(e) => {
        // CommentPopup is an interaction island. The padlet drag handler runs
        // in capture phase, so the panel must be excluded here before the
        // drag system sees typing, selection, or button interaction.
        if ((e.target as HTMLElement).closest('[data-comment-panel="true"]')) {
          return;
        }
        if (isFreeformGraphMode && isGraphConnectMode) {
          const side = getClickedSide(e);
          setSelectedPadletId(padlet.id);
          setGraphConnectSelection({ id: padlet.id, side, nonce: Date.now() });
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Route all padlet types through the mouse-based drag system.
        // Fires in capture phase so child stopPropagation cannot block it.
        handlePadletMouseDown(e, padlet.id);
      }}
      style={{
        left: padlet.position_x || 0,
        top: padlet.position_y || 0,
        cursor: canUseFreeformEditButton
          ? (isDragging && draggingPadletId === padlet.id ? 'grabbing' : 'grab')
          : 'default',
        // Containers (and anything else "brought to front" on click/create)
        // store zIndex as Date.now() -- an epoch-ms number in the trillions --
        // so a fixed bump like 10000 can never actually win against one.
        // MAX_SAFE_INTEGER guarantees whatever's being dragged renders above
        // every other stored zIndex, no matter which convention set it.
        zIndex: draggingPadletId === padlet.id ? Number.MAX_SAFE_INTEGER : ((padlet.metadata as any)?.zIndex || 1),
      }}
    >                {/* Comment Badge - positioned on outer container so not clipped */}
      {(() => {
        // Skip badge rendering for comment/image/link/todo/table/card-type padlets (they handle their own badges)
        if (padlet.type === 'comment' || (padlet.type as string) === 'Comment' || padlet.type === 'image' || padlet.type === 'link' || padlet.type === 'todo' || padlet.type === 'table' || padlet.type === 'card') return null;

        // Get comments count - check metadata and also content for tables
        let commentCount = (padlet.metadata?.detachedComments?.length || 0) + (padlet.metadata?.comments?.length || 0);
        let commentsFromContent: any[] = [];
        let badgeColor = padlet.metadata?.badgeColor || '#facc15';

        // For tables, comments are stored in content JSON
        if ((padlet.type as string) === 'table' && padlet.content) {
          try {
            const tableData = JSON.parse(padlet.content);
            if (tableData.comments && tableData.comments.length > 0) {
              commentsFromContent = tableData.comments;
              commentCount += tableData.comments.length;
              // Use the color from the first comment in content for badge
              badgeColor = tableData.comments[0]?.color || badgeColor;
            }
          } catch { /* ignore parse errors */ }
        }

        if (commentCount === 0) return null;

        return (
          <button
            className="absolute -top-2 -right-2 z-30 w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all"
            style={{ backgroundColor: badgeColor }}
            title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              setDetachedPopupPosition({
                x: rect.right + 10,
                y: rect.top,
              });
              setDetachedPopupPadletId(padlet.id);
              setDetachedBadgeColorOpen(false);
              // For tables, use comments from content; for others, use metadata
              const commentsToShow = commentsFromContent.length > 0
                ? commentsFromContent
                : (padlet.metadata?.comments || padlet.metadata?.detachedComments || []);
              setDetachedPopupComments(commentsToShow);
              setDetachedPopupOpen(true);
            }}
          >
            {commentCount}
          </button>
        );
      })()}
      {/* Red Bell Reminder Indicator for passed due reminders on todo padlets */}
      {padlet.type === 'todo' && padlet.metadata?.tasks && (() => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // Find tasks with due dates that are due today or overdue
        const dueTasks = padlet.metadata.tasks.filter((task: { dueDate?: string; dueTime?: string; reminder?: string; completed: boolean }) => {
          if (!task.dueDate || task.completed) return false;
          const dueDateTime = new Date(task.dueDate);
          const dueDay = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
          return dueDay <= today; // Due today or overdue
        });

        return dueTasks.length > 0 ? (
          <button
            className="absolute -right-2 z-30 w-5 h-5 rounded-full bg-red-500 border-2 border-white shadow-md flex items-center justify-center cursor-pointer hover:bg-red-600 transition-colors"
            style={{
              top: ((padlet.metadata?.detachedComments?.length || 0) + (padlet.metadata?.comments?.length || 0)) > 0 ? '20px' : '-8px'
            }}
            title={`${dueTasks.length} task${dueTasks.length > 1 ? 's' : ''} due`}
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.target as HTMLElement).getBoundingClientRect();
              setReminderPopupPosition({ x: rect.right + 10, y: rect.top });

              // Prepare task data for popup
              const tasksWithDueInfo = dueTasks.map((task: any) => {
                const dueDateTime = new Date(task.dueDate);
                const dueDay = new Date(dueDateTime.getFullYear(), dueDateTime.getMonth(), dueDateTime.getDate());
                return {
                  id: task.id,
                  text: task.text,
                  dueDate: task.dueDate,
                  dueTime: task.dueTime,
                  isOverdue: dueDay < today,
                };
              });

              setReminderPopupTasks(tasksWithDueInfo);
              setReminderPopupPadletId(padlet.id);
              setReminderPopupOpen(true);
            }}
          >
            <Bell className="w-3 h-3 text-white" />
          </button>
        ) : null;

      })()}

      {/* Render Image Padlet */}
      {padlet.type === 'image' && (
        <ImagePostContextMenu
          padlet={padlet}
          onSelect={() => setSelectedPadletId(padlet.id)}
          disabled={!canUseFreeformEditButton}
          onEdit={() => openFreeformPadletModal(padlet)}
          onDuplicate={() => duplicatePadlet(padlet.id)}
          onAddToLibrary={() => addPadletToLibrary(padlet.id)}
          onDelete={() => requestDeletePadlet(padlet.id)}
          onCut={() => cutPadlet(padlet.id)}
          onCopy={() => copyPadlet(padlet.id)}
          onLock={() => lockPadlet(padlet.id)}
          onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
          onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}
          onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}
          onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
          onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}
          groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}
          onReplaceImage={() => replaceImage(padlet.id)}
          onDownloadImage={() => downloadImage(padlet.id)}
          onToggleCropToGrid={() => toggleCropToGrid(padlet.id)}
          onToggleFullView={() => toggleFullView(padlet.id)}
        >
          <div className="relative group/image-container">
            {/* Side Toolbar - Only shown when toolbar is explicitly opened via â‹® button */}
            {false && imageToolbarPadletId === padlet.id && !isDrawingMode && !isImageColorPickerOpen && (
              <div
                className="absolute right-full top-0 mr-3 animate-in fade-in slide-in-from-right-2 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <ImageActionsToolbar
                  currentCardColor={padlet.metadata?.cardColor || '#ffffff'}
                  commentCount={padlet.metadata?.detachedComments?.length || 0}
                  commentBadgeColor={padlet.metadata?.badgeColor || '#facc15'}
                  onColorClick={() => {
                    const nextOpen = !isImageColorPickerOpen;
                    setIsImageColorPickerOpen(nextOpen);
                    if (nextOpen) {
                      setIsImageEmojiOpen(false);
                      if (cardCommentPopupPadletId === padlet.id) {
                        setCardCommentPopupPadletId(null);
                        setCommentColorPopupId(null);
                      }
                      if (textStylePadletId === padlet.id) setTextStylePadletId(null);
                      if (captionPopupPadletId === padlet.id) setCaptionPopupPadletId(null);
                      if (imageToolbarPadletId === padlet.id) setImageToolbarPadletId(null);
                    }
                  }}
                  isColorPickerOpen={isImageColorPickerOpen}
                  isDrawingMode={isDrawingMode}
                  isCaptionMode={captionPopupPadletId === padlet.id}
                  isTextStyleMode={textStylePadletId === padlet.id}
                  onCardColor={async (color) => {
                    try {
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: { ...padlet.metadata, cardColor: color },
                        updated_at: new Date().toISOString(),
                      });
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update card color:', err);
                    }
                  }}
                  onTopStrip={async (color) => {
                    try {
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: { ...(padlet.metadata || {}), topStrip: color },
                        updated_at: new Date().toISOString(),
                      });
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update top strip:', err);
                    }
                  }}
                  onCaptionTextColor={async (color) => {
                    try {
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: { ...padlet.metadata, captionStyle: { ...padlet.metadata?.captionStyle, color } },
                        updated_at: new Date().toISOString(),
                      });
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update caption text color:', err);
                    }
                  }}
                  currentTopStrip={padlet.metadata?.topStrip || 'transparent'}
                  currentCaptionTextColor={padlet.metadata?.captionStyle?.color || '#1F2937'}
                  onCaption={() => {
                    const isOpening = captionPopupPadletId !== padlet.id;
                    setCaptionPopupPadletId(isOpening ? padlet.id : null);
                    // Removing the automatic closure of text style popup
                    if (isOpening) {
                      // ?? not || -- an explicitly cleared caption is "" (falsy
                      // but not unset), and must stay blank rather than
                      // resurrecting the photographer attribution default.
                      const initialValue = padlet.metadata?.caption ?? (padlet.metadata?.photographer ? `Photo by ${padlet.metadata.photographer}` : '');
                      setEditingCaption(initialValue);
                    }
                    if (isOpening) {
                      setIsImageColorPickerOpen(false);
                      setIsImageEmojiOpen(false);
                      if (cardCommentPopupPadletId === padlet.id) {
                        setCardCommentPopupPadletId(null);
                        setCommentColorPopupId(null);
                      }
                      if (imageToolbarPadletId === padlet.id) setImageToolbarPadletId(null);
                    }
                  }}
                  onTextStyle={() => {
                    const isOpening = textStylePadletId !== padlet.id;
                    setTextStylePadletId(isOpening ? padlet.id : null);
                    // Ensure caption editor is also open if opening style menu
                    if (isOpening && captionPopupPadletId !== padlet.id) {
                      setCaptionPopupPadletId(padlet.id);
                      const initialValue = padlet.metadata?.caption ?? (padlet.metadata?.photographer ? `Photo by ${padlet.metadata.photographer}` : '');
                      setEditingCaption(initialValue);
                    }
                    if (isOpening) {
                      setIsImageColorPickerOpen(false);
                      setIsImageEmojiOpen(false);
                      if (cardCommentPopupPadletId === padlet.id) {
                        setCardCommentPopupPadletId(null);
                        setCommentColorPopupId(null);
                      }
                      if (imageToolbarPadletId === padlet.id) setImageToolbarPadletId(null);
                    }
                  }}
                  onSelectColor={async (color) => {
                    try {
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: {
                          ...padlet.metadata,
                          captionStyle: { ...padlet.metadata?.captionStyle, color }
                        },
                        updated_at: new Date().toISOString(),
                      });
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update caption color:', err);
                    }
                  }}
                  onSelectHighlight={async (highlight) => {
                    try {
                      await updatePostFieldsPreservingFailureChannels(padlet.id, {
                        metadata: {
                          ...padlet.metadata,
                          captionStyle: { ...padlet.metadata?.captionStyle, backgroundColor: highlight }
                        },
                        updated_at: new Date().toISOString(),
                      });
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update caption highlight:', err);
                    }
                  }}
                  currentColor={padlet.metadata?.captionStyle?.color}
                  currentHighlight={padlet.metadata?.captionStyle?.backgroundColor}
                  onEditImage={() => {
                    openFreeformImageEditModal(padlet);
                  }}
                  onDrawOnTop={() => {
                    closeAllToolbars();
                    setDrawingPadlet(padlet);
                    setIsDrawingMode(true);
                  }}
                  onAddReaction={() => {
                    const nextOpen = !isImageEmojiOpen;
                    setIsImageEmojiOpen(nextOpen);
                    if (nextOpen) {
                      setIsImageColorPickerOpen(false);
                      if (cardCommentPopupPadletId === padlet.id) {
                        setCardCommentPopupPadletId(null);
                        setCommentColorPopupId(null);
                      }
                      if (textStylePadletId === padlet.id) setTextStylePadletId(null);
                      if (captionPopupPadletId === padlet.id) setCaptionPopupPadletId(null);
                      if (imageToolbarPadletId === padlet.id) setImageToolbarPadletId(null);
                    }
                  }}
                  onComment={() => {
                    const commentsToShow = padlet.metadata?.detachedComments || [];
                    setCardCommentList(commentsToShow);
                    setCardCommentPopupPadletId(padlet.id);
                    setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                    setEditingCardCommentId(null);
                    setEditingCardCommentText('');
                    setIsImageEmojiOpen(false);
                    setIsImageColorPickerOpen(false);
                    if (textStylePadletId === padlet.id) setTextStylePadletId(null);
                    if (captionPopupPadletId === padlet.id) setCaptionPopupPadletId(null);
                    if (imageToolbarPadletId === padlet.id) setImageToolbarPadletId(null);
                  }}
                />

              </div>
            )}
            {/* Reaction Picker - Positioned to the right of the image card */}
            {isPadletSelected(padlet.id) && isImageEmojiOpen && (
              <div
                className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in zoom-in duration-200 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div>
                  <EmojiReactionPicker
                    isOpen={isImageEmojiOpen}
                    onOpenChange={setIsImageEmojiOpen}
                    onSelectEmoji={async (emoji) => {
                      try {
                        const currentReactions = padlet.metadata?.reactions || [];
                        const newReactions = [...currentReactions, emoji];
                        await updatePostFieldsPreservingFailureChannels(padlet.id, {
                          metadata: { ...padlet.metadata, reactions: newReactions },
                          updated_at: new Date().toISOString(),
                        });
                        setIsImageEmojiOpen(false);
                        fetchData();
                      } catch (err) {
                        console.error('Failed to add reaction:', err);
                      }
                    }}
                    inline
                  />
                </div>
              </div>
            )}

            {/* Comment Badge */}
            {(() => {
              const commentCount = padlet.metadata?.detachedComments?.length || 0;
              if (commentCount === 0) return null;
              const badgeColor = padlet.metadata?.badgeColor || '#facc15';
              return (
                <button
                  className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
                  style={{ backgroundColor: badgeColor }}
                  title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const commentsToShow = padlet.metadata?.detachedComments || [];
                    if (cardCommentPopupPadletId === padlet.id) {
                      setCardCommentPopupPadletId(null);
                      setActiveCardCommentId(null);
                      setEditingCardCommentId(null);
                      setEditingCardCommentText('');
                      setNoteBadgeColorPadletId(null);
                      return;
                    }
                    setCardCommentList(commentsToShow);
                    setCardCommentPopupPadletId(padlet.id);
                    setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                    setEditingCardCommentId(null);
                    setEditingCardCommentText('');
                    setNoteBadgeColorPadletId(null);
                  }}
                >
                  {commentCount}
                </button>
              );
            })()}

            {cardCommentPopupPadletId === padlet.id && !imageToolbarPadletId && (
              <div
                className="absolute left-full top-0 ml-3 z-[1100] pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <CommentPopup
                  isOpen
                  onOpenChange={(open) => {
                    if (!open) setCardCommentPopupPadletId(null);
                  }}
                  commentTitle={typeof padlet.metadata?.commentTitle === 'string' ? padlet.metadata.commentTitle : undefined}
                  commentTitleStyle={padlet.metadata?.commentTitleStyle}
                  onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updatePadletMetadata(padlet.id, { commentTitle: title === 'Comments' ? undefined : title }))}
                  onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updatePadletMetadata(padlet.id, { commentTitleStyle: style }))}
                  onBadgeColorChange={guardCommentMutation(commentAccessMode, (color) => updatePadletMetadata(padlet.id, { badgeColor: color }))}
                  badgeColor={padlet.metadata?.badgeColor || '#facc15'}
                  onSubmit={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardCommentComposition(commentAccessMode, (commentText: string) =>
                          commentModeMutations.submitOwnComment(padlet.id, commentText)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentText) => {
                    const currentComments = padlet.metadata?.detachedComments || [];
                    const newComment = {
                      id: `comment-${Date.now()}`,
                      text: commentText,
                      userId: user?.id || 'anon',
                      userName: user?.email?.split('@')[0] || 'You',
                      timestamp: Date.now(),
                    };
                    const nextComments = [...currentComments, newComment];
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onEditComment={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string, text: string) =>
                          commentModeMutations.editOwnComment(padlet.id, commentId, text)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId, text) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, text } : comment
                    );
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onRemoveComment={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string) =>
                          commentModeMutations.removeOwnComment(padlet.id, commentId)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId) => {
                    const nextComments = cardCommentList.filter((comment: any) => comment.id !== commentId);
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onToggleCommentStrikethrough={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string) => {
                          const target = cardCommentList.find((c: any) => c.id === commentId);
                          commentModeMutations.toggleOwnCommentStrikethrough(padlet.id, commentId, !target?.isStrikethrough);
                        })
                      : guardCommentMutation(commentAccessMode, async (commentId) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                    );
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onCommentColor={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string, textColor?: string, backgroundColor?: string) =>
                          commentModeMutations.setOwnCommentColor(padlet.id, commentId, textColor, backgroundColor)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                    );
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  enableCanonicalSelectionStyling
                  accessMode={commentAccessMode}
                  comments={cardCommentList}
                  currentUserId={user?.id || 'anon'}
                  currentUserName={user?.email?.split('@')[0] || 'You'}
                />
              </div>
            )}

            <div
              key={padlet.id}
              className={`overflow-hidden flex flex-col bg-white group relative transition-all ${(padlet.metadata as any)?.fullView ? '' : 'border border-gray-200'} ${isPadletSelected(padlet.id) ? 'ring-2 ring-blue-500' : ''
                }`}
              style={{
                width: '360px',
                backgroundColor: padlet.metadata?.cardColor || '#ffffff',
                zIndex: isPadletSelected(padlet.id) ? 1000 : ((padlet.metadata as any)?.zIndex || 100),
              }}
              onPointerDownCapture={(e) => {
                if (isImageColorPickerOpen && isPadletSelected(padlet.id)) {
                  e.stopPropagation();
                }
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                // Don't call custom drag handler - we use native drag now
                if (isLineMode) return;
              }}
              onClick={(e) => {
                e.stopPropagation();
                // Select the image (blue ring for delete) but DON'T show toolbar
                if (!isDragging) {
                  closeAllToolbars(); // Ensure all other tools (lines) are closed
                  setSelectedPadletId(padlet.id);
                }
              }}
            >
              {/* Top Strip — title centered, pencil right (same layout as
                  the Note/Todo/Table strip below: nothing shown until a
                  real title is set, editable in place via double-click).
                  Hidden entirely in Full view -- no frame, no title. */}
              {!(padlet.metadata as any)?.fullView && (
              <div
                className="w-full flex-shrink-0 grid items-center px-1.5"
                style={{
                  gridTemplateColumns: 'auto 1fr auto',
                  minHeight: '22px',
                  backgroundColor: isStripVisible(padlet.metadata?.topStrip) ? padlet.metadata?.topStrip : 'rgba(0,0,0,0.04)',
                }}
              >
                <div />
                <div className="flex items-center justify-center min-w-0">
                  {(() => {
                    // Full title style (heading/size, bold, italic,
                    // underline, strikethrough, align, color) -- not just
                    // color -- matching the Text style panel exactly.
                    const fallbackTitleColor = isStripVisible(padlet.metadata?.topStrip) ? contrastIconColor(padlet.metadata?.topStrip as string) : '#374151';
                    const titleTextStyle = resolvePadletTitleStyle(padlet, fallbackTitleColor);
                    return editingNoteTitleId === padlet.id ? (
                      <input
                        type="text"
                        value={noteTitleDraft}
                        onChange={(e) => setNoteTitleDraft(e.target.value)}
                        onBlur={() => {
                          setEditingNoteTitleId(null);
                          updatePadletTitle(padlet.id, noteTitleDraft.trim());
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.currentTarget.blur();
                          if (e.key === 'Escape') setEditingNoteTitleId(null);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                        data-no-drag="true"
                        placeholder="Post name"
                        className="text-xs font-semibold text-center bg-transparent border-b border-blue-400 outline-none px-0 py-0 w-full placeholder:opacity-40"
                        style={titleTextStyle}
                        autoFocus
                      />
                    ) : (() => {
                      const imageTitle = getMeaningfulTitle(padlet.title, padlet.type);
                      return (
                        <span
                          className="block w-full text-xs font-semibold text-center truncate cursor-pointer"
                          style={titleTextStyle}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingNoteTitleId(padlet.id);
                            setNoteTitleDraft(imageTitle);
                          }}
                          title="Double-click to add a title"
                        >
                          {imageTitle}
                        </span>
                      );
                    })();
                  })()}
                </div>
                {canUseFreeformEditButton && (
                  <button
                    data-no-drag="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      const willOpen = imageToolbarPadletId !== padlet.id;
                      closeAllToolbars(willOpen ? { imageToolbar: true } : undefined);
                      setImageToolbarPadletId(willOpen ? padlet.id : null);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-opacity opacity-0 group-hover:opacity-100"
                    style={{ color: isStripVisible(padlet.metadata?.topStrip) ? contrastIconColor(padlet.metadata?.topStrip as string) : '#9ca3af' }}
                    title="Edit"
                  >
                    <Edit2 size={12} />
                  </button>
                )}
              </div>
              )}

              {/* Lock indicator - bottom-right, visible on hover only when locked */}
              {(padlet.metadata as any)?.isLocked && (
                <div
                  className="absolute bottom-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity"
                  title="Position Locked"
                >
                  <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17a2 2 0 002-2v-2a2 2 0 10-4 0v2a2 2 0 002 2zm6-7V8A6 6 0 006 8v2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8 8a4 4 0 118 0v2H8V8z" />
                  </svg>
                </div>
              )}

              <div
                className={[
                  "relative overflow-hidden bg-gray-50 flex items-center justify-center min-h-[100px]",
                  padlet.metadata?.source === 'import' && padlet.metadata?.importOpenUrl ? "cursor-pointer" : "",
                ].join(" ")}
                onClick={() => {
                  if (isLineMode || isGraphConnectMode) return;
                  if (padlet.metadata?.source === 'import' && padlet.metadata?.importOpenUrl) {
                    window.open(padlet.metadata.importOpenUrl, '_blank', 'noopener,noreferrer');
                  }
                }}
                title={padlet.metadata?.source === 'import' ? `Open in ${padlet.metadata?.importProvider === 'google-drive' ? 'Google Drive' : 'OneDrive'}` : undefined}
              >
                <img
                  src={padlet.metadata?.drawing || padlet.metadata?.imageUrl}
                  alt={padlet.metadata?.caption || 'Image'}
                  className={(padlet.metadata as any)?.cropToGrid === true
                    ? "w-full object-cover pointer-events-none select-none"
                    : "w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"}
                  style={(padlet.metadata as any)?.cropToGrid === true
                    ? { height: `${IMAGE_CROP_TO_GRID_HEIGHT_PX}px` }
                    : undefined}
                />
                {padlet.metadata?.source === 'import' && (
                  <div className="absolute bottom-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-white font-medium">
                      {padlet.metadata?.importProvider === 'google-drive' ? 'Google Drive' : 'OneDrive'}
                    </span>
                  </div>
                )}
              </div>

              {/* Reactions Row - Lower left, above caption */}
              {((padlet.metadata?.reactions?.length ?? 0) > 0 || isPadletSelected(padlet.id)) && (
                <div className="flex items-center gap-1.5 px-3 py-1.5">
                  <ReactionDisplay
                    reactions={padlet.metadata?.reactions || []}
                    onAddClick={() => {
                      setSelectedPadletId(padlet.id);
                      setIsImageEmojiOpen(true);
                    }}
                    onReactionClick={async (emoji) => {
                      try {
                        const currentReactions = padlet.metadata?.reactions || [];
                        // Implement toggle-to-delete: find first occurrence and remove it
                        const indexToRemove = currentReactions.indexOf(emoji);
                        if (indexToRemove === -1) return;

                        const newReactions = [
                          ...currentReactions.slice(0, indexToRemove),
                          ...currentReactions.slice(indexToRemove + 1)
                        ];

                        await updatePostFieldsPreservingFailureChannels(padlet.id, {
                          metadata: { ...padlet.metadata, reactions: newReactions },
                          updated_at: new Date().toISOString(),
                        });
                        fetchData();
                      } catch (err) {
                        console.error('Failed to remove reaction:', err);
                      }
                    }}
                  />
                </div>
              )}


              {/* Footer Info / Display-only/Edit caption section */}
              <InlineCaption
                value={(captionPopupPadletId === padlet.id || textStylePadletId === padlet.id) && !imageToolbarPadletId
                  ? editingCaption
                  : (padlet.metadata?.caption ?? (padlet.metadata?.photographer ? `Photo by ${padlet.metadata.photographer}` : ""))}
                isEditing={(captionPopupPadletId === padlet.id || textStylePadletId === padlet.id) && !imageToolbarPadletId}
                color={padlet.metadata?.captionStyle?.color}
                backgroundColor={padlet.metadata?.captionStyle?.backgroundColor}
                textStyle={(() => {
                  const resolved = resolveCaptionStyle(padlet.metadata?.captionStyle);
                  return {
                    fontSize: resolved.fontSize,
                    fontWeight: resolved.fontWeight,
                    fontStyle: resolved.fontStyle,
                    fontFamily: resolved.fontFamily,
                    lineHeight: resolved.lineHeight,
                    textDecoration: resolved.textDecoration,
                    textAlign: resolved.textAlign,
                  };
                })()}
                onChange={(next) => setEditingCaption(next)}
                onCommit={async () => {
                  try {
                    await updatePostFieldsPreservingFailureChannels(padlet.id, {
                      metadata: { ...padlet.metadata, caption: editingCaption },
                      updated_at: new Date().toISOString(),
                    });
                    fetchData();
                  } catch (err) {
                    console.error('Save failed on commit:', err);
                  }
                }}
              />

            </div>



            {/* Text Style Popup - Positioned to the right */}
            {textStylePadletId === padlet.id && !imageToolbarPadletId && (
              <div className="absolute left-full top-0 ml-3 z-[70] animate-in fade-in zoom-in duration-200">
              <div
                className="relative bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setTextStylePadletId(null)}
                  className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <TextStylePopup
                  isOpen={true}
                  onOpenChange={(open) => !open && setTextStylePadletId(null)}
                  onSelectHeading={(level) => {
                    const baseStyle = padlet.metadata?.captionStyle || {};
                    const nextStyle = (() => {
                      switch (level) {
                        case 'h1':
                          return {
                            ...baseStyle,
                            heading: 'h1',
                            fontSize: '18px',
                            fontWeight: '700',
                            fontStyle: 'normal',
                            fontFamily: undefined,
                            lineHeight: '1.3'
                          };
                        case 'h2':
                          return {
                            ...baseStyle,
                            heading: 'h2',
                            fontSize: '16px',
                            fontWeight: '600',
                            fontStyle: 'normal',
                            fontFamily: undefined,
                            lineHeight: '1.35'
                          };
                        case 'small':
                          return {
                            ...baseStyle,
                            heading: 'small',
                            fontSize: '12px',
                            fontWeight: '400',
                            fontStyle: 'normal',
                            fontFamily: undefined,
                            lineHeight: '1.4'
                          };
                        case 'code':
                          return {
                            ...baseStyle,
                            heading: 'code',
                            fontSize: '13px',
                            fontWeight: '400',
                            fontStyle: 'normal',
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                            lineHeight: '1.4'
                          };
                        case 'quote':
                          return {
                            ...baseStyle,
                            heading: 'quote',
                            fontSize: '14px',
                            fontWeight: '400',
                            fontStyle: 'italic',
                            fontFamily: undefined,
                            lineHeight: '1.45'
                          };
                        case 'callout':
                          return {
                            ...baseStyle,
                            heading: 'callout',
                            fontSize: '14px',
                            fontWeight: '500',
                            fontStyle: 'normal',
                            fontFamily: undefined,
                            lineHeight: '1.4',
                            backgroundColor: baseStyle.backgroundColor || '#fef3c7'
                          };
                        case 'normal':
                        default:
                          return {
                            ...baseStyle,
                            heading: 'normal',
                            fontSize: '14px',
                            fontWeight: '400',
                            fontStyle: 'normal',
                            fontFamily: undefined,
                            lineHeight: '1.4'
                          };
                      }
                    })();

                    const nextMeta = {
                      ...(padlet.metadata || {}),
                      captionStyle: nextStyle
                    };

                    setPadlets((prev) =>
                      prev.map((p) => (p.id === padlet.id ? { ...p, metadata: nextMeta } : p))
                    );

                    commitPadletMeta(padlet.id, nextMeta);
                  }}
                  onSelectColor={async (color) => {
                    const nextMeta = {
                      ...(padlet.metadata || {}),
                      captionStyle: { ...(padlet.metadata?.captionStyle || {}), color }
                    };

                    setPadlets((prev) =>
                      prev.map((p) => (p.id === padlet.id ? { ...p, metadata: nextMeta } : p))
                    );

                    commitPadletMeta(padlet.id, nextMeta);
                  }}
                  onSelectHighlight={async (color) => {
                    const nextMeta = {
                      ...(padlet.metadata || {}),
                      captionStyle: { ...(padlet.metadata?.captionStyle || {}), backgroundColor: color }
                    };

                    setPadlets((prev) =>
                      prev.map((p) => (p.id === padlet.id ? { ...p, metadata: nextMeta } : p))
                    );

                    commitPadletMeta(padlet.id, nextMeta);
                  }}
                  currentHeading={padlet.metadata?.captionStyle?.heading || "normal"}
                  currentColor={padlet.metadata?.captionStyle?.color}
                  currentHighlight={padlet.metadata?.captionStyle?.backgroundColor}
                  hideCloseButton
                />
              </div>
              </div>
            )}

            {/* Card Color Popup - Positioned to the right */}
            {false && selectedPadletId === padlet.id && isImageColorPickerOpen && (
              <div
                className="absolute left-full top-0 ml-3 z-[70] animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="relative bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden w-[240px]">
                  <button
                    onClick={() => setIsImageColorPickerOpen(false)}
                    className="absolute top-2 right-2 -translate-y-1 translate-x-1 w-4 h-4 flex items-center justify-center rounded hover:bg-gray-100"
                    title="Close"
                  >
                    <X className="w-3 h-3 text-gray-400" />
                  </button>
                  <div className="p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Image Color</span>
                      <div className="flex bg-gray-100 p-1 rounded-lg gap-1">
                        <button
                          onClick={() => setImageColorTab('background')}
                          className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${imageColorTab === 'background'
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                            }`}
                          title="Background Color"
                        >
                          BG
                        </button>
                        <button
                          onClick={() => setImageColorTab('topstrip')}
                          className={`w-8 h-8 flex items-center justify-center text-xs font-bold rounded-md transition-all ${imageColorTab === 'topstrip'
                            ? "bg-white text-gray-900 shadow-sm"
                            : "text-gray-500 hover:text-gray-700"
                            }`}
                          title="Top Strip Color"
                        >
                          TS
                        </button>
                      </div>
                    </div>

                    <ColorPickerContent
                      color={imageColorTab === 'background' ? (padlet.metadata?.cardColor || '#ffffff') : (padlet.metadata?.topStrip || 'transparent')}
                      onChange={(color) => {
                        // 1) optimistic UI: update local state
                        setPadlets((prev) =>
                          prev.map((p) => {
                            if (p.id !== padlet.id) return p;

                            const nextMeta =
                              imageColorTab === "background"
                                ? { ...(p.metadata || {}), cardColor: color }
                                : { ...(p.metadata || {}), topStrip: color };

                            return { ...p, metadata: nextMeta };
                          })
                        );

                        // 2) debounced DB write (no fetchData!)
                        const nextMeta =
                          imageColorTab === "background"
                            ? { ...(padlet.metadata || {}), cardColor: color }
                            : { ...(padlet.metadata || {}), topStrip: color };

                        commitPadletMeta(padlet.id, nextMeta);
                      }}
                      hasOpacity={true}
                      presets={imageColorTab === 'background' ? BACKGROUND_COLORS : TOP_STRIP_COLORS}
                    />
                  </div>
                </div>
              </div>
            )}

          </div>
        </ImagePostContextMenu>
      )}

      {/* Render Card Padlet */}
      {/* Render Card Padlet */}
      {padlet.type === 'card' && (
        <NotePostContextMenu
          padlet={padlet}
          onSelect={() => setSelectedPadletId(padlet.id)}
          disabled={!canUseFreeformEditButton}
          onEdit={() => openFreeformPadletModal(padlet)}
          onDelete={() => requestDeletePadlet(padlet.id)}
          onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
          onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}
          onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}
          onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
          onLock={() => lockPadlet(padlet.id)}
          onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}
          onAddToLibrary={() => addPadletToLibrary(padlet.id)}
          onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}
          groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}
          onToggleFullView={(padlet.metadata as any)?.svgUrl ? () => toggleFullView(padlet.id) : undefined}
        >
          <div
            key={padlet.id}
            className={`absolute group cursor-pointer transition-colors duration-200 ${isPadletSelected(padlet.id)
              ? (isDocumentPost(padlet)
                // Follow-up correction: Document's own card is square-cornered
                // (Note-style); the selected-state ring must not reintroduce
                // Clipart's rounded corner here, and Note's own selected ring
                // uses ring-offset (no shadow) rather than shadow-xl.
                ? 'ring-2 ring-blue-500 ring-offset-2'
                : 'ring-2 ring-blue-500 rounded-lg shadow-xl')
              : 'hover:shadow-xl'
              }`}
            style={{
              width: padlet.width || 180,
              height: padlet.height || 220,
              zIndex: isPadletSelected(padlet.id) ? 20000 : ((padlet.metadata as any)?.zIndex || 100),
            }}
            onPointerDownCapture={(e) => {
              // When color panel is open, prevent pointer events from starting any drag
              if (isCardColorPickerOpen && padletToEdit?.id === padlet.id) {
                // Only stop propagation, don't prevent default (slider needs the event)
                e.stopPropagation();
              }
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              if (isLineMode) return;
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (!isDragging) {
                closeAllToolbars(); // Ensure lines and other tools are closed
                setSelectedPadletId(padlet.id);
              }
            }}
          >
            <CardPreview
              padlet={padlet}
              hideFrame={!!(padlet.metadata as any)?.fullView}
              onClick={() => {
                // Handled by parent div
              }}
              /* PATCH-152 targeted correction: a single Edit control, routed
                 through the same shared Clipart editor (ClipartCardDraftModal)
                 Columns/Grid already use via executePadletTypeEditor -- not
                 the two ad hoc systems (cardToolbarPadletId's local modal and
                 CardEditor) that previously produced two buttons here. */
              onOpenToolbar={canUseFreeformEditButton ? ((e) => {
                e.stopPropagation();
                const destination = selectDocumentModalDestination(padlet, canUseFreeformEditButton);
                if (destination) { requestOpenDocument(padlet, destination); return; }
                closeAllToolbars();
                setPadletToEdit(padlet);
                if (selectCardModalRoute(canUseFreeformEditButton) === 'editor') {
                  setIsClipartDraftModalOpen(true);
                } else {
                  setIsCardViewerOpen(true);
                }
              }) : undefined}
              onReadDocument={(() => {
                const d = selectDocumentModalDestination(padlet, canUseFreeformEditButton);
                return d ? () => requestOpenDocument(padlet, d) : undefined;
              })()}
              isSelected={isPadletSelected(padlet.id)}
              isCardView={padlet.metadata?.showCardView}
              reactions={padlet.metadata?.reactions || []}
              onAddReaction={() => {
                setSelectedPadletId(padlet.id);
                setIsImageEmojiOpen(true);
              }}
              onReactionClick={async (emoji) => {
                try {
                  const currentReactions = padlet.metadata?.reactions || [];
                  const indexToRemove = currentReactions.indexOf(emoji);
                  if (indexToRemove === -1) return;
                  const newReactions = [
                    ...currentReactions.slice(0, indexToRemove),
                    ...currentReactions.slice(indexToRemove + 1)
                  ];
                  await updatePadletMetadata(padlet.id, { reactions: newReactions });
                } catch (err) {
                  console.error('Failed to remove reaction:', err);
                }
              }}
            />

            {captionEditorPadletId === padlet.id && (
              <div
                className="absolute left-0 z-50 bg-white shadow-lg border border-blue-500 rounded p-1"
                style={{
                  top: '100%',
                  marginTop: 5,
                  width: padlet.width || 180,
                }}
              >
                <input
                  autoFocus
                  className="w-full text-xs p-1 outline-none"
                  value={editingCaption}
                  onChange={(e) => setEditingCaption(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updatePadletTitle(padlet.id, editingCaption);
                      setCaptionEditorPadletId(null);
                    }
                    if (e.key === 'Escape') {
                      setCaptionEditorPadletId(null);
                    }
                  }}
                  onBlur={() => {
                    updatePadletTitle(padlet.id, editingCaption);
                    setCaptionEditorPadletId(null);
                  }}
                />
              </div>
            )}

            {/* Right Color Picker - attached to card */}
            {isCardColorPickerOpen && padletToEdit?.id === padlet.id && !cardToolbarPadletId && (
              <div
                className="absolute left-full top-0 ml-3 z-50 animate-in fade-in slide-in-from-left-2 duration-200"
                onClick={(e) => e.stopPropagation()}
              >
                <CardColorPanel
                  iconColor={padlet.metadata?.iconBgColor}
                  bgColor={padlet.metadata?.backgroundColor}
                  topStrip={padlet.metadata?.topStripColor}
                  onClose={() => setIsCardColorPickerOpen(false)}
                  onChangeTarget={(target, value) => {
                    if (target === "icon") updatePadletMetadata(padlet.id, { iconBgColor: value });
                    if (target === "bg") updatePadletMetadata(padlet.id, { backgroundColor: value });
                    if (target === "ts") updatePadletMetadata(padlet.id, { topStripColor: value });
                  }}
                />
              </div>
            )}

            {/* Emoji Picker - Positioned to the right of the card */}
            {imageToolbarPadletId === padlet.id && (
              <div
                className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/35 backdrop-blur-sm"
                onClick={() => setImageToolbarPadletId(null)}
              >
                <div
                  className="relative h-[360px] w-[560px] rounded-xl border border-gray-200 bg-white shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => setImageToolbarPadletId(null)}
                    title="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {isPadletSelected(padlet.id) && isImageEmojiOpen && !cardToolbarPadletId && (
              <div className="absolute left-full top-0 ml-3 z-[70] animate-in fade-in zoom-in duration-200">
                <div>
                  <EmojiReactionPicker
                    isOpen={isImageEmojiOpen}
                    onOpenChange={setIsImageEmojiOpen}
                    onSelectEmoji={async (emoji) => {
                      try {
                        const currentReactions = padlet.metadata?.reactions || [];
                        const newReactions = [...currentReactions, emoji];
                        await updatePadletMetadata(padlet.id, { reactions: newReactions });
                        setIsImageEmojiOpen(false);
                      } catch (err) {
                        console.error('Failed to add reaction:', err);
                      }
                    }}
                    inline
                  />
                </div>
              </div>
            )}

            {/* Comment Badge */}
            {(() => {
              const commentCount = padlet.metadata?.detachedComments?.length || 0;
              if (commentCount === 0) return null;
              const badgeColor = padlet.metadata?.badgeColor || '#facc15';
              return (
                <button
                  className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
                  style={{ backgroundColor: badgeColor }}
                  title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    const commentsToShow = padlet.metadata?.detachedComments || [];
                    if (cardCommentPopupPadletId === padlet.id) {
                      setCardCommentPopupPadletId(null);
                      return;
                    }
                    setCardCommentList(commentsToShow);
                    setCardCommentPopupPadletId(padlet.id);
                  }}
                >
                  {commentCount}
                </button>
              );
            })()}

            {/* Card Comments Popup - Right side.
                PATCH 8E (COMMENT UI CONTRACT UNLOCK -- CLIPART SITE B):
                this on-canvas badge-triggered popup now renders through the
                exact same canonical component the Clipart edit modal
                (ClipartCardDraftModal.tsx) already uses for its Comments
                panel -- CommentPopup.tsx -- instead of a second, duplicated
                inline row/action implementation. Only the shell (position,
                anchoring) differs; the comment row/list behavior (per-row
                Edit/Color/Link/Strikethrough/Delete) is the identical
                component instance for both entry points. Storage wiring is
                unchanged: same metadata.detachedComments field, same
                optimistic cardCommentList mirror + updatePadletMetadata
                persistence pattern PATCH 8C already established for Site A. */}
            {cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId && (
              <div
                className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* CommentPopup's own row onClick (setActiveCommentId) does
                    not stop propagation -- inside the Clipart edit modal
                    that's harmless because the modal's own comments-panel
                    wrapper already stops click/mousedown propagation
                    (ClipartCardDraftModal.tsx). This on-canvas shell needs
                    the same guard: without it, a comment-row click bubbles
                    to the card's own onClick, which calls
                    closeAllToolbars() -- and that unconditionally resets
                    cardCommentPopupPadletId, closing this panel on every
                    row click. Caught live during PATCH 8E browser testing. */}
                <CommentPopup
                  isOpen
                  onOpenChange={(open) => {
                    if (!open) setCardCommentPopupPadletId(null);
                  }}
                  commentTitle={typeof padlet.metadata?.commentTitle === 'string' ? padlet.metadata.commentTitle : undefined}
                  commentTitleStyle={padlet.metadata?.commentTitleStyle}
                  onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updatePadletMetadata(padlet.id, { commentTitle: title === 'Comments' ? undefined : title }))}
                  onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updatePadletMetadata(padlet.id, { commentTitleStyle: style }))}
                  onSubmit={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardCommentComposition(commentAccessMode, (commentText: string) =>
                          commentModeMutations.submitOwnComment(padlet.id, commentText)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentText) => {
                    const newComment = {
                      id: `comment-${Date.now()}`,
                      text: commentText,
                      userId: user?.id || 'anon',
                      userName: user?.email?.split('@')[0] || 'You',
                      timestamp: Date.now(),
                    };
                    const nextComments = [...cardCommentList, newComment];
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onEditComment={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string, text: string) =>
                          commentModeMutations.editOwnComment(padlet.id, commentId, text)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId, text) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, text } : comment
                    );
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onRemoveComment={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string) =>
                          commentModeMutations.removeOwnComment(padlet.id, commentId)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId) => {
                    const nextComments = cardCommentList.filter((comment: any) => comment.id !== commentId);
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onToggleCommentStrikethrough={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string) => {
                          const target = cardCommentList.find((c: any) => c.id === commentId);
                          commentModeMutations.toggleOwnCommentStrikethrough(padlet.id, commentId, !target?.isStrikethrough);
                        })
                      : guardCommentMutation(commentAccessMode, async (commentId) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                    );
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onCommentColor={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string, textColor?: string, backgroundColor?: string) =>
                          commentModeMutations.setOwnCommentColor(padlet.id, commentId, textColor, backgroundColor)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                    );
                    await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  enableCanonicalSelectionStyling
                  accessMode={commentAccessMode}
                  comments={cardCommentList}
                  currentUserId={user?.id || 'anon'}
                  currentUserName={user?.email?.split('@')[0] || 'You'}
                />
              </div>
            )}

          </div>
        </NotePostContextMenu>
      )}

      {/* Render Standalone Comment Marker */}
      {(padlet.type === 'comment' || (padlet.type as string) === 'Comment') && (
        <CommentPostContextMenu
          padlet={padlet}
          onSelect={() => setSelectedPadletId(padlet.id)}
          disabled={!canUseFreeformEditButton}
          onEdit={() => openFreeformPadletModal(padlet)}
          onDuplicate={() => duplicatePadlet(padlet.id)}
          onAddToLibrary={() => addPadletToLibrary(padlet.id)}
          onDelete={() => requestDeletePadlet(padlet.id)}
          onCut={() => cutPadlet(padlet.id)}
          onCopy={() => copyPadlet(padlet.id)}
          onPaste={handlePaste}
          onRename={() => renameComment(padlet.id)}
          onLock={() => lockPadlet(padlet.id)}
          onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
          onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}
          onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}
          onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
        >
          {padlet.metadata?.isCollapsed ? (
            // Collapsed Marker - Pin with number inside
            <div className="relative">
              <div
                className={`relative cursor-pointer transition-transform hover:scale-110 flex flex-col items-center ${isPadletSelected(padlet.id) ? 'ring-2 ring-blue-500 ring-offset-2 rounded-lg' : ''}`}
                style={{ zIndex: (padlet.metadata as any)?.zIndex || 100 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedPadletId(padlet.id);
                  // Toggle the side popup
                  const nextOpen = collapsedPopupPadletId === padlet.id ? null : padlet.id;
                  setCollapsedPopupPadletId(nextOpen);
                  setCollapsedBadgeColorOpen(false);
                  if (nextOpen) {
                    const nextComments = padlet.metadata?.comments || [];
                    setCollapsedActiveCommentId(nextComments[nextComments.length - 1]?.id || null);
                    setCollapsedEditingCommentId(null);
                    setCollapsedEditingText('');
                    setCollapsedCommentColorPopupId(null);
                  }
                }}
                onMouseDown={(e) => {
                  if (isLineMode) return;
                  handlePadletMouseDown(e, padlet.id);
                }}
              >
                {/* Custom pin shape with number inside */}
                <div className="w-8 h-10 relative">
                  {/* Pin body */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center border-2 border-gray-400"
                    style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
                  >
                    <span className="text-sm font-bold text-gray-700">
                      {padlet.metadata?.comments?.length || 0}
                    </span>
                  </div>
                  {/* Pin pointer - triangle using CSS borders */}
                  <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[10px] border-l-transparent border-r-transparent border-t-gray-400" />
                </div>
              </div>

              {/* Side popup when marker is clicked */}
              {collapsedPopupPadletId === padlet.id && (
                <div
                  className="absolute left-full top-0 ml-3 z-50 bg-white rounded-xl shadow-xl p-4 w-80 border border-gray-200 animate-in fade-in zoom-in duration-200"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <button
                    className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                    onClick={() => {
                      setCollapsedPopupPadletId(null);
                      setCollapsedBadgeColorOpen(false);
                    }}
                    title="Close"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                      <h4 className="text-sm font-semibold text-gray-700">{padlet.metadata?.commentTitle || 'Comments'}</h4>
                      {commentAccessMode === 'manage' && (
                      <button
                        onClick={guardCommentMutation(commentAccessMode, () => setCollapsedBadgeColorOpen(!collapsedBadgeColorOpen))}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                        title="Badge Color"
                      >
                        <div
                          className="w-4 h-4 rounded border border-gray-300"
                          style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
                        />
                      </button>
                      )}
                    </div>

                    {collapsedBadgeColorOpen && (
                      <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                        <div className="grid grid-cols-6 gap-1.5">
                          {BADGE_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={guardCommentMutation(commentAccessMode, async () => {
                                await updatePadletMetadata(padlet.id, { badgeColor: color });
                                setCollapsedBadgeColorOpen(false);
                              })}
                              className={`rounded transition-transform hover:scale-110 ${(padlet.metadata?.badgeColor || '#facc15') === color ? 'ring-2 ring-blue-500' : ''}`}
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

                    {padlet.metadata?.comments?.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                    ) : (
                      <div className="flex gap-2 relative">
                        {collapsedCommentColorPopupId && (
                          <div
                            className="absolute right-full top-0 mr-3 z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            <TextStylePopup
                              isOpen={true}
                              onOpenChange={(open) => !open && setCollapsedCommentColorPopupId(null)}
                              onSelectHeading={() => { }}
                              hideHeadingSelect={true}
                              onSelectColor={guardCommentMutation(commentAccessMode, async (color) => {
                                const currentComments = padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((c: any) =>
                                  c.id === collapsedCommentColorPopupId ? { ...c, textColor: color, color } : c
                                );
                                await updatePadletMetadata(padlet.id, { comments: nextComments });
                              })}
                              onSelectHighlight={guardCommentMutation(commentAccessMode, async (color) => {
                                const currentComments = padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((c: any) =>
                                  c.id === collapsedCommentColorPopupId ? { ...c, backgroundColor: color } : c
                                );
                                await updatePadletMetadata(padlet.id, { comments: nextComments });
                              })}
                              currentHeading="normal"
                              currentColor={padlet.metadata?.comments?.find((c: any) => c.id === collapsedCommentColorPopupId)?.textColor || padlet.metadata?.comments?.find((c: any) => c.id === collapsedCommentColorPopupId)?.color}
                              currentHighlight={padlet.metadata?.comments?.find((c: any) => c.id === collapsedCommentColorPopupId)?.backgroundColor}
                            />
                          </div>
                        )}
                        <div className="flex-1 space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin">
                          {padlet.metadata?.comments?.map((comment: any) => {
                            const isActive = collapsedActiveCommentId === comment.id;
                            const isEditing = collapsedEditingCommentId === comment.id;
                            const commitEdit = async () => {
                              if (commentAccessMode !== 'manage') return;
                              const trimmed = collapsedEditingText.trim();
                              if (!trimmed) {
                                setCollapsedEditingCommentId(null);
                                setCollapsedEditingText('');
                                setCollapsedCommentColorPopupId(null);
                                return;
                              }
                              const currentComments = padlet.metadata?.comments || [];
                              const nextComments = currentComments.map((c: any) =>
                                c.id === comment.id ? { ...c, text: trimmed } : c
                              );
                              await updatePadletMetadata(padlet.id, { comments: nextComments });
                              setCollapsedEditingCommentId(null);
                              setCollapsedEditingText('');
                              setCollapsedCommentColorPopupId(null);
                            };

                            const startEdit = () => {
                              if (commentAccessMode !== 'manage') return;
                              setCollapsedEditingCommentId(comment.id);
                              setCollapsedEditingText(htmlToText(comment.text || ''));
                              setCollapsedCommentColorPopupId(null);
                            };

                            return (
                              <div
                                key={comment.id}
                                className={`flex gap-2 rounded py-0.5 px-0.5 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setCollapsedActiveCommentId(comment.id)}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  startEdit();
                                }}
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
                                    <span className="text-xs font-medium text-gray-700 truncate">{comment.userName}</span>
                                  </div>
                                  {isEditing ? (
                                    <textarea
                                      value={collapsedEditingText}
                                      onChange={(e) => setCollapsedEditingText(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          commitEdit();
                                        }
                                        if (e.key === 'Escape') {
                                          setCollapsedEditingCommentId(null);
                                          setCollapsedEditingText('');
                                          setCollapsedCommentColorPopupId(null);
                                        }
                                      }}
                                      onBlur={() => {
                                        if (collapsedCommentColorPopupId === comment.id) return;
                                        commitEdit();
                                      }}
                                      className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                      style={{
                                        color: comment.textColor || comment.color || '#4b5563',
                                        backgroundColor: comment.backgroundColor || undefined,
                                      }}
                                      rows={1}
                                      autoFocus
                                    />
                                  ) : (
                                    <div
                                      className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words [&_a]:text-blue-500 [&_a]:underline [&_a]:cursor-pointer ${comment.isStrikethrough ? 'line-through' : ''}`}
                                      style={{
                                        color: comment.textColor || comment.color,
                                        backgroundColor: comment.backgroundColor || undefined,
                                      }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => {
                                        if (handleSafeCommentLinkClick(e)) return;
                                        e.stopPropagation();
                                      }}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        startEdit();
                                      }}
                                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(comment.text) }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Row actions -- not rendered at all outside 'manage', same
                            "not rendered, not merely disabled" principle as the
                            expanded card (CommentPost.tsx). */}
                        {commentAccessMode === 'manage' && (
                        <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                          {collapsedEditingCommentId && collapsedActiveCommentId && collapsedEditingCommentId === collapsedActiveCommentId ? (
                            <button
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={guardCommentMutation(commentAccessMode, (event: React.MouseEvent) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setCollapsedCommentColorPopupId(collapsedCommentColorPopupId === collapsedActiveCommentId ? null : collapsedActiveCommentId);
                              })}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                              title="Color"
                              disabled={!collapsedActiveCommentId}
                            >
                              <Palette className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              onClick={guardCommentMutation(commentAccessMode, () => {
                                if (!collapsedActiveCommentId) return;
                                const current = padlet.metadata?.comments?.find((c: any) => c.id === collapsedActiveCommentId);
                                setCollapsedEditingCommentId(collapsedActiveCommentId);
                                setCollapsedEditingText(htmlToText(current?.text || ''));
                                setCollapsedCommentColorPopupId(null);
                              })}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
                              title="Edit"
                              disabled={!collapsedActiveCommentId}
                            >
                              <PenTool className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={guardCommentMutation(commentAccessMode, async () => {
                              if (!collapsedActiveCommentId) return;
                              const currentComments = padlet.metadata?.comments || [];
                              const nextComments = currentComments.map((c: any) =>
                                c.id === collapsedActiveCommentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                              );
                              await updatePadletMetadata(padlet.id, { comments: nextComments });
                            })}
                            className={`p-1 rounded transition-colors ${padlet.metadata?.comments?.find((c: any) => c.id === collapsedActiveCommentId)?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                            title="Strikethrough"
                            disabled={!collapsedActiveCommentId}
                          >
                            <Strikethrough className="w-3 h-3" />
                          </button>
                          <button
                            onClick={guardCommentMutation(commentAccessMode, async () => {
                              if (!collapsedActiveCommentId) return;
                              const currentComments = padlet.metadata?.comments || [];
                              const nextComments = currentComments.filter((c: any) => c.id !== collapsedActiveCommentId);
                              await updatePadletMetadata(padlet.id, { comments: nextComments });
                              setCollapsedActiveCommentId(null);
                              setCollapsedEditingCommentId(null);
                              setCollapsedEditingText('');
                              setCollapsedCommentColorPopupId(null);
                            })}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
                            title="Delete"
                            disabled={!collapsedActiveCommentId}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                        )}
                      </div>
                    )}

                    {/* Add comment input -- not rendered at all outside 'manage'. */}
                    {commentAccessMode === 'manage' && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <input
                        type="text"
                        placeholder="Add a comment..."
                        className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-100 outline-none"
                        onKeyDown={guardCommentMutation(commentAccessMode, async (e: React.KeyboardEvent<HTMLInputElement>) => {
                          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                            const inputElement = e.currentTarget;
                            const commentText = inputElement.value.trim();
                            const newComment = {
                              id: `comment-${Date.now()}`,
                              text: commentText,
                              userId: user?.id || 'anon',
                              userName: user?.email?.split('@')[0] || 'You',
                              timestamp: Date.now()
                            };
                            const currentComments = padlet.metadata?.comments || [];
                            inputElement.value = '';
                            await updatePadletMetadata(padlet.id, {
                              comments: [...currentComments, newComment]
                            });
                            setCollapsedActiveCommentId(newComment.id);
                          }
                        })}
                      />
                    </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Expanded Post
            <div
              className={`group cursor-pointer transition-all ${isPadletSelected(padlet.id) ? '' : 'hover:shadow-xl'} relative`}
              style={{
                width: padlet.width || 300,
                zIndex: (padlet.metadata as any)?.zIndex || 100,
              }}
            >
              <div className="relative">
                <CommentPost
                  comments={padlet.metadata?.comments || []}
                  cardColor={padlet.metadata?.cardColor || '#ffffff'}
                  badgeColor={padlet.metadata?.badgeColor || '#facc15'}
                  topStrip={padlet.metadata?.topStrip || 'transparent'}
                  commentTitle={padlet.metadata?.commentTitle || ''}
                  accessMode={commentAccessMode}
                  onTitleChange={guardCommentMutation(commentAccessMode, (title) => {
                    updatePadletMetadata(padlet.id, { commentTitle: title || undefined });
                  })}
                  selected={isPadletSelected(padlet.id)}
                  showMenu={true}
                  onMenuClick={() => {
                    closeAllToolbars();
                    setPadletToEdit(padlet);
                    setIsCommentEditorOpen(true);
                  }}
                  onAddComment={guardCommentMutation(commentAccessMode, async (text) => {
                    const newComment = {
                      id: `comment-${Date.now()}`,
                      text,
                      userId: user?.id || 'anon',
                      userName: user?.user_metadata?.name || user?.email?.split('@')[0] || 'Anonymous',
                      userAvatar: user?.user_metadata?.avatar_url,
                      timestamp: Date.now(),
                    };
                    const currentComments = padlet.metadata?.comments || [];
                    await updatePadletMetadata(padlet.id, {
                      comments: [...currentComments, newComment],
                    });
                  })}
                  onEditComment={guardCommentMutation(commentAccessMode, async (commentId, text) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.map((comment: any) =>
                      comment.id === commentId ? { ...comment, text } : comment
                    );
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  })}
                  onToggleCommentStrikethrough={guardCommentMutation(commentAccessMode, async (commentId) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.map((comment: any) =>
                      comment.id === commentId
                        ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                        : comment
                    );
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  })}
                  onDeleteComment={guardCommentMutation(commentAccessMode, async (commentId) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.filter((comment: any) => comment.id !== commentId);
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  })}
                  onUpdateCommentColor={guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.map((comment: any) =>
                      comment.id === commentId
                        ? {
                          ...comment,
                          ...(textColor !== undefined && { textColor, color: textColor }),
                          ...(backgroundColor !== undefined && { backgroundColor }),
                        }
                        : comment
                    );
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  })}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging) {
                      closeAllToolbars(); // Ensure all other tools (lines) are closed
                      setSelectedPadletId(padlet.id);
                    }
                  }}
                  onDoubleClick={canUseFreeformEditButton ? (e) => {
                    e.stopPropagation();
                    closeAllToolbars();
                    setSelectedPadletId(null);
                    setPadletToEdit(padlet);
                    setIsCommentEditorOpen(true);
                  } : undefined}
                  onEdit={canUseFreeformEditButton ? () => {
                    closeAllToolbars();
                    setPadletToEdit(padlet);
                    setIsCommentEditorOpen(true);
                  } : undefined}
                  onMouseDown={(e) => {
                    if (isLineMode) return;
                    handlePadletMouseDown(e, padlet.id);
                  }}
                  onBadgeClick={(e) => {
                    // Open the color popup for the internal badge
                    e.stopPropagation();
                    if (internalBadgeColorPopupId === padlet.id) {
                      setInternalBadgeColorPopupId(null);
                      setInternalBadgePopupPosition(null);
                    } else {
                      const badgeRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const container = (e.currentTarget as HTMLElement).closest('[data-comment-post-root]') as HTMLElement | null;
                      const menuButton = container?.querySelector('button[title="Edit"]') as HTMLElement | null;
                      const menuRect = menuButton?.getBoundingClientRect();
                      setInternalBadgeColorPopupId(padlet.id);
                      setInternalBadgePopupPosition({
                        x: menuRect ? menuRect.right : badgeRect.left + badgeRect.width / 2,
                        y: badgeRect.bottom,
                        alignRight: !!menuRect,
                      });
                      // Close other popups if needed
                      setCardCommentPopupPadletId(null);
                    }
                  }}
                />

                {/* Internal Badge Color Popup */}
                {internalBadgeColorPopupId === padlet.id && internalBadgePopupPosition && (
                  <div
                    className="fixed z-[1300] bg-white rounded-lg shadow-lg border border-gray-200 p-2"
                    style={{
                      left: internalBadgePopupPosition.x,
                      top: internalBadgePopupPosition.y + 8,
                      transform: internalBadgePopupPosition.alignRight ? 'translateX(-100%)' : 'translateX(-50%)',
                    }}
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <div className="grid grid-cols-6 gap-1.5">
                      {BADGE_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={guardCommentMutation(commentAccessMode, async () => {
                            await updatePadletMetadata(padlet.id, { badgeColor: color });
                            setInternalBadgeColorPopupId(null);
                            setInternalBadgePopupPosition(null);
                          })}
                          className={`rounded transition-transform hover:scale-110 ${(padlet.metadata?.badgeColor || '#facc15') === color ? 'ring-2 ring-blue-500' : ''}`}
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


              </div>

              {/* Lock indicator - bottom-right, visible on hover only when locked */}
              {(padlet.metadata as any)?.isLocked && (
                <div
                  className="absolute bottom-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity"
                  title="Position Locked"
                >
                  <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 17a2 2 0 002-2v-2a2 2 0 10-4 0v2a2 2 0 002 2zm6-7V8A6 6 0 006 8v2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8 8a4 4 0 118 0v2H8V8z" />
                  </svg>

                </div>
              )}

            </div>
          )}
        </CommentPostContextMenu>
      )}

      {/* Render Generic Post */}
      {(!['image', 'card', 'comment', 'Comment'].includes(padlet.type)) && (() => {
        const isNote = padlet.type === 'text';
        // Full view: frameless display for Drawing/AI Component (no title
        // bar, no border) -- toggled per-post from the right-click menu, see
        // "Full view" in NotePostContextMenu. Not offered for types where
        // the title bar carries real information (Note/Todo/Table/etc).
        const isFullViewEligibleType = padlet.type === 'drawing' || padlet.type === 'ai-component';
        const isFullView = isFullViewEligibleType && !!(padlet.metadata as any)?.fullView;
        const content = (
          <div
            className={`group group/image-container relative overflow-hidden flex flex-col cursor-pointer ${isPadletSelected(padlet.id)
                ? 'ring-2 ring-blue-500 ring-offset-2'
              : ''
              }`}
            style={{
              width: padlet.type === 'container'
                ? `${Math.max(Number(padlet.width) || 0, 360)}px`
                : padlet.type === 'link'
                  ? '320px'
                  : padlet.type === 'ai-component'
                    ? `${Math.max(Number(padlet.width) || 500, 200)}px`
                    : '180px',
              minHeight: padlet.type === 'container' ? '150px'
                : padlet.type === 'ai-component' ? `${Math.max(Number(padlet.height) || 400, 150)}px`
                : '80px',
              border: isFullView ? 'none' : '1px solid #e5e7eb',
              backgroundColor: isFullView ? 'transparent' : (padlet.metadata?.cardColor || '#ffffff'),
            }}
          >
            {/* Drop-target indicator: shown over a container while another
                post is being dragged over it, so the user sees they *can*
                drop it in -- without implying they have to (they may just be
                passing over on the way somewhere else). */}
            {padlet.type === 'container' && dragOverContainerId === padlet.id && (
              <div className="absolute inset-0 z-[500] flex items-center justify-center bg-white/60 pointer-events-none">
                <Plus className="w-12 h-12 text-gray-400" strokeWidth={2.5} />
              </div>
            )}

            {/* Top strip — 3-column grid: [pencil | title centered | mirror] */}
            {(() => {
              if (isFullView) return null;
              const freeformStripBg = isStripVisible(padlet.metadata?.topStrip)
                ? (padlet.metadata?.topStrip as string)
                : 'rgba(0,0,0,0.04)';
              const freeformIconColor = isStripVisible(padlet.metadata?.topStrip)
                ? contrastIconColor(padlet.metadata?.topStrip as string)
                : '#9ca3af';
              const freeformTitleColor = isStripVisible(padlet.metadata?.topStrip)
                ? contrastIconColor(padlet.metadata?.topStrip as string)
                : '#374151';
              const isContainer = padlet.type === 'container';
              const isAIPost = padlet.type === 'ai-component';
              const showModalEditButton = canUseFreeformEditButton && !isLineMode && !isGraphConnectMode;
              const showContainerExpand = isContainer && (expandableContainers[padlet.id] ?? false);
              const showAIExpand = isAIPost;
              const showExpandButton = showContainerExpand || showAIExpand;
              const isContainerExpanded = expandedContainers[padlet.id] ?? false;
              const isAIPostExpanded = expandedAIPosts[padlet.id] ?? false;
              const isExpanded = isContainer ? isContainerExpanded : isAIPostExpanded;
              return (
                <div
                  className="w-full flex-shrink-0 grid"
                  style={{ gridTemplateColumns: 'auto 1fr auto', minHeight: isContainer ? '28px' : '22px', backgroundColor: freeformStripBg }}
                >
                  {/* Left: expand/export cluster for containers and AI posts */}
                  <div className="flex items-center pl-1.5">
                    {showExpandButton || isAIPost ? (
                      <div className="flex items-center gap-1">
                        {showExpandButton && (
                          <button
                            type="button"
                            data-no-drag="true"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isContainer) {
                                setExpandedContainers(prev => ({ ...prev, [padlet.id]: !prev[padlet.id] }));
                              } else if (isAIPost) {
                                setExpandedAIPosts(prev => ({ ...prev, [padlet.id]: !prev[padlet.id] }));
                              }
                            }}
                            className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-colors"
                            style={{ color: freeformIconColor }}
                            title={isExpanded ? 'Collapse' : 'Expand'}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                        {isAIPost && canUseFreeformEditButton && (
                          <>
                            <button
                              type="button"
                              data-no-drag="true"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPadletToEdit(padlet);
                                setIsAIContentEditModalOpen(true);
                              }}
                              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
                              style={{ color: freeformIconColor }}
                              title="Edit fields"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              data-no-drag="true"
                              onPointerDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPadletToEdit(padlet);
                                setIsAIComponentEditorOpen(true);
                              }}
                              className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
                              style={{ color: freeformIconColor }}
                              title="Regenerate with AI"
                            >
                              <RefreshCw className="h-3 w-3" />
                              <span>Regen</span>
                            </button>
                            {(() => {
                              const aiContent = extractAIContentFromPadletMetadata(padlet.metadata);
                              const normalized = normalizeAIContent(aiContent);
                              if (normalized.kind !== 'structured' || !normalized.envelope) return null;
                              const env = normalized.envelope;
                              const envSubtype = env.mode === 'diagram'
                                ? (env.data as unknown as Record<string, unknown>).subtype as DiagramSubtype | undefined
                                : undefined;
                              if (getConversionTargets(env.mode, envSubtype).length === 0) return null;
                              return (
                                <button
                                  type="button"
                                  data-no-drag="true"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPadletToEdit(padlet);
                                    setIsAIContentConvertModalOpen(true);
                                  }}
                                  className="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-medium opacity-0 transition-opacity hover:bg-black/10 group-hover:opacity-100"
                                  style={{ color: freeformIconColor }}
                                  title="Convert to another format"
                                >
                                  <ArrowLeftRight className="h-3 w-3" />
                                  <span>Convert</span>
                                </button>
                              );
                            })()}
                            <div
                              data-no-drag="true"
                              onPointerDown={(e) => e.stopPropagation()}
                              style={{ color: freeformIconColor }}
                            >
                              <AIComponentExportMenu
                                title={padlet.title || 'AI Post'}
                                code={resolveSavedAIHtmlFromMetadata(padlet.metadata)}
                                getTargetElement={() => aiExportTargetsRef.current[padlet.id] ?? null}
                              />
                            </div>
                          </>
                        )}
                      </div>
                    ) : canUseFreeformEditButton ? (
                      <div className="w-5 h-5 shrink-0" aria-hidden="true" />
                    ) : null}
                  </div>
                  {/* Center: title -- containers show their real title
                      unchanged; Note, Todo, Table, Image, Link and AI show
                      nothing until the user sets a real title, editable in
                      place via double-click (same pattern as the Comment
                      post's own title bar). No ghost "Title" placeholder
                      text here -- that's the modal editor's own input hint. */}
                  <div className="flex items-center justify-center px-1 min-w-0">
                    {isContainer ? (
                      padlet.title && (() => {
                        const containerTitleStyle = resolvePadletTitleStyle(padlet, freeformTitleColor);
                        return (
                          <span
                            className="text-xs font-semibold text-center break-words leading-snug py-1"
                            style={containerTitleStyle}
                          >
                            {padlet.title}
                          </span>
                        );
                      })()
                    ) : (padlet.type === 'text' || (padlet.type as string) === 'note' || padlet.type === 'todo' || padlet.type === 'table' || padlet.type === 'image' || padlet.type === 'link' || padlet.type === 'ai-component' || padlet.type === 'drawing') ? (() => {
                      // Resolve the title's FULL style (heading/size, bold,
                      // italic, underline, strikethrough, align, color) the
                      // same way the editor modal's Text style panel wrote
                      // it -- not just color -- so the canvas card matches
                      // what was actually configured in the panel.
                      const titleTextStyle = resolvePadletTitleStyle(padlet, freeformTitleColor);
                      return editingNoteTitleId === padlet.id ? (
                        <input
                          type="text"
                          value={noteTitleDraft}
                          onChange={(e) => setNoteTitleDraft(e.target.value)}
                          onBlur={() => {
                            setEditingNoteTitleId(null);
                            updatePadletTitle(padlet.id, noteTitleDraft.trim());
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur();
                            if (e.key === 'Escape') setEditingNoteTitleId(null);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          data-no-drag="true"
                          placeholder="Post name"
                          className="text-xs font-semibold text-center bg-transparent border-b border-blue-400 outline-none px-0 py-0 w-full placeholder:opacity-40"
                          style={titleTextStyle}
                          autoFocus
                        />
                      ) : (() => {
                        const noteTitle = getMeaningfulTitle(padlet.title, padlet.type);
                        // No placeholder text here -- unlike the modal's "Title"
                        // input hint, an untitled card on the canvas itself
                        // should show nothing until the user actually enters
                        // one. The span still renders (empty) so there's a
                        // double-click target to add a first title.
                        return (
                          <span
                            className="block w-full text-xs font-semibold text-center truncate cursor-pointer"
                            style={titleTextStyle}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              setEditingNoteTitleId(padlet.id);
                              setNoteTitleDraft(noteTitle);
                            }}
                            title="Double-click to add a title"
                          >
                            {noteTitle}
                          </span>
                        );
                      })();
                    })() : null}
                  </div>
                  {/* Right: pencil hover-only */}
                  <div className="flex items-center pr-1.5">
                    {showModalEditButton && (
                      <button
                        data-no-drag="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDetachedPopupOpen(false);
                          openFreeformPadletModal(padlet);
                        }}
                        className="shrink-0 w-5 h-5 rounded flex items-center justify-center hover:bg-black/10 transition-opacity opacity-0 group-hover:opacity-100"
                        style={{ color: freeformIconColor }}
                        title="Edit"
                      >
                        <Edit2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Save to Library button (visible on hover) */}
            {/* REMOVED: Save to Library button for freeform canvas posts
                (preserves sidebar Library tool and other functionality) */}

            {/* Lock indicator - bottom-right, visible on hover only when locked */}
            {(padlet.metadata as any)?.isLocked && (
              <div
                className="absolute bottom-1 right-1 z-10 w-6 h-6 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 bg-white/80 transition-opacity"
                title="Position Locked"
              >
                <svg className="w-4 h-4 text-gray-600" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17a2 2 0 002-2v-2a2 2 0 10-4 0v2a2 2 0 002 2zm6-7V8A6 6 0 006 8v2a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2v-8a2 2 0 00-2-2zM8 8a4 4 0 118 0v2H8V8z" />
                </svg>
              </div>
            )}

            {/* Resize handle - bottom-right corner, AI cards only, hidden when locked */}
            {padlet.type === 'ai-component' && canUseFreeformEditButton && !(padlet.metadata as any)?.isLocked && (
              <div
                data-no-drag="true"
                onPointerDown={(e) => {
                  if (!canUseFreeformEditButton) return;
                  e.preventDefault();
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  aiResizeRef.current = {
                    id: padlet.id,
                    x: e.clientX,
                    y: e.clientY,
                    w: Number(padlet.width) || 500,
                    h: Number(padlet.height) || 400,
                  };
                }}
                onPointerMove={(e) => {
                  if (!canUseFreeformEditButton) return;
                  if (!aiResizeRef.current || aiResizeRef.current.id !== padlet.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const dx = (e.clientX - aiResizeRef.current.x) / canvasZoom;
                  const dy = (e.clientY - aiResizeRef.current.y) / canvasZoom;
                  const newW = Math.max(200, Math.round(aiResizeRef.current.w + dx));
                  const newH = Math.max(150, Math.round(aiResizeRef.current.h + dy));
                  setPadlets(prev => prev.map(p => p.id === padlet.id ? { ...p, width: newW, height: newH } : p));
                }}
                onPointerUp={(e) => {
                  if (!canUseFreeformEditButton) return;
                  if (!aiResizeRef.current || aiResizeRef.current.id !== padlet.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const dx = (e.clientX - aiResizeRef.current.x) / canvasZoom;
                  const dy = (e.clientY - aiResizeRef.current.y) / canvasZoom;
                  const newW = Math.max(200, Math.round(aiResizeRef.current.w + dx));
                  const newH = Math.max(150, Math.round(aiResizeRef.current.h + dy));
                  aiResizeRef.current = null;
                  persistPostFieldsBestEffort(padlet.id, { width: newW, height: newH, updated_at: new Date().toISOString() });
                }}
                onPointerCancel={() => { aiResizeRef.current = null; }}
                className="absolute bottom-1 right-1 z-10 h-5 w-5 cursor-nwse-resize flex items-center justify-center rounded-sm bg-white/80 opacity-0 shadow-sm transition-opacity hover:opacity-100 group-hover:opacity-50"
                title="Resize"
                aria-label="Resize"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <line x1="9" y1="1" x2="1" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="9" y1="5" x2="5" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1="9" y1="8" x2="8" y2="9" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </div>
            )}


            {/* Content - expands to fit all text */}
            <div
              className={`p-3 ${(padlet.type === 'link' || (padlet.type === 'ai-component' && (expandedAIPosts[padlet.id] ?? false))) ? '' : 'overflow-hidden'}`}
              style={{ maxWidth: '100%' }}
              // AI-generated content (and link thumbnails) can contain plain
              // <img> tags, which browsers make natively drag-and-droppable.
              // Pressing down on one and moving the mouse starts the
              // browser's own native image drag instead of this canvas's
              // mousedown/mousemove system, which then never sees the
              // gesture continue -- the card silently refuses to move
              // (working fine from the surrounding margin, which isn't an
              // <img>). preventDefault on dragstart, caught here for every
              // descendant, cancels that native drag so it falls through to
              // the normal drag-to-move handling instead.
              onDragStart={(e) => e.preventDefault()}
            >
              {/* Link Card Display */}
              {padlet.type === 'link' && padlet.metadata?.linkUrl && (
                (() => {
                  // Determine if this is an embeddable URL
                  const linkImage = padlet.metadata.linkImage || '';
                  const linkUrlFromMeta = padlet.metadata.linkUrl || '';
                  const youtubeId = extractYouTubeId(linkUrlFromMeta) || extractYouTubeId(linkImage) || '';
                  const derivedYoutubeUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : '';
                  const youtubeThumbCandidates = youtubeId ? buildYouTubeThumbCandidates(youtubeId) : [];
                  const linkImageCandidates = linkImage
                    ? [linkImage, ...youtubeThumbCandidates.filter((candidate) => candidate !== linkImage)]
                    : youtubeThumbCandidates;
                  const displayLinkImage = linkImageCandidates[0] || '';
                  let linkUrl = padlet.metadata.linkUrl || derivedYoutubeUrl;
                  let embedKind = padlet.metadata.displayMode !== 'info-only' && linkUrl ? getLinkEmbedKind(linkUrl) : 'none';

                  // Force YouTube detection if we derived it from thumbnail
                  if (embedKind === 'none' && derivedYoutubeUrl) {
                    linkUrl = derivedYoutubeUrl;
                    embedKind = 'youtube';
                  }

                  const showEmbed = embedKind !== 'none';
                  const showMedia = padlet.metadata.displayMode !== 'info-only';

                  return (
                    <div className="space-y-2">
                      {/* Embeddable Media (YouTube, Vimeo, etc.) */}
                      {showMedia && showEmbed && (
                        <div className="-mx-3 -mt-3 mb-2 relative">
                          {/* Drag grab-strip for iframe embeds.
                              Embedded players (iframe) swallow pointer events, so native card drag
                              cannot start from the media surface. This strip keeps controls usable
                              while allowing drag start from the embed area itself. */}
                          {!((padlet.metadata as any)?.isLocked) && (
                            <div
                              className="absolute top-0 left-0 right-0 h-7 z-20 cursor-grab active:cursor-grabbing"
                              title="Drag post"
                              aria-label="Drag post"
                            />
                          )}
                          <LinkMediaEmbed
                            url={linkUrl}
                            forcedKind={embedKind as any}
                            disableInteraction={isLineMode || isGraphConnectMode}
                          />
                        </div>
                      )}
                      {/* Link Image - only show if not embeddable and not info-only mode */}
                      {showMedia && !showEmbed && displayLinkImage && (
                        <div className="-mx-3 -mt-3 mb-2">
                          <img
                            src={displayLinkImage}
                            alt=""
                            className="w-full h-32 object-cover"
                            data-fallbacks={JSON.stringify(linkImageCandidates.slice(1))}
                            onError={(e) => {
                              const img = e.currentTarget;
                              try {
                                const fallbacks = JSON.parse(img.dataset.fallbacks || '[]') as string[];
                                const next = fallbacks.shift();
                                if (next) {
                                  img.dataset.fallbacks = JSON.stringify(fallbacks);
                                  img.src = next;
                                  return;
                                }
                              } catch {
                                // ignore
                              }
                              img.style.display = 'none';
                            }}
                          />
                        </div>
                      )}
                      {/* Domain with favicon - hide if image-only mode */}
                      {padlet.metadata.displayMode !== 'image-only' && (
                        <div className="flex items-center gap-1.5">
                          {padlet.metadata.linkFavicon && (
                            <img
                              src={padlet.metadata.linkFavicon}
                              alt=""
                              className="w-3 h-3"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                          )}
                          <span className="text-[10px] text-gray-500 truncate">
                            {padlet.metadata.linkDomain || padlet.metadata.linkUrl}
                          </span>
                        </div>
                      )}
                      {/* Title - hide if image-only mode */}
                      {padlet.metadata.displayMode !== 'image-only' && (
                        <h4 className="text-xs font-semibold text-blue-600 leading-tight line-clamp-2">
                          {padlet.metadata.linkTitle || 'Untitled Link'}
                        </h4>
                      )}
                      {/* Description - hide if image-only mode */}
                      {padlet.metadata.linkDescription && padlet.metadata.displayMode !== 'image-only' && (
                        <p className="text-[10px] text-gray-600 line-clamp-2">
                          {padlet.metadata.linkDescription}
                        </p>
                      )}
                      {/* Caption - always show if exists */}
                      {padlet.metadata.linkCaption && (
                        <p className="text-[10px] text-gray-500 italic border-t border-gray-100 pt-2 mt-1">
                          {padlet.metadata.linkCaption}
                        </p>
                      )}
                    </div>
                  );
                })()
              )}

              {/* Todo Card Display */}
              {padlet.type === 'todo' && padlet.metadata?.tasks && (
                <div className="space-y-1">
                  {/* Title now lives in the shared top-strip bar above
                      (same ghost-placeholder pattern as Note) -- no longer
                      duplicated here. */}
                  {/* Task list preview (show first 4) */}
                  {padlet.metadata.tasks.slice(0, 4).map((task: { id: string; text: string; completed: boolean; dueDate?: string; assignee?: string }) => (
                    <div key={task.id} className="flex items-start gap-1.5">
                      <input
                        type="checkbox"
                        checked={task.completed}
                        onChange={async (e) => {
                          e.stopPropagation();
                          // Toggle task completion
                          const updatedTasks = padlet.metadata?.tasks?.map((t: { id: string; completed: boolean }) =>
                            t.id === task.id ? { ...t, completed: !t.completed } : t
                          ) || [];
                          const updatedMetadata = { ...padlet.metadata, tasks: updatedTasks };

                          try {
                            await updatePostFieldsOrThrow(padlet.id, {
                              content: JSON.stringify(updatedTasks),
                              metadata: updatedMetadata,
                              updated_at: new Date().toISOString(),
                            });
                            fetchData(); // Refresh to get updated data
                          } catch (err) {
                            console.error('Failed to toggle task:', err);
                          }
                        }}
                        className="w-3 h-3 mt-0.5 accent-green-500 cursor-pointer"
                      />
                      <span className={`text-[10px] ${task.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {task.text}
                      </span>
                    </div>
                  ))}
                  {/* Show more indicator */}
                  {padlet.metadata.tasks.length > 4 && (
                    <p className="text-[9px] text-gray-400">
                      +{padlet.metadata.tasks.length - 4} more tasks
                    </p>
                  )}
                  {/* Progress indicator */}
                  <div className="pt-1 border-t border-gray-100 mt-1">
                    <div className="flex items-center gap-1">
                      <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{
                            width: `${padlet.metadata.tasks.length > 0
                              ? (padlet.metadata.tasks.filter((t: { completed: boolean }) => t.completed).length / padlet.metadata.tasks.length) * 100
                              : 0}%`
                          }}
                        />
                      </div>
                      <span className="text-[9px] text-gray-500">
                        {padlet.metadata.tasks.filter((t: { completed: boolean }) => t.completed).length}/{padlet.metadata.tasks.length}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Table Card Display -- title now lives in the shared top
                  strip bar above, matching Note/Todo. */}
              {padlet.type === 'table' && (() => {
                return (
                  <div className="space-y-1">
                    {/* Mini table preview */}
                    {(() => {
                    // CellStyle type for table cells
                    type CellStyle = {
                      bg?: string;
                      align?: 'left' | 'center' | 'right';
                      bold?: boolean;
                      italic?: boolean;
                      underline?: boolean;
                    };
                    // Parse table data from content
                    let tableData: { rows?: string[][]; columns?: string[]; caption?: string; cellStyles?: Record<string, CellStyle> } = {};
                    try {
                      tableData = JSON.parse(padlet.content || '{}');
                    } catch {
                      tableData = {};
                    }
                    const rows = tableData.rows || [];
                    const columns = tableData.columns || ['A', 'B', 'C'];
                    const cellStyles = tableData.cellStyles || {};
                    const displayRows = rows.slice(0, 3); // Show first 3 rows
                    const displayCols = columns.slice(0, 3); // Show first 3 columns

                    // Helper to get cell style
                    const getCellStyle = (rowIndex: number, colIndex: number): CellStyle => {
                      const key = `${rowIndex}-${colIndex}`;
                      return cellStyles[key] || {};
                    };

                    return (
                      <>
                        <div className="overflow-hidden rounded border border-gray-200">
                          <table className="w-full text-[9px]">
                            <thead>
                              <tr className="bg-gray-100">
                                {displayCols.map((col, i) => (
                                  <th key={i} className="px-1 py-0.5 border-r border-gray-200 font-medium text-gray-600">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {displayRows.length > 0 ? displayRows.map((row, ri) => (
                                <tr key={ri} className="border-t border-gray-200">
                                  {row.slice(0, 3).map((cell, ci) => {
                                    const style = getCellStyle(ri, ci);
                                    return (
                                      <td
                                        key={ci}
                                        className="px-1 py-0.5 border-r border-gray-200 truncate max-w-[50px]"
                                        style={{
                                          backgroundColor: style.bg || undefined,
                                          textAlign: style.align || 'left',
                                          fontWeight: style.bold ? 'bold' : undefined,
                                          fontStyle: style.italic ? 'italic' : undefined,
                                          textDecoration: style.underline ? 'underline' : undefined,
                                        }}
                                      >
                                        {cell || '-'}
                                      </td>
                                    );
                                  })}
                                </tr>
                              )) : (
                                <tr>
                                  <td colSpan={3} className="px-1 py-2 text-center text-gray-400">
                                    Empty table
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                        {/* Show more indicator */}
                        {(rows.length > 3 || columns.length > 3) && (
                          <p className="text-[9px] text-gray-400">
                            {rows.length} rows × {columns.length} columns
                          </p>
                        )}
                        {/* Caption */}
                        {tableData.caption && (
                          <p className="text-[9px] text-gray-500 italic border-t border-gray-100 pt-1 mt-1">
                            {tableData.caption}
                          </p>
                        )}
                      </>
                    );
                    })()}
                  </div>
                );
              })()}

              {/* Container Card Display - uses RowColumnContainerCard for proper comment rendering */}
              {padlet.type === 'container' && (
                <RowColumnContainerCard
                  padlet={padlet}
                  allPadlets={padlets}
                  showHeader={false}
                  isExpanded={expandedContainers[padlet.id] ?? false}
                  onExpandAvailabilityChange={(available) => setExpandableContainers(prev => prev[padlet.id] === available ? prev : { ...prev, [padlet.id]: available })}
                  onDropExistingPadlet={canUseFreeformEditButton ? async (containerId, droppedId) => {
                    const containerPadlet = padlets.find(p => p.id === containerId);
                    if (!containerPadlet) return;
                    const childIds = containerPadlet.metadata?.childPadletIds || [];
                    if (childIds.includes(droppedId)) return;
                    const newChildIds = [...childIds, droppedId];
                    try {
                      await updatePostFieldsPreservingFailureChannels(containerId, {
                        metadata: { ...containerPadlet.metadata, childPadletIds: newChildIds },
                        updated_at: new Date().toISOString(),
                      });
                      const droppedPadlet = padlets.find(p => p.id === droppedId);
                      await updatePostFieldsPreservingFailureChannels(droppedId, {
                        metadata: { ...droppedPadlet?.metadata, parentId: containerId },
                        updated_at: new Date().toISOString(),
                      });
                      fetchData();
                    } catch (err) {
                      console.error('Failed to add padlet to container:', err);
                    }
                  } : undefined}
                  ignoreDragKinds={[DND_KIND_CONTAINER_MOVE]}
                  onViewDrawing={(p) => setViewDrawingPadlet(p)}
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
                      await updatePostFieldsPreservingFailureChannels(childId, {
                        metadata: { ...childPadlet.metadata, comments },
                        updated_at: new Date().toISOString(),
                      });
                    } catch (err) {
                      console.error('Failed to update child comments:', err);
                      toast.error('Failed to update comments');
                    }
                  }}
                  // Same "Read" routing the root Document card uses (see
                  // onReadDocument below) -- never gated by
                  // canUseFreeformEditButton beyond choosing editor vs viewer
                  // destination, so readonly users can still Read.
                  onOpenDocument={(child) => {
                    const destination = selectDocumentModalDestination(child, canUseFreeformEditButton);
                    if (destination) requestOpenDocument(child, destination);
                  }}
                  accessMode={commentAccessMode}
                />
              )}

              {/* Drawing Card Display */}
              {padlet.type === 'drawing' && (
                <PostCardContent
                  padlet={padlet}
                  onView={() => setViewDrawingPadlet(padlet)}
                  isDragging={isDragging && draggingPadletId === padlet.id}
                />
              )}

              {/* Image as Link Display */}
              {padlet.file_url?.includes('https://') && padlet.type !== 'image' && (
                <img
                  src={padlet.file_url}
                  className="w-full object-cover rounded"
                  style={{ maxHeight: '200px' }}
                  alt="preview"
                />
              )}

              {padlet.type === 'ai-component' && (() => {
                const aiContent = extractAIContentFromPadletMetadata(padlet.metadata);
                const normalizedAIContent = normalizeAIContent(aiContent);

                return (
                  <AIContentRenderer
                    content={aiContent}
                    onExportTargetReady={(element) => {
                      aiExportTargetsRef.current[padlet.id] = element;
                    }}
                    editable={canUseFreeformEditButton}
                    onContentChange={(nextData: AIContentData) => {
                      const nextContent = serializeAIContentForPersistence(nextData);
                      if (!nextContent) return;
                      updatePadletMetadata(padlet.id, { aiComponentJson: nextContent });
                    }}
                    legacyHtmlProps={normalizedAIContent.kind === 'legacy_html'
                      ? {
                        imageAttributions: getAIImageAttributions(padlet.metadata),
                        padletId: padlet.id,
                        width: Number(padlet.width) || 500,
                        height: Number(padlet.height) || 400,
                        canvasZoom,
                        isExpanded: expandedAIPosts[padlet.id] ?? false,
                        onExpandAvailabilityChange: (available: boolean) => {
                          setExpandableAIPosts(prev => prev[padlet.id] === available ? prev : { ...prev, [padlet.id]: available });
                        },
                        onExportTargetReady: (element: HTMLDivElement | null) => {
                          aiExportTargetsRef.current[padlet.id] = element;
                        },
                        onResize: (w: number, h: number) => {
                          if (!canUseFreeformEditButton) return;
                          setPadlets(prev => prev.map(p => p.id === padlet.id ? { ...p, width: w, height: h } : p));
                        },
                        onResizeEnd: (w: number, h: number) => {
                          if (!canUseFreeformEditButton) return;
                          persistPostFieldsBestEffort(padlet.id, { width: w, height: h, updated_at: new Date().toISOString() });
                        },
                      }
                      : undefined}
                  />
                );
              })()}

              {/* Generic / Note Display (Default) */}
              {(!['link', 'todo', 'table', 'container', 'drawing', 'ai-component'].includes(padlet.type) && !padlet.file_url?.includes('https://')) && (
                <div
                  className="text-gray-800 text-xs prose prose-sm break-words tiptap"
                  style={{
                    wordWrap: 'break-word',
                    overflowWrap: 'break-word',
                    overflow: 'hidden',
                    maxWidth: '100%',
                  }}
                  dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(padlet.content || '') }}
                  onClick={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.classList.contains('comment-mark')) {
                      e.stopPropagation();
                      const commentId = target.getAttribute('data-comment-id') || `comment-${Date.now()}`;
                      const commentText = target.getAttribute('data-comment-text');
                      const userId = target.getAttribute('data-user-id') || 'user1';
                      const userName = target.getAttribute('data-user-name') || 'User';
                      const timestamp = target.getAttribute('data-timestamp');
                      const threadRaw = target.getAttribute('data-comment-thread');

                      let thread: Array<{
                        id: string;
                        text: string;
                        userId: string;
                        userName: string;
                        timestamp: number;
                        isStrikethrough?: boolean;
                      }> = [];

                      if (threadRaw) {
                        try {
                          const parsed = JSON.parse(threadRaw) as Array<any>;
                          if (Array.isArray(parsed)) {
                            thread = parsed
                              .filter((item) => item && typeof item.text === 'string')
                              .map((item) => ({
                                id: item.id || commentId,
                                text: item.text,
                                userId: item.userId || userId,
                                userName: item.userName || userName,
                                timestamp: item.timestamp || (timestamp ? parseInt(timestamp, 10) : Date.now()),
                                isStrikethrough: item.isStrikethrough,
                              }));
                          }
                        } catch {
                          // Ignore invalid thread payloads
                        }
                      }

                      if (thread.length === 0 && commentText) {
                        thread = [{
                          id: commentId,
                          text: commentText,
                          userId,
                          userName,
                          timestamp: timestamp ? parseInt(timestamp, 10) : Date.now(),
                          isStrikethrough: false,
                        }];
                      }

                      if (threadRaw !== null || thread.length > 0) {
                        const rect = target.getBoundingClientRect();
                        // Find the parent card element to get its boundaries
                        const cardElement = target.closest('.group.rounded-lg') as HTMLElement;
                        const cardRect = cardElement?.getBoundingClientRect();

                        // Position comment panel to the RIGHT of the card
                        setCommentPopupPosition({
                          x: cardRect ? cardRect.right + 12 : rect.right + 10,
                          y: cardRect ? cardRect.top : rect.top,
                        });

                        // Store card left boundary for color picker positioning
                        if (cardRect) {
                          setTextLinkColorPickerPosition({
                            cardLeft: cardRect.left,
                            top: cardRect.top,
                          });
                        }

                        // Get highlight color from comment mark
                        const highlightColor = target.getAttribute('data-color') || undefined;
                        setCommentPopupHighlightColor(highlightColor);

                        setCommentPopupComments(thread);
                        setCommentPopupPadletId(padlet.id);
                        setCommentPopupCommentId(commentId);
                        setCommentPopupOpen(true);
                        setTextLinkColorPickerOpen(false); // Close color picker when opening new comment
                      }
                    }
                  }}
                />
              )}

              {/* Reactions Row -- same template as the Image post's own
                  reactions row (lower area, add button on card hover),
                  applied here so Note/Todo/Table/Link/AI/Drawing posts get
                  the same on-canvas display Image already had. Container is
                  excluded: its branch below has no relative-positioned
                  wrapper to anchor the add-picker popup against. */}
              {padlet.type !== 'container' && ((padlet.metadata?.reactions?.length ?? 0) > 0 || isPadletSelected(padlet.id)) && (
                <div className="flex items-center gap-1.5 pt-1.5 mt-1.5 border-t border-gray-100">
                  <ReactionDisplay
                    reactions={padlet.metadata?.reactions || []}
                    onAddClick={() => {
                      setSelectedPadletId(padlet.id);
                      setIsImageEmojiOpen(true);
                    }}
                    onReactionClick={async (emoji) => {
                      try {
                        const currentReactions = padlet.metadata?.reactions || [];
                        const indexToRemove = currentReactions.indexOf(emoji);
                        if (indexToRemove === -1) return;
                        const newReactions = [
                          ...currentReactions.slice(0, indexToRemove),
                          ...currentReactions.slice(indexToRemove + 1)
                        ];
                        await updatePadletMetadata(padlet.id, { reactions: newReactions });
                      } catch (err) {
                        console.error('Failed to remove reaction:', err);
                      }
                    }}
                  />
                </div>
              )}

              {/* Caption -- moved below the Reactions row (was above it) to
                  match Clipart/Image's order: reactions first, caption last.
                  No border-t here (unlike the divider above the Reactions
                  row): Clipart/Image's own caption has no dividing line
                  between it and the reactions above it, so this drops the
                  line too instead of just relocating it. */}
              {padlet.type === 'drawing' && !!padlet.metadata?.caption && (
                <p
                  className="text-xs mt-1.5 break-words"
                  style={resolveCaptionStyle(padlet.metadata?.captionStyle)}
                >
                  {padlet.metadata.caption}
                </p>
              )}

              {/* Caption -- moved below the Reactions row (was above it) to
                  match Clipart/Image's order: reactions first, caption last.
                  No border-t here -- see the Drawing caption above. */}
              {padlet.type === 'ai-component' && !!padlet.metadata?.caption && (
                <p
                  className="text-xs mt-1.5 break-words"
                  style={resolveCaptionStyle(padlet.metadata?.captionStyle)}
                >
                  {padlet.metadata.caption}
                </p>
              )}
            </div>
          </div>
        );

        if (padlet.type === 'link') {
          return (
            <LinkPostContextMenu
              key={padlet.id}
              padlet={padlet}
              onSelect={() => setSelectedPadletId(padlet.id)}
              disabled={!canUseFreeformEditButton}
              onEdit={() => openFreeformPadletModal(padlet)}
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onAddToLibrary={() => addPadletToLibrary(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
              onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
              onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}
              groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}
              onAddImage={() => addImageToLink(padlet.id)}
              onCopyLinkAddress={() => copyLinkAddress(padlet.id)}
            >
              <div className="relative">
                {content}

                {/* Comment Badge */}
                {(() => {
                  const commentCount = (padlet.metadata?.detachedComments || padlet.metadata?.comments || []).length;
                  if (commentCount === 0) return null;
                  const badgeColor = padlet.metadata?.badgeColor || '#facc15';
                  return (
                    <button
                      className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
                      style={{ backgroundColor: badgeColor }}
                      title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const commentsToShow = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        if (cardCommentPopupPadletId === padlet.id) {
                          setCardCommentPopupPadletId(null);
                          setActiveCardCommentId(null);
                          setEditingCardCommentId(null);
                          setEditingCardCommentText('');
                          setNoteBadgeColorPadletId(null);
                          return;
                        }
                        setCardCommentList(commentsToShow);
                        setCardCommentPopupPadletId(padlet.id);
                        setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                        setEditingCardCommentId(null);
                        setEditingCardCommentText('');
                        setNoteBadgeColorPadletId(null);
                      }}
                    >
                      {commentCount}
                    </button>
                  );
                })()}

                {/* Emoji Picker - Positioned to the right */}
                {isPadletSelected(padlet.id) && isImageEmojiOpen && (
                  <div className="absolute left-full top-0 ml-3 z-[9999] animate-in fade-in zoom-in duration-200">
                    <div>
                      <EmojiReactionPicker
                        isOpen={isImageEmojiOpen}
                        onOpenChange={setIsImageEmojiOpen}
                        onSelectEmoji={async (emoji) => {
                          try {
                            const currentReactions = padlet.metadata?.reactions || [];
                            const newReactions = [...currentReactions, emoji];
                            await updatePadletMetadata(padlet.id, { reactions: newReactions });
                            setIsImageEmojiOpen(false);
                          } catch (err) {
                            console.error('Failed to add reaction:', err);
                          }
                        }}
                        inline
                      />
                    </div>
                  </div>
                )}

                {/* Link detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8U -- migrated off the local hand-rolled implementation, same pattern as Todo's on-canvas badge site). */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div
                    className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <CommentPopup
                      isOpen={true}
                      accessMode={commentAccessMode}
                      onOpenChange={(open) => {
                        if (!open) {
                          setCardCommentPopupPadletId(null);
                          setActiveCardCommentId(null);
                        }
                      }}
                      onSubmit={guardCommentMutation(commentAccessMode, async (commentText) => {
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const newComment = {
                          id: `comment-${Date.now()}`,
                          text: commentText,
                          userId: user?.id || 'anon',
                          userName: user?.email?.split('@')[0] || 'You',
                          timestamp: Date.now(),
                        };
                        const nextComments = [...currentComments, newComment];
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onEditComment={guardCommentMutation(commentAccessMode, async (commentId, text) => {
                        const nextComments = cardCommentList.map((comment: any) =>
                          comment.id === commentId ? { ...comment, text } : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onRemoveComment={guardCommentMutation(commentAccessMode, async (commentId) => {
                        const nextComments = cardCommentList.filter((comment: any) => comment.id !== commentId);
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onToggleCommentStrikethrough={guardCommentMutation(commentAccessMode, async (commentId) => {
                        const nextComments = cardCommentList.map((comment: any) =>
                          comment.id === commentId
                            ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onCommentColor={guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                        const nextComments = cardCommentList.map((comment: any) =>
                          comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      comments={cardCommentList}
                      badgeColor={padlet.metadata?.badgeColor || '#facc15'}
                      onBadgeColorChange={guardCommentMutation(commentAccessMode, (color) => updatePadletMetadata(padlet.id, { badgeColor: color }))}
                      commentTitle={typeof padlet.metadata?.commentTitle === 'string' ? padlet.metadata.commentTitle : undefined}
                      commentTitleStyle={padlet.metadata?.commentTitleStyle}
                      onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updatePadletMetadata(padlet.id, { commentTitle: title === 'Comments' ? undefined : title }))}
                      onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updatePadletMetadata(padlet.id, { commentTitleStyle: style }))}
                      currentUserId={user?.id || 'anon'}
                      currentUserName={user?.email?.split('@')[0] || 'You'}
                      enableCanonicalSelectionStyling
                    />
                  </div>
                )}
              </div>
            </LinkPostContextMenu>
          );
        }

        if (padlet.type === 'table') {
          let tableData: any = {};
          try {
            tableData = padlet.content ? JSON.parse(padlet.content) : {};
          } catch {
            tableData = {};
          }
          const tableComments = tableData.comments || [];
          const tableBadgeColor = tableData.badgeColor || tableComments[0]?.color || padlet.metadata?.badgeColor || '#facc15';

          return (
            <NotePostContextMenu
              key={padlet.id}
              padlet={padlet}
              onSelect={() => setSelectedPadletId(padlet.id)}
              disabled={!canUseFreeformEditButton}
              onEdit={() => openFreeformPadletModal(padlet)}
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onAddToLibrary={() => addPadletToLibrary(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
              onBringForward={() => movePadletLayer(padlet.id, 'bringForward')}
              onSendBackward={() => movePadletLayer(padlet.id, 'sendBackward')}
              onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
              onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}
              onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}
              groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}
            >
              <div className="relative">
                {content}

                {/* Comment Badge */}
                {(() => {
                  const commentCount = tableComments.length || 0;
                  if (commentCount === 0) return null;
                  return (
                    <button
                      className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
                      style={{ backgroundColor: tableBadgeColor }}
                      title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const commentsToShow = tableComments;
                        if (cardCommentPopupPadletId === padlet.id) {
                          setCardCommentPopupPadletId(null);
                          setActiveCardCommentId(null);
                          setEditingCardCommentId(null);
                          setEditingCardCommentText('');
                          setNoteBadgeColorPadletId(null);
                          return;
                        }
                        setCardCommentList(commentsToShow);
                        setCardCommentPopupPadletId(padlet.id);
                        setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                        setEditingCardCommentId(null);
                        setEditingCardCommentText('');
                        setNoteBadgeColorPadletId(null);
                      }}
                    >
                      {commentCount}
                    </button>
                  );
                })()}

                {/* Emoji Picker - Positioned to the right */}
                {isPadletSelected(padlet.id) && isImageEmojiOpen && (
                  <div className="absolute left-full top-0 ml-3 z-[9999] animate-in fade-in zoom-in duration-200">
                    <div>
                      <EmojiReactionPicker
                        isOpen={isImageEmojiOpen}
                        onOpenChange={setIsImageEmojiOpen}
                        onSelectEmoji={async (emoji) => {
                          try {
                            const currentReactions = padlet.metadata?.reactions || [];
                            const newReactions = [...currentReactions, emoji];
                            await updatePadletMetadata(padlet.id, { reactions: newReactions });
                            setIsImageEmojiOpen(false);
                          } catch (err) {
                            console.error('Failed to add reaction:', err);
                          }
                        }}
                        inline
                      />
                    </div>
                  </div>
                )}

                {/* Table detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8V -- migrated off the local hand-rolled implementation, same pattern as Link's on-canvas badge site). Table's own comment/badge/title storage lives inside padlet.content (a JSON blob), not padlet.metadata, so persistence goes through updatePadletContent rather than updatePadletMetadata. */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div
                    className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <CommentPopup
                      isOpen={true}
                      accessMode={commentAccessMode}
                      onOpenChange={(open) => {
                        if (!open) {
                          setCardCommentPopupPadletId(null);
                          setActiveCardCommentId(null);
                        }
                      }}
                      onSubmit={guardCommentMutation(commentAccessMode, async (commentText) => {
                        const currentComments = tableData.comments || [];
                        const newComment = {
                          id: `comment-${Date.now()}`,
                          text: commentText,
                          userId: user?.id || 'anon',
                          userName: user?.email?.split('@')[0] || 'You',
                          timestamp: Date.now(),
                        };
                        const nextComments = [...currentComments, newComment];
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      })}
                      onEditComment={guardCommentMutation(commentAccessMode, async (commentId, text) => {
                        const nextComments = (tableData.comments || []).map((comment: any) =>
                          comment.id === commentId ? { ...comment, text } : comment
                        );
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      })}
                      onRemoveComment={guardCommentMutation(commentAccessMode, async (commentId) => {
                        const nextComments = (tableData.comments || []).filter((comment: any) => comment.id !== commentId);
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      })}
                      onToggleCommentStrikethrough={guardCommentMutation(commentAccessMode, async (commentId) => {
                        const nextComments = (tableData.comments || []).map((comment: any) =>
                          comment.id === commentId
                            ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                            : comment
                        );
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      })}
                      onCommentColor={guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                        const nextComments = (tableData.comments || []).map((comment: any) =>
                          comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                        );
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      })}
                      comments={cardCommentList}
                      badgeColor={tableBadgeColor}
                      onBadgeColorChange={guardCommentMutation(commentAccessMode, async (color) => {
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: tableComments, badgeColor: color }));
                      })}
                      commentTitle={typeof tableData.commentTitle === 'string' ? tableData.commentTitle : undefined}
                      commentTitleStyle={tableData.commentTitleStyle}
                      onCommentTitleChange={guardCommentMutation(commentAccessMode, async (title: string) => {
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: tableComments, badgeColor: tableBadgeColor, commentTitle: title === 'Comments' ? undefined : title }));
                      })}
                      onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, async (style) => {
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: tableComments, badgeColor: tableBadgeColor, commentTitleStyle: style }));
                      })}
                      currentUserId={user?.id || 'anon'}
                      currentUserName={user?.email?.split('@')[0] || 'You'}
                      enableCanonicalSelectionStyling
                    />
                  </div>
                )}
              </div>
            </NotePostContextMenu>
          );
        }

        if (padlet.type === 'todo') {
          return (
            <TodoPostContextMenu
              key={padlet.id}
              padlet={padlet}
              onSelect={() => setSelectedPadletId(padlet.id)}
              disabled={!canUseFreeformEditButton}
              onEdit={() => openFreeformPadletModal(padlet)}
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onAddToLibrary={() => addPadletToLibrary(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
              onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
              onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}
              groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}
              onRename={() => renameTodo(padlet.id)}
            >
              <div className="relative">
                {content}

                {/* Comment Badge */}
                {(() => {
                  const commentCount = (padlet.metadata?.detachedComments || padlet.metadata?.comments || []).length;
                  if (commentCount === 0) return null;
                  const badgeColor = padlet.metadata?.badgeColor || '#facc15';
                  return (
                    <button
                      className="absolute -top-2 -right-2 z-[1200] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
                      style={{ backgroundColor: badgeColor }}
                      title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        const commentsToShow = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        if (cardCommentPopupPadletId === padlet.id) {
                          setCardCommentPopupPadletId(null);
                          setActiveCardCommentId(null);
                          setEditingCardCommentId(null);
                          setEditingCardCommentText('');
                          setNoteBadgeColorPadletId(null);
                          return;
                        }
                        setCardCommentList(commentsToShow);
                        setCardCommentPopupPadletId(padlet.id);
                        setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                        setEditingCardCommentId(null);
                        setEditingCardCommentText('');
                        setNoteBadgeColorPadletId(null);
                      }}
                    >
                      {commentCount}
                    </button>
                  );
                })()}

                {/* Emoji Picker - Positioned to the right */}
                {isPadletSelected(padlet.id) && isImageEmojiOpen && (
                  <div className="absolute left-full top-0 ml-3 z-[9999] animate-in fade-in zoom-in duration-200">
                    <div>
                      <EmojiReactionPicker
                        isOpen={isImageEmojiOpen}
                        onOpenChange={setIsImageEmojiOpen}
                        onSelectEmoji={async (emoji) => {
                          try {
                            const currentReactions = padlet.metadata?.reactions || [];
                            const newReactions = [...currentReactions, emoji];
                            await updatePadletMetadata(padlet.id, { reactions: newReactions });
                            setIsImageEmojiOpen(false);
                          } catch (err) {
                            console.error('Failed to add reaction:', err);
                          }
                        }}
                        inline
                      />
                    </div>
                  </div>
                )}

                {/* Todo detached comments use the canonical panel; this shell only owns placement and close state (PATCH 8S -- migrated off the local hand-rolled implementation, same pattern as Note's on-canvas badge site). */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div
                    className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <CommentPopup
                      isOpen={true}
                      accessMode={commentAccessMode}
                      onOpenChange={(open) => {
                        if (!open) {
                          setCardCommentPopupPadletId(null);
                          setActiveCardCommentId(null);
                        }
                      }}
                      onSubmit={guardCommentMutation(commentAccessMode, async (commentText) => {
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const newComment = {
                          id: `comment-${Date.now()}`,
                          text: commentText,
                          userId: user?.id || 'anon',
                          userName: user?.email?.split('@')[0] || 'You',
                          timestamp: Date.now(),
                        };
                        const nextComments = [...currentComments, newComment];
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onEditComment={guardCommentMutation(commentAccessMode, async (commentId, text) => {
                        const nextComments = cardCommentList.map((comment: any) =>
                          comment.id === commentId ? { ...comment, text } : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onRemoveComment={guardCommentMutation(commentAccessMode, async (commentId) => {
                        const nextComments = cardCommentList.filter((comment: any) => comment.id !== commentId);
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onToggleCommentStrikethrough={guardCommentMutation(commentAccessMode, async (commentId) => {
                        const nextComments = cardCommentList.map((comment: any) =>
                          comment.id === commentId
                            ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      onCommentColor={guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                        const nextComments = cardCommentList.map((comment: any) =>
                          comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      })}
                      comments={cardCommentList}
                      badgeColor={padlet.metadata?.badgeColor || '#facc15'}
                      onBadgeColorChange={guardCommentMutation(commentAccessMode, (color) => updatePadletMetadata(padlet.id, { badgeColor: color }))}
                      commentTitle={typeof padlet.metadata?.commentTitle === 'string' ? padlet.metadata.commentTitle : undefined}
                      commentTitleStyle={padlet.metadata?.commentTitleStyle}
                      onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updatePadletMetadata(padlet.id, { commentTitle: title === 'Comments' ? undefined : title }))}
                      onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updatePadletMetadata(padlet.id, { commentTitleStyle: style }))}
                      currentUserId={user?.id || 'anon'}
                      currentUserName={user?.email?.split('@')[0] || 'You'}
                      enableCanonicalSelectionStyling
                    />
                  </div>
                )}
              </div>
            </TodoPostContextMenu>
          );
        }

        if (padlet.type === 'container') {
          // Shared by openTargets (Edit post >), the Post titles > submenu,
          // and its click handler -- one child inventory, not rediscovered
          // per feature.
          const containerChildPadlets: Padlet[] = ((padlet.metadata as any)?.childPadletIds || [])
            .map((id: string) => padlets.find((p) => p.id === id))
            .filter((child: Padlet | undefined): child is Padlet => !!child);
          return (
            <ColumnPostContextMenu
              key={padlet.id}
              padlet={padlet}
              onSelect={() => setSelectedPadletId(padlet.id)}
              disabled={!canUseFreeformEditButton}
              // "Edit post" for a container becomes a submenu of its
              // children (same as Wall/Column/Grid, via openTargets) rather
              // than the plain single-item form (onEdit is the fallback
              // ColumnPostContextMenu uses when openTargets is empty --
              // e.g. an empty container -- so ContainerEditor stays reachable
              // for that case).
              openTargets={canUseFreeformEditButton ? containerChildPadlets : undefined}
              onOpenTarget={canUseFreeformEditButton ? (child: Padlet) => openFreeformPadletModal(child) : undefined}
              getOpenTargetLabel={getContainerEditTargetLabel}
              onEdit={canUseFreeformEditButton ? () => openFreeformPadletModal(padlet) : undefined}
              onDuplicate={canUseFreeformEditButton ? () => duplicatePadlet(padlet.id) : undefined}
              onDelete={canUseFreeformEditButton ? () => requestDeletePadlet(padlet.id) : undefined}
              onCut={canUseFreeformEditButton ? () => cutPadlet(padlet.id) : undefined}
              onCopy={canUseFreeformEditButton ? () => copyPadlet(padlet.id) : undefined}
              onPaste={canUseFreeformEditButton ? handlePaste : undefined}
              onRename={canUseFreeformEditButton ? () => renameColumn(padlet.id) : undefined}
              onLock={canUseFreeformEditButton ? () => lockPadlet(padlet.id) : undefined}
              onBringToFront={canUseFreeformEditButton ? () => movePadletLayer(padlet.id, 'bringToFront') : undefined}
              onSendToBack={canUseFreeformEditButton ? () => movePadletLayer(padlet.id, 'sendToBack') : undefined}
              onTogglePostTitleVisibility={canUseFreeformEditButton
                ? (childId: string) => {
                    const nextIds = toggleChildPostTitleVisibility(padlet.metadata as any, containerChildPadlets, childId);
                    updatePadletMetadata(padlet.id, { visibleChildPostTitleIds: nextIds, showChildPostTitles: false });
                  }
                : undefined}
              postTitleVisibleIds={Array.from(getEffectiveVisibleChildTitleIds(padlet.metadata as any, containerChildPadlets))}
            >
              {content}
            </ColumnPostContextMenu>
          );
        }

        return (
          <NotePostContextMenu
            key={padlet.id}
            padlet={padlet}
            onSelect={() => setSelectedPadletId(padlet.id)}
            disabled={!canUseFreeformEditButton}
            onEdit={() => openFreeformPadletModal(padlet)}
            onDuplicate={() => duplicatePadlet(padlet.id)}
            onAddToLibrary={() => addPadletToLibrary(padlet.id)}
            onDelete={() => requestDeletePadlet(padlet.id)}
            onCut={() => cutPadlet(padlet.id)}
            onCopy={() => copyPadlet(padlet.id)}
            onLock={() => lockPadlet(padlet.id)}
            onBringToFront={() => movePadletLayer(padlet.id, 'bringToFront')}
            onSendToBack={() => movePadletLayer(padlet.id, 'sendToBack')}
            onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}
            onGroupIntoColumn={(targetContainerId) => groupIntoColumn(padlet.id, targetContainerId)}
            groupIntoColumnTargets={getEligibleContainerDestinations(padlets, padlet.id)}
            onToggleFullView={padlet.type === 'drawing' || padlet.type === 'ai-component' ? () => toggleFullView(padlet.id) : undefined}
          >
            <div className="relative">
              {content}

              {/* Comment Badge - yellow indicator with count */}
              {(() => {
                const commentCount = padlet.metadata?.detachedComments?.length || 0;
                if (commentCount === 0) return null;
                const badgeColor = padlet.metadata?.badgeColor || '#facc15';
                return (
                  <button
                    className="absolute -top-2 -right-2 z-[100] w-6 h-6 rounded-full border-2 border-white shadow-md flex items-center justify-center text-xs font-bold text-gray-800 hover:brightness-110 transition-all pointer-events-auto"
                    style={{ backgroundColor: badgeColor }}
                    title={`${commentCount} comment${commentCount > 1 ? 's' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const commentsToShow = padlet.metadata?.detachedComments || [];
                      if (cardCommentPopupPadletId === padlet.id) {
                        setCardCommentPopupPadletId(null);
                        setActiveCardCommentId(null);
                        setEditingCardCommentId(null);
                        setEditingCardCommentText('');
                        setNoteBadgeColorPadletId(null);
                        return;
                      }
                      setCardCommentList(commentsToShow);
                      setCardCommentPopupPadletId(padlet.id);
                      setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                      setEditingCardCommentId(null);
                      setEditingCardCommentText('');
                      setNoteBadgeColorPadletId(null);
                    }}
                  >
                    {commentCount}
                  </button>
                );
              })()}

              {/* Emoji Picker - Positioned to the right */}
              {isPadletSelected(padlet.id) && isImageEmojiOpen && (
                <div className="absolute left-full top-0 ml-3 z-[9999] animate-in fade-in zoom-in duration-200">
                  <div>
                    <EmojiReactionPicker
                      isOpen={isImageEmojiOpen}
                      onOpenChange={setIsImageEmojiOpen}
                      onSelectEmoji={async (emoji) => {
                        try {
                          const currentReactions = padlet.metadata?.reactions || [];
                          const newReactions = [...currentReactions, emoji];
                          await updatePadletMetadata(padlet.id, { reactions: newReactions });
                          setIsImageEmojiOpen(false);
                        } catch (err) {
                          console.error('Failed to add reaction:', err);
                        }
                      }}
                      inline
                    />
                  </div>
                </div>
              )}

              {cardCommentPopupPadletId === padlet.id && commentColorPopupId && (
                <div
                  className="absolute right-full top-0 mr-3 z-[1200] bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <TextStylePopup
                    isOpen={true}
                    onOpenChange={(open) => !open && setCommentColorPopupId(null)}
                    onSelectHeading={() => { }}
                    hideHeadingSelect={true}
                    onSelectColor={async (color) => {
                      const currentComments = padlet.metadata?.detachedComments || [];
                      const nextComments = currentComments.map((comment: any) =>
                        comment.id === commentColorPopupId
                          ? { ...comment, textColor: color }
                          : comment
                      );
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    }}
                    onSelectHighlight={async (color) => {
                      const currentComments = padlet.metadata?.detachedComments || [];
                      const nextComments = currentComments.map((comment: any) =>
                        comment.id === commentColorPopupId
                          ? { ...comment, backgroundColor: color }
                          : comment
                      );
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    }}
                    currentHeading="normal"
                    currentColor={cardCommentList.find(c => c.id === commentColorPopupId)?.textColor}
                    currentHighlight={cardCommentList.find(c => c.id === commentColorPopupId)?.backgroundColor}
                  />
                </div>
              )}

              {/* Note detached comments use the canonical panel; this shell only owns placement and close state. */}
              {cardCommentPopupPadletId === padlet.id && (
                <div
                  className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <CommentPopup
                    isOpen={true}
                    accessMode={commentAccessMode}
                    onOpenChange={(open) => {
                      if (!open) {
                        setCardCommentPopupPadletId(null);
                        setActiveCardCommentId(null);
                      }
                    }}
                    onSubmit={guardCommentMutation(commentAccessMode, async (commentText) => {
                      const currentComments = padlet.metadata?.detachedComments || [];
                      const newComment = {
                        id: `comment-${Date.now()}`,
                        text: commentText,
                        userId: user?.id || 'anon',
                        userName: user?.email?.split('@')[0] || 'You',
                        timestamp: Date.now(),
                      };
                      const nextComments = [...currentComments, newComment];
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    })}
                    onEditComment={guardCommentMutation(commentAccessMode, async (commentId, text) => {
                      const nextComments = cardCommentList.map((comment: any) =>
                        comment.id === commentId ? { ...comment, text } : comment
                      );
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    })}
                    onRemoveComment={guardCommentMutation(commentAccessMode, async (commentId) => {
                      const nextComments = cardCommentList.filter((comment: any) => comment.id !== commentId);
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    })}
                    onToggleCommentStrikethrough={guardCommentMutation(commentAccessMode, async (commentId) => {
                      const nextComments = cardCommentList.map((comment: any) =>
                        comment.id === commentId
                          ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                          : comment
                      );
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    })}
                    onCommentColor={guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                      const nextComments = cardCommentList.map((comment: any) =>
                        comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                      );
                      await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                      setCardCommentList(nextComments);
                    })}
                    comments={cardCommentList}
                    badgeColor={padlet.metadata?.badgeColor || '#facc15'}
                    onBadgeColorChange={guardCommentMutation(commentAccessMode, (color) => updatePadletMetadata(padlet.id, { badgeColor: color }))}
                    commentTitle={padlet.metadata?.commentTitle}
                    commentTitleStyle={padlet.metadata?.commentTitleStyle}
                    onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updatePadletMetadata(padlet.id, { commentTitle: title === 'Comments' ? undefined : title }))}
                    onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updatePadletMetadata(padlet.id, { commentTitleStyle: style }))}
                    currentUserId={user?.id || 'anon'}
                    currentUserName={user?.email?.split('@')[0] || 'You'}
                    enableCanonicalSelectionStyling
                  />
                </div>
              )}
            </div>
          </NotePostContextMenu>
        );
      })()}
    </div>
                ))}
                {/* Freeform Graph edges: rendered INSIDE the posts container so the SVG
      fills the full 2000×1500 stage, not just the viewport. Each edge now
      carries its own zIndex style (default: always on top) instead of one
      fixed layer above every post, so a line's Edge Settings panel can send
      it behind a specific post or bring it back in front. */}
                {isFreeformGraphMode && canvasId && (
      <FreeformGraphLayer boardId={canvasId.toString()} posts={padlets} refreshToken={graphRefreshToken} containerRef={containerRef} worldOriginRef={worldOriginRef} zoom={canvasZoom} />
                )}
                </div>
      {/* PATCH SECTION-H2 Phase 3/4: the selected heading's formatting bar is
          rendered HERE -- a sibling of the scaled world layer that closes
          just above, never a descendant of it. That placement is the whole
          reason the toolbar is screen UI: inside the layer it would inherit
          `transform: scale(canvasZoom)` and shrink to an unusable strip at
          10%. It anchors itself from the heading's measured client rect. */}
      {selectedSectionHeading && (
        <SectionHeadingToolbar
          padlet={selectedSectionHeading}
          headingElement={selectedSectionHeadingElement}
          viewportRevision={canvasZoom}
          onChangeLevel={setSectionHeadingLevel}
          onChangeTextStyle={setSectionHeadingTextStyle}
          onChangeColor={setSectionHeadingColor}
        />
      )}
      {imageToolbarPadletId && (
        <div
          className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
          onClick={() => setImageToolbarPadletId(null)}
        >
          {/* Three-column grid, not a centered flex row (see PostEditorShell.tsx
              for the same fix and rationale): the two flanking columns are
              both `1fr`, always equal width to each other regardless of
              what (or whether anything) is open in them, so the card's
              on-screen position never shifts when a side panel opens,
              closes, or changes width. Width is fixed at the original max-w
              bound (rather than shrink-to-content) because the flanking
              `1fr` columns need a definite container width to distribute
              against. Grid tracks are pointer-events: none (pure layout,
              often wider than their visible content) with pointer events
              re-enabled only on the actual toolbar/card/panel boxes, so
              empty grid space still counts as a genuine backdrop click. */}
          <div
            className="relative grid items-start gap-6"
            style={{
              gridTemplateColumns: '1fr auto 1fr',
              width: 'calc(100vw - 80px)',
              maxHeight: 'calc(100vh - 80px)',
              pointerEvents: 'none',
            }}
          >
            <div className="flex items-start justify-end" style={{ pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {activeImageToolbarPadlet && (
              <ImageActionsToolbar
                currentCardColor={activeImageToolbarPadlet.metadata?.cardColor || '#ffffff'}
                commentCount={activeImageToolbarPadlet.metadata?.detachedComments?.length || 0}
                commentBadgeColor={activeImageToolbarPadlet.metadata?.badgeColor || '#facc15'}
                onColorClick={() => {
                  const nextOpen = !isImageColorPickerOpen;
                  setIsImageColorPickerOpen(nextOpen);
                  if (nextOpen) {
                    setIsImageEmojiOpen(false);
                    if (cardCommentPopupPadletId === activeImageToolbarPadlet.id) {
                      setCardCommentPopupPadletId(null);
                      setCommentColorPopupId(null);
                    }
                    if (textStylePadletId === activeImageToolbarPadlet.id) setTextStylePadletId(null);
                    if (captionPopupPadletId === activeImageToolbarPadlet.id) setCaptionPopupPadletId(null);
                  }
                }}
                isColorPickerOpen={isImageColorPickerOpen}
                isDrawingMode={isDrawingMode}
                isCaptionMode={captionPopupPadletId === activeImageToolbarPadlet.id}
                isTextStyleMode={textStylePadletId === activeImageToolbarPadlet.id}
                onCardColor={async (color) => {
                  try {
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: { ...activeImageToolbarPadlet.metadata, cardColor: color },
                      updated_at: new Date().toISOString(),
                    });
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update card color:', err);
                  }
                }}
                onTopStrip={async (color) => {
                  try {
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: { ...(activeImageToolbarPadlet.metadata || {}), topStrip: color },
                      updated_at: new Date().toISOString(),
                    });
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update top strip:', err);
                  }
                }}
                onCaptionTextColor={async (color) => {
                  try {
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: {
                        ...activeImageToolbarPadlet.metadata,
                        captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color }
                      },
                      updated_at: new Date().toISOString(),
                    });
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update caption text color:', err);
                  }
                }}
                currentTopStrip={activeImageToolbarPadlet.metadata?.topStrip || 'transparent'}
                currentCaptionTextColor={activeImageToolbarPadlet.metadata?.captionStyle?.color || '#1F2937'}
                onCaption={() => {
                  const isOpening = captionPopupPadletId !== activeImageToolbarPadlet.id;
                  setCaptionPopupPadletId(isOpening ? activeImageToolbarPadlet.id : null);
                  if (isOpening) {
                    // ?? not || -- an explicitly cleared caption is "" (falsy
                    // but not unset), and must stay blank rather than
                    // resurrecting the photographer attribution default.
                    const initialValue = activeImageToolbarPadlet.metadata?.caption ?? (
                      activeImageToolbarPadlet.metadata?.photographer
                        ? `Photo by ${activeImageToolbarPadlet.metadata.photographer}`
                        : ''
                    );
                    setEditingCaption(initialValue);
                    setActiveImageStyleTarget('caption');
                    setIsImageColorPickerOpen(false);
                    setIsImageEmojiOpen(false);
                    if (cardCommentPopupPadletId === activeImageToolbarPadlet.id) {
                      setCardCommentPopupPadletId(null);
                      setCommentColorPopupId(null);
                    }
                  }
                }}
                onTextStyle={() => {
                  const isOpening = textStylePadletId !== activeImageToolbarPadlet.id;
                  setTextStylePadletId(isOpening ? activeImageToolbarPadlet.id : null);
                  if (isOpening && captionPopupPadletId !== activeImageToolbarPadlet.id) {
                    setCaptionPopupPadletId(activeImageToolbarPadlet.id);
                    const initialValue = activeImageToolbarPadlet.metadata?.caption ?? (
                      activeImageToolbarPadlet.metadata?.photographer
                        ? `Photo by ${activeImageToolbarPadlet.metadata.photographer}`
                        : ''
                    );
                    setEditingCaption(initialValue);
                  }
                  if (isOpening) {
                    setActiveImageStyleTarget('caption');
                    setIsImageColorPickerOpen(false);
                    setIsImageEmojiOpen(false);
                    if (cardCommentPopupPadletId === activeImageToolbarPadlet.id) {
                      setCardCommentPopupPadletId(null);
                      setCommentColorPopupId(null);
                    }
                  }
                }}
                onSelectColor={async (color) => {
                  try {
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: {
                        ...activeImageToolbarPadlet.metadata,
                        captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color }
                      },
                      updated_at: new Date().toISOString(),
                    });
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update caption color:', err);
                  }
                }}
                onSelectHighlight={async (highlight) => {
                  try {
                    await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                      metadata: {
                        ...activeImageToolbarPadlet.metadata,
                        captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, backgroundColor: highlight }
                      },
                      updated_at: new Date().toISOString(),
                    });
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update caption highlight:', err);
                  }
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
                  const nextOpen = !isImageEmojiOpen;
                  setIsImageEmojiOpen(nextOpen);
                  if (nextOpen) {
                    setIsImageColorPickerOpen(false);
                    setCardCommentPopupPadletId(null);
                    setCommentColorPopupId(null);
                    if (textStylePadletId === activeImageToolbarPadlet.id) setTextStylePadletId(null);
                    if (captionPopupPadletId === activeImageToolbarPadlet.id) setCaptionPopupPadletId(null);
                  }
                }}
                onComment={() => {
                  const commentsToShow = activeImageToolbarPadlet.metadata?.detachedComments || [];
                  setCardCommentList(commentsToShow);
                  setCardCommentPopupPadletId(activeImageToolbarPadlet.id);
                  setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                  setEditingCardCommentId(null);
                  setEditingCardCommentText('');
                  setIsImageEmojiOpen(false);
                  setIsImageColorPickerOpen(false);
                  if (textStylePadletId === activeImageToolbarPadlet.id) setTextStylePadletId(null);
                  if (captionPopupPadletId === activeImageToolbarPadlet.id) setCaptionPopupPadletId(null);
                }}
              />
            )}
            </div>
            </div>
            {activeImageToolbarPadlet && activeImageToolbarSrc && (
              <div
                className="overflow-hidden flex flex-col border border-gray-200 shadow-2xl"
                style={{ width: '360px', backgroundColor: activeImageToolbarPadlet.metadata?.cardColor || '#ffffff', pointerEvents: 'auto' }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Top strip -- Title lives inside it, same as the canvas
                    card's own top strip (a single colored bar with the
                    title centered in it), not a separate row underneath.
                    Modal-only placeholder: no ghost "Title" text is ever
                    written to the canvas -- this is the real editable
                    field, independent of the caption below. */}
                <div
                  className="w-full flex-shrink-0 flex items-center px-2"
                  style={{
                    minHeight: '28px',
                    backgroundColor: isStripVisible(activeImageToolbarPadlet.metadata?.topStrip)
                      ? activeImageToolbarPadlet.metadata?.topStrip
                      : 'rgba(0,0,0,0.04)',
                  }}
                >
                  <input
                    type="text"
                    value={imageTitleDraft}
                    onChange={(e) => setImageTitleDraft(e.target.value)}
                    onFocus={() => {
                      setActiveImageStyleTarget('title');
                      if (textStylePadletId !== activeImageToolbarPadlet.id) {
                        setTextStylePadletId(activeImageToolbarPadlet.id);
                      }
                    }}
                    onBlur={() => updatePadletTitle(activeImageToolbarPadlet.id, imageTitleDraft.trim())}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    placeholder="Title"
                    className={`w-full text-sm font-semibold bg-transparent outline-none border-b placeholder:opacity-40 placeholder:font-normal rounded px-1 -mx-1 ${
                      activeImageStyleTarget === 'title' ? 'border-blue-400 bg-blue-50/40' : 'border-transparent focus:border-blue-400'
                    }`}
                    style={resolveCaptionStyle(
                      activeImageToolbarPadlet.metadata?.titleStyle,
                      isStripVisible(activeImageToolbarPadlet.metadata?.topStrip)
                        ? contrastIconColor(activeImageToolbarPadlet.metadata?.topStrip as string)
                        : '#374151'
                    )}
                  />
                </div>
                {/* Image */}
                <div className="relative overflow-hidden bg-gray-50 flex items-center justify-center min-h-[100px]">
                  <img
                    src={activeImageToolbarSrc}
                    alt={activeImageToolbarPadlet.metadata?.caption || 'Image'}
                    className="w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"
                  />
                </div>
                {/* Reactions row */}
                {(activeImageToolbarPadlet.metadata?.reactions?.length ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5">
                    <ReactionDisplay
                      reactions={activeImageToolbarPadlet.metadata?.reactions || []}
                      onAddClick={() => setIsImageEmojiOpen(true)}
                      onReactionClick={async (emoji) => {
                        try {
                          const currentReactions = activeImageToolbarPadlet.metadata?.reactions || [];
                          const indexToRemove = currentReactions.indexOf(emoji);
                          if (indexToRemove === -1) return;
                          const newReactions = [
                            ...currentReactions.slice(0, indexToRemove),
                            ...currentReactions.slice(indexToRemove + 1),
                          ];
                          await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                            metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          });
                          fetchData();
                        } catch (err) {
                          console.error('Failed to remove reaction:', err);
                        }
                      }}
                    />
                  </div>
                )}
                {/* Caption -- the wrapping mousedown hands the Text style
                    panel's target back to 'caption' if the Title input had
                    it, so clicking into the caption always makes it
                    editable rather than staying readOnly under a stale
                    'title' target. */}
                <div onMouseDown={() => setActiveImageStyleTarget('caption')}>
                  <InlineCaption
                    value={(captionPopupPadletId === activeImageToolbarPadlet.id || (textStylePadletId === activeImageToolbarPadlet.id && activeImageStyleTarget === 'caption'))
                      ? editingCaption
                      : (activeImageToolbarPadlet.metadata?.caption ?? (activeImageToolbarPadlet.metadata?.photographer ? `Photo by ${activeImageToolbarPadlet.metadata.photographer}` : ''))}
                    isEditing={captionPopupPadletId === activeImageToolbarPadlet.id || (textStylePadletId === activeImageToolbarPadlet.id && activeImageStyleTarget === 'caption')}
                    color={activeImageToolbarPadlet.metadata?.captionStyle?.color}
                    backgroundColor={activeImageToolbarPadlet.metadata?.captionStyle?.backgroundColor}
                    textStyle={{
                      ...(() => {
                        const resolved = resolveCaptionStyle(activeImageToolbarPadlet.metadata?.captionStyle);
                        return { textDecoration: resolved.textDecoration, textAlign: resolved.textAlign };
                      })(),
                      fontSize: activeImageToolbarPadlet.metadata?.captionStyle?.fontSize,
                      fontWeight: activeImageToolbarPadlet.metadata?.captionStyle?.fontWeight,
                      fontStyle: activeImageToolbarPadlet.metadata?.captionStyle?.fontStyle,
                      fontFamily: activeImageToolbarPadlet.metadata?.captionStyle?.fontFamily,
                      lineHeight: activeImageToolbarPadlet.metadata?.captionStyle?.lineHeight,
                    }}
                    onChange={(next) => setEditingCaption(next)}
                    onTextSelect={() => {
                      // Mirrors the Text style toolbar button's own opening
                      // logic (onTextStyle above) -- highlighting caption
                      // text should reach the same state the button reaches,
                      // not a partial version of it.
                      const isOpening = textStylePadletId !== activeImageToolbarPadlet.id || activeImageStyleTarget !== 'caption';
                      setTextStylePadletId(activeImageToolbarPadlet.id);
                      setActiveImageStyleTarget('caption');
                      if (isOpening && captionPopupPadletId !== activeImageToolbarPadlet.id) {
                        setCaptionPopupPadletId(activeImageToolbarPadlet.id);
                        const initialValue = activeImageToolbarPadlet.metadata?.caption ?? (
                          activeImageToolbarPadlet.metadata?.photographer
                            ? `Photo by ${activeImageToolbarPadlet.metadata.photographer}`
                            : ''
                        );
                        setEditingCaption(initialValue);
                      }
                      if (isOpening) {
                        setIsImageColorPickerOpen(false);
                        setIsImageEmojiOpen(false);
                        if (cardCommentPopupPadletId === activeImageToolbarPadlet.id) {
                          setCardCommentPopupPadletId(null);
                          setCommentColorPopupId(null);
                        }
                      }
                    }}
                    onCommit={async () => {
                      try {
                        await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                          metadata: { ...activeImageToolbarPadlet.metadata, caption: editingCaption },
                          updated_at: new Date().toISOString(),
                        });
                        fetchData();
                      } catch (err) {
                        console.error('Save failed on commit:', err);
                      }
                    }}
                  />
                </div>
              </div>
            )}
            {/* Right-side grid column (same architecture as Note/Document's
                sharedPanel slot in PostEditorShell.tsx): this column is
                `1fr`, always equal width to the toolbar's `1fr` column
                regardless of which panel (if any) is open, so opening one
                no longer drags the card sideways. */}
            <div className="flex items-start justify-start" style={{ pointerEvents: 'none' }}>
            <div style={{ pointerEvents: 'auto' }} onClick={(e) => e.stopPropagation()}>
            {activeImageToolbarPadlet && textStylePadletId === activeImageToolbarPadlet.id && (
              <div
                className="relative animate-in fade-in zoom-in duration-200 bg-white rounded-lg shadow-xl border border-gray-200 px-3 pb-3 pt-3 min-w-[240px]"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setTextStylePadletId(null)}
                  className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  {activeImageStyleTarget === 'title' ? 'Editing: Post name' : 'Editing: Caption'}
                </div>
                {(() => {
                  // Title and caption each have their own style object
                  // (titleStyle / captionStyle) -- the panel reads/writes
                  // whichever one activeImageStyleTarget currently points
                  // at, same per-target pattern as Todo's title/task color.
                  const styleKey = activeImageStyleTarget === 'title' ? 'titleStyle' : 'captionStyle';
                  const activeStyle: NonNullable<typeof activeImageToolbarPadlet.metadata>['captionStyle'] = activeImageToolbarPadlet.metadata?.[styleKey] || {};
                  const writeActiveStyle = (updates: typeof activeStyle) => {
                    const nextMeta = { ...(activeImageToolbarPadlet.metadata || {}), [styleKey]: { ...activeStyle, ...updates } };
                    setPadlets((prev) => prev.map((p) => (p.id === activeImageToolbarPadlet.id ? { ...p, metadata: nextMeta } : p)));
                    commitPadletMeta(activeImageToolbarPadlet.id, nextMeta);
                  };
                  const isActiveBold = activeStyle.fontWeight === '700' || activeStyle.fontWeight === 'bold';
                  const isActiveItalic = activeStyle.fontStyle === 'italic';
                  return (
                    <TextStylePopup
                      isOpen={true}
                      onOpenChange={(open) => !open && setTextStylePadletId(null)}
                      onSelectHeading={(level) => {
                        const baseStyle = activeStyle;
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
                        writeActiveStyle(nextStyle);
                      }}
                      onSelectColor={(color) => writeActiveStyle({ color })}
                      onSelectHighlight={(color) => writeActiveStyle({ backgroundColor: color })}
                      currentHeading={activeStyle.heading || 'normal'}
                      currentColor={activeStyle.color}
                      currentHighlight={activeStyle.backgroundColor}
                      hideCloseButton
                      onBold={() => writeActiveStyle({ fontWeight: isActiveBold ? '400' : '700' })}
                      onItalic={() => writeActiveStyle({ fontStyle: isActiveItalic ? 'normal' : 'italic' })}
                      onUnderline={() => writeActiveStyle({ underline: !activeStyle.underline })}
                      onStrikethrough={() => writeActiveStyle({ strikethrough: !activeStyle.strikethrough })}
                      onAlign={() => writeActiveStyle({ textAlign: nextTextAlign(activeStyle.textAlign || 'left') })}
                      isBold={isActiveBold}
                      isItalic={isActiveItalic}
                      isUnderline={!!activeStyle.underline}
                      isStrikethrough={!!activeStyle.strikethrough}
                    />
                  );
                })()}
              </div>
            )}
            {activeImageToolbarPadlet && isImageEmojiOpen && (
              <div
                className="animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div>
                  <EmojiReactionPicker
                    isOpen={isImageEmojiOpen}
                    onOpenChange={setIsImageEmojiOpen}
                    onSelectEmoji={async (emoji) => {
                      try {
                        const currentReactions = activeImageToolbarPadlet.metadata?.reactions || [];
                        const newReactions = [...currentReactions, emoji];
                        await updatePostFieldsPreservingFailureChannels(activeImageToolbarPadlet.id, {
                          metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                          updated_at: new Date().toISOString(),
                        });
                        setIsImageEmojiOpen(false);
                        fetchData();
                      } catch (err) {
                        console.error('Failed to add reaction:', err);
                      }
                    }}
                    inline
                  />
                </div>
              </div>
            )}
            {activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id && (
              <div
                className="absolute left-full top-0 ml-3 z-[1100] pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <CommentPopup
                  isOpen
                  onOpenChange={(open) => {
                    if (!open) setCardCommentPopupPadletId(null);
                  }}
                  commentTitle={typeof activeImageToolbarPadlet.metadata?.commentTitle === 'string' ? activeImageToolbarPadlet.metadata.commentTitle : undefined}
                  commentTitleStyle={activeImageToolbarPadlet.metadata?.commentTitleStyle}
                  onCommentTitleChange={guardCommentMutation(commentAccessMode, (title) => updatePadletMetadata(activeImageToolbarPadlet.id, { commentTitle: title === 'Comments' ? undefined : title }))}
                  onCommentTitleStyleChange={guardCommentMutation(commentAccessMode, (style) => updatePadletMetadata(activeImageToolbarPadlet.id, { commentTitleStyle: style }))}
                  onBadgeColorChange={guardCommentMutation(commentAccessMode, (color) => updatePadletMetadata(activeImageToolbarPadlet.id, { badgeColor: color }))}
                  badgeColor={activeImageToolbarPadlet.metadata?.badgeColor || '#facc15'}
                  onSubmit={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardCommentComposition(commentAccessMode, (commentText: string) =>
                          commentModeMutations.submitOwnComment(activeImageToolbarPadlet.id, commentText)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentText) => {
                    const currentComments = activeImageToolbarPadlet.metadata?.detachedComments || [];
                    const newComment = {
                      id: `comment-${Date.now()}`,
                      text: commentText,
                      userId: user?.id || 'anon',
                      userName: user?.email?.split('@')[0] || 'You',
                      timestamp: Date.now(),
                    };
                    const nextComments = [...currentComments, newComment];
                    await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onEditComment={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string, text: string) =>
                          commentModeMutations.editOwnComment(activeImageToolbarPadlet.id, commentId, text)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId, text) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, text } : comment
                    );
                    await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onRemoveComment={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string) =>
                          commentModeMutations.removeOwnComment(activeImageToolbarPadlet.id, commentId)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId) => {
                    const nextComments = cardCommentList.filter((comment: any) => comment.id !== commentId);
                    await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onToggleCommentStrikethrough={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string) => {
                          const target = cardCommentList.find((c: any) => c.id === commentId);
                          commentModeMutations.toggleOwnCommentStrikethrough(activeImageToolbarPadlet.id, commentId, !target?.isStrikethrough);
                        })
                      : guardCommentMutation(commentAccessMode, async (commentId) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                    );
                    await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  onCommentColor={
                    commentAccessMode === 'comment' && commentModeMutations
                      ? guardOwnCommentMutation(commentAccessMode, user?.id, (id) => cardCommentList.find((c: any) => c.id === id), (commentId: string, textColor?: string, backgroundColor?: string) =>
                          commentModeMutations.setOwnCommentColor(activeImageToolbarPadlet.id, commentId, textColor, backgroundColor)
                        )
                      : guardCommentMutation(commentAccessMode, async (commentId, textColor, backgroundColor) => {
                    const nextComments = cardCommentList.map((comment: any) =>
                      comment.id === commentId ? { ...comment, textColor, backgroundColor } : comment
                    );
                    await updatePadletMetadata(activeImageToolbarPadlet.id, { detachedComments: nextComments });
                    setCardCommentList(nextComments);
                  })}
                  enableCanonicalSelectionStyling
                  accessMode={commentAccessMode}
                  comments={cardCommentList}
                  currentUserId={user?.id || 'anon'}
                  currentUserName={user?.email?.split('@')[0] || 'You'}
                />
              </div>
            )}
            {activeImageToolbarPadlet && isImageColorPickerOpen && (
              <div
                className="relative animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setIsImageColorPickerOpen(false)}
                  className="absolute -right-3 -top-3 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-md transition-all hover:text-gray-600"
                  title="Close"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
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
                      <div className="flex justify-end" />
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
            </div>
            </div>
          </div>
        </div>
      )}

    </>
  );
}

export default React.memo(FreeformPadletCards);
