"use client";

/**
 * useCanvasData — owns canvas entity data state + all supabase CRUD for
 * canvas, padlets, lines, and sections (PR5 scope).
 *
 * Auth supabase calls (workspace_members, supabase.auth) intentionally
 * remain in CanvasClient — they are session-scoped, not canvas-data-scoped.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  createCreateLineCommand,
  createDeleteLineCommand,
  createUpdateLineCommand,
} from '@/lib/domain/canvas/lines';
import {
  createCreatePostBestEffortCommand,
  createCreatePostCommand,
  createDeletePostCommand,
  createUpdatePostContentBestEffortCommand,
  createUpdatePostFieldsCommand,
  createUpdatePostMetadataBestEffortCommand,
  createUpdatePostTitleCommand,
} from '@/lib/domain/canvas/posts';
import { createCreateSectionsCommand } from '@/lib/domain/canvas/sections';
import { createLinesRepository } from '@/lib/infra/canvas/linesRepository';
import { createPostsRepository } from '@/lib/infra/canvas/postsRepository';
import { createSectionsRepository } from '@/lib/infra/canvas/sectionsRepository';
import {
  insertPostRow,
  insertPostRowReturning,
  updatePostRowById,
} from '@/lib/infra/supabase/postsRaw';
import {
  findBoardById,
  findLinesByBoardId,
  findPostsByBoardId,
  findSectionsByBoardId,
} from '@/lib/infra/canvas/canvasViewReads';
import type { Canvas, Padlet, CanvasLine, BoardSection } from '@/types/collabboard';
import { generateAndSaveThumbnail, updateLastVisited } from '@/lib/collabboard/thumbnailGenerator';
import { debugCanvasLogger } from '@/lib/collabboard/debugCanvasLogger';
import { toast } from 'sonner';
import type { CanvasAction } from '../store/actions';

interface UseCanvasDataParams {
  canvasId?: string;
  dispatch: React.Dispatch<CanvasAction>;
}

export function useCanvasData({ canvasId, dispatch }: UseCanvasDataParams) {
  // Cookie-authenticated client — must match the session the dashboard/rest of
  // the app uses, or RLS-gated queries silently return zero rows (see
  // lib/supabase/browser.ts vs lib/supabase.ts).
  const supabase = supabaseBrowser();
  // ── Data state ──────────────────────────────────────────────────────────────
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [padlets, setPadlets] = useState<Padlet[]>([]);
  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [sections, setSections] = useState<BoardSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Refs ────────────────────────────────────────────────────────────────────
  // Track IDs of padlets we've just modified locally, to skip redundant refetch from realtime
  const locallyModifiedPadletsRef = useRef<Set<string>>(new Set());
  // Track IDs of lines we've just modified locally
  const locallyModifiedLinesRef = useRef<Set<string>>(new Set());
  // Track padlets for thumbnail generation on cleanup
  const padletsRef = useRef<Padlet[]>([]);

  // Keep padletsRef in sync with padlets state
  useEffect(() => {
    padletsRef.current = padlets;
  }, [padlets]);

  // ── fetchData ───────────────────────────────────────────────────────────────
  // === BEGIN DATA REGION: SUPABASE + REALTIME ===
  const fetchData = useCallback(async (showLoading = false) => {
    if (!canvasId) {
      setError("Missing canvas ID");
      if (showLoading) setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    try {
      const canvasResult = await findBoardById(canvasId);

      const padletsResult = await findPostsByBoardId(canvasId);

      // Fetch lines (may not exist yet - graceful fallback)
      const linesResult = await findLinesByBoardId(canvasId);

      // Fetch sections for columns layout
      const sectionsResult = await findSectionsByBoardId(canvasId);

      if (!canvasResult.ok) {
        console.error('Error fetching canvas:', canvasResult.error.cause ?? canvasResult.error);
        throw canvasResult.error.cause ?? canvasResult.error;
      }
      if (!padletsResult.ok) {
        console.error('Error fetching padlets:', padletsResult.error.cause ?? padletsResult.error);
        throw padletsResult.error.cause ?? padletsResult.error;
      }
      // Don't throw on a failed lines read - table may not exist yet
      const canvasData = canvasResult.value as unknown as Canvas | null;
      const padletData = padletsResult.value as unknown as Padlet[];
      const lineData = linesResult.ok ? (linesResult.value as unknown as CanvasLine[]) : null;
      const sectionData = sectionsResult.ok ? (sectionsResult.value as unknown as BoardSection[]) : null;

      setCanvas(canvasData);

      let nextSections = sectionData || [];
      let nextPadlets = padletData || [];

      const shouldRecoverMissingSections =
        (canvasData?.layout === 'grid' || canvasData?.layout === 'columns') &&
        nextPadlets.length > 0;

      if (shouldRecoverMissingSections) {
        const existingSectionIds = new Set(nextSections.map((section) => String(section.id)));
        const missingSectionIds = Array.from(
          new Set(
            nextPadlets
              .map((padlet) => (padlet.metadata as any)?.sectionId)
              .filter((sectionId): sectionId is string => !!sectionId && !existingSectionIds.has(String(sectionId)))
          )
        );

        if (missingSectionIds.length > 0) {
          const maxPosition = nextSections.reduce(
            (max, section) => Math.max(max, Number(section.position) || 0),
            -1
          );

          try {
            const recoveryPayload = missingSectionIds.map((_, index) => ({
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
            }));

            const createSections = createCreateSectionsCommand(createSectionsRepository());
            const insertResult = await createSections(
              { boardId: canvasId, sections: recoveryPayload },
              { userId: null },
            );
            if (!insertResult.ok) throw insertResult.error.cause ?? insertResult.error;
            const recoveredSections = insertResult.value as unknown as BoardSection[] | null;

            const remap = new Map<string, string>();
            (recoveredSections || []).forEach((section, index) => {
              const oldId = missingSectionIds[index];
              if (oldId) remap.set(oldId, String(section.id));
            });

            const updatePostMetadataBestEffort = createUpdatePostMetadataBestEffortCommand(createPostsRepository());
            await Promise.all(
              nextPadlets
                .filter((padlet) => remap.has(String((padlet.metadata as any)?.sectionId)))
                .map(async (padlet) => {
                  const oldSectionId = String((padlet.metadata as any)?.sectionId);
                  const nextSectionId = remap.get(oldSectionId);
                  if (!nextSectionId) return;
                  const result = await updatePostMetadataBestEffort(
                    {
                      postId: padlet.id,
                      metadata: {
                        ...(padlet.metadata as any),
                        sectionId: nextSectionId,
                      },
                    },
                    { userId: null },
                  );
                  if (!result.ok) throw result.error.cause ?? result.error;
                })
            );

            nextSections = [...nextSections, ...((recoveredSections as BoardSection[]) || [])];
            nextPadlets = nextPadlets.map((padlet) => {
              const oldSectionId = String((padlet.metadata as any)?.sectionId || '');
              const nextSectionId = remap.get(oldSectionId);
              if (!nextSectionId) return padlet;
              return {
                ...padlet,
                metadata: {
                  ...(padlet.metadata as any),
                  sectionId: nextSectionId,
                },
              };
            });

            toast.warning('Recovered missing row/grid sections for this canvas.');
          } catch (recoveryError) {
            console.error('Failed to recover missing sections:', recoveryError);

            const syntheticSections = missingSectionIds.map((oldId, index) => ({
              id: Number(oldId) || -(index + 1),
              board_id: canvasId,
              title: `Recovered Section ${index + 1}`,
              description: '',
              position: maxPosition + index + 1,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })) as unknown as BoardSection[];

            nextSections = [...nextSections, ...syntheticSections];
          }
        }
      }

      setSections(nextSections);
      if (nextPadlets.length > 0) {
        // Filter out empty note/text padlets
        const validPadlets = nextPadlets.filter(p => {
          if (p.type === 'note' || p.type === 'text') {
            // Robust check: strip HTML tags, HTML entities like &nbsp;, and whitespace
            const strippedContent = p.content
              ? p.content
                .replace(/<[^>]*>/g, '') // Remove tags
                .replace(/&nbsp;/g, ' ') // Replace non-breaking space with space
                .replace(/&#160;/g, ' ') // Replace code for nbsp
                .trim()
              : '';
            const hasContent = strippedContent.length > 0;
            return hasContent;
          }
          return true;
        });
        setPadlets(validPadlets);
      } else {
        setPadlets([]);
      }
      // Normalize: rows written before the layer_plane column existed arrive as null.
      // Treat them as 'front' at runtime; the DB default handles new inserts.
      setLines((lineData || []).map(l => ({
        ...l,
        layer_plane: l.layer_plane ?? 'front',
      })));
    } catch (e) {
      console.error('fetchData failed:', e);
      setError('Failed to load canvas.');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [canvasId]);

  // ── Realtime ────────────────────────────────────────────────────────────────
  const handleRealtimePadletChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    const padletId = newRecord?.id || oldRecord?.id;
    debugCanvasLogger('realtimeUpdate', { eventType, padletId });

    // Skip if this was a local modification (we already have the update)
    if (padletId && locallyModifiedPadletsRef.current.has(padletId)) {
      locallyModifiedPadletsRef.current.delete(padletId);
      return;
    }

    if (eventType === 'INSERT' && newRecord) {
      setPadlets(prev => {
        if (prev.some(p => p.id === newRecord.id)) return prev;
        return [...prev, newRecord as Padlet];
      });
    } else if (eventType === 'UPDATE' && newRecord) {
      setPadlets(prev => prev.map(p =>
        p.id === newRecord.id ? { ...p, ...newRecord } : p
      ));
    } else if (eventType === 'DELETE' && oldRecord) {
      setPadlets(prev => prev.filter(p => p.id !== oldRecord.id));
    }
  }, []);

  useEffect(() => {
    if (!canvasId) return;
    fetchData(true);

    // Update last visited timestamp
    updateLastVisited(canvasId);

    const channel = supabase.channel(`canvas-${canvasId}`);
    channel
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'padlets',
          filter: `board_id=eq.${canvasId}`
        },
        handleRealtimePadletChange
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);

      // Generate and save thumbnail when leaving the canvas
      // Using the ref to get current padlets without causing re-runs
      const currentPadlets = padletsRef.current;
      if (canvasId && currentPadlets.length > 0) {
        generateAndSaveThumbnail(canvasId, currentPadlets.map(p => ({
          id: p.id,
          position_x: p.position_x || 0,
          position_y: p.position_y || 0,
          width: p.width || 200,
          height: p.height || 150,
          type: p.type,
          title: p.title,
          content: p.content,
          metadata: p.metadata as any
        })));
      }
    };
  }, [canvasId, handleRealtimePadletChange, fetchData]);

  /* -------------------------------------------------------------------------- */
  /*                                Optimized Update                               */
  /* -------------------------------------------------------------------------- */

  // Helper to mark a padlet as locally modified (skips redundant realtime refetch)
  const markPadletLocallyModified = useCallback((padletId: string) => {
    locallyModifiedPadletsRef.current.add(padletId);
    // Auto-clear after a short window (in case realtime event never arrives)
    setTimeout(() => {
      locallyModifiedPadletsRef.current.delete(padletId);
    }, 3000);
  }, []);

  // Helper to mark a line as locally modified
  const markLineLocallyModified = useCallback((lineId: string) => {
    locallyModifiedLinesRef.current.add(lineId);
    setTimeout(() => {
      locallyModifiedLinesRef.current.delete(lineId);
    }, 3000);
  }, []);
  // === END DATA REGION: SUPABASE + REALTIME ===

  // ── Line CRUD ───────────────────────────────────────────────────────────────

  // Fast local-only update (no DB call) - used during dragging
  const updateLineLocal = useCallback((lineId: string, updates: Partial<CanvasLine>) => {
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, ...updates }
        : l
    ));
  }, []);

  // Save line to database - called when drag ends
  const saveLineToDb = useCallback(async (lineId: string) => {
    if (lineId.startsWith('temp-')) return;

    const line = lines.find(l => l.id === lineId);
    if (!line) return;

    debugCanvasLogger('saveStart', { op: 'saveLineToDb', lineId });
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd(
      {
        lineId,
        updates: {
          start_x: line.start_x,
          start_y: line.start_y,
          control_x: line.control_x,
          control_y: line.control_y,
          end_x: line.end_x,
          end_y: line.end_y,
          points: line.points, // PERSIST POINTS
          start_post_id: line.start_post_id,
          end_post_id: line.end_post_id,
          // Styling and Label
          color: line.color,
          stroke_width: line.stroke_width,
          dashed: line.dashed,
          start_arrow: line.start_arrow,
          end_arrow: line.end_arrow,
          label: line.label,
          label_position: line.label_position,
          z_index: line.z_index,
          layer_plane: line.layer_plane ?? 'front',
          label_text_color: line.label_text_color,
          label_background_color: line.label_background_color,
        },
      },
      { userId: null },
    );
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'saveLineToDb', lineId }); }
  }, [lines]);

  // Update line with DB save (for toolbar changes)
  const updateLine = useCallback(async (lineId: string, updates: Partial<CanvasLine>) => {
    // Optimistic update
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, ...updates, updated_at: new Date().toISOString() }
        : l
    ));

    // Skip DB update for temp lines
    if (lineId.startsWith('temp-')) return;

    debugCanvasLogger('saveStart', { op: 'updateLine', lineId });
    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - only a successful save logs saveEnd. The
    // updated_at stamp is command-internal (canvas.updateLine).
    const updateLineCmd = createUpdateLineCommand(createLinesRepository());
    const result = await updateLineCmd({ lineId, updates }, { userId: null });
    if (result.ok) { debugCanvasLogger('saveEnd', { op: 'updateLine', lineId }); }
  }, []);

  const deleteLine = useCallback(async (lineId: string) => {
    // Optimistic update
    setLines(prev => prev.filter(l => l.id !== lineId));
    dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: null } });

    // Skip DB delete for temp lines
    if (lineId.startsWith('temp-')) return;

    // PRESERVED LEGACY SWALLOW (P3-family, do not repair): both failure
    // channels are ignored - the optimistic removal stands either way.
    const deleteLineCmd = createDeleteLineCommand(createLinesRepository());
    await deleteLineCmd({ lineId }, { userId: null });
  }, [dispatch]);

  const handleChangeLineLayer = useCallback((lineId: string, action: 'front' | 'back' | 'forward' | 'backward') => {
    const targetLine = lines.find(l => l.id === lineId);
    if (!targetLine) return;

    const currentPlane = targetLine.layer_plane ?? 'front';
    const currentZ = targetLine.z_index ?? 0;

    if (action === 'front') {
      // Move to front plane: place above all current front-plane lines
      const frontZIndexes = lines
        .filter(l => (l.layer_plane ?? 'front') === 'front')
        .map(l => l.z_index ?? 0);
      const maxFrontZ = frontZIndexes.length > 0 ? Math.max(...frontZIndexes) : 0;
      updateLine(lineId, { layer_plane: 'front', z_index: maxFrontZ + 1 });

    } else if (action === 'back') {
      // Move to back plane: place below all current back-plane lines
      const backZIndexes = lines
        .filter(l => (l.layer_plane ?? 'front') === 'back')
        .map(l => l.z_index ?? 0);
      const minBackZ = backZIndexes.length > 0 ? Math.min(...backZIndexes) : 0;
      updateLine(lineId, { layer_plane: 'back', z_index: minBackZ - 1 });

    } else if (action === 'forward') {
      // Reorder within the current plane only — do not change layer_plane
      updateLine(lineId, { z_index: currentZ + 1 });

    } else if (action === 'backward') {
      // Reorder within the current plane only — do not change layer_plane
      updateLine(lineId, { z_index: currentZ - 1 });
    }
  }, [lines, updateLine]);

  // Duplicate a line (for context menu)
  const duplicateLine = useCallback(async (lineId: string) => {
    const line = lines.find(l => l.id === lineId);
    if (!line || !canvasId) return;

    try {
      const newLineId = crypto.randomUUID();
      const offset = 20; // Offset for duplicated line

      const newLine: CanvasLine = {
        ...line,
        id: newLineId,
        start_x: line.start_x + offset,
        start_y: line.start_y + offset,
        end_x: line.end_x + offset,
        end_y: line.end_y + offset,
        control_x: line.control_x + offset,
        control_y: line.control_y + offset,
        points: line.points?.map(p => ({ ...p, x: p.x + offset, y: p.y + offset })),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Optimistic update
      setLines(prev => [...prev, newLine]);
      dispatch({ type: 'SELECTION_PATCH', payload: { selectedLineId: newLineId } });

      // Save to database. Channel split PRESERVED (no convergence
      // authorization): a RESOLVED insert error rolls back the optimistic
      // line (the legacy if (error) branch); a THROWN one carries code
      // 'unknown' out of defineCommand's catch and stays silent with the
      // optimistic line kept - exactly the legacy empty catch.
      const createLineCmd = createCreateLineCommand(createLinesRepository());
      const result = await createLineCmd({ row: newLine }, { userId: null });

      if (!result.ok && result.error.code !== 'unknown') {
        // Rollback on error
        setLines(prev => prev.filter(l => l.id !== newLineId));
      }
    } catch (e) {
    }
  }, [lines, canvasId, dispatch]);

  // ── Padlet content/title mutations ──────────────────────────────────────────

  const updatePadletContent = async (padletId: string, content: string) => {
    try {
      const updatePostContentBestEffort = createUpdatePostContentBestEffortCommand(createPostsRepository());
      const result = await updatePostContentBestEffort({ postId: padletId, content }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      setPadlets((prev) =>
        prev.map((p) => (p.id === padletId ? { ...p, content } : p))
      );
    } catch (err) {
      console.error('Failed to update padlet content:', err);
    }
  };

  const updatePadletTitle = async (padletId: string, title: string) => {
    markPadletLocallyModified(padletId);
    try {
      const updatePostTitle = createUpdatePostTitleCommand(createPostsRepository());
      const result = await updatePostTitle({ postId: padletId, title }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;

      // Optimistic local update
      setPadlets(prev => prev.map(p =>
        p.id === padletId ? { ...p, title } : p
      ));
    } catch (e) {
      console.error('Failed to update padlet title:', e);
    }
  };

  const addPadletFromLibraryItem = useCallback(async (payload: any) => {
    const createPostBestEffort = createCreatePostBestEffortCommand(createPostsRepository());
    const result = await createPostBestEffort({ row: payload }, { userId: null });
    if (!result.ok) throw result.error.cause ?? result.error;
    fetchData();
  }, [fetchData]);

  const addFreeformCardPadlet = useCallback(async (newPadlet: Padlet) => {
    // AUTHORIZED CONVERGENCE (PATCH-041, the program's fourth behavior
    // micro-change): a THROWN insert failure previously escaped to the drop
    // handler's catch and left the optimistic card stranded (ghost work,
    // P3); both failure channels now take the SAME rollback branch below.
    const createPost = createCreatePostCommand(createPostsRepository());
    const result = await createPost({ row: newPadlet }, { userId: null });
    if (!result.ok) {
      setPadlets((prev) => prev.filter((p) => p.id !== newPadlet.id));
    }
  }, []);

  const addDrawingLayoutPadlet = useCallback(async (newPadlet: any, newId: string) => {
    try {
      const createPost = createCreatePostCommand(createPostsRepository());
      const result = await createPost({ row: newPadlet }, { userId: null });
      if (!result.ok) throw result.error.cause ?? result.error;
      return newPadlet;
    } catch (err) {
      console.error('Failed to create drawing padlet:', err);
      setPadlets(prev => prev.filter(p => p.id !== newId));
      return null;
    }
  }, []);

  const updateDrawingLayoutPadlet = useCallback(async (id: string, updates: any) => {
    const previousPadlet = padletsRef.current.find((p) => p.id === id);
    if (!previousPadlet) return;

    markPadletLocallyModified(id);
    setPadlets((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)));

    try {
      // Channel split PRESERVED (the PATCH-045 idiom): a THROWN failure
      // carries code 'unknown' out of defineCommand's catch and re-throws
      // its original cause into the catch below (the legacy console.error +
      // rollback); a RESOLVED error takes the silent rollback branch.
      const updatePostFields = createUpdatePostFieldsCommand(createPostsRepository());
      const result = await updatePostFields({ postId: id, fields: updates }, { userId: null });
      if (!result.ok && result.error.code === 'unknown') {
        throw result.error.cause ?? result.error;
      }
      if (!result.ok) {
        setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
      }
    } catch (err) {
      console.error('Failed to update padlet:', err);
      setPadlets((prev) => prev.map((p) => (p.id === id ? previousPadlet : p)));
    }
  }, [markPadletLocallyModified]);

  const insertPadlet = useCallback(async (payload: any) => {
    return await insertPostRow(payload);
  }, []);

  const insertPadletAndSelectSingle = useCallback(async (payload: any) => {
    return await insertPostRowReturning(payload);
  }, []);

  const updatePadletById = useCallback(async (id: string, updates: any) => {
    return await updatePostRowById(id, updates);
  }, []);

  // PATCH-049: the raw delete passthrough retired onto canvas.deletePost -
  // two helpers, one per legacy call-site contract (the 045 discrimination).

  /**
   * The container-creation compensating delete (two CanvasClient sites).
   * PRESERVED LEGACY SWALLOW (queued P3-family fix, do NOT repair here):
   * the legacy sites awaited the raw delete bare - a RESOLVED failure was
   * silently ignored and the pending container throw proceeded; only a
   * THROWN failure replaced it. Faithful port: code 'unknown' rethrows the
   * original cause; any other failure is deliberately ignored.
   */
  const deletePostSwallowResolved = useCallback(async (id: string) => {
    const deletePost = createDeletePostCommand(createPostsRepository());
    const result = await deletePost({ postId: id }, { userId: null });
    if (!result.ok && result.error.code === 'unknown') {
      throw result.error.cause ?? result.error;
    }
  }, []);

  /**
   * The map-pin container delete: BOTH legacy channels already converged
   * (the resolved `{ error }` was check-and-thrown into the same catch a
   * thrown failure reached), so ANY failure rethrows its original cause -
   * the 038/040 check-and-throw port, no behavior authorization needed.
   */
  const deletePostOrThrow = useCallback(async (id: string) => {
    const deletePost = createDeletePostCommand(createPostsRepository());
    const result = await deletePost({ postId: id }, { userId: null });
    if (!result.ok) {
      throw result.error.cause ?? result.error;
    }
  }, []);

  // ── Return ──────────────────────────────────────────────────────────────────
  return {
    // Data state (exposed for CanvasClient read + optimistic updates)
    canvas,
    padlets,
    setPadlets,
    lines,
    setLines,
    sections,
    setSections,
    loading,
    error,
    // Core data operations
    fetchData,
    markPadletLocallyModified,
    markLineLocallyModified,
    // Line CRUD
    updateLineLocal,
    saveLineToDb,
    updateLine,
    deleteLine,
    duplicateLine,
    handleChangeLineLayer,
    // Padlet mutations
    updatePadletContent,
    updatePadletTitle,
    addPadletFromLibraryItem,
    addFreeformCardPadlet,
    addDrawingLayoutPadlet,
    updateDrawingLayoutPadlet,
    insertPadlet,
    insertPadletAndSelectSingle,
    updatePadletById,
    deletePostSwallowResolved,
    deletePostOrThrow,
  };
}
