// Opening a citation that points into a transcript.
//
// A citation names a CHARACTER RANGE. A transcript can also name a MOMENT --
// but only when a cue actually owns that range, and only when the person who
// imported it claimed which video it describes. Everything here is about
// refusing to produce a timestamp in the cases where one would be invented.
//
// WHY THAT MATTERS MORE HERE THAN ELSEWHERE. A wrong character range shows the
// reader the wrong words, and they can see that it is wrong. A wrong timestamp
// sends them to a moment in a video that plausibly contains *something*, and
// nothing about it looks wrong -- it is the failure mode this whole feature is
// supposed to prevent, arriving through the feature itself.
//
// SO: NEVER INFER. cueAtOffset() deliberately returns the nearest cue at or
// before an offset, because a reader scrolling a transcript wants the last
// thing said. That is the right answer for a cursor and the WRONG answer for a
// citation, where "nearest" means "a moment nobody quoted". This module asks
// for OWNERSHIP instead, and returns nothing when no cue owns the range.

import { knowledgeTranscriptFormatDerivesCueEnds } from './knowledgeTranscriptCues';
import type { KnowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';

/** What opening a transcript citation can offer. */
export type KnowledgeTranscriptCitationTarget =
  | {
      /** No timestamp is available. The character range is still exact. */
      readonly kind: 'range';
      readonly reason:
        | 'no-cues'
        | 'no-cue-intersects-the-range'
        | 'text-not-accounted-for'
        | 'no-video-claimed'
        | 'unsupported-video-identity';
    }
  | {
      readonly kind: 'timestamped';
      readonly startMs: number;
      readonly endMs: number;
      readonly url: string;
      /**
       * True when `endMs` was SYNTHESISED rather than declared by the source.
       *
       * `startMs` is always real: every format this application parses states
       * when a cue begins. `endMs` is not. YouTube's transcript panel gives
       * starts only, so a panel-pasted cue's end is the next cue's start --
       * a good estimate, and still an estimate.
       *
       * IT TRAVELS WITH THE TIMESTAMP BECAUSE THAT IS THE ONLY PLACE IT CAN BE
       * ACTED ON. A range whose end is invented looks exactly like one whose
       * end was declared, and the reader has no way to tell them apart: the
       * clip plays, the words match, and the last second or two may belong to
       * a sentence nobody quoted. This is the same shape as the defects
       * recorded in LESSONS_LEARNED -- a derived value and a source value
       * converging on one field, after which nothing downstream can separate
       * them.
       */
      readonly endsAreDerived: boolean;
    };

type StoredCue = KnowledgeTranscriptStoredRepresentation['cues'][number];

/**
 * The cues a citation's range touches, in character order.
 *
 * CORRECTED, AND THE FIRST VERSION WAS TOO STRICT TO BE USEFUL. It required
 * the range to sit wholly inside ONE cue. But a chat citation names a chunk --
 * a 30-to-60-second window containing several cues -- so almost every real
 * citation spanned more than one, found no owner, and got no timestamp. A rule
 * that is correct on the cases it accepts and rejects nearly everything is not
 * a safe rule; it is a broken feature that looks careful.
 *
 * Intersection is by CHARACTERS, and needs no tie-breaking: cues overlap in
 * TIME -- 99.9% of them on one sampled track -- but each holds its own
 * distinct span of the canonical text. Zero-length cues are excluded because
 * they cover no text and so can intersect nothing.
 */
export function cuesIntersectingRange(
  representation: KnowledgeTranscriptStoredRepresentation,
  charStart: number,
  charEnd: number,
): readonly StoredCue[] {
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return [];
  if (charStart < 0 || charEnd < charStart) return [];

  return representation.cues
    .filter((cue) => cue.charEnd > cue.charStart && cue.charStart < charEnd && cue.charEnd > charStart)
    .slice()
    .sort((left, right) => left.charStart - right.charStart);
}

/**
 * The characters in the cited range that NO cue accounts for.
 *
 * The separators between cues land here, which is expected and harmless: they
 * are whitespace. Anything else is text that appears in the citation and was
 * spoken by nobody -- a sign the stored cues do not describe this document --
 * and the caller refuses to name a moment for it.
 */
function unaccountedText(
  cues: readonly StoredCue[],
  charStart: number,
  charEnd: number,
  citedText: string,
): string {
  const sliceOf = (from: number, to: number) => citedText.slice(from - charStart, to - charStart);
  let cursor = charStart;
  let leftover = '';

  for (const cue of cues) {
    if (cue.charStart > cursor) leftover += sliceOf(cursor, cue.charStart);
    cursor = Math.max(cursor, cue.charEnd);
  }
  if (cursor < charEnd) leftover += sliceOf(cursor, charEnd);
  return leftover;
}

/**
 * The video identities this build can turn into a link.
 *
 * FAIL CLOSED. The identity is a string a person typed, stored verbatim as
 * their claim, and nothing has ever validated it. An unrecognised shape
 * produces NO link rather than a guess: a malformed id interpolated into a URL
 * is at best a broken link and at worst a link to somebody else's video.
 *
 * Only `yt:<id>` is supported, and the id must match YouTube's documented
 * 11-character alphabet exactly.
 */
const YOUTUBE_IDENTITY = /^yt:([A-Za-z0-9_-]{11})$/;

export function knowledgeTranscriptVideoUrl(
  videoIdentity: string | null,
  startMs: number,
): string | null {
  if (videoIdentity === null) return null;
  if (!Number.isInteger(startMs) || startMs < 0) return null;

  const match = YOUTUBE_IDENTITY.exec(videoIdentity.trim());
  if (match === null) return null;

  // WHOLE SECONDS, ROUNDED DOWN. YouTube's `t` parameter takes seconds, so a
  // cue starting at 1500ms opens at 1s -- a moment at or BEFORE the quoted
  // words, never after them. Rounding up would open past the thing cited.
  const seconds = Math.floor(startMs / 1000);
  return `https://www.youtube.com/watch?v=${match[1]}&t=${seconds}s`;
}

/**
 * What a citation into this transcript can open.
 *
 * Every 'range' outcome carries WHY there is no timestamp, because the four
 * reasons are different facts about the source and a caller that treats them
 * alike will tell the reader the wrong thing about it.
 */
export function knowledgeTranscriptCitationTarget(
  representation: KnowledgeTranscriptStoredRepresentation,
  charStart: number,
  charEnd: number,
  /** The cited characters themselves: canonicalText.slice(charStart, charEnd). */
  citedText: string,
): KnowledgeTranscriptCitationTarget {
  // A plain transcript has no cues at all. It is not a timed transcript whose
  // timings are missing; it is one that never had any, and the reader must not
  // be offered a moment.
  if (representation.cues.length === 0) {
    return { kind: 'range', reason: 'no-cues' };
  }

  const cues = cuesIntersectingRange(representation, charStart, charEnd);
  if (cues.length === 0) {
    return { kind: 'range', reason: 'no-cue-intersects-the-range' };
  }

  // WHAT THE CUES DO NOT COVER. Separators are whitespace and are expected;
  // anything else is text in the citation that no cue claims, which means the
  // stored cues do not describe this document and no moment in it can be
  // trusted.
  if (unaccountedText(cues, charStart, charEnd, citedText).trim().length > 0) {
    return { kind: 'range', reason: 'text-not-accounted-for' };
  }

  // THE FIRST QUOTED CUE, in character order. A citation spanning a window
  // starts where its first spoken words start; linking to any later cue would
  // open past the beginning of what is quoted.
  const cue = cues[0];

  if (representation.videoIdentity === null) {
    // Timed, but nothing was claimed to time it against. The range still
    // opens; there is simply nowhere to send the reader.
    return { kind: 'range', reason: 'no-video-claimed' };
  }

  const url = knowledgeTranscriptVideoUrl(representation.videoIdentity, cue.startMs);
  if (url === null) {
    return { kind: 'range', reason: 'unsupported-video-identity' };
  }

  // READ FROM THE STORED FORMAT, NOT FROM A NEW STORED FIELD. The
  // representation already records which parser produced these cues, and
  // whether that parser declares ends is a property of the format rather than
  // of the row -- so this needs no migration, no representation version bump,
  // and answers correctly for every transcript already stored.
  return {
    kind: 'timestamped',
    startMs: cue.startMs,
    endMs: cue.endMs,
    url,
    endsAreDerived: knowledgeTranscriptFormatDerivesCueEnds(representation.format),
  };
}

/**
 * The sentence the source UI shows beside a transcript.
 *
 * KEPT AS A CONSTANT rather than written at each call site, because it is a
 * disclosure and disclosures drift when they are retyped. Two claims, both
 * of which a reader needs before trusting a timestamp: a person pasted this,
 * and a person said which video it belongs to. Nothing verified either.
 */
export const KNOWLEDGE_TRANSCRIPT_DISCLOSURE =
  'User-provided transcript. The video association is the importer’s claim and has not been verified.';
