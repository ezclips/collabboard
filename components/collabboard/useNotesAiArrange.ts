'use client';

/**
 * PATCH-355. The "Group by theme" flow, split out of `useNotesAi.ts` so no hook
 * file is over the 400-line ceiling. Behaviour is PATCH-354's, unchanged: only
 * free notes are arranged, headings are created first, a failure rolls the whole
 * arrangement back, and Undo restores it -- reporting an incomplete rollback or
 * undo instead of hiding it (P3).
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { Padlet } from '@/types/collabboard';
import type { NotesAiResult } from '@/lib/domain/ai/notesAi';
import { arrangeThemes, slideClear } from '@/lib/domain/canvas/themeArrangement';
import type { WorldRect } from '@/lib/domain/canvas/freeformFreeSpot';
import { clampRectPositionToFreeformBounds } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { SECTION_HEADING_LEVEL_HEIGHT, SECTION_HEADING_TYPE } from '@/components/collabboard/canvas/engine/sectionHeading';
import type { NotesAiPositionMove } from './notesAiArrange';
import type { NotesAiRowContext, NotesAiThemePreview } from './useNotesAi';

/** The theme headings are always created at this level. */
const NOTES_AI_HEADING_LEVEL = 3;

const NOTES_AI_ARRANGE_FAILED = "Couldn't arrange the notes — nothing was changed.";
const NOTES_AI_ARRANGE_ROLLBACK_INCOMPLETE =
  "Couldn't arrange the notes, and the rollback was incomplete — some notes or headings may need moving back by hand.";
const NOTES_AI_UNDO_INCOMPLETE =
  "Couldn't fully undo the arrangement — some notes or headings may need moving back by hand.";

/** PATCH-354. One theme's heading: a level-3 Section Heading, `title` = theme. */
export function buildNotesAiHeadingRow(
  title: string,
  context: NotesAiRowContext & { readonly width: number },
): Padlet {
  return {
    id: context.id,
    board_id: context.boardId,
    title: title || 'Theme',
    content: '',
    type: SECTION_HEADING_TYPE,
    position_x: context.positionX,
    position_y: context.positionY,
    width: context.width,
    height: SECTION_HEADING_LEVEL_HEIGHT[NOTES_AI_HEADING_LEVEL],
    created_at: context.nowIso,
    updated_at: context.nowIso,
    metadata: { headingLevel: NOTES_AI_HEADING_LEVEL, zIndex: context.zIndex },
  };
}

/** A note drawn inside a column owns no free position, so it cannot be arranged. */
function isInsideColumn(note: Padlet): boolean {
  return Boolean((note.metadata as { parentId?: unknown } | undefined)?.parentId);
}

export interface UseNotesAiArrangeOptions {
  readonly boardId: string | null;
  readonly candidates: readonly Padlet[];
  readonly selectedIds: readonly string[];
  readonly result: NotesAiResult | null;
  readonly refToNoteId: ReadonlyMap<string, string>;
  /** PATCH-354. RENDERED rects by post id (no viewport filter). */
  readonly readPostRects: (ids?: readonly string[]) => ReadonlyMap<string, WorldRect>;
  readonly getZIndex: () => number;
  readonly onAddPost: (row: Padlet) => Promise<void>;
  readonly onMovePosts: (moves: readonly NotesAiPositionMove[]) => Promise<boolean>;
  readonly onDeletePost: (padletId: string) => Promise<void>;
  readonly onReveal: (padletId: string) => void;
  readonly onClose: () => void;
}

export interface UseNotesAiArrangeResult {
  /** PATCH-354. The themes result, refs resolved to board ids for the preview. */
  readonly themes: readonly NotesAiThemePreview[];
  /** Ticked notes that sit inside a column, so the themes tab can say so. */
  readonly themesLeftOut: number;
  readonly arranging: boolean;
  readonly onArrange: (themes: readonly NotesAiThemePreview[]) => void;
}

