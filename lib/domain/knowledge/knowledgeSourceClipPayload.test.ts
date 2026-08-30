import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_SOURCE_CLIP_MIME,
  buildKnowledgeSourceClipTransfer,
  knowledgeSourceClipPageRequest,
  parseKnowledgeSourceClipPayload,
  type KnowledgeSourceAreaClipPayload,
  type KnowledgeSourceClipPayload,
} from './knowledgeSourceClipPayload';
import { buildKnowledgeSourceNoteDraft } from './knowledgeSourceNoteDraft';
import { MAX_SOURCE_REFERENCE_QUOTE_LENGTH } from './knowledgeSourceReferenceWrite';

/**
 * P6J-F8-B1. The parser is client hygiene, not authority -- but it is the only
 * thing standing between a foreign or forged DataTransfer and a Note creation,
 * so every rejection below is a negative control rather than a nicety.
 */

const VALID: KnowledgeSourceClipPayload = {
  kind: 'text',
  sourceDocumentId: 'aaaaaaaa-1111-4111-8111-111111111111',
  originalFilename: 'EMG_checklist.pdf',
  pageNumber: 2,
  charStart: 4,
  charEnd: 10,
  selectedText: 'safety',
};

/** The serialized payload with one field replaced -- or removed by `undefined`. */
function transferWith(overrides: Record<string, unknown>): string {
  return JSON.stringify({ ...VALID, ...overrides });
}

