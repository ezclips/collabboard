/**
 * The ten tests the amendment owed, plus the parser behaviour they rest on.
 *
 * The versioning ones are the point: a transcript's version must change when
 * its TIMING changes even though its words did not, and must NOT change when
 * only the file's spelling of those timings changed. Those two pull in
 * opposite directions, so both are asserted, and a text-only control sits
 * beside them so a hash that changed for any reason at all cannot pass.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  parseKnowledgeTranscript,
  parseKnowledgeTranscriptTimestamp,
} from './knowledgeTranscriptCues';
import {
  buildKnowledgeTranscriptDocument,
  cueAtOffset,
  enforceKnowledgeTranscriptLimits,
  groupKnowledgeTranscriptWindows,
  KNOWLEDGE_TRANSCRIPT_MAX_CUES,
  KNOWLEDGE_TRANSCRIPT_MAX_PAYLOAD_BYTES,
  KNOWLEDGE_TRANSCRIPT_MAX_TEXT_UNITS,
} from './knowledgeTranscriptDocument';
import {
  knowledgeTranscriptStoredRepresentation,
  knowledgeTranscriptVersionBytes,
  knowledgeTranscriptVersionBytesFromStored,
  knowledgeTranscriptVersionRepresentation,
} from './knowledgeTranscriptVersion';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Parses, places and hashes in one step, the way the importer will. */
function versionOf(source: string, format: 'srt' | 'vtt', videoIdentity: string | null = null) {
  const parsed = parseKnowledgeTranscript(source, format);
  if (!parsed.ok) throw new Error(`parse refused: ${parsed.error.message}`);
  const doc = buildKnowledgeTranscriptDocument(parsed.value.cues, format);
  return {
    parsed: parsed.value,
    doc,
    hash: sha(knowledgeTranscriptVersionBytes({
      canonicalText: doc.canonicalText,
      cues: doc.cues,
      videoIdentity,
    })),
  };
}

const SRT = [
  '1',
  '00:00:01,000 --> 00:00:03,500',
  'We begin at the back beam.',
  '',
  '2',
  '00:00:03,000 --> 00:00:06,000',
  'The warp is under even tension.',
  '',
].join('\n');

/** The same cues, same instants, spelled the WebVTT way. */
const VTT = [
  'WEBVTT',
  '',
  '00:00:01.000 --> 00:00:03.500',
  'We begin at the back beam.',
  '',
  '00:00:03.000 --> 00:00:06.000',
  'The warp is under even tension.',
  '',
].join('\n');

describe('timestamp parsing', () => {
  it('reads equivalent spellings of one instant as one number', () => {
    // `.5` is five hundred milliseconds. Reading it as five would put every
    // citation in the file very slightly early, invisibly.
    expect(parseKnowledgeTranscriptTimestamp('00:00:01,500')).toBe(1500);
    expect(parseKnowledgeTranscriptTimestamp('00:00:01.500')).toBe(1500);
    expect(parseKnowledgeTranscriptTimestamp('0:00:01.500')).toBe(1500);
    expect(parseKnowledgeTranscriptTimestamp('00:01.5')).toBe(1500);
    expect(parseKnowledgeTranscriptTimestamp('01:00:00.000')).toBe(3_600_000);
  });

  it('refuses a timestamp that is not one', () => {
    expect(parseKnowledgeTranscriptTimestamp('00:90:00,000')).toBeNull();
    expect(parseKnowledgeTranscriptTimestamp('banana')).toBeNull();
  });
});

