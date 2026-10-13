'use client';

/**
 * PATCH-353. "AI on notes": pick notes, choose Summary or Action plan, generate,
 * review, and Add to board. The dialog only shows and chooses; the hook owns the
 * state and the one write.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KNOWLEDGE_TEXT_BUTTON_CLASS } from '@/components/collabboard/knowledgeReaderControls';
import { noteToKanbanCard } from '@/lib/domain/canvas/noteToKanbanCard';
import {
  NOTES_AI_MAX_NOTES,
  NOTES_AI_TOTAL_TEXT_MAX,
  type NotesAiAction,
  type NotesAiActionPlan,
  type NotesAiResult,
} from '@/lib/domain/ai/notesAi';
import { buildNotesAiNotes, type NotesAiDialogProps } from './useNotesAi';

const NOTE_LABEL_MAX = 60;

function isPlan(result: NotesAiResult): result is NotesAiActionPlan {
  return 'tasks' in result;
}

export function NotesAiDialog({
  isOpen,
  onClose,
  notes,
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
}: NotesAiDialogProps) {
  // Unticked tasks are left out; a fresh answer ticks everything again.
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => { setUnticked(new Set()); }, [result]);

  const selectedCount = selectedIds.length;
  const allSelected = notes.length > 0 && selectedCount === notes.length;
  const plan = result && isPlan(result) ? result : null;
  const summary = result && !isPlan(result) ? result : null;
  const tickedTasks = plan ? plan.tasks.filter((_, index) => !unticked.has(index)) : [];
  const canAdd = summary !== null || tickedTasks.length > 0;

  // PATCH-353 Addendum 1. The same payload builder the request uses, so the
  // size check and the request can never disagree. "Select all" on a big board
  // still ticks every note -- this only says why Generate is off.
  const payload = buildNotesAiNotes(notes.filter((note) => selectedIds.includes(note.id)));
  const totalChars = payload.reduce((sum, entry) => sum + entry.title.length + entry.text.length, 0);
  const limitMessage = payload.length > NOTES_AI_MAX_NOTES
    ? `Pick at most ${NOTES_AI_MAX_NOTES} notes (${payload.length} ticked).`
    : totalChars > NOTES_AI_TOTAL_TEXT_MAX
      ? 'These notes are too long together — untick a few.'
      : null;

  const toggleTask = (index: number) => {
    setUnticked((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleAdd = () => {
    if (!result) return;
    if (plan) {
      onAdd({ ...plan, tasks: tickedTasks });
      return;
    }
    onAdd(result);
  };

  const tabClass = (value: NotesAiAction) => (
    action === value
      ? `${KNOWLEDGE_TEXT_BUTTON_CLASS} border-blue-300 bg-blue-50 text-blue-700`
      : KNOWLEDGE_TEXT_BUTTON_CLASS
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent
        data-notes-ai-dialog="true"
        // Fixed header/footer, scrolling middle, so the dialog never grows past
        // the screen (the PATCH-342 Addendum 2 shape).
        className="max-w-md max-h-[calc(100vh-48px)]"
        style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100dvh - 48px)' }}
      >
        <DialogHeader className="flex-none">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            AI on notes
          </DialogTitle>
          <DialogDescription>
            Summarise or plan the notes you select. Nothing is added until you press Add to board.
          </DialogDescription>
        </DialogHeader>

        <div data-notes-ai-body="true" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="flex gap-1" role="tablist">
            {(['summary', 'action_plan'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={action === value}
                data-notes-ai-tab={value}
                className={tabClass(value)}
                onClick={() => onActionChange(value)}
              >
                {value === 'summary' ? 'Summary' : 'Action plan'}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span data-notes-ai-count="true" className="text-sm font-medium text-slate-700">
                {selectedCount} of {notes.length} notes
              </span>
              <button
                type="button"
                data-notes-ai-select-all="true"
                onClick={onToggleAll}
                className="text-xs font-medium text-blue-600 hover:underline"
              >
                {allSelected ? 'Select none' : 'Select all'}
              </button>
            </div>
            <div className="max-h-[200px] overflow-y-auto rounded-md border border-slate-200">
              {notes.map((note) => (
                <label
                  key={note.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-2 py-1.5 text-sm last:border-b-0 hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    data-notes-ai-note={note.id}
                    checked={selectedIds.includes(note.id)}
                    onChange={() => onToggleNote(note.id)}
                  />
                  <span className="truncate text-slate-700">
                    {noteToKanbanCard(note).title.slice(0, NOTE_LABEL_MAX)}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-slate-500">Uses 1 AI credit</p>
          </div>

          {limitMessage ? (
            <p data-notes-ai-limit="true" className="text-sm text-amber-600">{limitMessage}</p>
          ) : null}

          {error ? (
            <p data-notes-ai-error="true" className="text-sm text-red-600">{error}</p>
          ) : null}

          {result ? (
            <div data-notes-ai-preview="true" className="space-y-2 rounded-md border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-800">
                {result.title || (plan ? 'Action plan' : 'Summary')}
              </p>
              {summary ? (
                <>
                  <p className="text-sm text-slate-700">{summary.summary}</p>
                  {summary.points.length > 0 ? (
                    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
                      {summary.points.map((point, index) => <li key={index}>{point}</li>)}
                    </ul>
                  ) : null}
                </>
              ) : plan ? (
                <ul className="space-y-1">
                  {plan.tasks.map((task, index) => (
                    <li key={index} data-notes-ai-task="true" className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        data-notes-ai-task-checkbox="true"
                        checked={!unticked.has(index)}
                        onChange={() => toggleTask(index)}
                        className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-slate-700">{task.text}</span>
                        {task.sourceRefs.length > 0 ? (
                          <span className="block text-[11px] text-slate-400">
                            from {task.sourceRefs.length} {task.sourceRefs.length === 1 ? 'note' : 'notes'}
                          </span>
                        ) : null}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-none items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            data-notes-ai-generate="true"
            onClick={onGenerate}
            disabled={selectedCount === 0 || generating || limitMessage !== null}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Thinking…
              </>
            ) : (result ? 'Regenerate' : 'Generate')}
          </button>
          <button
            type="button"
            data-notes-ai-add="true"
            onClick={handleAdd}
            disabled={!canAdd || generating}
            className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add to board
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NotesAiDialog;
