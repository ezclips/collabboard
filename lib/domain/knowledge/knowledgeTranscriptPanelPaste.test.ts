import { describe, expect, it } from 'vitest';

import { parseKnowledgeTranscript } from './knowledgeTranscriptCues';
import { cuesIntersectingRange } from './knowledgeTranscriptCitation';
import { knowledgeTranscriptStoredRepresentation } from './knowledgeTranscriptVersion';
import type { KnowledgeTranscriptCue } from './knowledgeTranscriptCues';

/**
 * THE YOUTUBE PANEL PASTE.
 *
 * FIXTURES ARE SYNTHETIC, WRITTEN IN THE MEASURED SHAPE. The owner ruled out
 * scraping on legal grounds; committing copied YouTube transcript text into the
 * repository is the same question wearing different clothes. The SHAPE is what
 * is under test -- an offset line, an accessibility label, a text line -- and
 * the words are deliberately not the measured ones.
 *
 * The measured specimen was 324 cues over ~34 minutes; these fixtures are small
 * but preserve the cadence that shape implies (a cue every few seconds), which
 * is what the density rule reads.
 */

// THE SHAPE THAT MATTERS: a start line, an accessibility label, the words.
const TRIPLE = [
  'Transcript',
  'Search transcript',
  '0:00',
  '0 seconds',
  'Welcome back to the workshop.',
  '0:06',
  '6 seconds',
  'Today we are testing a small pump.',
  '0:13',
  '13 seconds',
  'The reading was thirty five litres per minute.',
].join('\n');

// THE SAME CUES, COLLAPSED. Only one of the two shapes is measured, so the
// other is accepted; this must produce IDENTICAL cues.
const COLLAPSED = [
  'Transcript',
  '0:00  Welcome back to the workshop.',
  '0:06  Today we are testing a small pump.',
  '0:13  The reading was thirty five litres per minute.',
].join('\n');

/**
 * The single expected array both shapes are asserted against. NOT a second
 * hand-written copy -- asserting the collapsed form against its own expectations
 * would let the two drift apart silently.
 */
const EXPECTED_CUES: readonly KnowledgeTranscriptCue[] = [
  { index: 0, startMs: 0, endMs: 6_000, text: 'Welcome back to the workshop.' },
  { index: 1, startMs: 6_000, endMs: 13_000, text: 'Today we are testing a small pump.' },
  { index: 2, startMs: 13_000, endMs: 19_500, text: 'The reading was thirty five litres per minute.' },
];

const parse = (source: string) => parseKnowledgeTranscript(source, 'youtube-panel');

describe('the panel triple parses to cues', () => {
  it('produces the right count, starts and text', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues.map((cue) => ({ index: cue.index, startMs: cue.startMs, text: cue.text })))
      .toEqual(EXPECTED_CUES.map((cue) => ({ index: cue.index, startMs: cue.startMs, text: cue.text })));
    expect(result.value.format).toBe('youtube-panel');
  });

  it('the collapsed one-line shape parses to the IDENTICAL cues', () => {
    const triple = parse(TRIPLE);
    const collapsed = parse(COLLAPSED);
    expect(triple.ok && collapsed.ok).toBe(true);
    if (!triple.ok || !collapsed.ok) return;
    // Asserted against the shared expected array, not a second copy.
    expect(collapsed.value.cues).toEqual(triple.value.cues);
    expect(triple.value.cues).toEqual(EXPECTED_CUES);
  });
});

describe('timestamps', () => {
  it('accepts h:mm:ss, which the measured specimen never produced', () => {
    // Its absence in the specimen is not evidence it does not occur.
    const result = parse([
      '1:02:03',
      '1 hour, 2 minutes, 3 seconds',
      'An hour in, and still going.',
      '1:02:09',
      'An hour, two minutes and nine seconds',
      'A second cue after the hour mark.',
    ].join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues[0].startMs).toBe(((1 * 60 + 2) * 60 + 3) * 1000);
  });

  it('rejects a minute value of 90 rather than reading it as an hour and a half', () => {
    // parseKnowledgeTranscriptTimestamp already owns this rule; the panel
    // parser must not soften it by accepting the line as text.
    const result = parse(['90:00', 'Ninety minutes is not a legal timestamp.', 'Some words.'].join('\n'));
    // There is no valid timestamp anywhere, so this is the no-timestamp failure.
    expect(result.ok).toBe(false);
  });
});

