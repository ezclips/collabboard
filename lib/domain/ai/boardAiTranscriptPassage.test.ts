import { describe, expect, it } from 'vitest';

import {
  boardAiTranscriptPassageTime,
  formatTranscriptTimestamp,
} from './boardAiTranscriptPassage';
import type { KnowledgeTranscriptStoredRepresentation } from '../knowledge/knowledgeTranscriptVersion';

/**
 * Canonical text: 'hello\nthere\nagain' — three cues, disjoint in characters.
 * The middle and last OVERLAP IN TIME, which is the ordinary shape of a
 * machine transcript and the reason the end is taken as a maximum rather than
 * from the last cue.
 */
const representation = (
  over: Partial<KnowledgeTranscriptStoredRepresentation> = {},
): KnowledgeTranscriptStoredRepresentation => ({
  representationVersion: 1,
  videoIdentity: 'yt:8IlJ3v8I4Z8',
  cues: [
    { charStart: 0, charEnd: 5, startMs: 60_000, endMs: 66_000 },
    { charStart: 6, charEnd: 11, startMs: 65_000, endMs: 74_000 },
    { charStart: 12, charEnd: 17, startMs: 70_000, endMs: 72_000 },
  ],
  language: null,
  trackKind: 'machine',
  format: 'youtube-panel',
  videoAssociation: 'claimed',
  ...over,
});

describe('boardAiTranscriptPassageTime', () => {
  it('gives the start of the first cue the passage touches', () => {
    const time = boardAiTranscriptPassageTime(representation(), 0, 5);
    expect(time?.startMs).toBe(60_000);
    expect(time?.videoUrl).toBe('https://www.youtube.com/watch?v=8IlJ3v8I4Z8&t=60s');
  });

  it('starts where the QUOTE starts, not where the window does', () => {
    // A passage spanning several cues begins at its first spoken words. Naming
    // any later cue would point past the beginning of what was quoted.
    const time = boardAiTranscriptPassageTime(representation(), 6, 17);
    expect(time?.startMs).toBe(65_000);
  });

  it('takes the LATEST end among the cues, not the last cue’s end', () => {
    // Cues overlap in time -- on one sampled track, 99.9% of them did -- so the
    // final cue in CHARACTER order is not reliably the one that ends latest.
    // Here the last cue ends at 72s while the middle one runs to 74s.
    const time = boardAiTranscriptPassageTime(representation(), 0, 17);
    expect(time?.endMs).toBe(74_000);
  });

  describe('it says nothing rather than guessing', () => {
    it('returns null when the document is not a transcript', () => {
      expect(boardAiTranscriptPassageTime(null, 0, 5)).toBeNull();
    });

    it('returns null for a transcript with no cues, which is a plain-text import', () => {
      expect(boardAiTranscriptPassageTime(representation({ cues: [] }), 0, 5)).toBeNull();
    });

    it('returns null when the passage carries no character range', () => {
      // A row whose locators were a PDF's bboxes, empty or malformed. The
      // passage stays quotable and simply has no moment.
      expect(boardAiTranscriptPassageTime(representation(), undefined, undefined)).toBeNull();
      expect(boardAiTranscriptPassageTime(representation(), 0, undefined)).toBeNull();
    });

    it('RETURNS NULL WHEN NO CUE OWNS THE CHARACTERS, rather than the nearest one', () => {
      // The rule this module exists to preserve. "Nearest" means "a moment
      // nobody quoted", and a reader cannot tell a wrong timestamp from a right
      // one: the video plays, and something plausible is being said.
      expect(boardAiTranscriptPassageTime(representation(), 400, 500)).toBeNull();
    });
  });

  describe('the video link', () => {
    it('is null when the importer claimed no video, and the time still stands', () => {
      const time = boardAiTranscriptPassageTime(representation({ videoIdentity: null }), 0, 5);
      // The moment is still true about the transcript; there is simply nowhere
      // to send the reader. Losing the link must not lose the timestamp.
      expect(time?.startMs).toBe(60_000);
      expect(time?.videoUrl).toBeNull();
    });

    it('is null for a video identity no link can be built from', () => {
      const time = boardAiTranscriptPassageTime(
        representation({ videoIdentity: 'vimeo:123456789' }),
        0,
        5,
      );
      expect(time?.startMs).toBe(60_000);
      expect(time?.videoUrl).toBeNull();
      // The identity still travels, so a caller can match it against media on
      // the board even when no YouTube URL exists.
      expect(time?.videoIdentity).toBe('vimeo:123456789');
    });
  });

  describe('endsAreDerived travels with the range', () => {
    it('is true for a transcript pasted from YouTube’s panel', () => {
      expect(boardAiTranscriptPassageTime(representation(), 0, 5)?.endsAreDerived).toBe(true);
    });

    it('is false for SRT, which declares both times', () => {
      expect(
        boardAiTranscriptPassageTime(representation({ format: 'srt' }), 0, 5)?.endsAreDerived,
      ).toBe(false);
    });
  });
});

describe('formatTranscriptTimestamp', () => {
  it.each([
    [0, '0:00'],
    [7_000, '0:07'],
    [60_000, '1:00'],
    [470_000, '7:50'],
    [3_600_000, '1:00:00'],
    [3_671_000, '1:01:11'],
  ])('%i ms reads as %s', (ms, expected) => {
    expect(formatTranscriptTimestamp(ms)).toBe(expected);
  });

  it('floors to whole seconds, matching the URL the link uses', () => {
    // The `t` parameter takes seconds and rounds DOWN, so a cue at 7:50.9 opens
    // at 7:50. If the label rounded up, the answer would cite 7:51 beside a
    // link that goes to 7:50.
    expect(formatTranscriptTimestamp(470_900)).toBe('7:50');
  });

  it('never renders a negative time', () => {
    expect(formatTranscriptTimestamp(-5_000)).toBe('0:00');
  });
});
