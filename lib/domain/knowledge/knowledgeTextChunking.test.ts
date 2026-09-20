import { describe, expect, it } from 'vitest';

import {
  KNOWLEDGE_TEXT_CHUNK_MAX_CHARS,
  KNOWLEDGE_TEXT_CHUNK_MIN_CHARS,
  assertLosslessChunking,
  buildKnowledgeTextChunks,
  stitchKnowledgeTextRange,
} from './knowledgeTextChunking';

/**
 * Losslessness is the property everything downstream spends, so it is checked
 * on every input here rather than in one dedicated test: a citation names
 * character offsets into the SOURCE, and a single dropped newline puts every
 * later offset one character out, silently.
 */

const para = (n: number, fill: string) => fill.repeat(n);
const roundTrip = (source: string) => buildKnowledgeTextChunks(source).map((c) => c.text).join('');

/** Every case in this file goes through here. */
function chunk(source: string) {
  const chunks = buildKnowledgeTextChunks(source);
  expect(assertLosslessChunking(source, chunks)).toBeNull();
  expect(roundTrip(source)).toBe(source);
  return chunks;
}

describe('the slice is the chunk', () => {
  it('reproduces the source exactly, separators included', () => {
    const source = 'First paragraph.\n\nSecond paragraph.\n\n\nThird, after a wider gap.\n';
    const chunks = chunk(source);
    expect(chunks.map((c) => c.text).join('')).toBe(source);
  });

  it('every chunk text equals its own span', () => {
    const source = `${para(40, 'alpha beta ')}\n\n${para(40, 'gamma delta ')}`;
    for (const c of chunk(source)) {
      expect(c.text).toBe(source.slice(c.charStart, c.charEnd));
    }
  });

  it('spans are contiguous and cover the whole source', () => {
    const source = `${para(30, 'one two ')}\n\n${para(30, 'three four ')}\n\n${para(30, 'five six ')}`;
    const chunks = chunk(source);
    expect(chunks[0].charStart).toBe(0);
    expect(chunks[chunks.length - 1].charEnd).toBe(source.length);
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i].charStart).toBe(chunks[i - 1].charEnd);
    }
  });

  it('indexes are 0..n in order', () => {
    const source = `${para(50, 'word ')}\n\n${para(50, 'other ')}\n\n${para(50, 'third ')}`;
    expect(chunk(source).map((c) => c.chunkIndex)).toEqual([0, 1, 2].slice(0, chunk(source).length));
  });

  it('preserves CRLF and trailing whitespace rather than tidying them', () => {
    // A source is not reformatted on the way in. Normalising here would move
    // every offset relative to what the user's file actually contains.
    const source = 'Line one.\r\n\r\nLine two.\n\n   \n';
    expect(roundTrip(source)).toBe(source);
  });
});

describe('the paragraph budget', () => {
  it('groups small paragraphs up to the minimum', () => {
    const source = Array.from({ length: 12 }, (_, i) => `Short para ${i}.`).join('\n\n');
    const chunks = chunk(source);
    // Twelve tiny paragraphs must not become twelve chunks.
    expect(chunks.length).toBeLessThan(12);
    for (const c of chunks.slice(0, -1)) {
      expect(c.text.length).toBeGreaterThanOrEqual(KNOWLEDGE_TEXT_CHUNK_MIN_CHARS);
    }
  });

  it('closes a chunk rather than exceeding the maximum', () => {
    const source = Array.from({ length: 8 }, () => para(35, 'sentence ')).join('\n\n');
    for (const c of chunk(source)) {
      expect(c.text.length).toBeLessThanOrEqual(KNOWLEDGE_TEXT_CHUNK_MAX_CHARS);
    }
  });

  it('splits a single over-long paragraph at whitespace', () => {
    const source = para(200, 'word ');
    const chunks = chunk(source);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(KNOWLEDGE_TEXT_CHUNK_MAX_CHARS);
    // Split at whitespace: no chunk begins mid-word.
    for (const c of chunks.slice(1)) expect(c.text.startsWith('word')).toBe(true);
  });

  it('cuts a single unbroken run hard rather than blowing the budget', () => {
    // A URL or a base64 blob has no whitespace to cut at. A chunk over the
    // maximum would be worse than a cut, and the offsets stay exact either way.
    const source = 'x'.repeat(KNOWLEDGE_TEXT_CHUNK_MAX_CHARS * 2 + 50);
    const chunks = chunk(source);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(KNOWLEDGE_TEXT_CHUNK_MAX_CHARS);
  });

  it('the last chunk may be short -- there is nothing to merge it with', () => {
    // The first paragraph alone has to exceed the maximum, or the tail simply
    // joins it and there is no short last chunk to observe.
    const source = `${para(130, 'filler ')}\n\nTail.`;
    const chunks = chunk(source);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[chunks.length - 1].text.length).toBeLessThan(KNOWLEDGE_TEXT_CHUNK_MIN_CHARS);
  });
});

