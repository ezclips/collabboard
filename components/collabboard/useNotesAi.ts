'use client';

/**
 * PATCH-353/354. "AI on notes": the state, the open rule and the writes.
 *
 * The dialog is presentational; this hook owns which notes are candidates, the
 * pre-tick rule, the generate call, "Add to board" and "Arrange on board" (group
 * by theme). The ref -> note map never leaves this hook: only refs, titles and
 * texts are sent, and NOTHING is written until the user presses a button.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { Padlet } from '@/types/collabboard';
import { isNotePost, notePlainText, sortNotesForSend } from '@/lib/domain/canvas/noteToKanbanCard';
import {
  NOTES_AI_TEXT_MAX,
  NOTES_AI_TITLE_MAX,
  actionPlanToTasks,
  notesAiRef,
  summaryToNoteHtml,
  type NotesAiAction,
  type NotesAiActionPlan,
  type NotesAiResult,
  type NotesAiSummary,
} from '@/lib/domain/ai/notesAi';
import { arrangeThemes, slideClear } from '@/lib/domain/canvas/themeArrangement';
import type { WorldRect } from '@/lib/domain/canvas/freeformFreeSpot';
import { clampRectPositionToFreeformBounds } from '@/components/collabboard/canvas/engine/freeformStageGeometry';
import { SECTION_HEADING_LEVEL_HEIGHT, SECTION_HEADING_TYPE } from '@/components/collabboard/canvas/engine/sectionHeading';
import type { NotesAiPositionMove } from './notesAiArrange';
import { requestNotesAi } from '@/lib/infra/ai/requestNotesAi';

/** The theme headings are always created at this level. */
const NOTES_AI_HEADING_LEVEL = 3;

/**
 * The ONE payload builder: the hook's request and the dialog's size check both
 * call it, so what is sent and what is checked cannot disagree.
 *
 * PATCH-353 Addendum 1: `title` is the note's OWN title (empty when it has
 * none) and `text` is the full plain text -- the old `noteToKanbanCard` title
 * was the first line, which then appeared AGAIN at the start of the text.
 */
export function buildNotesAiNotes(
  notes: readonly Padlet[],
): Array<{ ref: string; title: string; text: string }> {
  return notes.map((note, index) => ({
    ref: notesAiRef(index),
    title: (note.title ?? '').trim().slice(0, NOTES_AI_TITLE_MAX),
    text: notePlainText(note).slice(0, NOTES_AI_TEXT_MAX),
  }));
}

/** The fixed bits a built row needs, supplied by the host. */
export interface NotesAiRowContext {
  readonly id: string;
  readonly boardId: string;
  readonly positionX: number;
  readonly positionY: number;
  readonly zIndex: number;
  readonly nowIso: string;
}

/** A summary becomes an ordinary `text` Note carrying the summary's HTML. */
export function buildNotesAiSummaryRow(result: NotesAiSummary, context: NotesAiRowContext): Padlet {
  return {
    id: context.id,
    board_id: context.boardId,
    title: result.title || 'AI summary',
    content: summaryToNoteHtml(result),
    type: 'text',
    position_x: context.positionX,
    position_y: context.positionY,
    width: 320,
    height: 320,
    created_at: context.nowIso,
    updated_at: context.nowIso,
    metadata: { cardColor: '#ffffff', zIndex: context.zIndex },
  };
}

/** An action plan becomes a `todo` post whose tasks are the plan's tasks. */
export function buildNotesAiActionPlanRow(result: NotesAiActionPlan, context: NotesAiRowContext): Padlet {
  const title = result.title || 'Action plan';
  const tasks = actionPlanToTasks(result, context.id);
  return {
    id: context.id,
    board_id: context.boardId,
    title,
    content: JSON.stringify(tasks),
    type: 'todo',
    position_x: context.positionX,
    position_y: context.positionY,
    width: 320,
    height: 360,
    created_at: context.nowIso,
    updated_at: context.nowIso,
    metadata: { tasks, todoTitle: title, zIndex: context.zIndex },
  };
}

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

