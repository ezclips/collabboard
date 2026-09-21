import { describe, expect, it } from 'vitest';

import {
  cueOwningRange,
  knowledgeTranscriptCitationTarget,
  knowledgeTranscriptVideoUrl,
  KNOWLEDGE_TRANSCRIPT_DISCLOSURE,
} from './knowledgeTranscriptCitation';
import type { KnowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';

// Two cues that OVERLAP IN TIME and are DISJOINT IN CHARACTERS -- the ordinary
// shape of a machine transcript, and the case a "nearest cue" lookup gets
// wrong.
const representation = (
  over: Partial<KnowledgeTranscriptStoredRepresentation> = {},
): KnowledgeTranscriptStoredRepresentation => ({
  representationVersion: 1,
  videoIdentity: 'yt:dQw4w9WgXcQ',
  cues: [
    { charStart: 0, charEnd: 5, startMs: 1000, endMs: 3000 },
    { charStart: 6, charEnd: 11, startMs: 2500, endMs: 5000 },
  ],
  language: null,
  trackKind: 'machine',
  format: 'srt',
  videoAssociation: 'claimed',
  ...over,
});

describe('cueOwningRange', () => {
  it('finds the cue that wholly contains the range', () => {
    expect(cueOwningRange(representation(), 0, 5)?.startMs).toBe(1000);
    expect(cueOwningRange(representation(), 7, 10)?.startMs).toBe(2500);
  });

  it('picks by CHARACTERS even though the cues overlap in time', () => {
    // The second cue starts before the first one ends. A lookup that reasoned
    // about time would have two candidates here; characters have one.
    const rep = representation();
    expect(rep.cues[1].startMs).toBeLessThan(rep.cues[0].endMs);
    expect(cueOwningRange(rep, 6, 11)?.startMs).toBe(2500);
  });

  it('returns nothing for a range spanning two cues', () => {
    // No single moment was quoted, so no single moment can be named.
    expect(cueOwningRange(representation(), 3, 8)).toBeNull();
  });

  it('returns nothing for a range in the gap between cues', () => {
    // Offset 5 is the separator: nobody said it.
    expect(cueOwningRange(representation(), 5, 6)).toBeNull();
  });

  it('accepts a range that exactly meets a cue boundary', () => {
    expect(cueOwningRange(representation(), 0, 0)?.startMs).toBe(1000);
    expect(cueOwningRange(representation(), 5, 5)?.startMs).toBe(1000);
    expect(cueOwningRange(representation(), 11, 11)?.startMs).toBe(2500);
  });

  it('refuses an impossible or non-integer range', () => {
    expect(cueOwningRange(representation(), -1, 5)).toBeNull();
    expect(cueOwningRange(representation(), 5, 2)).toBeNull();
    expect(cueOwningRange(representation(), 0.5, 5)).toBeNull();
  });
});

describe('knowledgeTranscriptVideoUrl', () => {
  it('builds a YouTube link at the whole second at or before the cue', () => {
    // Rounding UP would open past the words being quoted.
    expect(knowledgeTranscriptVideoUrl('yt:dQw4w9WgXcQ', 1500)).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1s',
    );
  });

  it('fails closed on every identity it does not recognise', () => {
    // A malformed id interpolated into a URL is at best broken and at worst a
    // link to someone else's video.
    for (const identity of [
      'dQw4w9WgXcQ',
      'yt:short',
      'yt:waytoolongforanid',
      'yt:has space12',
      'vimeo:123456',
      'yt:../../evil',
      'https://youtube.com/watch?v=dQw4w9WgXcQ',
      '',
    ]) {
      expect(knowledgeTranscriptVideoUrl(identity, 1000)).toBeNull();
    }
  });

  it('fails closed on a null identity or an impossible time', () => {
    expect(knowledgeTranscriptVideoUrl(null, 1000)).toBeNull();
    expect(knowledgeTranscriptVideoUrl('yt:dQw4w9WgXcQ', -1)).toBeNull();
    expect(knowledgeTranscriptVideoUrl('yt:dQw4w9WgXcQ', 1.5)).toBeNull();
  });
});

describe('knowledgeTranscriptCitationTarget', () => {
  it('offers a timestamp when a cue owns the range and a video is claimed', () => {
    const target = knowledgeTranscriptCitationTarget(representation(), 6, 11);

    expect(target.kind).toBe('timestamped');
    if (target.kind === 'timestamped') {
      expect(target.startMs).toBe(2500);
      expect(target.endMs).toBe(5000);
      expect(target.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2s');
    }
  });

  it('opens a plain transcript by range only', () => {
    // Not a timed transcript with timings missing -- one that never had any.
    const target = knowledgeTranscriptCitationTarget(
      representation({ cues: [], format: 'plain', videoIdentity: null }),
      0,
      10,
    );
    expect(target).toEqual({ kind: 'range', reason: 'no-cues' });
  });

  it('opens by range, never by a guess, when no cue owns the offset', () => {
    // THE INFERENCE THIS MODULE EXISTS TO REFUSE. A nearest-cue lookup would
    // happily return the previous cue here and send the reader to a moment
    // nobody quoted.
    expect(knowledgeTranscriptCitationTarget(representation(), 5, 6)).toEqual({
      kind: 'range',
      reason: 'no-cue-owns-the-range',
    });
    expect(knowledgeTranscriptCitationTarget(representation(), 3, 8)).toEqual({
      kind: 'range',
      reason: 'no-cue-owns-the-range',
    });
  });

  it('opens a timed transcript with no claimed video by range only', () => {
    expect(knowledgeTranscriptCitationTarget(representation({ videoIdentity: null }), 0, 5)).toEqual(
      { kind: 'range', reason: 'no-video-claimed' },
    );
  });

  it('opens by range when the claimed identity is malformed', () => {
    // The identity was never validated on the way in -- it is stored verbatim
    // as the importer's claim -- so this is the first place it can be refused.
    expect(
      knowledgeTranscriptCitationTarget(representation({ videoIdentity: 'yt:nope' }), 0, 5),
    ).toEqual({ kind: 'range', reason: 'unsupported-video-identity' });
  });

  it('distinguishes its four reasons rather than collapsing them', () => {
    // They are different facts about the source, and a caller that treated
    // them alike would tell the reader the wrong thing about it.
    const reasons = new Set([
      knowledgeTranscriptCitationTarget(representation({ cues: [] }), 0, 1),
      knowledgeTranscriptCitationTarget(representation(), 5, 6),
      knowledgeTranscriptCitationTarget(representation({ videoIdentity: null }), 0, 5),
      knowledgeTranscriptCitationTarget(representation({ videoIdentity: 'bad' }), 0, 5),
    ].map((target) => (target.kind === 'range' ? target.reason : 'timestamped')));

    expect(reasons.size).toBe(4);
  });
});

describe('the disclosure', () => {
  it('states both unverified claims', () => {
    // A reader needs both before trusting a timestamp: a person pasted this,
    // and a person said which video it belongs to.
    expect(KNOWLEDGE_TRANSCRIPT_DISCLOSURE).toContain('User-provided transcript');
    expect(KNOWLEDGE_TRANSCRIPT_DISCLOSURE).toContain('has not been verified');
  });
});
