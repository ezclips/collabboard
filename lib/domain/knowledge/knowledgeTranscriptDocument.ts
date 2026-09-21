/**
 * A parsed transcript turned into the one canonical string everything cites,
 * plus the cue-to-character mapping that makes a timestamp recoverable from a
 * character offset.
 *
 * THE MAPPING IS THE POINT. A citation names `[charStart, charEnd)` in the
 * canonical text, exactly as Stage 1 and Stage 2 sources do -- that is settled
 * and unchanged. What a transcript adds is that a character offset can be
 * carried back to the cue containing it, and therefore to a moment in a video.
 * If that mapping is wrong, a citation still highlights correctly and links to
 * the wrong second, which is the failure a reader is least able to detect.
 *
 * OFFSETS ARE UTF-16 CODE UNITS, without exception. That is what
 * `String.prototype.slice` counts, what every existing citation in this
 * codebase means, and what the reader highlights with. Byte lengths appear in
 * exactly one place -- the serialised hash input -- and are labelled there.
 */
import { domainError, type DomainError } from '../core/errors';
import { err, ok, type Result } from '../core/result';
import type { KnowledgeTranscriptCue, KnowledgeTranscriptFormat } from './knowledgeTranscriptCues';

/** A cue, placed in the canonical text. Offsets are UTF-16 code units. */
export interface KnowledgeTranscriptPlacedCue extends KnowledgeTranscriptCue {
  readonly charStart: number;
  readonly charEnd: number;
}

export interface KnowledgeTranscriptDocument {
  readonly canonicalText: string;
  readonly cues: readonly KnowledgeTranscriptPlacedCue[];
  readonly format: KnowledgeTranscriptFormat;
}

/** Cues are joined by this, and it is declared rather than assumed. */
export const KNOWLEDGE_TRANSCRIPT_CUE_SEPARATOR = '\n';

/**
 * Places every cue in one string, in file order.
 *
 * Repeated text is written twice, deliberately: see the cue parser. Overlapping
 * cues each get their own distinct character range even though their times
 * overlap -- time and text are different axes, and only the text axis has to be
 * non-overlapping for citations to work.
 */
export function buildKnowledgeTranscriptDocument(
  cues: readonly KnowledgeTranscriptCue[],
  format: KnowledgeTranscriptFormat,
  plainText?: string,
): KnowledgeTranscriptDocument {
  if (format === 'plain') {
    return { canonicalText: plainText ?? '', cues: [], format };
  }

  const placed: KnowledgeTranscriptPlacedCue[] = [];
  let canonicalText = '';
  for (const cue of cues) {
    if (canonicalText.length > 0) canonicalText += KNOWLEDGE_TRANSCRIPT_CUE_SEPARATOR;
    const charStart = canonicalText.length;
    canonicalText += cue.text;
    placed.push({ ...cue, charStart, charEnd: canonicalText.length });
  }
  return { canonicalText, cues: placed, format };
}

/**
 * The cue a character offset falls in, or the nearest one before it.
 *
 * Returns null for a transcript with no cues, which is the plain-text case and
 * means "no timestamp is available" -- never a guessed zero.
 */
export function cueAtOffset(
  document: KnowledgeTranscriptDocument,
  charOffset: number,
): KnowledgeTranscriptPlacedCue | null {
  let found: KnowledgeTranscriptPlacedCue | null = null;
  for (const cue of document.cues) {
    if (cue.charStart > charOffset) break;
    found = cue;
  }
  return found;
}

/**
 * A window of cues: the unit a chunk is built from.
 *
 * BOUNDS COME FROM THE CUES THE WINDOW CONTAINS, not from its first and last.
 * With overlapping cues in file order, the last cue is not reliably the one
 * that ends latest -- a cue may end after the cue that follows it. Taking
 * `cues[cues.length - 1].endMs` would therefore cut a window's end short and
 * mis-time anything derived from it.
 */
