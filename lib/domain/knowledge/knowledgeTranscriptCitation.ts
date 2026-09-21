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

import type { KnowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';

/** What opening a transcript citation can offer. */
export type KnowledgeTranscriptCitationTarget =
  | {
      /** No timestamp is available. The character range is still exact. */
      readonly kind: 'range';
      readonly reason:
        | 'no-cues'
        | 'no-cue-owns-the-range'
        | 'no-video-claimed'
        | 'unsupported-video-identity';
    }
  | {
      readonly kind: 'timestamped';
      readonly startMs: number;
      readonly endMs: number;
      readonly url: string;
    };

/**
 * The cue that OWNS a citation's range, or null.
 *
 * Ownership means containment: the cited range lies wholly inside the cue. A
 * range that spans two cues has no single moment, and a range that starts in
 * the gap between cues was never spoken by either.
 *
 * OVERLAPPING CUES ARE THE NORMAL CASE in a machine transcript -- 99.9% of
 * cues overlapped in time on one sampled track -- but they overlap in TIME,
 * not in characters: each cue holds its own distinct span of the canonical
 * text. So at most one cue can contain a given character range, and the first
 * container found is the only container.
 */
export function cueOwningRange(
  representation: KnowledgeTranscriptStoredRepresentation,
  charStart: number,
  charEnd: number,
): KnowledgeTranscriptStoredRepresentation['cues'][number] | null {
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) return null;
  if (charStart < 0 || charEnd < charStart) return null;

  for (const cue of representation.cues) {
    if (charStart >= cue.charStart && charEnd <= cue.charEnd) return cue;
  }
  return null;
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
): KnowledgeTranscriptCitationTarget {
  // A plain transcript has no cues at all. It is not a timed transcript whose
  // timings are missing; it is one that never had any, and the reader must not
  // be offered a moment.
  if (representation.cues.length === 0) {
    return { kind: 'range', reason: 'no-cues' };
  }

  const cue = cueOwningRange(representation, charStart, charEnd);
  if (cue === null) {
    return { kind: 'range', reason: 'no-cue-owns-the-range' };
  }

  if (representation.videoIdentity === null) {
    // Timed, but nothing was claimed to time it against. The range still
    // opens; there is simply nowhere to send the reader.
    return { kind: 'range', reason: 'no-video-claimed' };
  }

  const url = knowledgeTranscriptVideoUrl(representation.videoIdentity, cue.startMs);
  if (url === null) {
    return { kind: 'range', reason: 'unsupported-video-identity' };
  }

  return { kind: 'timestamped', startMs: cue.startMs, endMs: cue.endMs, url };
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
