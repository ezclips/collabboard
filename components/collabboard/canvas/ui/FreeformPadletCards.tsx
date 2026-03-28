"use client";
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, @next/next/no-img-element */

import React from 'react';
import type { User } from '@supabase/supabase-js';
import type { Padlet } from '@/types/collabboard';
import { supabase } from '@/lib/supabase';
import ImageActionsToolbar from '@/components/collabboard/editors/ImageActionsToolbar';
import ImageDrawingLayer from '@/components/collabboard/editors/ImageDrawingLayer';
import ImageCropLayer from '@/components/collabboard/editors/ImageCropLayer';
import CardActionsToolbar from '@/components/collabboard/editors/CardActionsToolbar';
import CardPreview from '@/components/collabboard/CardPreview';
import CardEditor from '@/components/collabboard/CardEditor';
import CommentPost from '@/components/collabboard/CommentPost';
import TextStylePopup from '@/components/collabboard/editors/TextStylePopup';
import { CardColorPanel } from '@/components/collabboard/editors/CardColorPanel';
import ReactionDisplay from '@/components/collabboard/editors/ReactionDisplay';
import EmojiPicker from 'emoji-picker-react';
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
import { isStripVisible, formatRelativeTime, htmlToText } from '@/components/collabboard/canvas/engine/utils';
import {
  Bell, X, Edit2, PenTool, Trash2, Palette, Strikethrough, ChevronDown, ChevronUp, RefreshCw, Pencil, ArrowLeftRight,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  extractAIContentFromPadletMetadata,
  normalizeAIContent,
  resolveSavedAIHtmlFromMetadata,
} from '@/lib/ai/normalize-ai-content';
import { getConversionTargets } from '@/lib/ai/conversion-matrix';
import type { DiagramSubtype } from '@/lib/ai/contracts';
import type { StableCanvasActions } from '@/hooks/canvas/useStableCanvasActions';
import { useCanvasEditor } from '@/components/collabboard/canvas/contexts/CanvasEditorContext';
import { useCanvasConfig } from '@/components/collabboard/canvas/contexts/CanvasConfigContext';

const DND_KIND_CONTAINER_MOVE = 'columns-container-move';

type FreeformPadletActionMap = {
  duplicatePadlet: (id: string) => void;
  requestDeletePadlet: (id: string) => void;
  cutPadlet: (id: string) => void;
  copyPadlet: (id: string) => void;
  lockPadlet: (id: string) => void;
  movePadletLayer: (id: string, dir: 'front' | 'back') => void;
  groupIntoColumn: (id: string) => void;
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
  user: User | null;
  containerRef: React.RefObject<HTMLDivElement | null>;

  // Flags
  isDragging: boolean;
  draggingPadletId: string | null;
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
}