describe('lines that are not text', () => {
  it('discards panel header lines before the first timestamp', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues[0].text).toBe('Welcome back to the workshop.');
    expect(JSON.stringify(result.value.cues)).not.toContain('Search transcript');
    expect(JSON.stringify(result.value.cues)).not.toContain('Transcript"');
  });

  it('discards accessibility labels and never lets them become cue text', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const cue of result.value.cues) {
      expect(cue.text).not.toMatch(/^\d+ seconds?$/);
      expect(cue.text).not.toMatch(/^\d+ minutes?/);
    }
  });

  it('keeps a text line that merely CONTAINS a duration', () => {
    // The accessibility recogniser is anchored, so an ordinary sentence with a
    // number in it is text, not a label.
    const result = parse(['0:00', 'I waited 5 seconds for the pump to prime.'].join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues[0].text).toBe('I waited 5 seconds for the pump to prime.');
  });
});

describe('derived cue ends', () => {
  it('sets each cue end to the next cue start', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues[0].endMs).toBe(result.value.cues[1].startMs);
    expect(result.value.cues[1].endMs).toBe(result.value.cues[2].startMs);
  });

  it('gives the final cue the median of this transcript own derived durations', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Derived durations are 6000 and 7000; the median rounds to 6500.
    const last = result.value.cues[result.value.cues.length - 1];
    expect(last.endMs).toBe(last.startMs + 6_500);
    // NON-ZERO, so a range at its start can still intersect it.
    expect(last.endMs).toBeGreaterThan(last.startMs);
  });

  it('marks ends as derived', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.endsAreDerived).toBe(true);
  });

  it('the final cue is REACHABLE by cuesIntersectingRange', () => {
    // A tail cue a citation can never intersect is a silent hole. The range
    // here sits at the last cue's start, which is what a citation would name.
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Place the cues in the canonical text exactly as the document builder
    // would, then ask the citation layer whether the tail can be reached.
    let canonicalText = '';
    const placed = result.value.cues.map((cue) => {
      if (canonicalText.length > 0) canonicalText += '\n';
      const charStart = canonicalText.length;
      canonicalText += cue.text;
      return { ...cue, charStart, charEnd: canonicalText.length };
    });
    const representation = knowledgeTranscriptStoredRepresentation({
      cues: placed,
      videoIdentity: null,
      language: null,
      trackKind: 'unknown',
      format: 'plain',
    });
    const tail = placed[placed.length - 1];
    const intersecting = cuesIntersectingRange(representation, tail.charStart, tail.charEnd);
    expect(intersecting.map((cue) => cue.startMs)).toContain(tail.startMs);
  });
});

describe('a single cue', () => {
  it('uses the stated fallback for a lone cue, and stays reachable', () => {
    const result = parse(['0:00', '0 seconds', 'One line only.'].join('\n'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues).toHaveLength(1);
    expect(result.value.cues[0].endMs).toBe(2_000);
  });
});

describe('provenance fields', () => {
  it('declares no language, and never infers one', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.declaredLanguage).toBeNull();
  });

  it('numbers cues by position from 0, not by a number from the input', () => {
    const result = parse(TRIPLE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues.map((cue) => cue.index)).toEqual([0, 1, 2]);
  });
});

describe('a summary is refused, by density', () => {
  // Coarse ranges over a long span, exactly the shape of the first specimen
  // offered: a few timestamps, minutes apart.
  const SUMMARY = [
    'Cincinnati Dishroom Visit (0:00 - 5:05)',
    '0:00',
    'Introduction and arrival.',
    '5:05',
    'The dishroom walkthrough.',
    '12:30',
    'Questions and wrap up.',
  ].join('\n');

  it('is refused', () => {
    expect(parse(SUMMARY).ok).toBe(false);
  });

  it('is refused with a message that NAMES the reason, not a generic failure', () => {
    const result = parse(SUMMARY);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/summary/i);
    expect(result.error.message).not.toMatch(/^This does not look like a transcript/i);
  });
});

