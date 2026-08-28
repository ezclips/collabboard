import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createKnowledgeSourceRegionCropHandler,
  createRealKnowledgeSourceRegionCropSession,
  cropDerivativeToWebp,
} from './knowledgeSourceRegionCropRoute';
import type {
  KnowledgeSourceRegionCropDownload,
  KnowledgeSourceRegionCropReferenceRow,
  KnowledgeSourceRegionCropSession,
} from './knowledgeSourceRegionCropRoute';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';
import { knowledgePageDerivativePath } from '../../domain/knowledge/knowledgePdfRenderPolicy';

/**
 * P6J-F9-C1. Every dependency is injected -- no Supabase, hosted or local. The
 * handler's own orchestration (authorization order, board bindings, PAGE_REGION
 * eligibility, the single-reference target rule) is what these R-cases pin.
 */

// knowledgePageDerivativePath validates UUID shape, so fixtures must be real UUIDs.
const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BOARD_ID = '22222222-2222-4222-8222-222222222222';
const REFERENCE_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_PADLET_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_DOCUMENT_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-1';
const PAGE_NUMBER = 3;

const VALID_ROW: KnowledgeSourceRegionCropReferenceRow = {
  id: REFERENCE_ID, targetPadletId: TARGET_PADLET_ID, sourceDocumentId: SOURCE_DOCUMENT_ID,
  pageStart: PAGE_NUMBER, pageEnd: PAGE_NUMBER, quoteText: null, charStart: null, charEnd: null,
  regionX: 0.1, regionY: 0.1, regionWidth: 0.4, regionHeight: 0.5,
};

/** A tiny real WebP -- built once with the same encoder the worker uses. */
async function tinyDerivative(): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(20, 20);
  canvas.getContext('2d').fillRect(0, 0, 20, 20);
  return canvas.encode('webp', 80);
}

function context(boardId = BOARD_ID, referenceId = REFERENCE_ID) {
  return { params: Promise.resolve({ id: boardId, referenceId }) };
}
const request = () => new Request(`http://localhost/api/boards/${BOARD_ID}/knowledge/references/${REFERENCE_ID}/crop`);

function session(overrides: Partial<KnowledgeSourceRegionCropSession> = {}): KnowledgeSourceRegionCropSession {
  return {
    userId: USER_ID,
    canReadBoard: vi.fn(async () => true),
    findReferenceById: vi.fn(async () => VALID_ROW),
    countReferencesForTargetPadlet: vi.fn(async () => 1),
    validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    },
    downloadDerivative: vi.fn(async (): Promise<KnowledgeSourceRegionCropDownload> =>
      ({ kind: 'ok', bytes: await tinyDerivative() })),
    cropToWebp: vi.fn(async (bytes, region) => cropDerivativeToWebp(bytes, region)),
    ...overrides,
  };
}

async function run(sess: KnowledgeSourceRegionCropSession | null, ctx = context()) {
  const handler = createKnowledgeSourceRegionCropHandler({ getAuthenticatedSession: async () => sess });
  return handler(request(), ctx);
}

