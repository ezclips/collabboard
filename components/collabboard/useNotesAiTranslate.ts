'use client';

/**
 * PATCH-355. The "Translate" flow: the language, the preview and the Apply +
 * Undo writes. Split out of `useNotesAi.ts` so no hook file is over the 400-line
 * ceiling.
 *
 * Nothing is written until Apply. Apply rebuilds each note's HTML from its
 * segments (formatting kept), skips notes that changed since Generate, and rolls
 * the whole translation back on any failure -- reporting an incomplete rollback
 * or undo instead of hiding it (P3).
 */

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import type { Padlet } from '@/types/collabboard';
import { notePlainText, stripHtmlToText } from '@/lib/domain/canvas/noteToKanbanCard';
import {
  NOTES_AI_LANGUAGES,
  NOTES_AI_TITLE_MAX,
  isNotesAiLanguage,
  notesAiRef,
  type NotesAiResult,
} from '@/lib/domain/ai/notesAi';
import { readSyncedTwinId } from '@/lib/infra/canvas/syncedNotePairMutation';
import { extractSegments, replaceSegments } from './noteHtmlSegments';
import type { NotesAiFieldUpdate } from './notesAiUpdate';

/** The `<select>` value that reveals the free-text language input. */
export const NOTES_AI_LANGUAGE_OTHER = '__other__';

const NOTES_AI_TRANSLATE_FAILED = "Couldn't translate the notes — nothing was changed.";
const NOTES_AI_TRANSLATE_ROLLBACK_INCOMPLETE =
  "Couldn't translate the notes, and the rollback was incomplete — some notes may need their text restored by hand.";
const NOTES_AI_TRANSLATE_UNDO_INCOMPLETE =
  "Couldn't fully undo the translation — some notes may need their text restored by hand.";

/** A synced note must be saved through the atomic pair RPC, so translate leaves it out. */
export function isSyncedNote(note: Padlet): boolean {
  return readSyncedTwinId(note.metadata) !== null;
}

/**
 * The ONE translate payload builder: the hook's request and the dialog's size
 * check both call it, so what is sent and what is checked cannot disagree. Each
 * note carries its title and its format-preserving segments, in order.
 */
export function buildNotesAiTranslation(
  notes: readonly Padlet[],
): Array<{ ref: string; title: string; segments: string[] }> {
  return notes.map((note, index) => ({
    ref: notesAiRef(index),
    title: (note.title ?? '').trim().slice(0, NOTES_AI_TITLE_MAX),
    segments: extractSegments(note.content ?? '').segments,
  }));
}

/** One note's preview row: its first original line and its first translated line. */
export interface NotesAiTranslationPreview {
  readonly noteId: string;
  readonly ref: string;
  readonly original: string;
  readonly translated: string;
}

export interface UseNotesAiTranslateOptions {
  readonly candidates: readonly Padlet[];
  /** The LIVE board notes; the stale check compares these to the snapshot. */
  readonly liveNotes: readonly Padlet[];
  readonly selectedIds: readonly string[];
  readonly result: NotesAiResult | null;
  readonly refToNoteId: ReadonlyMap<string, string>;
  /** Each sent ref's title/content at Generate time, for the stale check. */
  readonly snapshot: ReadonlyMap<string, { readonly title: string; readonly content: string }>;
  readonly onUpdateNotes: (updates: readonly NotesAiFieldUpdate[]) => Promise<boolean>;
  readonly onClose: () => void;
}

export interface UseNotesAiTranslateResult {
  readonly languageChoice: string;
  readonly onLanguageChoiceChange: (value: string) => void;
  readonly otherLanguage: string;
  readonly onOtherLanguageChange: (value: string) => void;
  readonly targetLanguage: string;
  readonly languageValid: boolean;
  readonly translations: readonly NotesAiTranslationPreview[];
  readonly failedCount: number;
  readonly syncedLeftOut: number;
  readonly applying: boolean;
  readonly onApply: (tickedNoteIds: readonly string[]) => void;
}

const FIRST_LINE_MAX = 80;

function firstLine(text: string): string {
  const line = text.split('\n').map((part) => part.trim()).find((part) => part.length > 0) ?? '';
  return line.length > FIRST_LINE_MAX ? `${line.slice(0, FIRST_LINE_MAX)}…` : line;
}

function staleMessage(count: number): string {
  return `${count} ${count === 1 ? 'note' : 'notes'} changed meanwhile and ${count === 1 ? 'was' : 'were'} skipped.`;
}

function brokenMessage(count: number): string {
  return `${count} ${count === 1 ? 'note' : 'notes'} couldn't be translated and ${count === 1 ? 'was' : 'were'} left as they are.`;
}

/**
 * PATCH-355 Addendum 1. The preview's translated label is the first LINE of the
 * REBUILT note, not its first segment: a note starting
 * `<p><strong>Important:</strong> book the venue…</p>` must read
 * "Wichtig: Buche den Ort", never just "Wichtig:". When the note cannot be
 * rebuilt, the segments are joined instead.
 */
function translatedFirstLine(originalHtml: string, segments: readonly string[]): string {
  try {
    return firstLine(stripHtmlToText(replaceSegments(originalHtml, segments)));
  } catch {
    return firstLine(segments.join(' '));
  }
}