describe('a source with nothing in it indexes nothing', () => {
  it.each([
    ['empty', ''],
    ['spaces', '    '],
    ['newlines', '\n\n\n\n'],
    ['mixed whitespace', ' \t\r\n \n '],
  ])('%s produces no chunks', (_label, source) => {
    expect(buildKnowledgeTextChunks(source)).toEqual([]);
    expect(assertLosslessChunking(source, [])).toBeNull();
  });

  it('a single character is still a source', () => {
    expect(chunk('x')).toHaveLength(1);
  });
});

describe('the invariant refuses what it is there to refuse', () => {
  // Large enough to chunk more than once -- a single-chunk fixture cannot
  // exercise a gap between spans or an out-of-order index.
  const source = [para(60, 'alpha '), para(60, 'beta '), para(60, 'gamma ')].join('\n\n');
  const good = () => buildKnowledgeTextChunks(source).map((c) => ({ ...c }));

  it('the fixture really does produce several chunks', () => {
    expect(good().length).toBeGreaterThan(1);
  });

  it('accepts what the chunker produces', () => {
    expect(assertLosslessChunking(source, good())).toBeNull();
  });

  it('catches a dropped separator -- the defect that shifts every later offset', () => {
    const chunks = good();
    const broken = chunks.map((c, i) => (i === 0 ? { ...c, text: c.text.replace(/\n\n/, '') } : c));
    expect(assertLosslessChunking(source, broken)).toMatch(/does not match its own span/);
  });

  it('catches a gap between spans', () => {
    const chunks = good();
    if (chunks.length < 2) throw new Error('fixture needs at least two chunks');
    const broken = chunks.map((c, i) => (i === 1 ? { ...c, charStart: c.charStart + 1 } : c));
    expect(assertLosslessChunking(source, broken)).toMatch(/gap or overlap/);
  });

  it('catches short coverage -- a truncated source', () => {
    const chunks = good();
    expect(assertLosslessChunking(source, chunks.slice(0, -1))).toMatch(/Chunks cover \d+ of \d+/);
  });

  it('catches out-of-order indexes', () => {
    const chunks = good();
    if (chunks.length < 2) throw new Error('fixture needs at least two chunks');
    const broken = [...chunks].reverse();
    expect(assertLosslessChunking(source, broken)).toMatch(/not 0\.\.n in order/);
  });

  it('catches chunks produced for a source that had nothing in it', () => {
    // The span check fires first: an invented chunk cannot match a slice of an
    // empty source. Which message arrives matters less than that one does.
    expect(assertLosslessChunking('', [{ text: 'invented', charStart: 0, charEnd: 8, chunkIndex: 0 }]))
      .not.toBeNull();
  });

  it('catches nothing produced for a source that had something in it', () => {
    expect(assertLosslessChunking('real text', [])).toMatch(/produced nothing for a non-empty source/);
  });

  it('catches an empty span', () => {
    expect(assertLosslessChunking('abc', [{ text: '', charStart: 0, charEnd: 0, chunkIndex: 0 }]))
      .toMatch(/empty or inverted/);
  });
});

