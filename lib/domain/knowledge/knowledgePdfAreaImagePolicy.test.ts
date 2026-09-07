import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE,
  KNOWLEDGE_PDF_AREA_SOURCE_KIND,
  buildKnowledgePdfAreaProvenance,
  knowledgeLibraryImageUrl,
  knowledgePdfAreaImagePath,
  knowledgePdfAreaImageUrl,
  parseKnowledgePdfAreaProvenance,
} from './knowledgePdfAreaImagePolicy';

/**
 * R6B, group B -- where a private crop lives, how it is addressed, and how a
 * card proves it is one. Everything here is derived from validated ids alone.
 */

const BOARD = '11111111-1111-4111-8111-111111111111';
const PADLET = '44444444-4444-4444-8444-444444444444';
const DOC = '55555555-5555-4555-8555-555555555555';
const REGION = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };
const LIBRARY_ITEM = '66666666-6666-4666-8666-666666666666';

describe('B0: the durable Library address', () => {
  it('B0a: is owner-scoped, id-keyed, and carries no board or padlet', () => {
    // The address that outlives the placement. It deliberately names NEITHER
    // the board nor the padlet: those are what die with the card.
    const url = knowledgeLibraryImageUrl(LIBRARY_ITEM);
    expect(url).toBe(`/api/library/items/${LIBRARY_ITEM}/image`);
    expect(url).not.toContain(BOARD);
    expect(url).not.toContain(PADLET);
    // Same-origin and relative, for the same reason the board URL is.
    expect(url!.startsWith('/api/')).toBe(true);
  });

  it('B0b: refuses anything that is not a UUID', () => {
    for (const hostile of ['..', '../../etc/passwd', '', ' ', `${LIBRARY_ITEM}/..`,
      'board-derived/x/pdf-areas/y.webp', 'null']) {
      expect(knowledgeLibraryImageUrl(hostile), hostile).toBeNull();
    }
    expect(knowledgeLibraryImageUrl(undefined as never)).toBeNull();
  });

  it('B0c: is a different address for the same object, never a second path', () => {
    // No storage path appears in it -- the location stays server-side.
    expect(knowledgeLibraryImageUrl(LIBRARY_ITEM)).not.toContain('board-derived');
    expect(knowledgeLibraryImageUrl(LIBRARY_ITEM)).not.toContain('.webp');
  });
});

describe('B1-B6: the object path is derived, never supplied', () => {
  it('B1: is board-scoped, padlet-keyed and deterministic', () => {
    expect(knowledgePdfAreaImagePath(BOARD, PADLET))
      .toBe(`board-derived/${BOARD}/pdf-areas/${PADLET}.webp`);
    expect(knowledgePdfAreaImagePath(BOARD, PADLET)).toBe(knowledgePdfAreaImagePath(BOARD, PADLET));
  });

  it('B2: refuses anything that is not a UUID, so traversal is unrepresentable', () => {
    const hostile = [
      '..', '../../etc/passwd', `${BOARD}/../${BOARD}`, `${BOARD}%2F..`, '', ' ', 'null',
      `${BOARD}.webp`, `${BOARD}/`, '11111111-1111-4111-8111-11111111111',
    ];
    for (const bad of hostile) {
      expect(knowledgePdfAreaImagePath(bad, PADLET), `board ${bad}`).toBeNull();
      expect(knowledgePdfAreaImagePath(BOARD, bad), `padlet ${bad}`).toBeNull();
    }
  });

  it('B3: refuses non-string ids rather than stringifying them', () => {
    for (const bad of [null, undefined, 42, {}, []]) {
      expect(knowledgePdfAreaImagePath(bad as never, PADLET), String(bad)).toBeNull();
      expect(knowledgePdfAreaImagePath(BOARD, bad as never), String(bad)).toBeNull();
    }
  });

  it('B4: never names a public bucket, and never carries the user filename', () => {
    const path = knowledgePdfAreaImagePath(BOARD, PADLET) ?? '';
    for (const forbidden of ['padlet-files', 'images/', 'thumbnails', 'public']) {
      expect(path, forbidden).not.toContain(forbidden);
    }
    expect(path).not.toContain('.pdf');
  });

  it('B5: two boards and two cards never collide', () => {
    const other = '22222222-2222-4222-8222-222222222222';
    expect(knowledgePdfAreaImagePath(other, PADLET)).not.toBe(knowledgePdfAreaImagePath(BOARD, PADLET));
    expect(knowledgePdfAreaImagePath(BOARD, DOC)).not.toBe(knowledgePdfAreaImagePath(BOARD, PADLET));
  });

  it('B6: the crop is WebP, matching the derivative it is cut from', () => {
    expect(KNOWLEDGE_PDF_AREA_IMAGE_CONTENT_TYPE).toBe('image/webp');
    expect(knowledgePdfAreaImagePath(BOARD, PADLET)).toMatch(/\.webp$/);
  });
});

