/**
 * SRT and WebVTT cues, parsed into one shape.
 *
 * A cue is a span of time and the words said in it. Everything this unit
 * promises about timestamps rests on these two numbers being exactly what the
 * file said, so the rules here are conservative on purpose.
 *
 * TIMES ARE INTEGER MILLISECONDS, AND THAT IS LOSSLESS. SRT writes
 * `HH:MM:SS,mmm` and WebVTT `HH:MM:SS.mmm`; both are millisecond-precision, so
 * parsing to an integer discards nothing either format can express. A format
 * that later carries finer precision needs a NEW representation version --
 * never silent rounding, because a rounded timestamp is a citation that lands
 * somewhere the source did not say.
 *
 * WHAT NORMALISATION MEANS HERE: units and spelling only. Equivalent spellings
 * of the same instant parse to the same integer, so a file rewritten from SRT
 * punctuation to WebVTT punctuation, or saved with CRLF, is the same version.
 * It NEVER shifts a timestamp, merges or removes an overlap, or reorders cues.
 *
 * ORDER IS FILE ORDER, NOT TIME ORDER. Cues are kept exactly as written.
 * Sorting by start time would silently rewrite a file whose cues overlap, and
 * overlap is normal -- auto-generated tracks overlap on virtually every cue
 * (measured at 99.9% on one specimen; see `.agent/youtube-caption-paths.md`).
 *
 * REPEATED TEXT IS KEPT VERBATIM. Rolling captions repeat lines, and so do
 * people. De-duplicating would change meaning, and a cue contributing no text
 * has no character range for a citation to key on.
 */
import { domainError, type DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';
import { parseYouTubeTranscriptPanel } from './knowledgeTranscriptPanelPaste';

export type KnowledgeTranscriptFormat = 'srt' | 'vtt' | 'plain' | 'youtube-panel';

export interface KnowledgeTranscriptCue {
  /** Position in the file, from 0. Not the cue's own numbering, which may lie. */
  readonly index: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly text: string;
}

/**
 * `HH:MM:SS,mmm`, `HH:MM:SS.mmm`, `MM:SS.mmm`, and the same with fewer digits.
 *
 * Hours are optional because WebVTT makes them optional. Fractional digits are
 * captured as written and scaled, so `.5` is 500 ms rather than 5 ms -- the
 * mistake that would put every citation half a second early.
 */
const TIMESTAMP = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/;

const CUE_SEPARATOR = /-->/;

export function parseKnowledgeTranscriptTimestamp(raw: string): number | null {
  const match = TIMESTAMP.exec(raw.trim());
  if (!match) return null;
  const [, hours, minutes, seconds, fraction] = match;
  const minutesValue = Number(minutes);
  const secondsValue = Number(seconds);
  // 90 seconds is not a legal way to write a minute and a half.
  if (minutesValue > 59 || secondsValue > 59) return null;
  // `.5` means five hundred milliseconds, not five.
  const millis = fraction ? Number(fraction.padEnd(3, '0')) : 0;
  return ((Number(hours ?? 0) * 60 + minutesValue) * 60 + secondsValue) * 1000 + millis;
}

export interface KnowledgeTranscriptParse {
  readonly format: KnowledgeTranscriptFormat;
  readonly cues: readonly KnowledgeTranscriptCue[];
  /** Declared by the file, when the format carries it. Never guessed from the text. */
  readonly declaredLanguage: string | null;
  /**
   * True when cue END times were DERIVED rather than declared by the source.
   *
   * OPTIONAL and `true`-only: absent already means "the source declared them",
   * and a second way to say it is a second thing to keep in step. SRT and VTT
   * declare both times; YouTube's panel declares only starts, and a citation's
   * range must not claim a precision the source never gave it.
   */
  readonly endsAreDerived?: true;
}

/**
 * Splits on blank lines after normalising line endings.
 *
 * Line-ending normalisation is exactly the kind of change that is safe here:
 * it cannot move a timestamp, and treating a CRLF file as a different version
 * from the same file saved on another platform would make the staleness signal
 * meaningless.
 */
function blocksOf(source: string): string[] {
  return source
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);
}

export function parseKnowledgeTranscript(
  source: string,
  format: KnowledgeTranscriptFormat,
): Result<KnowledgeTranscriptParse, DomainError> {
  if (format === 'plain') {
    // Plain text has no cues at all. It is not an empty transcript with
    // timings withheld; it is a transcript that cannot offer timestamps, and
    // the caller must not present one.
    return ok({ format, cues: [], declaredLanguage: null });
  }

  // The panel format is line-based, not block-based: its cues have no blank
  // lines between them, so this file's block splitter cannot see them at all.
  // It lives in its own module and is delegated to here.
  if (format === 'youtube-panel') return parseYouTubeTranscriptPanel(source);

  const text = source.replace(/^﻿/, '');
  let declaredLanguage: string | null = null;

  if (format === 'vtt') {
    const firstLine = text.replace(/\r\n?/g, '\n').split('\n', 1)[0]?.trim() ?? '';
    if (!/^WEBVTT\b/.test(firstLine)) {
      return err(domainError('validation', 'This does not look like a WebVTT file'));
    }
    // WebVTT may declare its language in a header line. Read it; never infer.
    const header = text.replace(/\r\n?/g, '\n').split(/\n{2,}/, 1)[0] ?? '';
    const language = /^Language:\s*([A-Za-z0-9-]+)\s*$/m.exec(header);
    if (language) declaredLanguage = language[1];
  }

  const cues: KnowledgeTranscriptCue[] = [];
  for (const block of blocksOf(text)) {
    const lines = block.split('\n');
    const timingLineIndex = lines.findIndex((line) => CUE_SEPARATOR.test(line));
    if (timingLineIndex < 0) continue; // headers, NOTE blocks, STYLE blocks

    const [rawStart, rawRest] = lines[timingLineIndex].split('-->');
    // WebVTT allows cue settings after the end time; they are positioning
    // hints and are not part of the timing.
    const rawEnd = (rawRest ?? '').trim().split(/\s+/, 1)[0] ?? '';
    const startMs = parseKnowledgeTranscriptTimestamp(rawStart ?? '');
    const endMs = parseKnowledgeTranscriptTimestamp(rawEnd);

    if (startMs === null || endMs === null) {
      return err(domainError('validation', 'This transcript has a timestamp that could not be read'));
    }
    // A cue that ends before it starts is contradictory. Repairing it -- by
    // swapping, or by clamping -- would invent a timing the file never stated
    // and then offer it to a reader as the moment something was said.
    if (endMs < startMs) {
      return err(domainError('validation', 'This transcript has a cue that ends before it starts'));
    }

    const body = lines.slice(timingLineIndex + 1).join('\n').trim();
    if (body.length === 0) continue; // a timing with no words carries nothing

    cues.push({ index: cues.length, startMs, endMs, text: body });
  }

  return ok({ format, cues, declaredLanguage });
}
