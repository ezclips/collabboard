'use client';

/**
 * PATCH-353. "AI on notes": pick notes, choose Summary, Action plan, Group by
 * theme or Translate, generate, review, and act. The dialog only shows and
 * chooses; the hook owns the state and the writes.
 *
 * PATCH-355: the per-action preview moved to `NotesAiPreview.tsx` so this file
 * stays under the 400-line ceiling.
 */

import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { KNOWLEDGE_TEXT_BUTTON_CLASS } from '@/components/collabboard/knowledgeReaderControls';
import { noteToKanbanCard } from '@/lib/domain/canvas/noteToKanbanCard';
import {
  NOTES_AI_LANGUAGES,
  NOTES_AI_MAX_NOTES,
  NOTES_AI_THEME_TITLE_MAX,
  NOTES_AI_TOTAL_TEXT_MAX,
  NOTES_AI_TRANSLATE_TOTAL_MAX,
  type NotesAiAction,
  type NotesAiActionPlan,
  type NotesAiSummary,
} from '@/lib/domain/ai/notesAi';
import { buildNotesAiNotes, type NotesAiDialogProps } from './useNotesAi';
import { NOTES_AI_LANGUAGE_OTHER, buildNotesAiTranslation, isSyncedNote } from './useNotesAiTranslate';
import { NotesAiPreview } from './NotesAiPreview';

const NOTE_LABEL_MAX = 60;

