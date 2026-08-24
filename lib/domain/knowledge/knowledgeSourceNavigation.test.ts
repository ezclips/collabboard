import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeSourceOpenRequest,
  knowledgeSourceCardLabel,
  knowledgeSourceEditorLabel,
  knowledgeSourcePageLabel,
} from './knowledgeSourceNavigation';
import type { SourceReference } from './knowledgePersistence';
import { asKnowledgeDocumentId, asPostId, asSourceReferenceId } from '../core/ids';

const NOTE = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const OTHER_DOCUMENT = '33333333-3333-4333-8333-333333333333';

function reference(overrides: Omit<Partial<SourceReference>, 'id'> & { id: string }): SourceReference {
  return {
    targetPadletId: asPostId(NOTE),
    sourceDocumentId: asKnowledgeDocumentId(DOCUMENT),
    pageStart: 3,
    pageEnd: 3,
    quoteText: 'page three',
    quoteHash: 'hash-1',
    charStart: null,
    charEnd: null,
    locator: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    ...overrides,
    id: asSourceReferenceId(overrides.id),
  };
}

describe('P6J-F6-B2 knowledge source navigation', () => {
  describe('page labels', () => {
    it('names a single page', () => {
      expect(knowledgeSourcePageLabel(3, 3)).toBe('p. 3');
    });

    it('names the very first page without special-casing it', () => {
      expect(knowledgeSourcePageLabel(1, 1)).toBe('p. 1');
    });

    it('names a span as a range', () => {
      expect(knowledgeSourcePageLabel(3, 5)).toBe('pp. 3–5');
    });

    it('treats an end below the start as a single page rather than an inverted range', () => {
      // The parser already rejects these, so this only pins that the label
      // never renders "pp. 5-2" if one ever arrived another way.
      expect(knowledgeSourcePageLabel(5, 2)).toBe('p. 5');
    });
  });

  describe('card label', () => {
    it('says nothing at all for a Note with no provenance', () => {
      expect(knowledgeSourceCardLabel([])).toBeNull();
    });

    it('names the page for a single reference', () => {
      expect(knowledgeSourceCardLabel([reference({ id: 'reference-1' })])).toBe('Source · p. 3');
    });

    it('names the range for a single multi-page reference', () => {
      expect(knowledgeSourceCardLabel([reference({ id: 'reference-1', pageStart: 3, pageEnd: 5 })]))
        .toBe('Source · pp. 3–5');
    });

    it('counts instead of naming pages once there are two', () => {
      const label = knowledgeSourceCardLabel([
        reference({ id: 'reference-1', pageStart: 3, pageEnd: 3 }),
        reference({ id: 'reference-2', pageStart: 9, pageEnd: 9 }),
      ]);

      // Picking one page to show would misrepresent the others.
      expect(label).toBe('2 sources');
      expect(label).not.toContain('p. 3');
    });

    it('counts three', () => {
      const references = ['reference-1', 'reference-2', 'reference-3'].map((id) => reference({ id }));
      expect(knowledgeSourceCardLabel(references)).toBe('3 sources');
    });

    it('counts two citations of the same document as two sources', () => {
      const label = knowledgeSourceCardLabel([
        reference({ id: 'reference-1', pageStart: 2, pageEnd: 2 }),
        reference({ id: 'reference-2', pageStart: 7, pageEnd: 7 }),
      ]);

      // No dedup by document: identity is the row.
      expect(label).toBe('2 sources');
    });
  });

  describe('editor labels', () => {
    it('leaves a lone source unnumbered', () => {
      const only = reference({ id: 'reference-1' });
      expect(knowledgeSourceEditorLabel(only, 0, 1)).toBe('Source · p. 3');
    });

    it('numbers each source when there are several', () => {
      const first = reference({ id: 'reference-1', pageStart: 3, pageEnd: 3 });
      const second = reference({ id: 'reference-2', pageStart: 8, pageEnd: 8, sourceDocumentId: asKnowledgeDocumentId(OTHER_DOCUMENT) });

      expect(knowledgeSourceEditorLabel(first, 0, 2)).toBe('Source 1 · p. 3');
      expect(knowledgeSourceEditorLabel(second, 1, 2)).toBe('Source 2 · p. 8');
    });

    it('numbers a span the same way', () => {
      const span = reference({ id: 'reference-1', pageStart: 4, pageEnd: 6 });
      expect(knowledgeSourceEditorLabel(span, 2, 3)).toBe('Source 3 · pp. 4–6');
    });
  });

  describe('open request', () => {
    it('carries document identity and the page range, and nothing else', () => {
      const request = buildKnowledgeSourceOpenRequest(7, reference({ id: 'reference-1', pageStart: 3, pageEnd: 5 }));

      expect(request).toEqual({
        requestId: 7,
        sourceDocumentId: DOCUMENT,
        pageStart: 3,
        pageEnd: 5,
      });
      // Never the filename, the quote, or the reference row id.
      expect(Object.keys(request).sort()).toEqual(['pageEnd', 'pageStart', 'requestId', 'sourceDocumentId']);
    });

    it('produces a distinct request each time the same source is opened', () => {
      const same = reference({ id: 'reference-1' });

      const first = buildKnowledgeSourceOpenRequest(1, same);
      const second = buildKnowledgeSourceOpenRequest(2, same);

      // The reader consumes a request once, so reopening needs a new id.
      expect(first.requestId).not.toBe(second.requestId);
      expect(first.sourceDocumentId).toBe(second.sourceDocumentId);
      expect(first).not.toBe(second);
    });

    it('keeps two documents distinct even when everything else matches', () => {
      const a = buildKnowledgeSourceOpenRequest(1, reference({ id: 'reference-1' }));
      const b = buildKnowledgeSourceOpenRequest(2, reference({ id: 'reference-2', sourceDocumentId: asKnowledgeDocumentId(OTHER_DOCUMENT) }));

      expect(a.sourceDocumentId).not.toBe(b.sourceDocumentId);
    });
  });
});
