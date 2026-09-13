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


import { useCallback, useEffect, useMemo, useRef, Dispatch, SetStateAction } from 'react';
import { Padlet, PendingPostDraft, SavedAIComponent, StoredAIImageAsset } from '@/types/collabboard';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { persistDurableImageContent } from '@/lib/infra/collabboard/imageDurableContent';
import {
  readSyncedTwinId,
  updateSyncedNotePair,
} from '@/lib/infra/canvas/syncedNotePairMutation';
import { toast } from 'sonner';
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
/**
 * The one refusal this hook raises on its own: the board did not authorise
 * this write. Deterministic and narrow -- callers match on it rather than on
 * a message, and it is never confused with a server failure.
 */
export const BOARD_EDIT_NOT_ALLOWED = 'board_edit_not_allowed' as const;

/**
 * saveNote reports a status ONLY where the caller must act on it: a synced
 * pair whose one transaction did not commit. Every other branch returns
 * undefined and keeps its existing close-on-save behaviour.
 */
export type SaveNoteResult = { status: 'failed' };

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
  /**
   * ORDINARY-IMAGE-LIBRARY-C1/C2: observed, never set here. Opening the Image
   * editor begins a new draft SESSION, and the durable creation identity below
   * is scoped to that session -- see the effect in the hook body.
   *
   * REQUIRED, deliberately: an omitted signal would silently un-scope the
   * identity and resurrect the "next Image inherits the previous id" defect,
   * which is exactly the kind of bug a new call site should not be able to
   * reintroduce by forgetting a field.
   */
  isImageEditorOpen: boolean;
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
  /**
   * May this user write this board's content RIGHT NOW?
   *
   * Required, and a probe rather than a boolean: these callbacks are handed to
   * editors and placement flows that keep them across renders, so an answer
   * captured when the callback was built is not the answer that matters when it
   * runs. The host supplies its canonical live board authority -- ownership or a
   * `board_collaborators` editor row, never the workspace role -- and this layer
   * refuses on its own rather than trusting the UI that opened it.
   *
   * No default: a call site that forgets it must fail to compile, not silently
   * allow.
   */
  canEditBoardContentNow: () => boolean;
};

// ============================================================================
// Hook Implementation
// ============================================================================

