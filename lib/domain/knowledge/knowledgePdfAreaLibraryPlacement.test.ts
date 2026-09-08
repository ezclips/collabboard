import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  KNOWLEDGE_PDF_AREA_PLACEMENT_URL_ALIASES,
  buildKnowledgePdfAreaPlacementMetadata,
  knowledgePdfAreaProvenanceMatches,
} from './knowledgePdfAreaLibraryPlacement';
import { buildKnowledgePdfAreaProvenance } from './knowledgePdfAreaImagePolicy';
import { resolveImagePostDisplaySrc } from '../canvas/imagePostDisplaySource';

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE, group P -- the rebinding contract.
 *
 * The defect these exist for was runtime-proved: a reused PDF-area card carried
 * `metadata.imageUrl` addressing the ORIGIN placement, which the renderer reads
 * before every row-level field, so the card painted nothing (naturalWidth 0)
 * while its Library object was perfectly healthy.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const PADLET_ID = '44444444-4444-4444-8444-444444444444';
const ORIGIN_BOARD_ID = '22222222-2222-4222-8222-222222222222';
const ORIGIN_PADLET_ID = '33333333-3333-4333-8333-333333333333';
const DOC_ID = '55555555-5555-4555-8555-555555555555';
const LIBRARY_ID = '66666666-6666-4666-8666-666666666666';

const TARGET_URL = `/api/boards/${BOARD_ID}/padlets/${PADLET_ID}/image`;
const ORIGIN_URL = `/api/boards/${ORIGIN_BOARD_ID}/padlets/${ORIGIN_PADLET_ID}/image`;

const PROVENANCE = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });

const target = { boardId: BOARD_ID, padletId: PADLET_ID };

/** The stored Library snapshot metadata, as the durable row actually holds it. */
const libraryMetadata = (extra: Record<string, unknown> = {}) => ({
  imageUrl: ORIGIN_URL,
  source: PROVENANCE,
  ...extra,
});

describe('P1-P6: the placement is rebound to its OWN address', () => {
  it('P1 (R1, R2): metadata.imageUrl becomes the TARGET board placement URL', () => {
    const built = buildKnowledgePdfAreaPlacementMetadata(libraryMetadata(), target);
    expect(built).not.toBeNull();
    expect(built!.imageUrl).toBe(TARGET_URL);
    expect(built!.metadata.imageUrl).toBe(TARGET_URL);
    // The origin address is gone from the placement entirely.
    expect(JSON.stringify(built!.metadata)).not.toContain(ORIGIN_PADLET_ID);
  });

  it('P2 (R2): it is a BOARD address, never the owner-only Library route', () => {
    const built = buildKnowledgePdfAreaPlacementMetadata(libraryMetadata(), target);
    expect(built!.metadata.imageUrl).toMatch(/^\/api\/boards\//);
    expect(JSON.stringify(built!.metadata)).not.toContain('/api/library/items/');
    expect(JSON.stringify(built!.metadata)).not.toContain(LIBRARY_ID);
  });

  it('P3 (R3): every placement-local alias PRESENT in the snapshot is rebound', () => {
    const built = buildKnowledgePdfAreaPlacementMetadata(
      libraryMetadata({ fileUrl: ORIGIN_URL, file_url: `/api/library/items/${LIBRARY_ID}/image` }),
      target,
    );
    expect(built!.metadata.fileUrl).toBe(TARGET_URL);
    expect(built!.metadata.file_url).toBe(TARGET_URL);
    // Which is exactly the chain the board renderer walks, in its order.
    expect([...KNOWLEDGE_PDF_AREA_PLACEMENT_URL_ALIASES]).toEqual(['imageUrl', 'fileUrl', 'file_url']);
  });

  it('P4 (R3): an alias the snapshot never had is not invented', () => {
    const built = buildKnowledgePdfAreaPlacementMetadata(libraryMetadata(), target);
    expect(Object.prototype.hasOwnProperty.call(built!.metadata, 'fileUrl')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(built!.metadata, 'file_url')).toBe(false);
  });

  it('P5 (R4): the Library metadata object is never written through', () => {
    const source = libraryMetadata({ fileUrl: ORIGIN_URL, drawing: 'https://cdn.test/d.png' });
    const before = JSON.parse(JSON.stringify(source));
    const built = buildKnowledgePdfAreaPlacementMetadata(source, target);
    expect(source).toEqual(before);
    expect(source.imageUrl).toBe(ORIGIN_URL);
    // And the result is a different object, not an aliased view of it.
    expect(built!.metadata).not.toBe(source);
  });

  it('P6 (R5, R6): the composite and the provenance survive untouched', () => {
    const drawing = 'https://cdn.test/composite.png';
    const previewUrl = 'data:image/svg+xml;base64,AAA';
    const built = buildKnowledgePdfAreaPlacementMetadata(
      libraryMetadata({ drawing, previewUrl }), target,
    );
    // `drawing` is durable CONTENT, not an address of this placement: rebinding
    // it would replace what the user drew with the un-annotated crop.
    expect(built!.metadata.drawing).toBe(drawing);
    // `previewUrl` is the drawing/SVG preview in this repository, ranked with
    // the composite family and never read by the board renderer.
    expect(built!.metadata.previewUrl).toBe(previewUrl);
    expect(built!.metadata.source).toEqual(PROVENANCE);
    expect(built!.provenance).toEqual(PROVENANCE);
  });
});

describe('P7-P10: it refuses everything that is not a durable PDF-area image', () => {
  it('P7: metadata without valid provenance yields null, never a half-rebound card', () => {
    for (const metadata of [
      null, undefined, 'a string', 42, [],
      {},
      { imageUrl: ORIGIN_URL },
      { source: { kind: 'text' } },
      { source: { kind: 'knowledge-pdf-area' } },
      { source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: 'not-a-uuid', pageNumber: 1, region: { x: 0, y: 0, width: 1, height: 1 } } },
      { source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: DOC_ID, pageNumber: 0, region: { x: 0, y: 0, width: 1, height: 1 } } },
      { source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: DOC_ID, pageNumber: 1, region: { x: 0, y: 0, width: 0, height: 1 } } },
    ]) {
      expect(buildKnowledgePdfAreaPlacementMetadata(metadata, target), JSON.stringify(metadata)).toBeNull();
    }
  });

  it('P8: a non-UUID board or padlet id yields no address, so no metadata', () => {
    expect(buildKnowledgePdfAreaPlacementMetadata(libraryMetadata(), { boardId: '../x', padletId: PADLET_ID })).toBeNull();
    expect(buildKnowledgePdfAreaPlacementMetadata(libraryMetadata(), { boardId: BOARD_ID, padletId: '../x' })).toBeNull();
  });

  it('P9: placement-only and container-only fields are dropped by the shared sanitiser', () => {
    const built = buildKnowledgePdfAreaPlacementMetadata(
      libraryMetadata({
        parentId: 'c1', childPadletIds: ['a'], sectionId: 's1',
        sectionPosition: 2, position_in_timeline: 3, wallPosition: { x: 1 },
        keptField: 'kept',
      }),
      target,
    );
    for (const dropped of ['parentId', 'childPadletIds', 'sectionId', 'sectionPosition',
      'position_in_timeline', 'wallPosition']) {
      expect(built!.metadata, dropped).not.toHaveProperty(dropped);
    }
    // Everything else the durable snapshot carried is preserved.
    expect(built!.metadata.keptField).toBe('kept');
  });

  it('P10: the sanitation contract is imported, not restated', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/knowledge/knowledgePdfAreaLibraryPlacement.ts'), 'utf8',
    );
    expect(source).toContain('sanitizeLibraryMetadata');
    // A second copy of the field list is exactly how the two would drift apart.
    expect(source).not.toContain('delete ');
  });
});

