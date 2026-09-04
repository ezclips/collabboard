import { describe, expect, it } from 'vitest';
import {
  asKnowledgeDocumentId,
  asKnowledgeSourceHighlightId,
  asUserId,
} from '../core/ids';
import type { KnowledgeSourceHighlight } from './knowledgeSourceHighlight';
import {
  KNOWLEDGE_HIGHLIGHT_IDS_ATTRIBUTE,
  knowledgeHighlightIdsAttribute,
  knowledgeStandaloneHighlightColor,
  knowledgeStandaloneHighlightIds,
  knowledgeStandaloneHighlightSegments,
  knowledgeStandaloneHighlightSpans,
  parseKnowledgeHighlightIds,
} from './knowledgeStandaloneHighlights';

/**
 * PDF-R6K-H2B -- standalone highlights as the visual authority.
 *
 * The behaviour that must NOT change is overlap partitioning and drift
 * recovery; the behaviour that must change is where colour comes from and that
 * every painted run names the rows a delete can target.
 */

const DOC = asKnowledgeDocumentId('33333333-3333-4333-8333-333333333333');
const PAGE = 'Alpha beta gamma delta epsilon.';
//            0     6    11    17    23

const highlight = (
  id: string,
  charStart: number,
  charEnd: number,
  color = '#fde68a',
  over: Partial<KnowledgeSourceHighlight> = {},
): KnowledgeSourceHighlight => ({
  id: asKnowledgeSourceHighlightId(id),
  sourceDocumentId: DOC,
  pageNumber: 1,
  charStart,
  charEnd,
  quoteText: PAGE.slice(charStart, charEnd),
  quoteHash: null,
  color,
  createdBy: asUserId('55555555-5555-4555-8555-555555555555'),
  createdAt: 't',
  updatedAt: 't',
  sourceReferenceId: null,
  ...over,
});

describe('1-2. resolution reuses the existing span authority', () => {
  it('1. a standalone row resolves to its exact span', () => {
    const [span] = knowledgeStandaloneHighlightSpans([highlight('a', 6, 10)], 1, PAGE);
    expect(span.start).toBe(6);
    expect(span.end).toBe(10);
    expect(span.resolution).toBe('offset');
    expect(PAGE.slice(span.start, span.end)).toBe('beta');
    expect(span.highlightId).toBe('a');
  });

  it('2. a drifted row is recovered by its quote, not dropped', () => {
    // Offsets point at "Alpha"; the stored quote is "gamma".
    const drifted = highlight('a', 0, 5);
    const spans = knowledgeStandaloneHighlightSpans(
      [{ ...drifted, quoteText: 'gamma' }], 1, PAGE,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].resolution).toBe('quote_fallback');
    expect(PAGE.slice(spans[0].start, spans[0].end)).toBe('gamma');
  });

  it('a row that cannot be resolved paints nothing', () => {
    const missing = { ...highlight('a', 0, 7), quoteText: 'nowhere' };
    expect(knowledgeStandaloneHighlightSpans([missing], 1, PAGE)).toHaveLength(0);
  });

  it('a row belonging to another page is not painted here', () => {
    const elsewhere = { ...highlight('a', 6, 10), pageNumber: 2 };
    expect(knowledgeStandaloneHighlightSpans([elsewhere], 1, PAGE)).toHaveLength(0);
  });
});

