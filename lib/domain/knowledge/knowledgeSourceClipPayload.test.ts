import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_SOURCE_CLIP_MIME,
  buildKnowledgeSourceClipTransfer,
  knowledgeSourceClipPageRequest,
  parseKnowledgeSourceClipPayload,
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
    // The selected passage is evidence, not authorship.
    expect(draft.content).toBe('');
    expect(draft.sourceReference).toEqual({
      sourceDocumentId: VALID.sourceDocumentId,
      pageStart: 2,
      pageEnd: 2,
      // Exact spans send no client quote at all -- the server slices its own page.
      quoteText: null,
      charStart: 4,
      charEnd: 10,
      selectedText: 'safety',
    });
  });

  it('performs no IO of its own', async () => {
    const source = await import('node:fs').then(({ readFileSync }) =>
      readFileSync('lib/domain/knowledge/knowledgeSourceClipPayload.ts', 'utf8'));
    for (const forbidden of ['fetch(', 'supabase', 'require(', 'window.', 'document.', 'knowledge/references']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });
});