// -- Component ----------------------------------------------------------------- 
function FreeformPadletCards(props: FreeformPadletCardsProps) {
  const {
    rootPadlets, padlets, setPadlets, user, containerRef,
    isDragging, draggingPadletId, isGraphConnectMode,
    isLineMode, isDrawingMode,
    selectedPadletId, selectedPadletIds, setSelectedPadletId, setGraphConnectSelection, graphRefreshToken,
    closeAllToolbars, handlePadletMouseDown, getClickedSide,
    stableActions,
  } = props;
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
  } = useCanvasConfig();

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
    cardColorTab,
    setCardColorTab,
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
  } = useCanvasEditor();

  const {
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
  } = stableActions;

  const [expandedContainers, setExpandedContainers] = React.useState<Record<string, boolean>>({});
  const [expandableContainers, setExpandableContainers] = React.useState<Record<string, boolean>>({});
  const [expandedAIPosts, setExpandedAIPosts] = React.useState<Record<string, boolean>>({});
  const [expandableAIPosts, setExpandableAIPosts] = React.useState<Record<string, boolean>>({});
  const aiExportTargetsRef = React.useRef<Record<string, HTMLDivElement | null>>({});
  const aiResizeRef = React.useRef<{ id: string; x: number; y: number; w: number; h: number } | null>(null);
  const activeImageToolbarPadlet = imageToolbarPadletId
    ? padlets.find((padlet) => padlet.id === imageToolbarPadletId) ?? null
    : null;
  const activeCardToolbarPadlet = cardToolbarPadletId
    ? padlets.find((p) => p.id === cardToolbarPadletId) ?? null
    : null;
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
      setIsCardEditorOpen(true);
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
    setIsCardEditorOpen,
    setIsContainerEditorOpen,
    setIsAIComponentEditorOpen,
    setIsAIContentEditModalOpen,
    setIsAIContentConvertModalOpen,
    setIsNoteEditorOpen,
    openFreeformImageEditModal,
  ]);

  return (
    <>
      <div
        className="absolute inset-0 w-[10000px] h-[10000px] transform-origin-top-left"
        style={{
          transform: `scale(${canvasZoom})`,
          transformOrigin: '0 0'
        }}
      >
      {rootPadlets.map(padlet => (
    <div
      key={padlet.id}
      data-padlet-id={padlet.id}
      className="absolute"
      onMouseDownCapture={(e) => {
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
        cursor: isDragging && draggingPadletId === padlet.id ? 'grabbing' : 'grab',
        zIndex: draggingPadletId === padlet.id ? 10000 : ((padlet.metadata as any)?.zIndex || 1),
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
          onDuplicate={() => duplicatePadlet(padlet.id)}
          onDelete={() => requestDeletePadlet(padlet.id)}
          onCut={() => cutPadlet(padlet.id)}
          onCopy={() => copyPadlet(padlet.id)}
          onLock={() => lockPadlet(padlet.id)}
          onBringToFront={() => movePadletLayer(padlet.id, 'front')}
          onSendToBack={() => movePadletLayer(padlet.id, 'back')}
          onGroupIntoColumn={() => groupIntoColumn(padlet.id)}
          onReplaceImage={() => replaceImage(padlet.id)}
          onDownloadImage={() => downloadImage(padlet.id)}
          onToggleCropToGrid={() => toggleCropToGrid(padlet.id)}
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
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...padlet.metadata, cardColor: color },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update card color:', err);
                    }
                  }}
                  onTopStrip={async (color) => {
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...(padlet.metadata || {}), topStrip: color },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update top strip:', err);
                    }
                  }}
                  onCaptionTextColor={async (color) => {
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...padlet.metadata, captionStyle: { ...padlet.metadata?.captionStyle, color } },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
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
                      const initialValue = padlet.metadata?.caption || (padlet.metadata?.photographer ? `Photo by ${padlet.metadata.photographer}` : '');
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
                      const initialValue = padlet.metadata?.caption || (padlet.metadata?.photographer ? `Photo by ${padlet.metadata.photographer}` : '');
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
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...padlet.metadata,
                            captionStyle: { ...padlet.metadata?.captionStyle, color }
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
                      fetchData();
                    } catch (err) {
                      console.error('Failed to update caption color:', err);
                    }
                  }}
                  onSelectHighlight={async (highlight) => {
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: {
                            ...padlet.metadata,
                            captionStyle: { ...padlet.metadata?.captionStyle, backgroundColor: highlight }
                          },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', padlet.id);
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
                        const currentReactions = padlet.metadata?.reactions || [];
                        const newReactions = [...currentReactions, emojiData.emoji];
                        await supabase
                          .from('padlets')
                          .update({
                            metadata: { ...padlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', padlet.id);
                        setIsImageEmojiOpen(false);
                        fetchData();
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

            {cardCommentPopupPadletId === padlet.id && commentColorPopupId && !imageToolbarPadletId && (
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
                        ? { ...comment, textColor: color, color }
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
                  currentColor={cardCommentList.find(c => c.id === commentColorPopupId)?.textColor || cardCommentList.find(c => c.id === commentColorPopupId)?.color}
                  currentHighlight={cardCommentList.find(c => c.id === commentColorPopupId)?.backgroundColor}
                />
              </div>
            )}

            {/* Image Comments Popup - Right side (updated to match collapsed pin panel) */}
            {cardCommentPopupPadletId === padlet.id && !imageToolbarPadletId && (
              <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setNoteBadgeColorPadletId(noteBadgeColorPadletId === padlet.id ? null : padlet.id);
                          setCommentColorPopupId(null);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                        title="Badge Color"
                      >
                        <div
                          className="w-4 h-4 rounded border border-gray-300"
                          style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
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
                  {noteBadgeColorPadletId === padlet.id && (
                    <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                      <div className="grid grid-cols-6 gap-1.5">
                        {BADGE_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={async () => {
                              await updatePadletMetadata(padlet.id, { badgeColor: color });
                              setNoteBadgeColorPadletId(null);
                            }}
                            className={`rounded transition-transform hover:scale-110 ${padlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                        {cardCommentList.map((c, i) => {
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
                            const currentComments = padlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.map((comment: any) =>
                              comment.id === c.id
                                ? { ...comment, text: trimmed }
                                : comment
                            );
                            await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startEdit();
                              }}
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
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        await commitEdit();
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingCardCommentId(null);
                                        setEditingCardCommentText('');
                                        setCommentColorPopupId(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      if (commentColorPopupId === c.id) return;
                                      commitEdit();
                                    }}
                                    className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                    style={{
                                      color: c.textColor || c.color || '#4b5563',
                                      backgroundColor: c.backgroundColor || undefined,
                                    }}
                                    rows={1}
                                    autoFocus
                                  />
                                ) : (
                                  <div
                                    className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${c.isStrikethrough ? 'line-through' : ''}`}
                                    style={{
                                      color: c.textColor || c.color,
                                      backgroundColor: c.backgroundColor || undefined,
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      startEdit();
                                    }}
                                    dangerouslySetInnerHTML={{ __html: c.text }}
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
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                            }}
                            className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                            title="Color"
                            disabled={!activeCardComment}
                          >
                            <Palette className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!activeCardComment) return;
                              setEditingCardCommentId(activeCardComment.id || null);
                              setEditingCardCommentText(activeCardComment.text || '');
                              setCommentColorPopupId(null);
                            }}
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
                            const currentComments = padlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.map((comment: any) =>
                              comment.id === activeCardComment.id
                                ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                : comment
                            );
                            await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                            const currentComments = padlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                            await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                  {/* Add comment input */}
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
                            timestamp: Date.now()
                          };
                          const currentComments = padlet.metadata?.detachedComments || [];
                          inputElement.value = '';
                          await updatePadletMetadata(padlet.id, {
                            detachedComments: [...currentComments, newComment]
                          });
                          setCardCommentList([...currentComments, newComment]);
                          setActiveCardCommentId(newComment.id);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}



            <div
              key={padlet.id}
              className={`overflow-hidden flex flex-col bg-white border border-gray-200 group relative transition-all ${isPadletSelected(padlet.id) ? 'ring-2 ring-blue-500' : ''
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
              {/* Top Strip — pencil right */}
              <div
                className="w-full flex-shrink-0 flex items-center justify-end px-1.5"
                style={{
                  minHeight: '22px',
                  backgroundColor: isStripVisible(padlet.metadata?.topStrip) ? padlet.metadata?.topStrip : 'rgba(0,0,0,0.04)',
                }}
              >
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
                  className="w-full h-auto object-contain max-h-[500px] pointer-events-none select-none"
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

                        await supabase
                          .from('padlets')
                          .update({
                            metadata: { ...padlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', padlet.id);
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
                  : (padlet.metadata?.caption || (padlet.metadata?.photographer ? `Photo by ${padlet.metadata.photographer}` : ""))}
                isEditing={(captionPopupPadletId === padlet.id || textStylePadletId === padlet.id) && !imageToolbarPadletId}
                color={padlet.metadata?.captionStyle?.color}
                backgroundColor={padlet.metadata?.captionStyle?.backgroundColor}
                textStyle={{
                  fontSize: padlet.metadata?.captionStyle?.fontSize,
                  fontWeight: padlet.metadata?.captionStyle?.fontWeight,
                  fontStyle: padlet.metadata?.captionStyle?.fontStyle,
                  fontFamily: padlet.metadata?.captionStyle?.fontFamily,
                  lineHeight: padlet.metadata?.captionStyle?.lineHeight
                }}
                onChange={(next) => setEditingCaption(next)}
                onCommit={async () => {
                  try {
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: { ...padlet.metadata, caption: editingCaption },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', padlet.id);
                    fetchData();
                  } catch (err) {
                    console.error('Save failed on commit:', err);
                  }
                }}
              />

            </div>



            {/* Text Style Popup - Positioned to the right */}
            {textStylePadletId === padlet.id && !imageToolbarPadletId && (
              <div
                className="absolute left-full top-0 ml-3 z-[70] animate-in fade-in zoom-in duration-200 bg-white rounded-lg shadow-xl border border-gray-200 p-3 min-w-[240px]"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
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
                />
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
          onDelete={() => requestDeletePadlet(padlet.id)}
          onBringToFront={() => movePadletLayer(padlet.id, 'front')}
          onSendToBack={() => movePadletLayer(padlet.id, 'back')}
          onLock={() => lockPadlet(padlet.id)}
          onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}
        >
          <div
            key={padlet.id}
            className={`absolute group cursor-pointer transition-colors duration-200 ${isPadletSelected(padlet.id) ? 'ring-2 ring-blue-500 rounded-lg shadow-xl' : 'hover:shadow-xl'}`}
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
              onClick={() => {
                // Handled by parent div
              }}
              onOpenToolbar={canUseFreeformEditButton ? ((e) => {
                e.stopPropagation();
                closeAllToolbars({ cardToolbar: true });
                setCardToolbarPadletId(padlet.id);
              }) : undefined}
              onEditContent={() => {
                closeAllToolbars();
                setPadletToEdit(padlet);
                setIsCardViewerOpen(true);
              }}
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

            {/* Left Toolbar - moved to card modal */}
            {false && cardToolbarPadletId === padlet.id && (
              <div className="absolute right-full top-0 mr-3 flex flex-col justify-start z-50 animate-in fade-in slide-in-from-right-2 duration-200">
                <CardActionsToolbar
                  padlet={padlet}
                  isCardView={padlet.metadata?.showCardView}
                  onColorClick={(e, type) => {
                    e.stopPropagation();
                    setCardColorTab(type);
                    setIsCardColorPickerOpen(true);
                    setPadletToEdit(padlet);
                  }}
                  onReplaceIcon={() => {
                    closeAllToolbars();
                    setIconReplaceTargetPadlet(padlet);
                    setPadletToEdit(padlet);
                    setIsLibraryOpen(true);
                  }}
                  onToggleCardView={() => {
                    closeAllToolbars();
                    setPadletToEdit(padlet);
                    setIsCardEditorOpen(true);
                  }}
                  onAddReaction={(e) => {
                    e.stopPropagation();
                    setSelectedPadletId(padlet.id);
                    setIsImageEmojiOpen(true);
                  }}
                  onComment={() => {
                    // Open card-specific comments popup to the right
                    const commentsToShow = padlet.metadata?.detachedComments || [];
                    setCardCommentList(commentsToShow);
                    setCardCommentPopupPadletId(padlet.id);
                  }}
                  onDelete={() => {
                    setSelectedPadletId(padlet.id);
                    setShowDeleteConfirm(true);
                  }}
                />
              </div>
            )}

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
                <div className="shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white">
                  <EmojiPicker
                    onEmojiClick={async (emojiData) => {
                      try {
                        const currentReactions = padlet.metadata?.reactions || [];
                        const newReactions = [...currentReactions, emojiData.emoji];
                        await updatePadletMetadata(padlet.id, { reactions: newReactions });
                        setIsImageEmojiOpen(false);
                      } catch (err) {
                        console.error('Failed to add reaction:', err);
                      }
                    }}
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
                      return;
                    }
                    setCardCommentList(commentsToShow);
                    setCardCommentPopupPadletId(padlet.id);
                    setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                    setEditingCardCommentId(null);
                    setEditingCardCommentText('');
                  }}
                >
                  {commentCount}
                </button>
              );
            })()}

            {cardCommentPopupPadletId === padlet.id && commentColorPopupId && !cardToolbarPadletId && (
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

            {/* Card Comments Popup - Right side */}
            {cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId && (
              <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                    <button
                      onClick={() => {
                        setCardCommentPopupPadletId(null);
                        setActiveCardCommentId(null);
                        setEditingCardCommentId(null);
                        setEditingCardCommentText('');
                        setCommentColorPopupId(null);
                      }}
                      className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {cardCommentList.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-4">No comments yet</p>
                  ) : (
                    <div className="flex gap-2 relative">
                      <div className="flex-1 space-y-2 max-h-[360px] overflow-y-auto overflow-x-hidden pr-0 scrollbar-ultrathin">
                        {cardCommentList.map((c, i) => {
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
                            const currentComments = padlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.map((comment: any) =>
                              comment.id === c.id
                                ? { ...comment, text: trimmed }
                                : comment
                            );
                            await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                              onDoubleClick={(e) => {
                                e.stopPropagation();
                                startEdit();
                              }}
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
                                      if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        await commitEdit();
                                      }
                                      if (e.key === 'Escape') {
                                        setEditingCardCommentId(null);
                                        setEditingCardCommentText('');
                                        setCommentColorPopupId(null);
                                      }
                                    }}
                                    onBlur={() => {
                                      if (commentColorPopupId === c.id) return;
                                      commitEdit();
                                    }}
                                    className="w-full text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                    style={{
                                      color: c.textColor || c.color || '#4b5563',
                                      backgroundColor: c.backgroundColor || undefined,
                                    }}
                                    rows={1}
                                    autoFocus
                                  />
                                ) : (
                                  <div
                                    className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${c.isStrikethrough ? 'line-through' : ''}`}
                                    style={{
                                      color: c.textColor || c.color,
                                      backgroundColor: c.backgroundColor || undefined,
                                    }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      startEdit();
                                    }}
                                    dangerouslySetInnerHTML={{ __html: c.text }}
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
                            onMouseDown={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                            }}
                            className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                            title="Color"
                            disabled={!activeCardComment}
                          >
                            <Palette className="w-3 h-3" />
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              if (!activeCardComment) return;
                              setEditingCardCommentId(activeCardComment.id || null);
                              setEditingCardCommentText(activeCardComment.text || '');
                              setCommentColorPopupId(null);
                            }}
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
                            const currentComments = padlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.map((comment: any) =>
                              comment.id === activeCardComment.id
                                ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                : comment
                            );
                            await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                            const currentComments = padlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                            await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                  {/* Add comment input */}
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
                            timestamp: Date.now()
                          };
                          const currentComments = padlet.metadata?.detachedComments || [];
                          inputElement.value = '';
                          await updatePadletMetadata(padlet.id, {
                            detachedComments: [...currentComments, newComment]
                          });
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
        </NotePostContextMenu>
      )}

      {/* Render Standalone Comment Marker */}
      {(padlet.type === 'comment' || (padlet.type as string) === 'Comment') && (
        <CommentPostContextMenu
          padlet={padlet}
          onSelect={() => setSelectedPadletId(padlet.id)}
          onDuplicate={() => duplicatePadlet(padlet.id)}
          onDelete={() => requestDeletePadlet(padlet.id)}
          onCut={() => cutPadlet(padlet.id)}
          onCopy={() => copyPadlet(padlet.id)}
          onPaste={handlePaste}
          onRename={() => renameComment(padlet.id)}
          onLock={() => lockPadlet(padlet.id)}
          onBringToFront={() => movePadletLayer(padlet.id, 'front')}
          onSendToBack={() => movePadletLayer(padlet.id, 'back')}
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
                  <div className="relative">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">{padlet.metadata?.commentTitle || 'Comments'}</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setCollapsedBadgeColorOpen(!collapsedBadgeColorOpen)}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                          title="Badge Color"
                        >
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
                          />
                        </button>
                        <button
                          className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                          onClick={() => {
                            setCollapsedPopupPadletId(null);
                            setCollapsedBadgeColorOpen(false);
                          }}
                          title="Close"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {collapsedBadgeColorOpen && (
                      <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                        <div className="grid grid-cols-6 gap-1.5">
                          {BADGE_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={async () => {
                                await updatePadletMetadata(padlet.id, { badgeColor: color });
                                setCollapsedBadgeColorOpen(false);
                              }}
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
                              onSelectColor={async (color) => {
                                const currentComments = padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((c: any) =>
                                  c.id === collapsedCommentColorPopupId ? { ...c, textColor: color, color } : c
                                );
                                await updatePadletMetadata(padlet.id, { comments: nextComments });
                              }}
                              onSelectHighlight={async (color) => {
                                const currentComments = padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((c: any) =>
                                  c.id === collapsedCommentColorPopupId ? { ...c, backgroundColor: color } : c
                                );
                                await updatePadletMetadata(padlet.id, { comments: nextComments });
                              }}
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
                                      className={`text-xs text-gray-600 mt-0.5 whitespace-pre-wrap break-words ${comment.isStrikethrough ? 'line-through' : ''}`}
                                      style={{
                                        color: comment.textColor || comment.color,
                                        backgroundColor: comment.backgroundColor || undefined,
                                      }}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={(e) => e.stopPropagation()}
                                      onDoubleClick={(e) => {
                                        e.stopPropagation();
                                        startEdit();
                                      }}
                                      dangerouslySetInnerHTML={{ __html: comment.text }}
                                    />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                          {collapsedEditingCommentId && collapsedActiveCommentId && collapsedEditingCommentId === collapsedActiveCommentId ? (
                            <button
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                              }}
                              onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                setCollapsedCommentColorPopupId(collapsedCommentColorPopupId === collapsedActiveCommentId ? null : collapsedActiveCommentId);
                              }}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                              title="Color"
                              disabled={!collapsedActiveCommentId}
                            >
                              <Palette className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (!collapsedActiveCommentId) return;
                                const current = padlet.metadata?.comments?.find((c: any) => c.id === collapsedActiveCommentId);
                                setCollapsedEditingCommentId(collapsedActiveCommentId);
                                setCollapsedEditingText(htmlToText(current?.text || ''));
                                setCollapsedCommentColorPopupId(null);
                              }}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500 disabled:opacity-40 disabled:hover:text-gray-300"
                              title="Edit"
                              disabled={!collapsedActiveCommentId}
                            >
                              <PenTool className="w-3 h-3" />
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              if (!collapsedActiveCommentId) return;
                              const currentComments = padlet.metadata?.comments || [];
                              const nextComments = currentComments.map((c: any) =>
                                c.id === collapsedActiveCommentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c
                              );
                              await updatePadletMetadata(padlet.id, { comments: nextComments });
                            }}
                            className={`p-1 rounded transition-colors ${padlet.metadata?.comments?.find((c: any) => c.id === collapsedActiveCommentId)?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                            title="Strikethrough"
                            disabled={!collapsedActiveCommentId}
                          >
                            <Strikethrough className="w-3 h-3" />
                          </button>
                          <button
                            onClick={async () => {
                              if (!collapsedActiveCommentId) return;
                              const currentComments = padlet.metadata?.comments || [];
                              const nextComments = currentComments.filter((c: any) => c.id !== collapsedActiveCommentId);
                              await updatePadletMetadata(padlet.id, { comments: nextComments });
                              setCollapsedActiveCommentId(null);
                              setCollapsedEditingCommentId(null);
                              setCollapsedEditingText('');
                              setCollapsedCommentColorPopupId(null);
                            }}
                            className="p-1 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 disabled:hover:text-gray-300"
                            title="Delete"
                            disabled={!collapsedActiveCommentId}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Add comment input */}
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
                              timestamp: Date.now()
                            };
                            const currentComments = padlet.metadata?.comments || [];
                            inputElement.value = '';
                            await updatePadletMetadata(padlet.id, {
                              comments: [...currentComments, newComment]
                            });
                            setCollapsedActiveCommentId(newComment.id);
                          }
                        }}
                      />
                    </div>
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
                  commentTitle={padlet.metadata?.commentTitle || 'Comments'}
                  selected={isPadletSelected(padlet.id)}
                  showMenu={true}
                  onMenuClick={() => {
                    closeAllToolbars();
                    setPadletToEdit(padlet);
                    setIsCommentEditorOpen(true);
                  }}
                  onAddComment={async (text) => {
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
                  }}
                  onEditComment={async (commentId, text) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.map((comment: any) =>
                      comment.id === commentId ? { ...comment, text } : comment
                    );
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  }}
                  onToggleCommentStrikethrough={async (commentId) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.map((comment: any) =>
                      comment.id === commentId
                        ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                        : comment
                    );
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  }}
                  onDeleteComment={async (commentId) => {
                    const currentComments = padlet.metadata?.comments || [];
                    const nextComments = currentComments.filter((comment: any) => comment.id !== commentId);
                    await updatePadletMetadata(padlet.id, { comments: nextComments });
                  }}
                  onUpdateCommentColor={async (commentId, textColor, backgroundColor) => {
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
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isDragging) {
                      closeAllToolbars(); // Ensure all other tools (lines) are closed
                      setSelectedPadletId(padlet.id);
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    closeAllToolbars();
                    setSelectedPadletId(null);
                    setPadletToEdit(padlet);
                    setIsCommentEditorOpen(true);
                  }}
                  onEdit={() => {
                    closeAllToolbars();
                    setPadletToEdit(padlet);
                    setIsCommentEditorOpen(true);
                  }}
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
                          onClick={async () => {
                            await updatePadletMetadata(padlet.id, { badgeColor: color });
                            setInternalBadgeColorPopupId(null);
                            setInternalBadgePopupPosition(null);
                          }}
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
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, textColor: color }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      }}
                      onSelectHighlight={async (color) => {
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, backgroundColor: color }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      }}
                      currentHeading="normal"
                      currentColor={cardCommentList.find(c => c.id === commentColorPopupId)?.textColor || cardCommentList.find(c => c.id === commentColorPopupId)?.color}
                      currentHighlight={cardCommentList.find(c => c.id === commentColorPopupId)?.backgroundColor}
                    />
                  </div>
                )}

                {/* Todo Comments Popup - Right side */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                    <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setNoteBadgeColorPadletId(noteBadgeColorPadletId === padlet.id ? null : padlet.id);
                              setCommentColorPopupId(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                            title="Badge Color"
                          >
                            <div
                              className="w-4 h-4 rounded border border-gray-300"
                              style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
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
                      {noteBadgeColorPadletId === padlet.id && (
                        <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                          <div className="grid grid-cols-6 gap-1.5">
                            {BADGE_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={async () => {
                                  await updatePadletMetadata(padlet.id, { badgeColor: color });
                                  setNoteBadgeColorPadletId(null);
                                }}
                                className={`rounded transition-transform hover:scale-110 ${padlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                        <div className="flex gap-3">
                          <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-0 mr-2 scrollbar-ultrathin">
                            {cardCommentList.map((c, i) => {
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
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === c.id
                                    ? { ...comment, text: trimmed }
                                    : comment
                                );
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                                setCardCommentList(nextComments);
                                setEditingCardCommentId(null);
                                setEditingCardCommentText('');
                                setCommentColorPopupId(null);
                              };

                              return (
                                <div
                                  key={c.id || i}
                                  className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                  onClick={() => setActiveCardCommentId(c.id || null)}
                                >
                                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {c.userName?.charAt(0) || 'U'}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-700">{c.userName || 'User'}</span>
                                      <span className="text-[10px] text-gray-400">{formatRelativeTime(c.timestamp)}</span>
                                    </div>
                                    {isEditing ? (
                                      <textarea
                                        value={editingCardCommentText}
                                        onChange={(e) => setEditingCardCommentText(e.target.value)}
                                        onInput={(e) => {
                                          const el = e.currentTarget;
                                          el.style.height = 'auto';
                                          el.style.height = `${el.scrollHeight}px`;
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            await commitEdit();
                                          }
                                          if (e.key === 'Escape') {
                                            setEditingCardCommentId(null);
                                            setEditingCardCommentText('');
                                            setCommentColorPopupId(null);
                                          }
                                        }}
                                        onBlur={() => {
                                          if (commentColorPopupId === c.id) return;
                                          commitEdit();
                                        }}
                                        className="w-full text-xs mt-0.5 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                        rows={1}
                                        autoFocus
                                      />
                                    ) : (
                                      <p
                                        className={`text-xs text-gray-600 mt-0.5 break-words whitespace-pre-wrap ${c.isStrikethrough ? 'line-through' : ''}`}
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                      >
                                        {c.text}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                            {editingCardCommentId && activeCardComment && editingCardCommentId === activeCardComment.id ? (
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                                  setImageToolbarPadletId(null);
                                }}
                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                title="Color"
                                disabled={!activeCardComment}
                              >
                                <Palette className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!activeCardComment) return;
                                  setEditingCardCommentId(activeCardComment.id || null);
                                  setEditingCardCommentText(activeCardComment.text || '');
                                  setCommentColorPopupId(null);
                                }}
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
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === activeCardComment.id
                                    ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                    : comment
                                );
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                                setCardCommentList(nextComments);
                              }}
                              className={`p-1 rounded transition-colors ${activeCardComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                              title="Strikethrough"
                              disabled={!activeCardComment}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                                <path d="M14 12a4 4 0 0 1 0 8H6" />
                                <line x1="4" y1="12" x2="20" y2="12" />
                              </svg>
                            </button>
                            <button
                              onClick={async () => {
                                if (!activeCardComment) return;
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" x2="10" y1="11" y2="17" />
                                <line x1="14" x2="14" y1="11" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
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
        const content = (
          <div
            className={`group overflow-hidden flex flex-col cursor-pointer ${isPadletSelected(padlet.id)
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
              border: '1px solid #e5e7eb',
              backgroundColor: padlet.metadata?.cardColor || '#ffffff',
            }}
          >
            {/* Top strip — 3-column grid: [pencil | title centered | mirror] */}
            {(() => {
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
                        {isAIPost && (
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
                  {/* Center: title for containers */}
                  <div className="flex items-center justify-center px-1 min-w-0">
                    {isContainer && padlet.title && (
                      <span
                        className="text-xs font-semibold text-center break-words leading-snug py-1"
                        style={{ color: freeformTitleColor }}
                      >
                        {padlet.title}
                      </span>
                    )}
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
            {padlet.type === 'ai-component' && !(padlet.metadata as any)?.isLocked && (
              <div
                data-no-drag="true"
                onPointerDown={(e) => {
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
                  if (!aiResizeRef.current || aiResizeRef.current.id !== padlet.id) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const dx = (e.clientX - aiResizeRef.current.x) / canvasZoom;
                  const dy = (e.clientY - aiResizeRef.current.y) / canvasZoom;
                  const newW = Math.max(200, Math.round(aiResizeRef.current.w + dx));
                  const newH = Math.max(150, Math.round(aiResizeRef.current.h + dy));
                  aiResizeRef.current = null;
                  supabase.from('padlets').update({ width: newW, height: newH, updated_at: new Date().toISOString() }).eq('id', padlet.id);
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
                  {/* Todo Title */}
                  {padlet.metadata.todoTitle && (
                    <h4 className="text-xs font-semibold text-gray-800 mb-1">
                      {padlet.metadata.todoTitle}
                    </h4>
                  )}
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
                            const { error } = await supabase
                              .from('padlets')
                              .update({
                                content: JSON.stringify(updatedTasks),
                                metadata: updatedMetadata,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', padlet.id);
                            if (error) throw error;
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

              {/* Table Card Display */}
              {padlet.type === 'table' && (
                <div className="space-y-1">
                  {/* Table Title */}
                  <h4 className="text-xs font-semibold text-gray-800 mb-1">
                    {padlet.title || 'Table'}
                  </h4>
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
              )}

              {/* Container Card Display - uses RowColumnContainerCard for proper comment rendering */}
              {padlet.type === 'container' && (
                <RowColumnContainerCard
                  padlet={padlet}
                  allPadlets={padlets}
                  showHeader={false}
                  isExpanded={expandedContainers[padlet.id] ?? false}
                  onExpandAvailabilityChange={(available) => setExpandableContainers(prev => prev[padlet.id] === available ? prev : { ...prev, [padlet.id]: available })}
                  onDropExistingPadlet={async (containerId, droppedId) => {
                    const containerPadlet = padlets.find(p => p.id === containerId);
                    if (!containerPadlet) return;
                    const childIds = containerPadlet.metadata?.childPadletIds || [];
                    if (childIds.includes(droppedId)) return;
                    const newChildIds = [...childIds, droppedId];
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
                      fetchData();
                    } catch (err) {
                      console.error('Failed to add padlet to container:', err);
                    }
                  }}
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
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...childPadlet.metadata, comments },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', childId);
                    } catch (err) {
                      console.error('Failed to update child comments:', err);
                      toast.error('Failed to update comments');
                    }
                  }}
                />
              )}

              {/* Drawing Card Display */}
              {padlet.type === 'drawing' && (
                <PostCardContent
                  padlet={padlet}
                  onView={() => setViewDrawingPadlet(padlet)}
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
                          setPadlets(prev => prev.map(p => p.id === padlet.id ? { ...p, width: w, height: h } : p));
                        },
                        onResizeEnd: (w: number, h: number) => {
                          supabase.from('padlets').update({ width: w, height: h, updated_at: new Date().toISOString() }).eq('id', padlet.id);
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
                  dangerouslySetInnerHTML={{ __html: padlet.content || '' }}
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
            </div>
          </div>
        );

        if (padlet.type === 'link') {
          return (
            <LinkPostContextMenu
              key={padlet.id}
              padlet={padlet}
              onSelect={() => setSelectedPadletId(padlet.id)}
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'front')}
              onSendToBack={() => movePadletLayer(padlet.id, 'back')}
              onGroupIntoColumn={() => groupIntoColumn(padlet.id)}
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
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, textColor: color }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      }}
                      onSelectHighlight={async (color) => {
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, backgroundColor: color }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      }}
                      currentHeading="normal"
                      currentColor={cardCommentList.find(c => c.id === commentColorPopupId)?.textColor || cardCommentList.find(c => c.id === commentColorPopupId)?.color}
                      currentHighlight={cardCommentList.find(c => c.id === commentColorPopupId)?.backgroundColor}
                    />
                  </div>
                )}

                {/* Link Comments Popup - Right side */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                    <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setNoteBadgeColorPadletId(noteBadgeColorPadletId === padlet.id ? null : padlet.id);
                              setCommentColorPopupId(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                            title="Badge Color"
                          >
                            <div
                              className="w-4 h-4 rounded border border-gray-300"
                              style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
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
                      {noteBadgeColorPadletId === padlet.id && (
                        <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                          <div className="grid grid-cols-6 gap-1.5">
                            {BADGE_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={async () => {
                                  await updatePadletMetadata(padlet.id, { badgeColor: color });
                                  setNoteBadgeColorPadletId(null);
                                }}
                                className={`rounded transition-transform hover:scale-110 ${padlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                        <div className="flex gap-3">
                          <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-0 mr-2 scrollbar-ultrathin">
                            {cardCommentList.map((c, i) => {
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
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === c.id
                                    ? { ...comment, text: trimmed }
                                    : comment
                                );
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                                setCardCommentList(nextComments);
                                setEditingCardCommentId(null);
                                setEditingCardCommentText('');
                                setCommentColorPopupId(null);
                              };

                              return (
                                <div
                                  key={c.id || i}
                                  className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                  onClick={() => setActiveCardCommentId(c.id || null)}
                                >
                                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {c.userName?.charAt(0) || 'U'}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-700">{c.userName || 'User'}</span>
                                      <span className="text-[10px] text-gray-400">{formatRelativeTime(c.timestamp)}</span>
                                    </div>
                                    {isEditing ? (
                                      <textarea
                                        value={editingCardCommentText}
                                        onChange={(e) => setEditingCardCommentText(e.target.value)}
                                        onInput={(e) => {
                                          const el = e.currentTarget;
                                          el.style.height = 'auto';
                                          el.style.height = `${el.scrollHeight}px`;
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            await commitEdit();
                                          }
                                          if (e.key === 'Escape') {
                                            setEditingCardCommentId(null);
                                            setEditingCardCommentText('');
                                            setCommentColorPopupId(null);
                                          }
                                        }}
                                        onBlur={() => {
                                          if (commentColorPopupId === c.id) return;
                                          commitEdit();
                                        }}
                                        className="w-full text-xs mt-0.5 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                        rows={1}
                                        autoFocus
                                      />
                                    ) : (
                                      <p
                                        className={`text-xs text-gray-600 mt-0.5 break-words whitespace-pre-wrap ${c.isStrikethrough ? 'line-through' : ''}`}
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                      >
                                        {c.text}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                            {editingCardCommentId && activeCardComment && editingCardCommentId === activeCardComment.id ? (
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                                  setImageToolbarPadletId(null);
                                }}
                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                title="Color"
                                disabled={!activeCardComment}
                              >
                                <Palette className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!activeCardComment) return;
                                  setEditingCardCommentId(activeCardComment.id || null);
                                  setEditingCardCommentText(activeCardComment.text || '');
                                  setCommentColorPopupId(null);
                                }}
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
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === activeCardComment.id
                                    ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                    : comment
                                );
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                                setCardCommentList(nextComments);
                              }}
                              className={`p-1 rounded transition-colors ${activeCardComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                              title="Strikethrough"
                              disabled={!activeCardComment}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                                <path d="M14 12a4 4 0 0 1 0 8H6" />
                                <line x1="4" y1="12" x2="20" y2="12" />
                              </svg>
                            </button>
                            <button
                              onClick={async () => {
                                if (!activeCardComment) return;
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" x2="10" y1="11" y2="17" />
                                <line x1="14" x2="14" y1="11" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Add comment input */}
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
                                timestamp: Date.now()
                              };
                              const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                              inputElement.value = '';
                              await updatePadletMetadata(padlet.id, {
                                detachedComments: [...currentComments, newComment]
                              });
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
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'front')}
              onSendToBack={() => movePadletLayer(padlet.id, 'back')}
              onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}
              onGroupIntoColumn={() => groupIntoColumn(padlet.id)}
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
                        const currentComments = tableData.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, textColor: color }
                            : comment
                        );
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      }}
                      onSelectHighlight={async (color) => {
                        const currentComments = tableData.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, backgroundColor: color }
                            : comment
                        );
                        await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                        setCardCommentList(nextComments);
                      }}
                      currentHeading="normal"
                      currentColor={cardCommentList.find(c => c.id === commentColorPopupId)?.textColor || cardCommentList.find(c => c.id === commentColorPopupId)?.color}
                      currentHighlight={cardCommentList.find(c => c.id === commentColorPopupId)?.backgroundColor}
                    />
                  </div>
                )}

                {/* Table Comments Popup - Right side */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                    <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={async () => {
                              const nextOpen = noteBadgeColorPadletId === padlet.id ? null : padlet.id;
                              setNoteBadgeColorPadletId(nextOpen);
                              setCommentColorPopupId(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                            title="Badge Color"
                          >
                            <div
                              className="w-4 h-4 rounded border border-gray-300"
                              style={{ backgroundColor: tableBadgeColor }}
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
                      {noteBadgeColorPadletId === padlet.id && (
                        <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                          <div className="grid grid-cols-6 gap-1.5">
                            {BADGE_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={async () => {
                                  await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: tableComments, badgeColor: color }));
                                  setNoteBadgeColorPadletId(null);
                                }}
                                className={`rounded transition-transform hover:scale-110 ${tableBadgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                        <div className="flex gap-3">
                          <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-0 mr-2 scrollbar-ultrathin">
                            {cardCommentList.map((c, i) => {
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
                                const currentComments = tableData.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === c.id
                                    ? { ...comment, text: trimmed }
                                    : comment
                                );
                                await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                                setCardCommentList(nextComments);
                                setEditingCardCommentId(null);
                                setEditingCardCommentText('');
                                setCommentColorPopupId(null);
                              };

                              return (
                                <div
                                  key={c.id || i}
                                  className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                  onClick={() => setActiveCardCommentId(c.id || null)}
                                >
                                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {c.userName?.charAt(0) || 'U'}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-700">{c.userName || 'User'}</span>
                                      <span className="text-[10px] text-gray-400">{formatRelativeTime(c.timestamp)}</span>
                                    </div>
                                    {isEditing ? (
                                      <textarea
                                        value={editingCardCommentText}
                                        onChange={(e) => setEditingCardCommentText(e.target.value)}
                                        onInput={(e) => {
                                          const el = e.currentTarget;
                                          el.style.height = 'auto';
                                          el.style.height = `${el.scrollHeight}px`;
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            await commitEdit();
                                          }
                                          if (e.key === 'Escape') {
                                            setEditingCardCommentId(null);
                                            setEditingCardCommentText('');
                                            setCommentColorPopupId(null);
                                          }
                                        }}
                                        onBlur={() => {
                                          if (commentColorPopupId === c.id) return;
                                          commitEdit();
                                        }}
                                        className="w-full text-xs mt-0.5 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                        rows={1}
                                        autoFocus
                                      />
                                    ) : (
                                      <p
                                        className={`text-xs text-gray-600 mt-0.5 break-words whitespace-pre-wrap ${c.isStrikethrough ? 'line-through' : ''}`}
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                      >
                                        {c.text}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                            {editingCardCommentId && activeCardComment && editingCardCommentId === activeCardComment.id ? (
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                                  setImageToolbarPadletId(null);
                                }}
                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                title="Color"
                                disabled={!activeCardComment}
                              >
                                <Palette className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!activeCardComment) return;
                                  setEditingCardCommentId(activeCardComment.id || null);
                                  setEditingCardCommentText(activeCardComment.text || '');
                                  setCommentColorPopupId(null);
                                }}
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
                                const currentComments = tableData.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === activeCardComment.id
                                    ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                    : comment
                                );
                                await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                                setCardCommentList(nextComments);
                              }}
                              className={`p-1 rounded transition-colors ${activeCardComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                              title="Strikethrough"
                              disabled={!activeCardComment}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                                <path d="M14 12a4 4 0 0 1 0 8H6" />
                                <line x1="4" y1="12" x2="20" y2="12" />
                              </svg>
                            </button>
                            <button
                              onClick={async () => {
                                if (!activeCardComment) return;
                                const currentComments = tableData.comments || [];
                                const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                                await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
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
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" x2="10" y1="11" y2="17" />
                                <line x1="14" x2="14" y1="11" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Add comment input */}
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
                                timestamp: Date.now()
                              };
                              const currentComments = tableData.comments || [];
                              inputElement.value = '';
                              const nextComments = [...currentComments, newComment];
                              await updatePadletContent(padlet.id, JSON.stringify({ ...tableData, comments: nextComments, badgeColor: tableBadgeColor }));
                              setCardCommentList(nextComments);
                              setActiveCardCommentId(newComment.id);
                            }
                          }}
                        />
                      </div>
                    </div>
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
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'front')}
              onSendToBack={() => movePadletLayer(padlet.id, 'back')}
              onGroupIntoColumn={() => groupIntoColumn(padlet.id)}
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
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, textColor: color }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      }}
                      onSelectHighlight={async (color) => {
                        const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                        const nextComments = currentComments.map((comment: any) =>
                          comment.id === commentColorPopupId
                            ? { ...comment, backgroundColor: color }
                            : comment
                        );
                        await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                        setCardCommentList(nextComments);
                      }}
                      currentHeading="normal"
                      currentColor={cardCommentList.find(c => c.id === commentColorPopupId)?.textColor || cardCommentList.find(c => c.id === commentColorPopupId)?.color}
                      currentHighlight={cardCommentList.find(c => c.id === commentColorPopupId)?.backgroundColor}
                    />
                  </div>
                )}

                {/* Todo Comments Popup - Right side */}
                {cardCommentPopupPadletId === padlet.id && (
                  <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                    <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setNoteBadgeColorPadletId(noteBadgeColorPadletId === padlet.id ? null : padlet.id);
                              setCommentColorPopupId(null);
                            }}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                            title="Badge Color"
                          >
                            <div
                              className="w-4 h-4 rounded border border-gray-300"
                              style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
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
                      {noteBadgeColorPadletId === padlet.id && (
                        <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                          <div className="grid grid-cols-6 gap-1.5">
                            {BADGE_COLORS.map((color) => (
                              <button
                                key={color}
                                onClick={async () => {
                                  await updatePadletMetadata(padlet.id, { badgeColor: color });
                                  setNoteBadgeColorPadletId(null);
                                }}
                                className={`rounded transition-transform hover:scale-110 ${padlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                        <div className="flex gap-3">
                          <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-0 mr-2 scrollbar-ultrathin">
                            {cardCommentList.map((c, i) => {
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
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === c.id
                                    ? { ...comment, text: trimmed }
                                    : comment
                                );
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                                setCardCommentList(nextComments);
                                setEditingCardCommentId(null);
                                setEditingCardCommentText('');
                                setCommentColorPopupId(null);
                              };

                              return (
                                <div
                                  key={c.id || i}
                                  className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                  onClick={() => setActiveCardCommentId(c.id || null)}
                                >
                                  <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                    {c.userName?.charAt(0) || 'U'}
                                  </div>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-gray-700">{c.userName || 'User'}</span>
                                      <span className="text-[10px] text-gray-400">{formatRelativeTime(c.timestamp)}</span>
                                    </div>
                                    {isEditing ? (
                                      <textarea
                                        value={editingCardCommentText}
                                        onChange={(e) => setEditingCardCommentText(e.target.value)}
                                        onInput={(e) => {
                                          const el = e.currentTarget;
                                          el.style.height = 'auto';
                                          el.style.height = `${el.scrollHeight}px`;
                                        }}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            await commitEdit();
                                          }
                                          if (e.key === 'Escape') {
                                            setEditingCardCommentId(null);
                                            setEditingCardCommentText('');
                                            setCommentColorPopupId(null);
                                          }
                                        }}
                                        onBlur={() => {
                                          if (commentColorPopupId === c.id) return;
                                          commitEdit();
                                        }}
                                        className="w-full text-xs mt-0.5 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                        rows={1}
                                        autoFocus
                                      />
                                    ) : (
                                      <p
                                        className={`text-xs text-gray-600 mt-0.5 break-words whitespace-pre-wrap ${c.isStrikethrough ? 'line-through' : ''}`}
                                        style={{
                                          wordBreak: 'break-word',
                                          color: c.textColor || c.color,
                                          backgroundColor: c.backgroundColor || undefined,
                                        }}
                                      >
                                        {c.text}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                            {editingCardCommentId && activeCardComment && editingCardCommentId === activeCardComment.id ? (
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                                  setImageToolbarPadletId(null);
                                }}
                                className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                                title="Color"
                                disabled={!activeCardComment}
                              >
                                <Palette className="w-3 h-3" />
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  if (!activeCardComment) return;
                                  setEditingCardCommentId(activeCardComment.id || null);
                                  setEditingCardCommentText(activeCardComment.text || '');
                                  setCommentColorPopupId(null);
                                }}
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
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.map((comment: any) =>
                                  comment.id === activeCardComment.id
                                    ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                    : comment
                                );
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                                setCardCommentList(nextComments);
                              }}
                              className={`p-1 rounded transition-colors ${activeCardComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                              title="Strikethrough"
                              disabled={!activeCardComment}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                                <path d="M14 12a4 4 0 0 1 0 8H6" />
                                <line x1="4" y1="12" x2="20" y2="12" />
                              </svg>
                            </button>
                            <button
                              onClick={async () => {
                                if (!activeCardComment) return;
                                const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                                const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                                await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 6h18" />
                                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                                <line x1="10" x2="10" y1="11" y2="17" />
                                <line x1="14" x2="14" y1="11" y2="17" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Add comment input */}
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
                                timestamp: Date.now()
                              };
                              const currentComments = padlet.metadata?.detachedComments || padlet.metadata?.comments || [];
                              inputElement.value = '';
                              await updatePadletMetadata(padlet.id, {
                                detachedComments: [...currentComments, newComment]
                              });
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
            </TodoPostContextMenu>
          );
        }

        if (padlet.type === 'container') {
          return (
            <ColumnPostContextMenu
              key={padlet.id}
              padlet={padlet}
              onSelect={() => setSelectedPadletId(padlet.id)}
              onDuplicate={() => duplicatePadlet(padlet.id)}
              onDelete={() => requestDeletePadlet(padlet.id)}
              onCut={() => cutPadlet(padlet.id)}
              onCopy={() => copyPadlet(padlet.id)}
              onPaste={handlePaste}
              onRename={() => renameColumn(padlet.id)}
              onLock={() => lockPadlet(padlet.id)}
              onBringToFront={() => movePadletLayer(padlet.id, 'front')}
              onSendToBack={() => movePadletLayer(padlet.id, 'back')}
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
            onDuplicate={() => duplicatePadlet(padlet.id)}
            onDelete={() => requestDeletePadlet(padlet.id)}
            onCut={() => cutPadlet(padlet.id)}
            onCopy={() => copyPadlet(padlet.id)}
            onLock={() => lockPadlet(padlet.id)}
            onBringToFront={() => movePadletLayer(padlet.id, 'front')}
            onSendToBack={() => movePadletLayer(padlet.id, 'back')}
            onCreateSyncedCopy={() => createSyncedCopy(padlet.id)}
            onGroupIntoColumn={() => groupIntoColumn(padlet.id)}
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
                  <div className="shadow-2xl rounded-xl overflow-hidden border border-gray-200 bg-white">
                    <EmojiPicker
                      onEmojiClick={async (emojiData) => {
                        try {
                          const currentReactions = padlet.metadata?.reactions || [];
                          const newReactions = [...currentReactions, emojiData.emoji];
                          await updatePadletMetadata(padlet.id, { reactions: newReactions });
                          setIsImageEmojiOpen(false);
                        } catch (err) {
                          console.error('Failed to add reaction:', err);
                        }
                      }}
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

              {/* Note Comments Popup - Right side */}
              {cardCommentPopupPadletId === padlet.id && (
                <div className="absolute left-full top-0 ml-3 z-[1100] animate-in fade-in slide-in-from-left-2 duration-200 pointer-events-auto">
                  <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 p-4 min-w-[280px] max-w-[320px]">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-semibold text-gray-700">Comments</h4>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setNoteBadgeColorPadletId(noteBadgeColorPadletId === padlet.id ? null : padlet.id);
                            setCommentColorPopupId(null);
                          }}
                          className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                          title="Badge Color"
                        >
                          <div
                            className="w-4 h-4 rounded border border-gray-300"
                            style={{ backgroundColor: padlet.metadata?.badgeColor || '#facc15' }}
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
                    {noteBadgeColorPadletId === padlet.id && (
                      <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                        <div className="grid grid-cols-6 gap-1.5">
                          {BADGE_COLORS.map((color) => (
                            <button
                              key={color}
                              onClick={async () => {
                                await updatePadletMetadata(padlet.id, { badgeColor: color });
                                setNoteBadgeColorPadletId(null);
                              }}
                              className={`rounded transition-transform hover:scale-110 ${padlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                      <div className="flex gap-3">
                        <div className="flex-1 space-y-3 max-h-[300px] overflow-y-auto overflow-x-hidden pr-0 mr-2 scrollbar-ultrathin">
                          {cardCommentList.map((c, i) => {
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
                              const currentComments = padlet.metadata?.detachedComments || [];
                              const nextComments = currentComments.map((comment: any) =>
                                comment.id === c.id
                                  ? { ...comment, text: trimmed }
                                  : comment
                              );
                              await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                              setCardCommentList(nextComments);
                              setEditingCardCommentId(null);
                              setEditingCardCommentText('');
                              setCommentColorPopupId(null);
                            };

                            return (
                              <div
                                key={c.id || i}
                                className={`flex gap-2 rounded p-1 -m-1 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setActiveCardCommentId(c.id || null)}
                              >
                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                                  {c.userName?.charAt(0) || 'U'}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-medium text-gray-700">{c.userName || 'User'}</span>
                                    <span className="text-[10px] text-gray-400">{formatRelativeTime(c.timestamp)}</span>
                                  </div>
                                  {isEditing ? (
                                    <textarea
                                      value={editingCardCommentText}
                                      onChange={(e) => setEditingCardCommentText(e.target.value)}
                                      onInput={(e) => {
                                        const el = e.currentTarget;
                                        el.style.height = 'auto';
                                        el.style.height = `${el.scrollHeight}px`;
                                      }}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          await commitEdit();
                                        }
                                        if (e.key === 'Escape') {
                                          setEditingCardCommentId(null);
                                          setEditingCardCommentText('');
                                          setCommentColorPopupId(null);
                                        }
                                      }}
                                      onBlur={() => {
                                        if (commentColorPopupId === c.id) return;
                                        commitEdit();
                                      }}
                                      className="w-full text-xs mt-0.5 bg-gray-50 rounded px-2 py-1 outline-none border border-gray-200 focus:border-blue-400 resize-none overflow-hidden break-words whitespace-pre-wrap"
                                      style={{
                                        wordBreak: 'break-word',
                                        color: c.textColor,
                                        backgroundColor: c.backgroundColor || undefined,
                                      }}
                                      rows={1}
                                      autoFocus
                                    />
                                  ) : (
                                    <p
                                      className={`text-xs text-gray-600 mt-0.5 break-words whitespace-pre-wrap ${c.isStrikethrough ? 'line-through' : ''}`}
                                      style={{
                                        wordBreak: 'break-word',
                                        color: c.textColor,
                                        backgroundColor: c.backgroundColor || undefined,
                                      }}
                                    >
                                      {c.text}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex flex-col gap-1 flex-shrink-0 pt-1">
                          {editingCardCommentId && activeCardComment && editingCardCommentId === activeCardComment.id ? (
                            <button
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setCommentColorPopupId(commentColorPopupId === activeCardComment.id ? null : (activeCardComment.id || null));
                              }}
                              className="p-1 rounded transition-colors text-gray-300 hover:text-blue-500"
                              title="Color"
                              disabled={!activeCardComment}
                            >
                              <Palette className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                if (!activeCardComment) return;
                                setEditingCardCommentId(activeCardComment.id || null);
                                setEditingCardCommentText(activeCardComment.text || '');
                                setCommentColorPopupId(null);
                              }}
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
                              const currentComments = padlet.metadata?.detachedComments || [];
                              const nextComments = currentComments.map((comment: any) =>
                                comment.id === activeCardComment.id
                                  ? { ...comment, isStrikethrough: !comment.isStrikethrough }
                                  : comment
                              );
                              await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
                              setCardCommentList(nextComments);
                            }}
                            className={`p-1 rounded transition-colors ${activeCardComment?.isStrikethrough ? 'text-blue-500 bg-blue-50' : 'text-gray-300 hover:text-blue-500'} disabled:opacity-40 disabled:hover:text-gray-300`}
                            title="Strikethrough"
                            disabled={!activeCardComment}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M16 4H9a3 3 0 0 0-2.83 4" />
                              <path d="M14 12a4 4 0 0 1 0 8H6" />
                              <line x1="4" y1="12" x2="20" y2="12" />
                            </svg>
                          </button>
                          <button
                            onClick={async () => {
                              if (!activeCardComment) return;
                              const currentComments = padlet.metadata?.detachedComments || [];
                              const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                              await updatePadletMetadata(padlet.id, { detachedComments: nextComments });
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
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                              <line x1="10" x2="10" y1="11" y2="17" />
                              <line x1="14" x2="14" y1="11" y2="17" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Add comment input */}
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
                              timestamp: Date.now()
                            };
                            const currentComments = padlet.metadata?.detachedComments || [];
                            inputElement.value = '';
                            await updatePadletMetadata(padlet.id, {
                              detachedComments: [...currentComments, newComment]
                            });
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
          </NotePostContextMenu>
        );
      })()}
    </div>
                ))}
                {/* Freeform Graph edges: rendered INSIDE the posts container so the SVG
      fills the full 2000×1500 stage, not just the viewport. z-index 9999
      ensures arrows paint on top of every post card. */}
                {isFreeformGraphMode && canvasId && (
    <div className="absolute inset-0" style={{ zIndex: 900, pointerEvents: 'none' }}>
      <FreeformGraphLayer boardId={canvasId.toString()} posts={padlets} refreshToken={graphRefreshToken} containerRef={containerRef} zoom={canvasZoom} />
    </div>
                )}
                </div>
      {imageToolbarPadletId && (
        <div
          className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
          onClick={() => setImageToolbarPadletId(null)}
        >
          <div
            className="relative flex max-h-[calc(100vh-80px)] max-w-[calc(100vw-80px)] items-start gap-6"
            onClick={(e) => e.stopPropagation()}
          >
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
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: { ...activeImageToolbarPadlet.metadata, cardColor: color },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update card color:', err);
                  }
                }}
                onTopStrip={async (color) => {
                  try {
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: { ...(activeImageToolbarPadlet.metadata || {}), topStrip: color },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update top strip:', err);
                  }
                }}
                onCaptionTextColor={async (color) => {
                  try {
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: {
                          ...activeImageToolbarPadlet.metadata,
                          captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color }
                        },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
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
                    const initialValue = activeImageToolbarPadlet.metadata?.caption || (
                      activeImageToolbarPadlet.metadata?.photographer
                        ? `Photo by ${activeImageToolbarPadlet.metadata.photographer}`
                        : ''
                    );
                    setEditingCaption(initialValue);
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
                    const initialValue = activeImageToolbarPadlet.metadata?.caption || (
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
                onSelectColor={async (color) => {
                  try {
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: {
                          ...activeImageToolbarPadlet.metadata,
                          captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, color }
                        },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
                    fetchData();
                  } catch (err) {
                    console.error('Failed to update caption color:', err);
                  }
                }}
                onSelectHighlight={async (highlight) => {
                  try {
                    await supabase
                      .from('padlets')
                      .update({
                        metadata: {
                          ...activeImageToolbarPadlet.metadata,
                          captionStyle: { ...activeImageToolbarPadlet.metadata?.captionStyle, backgroundColor: highlight }
                        },
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', activeImageToolbarPadlet.id);
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
            {activeImageToolbarPadlet && activeImageToolbarSrc && (
              <div
                className="overflow-hidden flex flex-col border border-gray-200 shadow-2xl"
                style={{ width: '360px', backgroundColor: activeImageToolbarPadlet.metadata?.cardColor || '#ffffff' }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                {/* Top strip */}
                <div
                  className="w-full flex-shrink-0"
                  style={{
                    minHeight: '22px',
                    backgroundColor: isStripVisible(activeImageToolbarPadlet.metadata?.topStrip)
                      ? activeImageToolbarPadlet.metadata?.topStrip
                      : 'rgba(0,0,0,0.04)',
                  }}
                />
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
                          await supabase
                            .from('padlets')
                            .update({
                              metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                              updated_at: new Date().toISOString(),
                            })
                            .eq('id', activeImageToolbarPadlet.id);
                          fetchData();
                        } catch (err) {
                          console.error('Failed to remove reaction:', err);
                        }
                      }}
                    />
                  </div>
                )}
                {/* Caption */}
                <InlineCaption
                  value={(captionPopupPadletId === activeImageToolbarPadlet.id || textStylePadletId === activeImageToolbarPadlet.id)
                    ? editingCaption
                    : (activeImageToolbarPadlet.metadata?.caption || (activeImageToolbarPadlet.metadata?.photographer ? `Photo by ${activeImageToolbarPadlet.metadata.photographer}` : ''))}
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
                    try {
                      await supabase
                        .from('padlets')
                        .update({
                          metadata: { ...activeImageToolbarPadlet.metadata, caption: editingCaption },
                          updated_at: new Date().toISOString(),
                        })
                        .eq('id', activeImageToolbarPadlet.id);
                      fetchData();
                    } catch (err) {
                      console.error('Save failed on commit:', err);
                    }
                  }}
                />
              </div>
            )}
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
            {activeImageToolbarPadlet && isImageEmojiOpen && (
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
                        await supabase
                          .from('padlets')
                          .update({
                            metadata: { ...activeImageToolbarPadlet.metadata, reactions: newReactions },
                            updated_at: new Date().toISOString(),
                          })
                          .eq('id', activeImageToolbarPadlet.id);
                        setIsImageEmojiOpen(false);
                        fetchData();
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
            {activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id && (
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
                        {cardCommentList.map((c, i) => {
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
                                    dangerouslySetInnerHTML={{ __html: c.text }}
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
                            timestamp: Date.now()
                          };
                          const currentComments = activeImageToolbarPadlet.metadata?.detachedComments || [];
                          inputElement.value = '';
                          await updatePadletMetadata(activeImageToolbarPadlet.id, {
                            detachedComments: [...currentComments, newComment]
                          });
                          setCardCommentList([...currentComments, newComment]);
                          setActiveCardCommentId(newComment.id);
                        }
                      }}
                    />
                  </div>
                </div>
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
          </div>
        </div>
      )}

      {/* Card Post Modal */}
      {cardToolbarPadletId && activeCardToolbarPadlet && (
        <div
          className="fixed inset-0 z-[60000] flex items-center justify-center bg-black/35 backdrop-blur-sm"
          onClick={() => {
            setCardToolbarPadletId(null);
            setIsCardColorPickerOpen(false);
            setIsImageEmojiOpen(false);
            setCardCommentPopupPadletId(null);
            setCommentColorPopupId(null);
            setIsLibraryOpen(false);
          }}
        >
          <div
            className="relative flex max-h-[calc(100vh-80px)] max-w-[calc(100vw-80px)] items-start gap-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700"
              onClick={() => {
                setCardToolbarPadletId(null);
                setIsCardColorPickerOpen(false);
                setIsImageEmojiOpen(false);
                setCardCommentPopupPadletId(null);
                setCommentColorPopupId(null);
                setIsLibraryOpen(false);
              }}
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>

            {/* Left: CardActionsToolbar */}
            <CardActionsToolbar
              padlet={activeCardToolbarPadlet}
              isCardView={activeCardToolbarPadlet.metadata?.showCardView}
              isColorPickerOpen={isCardColorPickerOpen && padletToEdit?.id === activeCardToolbarPadlet.id}
              onColorClick={(e, type) => {
                e.stopPropagation();
                setCardColorTab(type);
                setPadletToEdit(activeCardToolbarPadlet);
                const nextOpen = !(isCardColorPickerOpen && padletToEdit?.id === activeCardToolbarPadlet.id);
                setIsCardColorPickerOpen(nextOpen);
                if (nextOpen) {
                  setIsImageEmojiOpen(false);
                  if (cardCommentPopupPadletId === activeCardToolbarPadlet.id) {
                    setCardCommentPopupPadletId(null);
                    setCommentColorPopupId(null);
                  }
                }
              }}
              onReplaceIcon={() => {
                setIconReplaceTargetPadlet(activeCardToolbarPadlet);
                setPadletToEdit(activeCardToolbarPadlet);
                setIsLibraryOpen(true);
              }}
              onToggleCardView={() => {
                setCardToolbarPadletId(null);
                setPadletToEdit(activeCardToolbarPadlet);
                setIsCardEditorOpen(true);
              }}
              onAddReaction={(e) => {
                e.stopPropagation();
                const nextOpen = !isImageEmojiOpen;
                setIsImageEmojiOpen(nextOpen);
                if (nextOpen) {
                  setIsCardColorPickerOpen(false);
                  if (cardCommentPopupPadletId === activeCardToolbarPadlet.id) {
                    setCardCommentPopupPadletId(null);
                    setCommentColorPopupId(null);
                  }
                }
              }}
              onComment={() => {
                const commentsToShow = activeCardToolbarPadlet.metadata?.detachedComments || [];
                setCardCommentList(commentsToShow);
                setCardCommentPopupPadletId(activeCardToolbarPadlet.id);
                setActiveCardCommentId(commentsToShow[commentsToShow.length - 1]?.id || null);
                setEditingCardCommentId(null);
                setEditingCardCommentText('');
                setIsImageEmojiOpen(false);
                setIsCardColorPickerOpen(false);
              }}
            />

            {/* Middle: CardPreview */}
            <div
              className="overflow-hidden flex flex-col border border-gray-200 shadow-2xl"
              style={{ width: '220px', minHeight: '200px', backgroundColor: activeCardToolbarPadlet.metadata?.backgroundColor || '#ffffff' }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <CardPreview
                padlet={activeCardToolbarPadlet}
                isSelected={false}
              />
            </div>

            {/* Color panel */}
            {isCardColorPickerOpen && padletToEdit?.id === activeCardToolbarPadlet.id && (
              <div
                className="animate-in fade-in zoom-in duration-200"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <CardColorPanel
                  iconColor={activeCardToolbarPadlet.metadata?.iconBgColor}
                  bgColor={activeCardToolbarPadlet.metadata?.backgroundColor}
                  topStrip={activeCardToolbarPadlet.metadata?.topStripColor}
                  onChangeTarget={(target, value) => {
                    if (target === 'icon') updatePadletMetadata(activeCardToolbarPadlet.id, { iconBgColor: value });
                    if (target === 'bg') updatePadletMetadata(activeCardToolbarPadlet.id, { backgroundColor: value });
                    if (target === 'ts') updatePadletMetadata(activeCardToolbarPadlet.id, { topStripColor: value });
                  }}
                />
              </div>
            )}

            {/* Emoji panel */}
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
                        const currentReactions = activeCardToolbarPadlet.metadata?.reactions || [];
                        const newReactions = [...currentReactions, emojiData.emoji];
                        await updatePadletMetadata(activeCardToolbarPadlet.id, { reactions: newReactions });
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

            {/* Comment panel */}
            {cardCommentPopupPadletId === activeCardToolbarPadlet.id && (
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
                          setNoteBadgeColorPadletId(noteBadgeColorPadletId === activeCardToolbarPadlet.id ? null : activeCardToolbarPadlet.id);
                          setCommentColorPopupId(null);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded hover:bg-gray-100"
                        title="Badge Color"
                      >
                        <div
                          className="w-4 h-4 rounded border border-gray-300"
                          style={{ backgroundColor: activeCardToolbarPadlet.metadata?.badgeColor || '#facc15' }}
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
                  {noteBadgeColorPadletId === activeCardToolbarPadlet.id && (
                    <div className="absolute right-3 top-12 z-10 bg-white rounded-lg shadow-lg border border-gray-200 p-2">
                      <div className="grid grid-cols-6 gap-1.5">
                        {BADGE_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={async () => {
                              await updatePadletMetadata(activeCardToolbarPadlet.id, { badgeColor: color });
                              setNoteBadgeColorPadletId(null);
                            }}
                            className={`rounded transition-transform hover:scale-110 ${activeCardToolbarPadlet.metadata?.badgeColor === color ? 'ring-2 ring-blue-500' : ''}`}
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
                        {cardCommentList.map((c, i) => {
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
                            const currentComments = activeCardToolbarPadlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.map((comment: any) =>
                              comment.id === c.id ? { ...comment, text: trimmed } : comment
                            );
                            await updatePadletMetadata(activeCardToolbarPadlet.id, { detachedComments: nextComments });
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
                                    dangerouslySetInnerHTML={{ __html: c.text }}
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
                            const currentComments = activeCardToolbarPadlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.map((comment: any) =>
                              comment.id === activeCardComment.id ? { ...comment, isStrikethrough: !comment.isStrikethrough } : comment
                            );
                            await updatePadletMetadata(activeCardToolbarPadlet.id, { detachedComments: nextComments });
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
                            const currentComments = activeCardToolbarPadlet.metadata?.detachedComments || [];
                            const nextComments = currentComments.filter((comment: any) => comment.id !== activeCardComment.id);
                            await updatePadletMetadata(activeCardToolbarPadlet.id, { detachedComments: nextComments });
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
                            timestamp: Date.now()
                          };
                          const currentComments = activeCardToolbarPadlet.metadata?.detachedComments || [];
                          inputElement.value = '';
                          await updatePadletMetadata(activeCardToolbarPadlet.id, {
                            detachedComments: [...currentComments, newComment]
                          });
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
    </>
  );
}

export default React.memo(FreeformPadletCards);
