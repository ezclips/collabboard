"use client";

/**
 * PATCH-340. "Send to Kanban": pick which notes to send, a board and a column.
 * The dialog only chooses; CanvasClient owns the write (send + link + toast).
 *
 * Addendum 1: Freeform has no multi-select gesture, so the choice lives here --
 * the dialog lists the board's unlinked note posts with a checkbox each, and
 * returns exactly the ticked ids.
 */
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Padlet } from '@/types/collabboard';
import { noteToKanbanCard } from '@/lib/domain/canvas/noteToKanbanCard';
import {
  loadBoardColumns,
  listEditableKanbanBoards,
  type EditableKanbanBoard,
  type KanbanBoardColumn,
} from '@/lib/kanban/sendNotesToKanban';

const SEARCH_THRESHOLD = 8;
const NOTE_LABEL_MAX = 60;

export interface SendToKanbanSelection {
  noteIds: string[];
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
  onConfirm: (selection: SendToKanbanSelection) => void | Promise<void>;
}

export function SendToKanbanDialog({
  isOpen,
  onClose,
  notes,
  preselectedIds,
  linkedCount = 0,
  userId,
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

  const noteIds = useMemo(() => notes.map((note) => note.id), [notes]);

  useEffect(() => {
    if (!isOpen) return;
    const allowed = new Set(noteIds);
    setSelectedIds(new Set(preselectedIds.filter((id) => allowed.has(id))));
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
  const tickedCount = selectedIds.size;
  const cardLabel = `${tickedCount} ${tickedCount === 1 ? 'card' : 'cards'}`;
  const allSelected = notes.length > 0 && tickedCount === notes.length;
  const canCreate = !!selectedBoard && !!selectedColumn && tickedCount > 0 && !submitting;

  const toggleNote = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(noteIds));
  };

  const handleCreate = async () => {
    if (!selectedBoard || !selectedColumn || tickedCount === 0) return;
    setSubmitting(true);
    try {
      await onConfirm({
        noteIds: noteIds.filter((id) => selectedIds.has(id)),
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

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent data-send-to-kanban-dialog="true" className="max-w-md">
        <DialogHeader>
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
          <div className="space-y-4">
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
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SendToKanbanDialog;