describe('P6J-F9-C1 crop route authorization order', () => {
  it('R1: unauthenticated', async () => {
    expect((await run(null)).status).toBe(401);
  });

  it('R1: a thrown session lookup fails closed to unavailable, not unauthenticated', async () => {
    const handler = createKnowledgeSourceRegionCropHandler({
      getAuthenticatedSession: async () => { throw new Error('down'); },
    });
    expect((await handler(request(), context())).status).toBe(503);
  });

  it.each([
    ['R2: a normal board viewer', session()],
    ['R3: an editor', session()],
    ['R4: an owner', session()],
  ])('%s succeeds', async (_label, sess) => {
    expect((await run(sess)).status).toBe(200);
  });

  it('R5: an authenticated but unauthorized user is denied', async () => {
    const sess = session({ canReadBoard: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(403);
  });

  it('R15: board-read lookup failure fails closed to unavailable', async () => {
    const sess = session({ canReadBoard: vi.fn(async () => { throw new Error('rpc down'); }) });
    expect((await run(sess)).status).toBe(503);
  });

  it('R9: a missing reference', async () => {
    const sess = session({ findReferenceById: vi.fn(async () => null) });
    expect((await run(sess)).status).toBe(404);
  });

  it('R6: an attacker who legitimately reads another board cannot replay a foreign reference id', async () => {
    // Board read succeeds for OTHER_BOARD_ID -- the attacker really is a member
    // there -- but the reference's own padlet/document belong to BOARD_ID, so
    // both board-scoped lookups, now filtered by the attacker's board, miss.
    const sess = session({ canReadBoard: vi.fn(async () => true), validation: {
      findTargetPadlet: vi.fn(async () => ok(null)),
      findSourceDocument: vi.fn(async () => ok(null)),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } });
    const response = await run(sess, context(OTHER_BOARD_ID, REFERENCE_ID));
    expect(response.status).toBe(404);
  });

  it('R23: a target padlet with more than one reference is never chosen among', async () => {
    const sess = session({ countReferencesForTargetPadlet: vi.fn(async () => 2) });
    expect((await run(sess)).status).toBe(404);
  });

  it('R23: zero references (deleted between count and lookup) is also refused', async () => {
    const sess = session({ countReferencesForTargetPadlet: vi.fn(async () => 0) });
    expect((await run(sess)).status).toBe(404);
  });
});

describe('P6J-F9-C1 PAGE_REGION eligibility', () => {
  it('R10: PAGE_ONLY (no region, no offsets) is refused', async () => {
    const row = { ...VALID_ROW, regionX: null, regionY: null, regionWidth: null, regionHeight: null };
    expect((await run(session({ findReferenceById: vi.fn(async () => row) }))).status).toBe(404);
  });

  it('R11: EXACT_SPAN (char offsets present) is refused even if a region also exists', async () => {
    const row = { ...VALID_ROW, charStart: 4, charEnd: 10 };
    expect((await run(session({ findReferenceById: vi.fn(async () => row) }))).status).toBe(404);
  });

  it('a non-null quoteText is refused even with a valid region', async () => {
    const row = { ...VALID_ROW, quoteText: 'whole page text' };
    expect((await run(session({ findReferenceById: vi.fn(async () => row) }))).status).toBe(404);
  });

  it('R12: page_start != page_end is refused', async () => {
    const row = { ...VALID_ROW, pageEnd: PAGE_NUMBER + 1 };
    expect((await run(session({ findReferenceById: vi.fn(async () => row) }))).status).toBe(404);
  });

  it.each([
    ['R13: a partial rectangle', { regionWidth: undefined }],
    ['R13: a string member', { regionX: '0.1' }],
    ['R13: a NaN member', { regionWidth: Number.NaN }],
    ['R13: an infinite member', { regionHeight: Number.POSITIVE_INFINITY }],
  ])('%s is not cast, and fails closed', async (_label, patch) => {
    const row = { ...VALID_ROW, ...patch };
    expect((await run(session({ findReferenceById: vi.fn(async () => row) }))).status).toBe(404);
  });
});

describe('P6J-F9-C1 board binding and page authority', () => {
  it('R7: the target padlet does not belong to the requested board', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok(null)),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } });
    expect((await run(sess)).status).toBe(404);
  });

  it('R8: the source document does not belong to the requested board', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok(null)),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } });
    expect((await run(sess)).status).toBe(404);
  });

  it('a not-ready document maps to 409, distinct from not-found', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'processing' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } });
    expect((await run(sess)).status).toBe(409);
  });

  it('the page exceeds the persisted page count', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 1, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } });
    expect((await run(sess)).status).toBe(404);
  });

  it('R14: the page geometry row is absent', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok(null)),
    } });
    expect((await run(sess)).status).toBe(404);
  });

  it('R14: invalid page geometry (zero width points)', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 0, heightPoints: 842, rotation: 0 })),
    } });
    expect((await run(sess)).status).toBe(404);
  });

  it.each([
    ['R15: a non-canonical rotation', 45],
    ['R15: a negative rotation', -90],
  ])('%s fails closed', async (_label, rotation) => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation })),
    } });
    expect((await run(sess)).status).toBe(404);
  });

  it('R15: a NULL persisted rotation is canonicalised to 0 and succeeds', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: null })),
    } });
    expect((await run(sess)).status).toBe(200);
  });

  it('an unavailable validation lookup fails closed to 503, not 404', async () => {
    const sess = session({ validation: {
      findTargetPadlet: vi.fn(async () => err(domainError('unavailable', 'down'))),
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } });
    expect((await run(sess)).status).toBe(503);
  });
});