/** One theme as the dialog sees it: a name and the notes' board ids. */
export interface NotesAiThemePreview {
  readonly title: string;
  readonly noteIds: readonly string[];
}

export interface NotesAiDialogProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly notes: readonly Padlet[];
  readonly selectedIds: readonly string[];
  readonly onToggleNote: (padletId: string) => void;
  readonly onToggleAll: () => void;
  readonly action: NotesAiAction;
  readonly onActionChange: (action: NotesAiAction) => void;
  readonly generating: boolean;
  readonly result: NotesAiResult | null;
  readonly error: string | null;
  readonly onGenerate: () => void;
  readonly onAdd: (result: NotesAiResult) => void;
  /** PATCH-354. The themes result, refs resolved to board ids for the preview. */
  readonly themes: readonly NotesAiThemePreview[];
  /** PATCH-354. Arrange the reviewed themes on the board. */
  readonly onArrange: (themes: readonly NotesAiThemePreview[]) => void;
  readonly arranging: boolean;
  /** Ticked notes that sit inside a column, so the themes tab can say so. */
  readonly themesLeftOut: number;
}

export interface UseNotesAiOptions {
  readonly boardId: string | null;
  /** Every post on the board; the hook keeps only the note posts. */
  readonly notes: readonly Padlet[];
  readonly selectedPadletIds: readonly string[];
  readonly canEdit: boolean;
  readonly getFreePostPosition: (width: number, height: number) => { readonly x: number; readonly y: number };
  readonly getZIndex: () => number;
  readonly onAddPost: (row: Padlet) => Promise<void>;
  /** PATCH-354. RENDERED rects by post id (no viewport filter). */
  readonly readPostRects: (ids?: readonly string[]) => ReadonlyMap<string, WorldRect>;
  readonly onMovePosts: (moves: readonly NotesAiPositionMove[]) => Promise<boolean>;
  readonly onDeletePost: (padletId: string) => Promise<void>;
  readonly onReveal: (padletId: string) => void;
}

export interface UseNotesAiResult {
  readonly isOpen: boolean;
  readonly open: (padletId: string) => void;
  readonly close: () => void;
  readonly dialogProps: NotesAiDialogProps;
}

const NOTES_AI_UNUSABLE = "The AI's answer couldn't be used — try again.";
const NOTES_AI_ARRANGE_FAILED = "Couldn't arrange the notes — nothing was changed.";
const NOTES_AI_ARRANGE_ROLLBACK_INCOMPLETE =
  "Couldn't arrange the notes, and the rollback was incomplete — some notes or headings may need moving back by hand.";
const NOTES_AI_UNDO_INCOMPLETE =
  "Couldn't fully undo the arrangement — some notes or headings may need moving back by hand.";

