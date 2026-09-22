// WHEN WAS THIS PASSAGE SAID?
//
// A board search returns a passage of a transcript as a CHARACTER RANGE, which
// is how every source in this application is located. A transcript is the one
// source where that range also answers a second question -- at what moment in
// the video -- and until now nothing asked it.
//
// ============================================================================
// WHY THE ANSWER WAS MISSING RATHER THAN WRONG
// ============================================================================
//
// Observed 2026-09-22. Asked "at what minute does the video talk about the
// Sicilian?", Board AI replied that the text "has no timestamps on it ... so
// there's nothing in what was shared with me to convert the Sicilian discussion
// into minute X."
//
// THAT ANSWER WAS CORRECT, and worth preserving as the reason this module
// exists. The model was not failing to use information it had; it was correctly
// refusing to invent information it did not have. The cues were in
// `knowledge_documents.transcript_representation`, the search read
// `knowledge_chunks`, and nothing joined the two. A model that had guessed a
// minute there would have been the more dangerous outcome.
//
// ============================================================================
// THE RULE: LOCATED, NEVER INTERPOLATED
// ============================================================================
//
// `cuesIntersectingRange` is reused rather than reimplemented, and it is the
// part that makes this safe. It returns cues that OWN the characters, and
// nothing when none does -- deliberately not the nearest cue, because "nearest"
// means "a moment nobody quoted". A wrong character range shows the reader the
// wrong words and they can see it; a wrong timestamp sends them to a moment
// that plausibly contains something, and nothing about it looks wrong.
//
// So a passage whose characters no cue claims gets NO time, and the answer says
// less rather than more.

import {
  cuesIntersectingRange,
  knowledgeTranscriptVideoUrl,
} from '../knowledge/knowledgeTranscriptCitation';
import { knowledgeTranscriptFormatDerivesCueEnds } from '../knowledge/knowledgeTranscriptCues';
import type { KnowledgeTranscriptStoredRepresentation } from '../knowledge/knowledgeTranscriptVersion';

export interface BoardAiTranscriptPassageTime {
  /** The start of the FIRST cue the passage touches. Always a real source time. */
  readonly startMs: number;
  /** The end of the LAST cue it touches. Derived for some formats; see below. */
  readonly endMs: number;
  /**
   * True when `endMs` was synthesised rather than declared by the source.
   *
   * Carried so a caller rendering a RANGE can say so. The start never needs
   * this qualifier: every format states when a cue begins.
   */
  readonly endsAreDerived: boolean;
  /** A link that opens the video at `startMs`, when the identity supports one. */
  readonly videoUrl: string | null;
  /** The claimed video, so a caller can match it against media on the board. */
  readonly videoIdentity: string | null;
}

/**
 * The moment a passage was spoken, or `null` when nothing can vouch for one.
 *
 * `null` covers every honest reason: the document is not a transcript, it has
 * no cues (a plain-text import), or no cue owns these characters. The caller
 * shows no time at all rather than a qualified guess.
 */
export function boardAiTranscriptPassageTime(
  representation: KnowledgeTranscriptStoredRepresentation | null,
  charStart: number | undefined,
  charEnd: number | undefined,
): BoardAiTranscriptPassageTime | null {
  if (representation === null) return null;
  if (charStart === undefined || charEnd === undefined) return null;
  if (representation.cues.length === 0) return null;

  const cues = cuesIntersectingRange(representation, charStart, charEnd);
  if (cues.length === 0) return null;

  // THE FIRST CUE IN CHARACTER ORDER, matching what a citation does. A passage
  // spanning a window starts where its first spoken words start; naming any
  // later cue would point past the beginning of what was quoted.
  const startMs = cues[0].startMs;

  // THE LATEST END AMONG THE CUES, not the last cue's end. Cues overlap in time
  // -- on one sampled track, 99.9% of them did -- so the final cue in character
  // order is not reliably the one that ends latest, and taking its end would
  // cut the range short.
  let endMs = startMs;
  for (const cue of cues) if (cue.endMs > endMs) endMs = cue.endMs;

  return {
    startMs,
    endMs,
    endsAreDerived: knowledgeTranscriptFormatDerivesCueEnds(representation.format),
    videoUrl: knowledgeTranscriptVideoUrl(representation.videoIdentity, startMs),
    videoIdentity: representation.videoIdentity,
  };
}

/**
 * `m:ss`, or `h:mm:ss` past an hour.
 *
 * SHARED, because this string is what the model reads in the context block AND
 * what the reader sees on the citation. Two implementations would drift, and
 * the drift would show as an answer citing 7:50 beside a link labelled 7:49.
 */
export function formatTranscriptTimestamp(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const seconds = String(total % 60).padStart(2, '0');
  const minutes = Math.floor(total / 60) % 60;
  const hours = Math.floor(total / 3600);
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`;
}
