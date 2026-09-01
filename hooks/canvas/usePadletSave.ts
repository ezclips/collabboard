'use client';

import type { LoadedAIContent } from '@/lib/ai/contracts';
import { serializeAIContentForPersistence } from '@/lib/ai/persistence';
import type { CaptionStyle } from '@/lib/domain/canvas/captionStyle';
import { useGridPadletSave } from './useGridPadletSave';

export type SaveAIComponentData = {
  title?: string;
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
  metadata?: Record<string, unknown>;
};


import { useCallback, useMemo, Dispatch, SetStateAction } from 'react';
import { Padlet, PendingPostDraft, SavedAIComponent, StoredAIImageAsset } from '@/types/collabboard';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { KnowledgeSourceReferenceDraft } from '@/lib/domain/knowledge/knowledgeSourceNoteDraft';

// ============================================================================
// Types for save handler data payloads
// ============================================================================

export type SaveNoteData = {
  title?: string;
  content: string;
  cardColor?: string;
  topStrip?: string;
  reactions?: string[];
  badgeColor?: string;
  textColor?: string;
  titleStyle?: Record<string, unknown>;
  // PATCH 8P.1 -- the Comments panel's own title/style, distinct from the
  // post's own title/titleStyle above.
  commentTitle?: string;
  commentTitleStyle?: { color?: string; backgroundColor?: string };
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
  commentTitle?: string;
  commentTitleStyle?: { color?: string; backgroundColor?: string };
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
  commentTitle?: string;
  commentTitleStyle?: { color?: string; backgroundColor?: string };
  captionStyle?: CaptionStyle;
};

export type SaveTableData = {
  title: string;
  content: string;
};

export type SaveContainerData = {
  title: string;
  titleStyle?: Record<string, unknown>;
  backgroundColor: string;
  topStrip?: string;
  detachedComments?: Array<{
    id: string;
    text: string;
    userId: string;
    userName: string;
    timestamp: number;
  }>;
  orientation?: 'vertical' | 'horizontal';
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
  // PATCH 9K.1: set only by CommentEditor's Collapse/Expand toolbar toggle --
  // skips this function's normal unconditional editor-close so the same
  // toolbar session can flip the state back and forth without reopening.
  // Never set by the regular Save/Enter/Escape submit path.
  keepEditorOpen?: boolean;
};

export type SaveCardData = {
  title: string;
  content: string;
  metadata: any;
};

