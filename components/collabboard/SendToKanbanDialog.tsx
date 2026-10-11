"use client";

/**
 * PATCH-340. "Send to Kanban": pick which notes to send, a board and a column.
 * The dialog only chooses; CanvasClient owns the write (send + link + toast).
 *
 * Addendum 1: Freeform has no multi-select gesture, so the choice lives here --
 * the dialog lists the board's unlinked note posts with a checkbox each.
 *
 * PATCH-342. A two-way mode: "One card per note" (unchanged) or "Suggest cards
 * with AI". In AI mode the ticked notes are the model's input; the suggestions
 * are ticked, editable and previewed, and only ticked ones are created. ONLY
 * note text and opaque refs leave the browser.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Padlet } from '@/types/collabboard';
import { notePlainText, noteToKanbanCard } from '@/lib/domain/canvas/noteToKanbanCard';
import { notesToCardsRef } from '@/lib/domain/ai/notesToCards';
import {
  loadBoardColumns,
  listEditableKanbanBoards,
  type EditableKanbanBoard,
  type KanbanBoardColumn,
} from '@/lib/kanban/sendNotesToKanban';

const SEARCH_THRESHOLD = 8;
const NOTE_LABEL_MAX = 60;
const AI_NETWORK_ERROR = 'The AI is not available right now. Try again in a moment.';
const AI_EMPTY_ERROR = "The AI could not suggest cards from these notes. Try 'One card per note'.";

export interface SuggestedCard {
  title: string;
  description: string;
  sourceNoteIds: string[];
}

export interface SendToKanbanSelection {
  mode: 'notes' | 'ai';
  noteIds: string[];
  /** AI mode only: the ticked suggestions, with edited titles/descriptions. */
  cards?: SuggestedCard[];
  boardId: string;
  boardTitle: string;
  columnId: string;
  columnTitle: string;
  swimlaneId: string | null;
}

interface SendToKanbanDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The unlinked note posts that may be sent (already in reading order). */
  notes: Padlet[];
  /** Pre-ticked ids: the right-clicked note, or the whole selection. */
  preselectedIds: string[];
  /** How many of the candidate notes are already linked (shown as a line). */
  linkedCount?: number;
  userId: string | null;
  /** The source (Freeform) board the notes live on -- the AI route's board. */
  sourceBoardId: string;
  onConfirm: (selection: SendToKanbanSelection) => void | Promise<void>;
}

interface Suggestion {
  title: string;
  description: string;
  sourceNoteIds: string[];
  ticked: boolean;
}

