import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createKnowledgePdfAreaImageServeHandler,
  type KnowledgePdfAreaImageMappedLibraryItem,
  type KnowledgePdfAreaImageServeRow,
  type KnowledgePdfAreaImageServeSession,
} from './knowledgePdfAreaImageServeRoute';
import { buildKnowledgePdfAreaProvenance } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

/**
 * R6B, group D -- the ONLY address a private crop has.
 *
 * There is no public object and no signed URL in this feature, so this route
 * is the access control. These pin that it re-authorises every read, that it
 * refuses to serve anything that is not a proven area card, and that it never
 * trusts a stored path.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BOARD_ID = '22222222-2222-4222-8222-222222222222';
const PADLET_ID = '44444444-4444-4444-8444-444444444444';
const DOC_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-1';
const OBJECT_PATH = `board-derived/${BOARD_ID}/pdf-areas/${PADLET_ID}.webp`;

const PROVENANCE = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
const BYTES = new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]);

const context = (boardId = BOARD_ID, padletId = PADLET_ID) =>
  ({ params: Promise.resolve({ id: boardId, padletId }) });

const request = () => new Request(`http://localhost/api/boards/${BOARD_ID}/padlets/${PADLET_ID}/image`);

/** A proven area card on THIS board, with no reuse mapping behind it. */
const row = (overrides: Partial<KnowledgePdfAreaImageServeRow> = {}): KnowledgePdfAreaImageServeRow => ({
  id: PADLET_ID,
  boardId: BOARD_ID,
  metadata: { source: PROVENANCE },
  libraryItemId: null,
  ...overrides,
});

function session(overrides: Partial<KnowledgePdfAreaImageServeSession> = {}): KnowledgePdfAreaImageServeSession {
  return {
    userId: USER_ID,
    canReadBoard: vi.fn(async () => true),
    findPadlet: vi.fn(async () => row()),
    downloadAreaImage: vi.fn(async () => ({ kind: 'ok' as const, bytes: BYTES })),
    // The reuse fallback is never consulted while the direct object exists.
    findPlacementMapping: vi.fn(async () => null),
    findMappedLibraryItem: vi.fn(async () => null),
    ...overrides,
  };
}

async function run(sess: KnowledgePdfAreaImageServeSession | null, ctx = context()) {
  const handler = createKnowledgePdfAreaImageServeHandler({ getAuthenticatedSession: async () => sess });
  return handler(request(), ctx);
}