export function useNotesAi(options: UseNotesAiOptions): UseNotesAiResult {
  const {
    boardId, notes, selectedPadletIds, canEdit, getFreePostPosition, getZIndex, onAddPost,
    readPostRects, onMovePosts, onDeletePost, onReveal,
  } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [candidates, setCandidates] = useState<readonly Padlet[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [action, setActionState] = useState<NotesAiAction>('summary');
  const [generating, setGenerating] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [result, setResult] = useState<NotesAiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The ref -> note map stays here; it is never sent.
  const refToNoteId = useRef<Map<string, string>>(new Map());

  const open = useCallback((padletId: string) => {
    if (!canEdit) return;
    const list = sortNotesForSend(notes.filter(isNotePost));
    if (list.length === 0) {
      toast.info('There are no notes on this board.');
      return;
    }
    // Freeform has no multi-select gesture: pre-tick the clicked note, or every
    // selected note when the clicked note is part of a multi-selection.
    const multi = selectedPadletIds.length > 1 && selectedPadletIds.includes(padletId);
    const preselected = (multi
      ? list.filter((note) => selectedPadletIds.includes(note.id))
      : list.filter((note) => note.id === padletId)).map((note) => note.id);
    setCandidates(list);
    setSelectedIds(preselected);
    setActionState('summary');
    setResult(null);
    setError(null);
    setIsOpen(true);
  }, [canEdit, notes, selectedPadletIds]);

  const close = useCallback(() => setIsOpen(false), []);

  const onActionChange = useCallback((next: NotesAiAction) => {
    setActionState(next);
    setResult(null);
    setError(null);
  }, []);

  const onToggleNote = useCallback((padletId: string) => {
    setSelectedIds((current) => (
      current.includes(padletId) ? current.filter((id) => id !== padletId) : [...current, padletId]
    ));
  }, []);

  const onToggleAll = useCallback(() => {
    setSelectedIds((current) => (current.length === candidates.length ? [] : candidates.map((note) => note.id)));
  }, [candidates]);

  const onGenerate = useCallback(() => {
    if (!boardId || generating) return;
    const ticked = candidates.filter((note) => selectedIds.includes(note.id));
    if (ticked.length === 0) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    // Only refs, titles and texts leave the browser.
    const payload = buildNotesAiNotes(ticked);
    refToNoteId.current = new Map(payload.map((entry, index) => [entry.ref, ticked[index].id]));
    void (async () => {
      const response = await requestNotesAi({ boardId, action, notes: payload });
      setGenerating(false);
      if (!response.ok) {
        setError(response.message);
        return;
      }
      if (response.result === null) {
        setError(NOTES_AI_UNUSABLE);
        return;
      }
      setResult(response.result);
    })();
  }, [boardId, generating, candidates, selectedIds, action]);

  const onAdd = useCallback((finalResult: NotesAiResult) => {
    if (!boardId) return;
    // Themes are arranged, never added as one post.
    if ('themes' in finalResult) return;
    const isPlan = 'tasks' in finalResult;
    const width = 320;
    const height = isPlan ? 360 : 320;
    const position = getFreePostPosition(width, height);
    const context: NotesAiRowContext = {
      id: crypto.randomUUID(),
      boardId,
      positionX: position.x,
      positionY: position.y,
      zIndex: getZIndex(),
      nowIso: new Date().toISOString(),
    };
    const row = isPlan
      ? buildNotesAiActionPlanRow(finalResult as NotesAiActionPlan, context)
      : buildNotesAiSummaryRow(finalResult as NotesAiSummary, context);
    void (async () => {
      await onAddPost(row);
      toast.success(isPlan ? 'Action plan added to the board' : 'Summary added to the board');
      setIsOpen(false);
    })();
  }, [boardId, getFreePostPosition, getZIndex, onAddPost]);

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
      setIsOpen(false);
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
    getZIndex, onAddPost, onMovePosts, onDeletePost, onReveal,
  ]);

  const themesLeftOut = useMemo(
    () => candidates.filter((note) => selectedIds.includes(note.id) && isInsideColumn(note)).length,
    [candidates, selectedIds],
  );

  // The themes result, refs resolved to board ids for the dialog's preview.
  const themes = useMemo<readonly NotesAiThemePreview[]>(() => {
    if (!result || !('themes' in result)) return [];
    const refToId = refToNoteId.current;
    return result.themes.map((theme) => ({
      title: theme.title,
      noteIds: theme.noteRefs.map((ref) => refToId.get(ref)).filter((id): id is string => !!id),
    }));
  }, [result]);

  const dialogProps = useMemo<NotesAiDialogProps>(() => ({
    isOpen,
    onClose: close,
    notes: candidates,
    selectedIds,
    onToggleNote,
    onToggleAll,
    action,
    onActionChange,
    generating,
    result,
    error,
    onGenerate,
    onAdd,
    themes,
    onArrange,
    arranging,
    themesLeftOut,
  }), [
    isOpen, close, candidates, selectedIds, onToggleNote, onToggleAll,
    action, onActionChange, generating, result, error, onGenerate, onAdd,
    themes, onArrange, arranging, themesLeftOut,
  ]);

  return { isOpen, open, close, dialogProps };
}
