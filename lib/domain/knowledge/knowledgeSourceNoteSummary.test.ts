import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeSourceNoteSummaryIndex,
  knowledgeSourceNoteSummariesForDocument,
  type KnowledgeSourceNotePost,
} from './knowledgeSourceNoteSummary';
import type { SourceReference } from './knowledgePersistence';
import type { NormalizedPageRegion } from './knowledgePageRegionGeometry';

const DOC_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const DOC_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const N1 = '11111111-0000-4000-8000-000000000001';
const N2 = '22222222-0000-4000-8000-000000000002';
const N3 = '33333333-0000-4000-8000-000000000003';
const DRAWING = 'dddddddd-0000-4000-8000-000000000004';
const REGION: NormalizedPageRegion = { x: 0.1, y: 0.1, width: 0.2, height: 0.2 };

interface ReferenceOverrides {
  targetPadletId: string;
  sourceDocumentId: string;
  pageStart: number;
  pageEnd?: number;
  quoteText?: string | null;
  charStart?: number | null;
  charEnd?: number | null;
  region?: NormalizedPageRegion | null;
}

let sequence = 0;
function reference(overrides: ReferenceOverrides): SourceReference {
  sequence += 1;
  return {
    id: `ref-${sequence}`,
    targetPadletId: overrides.targetPadletId,
    sourceDocumentId: overrides.sourceDocumentId,
    pageStart: overrides.pageStart,
    pageEnd: overrides.pageEnd ?? overrides.pageStart,
    quoteText: overrides.quoteText ?? null,
    quoteHash: null,
    charStart: overrides.charStart ?? null,
    charEnd: overrides.charEnd ?? null,
    region: overrides.region ?? null,
    locator: null,
    createdAt: `2026-01-01T00:00:${String(sequence).padStart(2, '0')}.000Z`,
  } as unknown as SourceReference;
}

const exactTextRef = (
  targetPadletId: string, sourceDocumentId: string, pageStart: number, quoteText: string,
  overrides: Partial<SourceReference> = {},
) => reference({
  targetPadletId, sourceDocumentId, pageStart, quoteText, charStart: 0, charEnd: quoteText.length, ...overrides,
});

const pageOnlyRef = (targetPadletId: string, sourceDocumentId: string, pageStart: number, pageEnd = pageStart) =>
  reference({ targetPadletId, sourceDocumentId, pageStart, pageEnd });

const areaRef = (targetPadletId: string, sourceDocumentId: string, pageStart: number) =>
  reference({ targetPadletId, sourceDocumentId, pageStart, region: REGION });

function post(
  id: string, type: string, title = '', content = '',
  metadata: KnowledgeSourceNotePost['metadata'] = null,
): KnowledgeSourceNotePost {
  return { id, type, title, content, metadata };
}

const NOTE_1 = post(N1, 'text', 'First note');
const NOTE_2 = post(N2, 'note', 'Second note');
const DRAWING_POST = post(DRAWING, 'drawing', 'A drawing');

const forDocument = (
  references: readonly SourceReference[],
  posts: readonly KnowledgeSourceNotePost[],
  documentId: string,
) => knowledgeSourceNoteSummariesForDocument(buildKnowledgeSourceNoteSummaryIndex(references, posts), documentId);

describe('one summary per target Note', () => {
  it('1: a Note with several citations of one document produces exactly one summary', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1), pageOnlyRef(N1, DOC_A, 3)],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].targetPadletId).toBe(N1);
  });

  it('2: multiple references to the same document aggregate under the one item', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1), pageOnlyRef(N1, DOC_A, 2), pageOnlyRef(N1, DOC_A, 4)],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries[0].references).toHaveLength(3);
  });

  it('3: references to a different document are excluded from this document\'s result', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1), pageOnlyRef(N1, DOC_B, 1)],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].references).toHaveLength(1);
  });

  it('4: a reference whose target is missing from live posts is excluded silently', () => {
    const summaries = forDocument([pageOnlyRef(N1, DOC_A, 1)], [], DOC_A);
    expect(summaries).toHaveLength(0);
  });

  it('5: a reference whose target is not a Note (e.g. a drawing) is excluded', () => {
    const summaries = forDocument([pageOnlyRef(DRAWING, DOC_A, 1)], [DRAWING_POST], DOC_A);
    expect(summaries).toHaveLength(0);
  });
});