export function usePadletSave(params: UsePadletSaveParams) {
  // Cookie-authenticated client — see useCanvasData.ts for why this must match
  // supabaseBrowser() rather than the plain lib/supabase.ts singleton.
  const supabase = useMemo(() => supabaseBrowser(), []);
  // IMAGE-LIBRARY: the durable creation identity of the new-Image request
  // currently outstanding, and the request it belongs to.
  //
  // An id may be reused only when BOTH still hold: the same draft session (the
  // effect below), and the same material payload. A retry of the SAME request
  // must reuse it -- otherwise a save that committed but whose read-back failed
  // would create a second durable Image. But once the user changes what they
  // are saving it is a DIFFERENT request, and reusing the id would make the
  // RPC's genuine-retry path hand back the old Image and silently discard the
  // new one.
  const newImageRequestRef = useRef<{ fingerprint: string; padletId: string } | null>(null);
  const imageEditorWasOpenRef = useRef(false);
  const {
    canEditBoardContentNow,
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
    isImageEditorOpen,
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
  // The durable creation identity belongs to ONE draft session, not to "the
  // last save that did not finish". Opening the Image editor starts a new
  // draft, so any identity left over from a previous one is dropped here.
  //
  // Clearing on FAILURE instead would be wrong in the one case that matters:
  // an RPC that committed but whose read-back failed. That draft's retry must
  // still resolve to the row it already created, or the retry would mint a
  // second durable Image. The session boundary -- not success or failure --
  // is what decides when the identity changes.
  useEffect(() => {
    if (isImageEditorOpen && !imageEditorWasOpenRef.current) {
      newImageRequestRef.current = null;
    }
    imageEditorWasOpenRef.current = !!isImageEditorOpen;
  }, [isImageEditorOpen]);

  const checkGridPlacementRequired = useGridPadletSave({
    isWallLayout,
    isColumnsLayout,
    isGridLayout,
    setPendingPostDraft,
    setIsPlacementPromptOpen,
    setWallPendingPostDraft,
    setWallPlacementPromptOpen,
  });

  /**
   * Authority went away AFTER a primary write had already committed.
   *
   * The row stands and is not ours to reverse, so the only correct act is to
   * stop: no later request, and no optimistic shared-canvas state. The
   * transient editor IS closed, because leaving it open invites the user to
   * submit the same content again and create a duplicate. Deliberately
   * silent -- no new toast for a save that did land.
   */
  const settleRevokedAfterPrimary = (closeEditor: () => void) => {
    closeEditor();
    setPadletToEdit(null);
  };

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

  /** The shape withSchedulerDefaults writes, narrowed for the synced-pair RPC. */
  const asDateString = (value: unknown): string | undefined =>
    (typeof value === 'string' && value.length > 0 ? value : undefined);

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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
        // The row is already written and cannot be unwritten from here. What
        // this stops is a SECOND mutation -- the source reference and the
        // container update below -- being STARTED after the authority went
        // away while the insert was in flight.
        if (!canEditBoardContentNow()) return settleRevokedAfterPrimary(() => setIsNoteEditorOpen(false));
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
          // The read is an await of its own: revocation can land while it is
          // pending, so the update it feeds is not authorised by the earlier
          // post-insert check.
          if (!canEditBoardContentNow()) return settleRevokedAfterPrimary(() => setIsNoteEditorOpen(false));

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
        const syncedWithId = readSyncedTwinId(padletToEdit.metadata);
        if (syncedWithId) {
          // The pair is board-scoped and the RPC proves authority over that
          // board, so without one there is nothing to prove and nothing safe
          // to write. Refusing keeps the draft; falling through would update
          // this member alone and split the pair -- the very defect this
          // replaces.
          if (!canvasId) {
            toast.error('Could not save this synced note. Please try again.');
            return { status: 'failed' } as const;
          }
          // ONE request, and one database transaction. There is no second
          // write here to be interrupted, so the pair cannot be left split:
          // both members move together or neither does.
          const pair = await updateSyncedNotePair(supabase, {
            padletId: padletToEdit.id,
            boardId: canvasId,
            title: data.title || '',
            content: data.content,
            // Synchronized: the appearance this editor exclusively owns.
            shared: {
              cardColor: data.cardColor,
              topStrip: data.topStrip,
              textColor: data.textColor,
              titleStyle: data.titleStyle,
            },
            // Per-record, never synchronized: reactions, the comment set and
            // its badge/heading, and this Note's own scheduler dates -- all of
            // which belong to the record they are on. The two dates are read
            // back off `metadata`, which withSchedulerDefaults has already
            // produced above: same helper, same condition, same values, so a
            // scheduler Note still gets exactly the defaults it always got.
            sourceOnly: {
              reactions: data.reactions,
              badgeColor: data.badgeColor,
              detachedComments: data.detachedComments,
              commentTitle: data.commentTitle,
              commentTitleStyle: data.commentTitleStyle,
              start_date: asDateString(metadata.start_date),
              end_date: asDateString(metadata.end_date),
            },
          });
          if (pair.status !== 'saved') {
            // Nothing committed. No reconciliation, no false success: the
            // editor and its draft stay exactly as they are so the same save
            // can simply be retried.
            toast.error('Could not save this synced note. Please try again.');
            return { status: 'failed' } as const;
          }
          // The transaction had already started, so letting it finish was
          // right. What is withheld is the optimistic shared state, which is
          // no longer ours to add -- realtime/refetch will show the truth.
          if (!canEditBoardContentNow()) {
            return settleRevokedAfterPrimary(() => setIsNoteEditorOpen(false));
          }
          setIsNoteEditorOpen(false);
          setPadletToEdit(null);
          // Server truth for BOTH members, applied in the one pass that the
          // atomic write earned -- not a client-computed guess about either.
          const [first, second] = pair.rows;
          setPadlets(prev => prev.map(p => {
            const row = p.id === first.id ? first : (p.id === second.id ? second : null);
            if (!row) return p;
            return {
              ...p,
              title: row.title ?? '',
              content: row.content ?? '',
              metadata: (row.metadata ?? {}) as Padlet['metadata'],
            };
          }));
          return;
        }
        // Unsynced Note: the existing single-row update, unchanged.
        const { error } = await supabase
          .from('padlets')
          .update({
            title: data.title || '',
            content: data.content,
            metadata,
          })
          .eq('id', padletToEdit.id);
        if (error) throw error;
      }

      setIsNoteEditorOpen(false);
      setPadletToEdit(null);
      if (padletToEdit?.id === 'new') {
        if (createdPadlet) setPadlets(prev => [...prev, createdPadlet]);
        else fetchData();
      } else if (padletToEdit) {
        setPadlets(prev => prev.map(p => {
          if (p.id === padletToEdit!.id) return { ...p, title: data.title || '', content: data.content, metadata };
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
    // Board content, refused before anything is built. The discriminated
    // contract is preserved: a denial is a failure with a known error.
    if (!canEditBoardContentNow()) return { status: 'failed', error: BOARD_EDIT_NOT_ALLOWED };
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
        // As in saveNote: the insert stands, but no follow-up write starts
        // once the board authority is gone. The result is the SUCCESS
        // discriminant on purpose -- 'failed' makes DocumentEditor keep the
        // editor open with a retry prompt, and retrying a committed insert
        // would create a duplicate Card. Initial denial still fails.
        if (!canEditBoardContentNow()) {
          settleRevokedAfterPrimary(() => setIsCardEditorOpen(false));
          return { status: 'saved' };
        }

        // Update container's childPadletIds if this card belongs to one
        if (insertMetadata.parentId && newCard) {
          const { data: container } = await supabase
            .from('padlets')
            .select('metadata')
            .eq('id', insertMetadata.parentId)
            .single();
          // Revocation can land while that read is pending.
          if (!canEditBoardContentNow()) {
            settleRevokedAfterPrimary(() => setIsCardEditorOpen(false));
            return { status: 'saved' };
          }
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
        // IMAGE-LIBRARY: an Image is a durable asset, so saving one creates the
        // Library object AND this placement together, through the same atomic
        // RPC the PDF-area flow already uses. Two separate client inserts could
        // leave a card with no Library identity, which is the state the product
        // rule forbids. The RPC is SECURITY INVOKER and binds p_user_id to
        // auth.uid(), so board RLS stays the authority and no elevated key is
        // involved -- this is the ordinary authenticated browser client.
        // The identity of THIS request. Claimed SYNCHRONOUSLY, before the
        // first await: two Done clicks landing in the same tick must share it,
        // and anything after an await would already have let the second call
        // through with an id of its own.
        //
        // The fingerprint covers what the user chose -- the image and its
        // metadata -- and deliberately NOT the derived position, which is
        // recomputed from the camera on every save and would make an ordinary
        // retry look like a new request. It is a WITHIN-REQUEST comparison
        // only: two separate drafts of the same file still get separate ids and
        // separate Library objects.
        const requestFingerprint = JSON.stringify({ file_url: data.imageUrl, metadata });
        const held = newImageRequestRef.current;
        const padletId = held !== null && held.fingerprint === requestFingerprint
          ? held.padletId
          : crypto.randomUUID();
        newImageRequestRef.current = { fingerprint: requestFingerprint, padletId };
        const { data: auth } = await supabase.auth.getUser();
        // The identity lookup is this callback's first await; nothing that
        // consumes a resource has happened yet, so a revocation here costs
        // nothing and must stop the RPC, the read-back and the retry identity.
        if (!canEditBoardContentNow()) return;
        const userId = auth?.user?.id;
        if (!userId) throw new Error('Not signed in');
        const { error: pairError } = await supabase.rpc('create_image_post_with_library_item', {
          p_padlet_id: padletId,
          p_board_id: canvasId,
          p_user_id: userId,
          p_title: 'Image',
          p_content: '',
          p_position_x: position_x,
          p_position_y: position_y,
          p_width: 300,
          p_height: 200,
          p_file_url: data.imageUrl,
          p_metadata: metadata,
        });
        if (pairError) throw pairError;
        // The RPC's own await is the second boundary. Returning here leaves
        // `newImageRequestRef` untouched ON PURPOSE: the durable creation
        // identity belongs to the request, so a later authorised retry reuses
        // it rather than minting a second Image.
        if (!canEditBoardContentNow()) return;
        // Read the row back so every downstream consumer still receives exactly
        // what the database stored, defaults included.
        const { data: newImage, error } = await supabase
          .from('padlets').select().eq('id', padletId).single();
        if (error) throw error;
        newImageRequestRef.current = null;
        createdPadlet = newImage;
      } else {
        // Update Image -- title is left untouched here; it's only ever
        // changed through the image editing modal's own Title field now.
        //
        // IMAGE-LIBRARY: annotations are DURABLE IMAGE CONTENT, not placement
        // decoration. The placement and the SAME linked library_items row are
        // written by one shared authority, so the Freeform "Draw on image" arm
        // cannot drift from this one again -- see persistDurableImageContent.
        const outcome = await persistDurableImageContent(supabase as never, {
          mayContinue: canEditBoardContentNow,
          padletId: padletToEdit.id,
          libraryItemId: (padletToEdit as { library_item_id?: string | null }).library_item_id ?? null,
          imageUrl: data.imageUrl,
          metadata,
          title: padletToEdit.title,
          width: padletToEdit.width,
          height: padletToEdit.height,
        });
        // Nothing was written at all: the authority was already gone when the
        // helper was reached. Settle nothing -- no editor close, no read-back,
        // no reconciliation, no toast -- and leave the retry identity alone.
        if (outcome === 'denied') return;
        // The placement landed; the Library write did not. No read-back, no
        // local reconciliation, and the retry identity is left alone.
        if (outcome === 'placement-only') {
          return settleRevokedAfterPrimary(() => setIsImageEditorOpen(false));
        }
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
    // Board content: refused before metadata, ids, placement, editor state
    // or any request -- and asked live, so a retained handle refuses too.
    if (!canEditBoardContentNow()) return;
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
        // Ingestion is external work this client cannot undo once started;
        // the recheck below is what stops the BOARD write that would follow.
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
    // Ingestion is external work already done and not this client's to
    // reverse. What must not happen is the BOARD write that would follow it
    // for a user whose authority went away while assets were uploading.
    if (!canEditBoardContentNow()) return;

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
    ): boolean => (
      // TRUE is this contract's "do not insert". An unauthorised caller gets it
      // before any prompt opens, any id is minted or any placement state moves,
      // so a denial can never read as permission to continue.
      !canEditBoardContentNow() ? true : checkPlacementRequired(draft, closeEditor, {
      isNewPost: true,
      hasParentId: Boolean(draft.metadata?.parentId),
      hasSectionId: Boolean(draft.metadata?.sectionId),
      })
    ),
  };
}