export function useNotesAiArrange(options: UseNotesAiArrangeOptions): UseNotesAiArrangeResult {
  const {
    boardId, candidates, selectedIds, result, refToNoteId,
    readPostRects, getZIndex, onAddPost, onMovePosts, onDeletePost, onReveal, onClose,
  } = options;

  const [arranging, setArranging] = useState(false);

  /** PATCH-354. Arrange the reviewed themes: headings first, then the notes. */
  const onArrange = useCallback((themes: readonly NotesAiThemePreview[]) => {
    if (!boardId || arranging) return;
    const ticked = candidates.filter((note) => selectedIds.includes(note.id));
    // Only FREE notes can be arranged: a note inside a column owns no position.
    const free = ticked.filter((note) => !isInsideColumn(note));
    const freeIds = new Set(free.map((note) => note.id));
    const themeInputs = themes
      .map((theme) => ({ title: theme.title, noteIds: theme.noteIds.filter((id) => freeIds.has(id)) }))
      .filter((theme) => theme.noteIds.length > 0);
    if (themeInputs.length === 0) {
      toast.info('There are no free notes to arrange.');
      return;
    }

    // Layout uses RENDERED sizes; the stored ones are only a fallback.
    const rendered = readPostRects([...freeIds]);
    const sizes = new Map<string, { width: number; height: number }>();
    for (const note of free) {
      const rect = rendered.get(note.id);
      sizes.set(note.id, rect
        ? { width: rect.width, height: rect.height }
        : { width: note.width, height: note.height });
    }
    const placed = [...rendered.values()];
    const origin = placed.length > 0
      ? { x: Math.min(...placed.map((rect) => rect.x)), y: Math.min(...placed.map((rect) => rect.y)) }
      : { x: 0, y: 0 };
    const obstacles = [...readPostRects().entries()]
      .filter(([id]) => !freeIds.has(id))
      .map(([, rect]) => rect);

    const arrangement = arrangeThemes({
      themes: themeInputs,
      sizes,
      origin,
      headingHeight: SECTION_HEADING_LEVEL_HEIGHT[NOTES_AI_HEADING_LEVEL],
    });
    const dx = slideClear(arrangement.bounds, obstacles);

    const noteMoves: NotesAiPositionMove[] = arrangement.notes.map((note) => {
      const size = sizes.get(note.id) ?? { width: 0, height: 0 };
      // PATCH-354 Addendum 1: the slide is HORIZONTAL only -- adding dx to y
      // dropped the notes far below their headings.
      const clamped = clampRectPositionToFreeformBounds({
        x: note.x + dx, y: note.y, width: size.width, height: size.height,
      });
      return { id: note.id, x: Math.round(clamped.x), y: Math.round(clamped.y) };
    });
    const oldMoves: NotesAiPositionMove[] = free.map((note) => ({
      id: note.id, x: Math.round(note.position_x), y: Math.round(note.position_y),
    }));
    const nowIso = new Date().toISOString();
    const headingRows = arrangement.headings.map((heading) => buildNotesAiHeadingRow(
      themeInputs[heading.themeIndex].title,
      {
        id: crypto.randomUUID(),
        boardId,
        positionX: Math.round(heading.x + dx),
        positionY: Math.round(heading.y),
        width: Math.round(heading.width),
        zIndex: getZIndex(),
        nowIso,
      },
    ));

    setArranging(true);
    void (async () => {
      const headingIds: string[] = [];
      // PATCH-354 Addendum 1: never silent (P3). True only when EVERY heading
      // was actually deleted.
      const undoHeadings = async (): Promise<boolean> => {
        let allDeleted = true;
        for (const id of headingIds) {
          try {
            await onDeletePost(id);
          } catch (error) {
            allDeleted = false;
            console.error('Failed to delete a theme heading during undo:', error);
          }
        }
        return allDeleted;
      };
      try {
        for (const row of headingRows) {
          await onAddPost(row);
          headingIds.push(row.id);
        }
      } catch {
        const headingsGone = await undoHeadings();
        setArranging(false);
        if (headingsGone) {
          toast.error(NOTES_AI_ARRANGE_FAILED);
        } else {
          toast.error(NOTES_AI_ARRANGE_ROLLBACK_INCOMPLETE);
        }
        return;
      }

      const moved = await onMovePosts(noteMoves);
      if (!moved) {
        // Undo what was done: never leave a half arrangement -- and say so
        // loudly when that undo did not fully succeed.
        const restored = await onMovePosts(oldMoves);
        const headingsGone = await undoHeadings();
        setArranging(false);
        if (restored && headingsGone) {
          toast.error(NOTES_AI_ARRANGE_FAILED);
        } else {
          console.error('Arrangement rollback was incomplete:', { restored, headingsGone });
          toast.error(NOTES_AI_ARRANGE_ROLLBACK_INCOMPLETE);
        }
        return;
      }

      setArranging(false);
      onClose();
      onReveal(headingIds[0]);
      toast.success(`Arranged ${noteMoves.length} notes into ${themeInputs.length} themes`, {
        duration: 20_000,
        action: {
          label: 'Undo',
          onClick: () => {
            void (async () => {
              const restored = await onMovePosts(oldMoves);
              const headingsGone = await undoHeadings();
              if (restored && headingsGone) {
                toast('Arrangement undone');
              } else {
                console.error('Arrangement undo was incomplete:', { restored, headingsGone });
                toast.error(NOTES_AI_UNDO_INCOMPLETE);
              }
            })();
          },
        },
      });
    })();
  }, [
    boardId, arranging, candidates, selectedIds, readPostRects,
    getZIndex, onAddPost, onMovePosts, onDeletePost, onReveal, onClose,
  ]);

  const themesLeftOut = useMemo(
    () => candidates.filter((note) => selectedIds.includes(note.id) && isInsideColumn(note)).length,
    [candidates, selectedIds],
  );

  // The themes result, refs resolved to board ids for the dialog's preview.
  const themes = useMemo<readonly NotesAiThemePreview[]>(() => {
    if (!result || !('themes' in result)) return [];
    return result.themes.map((theme) => ({
      title: theme.title,
      noteIds: theme.noteRefs.map((ref) => refToNoteId.get(ref)).filter((id): id is string => !!id),
    }));
  }, [result, refToNoteId]);

  return { themes, themesLeftOut, arranging, onArrange };
}