describe('deterministic order', () => {
  it('6: Notes order by the earliest citation of this document: createdAt then reference id', () => {
    const early = pageOnlyRef(N2, DOC_A, 1); // sequence 1 -> earliest createdAt
    const later = pageOnlyRef(N1, DOC_A, 1); // sequence 2 -> later createdAt
    const summaries = forDocument([later, early], [NOTE_1, NOTE_2], DOC_A);
    expect(summaries.map((s) => s.targetPadletId)).toEqual([N2, N1]);
  });
});

describe('title and body excerpt', () => {
  it('7: title uses the existing knowledgeBacklinkLabel authority (real title wins)', () => {
    const summaries = forDocument([pageOnlyRef(N1, DOC_A, 1)], [post(N1, 'text', 'My Real Title', 'body')], DOC_A);
    expect(summaries[0].title).toBe('My Real Title');
  });

  it('8: Note body HTML becomes plain text in the excerpt', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', '', '<p>Hello <strong>world</strong></p>')],
      DOC_A,
    );
    expect(summaries[0].bodyExcerpt).toBe('Hello world');
  });

  it('9: no arbitrary HTML survives into the excerpt', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', '', '<img src=x onerror=alert(1)><script>evil()</script>text')],
      DOC_A,
    );
    expect(summaries[0].bodyExcerpt).not.toContain('<');
    expect(summaries[0].bodyExcerpt).not.toContain('>');
  });

  it('10: the body excerpt truncates deterministically at the documented cap', () => {
    const long = 'x'.repeat(300);
    const summaries = forDocument([pageOnlyRef(N1, DOC_A, 1)], [post(N1, 'text', '', long)], DOC_A);
    expect(summaries[0].bodyExcerpt.length).toBe(160);
    expect(summaries[0].bodyExcerpt.endsWith('...')).toBe(true);
  });
});

describe('accent colour authority', () => {
  it('11: metadata.topStrip is used as the accent', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', 'T', '', { topStrip: '#ff0000' })],
      DOC_A,
    );
    expect(summaries[0].accentColor).toBe('#ff0000');
  });

  it('12: metadata.cardColor does not override an existing topStrip key', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', 'T', '', { topStrip: '#00ff00', cardColor: '#0000ff' })],
      DOC_A,
    );
    expect(summaries[0].accentColor).toBe('#00ff00');
  });

  it('13: cardColor is used only when the topStrip key is entirely absent (legacy Note)', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', 'T', '', { cardColor: '#0000ff' })],
      DOC_A,
    );
    expect(summaries[0].accentColor).toBe('#0000ff');
  });

  it('14: an invalid/transparent existing topStrip does not fall back to cardColor', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', 'T', '', { topStrip: 'not-a-color', cardColor: '#0000ff' })],
      DOC_A,
    );
    expect(summaries[0].accentColor).toBeNull();
  });

  it('15: a white accent produces null, exactly like the highlight authority', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1)],
      [post(N1, 'text', 'T', '', { topStrip: '#ffffff' })],
      DOC_A,
    );
    expect(summaries[0].accentColor).toBeNull();
  });
});

describe('reference detail classification', () => {
  it('16/17: an exact-text reference is identified from the offset pair and shows a quote excerpt', () => {
    const summaries = forDocument([exactTextRef(N1, DOC_A, 2, 'a selected quote')], [NOTE_1], DOC_A);
    const [detail] = summaries[0].references;
    expect(detail.kind).toBe('exact-text');
    expect(detail.quoteExcerpt).toBe('a selected quote');
  });

  it('caps a long exact quote deterministically', () => {
    const long = 'q'.repeat(200);
    const summaries = forDocument([exactTextRef(N1, DOC_A, 2, long)], [NOTE_1], DOC_A);
    expect(summaries[0].references[0].quoteExcerpt).toHaveLength(140);
  });

  it('18: a page-only reference\'s stored quoteText (a page snapshot) is never shown as a selected quote', () => {
    const snapshot = pageOnlyRef(N1, DOC_A, 1);
    const withSnapshot = { ...snapshot, quoteText: 'entire page text snapshot' } as SourceReference;
    const summaries = forDocument([withSnapshot], [NOTE_1], DOC_A);
    expect(summaries[0].references[0].kind).toBe('page');
    expect(summaries[0].references[0].quoteExcerpt).toBeNull();
  });

  it('19: an area reference (region present) is classified as area, with no crop/OCR fields', () => {
    const summaries = forDocument([areaRef(N1, DOC_A, 3)], [NOTE_1], DOC_A);
    const [detail] = summaries[0].references;
    expect(detail.kind).toBe('area');
    expect(detail.pageStart).toBe(3);
    expect(detail.quoteExcerpt).toBeNull();
  });
});

