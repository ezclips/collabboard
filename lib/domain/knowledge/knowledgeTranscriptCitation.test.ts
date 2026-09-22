import { describe, expect, it } from 'vitest';

import {
  cuesIntersectingRange,
  knowledgeTranscriptCitationTarget,
  knowledgeTranscriptVideoUrl,
  KNOWLEDGE_TRANSCRIPT_DISCLOSURE,
} from './knowledgeTranscriptCitation';
import type { KnowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';

// Two cues that OVERLAP IN TIME and are DISJOINT IN CHARACTERS -- the ordinary
// shape of a machine transcript. Canonical text: 'hello\nthere' (11 units).
const CANONICAL = 'hello\nthere';

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

const cited = (charStart: number, charEnd: number) => CANONICAL.slice(charStart, charEnd);

describe('cuesIntersectingRange', () => {
  it('finds the single cue a small range falls in', () => {
    expect(cuesIntersectingRange(representation(), 0, 5).map((cue) => cue.startMs)).toEqual([1000]);
    expect(cuesIntersectingRange(representation(), 7, 10).map((cue) => cue.startMs)).toEqual([2500]);
  });

  it('finds BOTH cues for a range spanning them', () => {
    // The case the first version rejected, and the normal shape of a chat
    // citation: a chunk containing several cues.
    expect(cuesIntersectingRange(representation(), 3, 8).map((cue) => cue.startMs)).toEqual([
      1000, 2500,
    ]);
  });

  it('returns them in CHARACTER order regardless of their times', () => {
    // The second cue starts before the first one ends. Ordering by time would
    // put the wrong cue first and link past the start of the quotation.
    const rep = representation();
    expect(rep.cues[1].startMs).toBeLessThan(rep.cues[0].endMs);
    expect(cuesIntersectingRange(rep, 0, 11).map((cue) => cue.charStart)).toEqual([0, 6]);
  });

  it('finds nothing in the gap between cues', () => {
    expect(cuesIntersectingRange(representation(), 5, 6)).toEqual([]);
  });

  it('ignores zero-length cues, which cover no text', () => {
    const rep = representation({ cues: [{ charStart: 3, charEnd: 3, startMs: 0, endMs: 0 }] });
    expect(cuesIntersectingRange(rep, 0, 11)).toEqual([]);
  });

  it('refuses an impossible or non-integer range', () => {
    expect(cuesIntersectingRange(representation(), -1, 5)).toEqual([]);
    expect(cuesIntersectingRange(representation(), 5, 2)).toEqual([]);
    expect(cuesIntersectingRange(representation(), 0.5, 5)).toEqual([]);
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
  it('offers a timestamp for a single-cue citation', () => {
    const target = knowledgeTranscriptCitationTarget(representation(), 6, 11, cited(6, 11));

    expect(target.kind).toBe('timestamped');
    if (target.kind === 'timestamped') {
      expect(target.startMs).toBe(2500);
      expect(target.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=2s');
    }
  });

  it('offers the FIRST quoted cue for a citation spanning several', () => {
    // The separator between the cues is whitespace, so it is accounted for.
    const target = knowledgeTranscriptCitationTarget(representation(), 0, 11, cited(0, 11));

    expect(target.kind).toBe('timestamped');
    if (target.kind === 'timestamped') expect(target.startMs).toBe(1000);
  });

  it('opens a plain transcript by range only', () => {
    const target = knowledgeTranscriptCitationTarget(
      representation({ cues: [], format: 'plain', videoIdentity: null }),
      0,
      10,
      cited(0, 10),
    );
    expect(target).toEqual({ kind: 'range', reason: 'no-cues' });
  });

  it('opens by range when no cue intersects the citation at all', () => {
    expect(knowledgeTranscriptCitationTarget(representation(), 5, 6, cited(5, 6))).toEqual({
      kind: 'range',
      reason: 'no-cue-intersects-the-range',
    });
  });

  it('refuses a timestamp when the citation contains words no cue accounts for', () => {
    // A cue table that does not describe this text cannot be trusted to time
    // any part of it.
    const rep = representation({
      cues: [{ charStart: 0, charEnd: 5, startMs: 1000, endMs: 3000 }],
    });
    expect(knowledgeTranscriptCitationTarget(rep, 0, 11, cited(0, 11))).toEqual({
      kind: 'range',
      reason: 'text-not-accounted-for',
    });
  });

  it('opens a timed transcript with no claimed video by range only', () => {
    expect(
      knowledgeTranscriptCitationTarget(representation({ videoIdentity: null }), 0, 5, cited(0, 5)),
    ).toEqual({ kind: 'range', reason: 'no-video-claimed' });
  });

  it('opens by range when the claimed identity is malformed', () => {
    expect(
      knowledgeTranscriptCitationTarget(representation({ videoIdentity: 'yt:nope' }), 0, 5, cited(0, 5)),
    ).toEqual({ kind: 'range', reason: 'unsupported-video-identity' });
  });

  it('keeps its five reasons distinct rather than collapsing them', () => {
    const shortRep = representation({
      cues: [{ charStart: 0, charEnd: 5, startMs: 1000, endMs: 3000 }],
    });
    const reasons = new Set(
      [
        knowledgeTranscriptCitationTarget(representation({ cues: [] }), 0, 1, cited(0, 1)),
        knowledgeTranscriptCitationTarget(representation(), 5, 6, cited(5, 6)),
        knowledgeTranscriptCitationTarget(shortRep, 0, 11, cited(0, 11)),
        knowledgeTranscriptCitationTarget(representation({ videoIdentity: null }), 0, 5, cited(0, 5)),
        knowledgeTranscriptCitationTarget(representation({ videoIdentity: 'bad' }), 0, 5, cited(0, 5)),
      ].map((target) => (target.kind === 'range' ? target.reason : 'timestamped')),
    );

    expect(reasons.size).toBe(5);
  });
});

describe('a realistic chat citation', () => {
  // WHAT A CITATION ACTUALLY LOOKS LIKE: one chunk covering a ~45-second
  // window of a machine transcript -- nine short, overlapping cues. The first
  // version of this module gave every one of these NO timestamp, because no
  // single cue contained the range.
  const lines = [
    'so the first thing to notice', 'is that the numbers here', 'do not add up the way',
    'you would expect them to', 'and that is the whole point', 'of this section',
    'which we will come back to', 'after the break', 'in about ten minutes',
  ];

  const canonical = lines.join('\n');
  const cues = (() => {
    const built: { charStart: number; charEnd: number; startMs: number; endMs: number }[] = [];
    let cursor = 0;
    lines.forEach((line, index) => {
      const charStart = cursor;
      cursor += line.length;
      built.push({
        charStart,
        charEnd: cursor,
        // Overlapping, as ASR tracks are: each cue runs 6s and starts 5s apart.
        startMs: 120_000 + index * 5_000,
        endMs: 120_000 + index * 5_000 + 6_000,
      });
      cursor += 1; // the separator
    });
    return built;
  })();

  const rep = (): KnowledgeTranscriptStoredRepresentation => ({
    representationVersion: 1,
    videoIdentity: 'yt:dQw4w9WgXcQ',
    cues,
    language: 'en',
    trackKind: 'machine',
    format: 'vtt',
    videoAssociation: 'claimed',
  });

  it('times a whole-window citation at the first cue it quotes', () => {
    const charStart = 0;
    const charEnd = canonical.length;
    const target = knowledgeTranscriptCitationTarget(
      rep(),
      charStart,
      charEnd,
      canonical.slice(charStart, charEnd),
    );

    expect(target.kind).toBe('timestamped');
    if (target.kind === 'timestamped') {
      expect(target.startMs).toBe(120_000);
      expect(target.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120s');
    }
    // Nine cues, one citation, one moment.
    expect(cuesIntersectingRange(rep(), charStart, charEnd)).toHaveLength(9);
  });

  it('times a partial citation at the first cue it touches, not the window start', () => {
    // Starting mid-way through cue 4 must open at cue 4, not at cue 0.
    const charStart = cues[4].charStart + 3;
    const charEnd = cues[6].charEnd;
    const target = knowledgeTranscriptCitationTarget(
      rep(),
      charStart,
      charEnd,
      canonical.slice(charStart, charEnd),
    );

    expect(target.kind).toBe('timestamped');
    if (target.kind === 'timestamped') expect(target.startMs).toBe(cues[4].startMs);
  });
});

describe('the disclosure', () => {
  it('states both unverified claims', () => {
    expect(KNOWLEDGE_TRANSCRIPT_DISCLOSURE).toContain('User-provided transcript');
    expect(KNOWLEDGE_TRANSCRIPT_DISCLOSURE).toContain('has not been verified');
  });
});

describe('a derived cue end is labelled as derived', () => {
  /**
   * THE START IS ALWAYS REAL; THE END IS NOT ALWAYS REAL. Every format states
   * when a cue begins. YouTube's transcript panel states only that -- each end
   * is the next cue's start, and the last is a median of the rest. A range
   * whose end was invented looks exactly like one whose end was declared, so
   * the distinction has to travel with the timestamp rather than be
   * re-derivable by whoever happens to remember.
   */
  it('reports derived ends for a transcript pasted from the panel', () => {
    const target = knowledgeTranscriptCitationTarget(
      representation({ format: 'youtube-panel' }),
      0,
      5,
      cited(0, 5),
    );
    expect(target.kind).toBe('timestamped');
    if (target.kind !== 'timestamped') return;
    expect(target.endsAreDerived).toBe(true);
    // The START is untouched by any of this: it is what the source said.
    expect(target.startMs).toBe(1000);
  });

  it.each(['srt', 'vtt'] as const)('reports declared ends for %s, which states both', (format) => {
    const target = knowledgeTranscriptCitationTarget(representation({ format }), 0, 5, cited(0, 5));
    expect(target.kind).toBe('timestamped');
    if (target.kind !== 'timestamped') return;
    expect(target.endsAreDerived).toBe(false);
  });

  it('reads the answer from the STORED format, so transcripts saved before this existed answer correctly', () => {
    // No migration and no representation version bump: `format` was already
    // part of every stored representation, and whether a format declares ends
    // is a property of the format, not of the row.
    const stored = representation({ format: 'youtube-panel' });
    expect(stored.representationVersion).toBe(1);
    const target = knowledgeTranscriptCitationTarget(stored, 6, 11, cited(6, 11));
    expect(target.kind === 'timestamped' && target.endsAreDerived).toBe(true);
  });
});