describe('P11-P13: canonical semantic provenance equality', () => {
  it('P11: the same source, page and region matches by VALUE, not identity', () => {
    const a = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const b = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(a).not.toBe(b);
    expect(knowledgePdfAreaProvenanceMatches(a, b)).toBe(true);
  });

  it('P12: any differing field fails closed', () => {
    const base = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    const others = [
      buildKnowledgePdfAreaProvenance('88888888-8888-4888-8888-888888888888', 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
      buildKnowledgePdfAreaProvenance(DOC_ID, 4, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }),
      buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.11, y: 0.2, width: 0.3, height: 0.4 }),
      buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.21, width: 0.3, height: 0.4 }),
      buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.31, height: 0.4 }),
      buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.41 }),
    ];
    for (const other of others) expect(knowledgePdfAreaProvenanceMatches(base, other)).toBe(false);
  });

  it('P13: a missing side never matches -- absence is not agreement', () => {
    const base = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
    expect(knowledgePdfAreaProvenanceMatches(base, null)).toBe(false);
    expect(knowledgePdfAreaProvenanceMatches(null, base)).toBe(false);
    expect(knowledgePdfAreaProvenanceMatches(null, null)).toBe(false);
    expect(knowledgePdfAreaProvenanceMatches(base, undefined)).toBe(false);
  });
});

describe('P14-P15 (R24): the renderer is unchanged, and now agrees with the placement', () => {
  it('P14: the rebound card resolves to its own board address, with no ordering change', () => {
    const built = buildKnowledgePdfAreaPlacementMetadata(
      libraryMetadata({ fileUrl: ORIGIN_URL }), target,
    );
    // The row-level field is deliberately NOT what wins: metadata still
    // outranks it, exactly as before. It is the metadata that was corrected.
    expect(resolveImagePostDisplaySrc({
      metadata: built!.metadata,
      file_url: `/api/library/items/${LIBRARY_ID}/image`,
    })).toBe(TARGET_URL);
    // And a saved composite still outranks the base, as it always did.
    const annotated = buildKnowledgePdfAreaPlacementMetadata(
      libraryMetadata({ drawing: 'https://cdn.test/composite.png' }), target,
    );
    expect(resolveImagePostDisplaySrc({ metadata: annotated!.metadata })).toBe('https://cdn.test/composite.png');
  });

  it('P15: the display resolver source keeps its exact original order', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'lib/domain/canvas/imagePostDisplaySource.ts'), 'utf8',
    );
    const order = ['metadata?.drawing', 'metadata?.imageUrl', 'metadata?.fileUrl',
      'metadata?.file_url', 'padlet.image_url', 'padlet.file_url'];
    let cursor = -1;
    for (const field of order) {
      const at = source.indexOf(field, cursor + 1);
      expect(at, field).toBeGreaterThan(cursor);
      cursor = at;
    }
  });
});