export function useNotesAiTranslate(options: UseNotesAiTranslateOptions): UseNotesAiTranslateResult {
  const { candidates, liveNotes, selectedIds, result, refToNoteId, snapshot, onUpdateNotes, onClose } = options;

  const [languageChoice, setLanguageChoice] = useState<string>(NOTES_AI_LANGUAGES[0]);
  const [otherLanguage, setOtherLanguage] = useState('');
  const [applying, setApplying] = useState(false);

  const targetLanguage = languageChoice === NOTES_AI_LANGUAGE_OTHER ? otherLanguage : languageChoice;
  const languageValid = isNotesAiLanguage(targetLanguage);

  const translations = useMemo<readonly NotesAiTranslationPreview[]>(() => {
    if (!result || !('failedRefs' in result)) return [];
    const byId = new Map(candidates.map((note) => [note.id, note]));
    const previews: NotesAiTranslationPreview[] = [];
    for (const note of result.notes) {
      const noteId = refToNoteId.get(note.ref);
      if (!noteId) continue;
      const source = byId.get(noteId);
      previews.push({
        noteId,
        ref: note.ref,
        original: firstLine(source ? notePlainText(source) : ''),
        // PATCH-355 Addendum 1: the first LINE of the rebuilt note, not segment 1.
        translated: translatedFirstLine(source?.content ?? '', note.segments),
      });
    }
    return previews;
  }, [result, candidates, refToNoteId]);

  const failedCount = result && 'failedRefs' in result ? result.failedRefs.length : 0;

  const syncedLeftOut = useMemo(
    () => candidates.filter((note) => selectedIds.includes(note.id) && isSyncedNote(note)).length,
    [candidates, selectedIds],
  );

  const onApply = useCallback((tickedNoteIds: readonly string[]) => {
    if (!result || !('failedRefs' in result) || applying) return;
    const byId = new Map(liveNotes.map((note) => [note.id, note]));
    const ticked = new Set(tickedNoteIds);

    const updates: NotesAiFieldUpdate[] = [];
    const oldUpdates: NotesAiFieldUpdate[] = [];
    let stale = 0;
    let broken = 0;
    for (const translated of result.notes) {
      const noteId = refToNoteId.get(translated.ref);
      if (!noteId || !ticked.has(noteId)) continue;
      const note = byId.get(noteId);
      const snap = snapshot.get(translated.ref);
      // A note whose title/content changed since Generate is skipped.
      if (!note || !snap || (note.title ?? '') !== snap.title || (note.content ?? '') !== snap.content) {
        stale += 1;
        continue;
      }
      let content: string;
      try {
        content = replaceSegments(note.content ?? '', translated.segments);
      } catch (error) {
        broken += 1;
        console.error('Failed to rebuild a translated note:', error);
        continue;
      }
      const oldTitle = note.title ?? '';
      // The translated title is applied only when the note HAD its own title.
      const newTitle = oldTitle.trim() ? (translated.title.trim() || oldTitle) : oldTitle;
      updates.push({ id: note.id, title: newTitle, content });
      oldUpdates.push({ id: note.id, title: oldTitle, content: note.content ?? '' });
    }

    if (updates.length === 0) {
      if (stale > 0) toast.info(staleMessage(stale));
      else if (broken > 0) toast.error(NOTES_AI_TRANSLATE_FAILED);
      return;
    }

    setApplying(true);
    void (async () => {
      const ok = await onUpdateNotes(updates);
      setApplying(false);
      if (!ok) {
        // Never leave a half translation behind.
        const restored = await onUpdateNotes(oldUpdates);
        if (restored) {
          toast.error(NOTES_AI_TRANSLATE_FAILED);
        } else {
          console.error('Translation rollback was incomplete:', { restored });
          toast.error(NOTES_AI_TRANSLATE_ROLLBACK_INCOMPLETE);
        }
        return;
      }
      onClose();
      if (stale > 0) toast.info(staleMessage(stale));
      // PATCH-355 Addendum 1: a note that could not be rebuilt must not vanish
      // silently just because OTHER notes applied.
      if (broken > 0) toast.info(brokenMessage(broken));
      toast.success(`Translated ${updates.length} ${updates.length === 1 ? 'note' : 'notes'}`, {
        duration: 20_000,
        action: {
          label: 'Undo',
          onClick: () => {
            void (async () => {
              const restored = await onUpdateNotes(oldUpdates);
              if (restored) {
                toast('Translation undone');
              } else {
                console.error('Translation undo was incomplete:', { restored });
                toast.error(NOTES_AI_TRANSLATE_UNDO_INCOMPLETE);
              }
            })();
          },
        },
      });
    })();
  }, [applying, liveNotes, result, refToNoteId, snapshot, onUpdateNotes, onClose]);

  return {
    languageChoice,
    onLanguageChoiceChange: setLanguageChoice,
    otherLanguage,
    onOtherLanguageChange: setOtherLanguage,
    targetLanguage,
    languageValid,
    translations,
    failedCount,
    syncedLeftOut,
    applying,
    onApply,
  };
}
