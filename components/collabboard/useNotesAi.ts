'use client';

/**
 * PATCH-353. "AI on notes": the state, the open rule and the post builders.
 *
 * The dialog is presentational; this hook owns which notes are candidates, the
 * pre-tick rule (the clicked note, or the whole selection when the clicked note
 * is part of a multi-selection), the generate call and the "Add to board" row.
 * The ref -> note map never leaves this hook: only refs, titles and texts are
 * sent, and NOTHING is written until the user presses Add.
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
import { requestNotesAi } from '@/lib/infra/ai/requestNotesAi';

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
}

export interface UseNotesAiResult {
  readonly isOpen: boolean;
  readonly open: (padletId: string) => void;
  readonly close: () => void;
  readonly dialogProps: NotesAiDialogProps;
}

const NOTES_AI_UNUSABLE = "The AI's answer couldn't be used — try again.";

export function useNotesAi(options: UseNotesAiOptions): UseNotesAiResult {
  const { boardId, notes, selectedPadletIds, canEdit, getFreePostPosition, getZIndex, onAddPost } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [candidates, setCandidates] = useState<readonly Padlet[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [action, setActionState] = useState<NotesAiAction>('summary');
  const [generating, setGenerating] = useState(false);
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
      ? buildNotesAiActionPlanRow(finalResult, context)
      : buildNotesAiSummaryRow(finalResult, context);
    void (async () => {
      await onAddPost(row);
      toast.success(isPlan ? 'Action plan added to the board' : 'Summary added to the board');
      setIsOpen(false);
    })();
  }, [boardId, getFreePostPosition, getZIndex, onAddPost]);

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
  }), [
    isOpen, close, candidates, selectedIds, onToggleNote, onToggleAll,
    action, onActionChange, generating, result, error, onGenerate, onAdd,
  ]);

  return { isOpen, open, close, dialogProps };
}
