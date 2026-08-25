import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  resolveKnowledgeSourceSpan,
  type KnowledgeSourceSpanReference,
} from './knowledgeSourceSpanResolver';

const PAGE = 'Alpha beta gamma. Delta epsilon zeta.';

function reference(overrides: Partial<KnowledgeSourceSpanReference> = {}): KnowledgeSourceSpanReference {
  return { pageStart: 1, pageEnd: 1, quoteText: null, charStart: null, charEnd: null, ...overrides };
}

/** A citation of `PAGE`'s "beta gamma", correctly anchored. */
const BETA_GAMMA = reference({ quoteText: 'beta gamma', charStart: 6, charEnd: 16 });

describe('A: page applicability', () => {
  it('ignores a citation whose range does not cover this page', () => {
    expect(resolveKnowledgeSourceSpan(reference({ pageStart: 2, pageEnd: 3 }), 1, PAGE))
      .toEqual({ kind: 'not_applicable' });
    expect(resolveKnowledgeSourceSpan(reference({ pageStart: 2, pageEnd: 3 }), 4, PAGE))
      .toEqual({ kind: 'not_applicable' });
  });

  it('applies on the first, a middle and the last covered page', () => {
    const spanning = reference({ pageStart: 2, pageEnd: 4 });
    for (const page of [2, 3, 4]) {
      expect(resolveKnowledgeSourceSpan(spanning, page, PAGE).kind, `page ${page}`).toBe('page_only');
    }
  });
});

describe('B: legacy page-only rows', () => {
  it('classifies null offsets as page-only even though the quote is the whole page', () => {
    // Exactly the shape every citation written before B4 has.
    const legacy = reference({ quoteText: PAGE, charStart: null, charEnd: null });
    expect(resolveKnowledgeSourceSpan(legacy, 1, PAGE)).toEqual({ kind: 'page_only' });
  });

  it('never promotes a whole-page quote to a whole-page highlight', () => {
    const legacy = reference({ quoteText: PAGE, charStart: null, charEnd: null });
    const result = resolveKnowledgeSourceSpan(legacy, 1, PAGE);
    expect(result.kind).not.toBe('exact_span');
  });

  it('is page-only with no quote at all', () => {
    expect(resolveKnowledgeSourceSpan(reference(), 1, PAGE)).toEqual({ kind: 'page_only' });
  });
});

describe('C: exact offsets', () => {
  it('resolves a matching slice by offset', () => {
    expect(resolveKnowledgeSourceSpan(BETA_GAMMA, 1, PAGE)).toEqual({
      kind: 'exact_span', start: 6, end: 16, text: 'beta gamma', resolution: 'offset',
    });
  });

  it('returns a range that reproduces the quote through slice', () => {
    const result = resolveKnowledgeSourceSpan(BETA_GAMMA, 1, PAGE);
    if (result.kind !== 'exact_span') throw new Error('expected an exact span');
    expect(PAGE.slice(result.start, result.end)).toBe(result.text);
  });

  it('accepts a span touching the very start and the very end of the page', () => {
    const whole = reference({ quoteText: PAGE, charStart: 0, charEnd: PAGE.length });
    expect(resolveKnowledgeSourceSpan(whole, 1, PAGE)).toMatchObject({
      kind: 'exact_span', start: 0, end: PAGE.length, resolution: 'offset',
    });
  });
});

describe('D/E: quote fallback', () => {
  it('D: recovers when the offsets point at the wrong text', () => {
    // The page gained a prefix, so the stored offsets now address other words.
    const shifted = 'PREFIX. ' + PAGE;
    expect(resolveKnowledgeSourceSpan(BETA_GAMMA, 1, shifted)).toEqual({
      kind: 'exact_span', start: 14, end: 24, text: 'beta gamma', resolution: 'quote_fallback',
    });
    expect(shifted.slice(14, 24)).toBe('beta gamma');
  });

  it('E: recovers when the offsets are out of bounds', () => {
    const far = reference({ quoteText: 'beta gamma', charStart: 9000, charEnd: 9010 });
    expect(resolveKnowledgeSourceSpan(far, 1, PAGE)).toEqual({
      kind: 'exact_span', start: 6, end: 16, text: 'beta gamma', resolution: 'quote_fallback',
    });
  });
});