describe('the version hash', () => {
  it('1. equivalent formatting hashes identically', () => {
    // SRT commas vs WebVTT dots, and the header line, are spelling. The same
    // words at the same instants are the same version.
    expect(versionOf(SRT, 'srt').hash).toBe(versionOf(VTT, 'vtt').hash);
  });

  it('1b. CRLF, a trailing newline and leading zeros do not change the version', () => {
    const crlf = SRT.replace(/\n/g, '\r\n');
    const padded = `${SRT}\n\n`;
    const shortHours = SRT.replace(/00:00:0/g, '0:00:0');
    const base = versionOf(SRT, 'srt').hash;
    expect(versionOf(crlf, 'srt').hash).toBe(base);
    expect(versionOf(padded, 'srt').hash).toBe(base);
    expect(versionOf(shortHours, 'srt').hash).toBe(base);
  });

  it('2. a timing-only change produces a different version', () => {
    // THE CASE THE WHOLE DECISION EXISTS FOR. Identical words; one cue moved
    // by a single millisecond.
    const shifted = SRT.replace('00:00:03,000', '00:00:03,001');
    const before = versionOf(SRT, 'srt');
    const after = versionOf(shifted, 'srt');
    expect(after.doc.canonicalText).toBe(before.doc.canonicalText);
    expect(after.hash).not.toBe(before.hash);
  });

  it('3. a changed video association produces a different version', () => {
    const a = versionOf(SRT, 'srt', 'video-a');
    const b = versionOf(SRT, 'srt', 'video-b');
    const none = versionOf(SRT, 'srt', null);
    expect(a.hash).not.toBe(b.hash);
    expect(a.hash).not.toBe(none.hash);
  });

  it('4. a text-only change produces a different version (control)', () => {
    // The control: without it, a hash that changed for any reason whatever
    // would satisfy test 2.
    const reworded = SRT.replace('even tension', 'even tensions');
    expect(versionOf(reworded, 'srt').hash).not.toBe(versionOf(SRT, 'srt').hash);
  });

  it('5. reordering cues produces a different version', () => {
    const swapped = [
      '1', '00:00:03,000 --> 00:00:06,000', 'The warp is under even tension.', '',
      '2', '00:00:01,000 --> 00:00:03,500', 'We begin at the back beam.', '',
    ].join('\n');
    expect(versionOf(swapped, 'srt').hash).not.toBe(versionOf(SRT, 'srt').hash);
  });

  it('declares its units, and text carrying framing characters is still framed', () => {
    // WHAT THIS DOES NOT CLAIM. An earlier version of this test asserted that
    // the length prefix prevents a forged-framing collision. It passed with
    // the prefix removed -- it was vacuous, comparing two transcripts that
    // differ in their text and so hash differently either way. The collision
    // was then attempted properly and COULD NOT BE CONSTRUCTED: the cue block
    // is a suffix determined by the real cues, so text that swallows another
    // transcript's framing still leaves its own cue block behind it.
    //
    // So the prefix is precautionary, not load-bearing, and what is asserted
    // here is only what is true: the units are declared in the output, and
    // they are the two different numbers they should be for non-ASCII text.
    const parsed = parseKnowledgeTranscript(
      ['1', '00:00:01,000 --> 00:00:02,000', 'sett\tis\nnormal — ü', ''].join('\n'),
      'srt',
    );
    if (!parsed.ok) throw new Error('parse refused');
    const doc = buildKnowledgeTranscriptDocument(parsed.value.cues, 'srt');
    const representation = knowledgeTranscriptVersionRepresentation({
      canonicalText: doc.canonicalText, cues: doc.cues, videoIdentity: null,
    });
    const utf8 = new TextEncoder().encode(doc.canonicalText).length;
    expect(utf8).toBeGreaterThan(doc.canonicalText.length);
    expect(representation).toContain(`utf8-bytes=${utf8}`);
    expect(representation).toContain(`utf16-units=${doc.canonicalText.length}`);
    expect(representation).toContain('offsets=utf16');
  });

  it('8. re-hashes from the stored representation alone, with no parser', () => {
    const { doc, hash } = versionOf(SRT, 'srt', 'video-a');
    const stored = knowledgeTranscriptStoredRepresentation({
      cues: doc.cues,
      videoIdentity: 'video-a',
      language: null,
      trackKind: 'unknown',
      format: 'srt',
    });
    const rebuilt = knowledgeTranscriptVersionBytesFromStored(stored, doc.canonicalText);
    expect(rebuilt).not.toBeNull();
    expect(sha(rebuilt as Uint8Array)).toBe(hash);
  });

  it('refuses to re-hash a representation written by a newer layout', () => {
    const { doc } = versionOf(SRT, 'srt');
    const stored = {
      ...knowledgeTranscriptStoredRepresentation({
        cues: doc.cues, videoIdentity: null, language: null, trackKind: 'unknown' as const, format: 'srt' as const,
      }),
      representationVersion: 99,
    };
    // Silently re-hashing under this layout would report a content change
    // that never happened.
    expect(knowledgeTranscriptVersionBytesFromStored(stored, doc.canonicalText)).toBeNull();
  });
});

