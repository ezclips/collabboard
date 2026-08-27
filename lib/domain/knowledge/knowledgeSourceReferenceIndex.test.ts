import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX,
  buildKnowledgeSourceReferenceIndex,
  knowledgeSourceReferencesFor,
  parseKnowledgeSourceReference,
  upsertKnowledgeSourceReference,
} from './knowledgeSourceReferenceIndex';
import type { SourceReference } from './knowledgePersistence';
import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../core/ids';

const NOTE_A = '11111111-1111-4111-8111-111111111111';
const NOTE_B = '22222222-2222-4222-8222-222222222222';
const DOCUMENT = '33333333-3333-4333-8333-333333333333';
const OTHER_DOCUMENT = '44444444-4444-4444-8444-444444444444';

function reference(overrides: Omit<Partial<SourceReference>, 'id'> & { id: string }): SourceReference {
  return {
    targetPadletId: asPostId(NOTE_A),
    sourceDocumentId: asKnowledgeDocumentId(DOCUMENT),
    pageStart: 1,
    pageEnd: 1,
    quoteText: 'a quoted passage',
    quoteHash: 'hash-1',
    charStart: null,
    charEnd: null,
    region: null,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
    id: asSourceReferenceId(overrides.id),
  };
}

describe('P6J-F6 knowledge source reference index', () => {
  describe('buildKnowledgeSourceReferenceIndex', () => {
    it('turns an empty list into an empty index', () => {
      const index = buildKnowledgeSourceReferenceIndex([]);

      expect(index.size).toBe(0);
      expect(knowledgeSourceReferencesFor(index, NOTE_A)).toEqual([]);
    });

    it('groups one reference under its target padlet', () => {
      const only = reference({ id: 'reference-1' });

      const index = buildKnowledgeSourceReferenceIndex([only]);

      expect(index.size).toBe(1);
      expect(knowledgeSourceReferencesFor(index, NOTE_A)).toEqual([only]);
    });

    it('keeps both references when one Note cites twice', () => {
      const first = reference({ id: 'reference-1', pageStart: 3, pageEnd: 3, createdAt: '2026-08-24T00:00:00.000Z' });
      const second = reference({ id: 'reference-2', pageStart: 9, pageEnd: 9, createdAt: '2026-08-24T00:00:01.000Z' });

      const index = buildKnowledgeSourceReferenceIndex([first, second]);

      expect(knowledgeSourceReferencesFor(index, NOTE_A)).toEqual([first, second]);
    });

    it('separates references belonging to different targets', () => {
      const onA = reference({ id: 'reference-1' });
      const onB = reference({ id: 'reference-2', targetPadletId: asPostId(NOTE_B) });

      const index = buildKnowledgeSourceReferenceIndex([onA, onB]);

      expect(index.size).toBe(2);
      expect(knowledgeSourceReferencesFor(index, NOTE_A)).toEqual([onA]);
      expect(knowledgeSourceReferencesFor(index, NOTE_B)).toEqual([onB]);
    });

    it('gives a padlet with no references no key at all', () => {
      const index = buildKnowledgeSourceReferenceIndex([reference({ id: 'reference-1' })]);

      // "Has provenance" is a plain has(), never a length check on an empty array.
      expect(index.has(NOTE_B)).toBe(false);
      expect(knowledgeSourceReferencesFor(index, NOTE_B)).toEqual([]);
    });

    it('orders a bucket by createdAt regardless of input order', () => {
      const later = reference({ id: 'reference-1', createdAt: '2026-08-24T10:00:00.000Z' });
      const earlier = reference({ id: 'reference-2', createdAt: '2026-08-24T09:00:00.000Z' });

      const index = buildKnowledgeSourceReferenceIndex([later, earlier]);

      expect(knowledgeSourceReferencesFor(index, NOTE_A).map((entry) => entry.id))
        .toEqual(['reference-2', 'reference-1']);
    });

    it('falls back to id when two references share a createdAt', () => {
      const sameInstant = '2026-08-24T00:00:00.000Z';
      const b = reference({ id: 'reference-b', createdAt: sameInstant });
      const a = reference({ id: 'reference-a', createdAt: sameInstant });

      const index = buildKnowledgeSourceReferenceIndex([b, a]);

      // createdAt alone is not a total order for citations saved together.
      expect(knowledgeSourceReferencesFor(index, NOTE_A).map((entry) => entry.id))
        .toEqual(['reference-a', 'reference-b']);
    });

    it('keeps two citations of the same document as separate rows', () => {
      const page3 = reference({ id: 'reference-1', pageStart: 3, pageEnd: 3, createdAt: '2026-08-24T00:00:00.000Z' });
      const page7 = reference({ id: 'reference-2', pageStart: 7, pageEnd: 7, createdAt: '2026-08-24T00:00:01.000Z' });
      const otherDoc = reference({ id: 'reference-3', sourceDocumentId: asKnowledgeDocumentId(OTHER_DOCUMENT), createdAt: '2026-08-24T00:00:02.000Z' });

      const index = buildKnowledgeSourceReferenceIndex([page3, page7, otherDoc]);

      // No citation-level dedup: identity is the row id, not document+page.
      expect(knowledgeSourceReferencesFor(index, NOTE_A)).toHaveLength(3);
      expect(knowledgeSourceReferencesFor(index, NOTE_A).map((entry) => entry.pageStart)).toEqual([3, 7, 1]);
    });
  });

  describe('upsertKnowledgeSourceReference', () => {
    it('adds a reference to a target that had none', () => {
      const added = reference({ id: 'reference-1' });

      const index = upsertKnowledgeSourceReference(EMPTY_KNOWLEDGE_SOURCE_REFERENCE_INDEX, added);

      expect(knowledgeSourceReferencesFor(index, NOTE_A)).toEqual([added]);
    });

    it('leaves the previous Map untouched', () => {
      const before = buildKnowledgeSourceReferenceIndex([reference({ id: 'reference-1' })]);

      const after = upsertKnowledgeSourceReference(before, reference({ id: 'reference-2', targetPadletId: asPostId(NOTE_B) }));

      expect(before.size).toBe(1);
      expect(before.has(NOTE_B)).toBe(false);
      expect(after.size).toBe(2);
      expect(after).not.toBe(before);
    });

    it('leaves the previous target array untouched', () => {
      const first = reference({ id: 'reference-1', createdAt: '2026-08-24T00:00:00.000Z' });
      const before = buildKnowledgeSourceReferenceIndex([first]);
      const beforeBucket = knowledgeSourceReferencesFor(before, NOTE_A);

      const after = upsertKnowledgeSourceReference(before, reference({ id: 'reference-2', createdAt: '2026-08-24T00:00:01.000Z' }));

      expect(beforeBucket).toEqual([first]);
      expect(beforeBucket).toHaveLength(1);
      expect(knowledgeSourceReferencesFor(after, NOTE_A)).toHaveLength(2);
      expect(knowledgeSourceReferencesFor(after, NOTE_A)).not.toBe(beforeBucket);
    });

    it('does not duplicate a reference id it already holds', () => {
      const existing = reference({ id: 'reference-1' });
      const before = buildKnowledgeSourceReferenceIndex([existing]);

      // The same row can arrive twice: once optimistically after the write,
      // once from a later board load.
      const after = upsertKnowledgeSourceReference(before, existing);

      expect(knowledgeSourceReferencesFor(after, NOTE_A)).toHaveLength(1);
      expect(knowledgeSourceReferencesFor(after, NOTE_A)).toEqual([existing]);
    });

    it('keeps a re-sent row in deterministic order rather than appending it', () => {
      const early = reference({ id: 'reference-a', createdAt: '2026-08-24T09:00:00.000Z' });
      const late = reference({ id: 'reference-b', createdAt: '2026-08-24T10:00:00.000Z' });
      const before = buildKnowledgeSourceReferenceIndex([early, late]);

      const after = upsertKnowledgeSourceReference(before, early);

      expect(knowledgeSourceReferencesFor(after, NOTE_A).map((entry) => entry.id))
        .toEqual(['reference-a', 'reference-b']);
    });

    it('inserts in createdAt order instead of always at the end', () => {
      const late = reference({ id: 'reference-b', createdAt: '2026-08-24T10:00:00.000Z' });
      const before = buildKnowledgeSourceReferenceIndex([late]);

      const after = upsertKnowledgeSourceReference(before, reference({ id: 'reference-a', createdAt: '2026-08-24T09:00:00.000Z' }));

      expect(knowledgeSourceReferencesFor(after, NOTE_A).map((entry) => entry.id))
        .toEqual(['reference-a', 'reference-b']);
    });

    it('leaves unrelated targets exactly as they were', () => {
      const onB = reference({ id: 'reference-2', targetPadletId: asPostId(NOTE_B) });
      const before = buildKnowledgeSourceReferenceIndex([reference({ id: 'reference-1' }), onB]);
      const bucketB = knowledgeSourceReferencesFor(before, NOTE_B);

      const after = upsertKnowledgeSourceReference(before, reference({ id: 'reference-3', createdAt: '2026-08-24T00:00:05.000Z' }));

      expect(knowledgeSourceReferencesFor(after, NOTE_B)).toBe(bucketB);
      expect(knowledgeSourceReferencesFor(after, NOTE_B)).toEqual([onB]);
    });

    it('keeps a second citation of the same document and page as its own row', () => {
      const first = reference({ id: 'reference-1', pageStart: 4, pageEnd: 4, createdAt: '2026-08-24T00:00:00.000Z' });
      const before = buildKnowledgeSourceReferenceIndex([first]);

      const duplicateCitation = reference({ id: 'reference-2', pageStart: 4, pageEnd: 4, createdAt: '2026-08-24T00:00:01.000Z' });
      const after = upsertKnowledgeSourceReference(before, duplicateCitation);

      // Same document, same page, different row: both survive.
      expect(knowledgeSourceReferencesFor(after, NOTE_A)).toEqual([first, duplicateCitation]);
    });
  });

  describe('parseKnowledgeSourceReference', () => {
    const body = {
      id: 'reference-1',
      targetPadletId: NOTE_A,
      sourceDocumentId: DOCUMENT,
      pageStart: 3,
      pageEnd: 3,
      quoteText: 'page three',
      quoteHash: 'hash-1',
      charStart: null,
      charEnd: null,
      locator: null,
      createdAt: '2026-08-24T00:00:00.000Z',
    };

    it('accepts the reference the write route returns', () => {
      // I1: a page-only body carries no rectangle, and says so explicitly.
      expect(parseKnowledgeSourceReference(body)).toEqual({ ...body, id: 'reference-1', region: null });
    });

    it('rejects payloads missing an identifying field', () => {
      for (const field of ['id', 'targetPadletId', 'sourceDocumentId', 'createdAt', 'pageStart', 'pageEnd']) {
        expect(parseKnowledgeSourceReference({ ...body, [field]: undefined })).toBeNull();
      }
    });

    it('rejects non-object payloads', () => {
      for (const value of [null, undefined, 'reference', 42, [body]]) {
        expect(parseKnowledgeSourceReference(value)).toBeNull();
      }
    });

    it('degrades optional provenance to null instead of rejecting the reference', () => {
      const parsed = parseKnowledgeSourceReference({
        ...body, quoteText: undefined, quoteHash: undefined, charStart: 'x', charEnd: undefined, locator: undefined,
      });

      expect(parsed).toMatchObject({
        id: 'reference-1', quoteText: null, quoteHash: null, charStart: null, charEnd: null, locator: null,
      });
    });

    it('rejects non-integer pages rather than indexing a fractional citation', () => {
      expect(parseKnowledgeSourceReference({ ...body, pageStart: 1.5 })).toBeNull();
    });

    // P6J-F6-B1H: the same minimum range invariants the write command enforces
    // before insert and the table's CHECK constraints hold afterwards. Without
    // these a well-typed but impossible payload would reach a badge as "p. 5-2".
    it.each([
      ['page zero', { pageStart: 0, pageEnd: 0 }],
      ['negative start', { pageStart: -1, pageEnd: 3 }],
      ['negative start and end', { pageStart: -5, pageEnd: -2 }],
      ['inverted range', { pageStart: 5, pageEnd: 2 }],
      ['end below a valid start', { pageStart: 2, pageEnd: 1 }],
    ])('rejects %s', (_label, pages) => {
      expect(parseKnowledgeSourceReference({ ...body, ...pages })).toBeNull();
    });

    it.each([
      ['the first page', { pageStart: 1, pageEnd: 1 }],
      ['a single later page', { pageStart: 3, pageEnd: 3 }],
      ['a valid span', { pageStart: 3, pageEnd: 5 }],
    ])('accepts %s', (_label, pages) => {
      expect(parseKnowledgeSourceReference({ ...body, ...pages })).toMatchObject(pages);
    });

    /**
     * P6J-F9-B2. The region reaches the client index through the SAME validator
     * the write path uses. Anything that is not a whole, in-bounds rectangle
     * degrades to no region: a citation still points at its page, which is more
     * useful than refusing the whole reference over optional geometry.
     */
    describe('P6J-F9-B2 region propagation', () => {
      const REGION = { x: 0.25, y: 0.1, width: 0.5, height: 0.4 };

      it('I3: carries a valid rectangle through', () => {
        expect(parseKnowledgeSourceReference({ ...body, region: REGION })?.region).toEqual(REGION);
      });

      it('I2: an exact span carries no region', () => {
        const parsed = parseKnowledgeSourceReference({ ...body, charStart: 4, charEnd: 9 });
        expect(parsed).toMatchObject({ charStart: 4, charEnd: 9, region: null });
      });

      it.each([
        ['I4 a partial rectangle', { x: 0.25, y: 0.1, width: 0.5 }],
        ['I4 an empty object', {}],
        ['I5 a NaN edge', { ...REGION, x: Number.NaN }],
        ['I5 an infinite width', { ...REGION, width: Number.POSITIVE_INFINITY }],
        ['I5 string members', { x: '0.25', y: '0.1', width: '0.5', height: '0.4' }],
        ['a zero width', { ...REGION, width: 0 }],
        ['a negative origin', { ...REGION, x: -0.1 }],
        ['a rectangle past the page edge', { ...REGION, x: 0.7, width: 0.5 }],
        ['an array', [0.25, 0.1, 0.5, 0.4]],
        ['a number', 4],
        ['a string', '0.25'],
      ])('%s fails closed to no region, keeping the citation', (_label, region) => {
        const parsed = parseKnowledgeSourceReference({ ...body, region });
        expect(parsed).not.toBeNull();
        expect(parsed!.region).toBeNull();
      });

      it('trims only the float overhang an edge selection produces', () => {
        const edge = { x: 0.5, y: 0.5, width: 0.5 + 1e-12, height: 0.5 };
        const parsed = parseKnowledgeSourceReference({ ...body, region: edge });
        expect(parsed!.region!.x + parsed!.region!.width).toBeLessThanOrEqual(1);
        expect(parsed!.region!.width).toBeCloseTo(0.5, 9);
      });

      it('I6: the domain shape REQUIRES region, so no site can silently omit it', () => {
        const source = fs.readFileSync(
          path.join(process.cwd(), 'lib/domain/knowledge/knowledgePersistence.ts'), 'utf8');
        // Several test factories cast their way to a SourceReference, so the
        // compiler alone would not notice this loosening again.
        expect(source).toContain('readonly region: NormalizedPageRegion | null;');
        expect(source).not.toContain('readonly region?:');
      });

      it('I6: the parser validates rather than casting the payload through', () => {
        const source = fs.readFileSync(
          path.join(process.cwd(), 'lib/domain/knowledge/knowledgeSourceReferenceIndex.ts'), 'utf8');
        expect(source).toContain('normalizeStorableRegion(record.region)');
        expect(source).not.toMatch(/record\.region as/);
      });
    });
  });
});