describe('real-shaped German text, because that is the reference corpus', () => {
  const source = [
    'Stossstange demontieren',
    '',
    'Zum Wechseln der Hupe am Audi A2 kann man die Stossstange nur auf einer Seite losschrauben.',
    '',
    'Die Schritte sind: Motorhaube ausbauen; rechte Fahrzeugseite aufbocken und das Rad abnehmen.',
    '',
    'Zum Loesen der Stossstange sind die Positionen oben mitte, unten und mitte zu beachten.',
  ].join('\n');

  it('round-trips exactly', () => {
    expect(roundTrip(source)).toBe(source);
  });

  it('keeps whole sentences together at this size', () => {
    const chunks = chunk(source);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe(source);
  });
});

describe('stitching a citation range back out of the chunks', () => {
  const source = [para(60, 'alpha '), para(60, 'beta '), para(60, 'gamma ')].join('\n\n');
  const stored = () => buildKnowledgeTextChunks(source).map((c) => ({ ...c }));

  it('returns exactly what the source held at that range', () => {
    for (const [start, end] of [[0, 10], [5, 400], [100, 900], [0, source.length]] as const) {
      expect(stitchKnowledgeTextRange(stored(), start, end)).toBe(source.slice(start, end));
    }
  });

  it('A RANGE THAT STRADDLES A CHUNK BOUNDARY COMES BACK WHOLE', () => {
    // The property Decision 0 spends: identity is char offsets into the
    // source, so a citation must not be limited to one chunk's text.
    const chunks = stored();
    expect(chunks.length).toBeGreaterThan(1);
    const boundary = chunks[0].charEnd;
    const start = boundary - 25;
    const end = boundary + 25;
    expect(stitchKnowledgeTextRange(chunks, start, end)).toBe(source.slice(start, end));
  });

  it('is insensitive to the order the rows arrive in', () => {
    const shuffled = [...stored()].reverse();
    expect(stitchKnowledgeTextRange(shuffled, 40, 500)).toBe(source.slice(40, 500));
  });

  it('REFUSES a range the chunks do not fully cover, rather than returning part of it', () => {
    // A citation that silently returns less than it names is a quotation the
    // reader believes is complete. Needs three chunks so a middle one exists
    // to remove -- the shared fixture above only produces two.
    const wide = Array.from({ length: 14 }, (_, i) => para(50, `p${i % 10} `)).join('\n\n');
    const chunks = buildKnowledgeTextChunks(wide).map((c) => ({ ...c }));
    expect(chunks.length).toBeGreaterThan(2);
    const missingMiddle = chunks.filter((_, i) => i !== 1);
    expect(stitchKnowledgeTextRange(missingMiddle, 0, wide.length)).toBeNull();
  });

  it('refuses a range past the end of the source', () => {
    expect(stitchKnowledgeTextRange(stored(), 0, source.length + 50)).toBeNull();
  });

  it('refuses a range before the start', () => {
    expect(stitchKnowledgeTextRange(stored(), -5, 20)).toBeNull();
  });

  it.each([
    ['inverted', 90, 10],
    ['empty', 40, 40],
    ['fractional', 1.5, 20],
  ])('refuses a %s range', (_label, start, end) => {
    expect(stitchKnowledgeTextRange(stored(), start, end)).toBeNull();
  });

  it('refuses a row whose text disagrees with its own span', () => {
    const tampered = stored().map((c, i) => (i === 0 ? { ...c, text: `${c.text}extra` } : c));
    expect(stitchKnowledgeTextRange(tampered, 0, 50)).toBeNull();
  });

  it('refuses when there are no chunks at all', () => {
    expect(stitchKnowledgeTextRange([], 0, 10)).toBeNull();
  });

  it('round-trips every chunk boundary in the document', () => {
    const chunks = stored();
    for (const c of chunks) {
      expect(stitchKnowledgeTextRange(chunks, c.charStart, c.charEnd)).toBe(c.text);
    }
  });
});