describe('cues, order and overlap', () => {
  it('6. overlapping cues survive a round trip unchanged', () => {
    // Cue 2 starts before cue 1 ends. That is normal and must be preserved.
    const { doc } = versionOf(SRT, 'srt');
    expect(doc.cues[0].endMs).toBe(3500);
    expect(doc.cues[1].startMs).toBe(3000);
    expect(doc.cues[1].startMs).toBeLessThan(doc.cues[0].endMs);
    // Overlapping in time, disjoint in characters -- which is what lets both
    // be cited separately.
    expect(doc.cues[1].charStart).toBeGreaterThanOrEqual(doc.cues[0].charEnd);
  });

  it('7. repeated cue text is stored twice, verbatim', () => {
    const rolling = [
      '1', '00:00:01,000 --> 00:00:02,000', 'the warp is beamed', '',
      '2', '00:00:02,000 --> 00:00:03,000', 'the warp is beamed', '',
    ].join('\n');
    const { doc } = versionOf(rolling, 'srt');
    expect(doc.cues).toHaveLength(2);
    expect(doc.cues[0].text).toBe('the warp is beamed');
    expect(doc.cues[1].text).toBe('the warp is beamed');
    // Two distinct character ranges, so each repetition can be cited at its
    // own moment. De-duplicating would leave the second with nothing to key on.
    expect(doc.cues[1].charStart).not.toBe(doc.cues[0].charStart);
  });

  it('keeps file order rather than sorting by time', () => {
    const outOfOrder = [
      '1', '00:00:09,000 --> 00:00:10,000', 'later', '',
      '2', '00:00:01,000 --> 00:00:02,000', 'earlier', '',
    ].join('\n');
    const { doc } = versionOf(outOfOrder, 'srt');
    expect(doc.cues.map((c) => c.text)).toEqual(['later', 'earlier']);
  });

  it('refuses a cue that ends before it starts', () => {
    const bad = ['1', '00:00:05,000 --> 00:00:01,000', 'impossible', ''].join('\n');
    const result = parseKnowledgeTranscript(bad, 'srt');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain('ends before it starts');
  });

  it('keeps a zero-duration cue', () => {
    const zero = ['1', '00:00:04,000 --> 00:00:04,000', 'a beat', ''].join('\n');
    const parsed = parseKnowledgeTranscript(zero, 'srt');
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.cues).toHaveLength(1);
  });

  it('reads a declared language and never guesses one', () => {
    const withLanguage = ['WEBVTT', 'Language: de', '', '00:00:01.000 --> 00:00:02.000', 'Guten Tag', ''].join('\n');
    const parsedDe = parseKnowledgeTranscript(withLanguage, 'vtt');
    expect(parsedDe.ok && parsedDe.value.declaredLanguage).toBe('de');
    // German words, no declaration: the answer is unknown, not "de".
    const undeclared = parseKnowledgeTranscript(
      ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Guten Tag', ''].join('\n'), 'vtt',
    );
    expect(undeclared.ok && undeclared.value.declaredLanguage).toBeNull();
  });
});