// PATCH-149B2-i §32.3: the narrowest observable-result contract -- never a
// throwing contract, since existing CardEditor/ClipartCardDraftModal callers
// ignore the returned Promise and would surface as unhandled rejections.
export type SaveCardResult =
  | { status: 'saved' }
  | { status: 'skipped-blank' }
  | { status: 'deferred-placement' }
  | { status: 'failed'; error: unknown };

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
  title?: string;
  metadata?: Record<string, unknown>;
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
  /**
   * P6J-F5: set only while the open NoteEditor was launched from a Knowledge
   * source page. Ordinary toolbar Notes leave it null and are untouched.
   */
  sourceNoteReference?: KnowledgeSourceReferenceDraft | null;
  /** Called with the REAL inserted row id, only after the insert has succeeded. */
  onSourceNoteCreated?: (targetPadletId: string, sourceReference: KnowledgeSourceReferenceDraft) => void;
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
    sourceNoteReference,
    onSourceNoteCreated,
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
    /** P6J-F5 transient provenance; every branch below spreads the draft whole. */
    sourceReference?: KnowledgeSourceReferenceDraft;
  };

  // R2. What the policy judges a draft on. An EXTERNAL draft (created outside any
  // editor, e.g. a finished PDF upload) supplies these explicitly so it is judged
  // on its OWN metadata; omitted keeps today's editor-derived saveX behaviour.
  type PlacementSubject = { isNewPost: boolean; hasParentId: boolean; hasSectionId: boolean };

  const checkPlacementRequired = (
    draft: PlacementDraft,
    closeEditor: () => void,
    placementSubject?: PlacementSubject
  ): boolean => {
    const { isNewPost, hasParentId, hasSectionId } = placementSubject ?? {
      // new post = no padletToEdit, or its id is 'new'
      isNewPost: !padletToEdit || padletToEdit.id === 'new',
      hasParentId: !!padletToEdit?.metadata?.parentId,
      hasSectionId: !!padletToEdit?.metadata?.sectionId,
    };
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
      titleStyle: data.titleStyle,
      commentTitle: data.commentTitle,
      commentTitleStyle: data.commentTitleStyle,
      detachedComments: data.detachedComments,
    });
    // Check if placement prompt is needed (grid/columns/wall layouts)

    // A source-created Note additionally carries its provenance and its
    // filename title through placement; ordinary Notes keep their existing
    // title-less placement draft exactly as before.
    const placementNeeded = checkPlacementRequired(
      sourceNoteReference
        ? { kind: 'note', content: data.content, metadata, title: data.title, sourceReference: sourceNoteReference }
        : { kind: 'note', content: data.content, metadata },
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
            title: data.title || 'New Note',
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
        // P6J-F5: only now does a real target id exist. The row itself carries
        // no provenance -- source_references is its one durable home.
        if (sourceNoteReference && newPadlet?.id) {
          onSourceNoteCreated?.(newPadlet.id, sourceNoteReference);
        }
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
            title: data.title || '',
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
          if (p.id === padletToEdit!.id) return { ...p, title: data.title || '', content: data.content, metadata };
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
    sourceNoteReference,
    onSourceNoteCreated,
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
      commentTitle: data.commentTitle,
      commentTitleStyle: data.commentTitleStyle,
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
      commentTitle: data.commentTitle,
      commentTitleStyle: data.commentTitleStyle,
      captionStyle: data.captionStyle,
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
      titleStyle: data.titleStyle,
      childPadletIds: existingChildIds,
      detachedComments: data.detachedComments,
      ...(data.orientation ? { orientation: data.orientation } : {}),
    };

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const { x: position_x, y: position_y } = getNewPostPosition(350, 300);
        const { data: newContainer, error } = await supabase
          .from('padlets')
          .insert({
            board_id: canvasId,
            title: data.title,
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
            title: data.title,
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
            ? { ...p, title: data.title, metadata }
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

      // PATCH 9K.1: the Collapse/Expand toolbar toggle persists through this
      // same path but asks to keep the editor open (padletToEdit.id === 'new'
      // never reaches here with keepEditorOpen -- a not-yet-created post has
      // no canvas presentation to toggle).
      if (data.keepEditorOpen && padletToEdit.id !== 'new') {
        setPadletToEdit({ ...padletToEdit, metadata });
      } else {
        setIsCommentEditorOpen(false);
        setPadletToEdit(null);
      }
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
  const saveCard = useCallback(async (data: SaveCardData): Promise<SaveCardResult> => {
    if (!canvasId || !padletToEdit) return { status: 'failed', error: new Error('No active canvas or target padlet') };

    try {
      let createdPadlet: any = null;
      if (padletToEdit.id === 'new') {
        const metadataWithoutEmptyDescription = Object.fromEntries(
          Object.entries(data.metadata || {}).filter(([key, value]) => !(key === 'description' && value === '')),
        );
        const hasMeaningfulMetadata = Object.entries(metadataWithoutEmptyDescription).some(([key, value]) =>
          key !== 'parentId' &&
          value !== undefined &&
          value !== null &&
          !(typeof value === 'string' && value.trim() === '') &&
          !(Array.isArray(value) && value.length === 0)
        );
        if (
          data.title.trim() === '' &&
          data.content.replace(/<[^>]*>/g, '').trim() === '' &&
          typeof data.metadata?.description === 'string' &&
          data.metadata.description.trim() === '' &&
          !hasMeaningfulMetadata
        ) {
          setIsCardEditorOpen(false);
          setPadletToEdit(null);
          return { status: 'skipped-blank' };
        }

        // For freeform layout: place directly on canvas
        // For map layout with parentId: place in pin container directly
        // For other layouts: check if placement prompt is needed
        if (!isFreeformLayout && !(isMapLayout && padletToEdit.metadata?.parentId)) {
          if (checkPlacementRequired(
            { kind: 'card', content: data.content, title: data.title, metadata: data.metadata },
            () => { setIsCardEditorOpen(false); setPadletToEdit(null); }
          )) {
            return { status: 'deferred-placement' };
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
      return { status: 'saved' };
    } catch (e) {
      console.error('Failed to save card:', e);
      return { status: 'failed', error: e };
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
        { kind: 'image', content: '', file_url: data.imageUrl, title: 'Image', metadata },
        () => { setIsImageEditorOpen(false); setPadletToEdit(null); }
      )) {
        return;
      }

      let createdPadlet: any = null;
      if (!padletToEdit || padletToEdit.id === 'new') {
        // New Image -- title stays independent of the caption (set later,
        // if at all, via the image editing modal's own Title field), not
        // derived from it.
        const { x: position_x, y: position_y } = getNewPostPosition(300, 200);
        const { data: newImage, error } = await supabase.from('padlets').insert({
          board_id: canvasId,
          title: 'Image',
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
        // Update Image -- title is left untouched here; it's only ever
        // changed through the image editing modal's own Title field now.
        await supabase
          .from('padlets')
          .update({
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
            ? { ...p, file_url: data.imageUrl, metadata }
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
      ...data.metadata,
      drawingData: data.drawingData,
      drawingAppState: data.drawingAppState,
      drawingFiles: data.drawingFiles,
      previewUrl: data.previewUrl,
    };
    const nextTitle = data.title !== undefined ? data.title : padletToEdit.title;

    // Check if placement prompt is needed (grid/columns/wall layouts)
    if (checkPlacementRequired(
      { kind: 'drawing', content: '', file_url: data.previewUrl, title: nextTitle || 'Drawing', metadata },
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
            title: data.title || 'Drawing',
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
            title: nextTitle,
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
            ? { ...p, title: nextTitle, metadata }
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
      ...data.metadata,
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
            title: data.title || 'AI Component',
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
        // Preserve the existing title when this save came from a flow that
        // doesn't surface a title field (AI Content Field Editor, Convert)
        // rather than silently clobbering a title set elsewhere (e.g. the
        // canvas card's own double-click-to-edit).
        const nextTitle = data.title !== undefined ? data.title : padletToEdit.title;
        const { error } = await supabase
          .from('padlets')
          .update({
            title: nextTitle,
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
            ? { ...p, title: data.title !== undefined ? data.title : p.title, content: data.aiPrompt, metadata }
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
    /**
     * PDF-C1 R1-A-2. The layout placement DECISION, for a caller that owns its
     * own persistence (the Knowledge PDF placement already writes through
     * insertPostPreservingFailureChannels and must keep doing so).
     *
     * Deliberately a thin delegation to the same checkPlacementRequired every
     * saveX above uses -- no second copy of the policy, no Supabase write, no
     * layout switch of its own. Same contract as internally: TRUE means the
     * placement flow has taken ownership and the caller must NOT insert; FALSE
     * means no placement is required and the caller proceeds normally.
     */
    requestPlacementIfRequired: (
      draft: PlacementDraft,
      closeEditor: () => void = () => {},
      // R2: an external draft is always NEW, and its parent/section come from
      // the draft itself -- never from an unrelated open editor.
    ): boolean => checkPlacementRequired(draft, closeEditor, {
      isNewPost: true,
      hasParentId: Boolean(draft.metadata?.parentId),
      hasSectionId: Boolean(draft.metadata?.sectionId),
    }),
  };
}
