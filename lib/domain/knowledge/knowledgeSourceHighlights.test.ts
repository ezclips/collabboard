import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  knowledgeSourceHighlightSegments,
  knowledgeSourceHighlightSpans,
} from './knowledgeSourceHighlights';
import type { SourceReference } from './knowledgePersistence';

const PAGE = 'alpha bravo charlie delta';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';

let sequence = 0;

/** A stored citation. Offsets default to a page-only (pre-B4) row. */
function reference(overrides: Partial<SourceReference> = {}): SourceReference {
  sequence += 1;
  return {
    id: `reference-${sequence}`,
    targetPadletId: `padlet-${sequence}`,
    sourceDocumentId: DOCUMENT,
    pageStart: 1,
    pageEnd: 1,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
  } as unknown as SourceReference;
}

/** An exact span whose quote genuinely matches the offsets it claims. */
function exact(start: number, end: number, overrides: Partial<SourceReference> = {}, pageText = PAGE) {
  return reference({ charStart: start, charEnd: end, quoteText: pageText.slice(start, end), ...overrides });
}

const spansOf = (references: readonly SourceReference[], pageText = PAGE, pageNumber = 1) =>
  knowledgeSourceHighlightSpans(references, pageNumber, pageText);

const segmentsOf = (references: readonly SourceReference[], pageText = PAGE, pageNumber = 1) =>
  knowledgeSourceHighlightSegments(references, pageNumber, pageText);

/** The invariant every result must satisfy: the page, rebuilt exactly. */
function expectReconstructs(references: readonly SourceReference[], pageText = PAGE, pageNumber = 1) {
  const segments = segmentsOf(references, pageText, pageNumber);
  expect(segments.map((segment) => segment.text).join('')).toBe(pageText);
  return segments;
}

/** Every highlighted run, as [start,end,count] triples. */
const shape = (references: readonly SourceReference[], pageText = PAGE, pageNumber = 1) =>
  segmentsOf(references, pageText, pageNumber).map((segment) => [segment.start, segment.end, segment.spans.length]);