describe('windows', () => {
  it('derives bounds from the cues it contains, not from its last cue', () => {
    // Cue 1 ends AFTER cue 2 does. Taking the last cue's end would cut the
    // window short by two seconds and mis-time anything built on it.
    const overlapping = [
      '1', '00:00:00,000 --> 00:00:10,000', 'long overlapping line', '',
      '2', '00:00:01,000 --> 00:00:08,000', 'shorter inner line', '',
    ].join('\n');
    const parsed = parseKnowledgeTranscript(overlapping, 'srt');
    if (!parsed.ok) throw new Error('parse refused');
    const doc = buildKnowledgeTranscriptDocument(parsed.value.cues, 'srt');
    const [window] = groupKnowledgeTranscriptWindows(doc, 45_000);
    expect(window.startMs).toBe(0);
    expect(window.endMs).toBe(10_000);
    expect(doc.cues[doc.cues.length - 1].endMs).toBe(8_000);
  });

  it('gives an oversized cue its own window rather than splitting it', () => {
    const long = [
      '1', '00:00:00,000 --> 00:01:30,000', 'a very long single cue', '',
      '2', '00:01:30,000 --> 00:01:32,000', 'a normal cue', '',
    ].join('\n');
    const parsed = parseKnowledgeTranscript(long, 'srt');
    if (!parsed.ok) throw new Error('parse refused');
    const doc = buildKnowledgeTranscriptDocument(parsed.value.cues, 'srt');
    const windows = groupKnowledgeTranscriptWindows(doc, 45_000);
    expect(windows[0].cues).toHaveLength(1);
    expect(windows[0].oversizedCue).toBe(true);
    expect(windows[0].charStart).toBe(doc.cues[0].charStart);
    expect(windows[0].charEnd).toBe(doc.cues[0].charEnd);
  });

  it('maps a character offset back to the cue that carries its timestamp', () => {
    const { doc } = versionOf(SRT, 'srt');
    const inSecond = doc.cues[1].charStart + 3;
    expect(cueAtOffset(doc, inSecond)?.startMs).toBe(3000);
    expect(cueAtOffset(doc, 0)?.startMs).toBe(1000);
  });

  it('has no cue, and therefore no timestamp, for plain text', () => {
    const doc = buildKnowledgeTranscriptDocument([], 'plain', 'just words');
    expect(doc.cues).toHaveLength(0);
    // Null, never a guessed zero -- a zero would link to the start of a video
    // as though that were where the words were said.
    expect(cueAtOffset(doc, 4)).toBeNull();
  });
});

describe('9. resource limits, at the boundary', () => {
  const at = (over: Partial<{ payloadBytes: number; cueCount: number; textUnits: number }>) =>
    enforceKnowledgeTranscriptLimits({
      payloadBytes: 0, cueCount: 0, textUnits: 0, ...over,
    });

  it('accepts each limit exactly at its edge', () => {
    expect(at({ payloadBytes: KNOWLEDGE_TRANSCRIPT_MAX_PAYLOAD_BYTES }).ok).toBe(true);
    expect(at({ cueCount: KNOWLEDGE_TRANSCRIPT_MAX_CUES }).ok).toBe(true);
    expect(at({ textUnits: KNOWLEDGE_TRANSCRIPT_MAX_TEXT_UNITS }).ok).toBe(true);
  });

  it('refuses each limit one unit past its edge, naming which', () => {
    const payload = at({ payloadBytes: KNOWLEDGE_TRANSCRIPT_MAX_PAYLOAD_BYTES + 1 });
    const cues = at({ cueCount: KNOWLEDGE_TRANSCRIPT_MAX_CUES + 1 });
    const units = at({ textUnits: KNOWLEDGE_TRANSCRIPT_MAX_TEXT_UNITS + 1 });
    expect(payload.ok).toBe(false);
    expect(cues.ok).toBe(false);
    expect(units.ok).toBe(false);
    if (payload.ok || cues.ok || units.ok) return;
    expect(payload.error.message).toContain('too large');
    expect(cues.error.message).toContain('too many cues');
    expect(units.error.message).toContain('too much text');
  });
});