export function SendToKanbanDialog({
  isOpen,
  onClose,
  notes,
  preselectedIds,
  linkedCount = 0,
  userId,
  sourceBoardId,
  onConfirm,
}: SendToKanbanDialogProps) {
  const [boards, setBoards] = useState<EditableKanbanBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [boardId, setBoardId] = useState<string>('');
  const [columns, setColumns] = useState<KanbanBoardColumn[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [columnId, setColumnId] = useState<string>('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const [mode, setMode] = useState<'notes' | 'ai'>('notes');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [notesChangedSinceSuggestion, setNotesChangedSinceSuggestion] = useState(false);
  const [editingDescription, setEditingDescription] = useState<number | null>(null);

  const noteIds = useMemo(() => notes.map((note) => note.id), [notes]);
  const notesById = useMemo(() => new Map(notes.map((note) => [note.id, note])), [notes]);

  useEffect(() => {
    if (!isOpen) return;
    const allowed = new Set(noteIds);
    setSelectedIds(new Set(preselectedIds.filter((id) => allowed.has(id))));
    setMode('notes');
    setSuggestions(null);
    setAiError(null);
    setNotesChangedSinceSuggestion(false);
    setEditingDescription(null);
  }, [isOpen, noteIds, preselectedIds]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingBoards(true);
    setQuery('');
    setColumns([]);
    setColumnId('');
    listEditableKanbanBoards(userId ?? '')
      .then((list) => {
        if (cancelled) return;
        setBoards(list);
        setBoardId(list[0]?.id ?? '');
      })
      .finally(() => {
        if (!cancelled) setLoadingBoards(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, userId]);

  useEffect(() => {
    if (!isOpen || !boardId) {
      setColumns([]);
      setColumnId('');
      return;
    }
    let cancelled = false;
    setLoadingColumns(true);
    loadBoardColumns(boardId)
      .then((list) => {
        if (cancelled) return;
        setColumns(list);
        setColumnId(list[0]?.id ?? '');
      })
      .finally(() => {
        if (!cancelled) setLoadingColumns(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, boardId]);

  const visibleBoards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return boards;
    return boards.filter((board) => board.title.toLowerCase().includes(needle));
  }, [boards, query]);

  const selectedBoard = boards.find((board) => board.id === boardId) ?? null;
  const selectedColumn = columns.find((column) => column.id === columnId) ?? null;
  const tickedNoteIds = noteIds.filter((id) => selectedIds.has(id));
  const tickedCount = tickedNoteIds.length;
  const allSelected = notes.length > 0 && tickedCount === notes.length;

  const tickedSuggestions = (suggestions ?? []).filter((s) => s.ticked);
  const suggestionCount = tickedSuggestions.length;
  const createCount = mode === 'ai' ? suggestionCount : tickedCount;
  const cardLabel = `${createCount} ${createCount === 1 ? 'card' : 'cards'}`;
  const canCreate = !!selectedBoard && !!selectedColumn && createCount > 0 && !submitting && !suggesting;

  const noteLabel = (noteId: string): string => {
    const note = notesById.get(noteId);
    if (!note) return noteId;
    return noteToKanbanCard(note).title.slice(0, NOTE_LABEL_MAX);
  };

  const toggleNote = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (suggestions) setNotesChangedSinceSuggestion(true);
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(noteIds));
    if (suggestions) setNotesChangedSinceSuggestion(true);
  };

  const toggleSuggestion = (index: number) => {
    setSuggestions((prev) => prev ? prev.map((s, i) => (i === index ? { ...s, ticked: !s.ticked } : s)) : prev);
  };

  const updateSuggestionTitle = (index: number, title: string) => {
    setSuggestions((prev) => prev ? prev.map((s, i) => (i === index ? { ...s, title } : s)) : prev);
  };

  const updateSuggestionDescription = (index: number, description: string) => {
    setSuggestions((prev) => prev ? prev.map((s, i) => (i === index ? { ...s, description } : s)) : prev);
  };

  const suggestCards = async () => {
    if (tickedCount === 0 || suggesting) return;
    setSuggesting(true);
    setAiError(null);
    // The ticked notes are the AI input. Refs are opaque (N1..) and the ref ->
    // note map stays here; only titles + text leave the browser.
    const payload = tickedNoteIds.map((id, index) => {
      const note = notesById.get(id)!;
      return {
        ref: notesToCardsRef(index),
        title: noteToKanbanCard(note).title.slice(0, 200),
        text: notePlainText(note).slice(0, 2_000),
      };
    });
    const refToNoteId = new Map(payload.map((entry, index) => [entry.ref, tickedNoteIds[index]]));
    try {
      const response = await fetch(`/api/boards/${encodeURIComponent(sourceBoardId)}/ai/notes-to-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: payload }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        setAiError(body?.error ?? AI_NETWORK_ERROR);
        setSuggestions(null);
        return;
      }
      const body = await response.json().catch(() => null) as { cards?: Array<{ title: string; description: string; sourceRefs: string[] }> | null } | null;
      if (!body || !body.cards || body.cards.length === 0) {
        setAiError(AI_EMPTY_ERROR);
        setSuggestions(null);
        return;
      }
      setSuggestions(
        body.cards.map((card) => ({
          title: card.title,
          description: card.description,
          sourceNoteIds: card.sourceRefs.map((ref) => refToNoteId.get(ref)).filter((id): id is string => !!id),
          ticked: true,
        })),
      );
      setNotesChangedSinceSuggestion(false);
    } catch {
      setAiError(AI_NETWORK_ERROR);
      setSuggestions(null);
    } finally {
      setSuggesting(false);
    }
  };

  const handleCreate = async () => {
    if (!selectedBoard || !selectedColumn || createCount === 0) return;
    setSubmitting(true);
    try {
      await onConfirm({
        mode,
        noteIds: tickedNoteIds,
        cards: mode === 'ai'
          ? tickedSuggestions.map((s) => ({
              title: s.title.trim(),
              description: s.description,
              sourceNoteIds: s.sourceNoteIds,
            }))
          : undefined,
        boardId: selectedBoard.id,
        boardTitle: selectedBoard.title,
        columnId: selectedColumn.id,
        columnTitle: selectedColumn.name,
        swimlaneId: null,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const modeButtonClass = (value: 'notes' | 'ai') =>
    `flex-1 rounded-md border px-3 py-2 text-sm font-medium ${
      mode === value ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'
    }`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-send-to-kanban-dialog="true"
        // PATCH-342 Addendum 2. Fixed header/footer, scrolling middle, so the
        // dialog never grows past the screen. The inline dvh wins where it is
        // supported; the vh class is the fallback.
        className="max-w-md max-h-[calc(100vh-48px)]"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 48px)' }}
      >
        <DialogHeader className="flex-none">
          <DialogTitle>Send to Kanban</DialogTitle>
          <DialogDescription>
            Choose which notes to turn into cards on a Kanban board you can edit.
          </DialogDescription>
        </DialogHeader>

        {loadingBoards ? (
          <p className="text-sm text-slate-500">Loading boards…</p>
        ) : boards.length === 0 ? (
          <div data-send-kanban-empty="true" className="space-y-3 text-sm text-slate-600">
            <p>You have no Kanban board you can edit yet.</p>
            <Link
              href="/dashboard/create-canvas"
              className="inline-block rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
            >
              Create a Kanban board
            </Link>
          </div>
        ) : (
          <>
          <div data-send-kanban-body="true" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
            <div className="flex gap-2" data-send-kanban-mode={mode}>
              <button type="button" className={modeButtonClass('notes')} onClick={() => setMode('notes')}>
                One card per note
              </button>
              <button type="button" className={modeButtonClass('ai')} onClick={() => setMode('ai')}>
                Suggest cards with AI
              </button>
            </div>

            {boards.length > SEARCH_THRESHOLD && (
              <input
                type="text"
                data-send-kanban-search="true"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search boards"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Notes</span>
                <button
                  type="button"
                  data-send-kanban-select-all="true"
                  onClick={toggleAll}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  {allSelected ? 'Select none' : 'Select all'}
                </button>
              </div>
              <div className="max-h-[240px] overflow-y-auto rounded-md border border-slate-200">
                {notes.map((note) => {
                  const title = noteToKanbanCard(note).title.slice(0, NOTE_LABEL_MAX);
                  return (
                    <label
                      key={note.id}
                      className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-sm last:border-b-0 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        data-send-kanban-note={note.id}
                        checked={selectedIds.has(note.id)}
                        onChange={() => toggleNote(note.id)}
                      />
                      <span className="truncate text-slate-700">{title}</span>
                    </label>
                  );
                })}
              </div>
              {linkedCount > 0 && (
                <p data-send-kanban-linked-count="true" className="text-xs text-slate-500">
                  {linkedCount} {linkedCount === 1 ? 'note' : 'notes'} already on a board
                </p>
              )}
            </div>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Board</span>
              <select
                data-send-kanban-board="true"
                value={boardId}
                onChange={(event) => setBoardId(event.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                {visibleBoards.map((board) => (
                  <option key={board.id} value={board.id}>{board.title}</option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Column</span>
              <select
                data-send-kanban-column="true"
                value={columnId}
                onChange={(event) => setColumnId(event.target.value)}
                disabled={loadingColumns || columns.length === 0}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:bg-slate-50"
              >
                {columns.map((column) => (
                  <option key={column.id} value={column.id}>{column.name}</option>
                ))}
              </select>
            </label>

            {mode === 'ai' && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    data-send-kanban-suggest="true"
                    onClick={suggestCards}
                    disabled={tickedCount === 0 || suggesting}
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {suggesting ? 'Reading your notes…' : suggestions ? 'Suggest again' : 'Suggest cards'}
                  </button>
                  <span className="text-xs text-slate-500">Uses 1 AI credit</span>
                </div>

                {aiError && (
                  <p data-send-kanban-ai-error="true" className="text-sm text-red-600">{aiError}</p>
                )}

                {suggestions && notesChangedSinceSuggestion && (
                  <p data-send-kanban-notes-changed="true" className="text-xs text-amber-600">
                    Notes changed — suggest again
                  </p>
                )}

                {suggestions?.map((suggestion, index) => (
                  <div
                    key={index}
                    data-send-kanban-suggestion="true"
                    className="space-y-1 rounded-md border border-slate-200 p-2"
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        data-send-kanban-suggestion-checkbox="true"
                        checked={suggestion.ticked}
                        onChange={() => toggleSuggestion(index)}
                      />
                      <input
                        type="text"
                        data-send-kanban-suggestion-title="true"
                        value={suggestion.title}
                        onChange={(event) => updateSuggestionTitle(index, event.target.value)}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-500"
                      />
                    </label>
                    {editingDescription === index ? (
                      <textarea
                        data-send-kanban-suggestion-description="true"
                        value={suggestion.description}
                        onChange={(event) => updateSuggestionDescription(index, event.target.value)}
                        onBlur={() => setEditingDescription(null)}
                        rows={3}
                        className="w-full rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-blue-500"
                      />
                    ) : (
                      <p
                        data-send-kanban-suggestion-preview="true"
                        onClick={() => setEditingDescription(index)}
                        className="cursor-text overflow-hidden text-xs text-slate-600"
                        style={{ display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: 2 }}
                      >
                        {suggestion.description || 'Add a description'}
                      </p>
                    )}
                    <p data-send-kanban-suggestion-sources="true" className="text-[11px] text-slate-500">
                      From: {suggestion.sourceNoteIds.map(noteLabel).join(', ')}
                    </p>
                  </div>
                ))}
              </div>
            )}

          </div>

          <div data-send-kanban-footer="true" className="flex-none space-y-2 pt-2">
            <p data-send-kanban-count="true" className="text-sm text-slate-600">
              {cardLabel} will be created
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                data-send-kanban-confirm="true"
                onClick={handleCreate}
                disabled={!canCreate}
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Creating…' : `Create ${cardLabel}`}
              </button>
            </div>
          </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SendToKanbanDialog;