export interface KnowledgeTranscriptWindow {
  readonly cues: readonly KnowledgeTranscriptPlacedCue[];
  readonly charStart: number;
  readonly charEnd: number;
  readonly startMs: number;
  readonly endMs: number;
  /** True when one cue alone is longer than the target window. */
  readonly oversizedCue: boolean;
}

export const KNOWLEDGE_TRANSCRIPT_WINDOW_TARGET_MS = 45_000;

export function groupKnowledgeTranscriptWindows(
  document: KnowledgeTranscriptDocument,
  targetMs: number = KNOWLEDGE_TRANSCRIPT_WINDOW_TARGET_MS,
): readonly KnowledgeTranscriptWindow[] {
  const windows: KnowledgeTranscriptWindow[] = [];
  let current: KnowledgeTranscriptPlacedCue[] = [];
  let windowStartMs = 0;

  const flush = () => {
    if (current.length === 0) return;
    windows.push(windowOf(current, targetMs));
    current = [];
  };

  for (const cue of document.cues) {
    // A cue longer than the whole window is its own window, never split. A
    // window boundary inside a cue would give a citation a character range
    // with no single cue behind it, so no timestamp could be named for part
    // of it.
    if (cue.endMs - cue.startMs >= targetMs) {
      flush();
      windows.push(windowOf([cue], targetMs));
      continue;
    }
    if (current.length === 0) windowStartMs = cue.startMs;
    // Cut on ABSOLUTE offsets. Accumulating durations double-counts overlap
    // and drifts further wrong the longer the transcript runs.
    if (cue.startMs - windowStartMs >= targetMs) {
      flush();
      windowStartMs = cue.startMs;
    }
    current.push(cue);
  }
  flush();
  return windows;
}

function windowOf(
  cues: readonly KnowledgeTranscriptPlacedCue[],
  targetMs: number,
): KnowledgeTranscriptWindow {
  let startMs = cues[0].startMs;
  let endMs = cues[0].endMs;
  let charStart = cues[0].charStart;
  let charEnd = cues[0].charEnd;
  for (const cue of cues) {
    if (cue.startMs < startMs) startMs = cue.startMs;
    if (cue.endMs > endMs) endMs = cue.endMs;
    if (cue.charStart < charStart) charStart = cue.charStart;
    if (cue.charEnd > charEnd) charEnd = cue.charEnd;
  }
  return {
    cues,
    charStart,
    charEnd,
    startMs,
    endMs,
    oversizedCue: cues.length === 1 && cues[0].endMs - cues[0].startMs >= targetMs,
  };
}

/**
 * LIMITS, chosen rather than derived, each with headroom over the worst case
 * the Stage 3a instrument actually measured (46,959 cues, 1,696,642 text units
 * for a 31-hour video).
 *
 * They are not arithmetic on that number: it is an observed workload, not a
 * justified maximum. Each is enforced before the cost it bounds, and each has
 * a test at the limit and one past it.
 */
export const KNOWLEDGE_TRANSCRIPT_MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
export const KNOWLEDGE_TRANSCRIPT_MAX_CUES = 100_000;
export const KNOWLEDGE_TRANSCRIPT_MAX_TEXT_UNITS = 4_000_000;

export function enforceKnowledgeTranscriptLimits(input: {
  readonly payloadBytes: number;
  readonly cueCount: number;
  readonly textUnits: number;
}): Result<true, DomainError> {
  if (input.payloadBytes > KNOWLEDGE_TRANSCRIPT_MAX_PAYLOAD_BYTES) {
    return err(domainError('validation', 'This transcript is too large to import'));
  }
  if (input.cueCount > KNOWLEDGE_TRANSCRIPT_MAX_CUES) {
    return err(domainError('validation', 'This transcript has too many cues to import'));
  }
  if (input.textUnits > KNOWLEDGE_TRANSCRIPT_MAX_TEXT_UNITS) {
    return err(domainError('validation', 'This transcript contains too much text to index'));
  }
  return ok(true);
}
