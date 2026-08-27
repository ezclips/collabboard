import { describe, expect, it } from 'vitest';
import { buildKnowledgeSourceNoteDraft } from './knowledgeSourceNoteDraft';
import type { KnowledgeSourcePageRequest } from './knowledgeSourceNoteDraft';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';

const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

function request(overrides: Partial<KnowledgeSourcePageRequest> = {}): KnowledgeSourcePageRequest {
  return {
    sourceDocumentId: DOCUMENT_ID,
    originalFilename: 'quarterly-report.pdf',
    pageNumber: 4,
    pageText: 'The margin improved by six points.',
    ...overrides,
  };
}

describe('P6J-F5 knowledge source note draft', () => {
  it('titles the Note after the source document', () => {
    expect(buildKnowledgeSourceNoteDraft(request()).title).toBe('quarterly-report.pdf');
  });

  it('falls back to the ordinary new-Note title when the filename is empty', () => {
    expect(buildKnowledgeSourceNoteDraft(request({ originalFilename: '' })).title).toBe('New Note');
  });

  it('always starts the Note blank, whatever the page holds', () => {
    for (const pageText of ['', 'a short page', 'x'.repeat(5_000)]) {
      const draft = buildKnowledgeSourceNoteDraft(request({ pageText }));
      expect(draft.content, pageText.slice(0, 12)).toBe('');
      // The page text must never leak into authorship.
      expect(JSON.stringify({ title: draft.title, content: draft.content })).not.toContain('short page');
    }
  });

  it('records the page as a single-page range', () => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(request({ pageNumber: 7 }));

    expect(sourceReference.pageStart).toBe(7);
    expect(sourceReference.pageEnd).toBe(7);
  });

  it('carries the document id through unchanged', () => {
    expect(buildKnowledgeSourceNoteDraft(request()).sourceReference.sourceDocumentId).toBe(DOCUMENT_ID);
    // Never derived from the filename.
    expect(buildKnowledgeSourceNoteDraft(request()).sourceReference.sourceDocumentId).not.toBe('quarterly-report.pdf');
  });

  it('preserves page text exactly, including whitespace, CRLF and Unicode', () => {
    const cases = [
      'The margin improved by six points.',
      '   ',
      '\t\n ',
      'line one\r\nline two\r\n',
      'Grüße — 日本語 — \u{1F9EA} — Ω',
      ' leading and trailing  ',
    ];
    for (const pageText of cases) {
      expect(buildKnowledgeSourceNoteDraft(request({ pageText })).sourceReference.quoteText, JSON.stringify(pageText))
        .toBe(pageText);
    }
  });

  it('treats only a truly empty page as having no quote', () => {
    expect(buildKnowledgeSourceNoteDraft(request({ pageText: '' })).sourceReference.quoteText).toBeNull();
    expect(buildKnowledgeSourceNoteDraft(request({ pageText: ' ' })).sourceReference.quoteText).toBe(' ');
  });

  it('accepts a page exactly at the domain limit', () => {
    const pageText = 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH);

    expect(buildKnowledgeSourceNoteDraft(request({ pageText })).sourceReference.quoteText).toBe(pageText);
  });

  it('drops an oversized quote entirely rather than truncating it', () => {
    const pageText = 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 1);

    const { sourceReference } = buildKnowledgeSourceNoteDraft(request({ pageText }));

    expect(sourceReference.quoteText).toBeNull();
    // The page range still says exactly where the Note came from.
    expect(sourceReference.pageStart).toBe(4);
    expect(sourceReference.pageEnd).toBe(4);
  });

  it('emits exactly the client-supplied reference fields', () => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(request());

    // Char offsets and their selected text became client input at B4-B2A; the
    // hash, the locator and every identity field remain server-owned.
    expect(Object.keys(sourceReference).sort()).toEqual([
      'appliedRotation', 'charEnd', 'charStart', 'pageEnd', 'pageStart', 'quoteText',
      'region', 'selectedText', 'sourceDocumentId',
    ]);
    for (const forbidden of ['quoteHash', 'locator', 'id', 'createdAt', 'boardId', 'userId']) {
      expect(sourceReference, forbidden).not.toHaveProperty(forbidden);
    }
  });

  it('returns exactly a title, a content and a source reference', () => {
    expect(Object.keys(buildKnowledgeSourceNoteDraft(request())).sort()).toEqual([
      'content', 'sourceReference', 'title',
    ]);
  });
});

