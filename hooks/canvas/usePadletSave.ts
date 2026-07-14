'use client';

import type { LoadedAIContent } from '@/lib/ai/contracts';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import { useGridPadletSave } from './useGridPadletSave';

export type SaveAIComponentData = {
  aiComponentCode?: string;
  aiComponentJson?: LoadedAIContent;
  aiPrompt: string;
  aiRawCode?: string;
  aiAssets?: {
    images?: Array<{
      query: string;
      placeholder?: string;
      url: string | null;
      status: 'resolved' | 'unresolved';
      source: string | null;
      author?: string | null;
      authorLink?: string | null;
    }>;
  };
};


import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { Padlet, PendingPostDraft, SavedAIComponent, StoredAIImageAsset } from '@/types/collabboard';
import { supabaseBrowser } from '@/lib/supabase/browser';

// ============================================================================
// Types for save handler data payloads
// ============================================================================

export type SaveNoteData = {
  content: string;
  cardColor?: string;
  topStrip?: string;
  reactions?: string[];
  badgeColor?: string;
  textColor?: string;
  detachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
  }>;
};

export type SaveLinkData = {
  linkUrl: string;
  linkTitle?: string;
  linkDescription?: string;
  linkImage?: string;
  linkFavicon?: string;
  linkDomain?: string;
  linkCaption?: string;
  linkCaptionColor?: string;
  cardColor?: string;
  topStrip?: string;
  reactions?: string[];
  displayMode?: 'both' | 'image-only' | 'info-only';
  detachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    color?: string;
    textColor?: string;
    backgroundColor?: string;
    isStrikethrough?: boolean;
  }>;
  badgeColor?: string;
};

export type SaveTodoData = {
  todoTitle?: string;
  tasks: Array<{
    id: string;
    text: string;
    completed: boolean;
    dueDate?: string;
    assignee?: string;
  }>;
  cardColor?: string;
  topStrip?: string;
  reactions?: string[];
  detachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    color?: string;
    textColor?: string;
    backgroundColor?: string;
    isStrikethrough?: boolean;
  }>;
  badgeColor?: string;
};

export type SaveTableData = {
  title: string;
  content: string;
};

export type SaveContainerData = {
  title: string;
  backgroundColor: string;
  topStrip?: string;
  detachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
  }>;
};

export type SaveCommentData = {
  comments: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
    color?: string;
  }>;
  cardColor?: string;
  badgeColor?: string;
  isCollapsed?: boolean;
  topStrip?: string;
  commentTitle?: string;
};

export type SaveCardData = {
  title: string;
  content: string;
  metadata: any;
};

export type SaveImageData = {
  imageUrl: string;
  caption?: string;
  photographer?: string;
  photographerUrl?: string;
  source: 'pexels' | 'upload' | 'import';
  cardColor?: string;
  topStrip?: string;
  importData?: {
    provider: 'google-drive' | 'microsoft-onedrive';
    itemId: string;
    openUrl: string;
    mimeType: string;
    fileName: string;
    kind: 'image' | 'document';
    sizeBytes?: number;
  };
};

export type SaveDrawingData = {
  drawingData: string;
  drawingAppState: string;
  drawingFiles: string;
  previewUrl?: string;
};

// ============================================================================
// Hook Parameters
// ============================================================================

