'use client';

/**
 * PATCH-353/354/355. "AI on notes": the state, the open rule and the generate
 * call. The dialog is presentational; this hook owns which notes are candidates,
 * the pre-tick rule, the generate call, "Add to board", and composes the two
 * split-out flows -- "Group by theme" (`useNotesAiArrange`) and "Translate"
 * (`useNotesAiTranslate`). The ref -> note map never leaves this hook: only refs,
 * titles and texts (or segments) are sent, and NOTHING is written until the user
 * presses a button.
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
import type { WorldRect } from '@/lib/domain/canvas/freeformFreeSpot';
import { requestNotesAi } from '@/lib/infra/ai/requestNotesAi';
import type { NotesAiPositionMove } from './notesAiArrange';
import type { NotesAiFieldUpdate } from './notesAiUpdate';
import { useNotesAiArrange } from './useNotesAiArrange';
import {
  buildNotesAiTranslation,
  isSyncedNote,
  useNotesAiTranslate,
  type NotesAiTranslationPreview,
} from './useNotesAiTranslate';

/**
 * The ONE payload builder for the generative actions: the hook's request and the
 * dialog's size check both call it, so what is sent and what is checked cannot
 * disagree.
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
  /** PATCH-355. Translate: the language choice and the free-text fallback. */
  readonly languageChoice: string;
  readonly onLanguageChoiceChange: (value: string) => void;
  readonly otherLanguage: string;
  readonly onOtherLanguageChange: (value: string) => void;
  readonly targetLanguage: string;
  readonly languageValid: boolean;
  /** PATCH-355. One preview row per translated note. */
  readonly translations: readonly NotesAiTranslationPreview[];
  readonly failedCount: number;
  /** PATCH-355. Ticked notes that are synced, so the translate tab can say so. */
  readonly syncedLeftOut: number;
  readonly applying: boolean;
  readonly onApply: (tickedNoteIds: readonly string[]) => void;
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
  /** PATCH-355. Apply translated title/content, optimistically, then persisted. */
  readonly onUpdateNotes: (updates: readonly NotesAiFieldUpdate[]) => Promise<boolean>;
}

export interface UseNotesAiResult {
  readonly isOpen: boolean;
  readonly open: (padletId: string) => void;
  readonly close: () => void;
  readonly dialogProps: NotesAiDialogProps;
}

const NOTES_AI_UNUSABLE = "The AI's answer couldn't be used — try again.";

export function useNotesAi(options: UseNotesAiOptions): UseNotesAiResult {
  const {
    boardId, notes, selectedPadletIds, canEdit, getFreePostPosition, getZIndex, onAddPost,
    readPostRects, onMovePosts, onDeletePost, onReveal, onUpdateNotes,
  } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [candidates, setCandidates] = useState<readonly Padlet[]>([]);
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [action, setActionState] = useState<NotesAiAction>('summary');
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<NotesAiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The ref -> note map stays here; it is never sent.
  const refToNoteId = useRef<Map<string, string>>(new Map());
  // PATCH-355. Each sent ref's title/content at Generate time, for the stale check.
  const snapshot = useRef<Map<string, { title: string; content: string }>>(new Map());

  const close = useCallback(() => setIsOpen(false), []);

  const translate = useNotesAiTranslate({
    candidates,
    liveNotes: notes,
    selectedIds,
    result,
    refToNoteId: refToNoteId.current,
    snapshot: snapshot.current,
    onUpdateNotes,
    onClose: close,
  });

  const arrange = useNotesAiArrange({
    boardId,
    candidates,
    selectedIds,
    result,
    refToNoteId: refToNoteId.current,
    readPostRects,
    getZIndex,
    onAddPost,
    onMovePosts,
    onDeletePost,
    onReveal,
    onClose: close,
  });

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
    void (async () => {
      let response: Awaited<ReturnType<typeof requestNotesAi>>;
      if (action === 'translate') {
        // A synced note must be saved through the atomic pair RPC, so it is left out.
        const sendable = ticked.filter((note) => !isSyncedNote(note));
        const payload = buildNotesAiTranslation(sendable);
        refToNoteId.current = new Map(payload.map((entry, index) => [entry.ref, sendable[index].id]));
        snapshot.current = new Map(payload.map((entry, index) => [
          entry.ref,
          { title: sendable[index].title ?? '', content: sendable[index].content ?? '' },
        ]));
        response = await requestNotesAi({
          boardId, action: 'translate', language: translate.targetLanguage, notes: payload,
        });
      } else {
        // Only refs, titles and texts leave the browser.
        const payload = buildNotesAiNotes(ticked);
        refToNoteId.current = new Map(payload.map((entry, index) => [entry.ref, ticked[index].id]));
        snapshot.current = new Map();
        response = await requestNotesAi({ boardId, action, notes: payload });
      }
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
  }, [boardId, generating, candidates, selectedIds, action, translate.targetLanguage]);

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
    themes: arrange.themes,
    onArrange: arrange.onArrange,
    arranging: arrange.arranging,
    themesLeftOut: arrange.themesLeftOut,
    languageChoice: translate.languageChoice,
    onLanguageChoiceChange: translate.onLanguageChoiceChange,
    otherLanguage: translate.otherLanguage,
    onOtherLanguageChange: translate.onOtherLanguageChange,
    targetLanguage: translate.targetLanguage,
    languageValid: translate.languageValid,
    translations: translate.translations,
    failedCount: translate.failedCount,
    syncedLeftOut: translate.syncedLeftOut,
    applying: translate.applying,
    onApply: translate.onApply,
  }), [
    isOpen, close, candidates, selectedIds, onToggleNote, onToggleAll,
    action, onActionChange, generating, result, error, onGenerate, onAdd,
    arrange.themes, arrange.onArrange, arrange.arranging, arrange.themesLeftOut,
    translate.languageChoice, translate.onLanguageChoiceChange, translate.otherLanguage,
    translate.onOtherLanguageChange, translate.targetLanguage, translate.languageValid,
    translate.translations, translate.failedCount, translate.syncedLeftOut,
    translate.applying, translate.onApply,
  ]);

  return { isOpen, open, close, dialogProps };
}