describe('POSITIVE CONTROL: a short legitimate transcript is ACCEPTED', () => {
  // ~40 seconds, 6 cues -- the case most likely to be wrongly refused, and the
  // test that stops the density rule from being satisfied by one that refuses
  // everything. If this and the summary test disagree, the THRESHOLD bends; the
  // criterion does not.
  const SHORT_CLIP = [
    '0:00',
    '0 seconds',
    'First thing said in the clip.',
    '0:07',
    '7 seconds',
    'Second thing said in the clip.',
    '0:14',
    '14 seconds',
    'Third thing said in the clip.',
    '0:21',
    '21 seconds',
    'Fourth thing said in the clip.',
    '0:28',
    '28 seconds',
    'Fifth thing said in the clip.',
    '0:35',
    '35 seconds',
    'Sixth and final thing said.',
  ].join('\n');

  it('parses to six cues', () => {
    const result = parse(SHORT_CLIP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues).toHaveLength(6);
    expect(result.value.cues[0].startMs).toBe(0);
    expect(result.value.cues[5].startMs).toBe(35_000);
  });
});

describe('malformed input fails specifically', () => {
  it('reports a paste with no timestamp at all distinctly', () => {
    const result = parse('Just some prose with no timestamps anywhere in it.');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/does not look like a transcript/i);
  });

  it('reports a paste whose timestamps carry no words distinctly', () => {
    const result = parse(['0:00', '0 seconds', '0:06', '6 seconds'].join('\n'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toMatch(/no words/i);
  });
});

describe('the other transcript formats are untouched', () => {
  it('an SRT parse does NOT carry endsAreDerived', () => {
    // Absent means "the source declared them". Asserted with hasOwnProperty
    // because toEqual treats an absent key and undefined as equal.
    const srt = ['1', '00:00:01,000 --> 00:00:03,000', 'Hello there.'].join('\n');
    const result = parseKnowledgeTranscript(srt, 'srt');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.prototype.hasOwnProperty.call(result.value, 'endsAreDerived')).toBe(false);
  });

  it('plain text still produces no cues', () => {
    const result = parseKnowledgeTranscript('No timings at all here.', 'plain');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues).toEqual([]);
  });
});

describe('a caption FILE pasted as a panel copy is refused, not half-read', () => {
  /**
   * FOUND BY MEASUREMENT, 2026-09-22, against this parser as shipped in Part A.
   *
   * Ordinary SRT returned **ok** with two cues whose text was the cue-range
   * arrow and the end time -- `"--> 00:00:04,000"` -- while the spoken words
   * were discarded. The range line matched the collapsed `timestamp text`
   * shape, so the rest of the line became "what was said".
   *
   * A success carrying a transcript in which nobody said anything except a row
   * of timestamps is worse than any failure: every citation built on it
   * resolves, renders, and quotes punctuation. Part B is what made this
   * reachable -- it put 'youtube-panel' in the format dropdown, where before
   * no user could select it.
   */
  const SRT = '1\n00:00:01,000 --> 00:00:04,000\nHello there\n\n2\n00:00:05,000 --> 00:00:09,000\nSecond line\n';
  const VTT = 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHello there\n\n00:00:05.000 --> 00:00:09.000\nSecond\n';

  it('refuses SRT rather than returning cues made of timestamps', () => {
    const result = parseKnowledgeTranscript(SRT, 'youtube-panel');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // The message must name the fix. "Choose a different format" is one click;
    // a generic parse failure sends them back to re-copy a transcript that was
    // never the problem.
    expect(result.error.message).toContain('SRT');
    expect(result.error.message).toContain('WebVTT');
  });

  it('refuses WebVTT, recognised by its header as well as its arrows', () => {
    const result = parseKnowledgeTranscript(VTT, 'youtube-panel');
    expect(result.ok).toBe(false);
  });

  it('refuses a WEBVTT header even with no cue-range arrow present', () => {
    expect(parseKnowledgeTranscript('WEBVTT\n\n0:00\nHello\n', 'youtube-panel').ok).toBe(false);
  });

  it('SRT and VTT still parse correctly under their OWN formats', () => {
    // The refusal above must not be mistaken for these files being unreadable.
    // This application parses them properly; the paste was simply labelled
    // with the wrong format.
    const srt = parseKnowledgeTranscript(SRT, 'srt');
    expect(srt.ok).toBe(true);
    expect(srt.ok && srt.value.cues.map((cue) => cue.text)).toEqual(['Hello there', 'Second line']);

    const vtt = parseKnowledgeTranscript(VTT, 'vtt');
    expect(vtt.ok).toBe(true);
    expect(vtt.ok && vtt.value.cues.map((cue) => cue.text)).toEqual(['Hello there', 'Second']);
  });

  it('does NOT refuse a genuine panel copy whose words contain an arrow-like dash', () => {
    // The marker is `-->`, which the panel never produces. Ordinary dashes and
    // punctuation in speech must keep parsing.
    const panel = '0:00\nWell -- as I was saying -> the point is this\n0:06\nand then we moved on\n';
    const result = parseKnowledgeTranscript(panel, 'youtube-panel');
    expect(result.ok).toBe(true);
    expect(result.ok && result.value.cues[0].text).toBe('Well -- as I was saying -> the point is this');
  });
});

