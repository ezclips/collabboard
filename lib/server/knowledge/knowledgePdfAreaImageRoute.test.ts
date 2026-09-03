import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createKnowledgePdfAreaImageHandler,
  knowledgePdfAreaCardHeight,
  parseKnowledgePdfAreaImageRequest,
  type KnowledgePdfAreaImagePadletRow,
  type KnowledgePdfAreaImageSession,
} from './knowledgePdfAreaImageRoute';
import { cropDerivativeToWebp, type KnowledgeSourceRegionCropDownload } from './knowledgeSourceRegionCropRoute';
import { ok } from '../../domain/core/result';
import { knowledgePageDerivativePath } from '../../domain/knowledge/knowledgePdfRenderPolicy';
import { KNOWLEDGE_PDF_AREA_SOURCE_KIND } from '../../domain/knowledge/knowledgePdfAreaImagePolicy';

/**
 * R6B, group C -- the creation authority. Every dependency is injected: no
 * Supabase, no network, no real PDF. What these pin is the handler's own
 * orchestration -- authorisation order, board binding, the fact that the crop
 * is server-derived, and that nothing public is ever written.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOC_ID = '55555555-5555-4555-8555-555555555555';
const NEW_PADLET_ID = '44444444-4444-4444-8444-444444444444';
const USER_ID = 'user-1';
const PAGE = 3;
const REGION = { x: 0.1, y: 0.2, width: 0.3, height: 0.4 };

async function tinyDerivative(): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(200, 280);
  canvas.getContext('2d').fillRect(0, 0, 200, 280);
  return canvas.encode('webp', 80);
}

const body = (overrides: Record<string, unknown> = {}) => ({
  knowledgeDocumentId: DOC_ID, pageNumber: PAGE, region: REGION,
  title: 'synthetic.pdf', positionX: 120, positionY: 340, ...overrides,
});

const context = (boardId = BOARD_ID) => ({ params: Promise.resolve({ id: boardId }) });

function request(payload: unknown = body(), boardId = BOARD_ID): Request {
  return new Request(`http://localhost/api/boards/${boardId}/knowledge/area-image`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof payload === 'string' ? payload : JSON.stringify(payload),
  });
}

function session(overrides: Partial<KnowledgePdfAreaImageSession> = {}): KnowledgePdfAreaImageSession {
  return {
    userId: USER_ID,
    canWriteBoard: vi.fn(async () => true),
    validation: {
      findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'ready' })),
      findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 0 })),
    } as never,
    downloadDerivative: vi.fn(async (): Promise<KnowledgeSourceRegionCropDownload> =>
      ({ kind: 'ok', bytes: await tinyDerivative() })),
    cropToWebp: vi.fn(async (bytes, region) => cropDerivativeToWebp(bytes, region)),
    uploadAreaImage: vi.fn(async () => true),
    removeAreaImage: vi.fn(async () => {}),
    insertPadlet: vi.fn(async () => true),
    newPadletId: () => NEW_PADLET_ID,
    ...overrides,
  };
}

async function run(sess: KnowledgePdfAreaImageSession | null, payload: unknown = body(), ctx = context()) {
  const handler = createKnowledgePdfAreaImageHandler({ getAuthenticatedSession: async () => sess });
  return handler(request(payload), ctx);
}

async function createdRow(sess: KnowledgePdfAreaImageSession): Promise<KnowledgePdfAreaImagePadletRow> {
  await run(sess);
  const insert = sess.insertPadlet as unknown as { mock: { calls: [KnowledgePdfAreaImagePadletRow][] } };
  return insert.mock.calls[0][0];
}

describe('C1-C7: authorisation comes first, and it is EDIT', () => {
  it('C1: unauthenticated is refused before anything is read', async () => {
    const response = await run(null);
    expect(response.status).toBe(401);
  });

  it('C2: a thrown session lookup fails closed to unavailable, never to success', async () => {
    const handler = createKnowledgePdfAreaImageHandler({
      getAuthenticatedSession: async () => { throw new Error('down'); },
    });
    expect((await handler(request(), context())).status).toBe(503);
  });

  it('C3: a board VIEWER is forbidden -- creating a card is a write', async () => {
    const sess = session({ canWriteBoard: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(403);
    // And it learned nothing about the document on the way out.
    expect(sess.validation.findSourceDocument).not.toHaveBeenCalled();
    expect(sess.downloadDerivative).not.toHaveBeenCalled();
    expect(sess.uploadAreaImage).not.toHaveBeenCalled();
    expect(sess.insertPadlet).not.toHaveBeenCalled();
  });

  it('C4: the write check runs BEFORE the body is even parsed', async () => {
    // A viewer must not be able to tell a malformed request from a refused one.
    const sess = session({ canWriteBoard: vi.fn(async () => false) });
    expect((await run(sess, 'not json at all')).status).toBe(403);
  });

  it('C5: a thrown authorisation check is unavailable, not permission granted', async () => {
    const sess = session({ canWriteBoard: vi.fn(async () => { throw new Error('down'); }) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.insertPadlet).not.toHaveBeenCalled();
  });

  it('C6: the board asked about is the one in the route, not one in the body', async () => {
    const sess = session();
    await run(sess, body({ boardId: '22222222-2222-4222-8222-222222222222' }));
    expect(sess.canWriteBoard).toHaveBeenCalledWith(BOARD_ID);
  });

  it('C7: a document on ANOTHER board reads as absent, never as forbidden-and-existing', async () => {
    // findSourceDocument is board-scoped, so one answer covers both cases.
    const sess = session({
      validation: { ...session().validation, findSourceDocument: vi.fn(async () => ok(null)) } as never,
    });
    expect((await run(sess)).status).toBe(404);
    expect(sess.insertPadlet).not.toHaveBeenCalled();
  });
});

describe('C8-C14: the request body is identity and a rectangle, and it is total', () => {
  it('C8: a malformed body is a 400, and writes nothing', async () => {
    const sess = session();
    expect((await run(sess, 'not json')).status).toBe(400);
    expect(sess.uploadAreaImage).not.toHaveBeenCalled();
  });

  it('C9: a non-UUID document id is refused', () => {
    for (const bad of ['', '../other', 'not-a-uuid', 42, null]) {
      expect(parseKnowledgePdfAreaImageRequest(body({ knowledgeDocumentId: bad })), String(bad)).toBeNull();
    }
  });

  it('C10: a page that is not a positive integer is refused', () => {
    for (const bad of [0, -1, 2.5, '3', null, Number.NaN]) {
      expect(parseKnowledgePdfAreaImageRequest(body({ pageNumber: bad })), String(bad)).toBeNull();
    }
  });

  it('C11: a rectangle outside the unit page, or degenerate, is refused', () => {
    for (const region of [
      { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      { x: 0.8, y: 0, width: 0.5, height: 0.5 },
      { x: 0.1, y: 0.1, width: 0, height: 0.4 },
      { x: 0.1, y: 0.1, width: 0.4, height: Number.NaN },
      undefined, null, 'x',
    ]) {
      expect(parseKnowledgePdfAreaImageRequest(body({ region })), JSON.stringify(region)).toBeNull();
    }
  });

  it('C12: non-object bodies are refused rather than defaulted', () => {
    for (const bad of [null, undefined, 'x', 7, []]) {
      expect(parseKnowledgePdfAreaImageRequest(bad), String(bad)).toBeNull();
    }
  });

  it('C13: the title is display text only -- trimmed, capped, and never a path', async () => {
    const parsed = parseKnowledgePdfAreaImageRequest(body({ title: `  ${'x'.repeat(500)}  ` }));
    expect(parsed?.title).toHaveLength(200);
    expect(parseKnowledgePdfAreaImageRequest(body({ title: '   ' }))?.title).toBe('PDF area');
    expect(parseKnowledgePdfAreaImageRequest(body({ title: 42 }))?.title).toBe('PDF area');
    // Whatever it says, it never reaches the object path.
    const row = await createdRow(session());
    expect(row.file_url).not.toContain('synthetic');
  });

  it('C14: the placement is clamped, and a hostile coordinate cannot escape it', () => {
    expect(parseKnowledgePdfAreaImageRequest(body({ positionX: 1e12, positionY: -1e12 })))
      .toMatchObject({ positionX: 1_000_000, positionY: -1_000_000 });
    expect(parseKnowledgePdfAreaImageRequest(body({ positionX: Number.NaN, positionY: 'x' })))
      .toMatchObject({ positionX: 0, positionY: 0 });
  });
});

describe('C15-C21: the crop is server-derived from the server\'s own page', () => {
  it('C15: an unready document is 409, and nothing is cropped', async () => {
    const sess = session({
      validation: {
        ...session().validation,
        findSourceDocument: vi.fn(async () => ok({ boardId: BOARD_ID as never, pageCount: 10, processingStatus: 'processing' })),
      } as never,
    });
    expect((await run(sess)).status).toBe(409);
    expect(sess.downloadDerivative).not.toHaveBeenCalled();
  });

  it('C16: a page beyond the document is 404', async () => {
    const sess = session();
    expect((await run(sess, body({ pageNumber: 11 }))).status).toBe(404);
    expect(sess.uploadAreaImage).not.toHaveBeenCalled();
  });

  it('C17: it reads the deterministic derivative path for THIS board, document and page', async () => {
    const sess = session();
    await run(sess);
    expect(sess.downloadDerivative).toHaveBeenCalledWith(knowledgePageDerivativePath(BOARD_ID, DOC_ID, PAGE));
  });

  it('C18: a missing derivative is 404 and an unavailable one is 503 -- neither invents a card', async () => {
    const missing = session({ downloadDerivative: vi.fn(async () => ({ kind: 'missing' as const })) });
    expect((await run(missing)).status).toBe(404);
    const down = session({ downloadDerivative: vi.fn(async () => ({ kind: 'unavailable' as const })) });
    expect((await run(down)).status).toBe(503);
    for (const sess of [missing, down]) {
      expect(sess.uploadAreaImage).not.toHaveBeenCalled();
      expect(sess.insertPadlet).not.toHaveBeenCalled();
    }
  });

  it('C19: it crops with the PERSISTED rotation, never a client-supplied one', async () => {
    const sess = session({
      validation: {
        ...session().validation,
        findPageGeometry: vi.fn(async () => ok({ widthPoints: 595, heightPoints: 842, rotation: 90 })),
      } as never,
    });
    await run(sess, body({ rotation: 0, appliedRotation: 0 }));
    const [, display] = (sess.cropToWebp as unknown as { mock: { calls: [Uint8Array, typeof REGION][] } }).mock.calls[0];
    // A quarter turn maps the intrinsic rectangle somewhere else entirely; if
    // the client's 0 had been honoured the rectangle would be unchanged.
    expect(display).not.toEqual(REGION);
  });

  it('C20: a page with no usable geometry is 404 rather than a guessed crop', async () => {
    for (const geometry of [null, { widthPoints: 0, heightPoints: 842, rotation: 0 },
      { widthPoints: 595, heightPoints: 842, rotation: 45 }]) {
      const sess = session({
        validation: { ...session().validation, findPageGeometry: vi.fn(async () => ok(geometry)) } as never,
      });
      expect((await run(sess)).status, JSON.stringify(geometry)).toBe(404);
    }
  });

  it('C21: a crop failure is 503, and leaves no object and no card behind', async () => {
    const sess = session({ cropToWebp: vi.fn(async () => { throw new Error('decode failed'); }) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.uploadAreaImage).not.toHaveBeenCalled();
    expect(sess.insertPadlet).not.toHaveBeenCalled();
  });
});

describe('C22-C29: what is written, and where', () => {
  it('C22: a successful create returns 201 with the row it inserted', async () => {
    const sess = session();
    const response = await run(sess);
    expect(response.status).toBe(201);
    const payload = await response.json() as { padlet: KnowledgePdfAreaImagePadletRow };
    expect(payload.padlet.id).toBe(NEW_PADLET_ID);
    expect(payload.padlet).toEqual(await createdRow(session()));
  });

  it('C23: the crop is uploaded to the derived private path, keyed by the new card', async () => {
    const sess = session();
    await run(sess);
    const [objectPath, bytes] = (sess.uploadAreaImage as unknown as
      { mock: { calls: [string, Uint8Array][] } }).mock.calls[0];
    expect(objectPath).toBe(`board-derived/${BOARD_ID}/pdf-areas/${NEW_PADLET_ID}.webp`);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('C24: the card is an ordinary Image card on this board', async () => {
    const row = await createdRow(session());
    expect(row.type).toBe('image');
    expect(row.board_id).toBe(BOARD_ID);
    expect(row.content).toBe('');
    expect(row.position_x).toBe(120);
    expect(row.position_y).toBe(340);
  });

  it('C25: its image address is the authenticated route -- never a public or signed URL', async () => {
    const row = await createdRow(session());
    const expected = `/api/boards/${BOARD_ID}/padlets/${NEW_PADLET_ID}/image`;
    expect(row.file_url).toBe(expected);
    expect(row.metadata.imageUrl).toBe(expected);
    const serialized = JSON.stringify(row);
    for (const forbidden of ['padlet-files', 'thumbnails', 'storage/v1/object/public',
      'token=', 'signedUrl', 'supabase.co', 'data:image', 'base64']) {
      expect(serialized, forbidden).not.toContain(forbidden);
    }
  });

  it('C26: it carries typed provenance naming the document, page and rectangle', async () => {
    const row = await createdRow(session());
    expect(row.metadata.source).toEqual({
      kind: KNOWLEDGE_PDF_AREA_SOURCE_KIND, knowledgeDocumentId: DOC_ID, pageNumber: PAGE, region: REGION,
    });
  });

  it('C27: provenance stores no path and no bucket -- the route re-derives both', async () => {
    const row = await createdRow(session());
    expect(Object.keys(row.metadata.source).sort())
      .toEqual(['kind', 'knowledgeDocumentId', 'pageNumber', 'region']);
    expect(JSON.stringify(row.metadata.source)).not.toContain('board-derived');
  });

  it('C28: the card is sized from the page geometry, not from anything the client sent', async () => {
    const row = await createdRow(session());
    // 0.3 x 595 wide by 0.4 x 842 tall -> a portrait crop, so height > width.
    expect(row.width).toBe(320);
    expect(row.height).toBe(knowledgePdfAreaCardHeight(REGION, 595, 842, 0));
    expect(row.height).toBeGreaterThan(row.width);
    // A client-sent size is simply not part of the parsed request.
    expect(parseKnowledgePdfAreaImageRequest(body({ width: 9999, height: 9999 })))
      .not.toHaveProperty('width');
  });

  it('C29: a quarter turn transposes the card, and every size stays bounded', () => {
    const landscape = knowledgePdfAreaCardHeight(REGION, 595, 842, 90);
    const portrait = knowledgePdfAreaCardHeight(REGION, 595, 842, 0);
    expect(landscape).not.toBe(portrait);
    for (const region of [{ x: 0, y: 0, width: 1, height: 0.0001 }, { x: 0, y: 0, width: 0.0001, height: 1 }]) {
      const height = knowledgePdfAreaCardHeight(region, 595, 842, 0);
      expect(height).toBeGreaterThanOrEqual(40);
      expect(height).toBeLessThanOrEqual(2000);
    }
  });
});

describe('C30-C33: failure leaves nothing behind', () => {
  it('C30: an upload failure is 503, and no card is created', async () => {
    const sess = session({ uploadAreaImage: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.insertPadlet).not.toHaveBeenCalled();
  });

  it('C31: a thrown upload is 503 as well', async () => {
    const sess = session({ uploadAreaImage: vi.fn(async () => { throw new Error('storage down'); }) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.insertPadlet).not.toHaveBeenCalled();
  });

  it('C32: a failed insert removes the orphaned crop rather than leaving it stored', async () => {
    // Without the card the object is unreachable, but it is still a crop of a
    // private PDF sitting in the bucket. It goes.
    const sess = session({ insertPadlet: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.removeAreaImage)
      .toHaveBeenCalledWith(`board-derived/${BOARD_ID}/pdf-areas/${NEW_PADLET_ID}.webp`);
  });

  it('C33: a cleanup that itself fails still reports the create as failed', async () => {
    const sess = session({
      insertPadlet: vi.fn(async () => { throw new Error('insert down'); }),
      removeAreaImage: vi.fn(async () => { throw new Error('remove down'); }),
    });
    expect((await run(sess)).status).toBe(503);
  });
});

describe('C34-C36: the module publishes nothing, by construction', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/server/knowledge/knowledgePdfAreaImageRoute.ts'), 'utf8',
  );

  it('C34: it names no public bucket and mints no public or signed URL', async () => {
    for (const forbidden of ["'padlet-files'", "'images'", "'thumbnails'",
      'getPublicUrl', 'createSignedUrl', 'createSignedUrls']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('C35: the only bucket it touches is the private Knowledge one', () => {
    expect(source).toContain('KNOWLEDGE_STORAGE_BUCKET');
    expect((source.match(/\.storage\s*\n?\s*\.from\(([^)]*)\)/g) ?? []).every(m => m.includes('KNOWLEDGE_STORAGE_BUCKET')))
      .toBe(true);
  });

  it('C36: it reuses the one crop authority instead of a second image stack', () => {
    expect(source).toContain('cropDerivativeToWebp');
    for (const forbidden of ['html2canvas', 'pdfjs', 'pdf.js', 'workers/knowledge-pdf', 'tesseract', 'puppeteer']) {
      expect(source.toLowerCase(), forbidden).not.toContain(forbidden);
    }
  });
});