describe('3-5. overlap partitioning and durable ids', () => {
  it('3. overlapping highlights partition exactly as citations always did', () => {
    // The H1 contract: A=[6,17) B=[11,23) -> A | A+B | B, with every character
    // emitted once and in order.
    const segments = knowledgeStandaloneHighlightSegments(
      [highlight('A', 6, 17), highlight('B', 11, 23)], 1, PAGE,
    );
    expect(segments.map((s) => s.text).join('')).toBe(PAGE);
    const covered = segments.filter((s) => s.spans.length > 0);
    expect(covered.map((s) => [s.text, s.spans.map((x) => x.highlightId)])).toEqual([
      ['beta ', ['A']],
      ['gamma ', ['A', 'B']],
      ['delta ', ['B']],
    ]);
  });

  it('4. a single-highlight run names exactly one delete target', () => {
    const segments = knowledgeStandaloneHighlightSegments([highlight('A', 6, 10)], 1, PAGE);
    const painted = segments.filter((s) => s.spans.length > 0);
    expect(painted).toHaveLength(1);
    expect(knowledgeStandaloneHighlightIds(painted[0].spans)).toEqual(['A']);
    expect(knowledgeHighlightIdsAttribute(painted[0].spans)).toBe('A');
  });

  it('5. an overlapping run names BOTH, so nothing has to be guessed', () => {
    const segments = knowledgeStandaloneHighlightSegments(
      [highlight('A', 6, 17), highlight('B', 11, 23)], 1, PAGE,
    );
    const overlap = segments.find((s) => s.spans.length === 2)!;
    expect(knowledgeStandaloneHighlightIds(overlap.spans)).toEqual(['A', 'B']);
    expect(knowledgeHighlightIdsAttribute(overlap.spans)).toBe('A,B');
    // Round-trips through the DOM attribute without loss.
    expect(parseKnowledgeHighlightIds('A,B')).toEqual(['A', 'B']);
    expect(KNOWLEDGE_HIGHLIGHT_IDS_ATTRIBUTE).toBe('data-knowledge-highlight-ids');
  });

  it('an unpainted run carries no attribute at all', () => {
    const segments = knowledgeStandaloneHighlightSegments([highlight('A', 6, 10)], 1, PAGE);
    const bare = segments.find((s) => s.spans.length === 0)!;
    expect(knowledgeHighlightIdsAttribute(bare.spans)).toBeUndefined();
    expect(parseKnowledgeHighlightIds(undefined)).toEqual([]);
    expect(parseKnowledgeHighlightIds('')).toEqual([]);
  });

  it('ordering is chosen, not inherited from the fetch order', () => {
    const late = knowledgeStandaloneHighlightSegments(
      [highlight('B', 11, 23), highlight('A', 6, 17)], 1, PAGE,
    );
    const overlap = late.find((s) => s.spans.length === 2)!;
    expect(knowledgeStandaloneHighlightIds(overlap.spans)).toEqual(['A', 'B']);
  });
});

describe('6-7. colour comes from the highlight, and disagreement fails closed', () => {
  it('6. one covering highlight paints its own stored colour', () => {
    const spans = knowledgeStandaloneHighlightSpans([highlight('A', 6, 10, '#bbf7d0')], 1, PAGE);
    expect(knowledgeStandaloneHighlightColor(spans)).toBe('#bbf7d0');
  });

  it('6b. agreeing highlights paint that shared colour, spelling preserved', () => {
    const segments = knowledgeStandaloneHighlightSegments(
      [highlight('A', 6, 17, '#FDE68A'), highlight('B', 11, 23, '#fde68a')], 1, PAGE,
    );
    const overlap = segments.find((s) => s.spans.length === 2)!;
    // Case-insensitive agreement, but the STORED spelling is what renders.
    expect(knowledgeStandaloneHighlightColor(overlap.spans)).toBe('#FDE68A');
  });

  it('7. conflicting colours over one run paint none of them', () => {
    const segments = knowledgeStandaloneHighlightSegments(
      [highlight('A', 6, 17, '#fde68a'), highlight('B', 11, 23, '#bbf7d0')], 1, PAGE,
    );
    const overlap = segments.find((s) => s.spans.length === 2)!;
    // One background cannot honestly represent two annotations. The
    // NON-overlapping runs still show their own colours.
    expect(knowledgeStandaloneHighlightColor(overlap.spans)).toBeNull();
    const onlyA = segments.find((s) => s.spans.length === 1 && s.spans[0].highlightId === 'A')!;
    expect(knowledgeStandaloneHighlightColor(onlyA.spans)).toBe('#fde68a');
  });

  it('an uncovered run has no colour', () => {
    expect(knowledgeStandaloneHighlightColor([])).toBeNull();
  });
});