describe('knowledge source clip payload', () => {
  it('uses one dedicated transfer type, never text/plain', () => {
    expect(KNOWLEDGE_SOURCE_CLIP_MIME).toBe('application/collabboard-knowledge-clip');
    // The whole point: text/plain accompanies every drag on the system.
    expect(KNOWLEDGE_SOURCE_CLIP_MIME).not.toBe('text/plain');
  });

  it('round-trips a valid clip unchanged', () => {
    expect(parseKnowledgeSourceClipPayload(buildKnowledgeSourceClipTransfer(VALID))).toEqual(VALID);
  });

  it('rejects an absent, empty or malformed transfer', () => {
    for (const raw of [null, undefined, '', '   ', '{', 'not json', '[]', 'null', '"text"', '7']) {
      expect(parseKnowledgeSourceClipPayload(raw as string | null), String(raw)).toBeNull();
    }
    // A JSON array is an object to `typeof`; it carries no fields regardless.
    expect(parseKnowledgeSourceClipPayload('[{"kind":"text"}]')).toBeNull();
  });

  it('rejects an unknown or missing kind rather than defaulting to text', () => {
    // An area clip read as a text clip would fabricate offsets it never had.
    for (const kind of ['area', 'TEXT', '', 1, null, undefined]) {
      expect(parseKnowledgeSourceClipPayload(transferWith({ kind })), String(kind)).toBeNull();
    }
  });

  it('rejects a missing or empty source document identity', () => {
    for (const sourceDocumentId of ['', null, undefined, 7, {}]) {
      expect(parseKnowledgeSourceClipPayload(transferWith({ sourceDocumentId }))).toBeNull();
    }
  });

  it('rejects a page number that is not a positive integer', () => {
    for (const pageNumber of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '2', null, undefined]) {
      expect(parseKnowledgeSourceClipPayload(transferWith({ pageNumber })), String(pageNumber)).toBeNull();
    }
  });

  it('rejects offsets that are not a non-empty half-open integer range', () => {
    for (const [charStart, charEnd] of [
      [4, 4],            // empty span
      [10, 4],           // inverted
      [-1, 10],          // negative start
      [1.5, 10],         // non-integer
      [4, 10.5],
      [Number.NaN, 10],
      [4, Number.POSITIVE_INFINITY],
    ]) {
      expect(parseKnowledgeSourceClipPayload(transferWith({ charStart, charEnd })), `${charStart}..${charEnd}`).toBeNull();
    }
    // A half-supplied pair is malformed, never recovered into a page-only clip.
    expect(parseKnowledgeSourceClipPayload(transferWith({ charEnd: undefined }))).toBeNull();
    expect(parseKnowledgeSourceClipPayload(transferWith({ charStart: undefined }))).toBeNull();
  });

  it('rejects empty and oversized selected text', () => {
    expect(parseKnowledgeSourceClipPayload(transferWith({ selectedText: '' }))).toBeNull();
    expect(parseKnowledgeSourceClipPayload(transferWith({ selectedText: undefined }))).toBeNull();
    const tooLong = 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH + 1);
    expect(parseKnowledgeSourceClipPayload(transferWith({ selectedText: tooLong }))).toBeNull();
    // Exactly at the cap is still a clip: the bound is inclusive on both sides.
    const atCap = 'x'.repeat(MAX_SOURCE_REFERENCE_QUOTE_LENGTH);
    expect(parseKnowledgeSourceClipPayload(
      transferWith({ selectedText: atCap, charStart: 0, charEnd: atCap.length }),
    )).not.toBeNull();
  });

  it('keeps only the known fields, so an injected one cannot ride along', () => {
    const parsed = parseKnowledgeSourceClipPayload(transferWith({
      quoteText: 'client supplied quote',
      quoteHash: 'forged',
      locator: { bbox: {} },
      targetPadletId: 'someone-elses-note',
    }));
    expect(parsed).toEqual(VALID);
    expect(Object.keys(parsed!).sort()).toEqual([
      'charEnd', 'charStart', 'kind', 'originalFilename', 'pageNumber', 'selectedText', 'sourceDocumentId',
    ]);
  });

  it('builds the page request the EXISTING note draft builder already takes', () => {
    const request = knowledgeSourceClipPageRequest(VALID);
    expect(request.sourceDocumentId).toBe(VALID.sourceDocumentId);
    expect(request.originalFilename).toBe(VALID.originalFilename);
    expect(request.pageNumber).toBe(VALID.pageNumber);
    expect(request.selection).toEqual({ charStart: 4, charEnd: 10, selectedText: 'safety' });
    // Empty on purpose: a clip always carries a selection, which makes the
    // quote server-derived and the page text unread. Passing the selected text
    // here would quietly become a client-supplied quote.
    expect(request.pageText).toBe('');
  });

  it('produces an exact-span draft, never a page-only one', () => {
    const draft = buildKnowledgeSourceNoteDraft(knowledgeSourceClipPageRequest(VALID));
    expect(draft.title).toBe('EMG_checklist.pdf');
    // KNI-R1: the clip reuses the SAME builder as the click path, so the
    // dragged selection becomes the same safe editable body -- no second
    // conversion implementation for the drag gesture.
    expect(draft.content).toBe('<p>safety</p>');
    expect(draft.sourceReference).toEqual({
      sourceDocumentId: VALID.sourceDocumentId,
      pageStart: 2,
      pageEnd: 2,
      // Exact spans send no client quote at all -- the server slices its own page.
      quoteText: null,
      charStart: 4,
      charEnd: 10,
      selectedText: 'safety',
      region: null,
      appliedRotation: null,
    });
  });

  it('performs no IO of its own', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync('lib/domain/knowledge/knowledgeSourceClipPayload.ts', 'utf8'));
    for (const forbidden of ['fetch(', 'supabase', 'require(', 'window.', 'document.', 'knowledge/references']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  describe('area arm', () => {
    const VALID_AREA: KnowledgeSourceAreaClipPayload = {
      kind: 'area',
      sourceDocumentId: 'bbbbbbbb-2222-4222-8222-222222222222',
      originalFilename: 'knitting_stitch_patterns.pdf',
      pageNumber: 1,
      region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      appliedRotation: 90,
    };

    function areaTransferWith(overrides: Record<string, unknown>): string {
      return JSON.stringify({ ...VALID_AREA, ...overrides });
    }

    it('round-trips a valid area clip unchanged', () => {
      expect(parseKnowledgeSourceClipPayload(buildKnowledgeSourceClipTransfer(VALID_AREA))).toEqual(VALID_AREA);
    });

    it('keeps only the known area fields, so an injected one cannot ride along', () => {
      const parsed = parseKnowledgeSourceClipPayload(areaTransferWith({
        selectedText: 'smuggled text',
        charStart: 0,
        charEnd: 1,
        quoteText: 'client supplied quote',
      }));
      expect(parsed).toEqual(VALID_AREA);
      expect(Object.keys(parsed!).sort()).toEqual([
        'appliedRotation', 'kind', 'originalFilename', 'pageNumber', 'region', 'sourceDocumentId',
      ]);
    });

    it('rejects a missing, malformed or out-of-bounds region', () => {
      for (const region of [
        undefined,
        null,
        {},
        { x: 'not-a-number', y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0, width: 0, height: 0.5 }, // zero-size
        { x: 0.9, y: 0, width: 0.5, height: 0.5 }, // exceeds page bounds
        { x: Number.NaN, y: 0, width: 0.5, height: 0.5 },
        { x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 0.5 },
        'a string region',
        [0, 0, 0.5, 0.5],
      ]) {
        expect(parseKnowledgeSourceClipPayload(areaTransferWith({ region })), JSON.stringify(region)).toBeNull();
      }
    });

    it('rejects an invalid appliedRotation', () => {
      for (const appliedRotation of [45, -90, 360, 'ninety', null, undefined, 90.5]) {
        expect(parseKnowledgeSourceClipPayload(areaTransferWith({ appliedRotation })), String(appliedRotation)).toBeNull();
      }
    });

    it('rejects an area payload carrying only text fields and no valid area fields', () => {
      expect(parseKnowledgeSourceClipPayload(JSON.stringify({
        kind: 'area',
        sourceDocumentId: VALID_AREA.sourceDocumentId,
        originalFilename: VALID_AREA.originalFilename,
        pageNumber: VALID_AREA.pageNumber,
        charStart: 0,
        charEnd: 5,
        selectedText: 'hello',
      }))).toBeNull();
    });

    it('builds a region-only page request through the SAME mapper as text', () => {
      const request = knowledgeSourceClipPageRequest(VALID_AREA);
      expect(request.sourceDocumentId).toBe(VALID_AREA.sourceDocumentId);
      expect(request.originalFilename).toBe(VALID_AREA.originalFilename);
      expect(request.pageNumber).toBe(VALID_AREA.pageNumber);
      expect(request.pageText).toBe('');
      expect(request.selection).toBeNull();
      expect(request.region).toEqual({
        region: VALID_AREA.region,
        appliedRotation: VALID_AREA.appliedRotation,
      });
    });

    it('reaches buildKnowledgeSourceNoteDraft with blank content and null quote evidence', () => {
      const draft = buildKnowledgeSourceNoteDraft(knowledgeSourceClipPageRequest(VALID_AREA));
      expect(draft.title).toBe('knitting_stitch_patterns.pdf');
      expect(draft.content).toBe('');
      expect(draft.sourceReference).toEqual({
        sourceDocumentId: VALID_AREA.sourceDocumentId,
        pageStart: 1,
        pageEnd: 1,
        quoteText: null,
        charStart: null,
        charEnd: null,
        selectedText: null,
        region: VALID_AREA.region,
        appliedRotation: VALID_AREA.appliedRotation,
      });
    });
  });
});