describe('P6J-F9-C1 derivative and image failures', () => {
  it('R16: a missing derivative', async () => {
    const sess = session({ downloadDerivative: vi.fn(async (): Promise<KnowledgeSourceRegionCropDownload> => ({ kind: 'missing' })) });
    expect((await run(sess)).status).toBe(404);
  });

  it('R17: Storage unavailable', async () => {
    const sess = session({ downloadDerivative: vi.fn(async (): Promise<KnowledgeSourceRegionCropDownload> => ({ kind: 'unavailable' })) });
    expect((await run(sess)).status).toBe(503);
  });

  it('R18: decode failure', async () => {
    const sess = session({
      downloadDerivative: vi.fn(async (): Promise<KnowledgeSourceRegionCropDownload> => ({ kind: 'ok', bytes: new Uint8Array([1, 2, 3]) })),
    });
    expect((await run(sess)).status).toBe(503);
  });

  it('R19: the crop processor itself throwing', async () => {
    const sess = session({ cropToWebp: vi.fn(async () => { throw new Error('encode failed'); }) });
    expect((await run(sess)).status).toBe(503);
  });
});

describe('P6J-F9-C1 success response', () => {
  it('R20: 200, image/webp, private no-store, and the actual crop bytes', async () => {
    const response = await run(session());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('R22: the response bytes decode to the expected crop dimensions', async () => {
    // 20x20 raster, region (0.1,0.1,0.4,0.5): left=floor(2)=2, top=floor(2)=2,
    // right=ceil(0.5*20)=10, bottom=ceil(0.6*20)=12 -> 8x10.
    const response = await run(session());
    const bytes = new Uint8Array(await response.arrayBuffer());
    const { loadImage } = await import('@napi-rs/canvas');
    const image = await loadImage(Buffer.from(bytes));
    expect(image.width).toBe(8);
    expect(image.height).toBe(10);
  });

  it('M5: downloads the derivative at the reference\'s OWN page, not a fixed or default one', async () => {
    const downloadDerivative = vi.fn(async (): Promise<KnowledgeSourceRegionCropDownload> =>
      ({ kind: 'ok', bytes: await tinyDerivative() }));
    await run(session({ downloadDerivative }));
    expect(downloadDerivative).toHaveBeenCalledWith(
      knowledgePageDerivativePath(BOARD_ID, SOURCE_DOCUMENT_ID, PAGE_NUMBER),
    );
  });

  it('M6: passes the TRANSFORMED display region, not the raw source region, to the cropper when rotated', async () => {
    const cropToWebp = vi.fn(async (bytes: Uint8Array, region: unknown) => cropDerivativeToWebp(bytes, region as never));
    const sess = session({
      cropToWebp,
      validation: {
        findTargetPadlet: vi.fn(async () => ok({ boardId: BOARD_ID as never })),
        findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
        findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 90 })),
      },
    });
    await run(sess);
    // Source (0.1,0.1,0.4,0.5) at rotation 90 -> display (0.4,0.1,0.5,0.4), by
    // the locked x=1-sy-sh formula this route must never recompute inline.
    const passed = cropToWebp.mock.calls[0][1] as { x: number; y: number; width: number; height: number };
    expect(passed.x).toBeCloseTo(0.4, 9);
    expect(passed.y).toBeCloseTo(0.1, 9);
    expect(passed.width).toBeCloseTo(0.5, 9);
    expect(passed.height).toBeCloseTo(0.4, 9);
  });
});

