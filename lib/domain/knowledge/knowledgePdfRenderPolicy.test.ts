import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_DERIVATIVE_MAX_PAGES,
  KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES,
  knowledgeDerivativeEligibility,
  knowledgePageDerivativePath,
  knowledgePageDerivativePaths,
} from './knowledgePdfRenderPolicy';

const BOARD = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const AT_LIMIT = { sourcePdfBytes: KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES, pageCount: KNOWLEDGE_DERIVATIVE_MAX_PAGES };

describe('derivative eligibility limits', () => {
  it('pins the PM-locked thresholds and accepts a document exactly on them', () => {
    expect(KNOWLEDGE_DERIVATIVE_MAX_SOURCE_BYTES).toBe(52_428_800);
    expect(KNOWLEDGE_DERIVATIVE_MAX_PAGES).toBe(200);
    expect(knowledgeDerivativeEligibility(AT_LIMIT)).toEqual({ eligible: true });
    expect(knowledgeDerivativeEligibility({ sourcePdfBytes: 28_775, pageCount: 2 }))
      .toEqual({ eligible: true });
  });

  it('refuses one byte, or one page, over the limits', () => {
    expect(knowledgeDerivativeEligibility({ ...AT_LIMIT, sourcePdfBytes: 52_428_801 }))
      .toEqual({ eligible: false, reason: 'source_too_large' });
    expect(knowledgeDerivativeEligibility({ ...AT_LIMIT, pageCount: 201 }))
      .toEqual({ eligible: false, reason: 'too_many_pages' });
  });

  it('refuses zero, negative, fractional and uncounted page counts', () => {
    // null is "nobody has counted yet" and must not be read as one page.
    for (const pageCount of [0, -1, -200, 1.5, null]) {
      expect(knowledgeDerivativeEligibility({ sourcePdfBytes: 1_000, pageCount }))
        .toEqual({ eligible: false, reason: 'invalid_page_count' });
    }
  });

  it('refuses negative, fractional and non-finite byte counts', () => {
    for (const sourcePdfBytes of [-1, 12.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(knowledgeDerivativeEligibility({ sourcePdfBytes, pageCount: 2 }))
        .toEqual({ eligible: false, reason: 'invalid_source_size' });
    }
  });

  it('reports unusable input before a threshold breach', () => {
    // Both are wrong here: the file is oversized AND nobody has counted the
    // pages. Validity is reported first, because "not counted yet" is a
    // different fact from "too big" and only one of them is final.
    expect(knowledgeDerivativeEligibility({ sourcePdfBytes: 99_999_999, pageCount: null }))
      .toEqual({ eligible: false, reason: 'invalid_page_count' });
    expect(knowledgeDerivativeEligibility({ sourcePdfBytes: Number.NaN, pageCount: 999 }))
      .toEqual({ eligible: false, reason: 'invalid_source_size' });
  });

  it('never throws and never mutates its input', () => {
    const input = Object.freeze({ sourcePdfBytes: 52_428_801, pageCount: 999 });
    expect(() => knowledgeDerivativeEligibility(input)).not.toThrow();
    expect(input).toEqual({ sourcePdfBytes: 52_428_801, pageCount: 999 });
  });
});

describe('derivative page path', () => {
  it('builds one exact, stable path that never carries the filename', () => {
    const path = knowledgePageDerivativePath(BOARD, DOCUMENT, 1);
    expect(path).toBe(`knowledge/${BOARD}/${DOCUMENT}/pages/1.webp`);
    // No random suffix, no timestamp, no user filename.
    expect(knowledgePageDerivativePath(BOARD, DOCUMENT, 1)).toBe(path);
    expect(path).not.toMatch(/\.pdf/i);
  });

  it('separates boards, documents and pages', () => {
    const other = '33333333-3333-4333-8333-333333333333';
    expect(knowledgePageDerivativePath(other, DOCUMENT, 1))
      .not.toBe(knowledgePageDerivativePath(BOARD, DOCUMENT, 1));
    expect(knowledgePageDerivativePath(BOARD, other, 1))
      .not.toBe(knowledgePageDerivativePath(BOARD, DOCUMENT, 1));
    expect(knowledgePageDerivativePath(BOARD, DOCUMENT, 2))
      .not.toBe(knowledgePageDerivativePath(BOARD, DOCUMENT, 1));
  });

  it('numbers pages from 1 and refuses anything else', () => {
    expect(knowledgePageDerivativePath(BOARD, DOCUMENT, 1)).toContain('/pages/1.webp');
    for (const pageNumber of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(knowledgePageDerivativePath(BOARD, DOCUMENT, pageNumber)).toBeNull();
    }
  });

  it('fails closed on a crafted id instead of escaping its prefix', () => {
    const crafted = ['../../other', `${BOARD}/../x`, `${BOARD}%2f..`, 'not-a-uuid', '', `${BOARD}\n${BOARD}`];
    for (const value of crafted) {
      expect(knowledgePageDerivativePath(value, DOCUMENT, 1), `board ${value}`).toBeNull();
      expect(knowledgePageDerivativePath(BOARD, value, 1), `document ${value}`).toBeNull();
    }
  });
});

describe('derivative path enumeration', () => {
  it('enumerates exactly one path per page, in order', () => {
    expect(knowledgePageDerivativePaths(BOARD, DOCUMENT, 1)).toEqual([`knowledge/${BOARD}/${DOCUMENT}/pages/1.webp`]);
    expect(knowledgePageDerivativePaths(BOARD, DOCUMENT, 3)).toEqual([
      `knowledge/${BOARD}/${DOCUMENT}/pages/1.webp`,
      `knowledge/${BOARD}/${DOCUMENT}/pages/2.webp`,
      `knowledge/${BOARD}/${DOCUMENT}/pages/3.webp`,
    ]);
  });

  it('yields nothing for an unknown or unusable page count', () => {
    for (const pageCount of [null, undefined, 0, -5, 2.5, Number.NaN]) {
      expect(knowledgePageDerivativePaths(BOARD, DOCUMENT, pageCount)).toEqual([]);
    }
  });

  it('is NOT capped at the generation limit', () => {
    // Capping would strand objects written under an older, larger policy.
    const many = knowledgePageDerivativePaths(BOARD, DOCUMENT, KNOWLEDGE_DERIVATIVE_MAX_PAGES + 50);
    expect(many).toHaveLength(250);
    expect(many.at(-1)).toBe(`knowledge/${BOARD}/${DOCUMENT}/pages/250.webp`);
  });

  it('produces no duplicates, and nothing at all for untrustworthy ids', () => {
    const paths = knowledgePageDerivativePaths(BOARD, DOCUMENT, 40);
    expect(new Set(paths).size).toBe(paths.length);
    expect(knowledgePageDerivativePaths('../escape', DOCUMENT, 3)).toEqual([]);
    expect(knowledgePageDerivativePaths(BOARD, 'not-a-uuid', 3)).toEqual([]);
  });
});