export type UsePadletSaveParams = {
  canvasId: string | null;
  padletToEdit: Padlet | null;
  isWallLayout: boolean;
  isColumnsLayout: boolean;
  isGridLayout: boolean;
  isDrawingLayout: boolean;
  isTimelineLayout: boolean;
  isSchedulerLayout: boolean;
  isFreeformLayout: boolean;
  isMapLayout: boolean;
  // Setters
  setPadletToEdit: (p: Padlet | null) => void;
  fetchData: () => Promise<void>;
  // Editor close setters
  setIsNoteEditorOpen: (v: boolean) => void;
  setIsLinkEditorOpen: (v: boolean) => void;
  setIsTodoEditorOpen: (v: boolean) => void;
  setIsTableEditorOpen: (v: boolean) => void;
  setIsContainerEditorOpen: (v: boolean) => void;
  setIsCommentEditorOpen: (v: boolean) => void;
  setIsCardEditorOpen: (v: boolean) => void;
  setIsImageEditorOpen: (v: boolean) => void;
  setIsDrawingEditorOpen: (v: boolean) => void;
  setIsAIComponentEditorOpen: (v: boolean) => void;
  // Placement prompt setters
  setPendingPostDraft: (d: PendingPostDraft | null) => void;
  setIsPlacementPromptOpen: (v: boolean) => void;
  setWallPendingPostDraft: (d: PendingPostDraft | null) => void;
  setWallPlacementPromptOpen: (v: boolean) => void;
  onTimelinePlacementStart?: (draft: PendingPostDraft) => void;
  onSchedulerPlacementStart?: (draft: PendingPostDraft) => void;
  onDrawingPlacementStart?: (draft: PendingPostDraft) => void;
  padlets: Padlet[];
  setPadlets: Dispatch<SetStateAction<Padlet[]>>;
  getNewPostPosition: (cardWidth: number, cardHeight: number) => { x: number; y: number };
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePadletSave(params: UsePadletSaveParams) {
  // Cookie-authenticated client — see useCanvasData.ts for why this must match
  // supabaseBrowser() rather than the plain lib/supabase.ts singleton.
  const supabase = useMemo(() => supabaseBrowser(), []);
  const {
    canvasId,
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
    onTimelinePlacementStart,
    onSchedulerPlacementStart,
    onDrawingPlacementStart,
    padlets,
    setPadlets,
    getNewPostPosition,
  } = params;

  const checkGridPlacementRequired = useGridPadletSave({
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
  });

  // ============================================================================
  // Unified Placement Check Helper
  // ============================================================================
  // Returns true if placement prompt was shown (save should return early)
  // Returns false if no placement needed (proceed with normal save)
  type PlacementDraft = {
    kind: PendingPostDraft['kind'];
    content: string;
    metadata: any;
    title?: string;
    file_url?: string;
  };

  const checkPlacementRequired = (
    draft: PlacementDraft,
    closeEditor: () => void
  ): boolean => {
    const hasParentId = !!padletToEdit?.metadata?.parentId;
    const hasSectionId = !!padletToEdit?.metadata?.sectionId;

    // Check if this is a new post (either no padletToEdit or id is 'new')
    const isNewPost = !padletToEdit || padletToEdit.id === 'new';
    if (!isNewPost) {
      return false;
    }

    // Drawing layout: all new posts prompt the user to place in a container or freely.
    if (
      isDrawingLayout &&
      !hasParentId
    ) {
      const drawingDraft: PendingPostDraft = {
        ...draft,
        createdAt: Date.now(),
      };
      onDrawingPlacementStart?.(drawingDraft);
      closeEditor();
      return true;
    }

    if (checkGridPlacementRequired({
      draft,
      hasParentId,
      hasSectionId,
      closeEditor,
    })) {
      return true;
    }

    // Timeline Layout: start ghost container placement immediately (no modal)
    if (isTimelineLayout && !hasParentId) {
      const timelineDraft: PendingPostDraft = {
        ...draft,
        createdAt: Date.now(),
      };
      onTimelinePlacementStart?.(timelineDraft);
      closeEditor();
      return true;
    }

    // Scheduler Layout: auto-map into an event container for the time slot
    if (isSchedulerLayout && !hasParentId) {
      const schedulerDraft: PendingPostDraft = {
        ...draft,
        createdAt: Date.now(),
      };
      onSchedulerPlacementStart?.(schedulerDraft);
      closeEditor();
      return true;
    }

    return false;
  };

  const withSchedulerDefaults = (meta: Record<string, unknown>): Record<string, unknown> => {
    if (!isSchedulerLayout) return meta;

    const hasStart = typeof meta.start_date === 'string' && meta.start_date.length > 0;
    const hasEnd = typeof meta.end_date === 'string' && meta.end_date.length > 0;
    if (hasStart && hasEnd) return meta;

    const start = new Date();
    start.setMinutes(0, 0, 0);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    return {
      ...meta,
      start_date: hasStart ? meta.start_date : start.toISOString(),
      end_date: hasEnd ? meta.end_date : end.toISOString(),
    };
  };

  // ============================================================================
  // handleSaveNote
  // ============================================================================
  const saveNote = useCallback(async (data: SaveNoteData) => {
    // Build metadata object - preserve existing metadata (especially parentId for container children)
    const metadata = withSchedulerDefaults({
      ...padletToEdit?.metadata,
      cardColor: data.cardColor,
      topStrip: data.topStrip,
      reactions: data.reactions,
      badgeColor: data.badgeColor,
      textColor: data.textColor,
      detachedComments: data.detachedComments,
    });
    // Check if placement prompt is needed (grid/columns/wall layouts)

    const placementNeeded = checkPlacementRequired(
      { kind: 'note', content: data.content, metadata },
      () => setIsNoteEditorOpen(false)
    );
    if (placementNeeded) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit?.id === 'new') {
        // Create new padlet and get its ID
        const { x: position_x, y: position_y } = getNewPostPosition(280, 280);
        const { data: newPadlet, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: 'New Note',
            content: data.content,
            type: 'text',
            position_x,
            position_y,
            width: 280,
            height: 280,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newPadlet;
        // If this post has a parentId, update the container's childPadletIds
        const parentId = metadata?.parentId;
        if (parentId && newPadlet) {
          // Fetch current container to get existing childPadletIds
          const { data: container } = await supabase
            .from('padlets')
            .select('metadata')
            .eq('id', parentId)
            .single();

          if (container) {
            const existingIds = (container.metadata as any)?.childPadletIds || [];
            await supabase
              .from('padlets')
              .update({
                metadata: {
                  ...(container.metadata || {}),
                  childPadletIds: [...existingIds, newPadlet.id]
                }
              })
              .eq('id', parentId);
          }
        }
      } else if (padletToEdit) {
        // Update existing padlet
        const { error } = await supabase
          .from('padlets')
          .update({
            content: data.content,
            metadata,
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;

        // Propagate changes to synced posts
        const syncedWithId = (padletToEdit.metadata as any)?.syncedWith;
        if (syncedWithId) {
          const { error: syncError } = await supabase
            .from('padlets')
            .update({
              content: data.content,
              metadata: {
                ...metadata,
                syncedWith: padletToEdit.id,
              },
            })
            .eq('id', syncedWithId);
          if (syncError) console.warn('Failed to sync changes to linked post:', syncError);
        }
      }

      setIsNoteEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit?.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else if (padletToEdit) {
        const syncedWithId = (padletToEdit.metadata as any)?.syncedWith;
        setPadlets(prev => prev.map(p => {
          if (p.id === padletToEdit!.id) return { ...p, content: data.content, metadata };
          if (syncedWithId && p.id === syncedWithId) return { ...p, content: data.content, metadata: { ...metadata, syncedWith: padletToEdit!.id } };
          return p;
        }));
      }
    } catch (e: any) {
      console.error('Failed to save note:', e?.message || e?.details || JSON.stringify(e));
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    isSchedulerLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsNoteEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveLink - verbatim from CanvasClient.tsx lines 3303-3435
  // ============================================================================
  const saveLink = useCallback(async (data: SaveLinkData) => {
    // Skip save if no URL (user canceled without entering URL)
    if (!data.linkUrl) {
      setIsLinkEditorOpen(false);
      setPadletToEdit(null);
      return;
    }

    if (!canvasId || !padletToEdit) return;

    // Build metadata object - preserve existing metadata (especially parentId for container children)
    const metadata = {
      ...padletToEdit?.metadata,
      linkUrl: data.linkUrl,
      linkTitle: data.linkTitle,
      linkDescription: data.linkDescription,
      linkImage: data.linkImage,
      linkFavicon: data.linkFavicon,
      linkDomain: data.linkDomain,
      linkCaption: data.linkCaption,
      linkCaptionColor: data.linkCaptionColor,
      cardColor: data.cardColor,
      topStrip: data.topStrip,
      reactions: data.reactions,
      displayMode: data.displayMode,
      detachedComments: data.detachedComments,
      comments: data.detachedComments,
      badgeColor: data.badgeColor || padletToEdit?.metadata?.badgeColor,
    };

    // Check if placement prompt is needed (grid/columns/wall layouts)
    if (checkPlacementRequired(
      { kind: 'link', content: data.linkUrl, metadata },
      () => setIsLinkEditorOpen(false)
    )) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        // Insert new link padlet
        const { x: position_x, y: position_y } = getNewPostPosition(300, 350);
        const { data: newLink, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: data.linkTitle || 'Link',
            content: data.linkUrl,
            type: 'link',
            position_x,
            position_y,
            width: 300,
            height: 350,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newLink;
      } else {
        // Update existing link padlet
        const { error } = await supabase
          .from('padlets')
          .update({
            title: data.linkTitle || 'Link',
            content: data.linkUrl,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsLinkEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, title: data.linkTitle || 'Link', content: data.linkUrl, metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save link:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsLinkEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveTodo - verbatim from CanvasClient.tsx lines 3438-3553
  // ============================================================================
  const saveTodo = useCallback(async (data: SaveTodoData) => {
    if (!canvasId || !padletToEdit) return;

    // Preserve existing metadata (especially parentId for container children)
    const metadata = {
      ...padletToEdit?.metadata,
      todoTitle: data.todoTitle,
      tasks: data.tasks,
      cardColor: data.cardColor,
      topStrip: data.topStrip,
      reactions: data.reactions,
      detachedComments: data.detachedComments,
      comments: data.detachedComments,
      badgeColor: data.badgeColor || padletToEdit?.metadata?.badgeColor,
    };

    // Check if placement prompt is needed (grid/columns/wall layouts)
    if (checkPlacementRequired(
      { kind: 'todo', content: JSON.stringify(data.tasks), metadata },
      () => setIsTodoEditorOpen(false)
    )) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(300, 350);
        const { data: newTodo, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: data.todoTitle || 'To-Do List',
            content: JSON.stringify(data.tasks),
            type: 'todo',
            position_x,
            position_y,
            width: 300,
            height: 350,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newTodo;
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            title: data.todoTitle || 'To-Do List',
            content: JSON.stringify(data.tasks),
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsTodoEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, title: data.todoTitle || 'To-Do List', content: JSON.stringify(data.tasks), metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save todo:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsTodoEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveTable - verbatim from CanvasClient.tsx lines 3556-3640
  // ============================================================================
  const saveTable = useCallback(async (data: SaveTableData) => {
    if (!canvasId || !padletToEdit) return;
    const tableTitle = data.title.trim();

    // Preserve existing metadata (especially parentId for container children)
    const metadata = {
      ...padletToEdit?.metadata,
      tableData: data.content,
    };

    // Check if placement prompt is needed (grid/columns/wall layouts)
    if (checkPlacementRequired(
      { kind: 'table', content: data.content, metadata },
      () => setIsTableEditorOpen(false)
    )) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(400, 300);
        const { data: newTable, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: tableTitle,
            content: data.content,
            type: 'table',
            position_x,
            position_y,
            width: 400,
            height: 300,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newTable;
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            title: tableTitle,
            content: data.content,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsTableEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, title: tableTitle, content: data.content, metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save table:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsTableEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveContainer - verbatim from CanvasClient.tsx lines 3643-3708
  // ============================================================================
  const saveContainer = useCallback(async (data: SaveContainerData) => {
    if (!canvasId || !padletToEdit) return;

    // Preserve existing childPadletIds when updating
    const currentPadlet = padlets.find(p => p.id === padletToEdit?.id);
    const existingChildIds = currentPadlet?.metadata?.childPadletIds || padletToEdit?.metadata?.childPadletIds || [];

    const metadata = {
      ...(currentPadlet?.metadata || padletToEdit.metadata || {}),
      cardColor: data.backgroundColor,
      topStrip: data.topStrip,
      childPadletIds: existingChildIds,
      detachedComments: data.detachedComments,
    };

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(350, 300);
        const { data: newContainer, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: data.title || 'New Container',
            content: '',
            type: 'container',
            position_x,
            position_y,
            width: 350,
            height: 300,
            metadata: { ...metadata, childPadletIds: [] },
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newContainer;
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            title: data.title || 'New Container',
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsContainerEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, title: data.title || 'New Container', metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save container:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    padlets, // CRITICAL: Include padlets so currentPadlet lookup gets fresh data
    supabase,
    setPadletToEdit,
    fetchData,
    setIsContainerEditorOpen,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveComment - verbatim from CanvasClient.tsx lines 3771-3898
  // ============================================================================
  const saveComment = useCallback(async (data: SaveCommentData) => {
    if (!canvasId || !padletToEdit) return;

    // PREVENT EMPTY POSTS: If it's a new comment post and no comments were added, don't create it.
    if (padletToEdit.id === 'new' && data.comments.length === 0) {
      setIsCommentEditorOpen(false);
      setPadletToEdit(null);
      return;
    }

    const metadata = {
      ...padletToEdit.metadata,
      comments: data.comments,
      cardColor: data.cardColor || '#fef08a',
      badgeColor: data.badgeColor ?? padletToEdit.metadata?.badgeColor ?? '#facc15',
      isCollapsed: data.isCollapsed ?? padletToEdit.metadata?.isCollapsed,
      topStrip: data.topStrip ?? (padletToEdit.metadata as any)?.topStrip ?? 'transparent',
      commentTitle: data.commentTitle ?? (padletToEdit.metadata as any)?.commentTitle ?? 'Comments',
    };

    // Build preview text for placement prompt
    const commentsCount = data.comments.length;
    const lastComment = commentsCount > 0 ? data.comments[commentsCount - 1].text : '';
    const previewText = lastComment
      ? (commentsCount > 1 ? `"${lastComment.substring(0, 30)}..." (+${commentsCount - 1} more)` : lastComment)
      : 'No comments';

    // Check if placement prompt is needed (grid/columns/wall layouts)
    if (checkPlacementRequired(
      { kind: 'comment', content: previewText, metadata },
      () => { setIsCommentEditorOpen(false); setPadletToEdit(null); }
    )) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(300, 280);
        const { data: newComment, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: 'Comment',
            content: '',
            type: 'comment',
            position_x,
            position_y,
            width: 300,
            height: 280,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newComment;
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsCommentEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save comment:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsCommentEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveCard - verbatim from CanvasClient.tsx lines 3901-3939
  // ============================================================================
  const saveCard = useCallback(async (data: SaveCardData) => {
    if (!canvasId || !padletToEdit) return;

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        // For freeform layout: place directly on canvas
        // For map layout with parentId: place in pin container directly
        // For other layouts: check if placement prompt is needed
        if (!isFreeformLayout && !(isMapLayout && padletToEdit.metadata?.parentId)) {
          if (checkPlacementRequired(
            { kind: 'card', content: data.content, title: data.title, metadata: data.metadata },
            () => { setIsCardEditorOpen(false); setPadletToEdit(null); }
          )) {
            return;
          }
        }

        const insertMetadata = {
          ...data.metadata,
          ...(padletToEdit.metadata?.parentId ? { parentId: padletToEdit.metadata.parentId } : {}),
        };
        const { x: position_x, y: position_y } = getNewPostPosition(180, 220);
        const { data: newCard, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: data.title,
            content: data.content,
            type: 'card',
            position_x,
            position_y,
            width: 180,
            height: 220,
            metadata: insertMetadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newCard;

        // Update container's childPadletIds if this card belongs to one
        if (insertMetadata.parentId && newCard) {
          const { data: container } = await supabase
            .from('padlets')
            .select('metadata')
            .eq('id', insertMetadata.parentId)
            .single();
          if (container) {
            const existingIds = (container.metadata as any)?.childPadletIds || [];
            await supabase
              .from('padlets')
              .update({
                metadata: {
                  ...(container.metadata || {}),
                  childPadletIds: [...existingIds, newCard.id],
                },
              })
              .eq('id', insertMetadata.parentId);
          }
        }
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            title: data.title,
            content: data.content,
            metadata: data.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsCardEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, title: data.title, content: data.content, metadata: data.metadata }
            : p
        ));
      }
    } catch (e) {
      console.error('Failed to save card:', e);
    }
  }, [
    canvasId,
    padletToEdit,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsCardEditorOpen,
    isFreeformLayout,
    isMapLayout,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveImage - verbatim from CanvasClient.tsx lines 3993-4096
  // ============================================================================
  const saveImage = useCallback(async (data: SaveImageData) => {
    if (!canvasId) return;

    try {
      const importMeta = data.source === 'import' && data.importData
        ? {
            importProvider: data.importData.provider,
            importItemId: data.importData.itemId,
            importOpenUrl: data.importData.openUrl,
            importMimeType: data.importData.mimeType,
            importFileName: data.importData.fileName,
            importKind: data.importData.kind,
            importSizeBytes: data.importData.sizeBytes,
          }
        : {};

      const metadata = {
        ...(padletToEdit?.metadata || {}),
        imageUrl: data.imageUrl,
        file_url: data.imageUrl,
        caption: data.caption,
        photographer: data.photographer,
        photographerUrl: data.photographerUrl,
        source: data.source,
        cardColor: data.cardColor || '#ffffff',
        topStrip: data.topStrip ?? (padletToEdit?.metadata?.topStrip ?? 'transparent'),
        ...importMeta,
      };

      // Check if placement prompt is needed (grid/columns/wall layouts)
      if (checkPlacementRequired(
        { kind: 'image', content: '', file_url: data.imageUrl, title: data.caption || 'Image', metadata },
        () => { setIsImageEditorOpen(false); setPadletToEdit(null); }
      )) {
        return;
      }

      let createdPadlet: any = null;
      if (!padletToEdit || padletToEdit.id === 'new') {
        // New Image
        const { x: position_x, y: position_y } = getNewPostPosition(300, 200);
        const { data: newImage, error } = await supabase.from('padlets').insert({
          board_id: canvasId,
          title: data.caption || 'Image',
          content: '',
          type: 'image',
          file_url: data.imageUrl,
          position_x,
          position_y,
          width: 300,
          height: 200,
          metadata,
        }).select().single();
        if (error) throw error;
        createdPadlet = newImage;
      } else {
        // Update Image
        await supabase
          .from('padlets')
          .update({
            title: data.caption || 'Image',
            file_url: data.imageUrl,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
      }

      setIsImageEditorOpen(false);
      setPadletToEdit(null);
      if (!padletToEdit || padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, title: data.caption || 'Image', file_url: data.imageUrl, metadata }
            : p
        ));
      }
    } catch (e) {
      console.error('Failed to save image:', e);
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsImageEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  // ============================================================================
  // handleSaveDrawing - verbatim from CanvasClient.tsx lines 4098-4195
  // ============================================================================
  const saveDrawing = useCallback(async (data: SaveDrawingData) => {
    if (!canvasId || !padletToEdit) return;

    const metadata = {
      ...padletToEdit.metadata,
      drawingData: data.drawingData,
      drawingAppState: data.drawingAppState,
      drawingFiles: data.drawingFiles,
      previewUrl: data.previewUrl,
    };

    // Check if placement prompt is needed (grid/columns/wall layouts)
    if (checkPlacementRequired(
      { kind: 'drawing', content: '', file_url: data.previewUrl, title: 'Drawing', metadata },
      () => { setIsDrawingEditorOpen(false); setPadletToEdit(null); }
    )) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(400, 300);
        const { data: newDrawing, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: 'Drawing',
            content: '',
            type: 'drawing',
            position_x,
            position_y,
            width: 400,
            height: 300,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newDrawing;
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsDrawingEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save drawing:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsDrawingEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  const saveAIComponent = useCallback(async (data: SaveAIComponentData) => {
    if (!canvasId || !padletToEdit) return;

    const componentId =
      padletToEdit.id === 'new' && typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : padletToEdit.id;

    // Ingest images into Supabase Storage and get stable stored URLs
    let finalCode = data.aiComponentCode;
    const finalJson = serializeAIContentForPersistence(data.aiComponentJson);
    let assetManifest: StoredAIImageAsset[] | undefined;

    if (data.aiAssets?.images && data.aiAssets.images.length > 0) {
      try {
        const ingestResponse = await fetch('/api/ai/save-generated-component', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            componentId,
            code: data.aiComponentCode ?? '',
            rawCode: data.aiRawCode ?? '',
            assets: data.aiAssets,
          }),
        });

        if (ingestResponse.ok) {
          const ingestResult = await ingestResponse.json();
          finalCode = ingestResult.finalCode ?? finalCode;
          assetManifest = ingestResult.assetManifest;

          // Update JSON hero image with the stored stable URL and storagePath
        } else {
          console.warn('[saveAIComponent] Asset ingestion failed, falling back to preview URLs');
        }
      } catch (err) {
        console.warn('[saveAIComponent] Asset ingestion error, falling back to preview URLs:', err);
      }
    }

    const normalizedImages = (data.aiAssets?.images || []).map((image) => ({
      query: image.query,
      placeholder: image.placeholder,
      url: image.url,
      source: image.source,
      author: image.author ?? null,
      authorLink: image.authorLink ?? null,
    }));

    const savedAIComponent: SavedAIComponent = {
      id: componentId,
      code: finalCode ?? '',
      assets: {
        images: normalizedImages,
      },
    };

    const metadata = {
      ...padletToEdit.metadata,
      aiComponentCode: finalCode,
      aiComponentJson: serializeAIContentForPersistence(finalJson),
      aiPrompt: data.aiPrompt,
      aiRawCode: data.aiRawCode,
      aiAssets: data.aiAssets,
      ...(assetManifest ? { aiAssetManifest: assetManifest } : {}),
      savedAIComponent,
    };

    if (checkPlacementRequired(
      { kind: 'ai-component', content: data.aiPrompt, title: 'AI Component', metadata },
      () => { setIsAIComponentEditorOpen(false); setPadletToEdit(null); }
    )) {
      return;
    }

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(500, 400);
        const { data: newAIComp, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: 'AI Component',
            content: data.aiPrompt,
            type: 'ai-component',
            position_x,
            position_y,
            width: 500,
            height: 400,
            metadata,
          })
          .select()
          .single();
        if (error) throw error;
        createdPadlet = newAIComp;
      } else {
        const { error } = await supabase
          .from('padlets')
          .update({
            content: data.aiPrompt,
            metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsAIComponentEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else {
        setPadlets(prev => prev.map(p =>
          p.id === padletToEdit!.id
            ? { ...p, content: data.aiPrompt, metadata }
            : p
        ));
      }
    } catch (e: unknown) {
      const err = e as { message?: string; details?: string };
      console.error('Failed to save AI component:', err?.message || err?.details || 'Unknown error');
    }
  }, [
    canvasId,
    padletToEdit,
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    isTimelineLayout,
    supabase,
    setPadletToEdit,
    fetchData,
    setIsAIComponentEditorOpen,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
    onTimelinePlacementStart,
    setPadlets,
  ]);

  return {
    saveNote,
    saveLink,
    saveTodo,
    saveTable,
    saveContainer,
    saveComment,
    saveCard,
    saveImage,
    saveDrawing,
    saveAIComponent,
  };
}