describe('F/G/H: drift the quote cannot resolve', () => {
  it('F: reports a quote the page no longer contains', () => {
    const gone = reference({ quoteText: 'omicron', charStart: 6, charEnd: 13 });
    expect(resolveKnowledgeSourceSpan(gone, 1, PAGE)).toEqual({
      kind: 'drifted', reason: 'quote_not_found',
    });
  });

  it('G: refuses to guess between repeated occurrences', () => {
    const twice = 'ping pong ping pong';
    const ambiguous = reference({ quoteText: 'ping', charStart: 99, charEnd: 103 });
    expect(resolveKnowledgeSourceSpan(ambiguous, 1, twice)).toEqual({
      kind: 'drifted', reason: 'quote_ambiguous',
    });
  });

  it('H: counts OVERLAPPING occurrences -- "aa" in "aaa" occurs twice', () => {
    // The discriminating case. "aa" sits at 0 and at 1, and those are the ONLY
    // occurrences, so a scanner advancing by quote.length finds just one and
    // wrongly calls it unique. "aaaa" would not catch that bug: it also has
    // non-overlapping hits at 0 and 2.
    const overlapping = reference({ quoteText: 'aa', charStart: 50, charEnd: 52 });
    expect(resolveKnowledgeSourceSpan(overlapping, 1, 'aaa')).toEqual({
      kind: 'drifted', reason: 'quote_ambiguous',
    });
    expect(resolveKnowledgeSourceSpan(overlapping, 1, 'aaaa')).toEqual({
      kind: 'drifted', reason: 'quote_ambiguous',
    });
  });

  it('H: a genuinely unique quote is still resolved after the overlap check', () => {
    const unique = reference({ quoteText: 'aaa', charStart: 50, charEnd: 53 });
    expect(resolveKnowledgeSourceSpan(unique, 1, 'aaa')).toMatchObject({
      kind: 'exact_span', start: 0, end: 3, resolution: 'quote_fallback',
    });
  });
});

describe('I: the quote is required evidence', () => {
  it('reports offsets with no quote', () => {
    expect(resolveKnowledgeSourceSpan(reference({ quoteText: null, charStart: 6, charEnd: 16 }), 1, PAGE))
      .toEqual({ kind: 'drifted', reason: 'missing_quote' });
  });

  it('treats an empty quote as no quote', () => {
    expect(resolveKnowledgeSourceSpan(reference({ quoteText: '', charStart: 6, charEnd: 16 }), 1, PAGE))
      .toEqual({ kind: 'drifted', reason: 'missing_quote' });
  });
});

describe('J: cross-page spans are not supported yet', () => {
  it('refuses an offset candidate whose pages differ', () => {
    const crossPage = reference({ pageStart: 1, pageEnd: 2, quoteText: 'beta gamma', charStart: 6, charEnd: 16 });
    for (const page of [1, 2]) {
      expect(resolveKnowledgeSourceSpan(crossPage, page, PAGE), `page ${page}`)
        .toEqual({ kind: 'drifted', reason: 'unsupported_cross_page' });
    }
  });

  it('leaves a cross-page PAGE-ONLY row alone -- those are legitimate', () => {
    const legacyRange = reference({ pageStart: 1, pageEnd: 3, quoteText: PAGE });
    expect(resolveKnowledgeSourceSpan(legacyRange, 2, PAGE)).toEqual({ kind: 'page_only' });
  });
});

describe('K/L: offsets that must never be trusted directly', () => {
  it('K: never accepts an empty span by offset, and falls back instead', () => {
    const empty = reference({ quoteText: 'beta gamma', charStart: 6, charEnd: 6 });
    expect(resolveKnowledgeSourceSpan(empty, 1, PAGE)).toMatchObject({ resolution: 'quote_fallback' });
  });

  it('K: an empty span whose quote cannot resolve drifts rather than returning nothing', () => {
    const empty = reference({ quoteText: 'nowhere', charStart: 6, charEnd: 6 });
    expect(resolveKnowledgeSourceSpan(empty, 1, PAGE)).toEqual({
      kind: 'drifted', reason: 'quote_not_found',
    });
  });

  for (const [label, charStart, charEnd] of [
    ['negative start', -1, 10],
    ['reversed range', 16, 6],
    ['fractional', 6.5, 16],
    ['NaN', Number.NaN, 16],
    ['beyond the page', 6, PAGE.length + 1],
  ] as const) {
    it(`L: ${label} is never resolved by offset`, () => {
      const result = resolveKnowledgeSourceSpan(
        reference({ quoteText: 'beta gamma', charStart, charEnd }), 1, PAGE,
      );
      expect(result).toMatchObject({ kind: 'exact_span', resolution: 'quote_fallback', start: 6 });
    });
  }

  it('L: a half-specified pair is neither page-only nor recoverable', () => {
    // Recovering here would let a whole-page quote become a whole-page span.
    for (const half of [{ charStart: 6, charEnd: null }, { charStart: null, charEnd: 16 }]) {
      expect(resolveKnowledgeSourceSpan(reference({ quoteText: PAGE, ...half }), 1, PAGE))
        .toEqual({ kind: 'drifted', reason: 'invalid_offsets' });
    }
  });
});