describe('B7-B9: the card address is same-origin and permanent-token-free', () => {
  it('B7: is the authenticated API route, relative on purpose', () => {
    expect(knowledgePdfAreaImageUrl(BOARD, PADLET)).toBe(`/api/boards/${BOARD}/padlets/${PADLET}/image`);
  });

  it('B8: carries no token, signature, expiry or host', () => {
    const url = knowledgePdfAreaImageUrl(BOARD, PADLET) ?? '';
    for (const forbidden of ['?', 'token', 'signature', 'expires', 'http://', 'https://', 'supabase']) {
      expect(url, forbidden).not.toContain(forbidden);
    }
  });

  it('B9: refuses to address anything whose ids are not UUIDs', () => {
    expect(knowledgePdfAreaImageUrl('..', PADLET)).toBeNull();
    expect(knowledgePdfAreaImageUrl(BOARD, '../secret')).toBeNull();
  });
});

describe('B10-B14: provenance is typed, and is the gate the image route reads', () => {
  it('B10: round-trips through the card metadata shape', () => {
    const provenance = buildKnowledgePdfAreaProvenance(DOC, 3, REGION);
    expect(provenance).toEqual({ kind: KNOWLEDGE_PDF_AREA_SOURCE_KIND, knowledgeDocumentId: DOC, pageNumber: 3, region: REGION });
    expect(parseKnowledgePdfAreaProvenance({ source: provenance })).toEqual(provenance);
  });

  it('B11: an ordinary image card is NOT an area image', () => {
    // This is what stops the image route from serving any padlet id at all.
    for (const metadata of [
      {},
      { imageUrl: 'https://example.test/a.png' },
      { source: null },
      { source: 'knowledge-pdf-area' },
      { source: { kind: 'text' } },
      { source: { kind: 'knowledge-pdf-page' } },
    ]) {
      expect(parseKnowledgePdfAreaProvenance(metadata), JSON.stringify(metadata)).toBeNull();
    }
  });

  it('B11b: the KIND alone decides -- a fully-formed record of another kind is refused', () => {
    // Without this the discriminator would be decorative: every other field of
    // a text citation's provenance is shaped exactly like an area's, so the
    // image route would happily serve a crop for a card that has none.
    const wellFormed = { knowledgeDocumentId: DOC, pageNumber: 3, region: REGION };
    for (const kind of ['text', 'knowledge-pdf-page', 'image', 'KNOWLEDGE-PDF-AREA',
      'knowledge_pdf_area', '', null, undefined, 42]) {
      expect(parseKnowledgePdfAreaProvenance({ source: { ...wellFormed, kind } }), String(kind)).toBeNull();
    }
    // ...and the right kind, with the same fields, is accepted.
    expect(parseKnowledgePdfAreaProvenance({
      source: { ...wellFormed, kind: KNOWLEDGE_PDF_AREA_SOURCE_KIND },
    })).not.toBeNull();
  });

  it('B12: absent, non-object and array metadata all fail closed', () => {
    for (const metadata of [null, undefined, 'x', 7, [], [{ source: { kind: KNOWLEDGE_PDF_AREA_SOURCE_KIND } }]]) {
      expect(parseKnowledgePdfAreaProvenance(metadata), String(metadata)).toBeNull();
    }
  });

  it('B13: a provenance with a broken document id, page or rectangle is refused', () => {
    const good = buildKnowledgePdfAreaProvenance(DOC, 3, REGION);
    const broken = [
      { ...good, knowledgeDocumentId: 'not-a-uuid' },
      { ...good, knowledgeDocumentId: '' },
      { ...good, pageNumber: 0 },
      { ...good, pageNumber: 1.5 },
      { ...good, pageNumber: '3' },
      { ...good, region: { x: 0.1, y: 0.1, width: 0, height: 0.4 } },
      { ...good, region: { x: 0.9, y: 0.1, width: 0.4, height: 0.4 } },
      { ...good, region: undefined },
    ];
    for (const source of broken) {
      expect(parseKnowledgePdfAreaProvenance({ source }), JSON.stringify(source)).toBeNull();
    }
  });

  it('B14: parsing rebuilds provenance, so a stored path cannot ride along', () => {
    // The image route derives its path from route parameters. If a stored
    // path survived parsing it would immediately become a way to point one
    // board's card at another board's private object.
    const parsed = parseKnowledgePdfAreaProvenance({
      source: {
        ...buildKnowledgePdfAreaProvenance(DOC, 3, REGION),
        storagePath: 'board-derived/other/pdf-areas/x.webp',
        bucket: 'padlet-files',
        publicUrl: 'https://example.test/public.webp',
      },
    });
    expect(Object.keys(parsed ?? {}).sort())
      .toEqual(['kind', 'knowledgeDocumentId', 'pageNumber', 'region']);
  });
});
