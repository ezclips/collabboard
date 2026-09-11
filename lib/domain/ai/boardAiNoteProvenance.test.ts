import { describe, expect, it } from 'vitest';
import { boardAiNoteEvidenceFromCitations } from './boardAiNoteProvenance';
import { boardAiCitationsFromStored, type BoardAiCitationEnvelope } from './boardAiChatCitation';

/**
 * PDF_AI_VALIDATED_PROVENANCE -- what a saved AI Note may claim as its sources.
 *
 * The invariant: CONTEXT IS NOT PROVENANCE. Only the server's validated
 * citation set becomes source references, and an answer that cited nothing
 * saves unsourced rather than borrowing whatever the model was shown.
 */
const DOC_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DOC_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const envelope = (items: readonly Record<string, unknown>[]): BoardAiCitationEnvelope =>
  ({ version: 1, items } as unknown as BoardAiCitationEnvelope);

const page = (documentId: string, pageNumber: number) =>
  ({ type: 'knowledge-page', knowledgeDocumentId: documentId, pageNumber, label: `p. ${pageNumber}` });

const selection = (documentId: string, pageNumber: number, charStart: number, charEnd: number) =>
  ({ type: 'knowledge-selection', knowledgeDocumentId: documentId, pageNumber, charStart, charEnd, label: 'sel' });

describe('context is not provenance', () => {
  it('1. only the CITED sources become evidence -- context-only ones do not', () => {
    // The model was shown A, B and C; it cited A and C. B was context, never
    // evidence, and the old rule (walk back to the user message's context)
    // would have credited whichever context item it found first.
    const cited = envelope([page(DOC_A, 4), page(DOC_B, 9)]);
    expect(boardAiNoteEvidenceFromCitations(cited)).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 4, pageEnd: 4, charStart: null, charEnd: null },
      { sourceDocumentId: DOC_B, pageStart: 9, pageEnd: 9, charStart: null, charEnd: null },
    ]);
  });

  it('2. an answer that cited nothing has NO evidence -- and no fallback', () => {
    // The critical case. There is no open document, active page or live
    // selection to fall back to, because none of them is provenance.
    expect(boardAiNoteEvidenceFromCitations(null)).toEqual([]);
    expect(boardAiNoteEvidenceFromCitations(undefined)).toEqual([]);
    expect(boardAiNoteEvidenceFromCitations(envelope([]))).toEqual([]);
  });

  it('3. one validated citation is one reference', () => {
    expect(boardAiNoteEvidenceFromCitations(envelope([page(DOC_A, 14)]))).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 14, pageEnd: 14, charStart: null, charEnd: null },
    ]);
  });

  it('4. N validated citations are N references', () => {
    const result = boardAiNoteEvidenceFromCitations(
      envelope([page(DOC_A, 14), page(DOC_A, 37), page(DOC_B, 8)]),
    );
    expect(result).toHaveLength(3);
    expect(result.map((item) => `${item.sourceDocumentId}:${item.pageStart}`)).toEqual([
      `${DOC_A}:14`, `${DOC_A}:37`, `${DOC_B}:8`,
    ]);
  });
});

describe('de-duplication keeps precision', () => {
  it('5. the same citation twice is one reference', () => {
    expect(boardAiNoteEvidenceFromCitations(envelope([page(DOC_A, 14), page(DOC_A, 14)])))
      .toHaveLength(1);
    expect(boardAiNoteEvidenceFromCitations(envelope([
      selection(DOC_A, 3, 10, 40), selection(DOC_A, 3, 10, 40),
    ]))).toHaveLength(1);
  });

  it('two pages of ONE document stay two references', () => {
    // Never collapsed to a single document-level relationship.
    expect(boardAiNoteEvidenceFromCitations(envelope([page(DOC_A, 14), page(DOC_A, 37)])))
      .toHaveLength(2);
  });

  it('two DISTINCT spans on one page stay two references', () => {
    const result = boardAiNoteEvidenceFromCitations(envelope([
      selection(DOC_A, 3, 10, 40), selection(DOC_A, 3, 90, 120),
    ]));
    expect(result).toHaveLength(2);
    expect(result.map((item) => [item.charStart, item.charEnd])).toEqual([[10, 40], [90, 120]]);
  });

  it('a page-only citation of a page a span already pins collapses INTO the span', () => {
    // Same underlying evidence said twice, once less precisely. The precise
    // one survives -- never the other way round.
    const result = boardAiNoteEvidenceFromCitations(envelope([
      page(DOC_A, 3), selection(DOC_A, 3, 10, 40),
    ]));
    expect(result).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 3, pageEnd: 3, charStart: 10, charEnd: 40 },
    ]);
  });

  it('...and a page-only citation of a DIFFERENT page is untouched by that rule', () => {
    const result = boardAiNoteEvidenceFromCitations(envelope([
      page(DOC_A, 7), selection(DOC_A, 3, 10, 40),
    ]));
    expect(result).toHaveLength(2);
  });
});