// ============================================================================
// P6J-F6-B4-B2B -- carrying an exact reader selection into the draft
// ============================================================================

const PAGE = 'prefix 😀 alpha\nbeta suffix';
/** 'alpha' sits at UTF-16 [10,15): the emoji before it occupies two units. */
const SELECTION = { charStart: 10, charEnd: 15, selectedText: 'alpha' } as const;

describe('P6J-F6-B4-B2B exact selection drafts', () => {
  it('O: a request with no selection is the unchanged page-only draft', () => {
    for (const selection of [undefined, null]) {
      const { sourceReference } = buildKnowledgeSourceNoteDraft(request({ pageText: PAGE, selection }));

      expect(sourceReference.quoteText, String(selection)).toBe(PAGE);
      expect(sourceReference.charStart).toBeNull();
      expect(sourceReference.charEnd).toBeNull();
      expect(sourceReference.selectedText).toBeNull();
    }
  });

  it('O: an oversized page still drops its quote and stays page-only', () => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(
      request({ pageText: 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 1) }),
    );

    expect(sourceReference).toMatchObject({ quoteText: null, charStart: null, charEnd: null, selectedText: null });
  });

  it('P: an exact selection produces the span shape with no client quote', () => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(request({ pageText: PAGE, selection: SELECTION }));

    expect(sourceReference).toEqual({
      sourceDocumentId: DOCUMENT_ID,
      pageStart: 4,
      pageEnd: 4,
      // The server derives the canonical quote by slicing its own page.
      quoteText: null,
      charStart: 10,
      charEnd: 15,
      selectedText: 'alpha',
      // A text span is not a region, and says so rather than leaving it absent.
      region: null,
      appliedRotation: null,
    });
    // The offsets index the page the reader measured against.
    expect(PAGE.slice(sourceReference.charStart!, sourceReference.charEnd!)).toBe(sourceReference.selectedText);
  });

  it('P: the whole page is still a legitimate exact span', () => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(request({
      pageText: PAGE,
      selection: { charStart: 0, charEnd: PAGE.length, selectedText: PAGE },
    }));

    expect(sourceReference).toMatchObject({ quoteText: null, charStart: 0, charEnd: PAGE.length, selectedText: PAGE });
  });

  it('Q: an exact selection does not alter the Note title', () => {
    const withSelection = buildKnowledgeSourceNoteDraft(request({ pageText: PAGE, selection: SELECTION }));
    const without = buildKnowledgeSourceNoteDraft(request({ pageText: PAGE }));

    expect(withSelection.title).toBe('quarterly-report.pdf');
    expect(withSelection.title).toBe(without.title);
    expect(buildKnowledgeSourceNoteDraft(request({ originalFilename: '', selection: SELECTION })).title).toBe('New Note');
  });

  it('R: the selected source text never becomes Note content', () => {
    const draft = buildKnowledgeSourceNoteDraft(request({ pageText: PAGE, selection: SELECTION }));

    expect(draft.content).toBe('');
    // Provenance, not authorship: it exists only on the reference.
    expect(JSON.stringify({ title: draft.title, content: draft.content })).not.toContain('alpha');
  });

  it('S: no hash and no locator exist on the client draft in either mode', () => {
    for (const selection of [null, SELECTION]) {
      const { sourceReference } = buildKnowledgeSourceNoteDraft(request({ pageText: PAGE, selection }));

      for (const forbidden of ['quoteHash', 'locator', 'bbox', 'boardId', 'userId', 'id', 'createdAt']) {
        expect(sourceReference, forbidden).not.toHaveProperty(forbidden);
      }
      expect(Object.keys(sourceReference).sort()).toEqual([
        'appliedRotation', 'charEnd', 'charStart', 'pageEnd', 'pageStart', 'quoteText',
        'region', 'selectedText', 'sourceDocumentId',
      ]);
    }
  });

  it('T: selected text is preserved string-for-string, with no normalisation', () => {
    const cases = [
      '  padded  ',
      '\n',
      '\r\n',
      '\t tabbed \t',
      '😀',
      'Grüße — 日本語 — \u{1F9EA} — Ω',
      'MiXeD CaSe',
    ];
    for (const selectedText of cases) {
      const pageText = `lead ${selectedText} tail`;
      const charStart = 5;
      const { sourceReference } = buildKnowledgeSourceNoteDraft(request({
        pageText,
        selection: { charStart, charEnd: charStart + selectedText.length, selectedText },
      }));

      expect(sourceReference.selectedText, JSON.stringify(selectedText)).toBe(selectedText);
      // Still exactly what those coordinates address in the page.
      expect(pageText.slice(sourceReference.charStart!, sourceReference.charEnd!)).toBe(selectedText);
    }
  });
});

