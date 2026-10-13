'use client';

/**
 * PATCH-355. The dialog's per-action preview, moved out of `NotesAiDialog.tsx`
 * so the dialog stays under the 400-line ceiling. Presentational only.
 */

import React from 'react';

import type { Padlet } from '@/types/collabboard';
import { noteToKanbanCard } from '@/lib/domain/canvas/noteToKanbanCard';
import {
  NOTES_AI_THEME_TITLE_MAX,
  type NotesAiActionPlan,
  type NotesAiResult,
  type NotesAiSummary,
  type NotesAiThemes,
  type NotesAiTranslation,
} from '@/lib/domain/ai/notesAi';
import type { NotesAiThemePreview } from './useNotesAi';
import type { NotesAiTranslationPreview } from './useNotesAiTranslate';

const NOTE_LABEL_MAX = 60;
const THEME_NOTES_SHOWN = 5;

function isTranslation(result: NotesAiResult): result is NotesAiTranslation {
  return 'failedRefs' in result;
}
function isPlan(result: NotesAiResult): result is NotesAiActionPlan {
  return 'tasks' in result;
}
function isThemes(result: NotesAiResult): result is NotesAiThemes {
  return 'themes' in result;
}
function isSummary(result: NotesAiResult): result is NotesAiSummary {
  return !('tasks' in result) && !('themes' in result) && !('failedRefs' in result);
}

export interface NotesAiPreviewProps {
  readonly result: NotesAiResult;
  readonly notes: readonly Padlet[];
  readonly themes: readonly NotesAiThemePreview[];
  readonly themeTitles: readonly string[];
  readonly onThemeTitleChange: (index: number, value: string) => void;
  readonly unticked: ReadonlySet<number>;
  readonly onToggleTask: (index: number) => void;
  readonly translations: readonly NotesAiTranslationPreview[];
  readonly untickedTranslations: ReadonlySet<string>;
  readonly onToggleTranslation: (noteId: string) => void;
  readonly failedCount: number;
}

export function NotesAiPreview({
  result,
  notes,
  themes,
  themeTitles,
  onThemeTitleChange,
  unticked,
  onToggleTask,
  translations,
  untickedTranslations,
  onToggleTranslation,
  failedCount,
}: NotesAiPreviewProps) {
  return (
    <div data-notes-ai-preview="true" className="space-y-2 rounded-md border border-slate-200 p-3">
      {isTranslation(result) ? (
        <>
          {failedCount > 0 ? (
            <p data-notes-ai-failed="true" className="text-xs text-amber-600">
              {failedCount} {failedCount === 1 ? 'note' : 'notes'} couldn&apos;t be translated and are left as they are.
            </p>
          ) : null}
          <ul className="space-y-1">
            {translations.map((entry) => (
              <li key={entry.noteId} data-notes-ai-translation="true" className="flex items-start gap-2">
                <input
                  type="checkbox"
                  data-notes-ai-translation-checkbox="true"
                  checked={!untickedTranslations.has(entry.noteId)}
                  onChange={() => onToggleTranslation(entry.noteId)}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] text-slate-400">{entry.original || '—'}</span>
                  <span data-notes-ai-translation-text="true" className="block truncate text-sm text-slate-700">
                    {entry.translated || '—'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : isPlan(result) ? (
        <>
          <p className="text-sm font-semibold text-slate-800">{result.title || 'Action plan'}</p>
          <ul className="space-y-1">
            {result.tasks.map((task, index) => (
              <li key={index} data-notes-ai-task="true" className="flex items-start gap-2">
                <input
                  type="checkbox"
                  data-notes-ai-task-checkbox="true"
                  checked={!unticked.has(index)}
                  onChange={() => onToggleTask(index)}
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
        </>
      ) : isThemes(result) ? (
        <ul className="space-y-2">
          {themes.map((theme, index) => (
            <li key={index} data-notes-ai-theme="true" className="space-y-1 rounded-md border border-slate-200 p-2">
              <input
                type="text"
                data-notes-ai-theme-title="true"
                value={themeTitles[index] ?? theme.title}
                maxLength={NOTES_AI_THEME_TITLE_MAX}
                onChange={(event) => onThemeTitleChange(index, event.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1 text-sm outline-none focus:border-blue-500"
              />
              <ul className="space-y-0.5">
                {theme.noteIds.slice(0, THEME_NOTES_SHOWN).map((id) => {
                  const note = notes.find((candidate) => candidate.id === id);
                  return (
                    <li key={id} className="truncate text-[11px] text-slate-400">
                      {note ? noteToKanbanCard(note).title.slice(0, NOTE_LABEL_MAX) : id}
                    </li>
                  );
                })}
                {theme.noteIds.length > THEME_NOTES_SHOWN ? (
                  <li className="text-[11px] text-slate-400">
                    +{theme.noteIds.length - THEME_NOTES_SHOWN} more
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      ) : isSummary(result) ? (
        <>
          <p className="text-sm font-semibold text-slate-800">{result.title || 'Summary'}</p>
          <p className="text-sm text-slate-700">{result.summary}</p>
          {result.points.length > 0 ? (
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700">
              {result.points.map((point, index) => <li key={index}>{point}</li>)}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default NotesAiPreview;