describe('malformed exact-offset classification fails closed to page-only', () => {
  const detailOf = (overrides: Partial<ReferenceOverrides> & { quoteText?: string | null }) => {
    const summaries = forDocument(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 2, pageEnd: 2, quoteText: 'valid', charStart: 0, charEnd: 5, ...overrides })],
      [NOTE_1],
      DOC_A,
    );
    return summaries[0].references[0];
  };

  it('negative start classifies page-only', () => {
    expect(detailOf({ charStart: -1, charEnd: 4 }).kind).toBe('page');
  });

  it('zero-length (equal start/end) classifies page-only', () => {
    expect(detailOf({ charStart: 4, charEnd: 4 }).kind).toBe('page');
  });

  it('reversed offsets classify page-only', () => {
    expect(detailOf({ charStart: 8, charEnd: 3 }).kind).toBe('page');
  });

  it('partial start only (charEnd null) classifies page-only, Note stays visible', () => {
    const summaries = forDocument(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 2, quoteText: 'x', charStart: 2, charEnd: null })],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].references[0].kind).toBe('page');
  });

  it('partial end only (charStart null) classifies page-only', () => {
    expect(detailOf({ charStart: null, charEnd: 7 }).kind).toBe('page');
  });

  it('a span crossing more than one page classifies page-only', () => {
    expect(detailOf({ pageStart: 2, pageEnd: 3 }).kind).toBe('page');
  });

  it('an empty quote classifies page-only despite valid offsets', () => {
    expect(detailOf({ quoteText: '' }).kind).toBe('page');
  });

  it('a fully valid exact span classifies exact-text', () => {
    const detail = detailOf({ pageStart: 2, pageEnd: 2, charStart: 0, charEnd: 4, quoteText: 'test' });
    expect(detail.kind).toBe('exact-text');
  });

  it('a whitespace-only quote is still non-empty canonical text, not trimmed or reinterpreted', () => {
    expect(detailOf({ quoteText: ' ' }).kind).toBe('exact-text');
  });

  it('area precedence: a torn row with region present renders as area, never exact-text or page', () => {
    const summaries = forDocument(
      [reference({
        targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 3, region: REGION,
        quoteText: '', charStart: 9, charEnd: 4,
      })],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries[0].references[0].kind).toBe('area');
  });

  it('page-only quoteText safety: a page snapshot with well-formed offsets is still page, once any offset is malformed', () => {
    const summaries = forDocument(
      [reference({ targetPadletId: N1, sourceDocumentId: DOC_A, pageStart: 1, quoteText: 'page snapshot text', charStart: null, charEnd: null })],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries[0].references[0].kind).toBe('page');
    expect(summaries[0].references[0].quoteExcerpt).toBeNull();
  });
});

describe('page hint aggregation', () => {
  it('20: the aggregated page hint reuses the existing range-merge/format authority', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1), pageOnlyRef(N1, DOC_A, 3, 4)],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries[0].pageHint).toBe('pp. 1, 3–4');
  });
});

describe('document isolation', () => {
  it('21: a Note citing A, B and C shows only its A references while viewing A', () => {
    const summaries = forDocument(
      [pageOnlyRef(N1, DOC_A, 1), pageOnlyRef(N1, DOC_B, 5), pageOnlyRef(N1, 'doc-c', 9)],
      [NOTE_1],
      DOC_A,
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0].references).toHaveLength(1);
    expect(summaries[0].references[0].pageStart).toBe(1);
  });
});

describe('purity', () => {
  it('22: the builder never mutates its inputs and is safe to call repeatedly', () => {
    const references = [pageOnlyRef(N1, DOC_A, 1)];
    const posts = [NOTE_1];
    const referencesCopy = [...references];
    const postsCopy = [...posts];
    const first = buildKnowledgeSourceNoteSummaryIndex(references, posts);
    const second = buildKnowledgeSourceNoteSummaryIndex(references, posts);
    expect(references).toEqual(referencesCopy);
    expect(posts).toEqual(postsCopy);
    expect(first.get(DOC_A)).toEqual(second.get(DOC_A));
  });

  it('an unknown document id returns an empty list rather than throwing', () => {
    expect(knowledgeSourceNoteSummariesForDocument(new Map(), 'unknown')).toEqual([]);
    expect(knowledgeSourceNoteSummariesForDocument(new Map(), null)).toEqual([]);
  });
});