/**
 * P6J-F9-B2. The third draft shape. A region cites a place on a page, so it
 * carries a rectangle and no text evidence of any kind -- F9 reads none.
 */
describe('P6J-F9-B2 page region note draft', () => {
  const REGION = { x: 0.25, y: 0.1, width: 0.5, height: 0.4 };
  const regionRequest = (overrides: Partial<KnowledgeSourcePageRequest> = {}) =>
    request({ region: { region: REGION, appliedRotation: 90 }, ...overrides });

  it('C1/C2: titles the Note after the document and leaves the body blank', () => {
    const draft = buildKnowledgeSourceNoteDraft(regionRequest());
    expect(draft.title).toBe('quarterly-report.pdf');
    expect(draft.content).toBe('');
  });

  it('falls back to a usable title when the document has no filename', () => {
    expect(buildKnowledgeSourceNoteDraft(regionRequest({ originalFilename: '' })).title).toBe('New Note');
  });

  it('C3/C4: carries the rectangle and its rotation, and no text evidence', () => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(regionRequest());
    expect(sourceReference).toEqual({
      sourceDocumentId: DOCUMENT_ID,
      pageStart: 4,
      pageEnd: 4,
      quoteText: null,
      charStart: null,
      charEnd: null,
      selectedText: null,
      region: REGION,
      appliedRotation: 90,
    });
  });

  it('never snapshots the page text, however much of it arrives', () => {
    // The page-only branch would have quoted this whole string.
    const { sourceReference } = buildKnowledgeSourceNoteDraft(
      regionRequest({ pageText: 'The margin improved by six points.' }));
    expect(sourceReference.quoteText).toBeNull();
  });

  it.each([0, 90, 180, 270] as const)('forwards rotation %s unchanged', (appliedRotation) => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(
      request({ region: { region: REGION, appliedRotation } }));
    expect(sourceReference.appliedRotation).toBe(appliedRotation);
  });

  it('a text span outranks a region, so a pre-B2 payload cannot change shape', () => {
    // Unreachable from the reader, which builds one or the other. If it ever
    // happened, the older locator wins and the region is not smuggled along.
    const { sourceReference } = buildKnowledgeSourceNoteDraft(regionRequest({
      selection: { charStart: 2, charEnd: 6, selectedText: 'marg' },
    }));
    expect(sourceReference).toMatchObject({
      charStart: 2, charEnd: 6, selectedText: 'marg', region: null, appliedRotation: null,
    });
  });

  it.each([
    ['a page-only draft', {}],
    ['an exact span', { selection: { charStart: 2, charEnd: 6, selectedText: 'marg' } }],
  ])('%s still states that it has no region', (_label, overrides) => {
    const { sourceReference } = buildKnowledgeSourceNoteDraft(request(overrides));
    expect(sourceReference.region).toBeNull();
    expect(sourceReference.appliedRotation).toBeNull();
  });

  it('C12: no image, Storage or crop data reaches the draft', () => {
    const serialized = JSON.stringify(buildKnowledgeSourceNoteDraft(regionRequest()));
    for (const leaked of ['webp', 'storage', 'bucket', 'signed', 'natural', 'base64', 'dataurl']) {
      expect(serialized.toLowerCase(), leaked).not.toContain(leaked);
    }
  });
});