describe('P6J-F9-C1 no client crop authority (R21, source guard)', () => {
  const serviceSource = fs.readFileSync(
    path.join(process.cwd(), 'lib/server/knowledge/knowledgeSourceRegionCropRoute.ts'), 'utf8');
  const routeSource = fs.readFileSync(
    path.join(process.cwd(), 'app/api/boards/[id]/knowledge/references/[referenceId]/crop/route.ts'), 'utf8');

  it('does not read query-string crop geometry, and route.ts stays thin', () => {
    for (const forbidden of ['searchParams', 'new URL(']) {
      expect(serviceSource, serviceSource).not.toContain(forbidden);
      expect(routeSource, routeSource).not.toContain(forbidden);
    }
  });

  it('holds no Storage path, bucket, signed URL or sharp authority', () => {
    for (const forbidden of ['createSignedUrl', 'getPublicUrl', 'sharp', 'pdfjs', 'PDFDocument', 'storagePath', 'objectKey']) {
      expect(serviceSource, forbidden).not.toContain(forbidden);
    }
  });

  it('the route context type carries only board id and reference id', () => {
    // The dynamic segment identity, not a substring scan: identifier names
    // like createRealKnowledgeSourceRegionCropSession legitimately contain
    // "Region", which a bare /region/i scan would wrongly flag.
    expect(serviceSource).toContain('readonly params: Promise<{ id: string; referenceId: string }>');
    expect(routeSource).not.toMatch(/request\.(json|url|nextUrl)|searchParams|\bquery\b/);
    expect(routeSource).toContain("export const runtime = 'nodejs'");
  });
});

/**
 * P6J-F9-C1. Everything above injects a fake `KnowledgeSourceRegionCropSession`
 * directly, which never exercises `createRealKnowledgeSourceRegionCropSession`
 * itself -- the real Supabase/Storage wiring route.ts actually depends on.
 * This is the one place that wiring runs, against a minimal in-memory fake
 * satisfying the same narrow structural shapes the real client would.
 */