describe('D1-D5: every read is re-authorised, which is what makes revocation real', () => {
  it('D1: unauthenticated is 401', async () => {
    expect((await run(null)).status).toBe(401);
  });

  it('D2: a thrown session lookup is 503, never a served image', async () => {
    const handler = createKnowledgePdfAreaImageServeHandler({
      getAuthenticatedSession: async () => { throw new Error('down'); },
    });
    expect((await handler(request(), context())).status).toBe(503);
  });

  it('D3: a non-member is forbidden, and the object is never touched', async () => {
    const sess = session({ canReadBoard: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(403);
    expect(sess.findPadlet).not.toHaveBeenCalled();
    expect(sess.downloadAreaImage).not.toHaveBeenCalled();
  });

  it('D4: membership is checked on EVERY request, not once per card', async () => {
    // A collaborator removed between two views must be refused on the second.
    const canReadBoard = vi.fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const sess = session({ canReadBoard });
    expect((await run(sess)).status).toBe(200);
    expect((await run(sess)).status).toBe(403);
    expect(canReadBoard).toHaveBeenCalledTimes(2);
  });

  it('D5: a thrown authorisation check fails closed to unavailable', async () => {
    const sess = session({ canReadBoard: vi.fn(async () => { throw new Error('down'); }) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.downloadAreaImage).not.toHaveBeenCalled();
  });
});

describe('D6-D10: it serves proven area cards on THIS board, and nothing else', () => {
  it('D6: an absent card is 404', async () => {
    const sess = session({ findPadlet: vi.fn(async () => null) });
    expect((await run(sess)).status).toBe(404);
    expect(sess.downloadAreaImage).not.toHaveBeenCalled();
  });

  it('D7: the lookup is board-scoped, so another board\'s card cannot be named', async () => {
    const sess = session();
    await run(sess);
    expect(sess.findPadlet).toHaveBeenCalledWith(PADLET_ID, BOARD_ID);
  });

  it('D8: a row whose board does not match is refused even if the lookup returned it', async () => {
    // Defence in depth: the adapter scopes, and the handler checks anyway.
    const sess = session({
      findPadlet: vi.fn(async () => row({ boardId: OTHER_BOARD_ID })),
    });
    expect((await run(sess)).status).toBe(404);
    expect(sess.downloadAreaImage).not.toHaveBeenCalled();
  });

  it('D9: an ordinary card is 404 -- this is not a general reader of the bucket', async () => {
    for (const metadata of [null, {}, { imageUrl: 'https://example.test/a.png' },
      { source: { kind: 'text' } }, { source: { kind: 'knowledge-pdf-area' } }]) {
      const sess = session({ findPadlet: vi.fn(async () => row({ metadata })) });
      expect((await run(sess)).status, JSON.stringify(metadata)).toBe(404);
      expect(sess.downloadAreaImage).not.toHaveBeenCalled();
    }
  });

  it('D10: a non-UUID padlet id yields no path at all', async () => {
    const sess = session({
      findPadlet: vi.fn(async () => row({ id: '../secret' })),
    });
    expect((await run(sess, context(BOARD_ID, '../secret'))).status).toBe(404);
    expect(sess.downloadAreaImage).not.toHaveBeenCalled();
  });
});

describe('D11-D15: the path is re-derived, and the bytes are private', () => {
  it('D11: it reads the path derived from the route, never one stored on the card', async () => {
    const sess = session({
      findPadlet: vi.fn(async () => row({
        // A hostile stored path pointing at another board's private object.
        metadata: { source: PROVENANCE, storagePath: `board-derived/${OTHER_BOARD_ID}/pdf-areas/${PADLET_ID}.webp` },
      })),
    });
    await run(sess);
    expect(sess.downloadAreaImage).toHaveBeenCalledWith(OBJECT_PATH);
  });

  it('D12: a successful read returns the WebP bytes unchanged', async () => {
    const response = await run(session());
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
  });

  it('D13: it is never cached anywhere a revoked viewer could re-read it', async () => {
    const response = await run(session());
    const cacheControl = response.headers.get('Cache-Control') ?? '';
    expect(cacheControl).toContain('private');
    expect(cacheControl).toContain('no-store');
    expect(cacheControl).not.toContain('public');
    expect(cacheControl).not.toMatch(/max-age=[1-9]/);
  });

  it('D14: a missing object is 404 and an unavailable store is 503', async () => {
    expect((await run(session({ downloadAreaImage: vi.fn(async () => ({ kind: 'missing' as const })) }))).status).toBe(404);
    expect((await run(session({ downloadAreaImage: vi.fn(async () => ({ kind: 'unavailable' as const })) }))).status).toBe(503);
  });

  it('D15: a thrown store read is 503, not a partial or empty image', async () => {
    const sess = session({ downloadAreaImage: vi.fn(async () => { throw new Error('down'); }) });
    expect((await run(sess)).status).toBe(503);
  });
});

describe('D16-D17: the module publishes nothing, by construction', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/server/knowledge/knowledgePdfAreaImageServeRoute.ts'), 'utf8',
  );

  it('D16: it mints no public or signed URL and names no public bucket', () => {
    for (const forbidden of ['getPublicUrl', 'createSignedUrl', "'padlet-files'", "'images'", "'thumbnails'"]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
    expect(source).toContain('KNOWLEDGE_STORAGE_BUCKET');
  });

  it('D17: provenance is the gate, and the path is derived after it', () => {
    const gate = source.indexOf('parseKnowledgePdfAreaProvenance(padlet.metadata)');
    const derive = source.indexOf('knowledgePdfAreaImagePath(boardId, padletId)');
    expect(gate).toBeGreaterThan(-1);
    expect(derive).toBeGreaterThan(gate);
  });
});

/**
 * IMAGE-LIBRARY-DURABLE-PREVIEW-REUSE, group D18-D27 -- the reuse fallback.
 *
 * A reused placement has no object at its own derived path: the crop was cut
 * for a different, usually deleted, card. These pin that the ONLY thing that
 * can open that durable object is the server-owned mapping, that the browser
 * writable `padlets.library_item_id` never substitutes for it, and that the
 * direct branch for original placements is untouched.
 */
const LIBRARY_ID = '66666666-6666-4666-8666-666666666666';
const OTHER_LIBRARY_ID = '77777777-7777-4777-8777-777777777777';
const DURABLE_PATH = `board-derived/${OTHER_BOARD_ID}/pdf-areas/33333333-3333-4333-8333-333333333333.webp`;
const DURABLE_BYTES = new Uint8Array([82, 73, 70, 70, 9, 9, 9, 9]);

const mappedItem = (
  overrides: Partial<KnowledgePdfAreaImageMappedLibraryItem> = {},
): KnowledgePdfAreaImageMappedLibraryItem => ({
  id: LIBRARY_ID,
  type: 'image',
  knowledgeStoragePath: DURABLE_PATH,
  metadata: { source: PROVENANCE },
  ...overrides,
});

/** A reused placement: bound to a library object, with no object of its own. */
function reuseSession(overrides: Partial<KnowledgePdfAreaImageServeSession> = {}) {
  return session({
    findPadlet: vi.fn(async () => row({ libraryItemId: LIBRARY_ID })),
    downloadAreaImage: vi.fn(async (objectPath: string) => (
      objectPath === DURABLE_PATH
        ? { kind: 'ok' as const, bytes: DURABLE_BYTES }
        : { kind: 'missing' as const }
    )),
    findPlacementMapping: vi.fn(async () => ({ padletId: PADLET_ID, libraryItemId: LIBRARY_ID })),
    findMappedLibraryItem: vi.fn(async () => mappedItem()),
    ...overrides,
  });
}

describe('D18-D27: a reused placement reaches its durable object, and only through the mapping', () => {
  it('D18 (R16): an ORIGINAL placement still serves its own derived object, mapping untouched', async () => {
    const sess = session();
    const response = await run(sess);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
    expect(sess.downloadAreaImage).toHaveBeenCalledWith(OBJECT_PATH);
    // The direct branch is FIRST, so nothing historical needs a mapping.
    expect(sess.findPlacementMapping).not.toHaveBeenCalled();
    expect(sess.findMappedLibraryItem).not.toHaveBeenCalled();
  });

  it('D19 (R17): with no object at its own path, the mapped durable crop is served', async () => {
    const sess = reuseSession();
    const response = await run(sess);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(DURABLE_BYTES);
    // The derived path is tried first, the durable one only after it is absent.
    expect(sess.downloadAreaImage).toHaveBeenNthCalledWith(1, OBJECT_PATH);
    expect(sess.downloadAreaImage).toHaveBeenNthCalledWith(2, DURABLE_PATH);
    expect(sess.findPlacementMapping).toHaveBeenCalledWith(PADLET_ID);
  });

  it('D20 (R18): no mapping means no fallback at all', async () => {
    const sess = reuseSession({ findPlacementMapping: vi.fn(async () => null) });
    expect((await run(sess)).status).toBe(404);
    expect(sess.findMappedLibraryItem).not.toHaveBeenCalled();
  });

  it('D21 (R19): a forged library_item_id with no mapping behind it reaches no bytes', async () => {
    // The exact attack: a browser writes someone else's private library UUID
    // into its own padlet row and asks the board route for the image.
    const sess = reuseSession({
      findPadlet: vi.fn(async () => row({ libraryItemId: OTHER_LIBRARY_ID })),
      findPlacementMapping: vi.fn(async () => null),
    });
    const response = await run(sess);
    expect(response.status).toBe(404);
    expect(sess.findMappedLibraryItem).not.toHaveBeenCalled();
    expect(sess.downloadAreaImage).toHaveBeenCalledTimes(1);
    expect(sess.downloadAreaImage).toHaveBeenCalledWith(OBJECT_PATH);
  });

  it('D22 (R20): a mapping that disagrees with the placement fails closed', async () => {
    const sess = reuseSession({
      findPadlet: vi.fn(async () => row({ libraryItemId: OTHER_LIBRARY_ID })),
    });
    expect((await run(sess)).status).toBe(404);
    expect(sess.findMappedLibraryItem).not.toHaveBeenCalled();
  });

  it('D23 (R21): a mapped object whose provenance is a different source is refused', async () => {
    const otherDoc = buildKnowledgePdfAreaProvenance(
      '88888888-8888-4888-8888-888888888888', 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    );
    const otherPage = buildKnowledgePdfAreaProvenance(
      DOC_ID, 4, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
    );
    const otherRegion = buildKnowledgePdfAreaProvenance(
      DOC_ID, 3, { x: 0.11, y: 0.2, width: 0.3, height: 0.4 },
    );
    for (const source of [otherDoc, otherPage, otherRegion, { kind: 'text' }, null]) {
      const sess = reuseSession({
        findMappedLibraryItem: vi.fn(async () => mappedItem({ metadata: { source } })),
      });
      expect((await run(sess)).status, JSON.stringify(source)).toBe(404);
      expect(sess.downloadAreaImage).toHaveBeenCalledTimes(1);
    }
  });

  it('D24 (R21): the SAME source, page and region is accepted by value, not identity', async () => {
    // Parsed from a different row: never the same object, and 3 may arrive as
    // 3.0. Semantic equality is the contract.
    const sess = reuseSession({
      findMappedLibraryItem: vi.fn(async () => mappedItem({
        metadata: { source: { kind: 'knowledge-pdf-area', knowledgeDocumentId: DOC_ID, pageNumber: 3.0,
          region: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 } } },
      })),
    });
    expect((await run(sess)).status).toBe(200);
  });

  it('D25 (R22): the TARGET board is the only authority, and it is re-checked', async () => {
    // A collaborator on the target board reads the image; no origin board is
    // consulted, and there is no capability here that could consult one.
    const sess = reuseSession();
    expect((await run(sess)).status).toBe(200);
    expect(sess.canReadBoard).toHaveBeenCalledWith(BOARD_ID);
    expect(sess.canReadBoard).toHaveBeenCalledTimes(1);
    const revoked = reuseSession({ canReadBoard: vi.fn(async () => false) });
    expect((await run(revoked)).status).toBe(403);
    expect(revoked.findPlacementMapping).not.toHaveBeenCalled();
  });

  it('D26: a mapped row that is not a durable PDF-area Image is refused', async () => {
    for (const item of [
      null,
      mappedItem({ type: 'text' }),
      mappedItem({ knowledgeStoragePath: null }),
      mappedItem({ knowledgeStoragePath: '' }),
      mappedItem({ id: OTHER_LIBRARY_ID }),
      mappedItem({ metadata: null }),
    ]) {
      const sess = reuseSession({ findMappedLibraryItem: vi.fn(async () => item) });
      expect((await run(sess)).status, JSON.stringify(item)).toBe(404);
      expect(sess.downloadAreaImage).toHaveBeenCalledTimes(1);
    }
  });

  it('D27: a broken mapping or library lookup is 503, never a served image', async () => {
    const thrownMapping = reuseSession({
      findPlacementMapping: vi.fn(async () => { throw new Error('down'); }),
    });
    expect((await run(thrownMapping)).status).toBe(503);
    const thrownItem = reuseSession({
      findMappedLibraryItem: vi.fn(async () => { throw new Error('down'); }),
    });
    expect((await run(thrownItem)).status).toBe(503);
    const thrownDurable = reuseSession({
      downloadAreaImage: vi.fn(async (objectPath: string) => {
        if (objectPath === DURABLE_PATH) throw new Error('down');
        return { kind: 'missing' as const };
      }),
    });
    expect((await run(thrownDurable)).status).toBe(503);
    const unavailableDurable = reuseSession({
      downloadAreaImage: vi.fn(async (objectPath: string) => (
        objectPath === DURABLE_PATH ? { kind: 'unavailable' as const } : { kind: 'missing' as const }
      )),
    });
    expect((await run(unavailableDurable)).status).toBe(503);
  });
});