describe('the REAL clipboard shape, measured at last', () => {
  /**
   * SETTLED 2026-09-22, BY A REAL PASTE FROM A REAL VIDEO.
   *
   * Everything before this was measured from the panel's RENDERED text, which
   * §9 of the acquisition note was careful to call a proxy for -- not proof of
   * -- what the clipboard receives. The open question was whether the
   * accessibility label ("8 seconds") survives a copy.
   *
   * IT DOES NOT. What the clipboard actually carries is the timestamp on its
   * own line and the text on the next, with no label between them:
   *
   *     0:58
   *     of the
   *     0:59
   *     bumper at all it can be stay
   *
   * So the parser accepting BOTH shapes was the right call and needs no change
   * now that one of them is confirmed -- which was the stated test of that
   * decision: "the parser must not need changing if it is the other one."
   *
   * The words below are re-typed from the owner's own screen rather than
   * copied from YouTube, and are kept short deliberately: committing
   * third-party transcript text is the scraping question in different clothes.
   */
  const REAL_PASTE = [
    '0:55', "you don't have to remove the other side",
    '0:58', 'of the',
    '0:59', 'bumper at all it can be stay',
    '1:02', "fixed there it's a little bit faster",
  ].join('\n');

  it('parses the timestamp-then-text pairs with no accessibility label', () => {
    const result = parseKnowledgeTranscript(REAL_PASTE, 'youtube-panel');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.cues.map((cue) => [cue.startMs, cue.text])).toEqual([
      [55_000, "you don't have to remove the other side"],
      [58_000, 'of the'],
      [59_000, 'bumper at all it can be stay'],
      [62_000, "fixed there it's a little bit faster"],
    ]);
  });

  it('chains each end to the next start, and gives the last one the median', () => {
    const result = parseKnowledgeTranscript(REAL_PASTE, 'youtube-panel');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const cues = result.value.cues;
    expect(cues.map((cue) => cue.endMs)).toEqual([58_000, 59_000, 62_000, 65_000]);
    // 3s, 1s, 3s -> median 3s. Data from this transcript, not a constant.
    expect(cues[3].endMs - cues[3].startMs).toBe(3_000);
    expect(result.value.endsAreDerived).toBe(true);
  });

  it('is NOT refused by the density rule -- 4 cues across 7 seconds', () => {
    // The positive control, now with real data: a short genuine excerpt must
    // pass, or the summary rule is just refusing everything.
    expect(parseKnowledgeTranscript(REAL_PASTE, 'youtube-panel').ok).toBe(true);
  });
});