describe('exact selection precision is never degraded', () => {
  it('6. a cited selection keeps its document, page AND span', () => {
    // The old rule produced page-only provenance for exactly this case.
    expect(boardAiNoteEvidenceFromCitations(envelope([selection(DOC_A, 5, 120, 214)]))).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 5, pageEnd: 5, charStart: 120, charEnd: 214 },
    ]);
  });

  it('the span survives the real stored-envelope round trip, not just a literal', () => {
    // Through the server's own fail-closed reader: this is the representation
    // the save path actually receives.
    const stored = boardAiCitationsFromStored({
      version: 1,
      items: [{
        type: 'knowledge-selection',
        knowledgeDocumentId: DOC_A,
        pageNumber: 5,
        charStart: 120,
        charEnd: 214,
        label: 'Alpha.pdf p. 5',
      }],
    });
    expect(stored).not.toBeNull();
    expect(boardAiNoteEvidenceFromCitations(stored)).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 5, pageEnd: 5, charStart: 120, charEnd: 214 },
    ]);
  });

  it('7. a half-span is page-level, never an invented span', () => {
    // An offset pair that is not well formed cannot be a location. The page is
    // still true, so the page is what is kept.
    for (const broken of [
      { charStart: 10 },
      { charEnd: 40 },
      { charStart: 40, charEnd: 10 },
      { charStart: 10, charEnd: 10 },
      { charStart: -1, charEnd: 40 },
    ]) {
      const result = boardAiNoteEvidenceFromCitations(envelope([
        { type: 'knowledge-selection', knowledgeDocumentId: DOC_A, pageNumber: 5, label: 'sel', ...broken },
      ]));
      expect(result, JSON.stringify(broken)).toEqual([
        { sourceDocumentId: DOC_A, pageStart: 5, pageEnd: 5, charStart: null, charEnd: null },
      ]);
    }
  });
});

describe('nothing unstorable is invented', () => {
  it('8. a document-level citation yields NO reference rather than a guessed page', () => {
    // source_references requires an integer page >= 1. This citation has no
    // page, so there is no honest row to write -- page 1 would be fabricated.
    expect(boardAiNoteEvidenceFromCitations(envelope([
      { type: 'knowledge-document', knowledgeDocumentId: DOC_A, label: 'Alpha.pdf' },
    ]))).toEqual([]);
  });

  it('a padlet citation is not a document source', () => {
    expect(boardAiNoteEvidenceFromCitations(envelope([
      { type: 'padlet', padletId: 'some-post', label: 'A post' },
    ]))).toEqual([]);
  });

  it('9/15. a malformed or old stored envelope fails closed to no evidence', () => {
    for (const bad of [null, undefined, 42, 'x', [], { version: 99, items: [page(DOC_A, 1)] }]) {
      expect(boardAiNoteEvidenceFromCitations(boardAiCitationsFromStored(bad)), JSON.stringify(bad))
        .toEqual([]);
    }
  });

  it('9. an item with no document identity or no usable page is dropped', () => {
    expect(boardAiNoteEvidenceFromCitations(envelope([
      { type: 'knowledge-page', pageNumber: 3, label: 'no doc' },
      { type: 'knowledge-page', knowledgeDocumentId: DOC_A, label: 'no page' },
      { type: 'knowledge-page', knowledgeDocumentId: DOC_A, pageNumber: 0, label: 'page 0' },
      { type: 'knowledge-page', knowledgeDocumentId: '', pageNumber: 2, label: 'blank doc' },
    ]))).toEqual([]);
  });

  it('10. a valid citation beside an unusable one keeps only the valid one', () => {
    const result = boardAiNoteEvidenceFromCitations(envelope([
      page(DOC_A, 4),
      { type: 'knowledge-document', knowledgeDocumentId: DOC_B, label: 'Beta.pdf' },
    ]));
    expect(result).toEqual([
      { sourceDocumentId: DOC_A, pageStart: 4, pageEnd: 4, charStart: null, charEnd: null },
    ]);
  });

  it('an unknown token never reaches here: the server drops it before storage', () => {
    // The pipeline resolves tokens to authorized blocks; an unknown token
    // yields no item, so a footer of only unknown tokens stores null.
    expect(boardAiNoteEvidenceFromCitations(boardAiCitationsFromStored(null))).toEqual([]);
  });
});
