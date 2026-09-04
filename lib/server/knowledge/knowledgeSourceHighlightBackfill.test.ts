import { describe, expect, it } from 'vitest';
import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../../domain/core/ids';
import type { SourceReference } from '../../domain/knowledge/knowledgePersistence';
import { KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR }
  from '../../domain/knowledge/knowledgeSourceHighlightColor';
import { planKnowledgeSourceHighlightBackfill } from './knowledgeSourceHighlightBackfill';

/**
 * PDF-R6K-H2A backfill contract.
 *
 * The rule under test is "whatever the reader paints today, and nothing else".
 * Manufacturing a highlight for a citation that currently paints nothing would
 * put a mark on a page the user has never seen one on; dropping one that does
 * paint would strand a highlight the moment rendering switches authority.
 */

const DOC = asKnowledgeDocumentId('33333333-3333-4333-8333-333333333333');
const NOTE = asPostId('88888888-8888-4888-8888-888888888888');
const PAGE_TEXT = 'Alpha beta gamma delta epsilon.';

let seq = 0;
const reference = (over: Partial<SourceReference> = {}): SourceReference => {
  seq += 1;
  return {
    id: asSourceReferenceId(`aaaaaaaa-0000-4000-8000-${String(seq).padStart(12, '0')}`),
    targetPadletId: NOTE,
    sourceDocumentId: DOC,
    pageStart: 1,
    pageEnd: 1,
    quoteText: 'beta',
    quoteHash: null,
    charStart: 6,
    charEnd: 10,
    region: null,
    locator: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  };
};

const plan = (references: readonly SourceReference[], noteColors = new Map()) =>
  planKnowledgeSourceHighlightBackfill({
    references,
    pages: [{ pageNumber: 1, text: PAGE_TEXT }],
    noteColors,
  });

describe('PDF-R6K-H2A backfill planner', () => {
  it('A. an exact-offset citation becomes one highlight', () => {
    const result = plan([reference()]);
    expect(result.create).toHaveLength(1);
    expect(result.skipped).toHaveLength(0);
    const [row] = result.create;
    expect(row.pageNumber).toBe(1);
    expect(row.charStart).toBe(6);
    expect(row.charEnd).toBe(10);
    expect(row.quoteText).toBe('beta');
    expect(row.resolution).toBe('offset');
    expect(PAGE_TEXT.slice(row.charStart, row.charEnd)).toBe(row.quoteText);
  });

  it('B. a drifted citation stores the CORRECTED offsets, not the stale ones', () => {
    // Offsets point at "Alpha"; the quote is "gamma", which lives at 11..16.
    const result = plan([reference({ charStart: 0, charEnd: 5, quoteText: 'gamma' })]);
    expect(result.create).toHaveLength(1);
    const [row] = result.create;
    expect(row.resolution).toBe('quote_fallback');
    expect(row.charStart).toBe(PAGE_TEXT.indexOf('gamma'));
    expect(row.charEnd).toBe(PAGE_TEXT.indexOf('gamma') + 'gamma'.length);
    // Copying char_start/char_end blindly would have frozen the WRONG passage
    // and moved the highlight the moment rendering switched authority.
    expect(row.charStart).not.toBe(0);
    expect(PAGE_TEXT.slice(row.charStart, row.charEnd)).toBe('gamma');
  });

  it('C. a page-only citation produces no highlight', () => {
    const result = plan([reference({ charStart: null, charEnd: null, quoteText: null })]);
    expect(result.create).toHaveLength(0);
    expect(result.skipped).toEqual([
      { sourceReferenceId: expect.any(String), reason: 'page_only' },
    ]);
  });

  it('D. a cross-page citation produces no highlight', () => {
    const result = plan([reference({ pageStart: 1, pageEnd: 2 })]);
    expect(result.create).toHaveLength(0);
    expect(result.skipped[0].reason).toBe('cross_page');
  });

  it('D2. an unresolvable quote produces no highlight', () => {
    const result = plan([reference({ charStart: 0, charEnd: 5, quoteText: 'nowhere' })]);
    expect(result.create).toHaveLength(0);
    expect(result.skipped[0].reason).toBe('drifted');
  });

  it('D3. a citation on a page with no extracted text produces no highlight', () => {
    const result = planKnowledgeSourceHighlightBackfill({
      references: [reference({ pageStart: 9, pageEnd: 9 })],
      pages: [{ pageNumber: 1, text: PAGE_TEXT }],
      noteColors: new Map(),
    });
    expect(result.create).toHaveLength(0);
    expect(result.skipped[0].reason).toBe('no_page_text');
  });

  it('E. two citations produce two highlights, each keeping its own origin', () => {
    const first = reference();
    const second = reference({ quoteText: 'delta', charStart: 17, charEnd: 22 });
    const result = plan([first, second]);
    expect(result.create).toHaveLength(2);
    expect(result.create.map((row) => row.sourceReferenceId))
      .toEqual([String(first.id), String(second.id)]);
  });

  it('F. the plan is pure, so a rerun proposes exactly the same rows', () => {
    const references = [reference(), reference({ quoteText: 'delta', charStart: 17, charEnd: 22 })];
    // Convergence has two halves: the planner is deterministic (here) and the
    // unique partial index refuses a second row per citation (schema test 6).
    expect(plan(references)).toEqual(plan(references));
  });

  it('G-color. a coloured Note seeds the highlight with the Note accent', () => {
    const colors = new Map([[String(NOTE), { topStrip: '#fde68a' }]]);
    expect(plan([reference()], colors).create[0].color).toBe('#fde68a');
  });

  it('H-color. an uncoloured Note keeps the reader existing neutral, not a new colour', () => {
    // No metadata at all, white (which would render invisible), and an
    // unparseable value all fall back to the SAME neutral the reader paints.
    expect(plan([reference()]).create[0].color).toBe(KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR);
    expect(plan([reference()], new Map([[String(NOTE), { topStrip: '#ffffff' }]]))
      .create[0].color).toBe(KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR);
    expect(plan([reference()], new Map([[String(NOTE), { topStrip: 'transparent' }]]))
      .create[0].color).toBe(KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR);
    // And that neutral is the reader's own sky-100, not an invented yellow.
    expect(KNOWLEDGE_HIGHLIGHT_NEUTRAL_COLOR).toBe('#e0f2fe');
  });

  it('legacy cardColor is still honoured, through the shared authority', () => {
    const colors = new Map([[String(NOTE), { cardColor: '#bbf7d0' }]]);
    expect(plan([reference()], colors).create[0].color).toBe('#bbf7d0');
  });

  it('the planner never mutates its input citations', () => {
    const input = reference();
    const snapshot = JSON.stringify(input);
    plan([input]);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