describe('P6J-F9-C1 the real session factory (wiring, not orchestration)', () => {
  function fakeAdminClient(rows: {
    boards?: readonly Record<string, unknown>[]; sourceReferences?: readonly Record<string, unknown>[];
    padlets?: readonly Record<string, unknown>[]; documents?: readonly Record<string, unknown>[];
    pages?: readonly Record<string, unknown>[]; download?: () => Promise<{ data: unknown; error: unknown }>;
  }) {
    const table = (data: readonly Record<string, unknown>[]) => ({
      select: () => {
        const filters: Array<[string, unknown]> = [];
        const matches = () => data.filter((row) =>
          filters.every(([c, v]) => (Array.isArray(v) ? v.includes(row[c]) : row[c] === v)));
        const builder = {
          eq: (c: string, v: unknown) => { filters.push([c, v]); return builder; },
          in: (c: string, v: readonly unknown[]) => { filters.push([c, v]); return builder; },
          order: () => builder,
          maybeSingle: async () => ({ data: matches()[0] ?? null, error: null }),
          then: (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
            Promise.resolve({ data: matches(), error: null }).then(resolve),
        };
        return builder;
      },
    });
    const tables: Record<string, readonly Record<string, unknown>[]> = {
      boards: rows.boards ?? [], source_references: rows.sourceReferences ?? [],
      padlets: rows.padlets ?? [], knowledge_documents: rows.documents ?? [],
      knowledge_pages: rows.pages ?? [], board_collaborators: [],
    };
    return {
      from: (name: string) => table(tables[name] ?? []),
      rpc: async () => ({ data: false, error: null }),
      storage: { from: () => ({ download: rows.download ?? (async () => ({ data: null, error: { status: 404 } })) }) },
    } as unknown as SupabaseClient;
  }

  it('canReadBoard delegates to canReadBoardKnowledge under the SESSION client, not the admin one', async () => {
    const sessionClient = fakeAdminClient({ boards: [{ id: BOARD_ID, user_id: USER_ID }] });
    const untrustedAdmin = fakeAdminClient({}); // no board row here -- must not be consulted for this check
    const real = createRealKnowledgeSourceRegionCropSession(sessionClient, untrustedAdmin, USER_ID);
    expect(await real.canReadBoard(BOARD_ID)).toBe(true);
    expect(await real.canReadBoard(OTHER_BOARD_ID)).toBe(false);
  });

  it('findReferenceById maps a real row and returns null for an absent one', async () => {
    const admin = fakeAdminClient({ sourceReferences: [{
      id: REFERENCE_ID, target_padlet_id: TARGET_PADLET_ID, source_document_id: SOURCE_DOCUMENT_ID,
      page_start: PAGE_NUMBER, page_end: PAGE_NUMBER, quote_text: null, char_start: null, char_end: null,
      region_x: 0.1, region_y: 0.1, region_width: 0.4, region_height: 0.5,
    }] });
    const real = createRealKnowledgeSourceRegionCropSession(admin, admin, USER_ID);
    const row = await real.findReferenceById(REFERENCE_ID);
    expect(row).toMatchObject({ id: REFERENCE_ID, targetPadletId: TARGET_PADLET_ID, pageStart: PAGE_NUMBER, regionX: 0.1 });
    expect(await real.findReferenceById(OTHER_BOARD_ID)).toBeNull();
  });

  it('countReferencesForTargetPadlet counts the real rows for that padlet only', async () => {
    const admin = fakeAdminClient({ sourceReferences: [
      { id: 'a', target_padlet_id: TARGET_PADLET_ID, source_document_id: SOURCE_DOCUMENT_ID,
        page_start: 1, page_end: 1, quote_text: null, char_start: null, char_end: null,
        region_x: null, region_y: null, region_width: null, region_height: null },
      { id: 'b', target_padlet_id: TARGET_PADLET_ID, source_document_id: SOURCE_DOCUMENT_ID,
        page_start: 2, page_end: 2, quote_text: null, char_start: null, char_end: null,
        region_x: null, region_y: null, region_width: null, region_height: null },
      { id: 'c', target_padlet_id: OTHER_BOARD_ID, source_document_id: SOURCE_DOCUMENT_ID,
        page_start: 1, page_end: 1, quote_text: null, char_start: null, char_end: null,
        region_x: null, region_y: null, region_width: null, region_height: null },
    ] });
    const real = createRealKnowledgeSourceRegionCropSession(admin, admin, USER_ID);
    expect(await real.countReferencesForTargetPadlet(TARGET_PADLET_ID)).toBe(2);
    expect(await real.countReferencesForTargetPadlet(OTHER_BOARD_ID)).toBe(1);
  });

  it('downloadDerivative classifies ok, missing and unavailable from the real Storage shape', async () => {
    const ok = createRealKnowledgeSourceRegionCropSession(fakeAdminClient({}),
      fakeAdminClient({ download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }) }), USER_ID);
    expect((await ok.downloadDerivative('p')).kind).toBe('ok');

    const missing = createRealKnowledgeSourceRegionCropSession(fakeAdminClient({}),
      fakeAdminClient({ download: async () => ({ data: null, error: { status: 404 } }) }), USER_ID);
    expect((await missing.downloadDerivative('p')).kind).toBe('missing');

    const down = createRealKnowledgeSourceRegionCropSession(fakeAdminClient({}),
      fakeAdminClient({ download: async () => ({ data: null, error: { status: 500 } }) }), USER_ID);
    expect((await down.downloadDerivative('p')).kind).toBe('unavailable');
  });

  it('validation reuses the SAME board-scoped repository the write path already relies on', async () => {
    const admin = fakeAdminClient({ padlets: [{ id: TARGET_PADLET_ID, board_id: BOARD_ID }] });
    const real = createRealKnowledgeSourceRegionCropSession(admin, admin, USER_ID);
    const found = await real.validation.findTargetPadlet(TARGET_PADLET_ID as never, BOARD_ID as never);
    expect(found).toEqual(ok({ boardId: BOARD_ID }));
    const wrongBoard = await real.validation.findTargetPadlet(TARGET_PADLET_ID as never, OTHER_BOARD_ID as never);
    expect(wrongBoard).toEqual(ok(null));
  });
});