const TAB_LABELS: Record<NotesAiAction, string> = {
  summary: 'Summary',
  action_plan: 'Action plan',
  themes: 'Group by theme',
  translate: 'Translate',
};

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
  themes,
  onArrange,
  arranging,
  themesLeftOut,
  languageChoice,
  onLanguageChoiceChange,
  otherLanguage,
  onOtherLanguageChange,
  targetLanguage,
  languageValid,
  translations,
  failedCount,
  syncedLeftOut,
  applying,
  onApply,
}: NotesAiDialogProps) {
  const isTranslate = action === 'translate';
  // Unticked tasks are left out; a fresh answer ticks everything again.
  const [unticked, setUnticked] = useState<ReadonlySet<number>>(new Set());
  useEffect(() => { setUnticked(new Set()); }, [result]);
  // PATCH-355. Unticked translations are left out; reset with each answer.
  const [untickedTranslations, setUntickedTranslations] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => { setUntickedTranslations(new Set()); }, [result]);
  // PATCH-354. Editable theme titles, reset with each answer.
  const [themeTitles, setThemeTitles] = useState<readonly string[]>([]);
  useEffect(() => { setThemeTitles(themes.map((theme) => theme.title)); }, [themes]);

  // Translate leaves synced notes out entirely, so they are not listed there.
  const selectableNotes = isTranslate ? notes.filter((note) => !isSyncedNote(note)) : notes;
  const selectedCount = selectableNotes.filter((note) => selectedIds.includes(note.id)).length;
  const allSelected = selectableNotes.length > 0 && selectedCount === selectableNotes.length;
  const plan = result && 'tasks' in result ? (result as NotesAiActionPlan) : null;
  const summary = result && 'summary' in result ? (result as NotesAiSummary) : null;
  const tickedTasks = plan ? plan.tasks.filter((_, index) => !unticked.has(index)) : [];
  const canAdd = summary !== null || tickedTasks.length > 0;

  // PATCH-353 Addendum 1. The same payload builder the request uses, so the
  // size check and the request can never disagree.
  const payload = buildNotesAiNotes(notes.filter((note) => selectedIds.includes(note.id)));
  const totalChars = payload.reduce((sum, entry) => sum + entry.title.length + entry.text.length, 0);
  const translationPayload = isTranslate
    ? buildNotesAiTranslation(notes.filter((note) => selectedIds.includes(note.id) && !isSyncedNote(note)))
    : [];
  const translationChars = translationPayload.reduce(
    (sum, entry) => sum + entry.title.length + entry.segments.reduce((chars, segment) => chars + segment.length, 0),
    0,
  );
  const limitMessage = isTranslate
    ? translationPayload.length > NOTES_AI_MAX_NOTES
      ? `Pick at most ${NOTES_AI_MAX_NOTES} notes (${translationPayload.length} ticked).`
      : translationChars > NOTES_AI_TRANSLATE_TOTAL_MAX
        ? 'These notes are too long to translate together — untick a few.'
        : null
    : payload.length > NOTES_AI_MAX_NOTES
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

  const toggleTranslation = (noteId: string) => {
    setUntickedTranslations((current) => {
      const next = new Set(current);
      if (next.has(noteId)) next.delete(noteId);
      else next.add(noteId);
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

  const handleArrange = () => {
    onArrange(themes.map((theme, index) => ({
      title: (themeTitles[index] ?? theme.title).slice(0, NOTES_AI_THEME_TITLE_MAX),
      noteIds: theme.noteIds,
    })));
  };

  const handleApply = () => {
    onApply(translations.filter((entry) => !untickedTranslations.has(entry.noteId)).map((entry) => entry.noteId));
  };

  const tabClass = (value: NotesAiAction) => (
    action === value
      ? `${KNOWLEDGE_TEXT_BUTTON_CLASS} border-blue-300 bg-blue-50 text-blue-700`
      : KNOWLEDGE_TEXT_BUTTON_CLASS
  );

  const generateDisabled = selectedCount === 0 || generating || limitMessage !== null
    || (isTranslate && !languageValid);

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
            Summarise, plan, group or translate the notes you select. Nothing is written until you press a button.
          </DialogDescription>
        </DialogHeader>

        <div data-notes-ai-body="true" className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="flex gap-1" role="tablist">
            {(['summary', 'action_plan', 'themes', 'translate'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={action === value}
                data-notes-ai-tab={value}
                className={tabClass(value)}
                onClick={() => onActionChange(value)}
              >
                {TAB_LABELS[value]}
              </button>
            ))}
          </div>

          {isTranslate ? (
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-600" htmlFor="notes-ai-language">
                Translate into
              </label>
              <select
                id="notes-ai-language"
                data-notes-ai-language="true"
                value={languageChoice}
                onChange={(event) => onLanguageChoiceChange(event.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm"
              >
                {NOTES_AI_LANGUAGES.map((language) => (
                  <option key={language} value={language}>{language}</option>
                ))}
                <option value={NOTES_AI_LANGUAGE_OTHER}>Other…</option>
              </select>
              {languageChoice === NOTES_AI_LANGUAGE_OTHER ? (
                <>
                  <input
                    type="text"
                    data-notes-ai-language-other="true"
                    value={otherLanguage}
                    placeholder="Language name"
                    onChange={(event) => onOtherLanguageChange(event.target.value)}
                    className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-500"
                  />
                  {otherLanguage.trim().length > 0 && !languageValid ? (
                    <p data-notes-ai-language-invalid="true" className="text-xs text-amber-600">
                      Enter a language name (letters only).
                    </p>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span data-notes-ai-count="true" className="text-sm font-medium text-slate-700">
                {selectedCount} of {selectableNotes.length} notes
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
              {selectableNotes.map((note) => (
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

          {action === 'themes' && themesLeftOut > 0 ? (
            <p data-notes-ai-left-out="true" className="text-xs text-slate-500">
              {themesLeftOut} {themesLeftOut === 1 ? 'note' : 'notes'} inside columns are left out.
            </p>
          ) : null}

          {isTranslate && syncedLeftOut > 0 ? (
            <p data-notes-ai-left-out="true" className="text-xs text-slate-500">
              {syncedLeftOut} synced {syncedLeftOut === 1 ? 'note is' : 'notes are'} left out.
            </p>
          ) : null}

          {error ? (
            <p data-notes-ai-error="true" className="text-sm text-red-600">{error}</p>
          ) : null}

          {result ? (
            <NotesAiPreview
              result={result}
              notes={notes}
              themes={themes}
              themeTitles={themeTitles}
              onThemeTitleChange={(index, value) => setThemeTitles((current) => themes.map((entry, i) => (
                i === index ? value : current[i] ?? entry.title
              )))}
              unticked={unticked}
              onToggleTask={toggleTask}
              translations={translations}
              untickedTranslations={untickedTranslations}
              onToggleTranslation={toggleTranslation}
              failedCount={failedCount}
            />
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
            disabled={generateDisabled}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                Thinking…
              </>
            ) : (result ? 'Regenerate' : 'Generate')}
          </button>
          {isTranslate ? (
            <button
              type="button"
              data-notes-ai-apply="true"
              onClick={handleApply}
              disabled={applying || translations.length === 0}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {applying ? 'Translating…' : 'Apply translation'}
            </button>
          ) : action === 'themes' ? (
            <button
              type="button"
              data-notes-ai-arrange="true"
              onClick={handleArrange}
              disabled={arranging || themes.length === 0}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {arranging ? 'Arranging…' : 'Arrange on board'}
            </button>
          ) : (
            <button
              type="button"
              data-notes-ai-add="true"
              onClick={handleAdd}
              disabled={!canAdd || generating}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Add to board
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default NotesAiDialog;