describe('P6J-F6-B4-B3 knowledge source highlights', () => {
  it('A: no references leaves the page whole and unhighlighted', () => {
    const segments = expectReconstructs([]);

    expect(segments).toHaveLength(1);
    expect(segments[0]).toMatchObject({ start: 0, end: PAGE.length, text: PAGE });
    expect(segments[0].spans).toEqual([]);
    expect(spansOf([])).toEqual([]);
  });

  it('A: an empty page produces no segments and still reconstructs', () => {
    expect(segmentsOf([exact(0, 5)], '')).toEqual([]);
    expect(segmentsOf([], '').map((segment) => segment.text).join('')).toBe('');
  });

  it('B: a legacy page-only row whose quote IS the page highlights nothing', () => {
    // The exact shape every pre-B4 citation has on disk.
    const legacy = reference({ quoteText: PAGE, charStart: null, charEnd: null });

    expect(spansOf([legacy])).toEqual([]);
    const segments = expectReconstructs([legacy]);
    expect(segments).toHaveLength(1);
    expect(segments[0].spans).toEqual([]);
  });

  it('C: a direct-offset exact span highlights exactly its range', () => {
    const spans = spansOf([exact(6, 11)]);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ start: 6, end: 11, resolution: 'offset' });
    expect(PAGE.slice(spans[0].start, spans[0].end)).toBe('bravo');
    expect(shape([exact(6, 11)])).toEqual([[0, 6, 0], [6, 11, 1], [11, PAGE.length, 0]]);
  });

  it('D: a legitimate full-page exact span highlights the whole page', () => {
    const whole = exact(0, PAGE.length);

    const segments = expectReconstructs([whole]);
    expect(segments).toHaveLength(1);
    expect(segments[0].spans).toHaveLength(1);
    // The discriminator is the offsets, not the quote's length: this row and
    // the legacy row in B carry the SAME quoteText and differ only in offsets.
    expect(segments[0].spans[0]).toMatchObject({ start: 0, end: PAGE.length, resolution: 'offset' });
  });

  it('E: drifted offsets with a unique quote highlight the recovered location', () => {
    // Offsets point at 'alpha b'; the quote says 'charlie', which occurs once.
    const drifted = reference({ charStart: 0, charEnd: 7, quoteText: 'charlie' });

    const spans = spansOf([drifted]);

    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ start: 12, end: 19, resolution: 'quote_fallback' });
    expect(PAGE.slice(12, 19)).toBe('charlie');
    expectReconstructs([drifted]);
  });

  it('F: drifted offsets with a missing quote highlight nothing', () => {
    expect(spansOf([reference({ charStart: 0, charEnd: 7, quoteText: 'nowhere' })])).toEqual([]);
  });

  it('G: drifted offsets with an ambiguous quote highlight nothing', () => {
    // 'a' occurs many times: the citation cannot say which one it meant.
    expect(spansOf([reference({ charStart: 0, charEnd: 7, quoteText: 'a' })])).toEqual([]);
  });

  it('H: a half-specified offset pair highlights nothing', () => {
    for (const half of [{ charStart: 2, charEnd: null }, { charStart: null, charEnd: 8 }]) {
      // Carries a whole-page quote, exactly like a legacy row: recovering it by
      // quote would paint the entire page, which is the outcome to prevent.
      const malformed = reference({ ...half, quoteText: PAGE });
      expect(spansOf([malformed]), JSON.stringify(half)).toEqual([]);
      expectReconstructs([malformed]);
    }
  });

  it('I: a cross-page exact row highlights nothing', () => {
    expect(spansOf([exact(6, 11, { pageStart: 1, pageEnd: 2 })])).toEqual([]);
  });

  it('J: a reference for another page highlights nothing here', () => {
    expect(spansOf([exact(6, 11, { pageStart: 5, pageEnd: 5 })])).toEqual([]);
    expect(spansOf([exact(6, 11)], PAGE, 2)).toEqual([]);
  });

  it('K: two partially overlapping references segment into A, A+B, B', () => {
    const a = exact(2, 8);
    const b = exact(5, 11);

    const segments = expectReconstructs([a, b]);

    expect(segments.map((segment) => [segment.start, segment.end, segment.spans.length]))
      .toEqual([[0, 2, 0], [2, 5, 1], [5, 8, 2], [8, 11, 1], [11, PAGE.length, 0]]);
    // Membership, not merely counts: each run names the right citations.
    expect(segments[1].spans.map((span) => span.referenceId)).toEqual([a.id]);
    expect(segments[2].spans.map((span) => span.referenceId).sort()).toEqual([a.id, b.id].sort());
    expect(segments[3].spans.map((span) => span.referenceId)).toEqual([b.id]);
    expect(segments[2].text).toBe(PAGE.slice(5, 8));
  });

  it('L: identical ranges from two distinct references keep both relationships', () => {
    const first = exact(6, 11);
    const second = exact(6, 11);

    const segments = expectReconstructs([first, second]);

    const highlighted = segments.filter((segment) => segment.spans.length > 0);
    // One run of text, two citations -- never one citation, never duplicated text.
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].text).toBe('bravo');
    expect(highlighted[0].spans).toHaveLength(2);
    expect(new Set(highlighted[0].spans.map((span) => span.referenceId)).size).toBe(2);
    expect(new Set(highlighted[0].spans.map((span) => span.targetPadletId)).size).toBe(2);
  });

  it('M: a contained span reports the right membership at each boundary', () => {
    const outer = exact(2, 14);
    const inner = exact(6, 11);

    const segments = expectReconstructs([outer, inner]);

    expect(segments.map((segment) => [segment.start, segment.end, segment.spans.length]))
      .toEqual([[0, 2, 0], [2, 6, 1], [6, 11, 2], [11, 14, 1], [14, PAGE.length, 0]]);
    expect(segments[1].spans[0].referenceId).toBe(outer.id);
    expect(segments[3].spans[0].referenceId).toBe(outer.id);
  });

  it('N: a three-way overlap reconstructs the page exactly', () => {
    const references = [exact(0, 11), exact(6, 19), exact(9, 25)];

    const segments = expectReconstructs(references);

    expect(Math.max(...segments.map((segment) => segment.spans.length))).toBe(3);
    // Every character exactly once, in order.
    expect(segments.map((segment) => segment.text).join('')).toBe(PAGE);
    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index].start).toBe(segments[index - 1].end);
    }
  });

  it('O: adjacent spans lose and duplicate nothing at the seam', () => {
    const left = exact(0, 5);
    const right = exact(5, 11);

    const segments = expectReconstructs([left, right]);

    expect(segments.map((segment) => [segment.start, segment.end, segment.spans.length]))
      .toEqual([[0, 5, 1], [5, 11, 1], [11, PAGE.length, 0]]);
    expect(segments[0].text + segments[1].text).toBe(PAGE.slice(0, 11));
    expect(segments[0].spans[0].referenceId).toBe(left.id);
    expect(segments[1].spans[0].referenceId).toBe(right.id);
  });

  it('P: offsets stay UTF-16 code units across a surrogate pair', () => {
    const emojiPage = 'a😀b alpha';
    // '😀' occupies [1,3): two code units, one code point.
    const span = exact(0, 3, {}, emojiPage);

    const spans = spansOf([span], emojiPage);

    expect(spans[0]).toMatchObject({ start: 0, end: 3 });
    expect(emojiPage.slice(0, 3)).toBe('a😀');
    expect(Array.from('a😀')).toHaveLength(2);
    const segments = expectReconstructs([span], emojiPage);
    expect(segments[0].text).toBe('a😀');
  });

  it('Q: every representative case reconstructs the page exactly', () => {
    const cases: Array<readonly SourceReference[]> = [
      [],
      [reference({ quoteText: PAGE })],
      [exact(6, 11)],
      [exact(0, PAGE.length)],
      [exact(2, 8), exact(5, 11)],
      [exact(6, 11), exact(6, 11)],
      [exact(2, 14), exact(6, 11)],
      [exact(0, 11), exact(6, 19), exact(9, 25)],
      [exact(0, 5), exact(5, 11)],
      [reference({ charStart: 0, charEnd: 7, quoteText: 'charlie' })],
      [reference({ charStart: 2, charEnd: null, quoteText: PAGE })],
    ];
    for (const references of cases) {
      const segments = segmentsOf(references);
      expect(segments.map((segment) => segment.text).join(''), JSON.stringify(references.length)).toBe(PAGE);
    }
  });

  it('R: neither the reference list nor the page text is mutated', () => {
    const references = [exact(5, 11), exact(2, 8)];
    const before = JSON.parse(JSON.stringify(references));
    const order = references.map((entry) => entry.id);

    segmentsOf(references);
    spansOf(references);

    expect(JSON.parse(JSON.stringify(references))).toEqual(before);
    // Sorting happens on a local copy: the caller's order is untouched.
    expect(references.map((entry) => entry.id)).toEqual(order);
  });

  it('R: spans are ordered deterministically regardless of input order', () => {
    const a = exact(2, 8);
    const b = exact(5, 11);

    expect(spansOf([a, b]).map((span) => span.start)).toEqual([2, 5]);
    expect(spansOf([b, a]).map((span) => span.start)).toEqual([2, 5]);
  });

  it('S: the module is pure -- no React, no network, no storage, no persistence', () => {
    // Line comments only. The block-comment strip has destroyed live code in
    // this repository before and must never be used on production source.
    const source = fs
      .readFileSync(path.join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceHighlights.ts'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');

    expect(source.length).toBeGreaterThan(500);
    // Call/member shapes, not bare words: this file's prose legitimately
    // discusses insertion order and persistence, and a guard that tripped on
    // documentation would only teach the next author to reword the comment.
    for (const forbidden of [
      'react', 'fetch(', 'supabase', '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(',
      'localstorage', 'sessionstorage', 'window.', 'document.', 'process.',
    ]) {
      expect(source.toLowerCase(), forbidden).not.toContain(forbidden);
    }
    // It is allowed exactly the read-side authority and the persistence types.
    expect(source).toContain("from './knowledgeSourceSpanResolver'");
    expect(source).toContain('resolveKnowledgeSourceSpan(reference, pageNumber, pageText)');
  });

  it('S: the resolver is the sole authority -- no offset or quote logic is re-implemented', () => {
    const source = fs
      .readFileSync(path.join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceHighlights.ts'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');

    // No independent quote search, and no independent trust in raw offsets.
    // Member access again, so the prose above may name the fields it excludes.
    for (const forbidden of ['indexOf(', '.quoteText', '.charStart', '.charEnd', 'normalize', 'trim(']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