describe('M: UTF-16 coordinate proof', () => {
  // The emoji is one code point but TWO UTF-16 code units, so code-point
  // indexing would place every following offset one unit early.
  const emojiPage = 'ab😀cd';

  it('offsets count UTF-16 code units exactly as slice does', () => {
    expect(emojiPage.length).toBe(6);
    expect(Array.from(emojiPage).length).toBe(5);

    const after = reference({ quoteText: 'cd', charStart: 4, charEnd: 6 });
    expect(resolveKnowledgeSourceSpan(after, 1, emojiPage)).toEqual({
      kind: 'exact_span', start: 4, end: 6, text: 'cd', resolution: 'offset',
    });
  });

  it('a code-point-based offset resolves to the wrong slice and is not accepted by offset', () => {
    // 3 would be correct if offsets were code points; it is not.
    const codePointish = reference({ quoteText: 'cd', charStart: 3, charEnd: 5 });
    expect(resolveKnowledgeSourceSpan(codePointish, 1, emojiPage))
      .toMatchObject({ resolution: 'quote_fallback', start: 4, end: 6 });
  });

  it('spans the surrogate pair itself', () => {
    const emoji = reference({ quoteText: '😀', charStart: 2, charEnd: 4 });
    expect(resolveKnowledgeSourceSpan(emoji, 1, emojiPage)).toMatchObject({
      kind: 'exact_span', start: 2, end: 4, resolution: 'offset',
    });
  });
});

describe('N: whitespace is preserved exactly', () => {
  const spaced = 'one  two\nthree \n\n four';

  it('matches a quote containing runs of spaces and newlines', () => {
    const quote = '  two\nthree';
    const start = spaced.indexOf(quote);
    const result = resolveKnowledgeSourceSpan(
      reference({ quoteText: quote, charStart: start, charEnd: start + quote.length }), 1, spaced,
    );
    expect(result).toEqual({
      kind: 'exact_span', start, end: start + quote.length, text: quote, resolution: 'offset',
    });
  });

  it('does not trim: a quote differing only by surrounding space is not the same quote', () => {
    // Offsets deliberately point at 'one', forcing the fallback to search. It
    // lands on the bare word at its real position, never on the padded run.
    const misanchored = reference({ quoteText: 'two', charStart: 0, charEnd: 3 });
    expect(resolveKnowledgeSourceSpan(misanchored, 1, spaced)).toMatchObject({
      kind: 'exact_span', start: spaced.indexOf('two'), end: spaced.indexOf('two') + 3, resolution: 'quote_fallback',
    });
    expect(resolveKnowledgeSourceSpan(reference({ quoteText: ' two ', charStart: 0, charEnd: 5 }), 1, spaced))
      .toEqual({ kind: 'drifted', reason: 'quote_not_found' });
  });
});

describe('O/P: purity', () => {
  it('O: does not mutate the reference it is given', () => {
    const input = reference({ quoteText: 'beta gamma', charStart: 9000, charEnd: 9010 });
    const snapshot = JSON.stringify(input);
    resolveKnowledgeSourceSpan(input, 1, PAGE);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it('O: is deterministic and allocates a fresh result each call', () => {
    const first = resolveKnowledgeSourceSpan(BETA_GAMMA, 1, PAGE);
    const second = resolveKnowledgeSourceSpan(BETA_GAMMA, 1, PAGE);
    expect(first).toEqual(second);
  });

  it('P: the resolver reaches no network, storage, framework or crypto', () => {
    // Line comments only. The naive block-comment strip has eaten live code in
    // this repository before.
    const source = fs
      .readFileSync(path.join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceSpanResolver.ts'), 'utf8')
      .replace(/^\s*\/\/.*$/gm, '');

    for (const forbidden of [
      'fetch(', 'supabase', 'getSupabase', 'react', 'useEffect', 'useMemo', 'useState',
      'window.', 'document.', 'localStorage', 'sessionStorage', 'crypto', 'createHash',
    ]) {
      expect(source.toLowerCase(), `resolver must not contain ${forbidden}`)
        .not.toContain(forbidden.toLowerCase());
    }
    // Its only import is a type, so nothing can execute at load.
    expect(source).toContain("import type { SourceReference } from './knowledgePersistence';");
    expect((source.match(/^import /gm) ?? []).length).toBe(1);
  });
});
