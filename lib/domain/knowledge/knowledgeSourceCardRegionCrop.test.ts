import { describe, expect, it } from 'vitest';
import { getKnowledgeSourceCardRegionCrop } from './knowledgeSourceCardRegionCrop';
import type { SourceReference } from './knowledgePersistence';

/**
 * P6J-F9-C2. This helper is presentational only -- C1 independently repeats
 * every one of these checks server-side -- so these cases prove the client
 * hint matches C1's own PAGE_REGION eligibility shape, not that it is safe on
 * its own.
 */

const VALID_REGION = { x: 0.1, y: 0.1, width: 0.4, height: 0.5 };

function baseReference(overrides: Partial<Record<keyof SourceReference, unknown>> = {}): SourceReference {
  return {
    id: 'ref-1',
    targetPadletId: 'padlet-1',
    sourceDocumentId: 'doc-1',
    pageStart: 3,
    pageEnd: 3,
    quoteText: null,
    quoteHash: null,
    charStart: null,
    charEnd: null,
    region: VALID_REGION,
    locator: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as unknown as SourceReference;
}

describe('P6J-F9-C2 card region crop eligibility', () => {
  it('E1: no references', () => {
    expect(getKnowledgeSourceCardRegionCrop([])).toBeNull();
  });

  it('E2: one valid PAGE_REGION reference is eligible', () => {
    const ref = baseReference();
    expect(getKnowledgeSourceCardRegionCrop([ref])).toEqual({ referenceId: ref.id });
  });

  it('E3: PAGE_ONLY (no region) is not eligible', () => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ region: null })])).toBeNull();
  });

  it('E4: EXACT_SPAN (char offsets populated) is not eligible', () => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ charStart: 0, charEnd: 10 })])).toBeNull();
  });

  it('E5: region + quoteText is not eligible', () => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ quoteText: 'whole page text' })])).toBeNull();
  });

  it('E6: region + char offsets is not eligible', () => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ charStart: 1, charEnd: 2 })])).toBeNull();
  });

  it('E7: pageStart != pageEnd is not eligible', () => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ pageEnd: 4 })])).toBeNull();
  });

  it.each([
    ['NaN member', { x: Number.NaN, y: 0.1, width: 0.4, height: 0.5 }],
    ['out of range', { x: 2, y: 0, width: 0.1, height: 0.1 }],
    ['zero width', { x: 0.1, y: 0.1, width: 0, height: 0.5 }],
    ['non-object', 'not-a-region'],
    ['undefined', undefined],
  ])('E8: invalid region (%s) is not eligible', (_label, region) => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ region: region as never })])).toBeNull();
  });

  it('E9: two references, even if one is a valid PAGE_REGION, is not eligible', () => {
    const refs = [baseReference({ id: 'ref-1' }), baseReference({ id: 'ref-2', region: null })];
    expect(getKnowledgeSourceCardRegionCrop(refs)).toBeNull();
  });

  it('E10: two PAGE_REGION references is not eligible', () => {
    const refs = [baseReference({ id: 'ref-1' }), baseReference({ id: 'ref-2' })];
    expect(getKnowledgeSourceCardRegionCrop(refs)).toBeNull();
  });

  it.each([
    ['NULL page', null],
    ['zero page', 0],
    ['fractional page', 1.5],
    ['negative page', -1],
  ])('E11: PAGE_REGION with invalid page (%s) is not eligible', (_label, pageStart) => {
    expect(getKnowledgeSourceCardRegionCrop([baseReference({ pageStart: pageStart as never })])).toBeNull();
  });

  it('E12: input array is not mutated', () => {
    const refs = Object.freeze([baseReference()]);
    expect(() => getKnowledgeSourceCardRegionCrop(refs)).not.toThrow();
  });
});
