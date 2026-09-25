import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  createKnowledgePdfAreaImageEditHandler,
  type KnowledgePdfAreaImageEditRow,
  type KnowledgePdfAreaImageEditSession,
} from './knowledgePdfAreaImageEditRoute';
import {
  buildKnowledgePdfAreaProvenance,
  knowledgePdfAreaImageVariantPath,
  knowledgePdfAreaImageVariantUrl,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import { UPLOAD_LIMITS } from '../../domain/storage/uploadLimits';

/**
 * PATCH-182 -- the private write for an EDITED area picture.
 *
 * Every dependency is injected: no Supabase, no network, no real Storage. What
 * these pin is that the route writes only proven PDF-area cards, derives its
 * path from validated ids, refuses anything public, and never reads an
 * oversized body.
 */

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_BOARD_ID = '22222222-2222-4222-8222-222222222222';
const PADLET_ID = '44444444-4444-4444-8444-444444444444';
const DOC_ID = '55555555-5555-4555-8555-555555555555';
const USER_ID = 'user-1';

const PROVENANCE = buildKnowledgePdfAreaProvenance(DOC_ID, 3, { x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PNG = new Uint8Array([...PNG_SIGNATURE, 1, 2, 3, 4]);
const OBJECT_PATH = `board-derived/${BOARD_ID}/pdf-areas/${PADLET_ID}.drawing.png`;

const context = (boardId = BOARD_ID, padletId = PADLET_ID) =>
  ({ params: Promise.resolve({ id: boardId, padletId }) });

/** A proven area card on THIS board. */
const row = (overrides: Partial<KnowledgePdfAreaImageEditRow> = {}): KnowledgePdfAreaImageEditRow => ({
  id: PADLET_ID,
  boardId: BOARD_ID,
  metadata: { source: PROVENANCE },
  ...overrides,
});

function session(overrides: Partial<KnowledgePdfAreaImageEditSession> = {}): KnowledgePdfAreaImageEditSession {
  return {
    userId: USER_ID,
    canWriteBoard: vi.fn(async () => true),
    findPadlet: vi.fn(async () => row()),
    uploadAreaImageVariant: vi.fn(async () => true),
    ...overrides,
  };
}

function request(
  variant: string | null = 'drawing',
  body: BodyInit = PNG,
  headers: Record<string, string> = {},
): Request {
  const query = variant === null ? '' : `?variant=${variant}`;
  return new Request(`http://localhost/api/boards/${BOARD_ID}/padlets/${PADLET_ID}/image${query}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png', ...headers },
    body,
  });
}

async function run(sess: KnowledgePdfAreaImageEditSession | null, req = request(), ctx = context()) {
  const handler = createKnowledgePdfAreaImageEditHandler({ getAuthenticatedSession: async () => sess });
  return handler(req, ctx);
}

describe('authorisation comes first, and it is EDIT', () => {
  it('unauthenticated is 401', async () => {
    expect((await run(null)).status).toBe(401);
  });

  it('a thrown session lookup is 503, never a write', async () => {
    const handler = createKnowledgePdfAreaImageEditHandler({
      getAuthenticatedSession: async () => { throw new Error('down'); },
    });
    expect((await handler(request(), context())).status).toBe(503);
  });

  it('a board viewer is forbidden, and nothing is uploaded', async () => {
    const sess = session({ canWriteBoard: vi.fn(async () => false) });
    expect((await run(sess)).status).toBe(403);
    expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
  });

  it('a thrown authorisation check fails closed to unavailable', async () => {
    const sess = session({ canWriteBoard: vi.fn(async () => { throw new Error('down'); }) });
    expect((await run(sess)).status).toBe(503);
    expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
  });
});

describe('it writes only a proven area card on THIS board', () => {
  it('an absent (or another board\'s) padlet is 404, and nothing is uploaded', async () => {
    const sess = session({ findPadlet: vi.fn(async () => null) });
    expect((await run(sess)).status).toBe(404);
    expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
    // The lookup is board-scoped.
    expect(sess.findPadlet).toHaveBeenCalledWith(PADLET_ID, BOARD_ID);
  });

  it('a row whose board does not match is refused even if returned', async () => {
    const sess = session({ findPadlet: vi.fn(async () => row({ boardId: OTHER_BOARD_ID })) });
    expect((await run(sess)).status).toBe(404);
    expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
  });

  it('a padlet WITHOUT PDF-area provenance is 404, and nothing is uploaded', async () => {
    for (const metadata of [null, {}, { imageUrl: 'https://example.test/a.png' },
      { source: { kind: 'text' } }, { source: { kind: 'knowledge-pdf-area' } }]) {
      const sess = session({ findPadlet: vi.fn(async () => row({ metadata })) });
      expect((await run(sess)).status, JSON.stringify(metadata)).toBe(404);
      expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
    }
  });
});

describe('the request is a known variant and a PNG, and it is bounded', () => {
  it('a missing or unknown variant is 400', async () => {
    for (const variant of [null, 'original', 'DRAWING', '', 'base.png']) {
      const sess = session();
      expect((await run(sess, request(variant))).status, String(variant)).toBe(400);
      expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
    }
  });

  it('a non-PNG body is 400, and nothing is uploaded', async () => {
    for (const body of [
      new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      new Uint8Array([]),
      new TextEncoder().encode('not an image at all'),
    ]) {
      const sess = session();
      expect((await run(sess, request('drawing', body))).status).toBe(400);
      expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
    }
  });

  it('over the image limit by Content-Length is 413, and the body is never read', async () => {
    const arrayBuffer = vi.fn(async () => { throw new Error('the body must not be read'); });
    const oversized = {
      url: `http://localhost/api/boards/${BOARD_ID}/padlets/${PADLET_ID}/image?variant=drawing`,
      headers: new Headers({ 'content-length': String(UPLOAD_LIMITS.image + 1) }),
      arrayBuffer,
    } as unknown as Request;
    const sess = session();
    expect((await run(sess, oversized)).status).toBe(413);
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(sess.uploadAreaImageVariant).not.toHaveBeenCalled();
  });

  it('the 121st edit in an hour is 429', async () => {
    const sess = session({ userId: 'rate-limit-user' });
    for (let i = 0; i < 120; i += 1) {
      expect((await run(sess)).status, `edit ${i + 1}`).toBe(200);
    }
    expect((await run(sess)).status).toBe(429);
  });
});

describe('what is written, and where', () => {
  it('uploads to EXACTLY the derived variant path, with the PNG bytes', async () => {
    const sess = session();
    const response = await run(sess);
    expect(response.status).toBe(200);
    const upload = sess.uploadAreaImageVariant as unknown as
      { mock: { calls: [string, Uint8Array][] } };
    expect(upload.mock.calls[0][0]).toBe(OBJECT_PATH);
    expect(upload.mock.calls[0][1]).toEqual(PNG);
  });

  it('returns the variant URL the card should adopt', async () => {
    const response = await run(session());
    const payload = await response.json() as { url: string };
    const expected = knowledgePdfAreaImageVariantUrl(BOARD_ID, PADLET_ID, 'drawing', 0)!;
    expect(payload.url.replace(/v=\d+$/, 'v=0')).toBe(expected);
  });

  it('the path never contains anything from the body', async () => {
    const hostile = new Uint8Array([...PNG_SIGNATURE, ...new TextEncoder().encode('../../evil/name.png')]);
    const sess = session();
    await run(sess, request('drawing', hostile));
    const upload = sess.uploadAreaImageVariant as unknown as
      { mock: { calls: [string, Uint8Array][] } };
    const objectPath = upload.mock.calls[0][0];
    expect(objectPath).toBe(OBJECT_PATH);
    expect(objectPath).not.toContain('evil');
    expect(objectPath).not.toContain('..');
  });

  it('base is a different, still-derived path', () => {
    expect(knowledgePdfAreaImageVariantPath(BOARD_ID, PADLET_ID, 'base'))
      .toBe(`board-derived/${BOARD_ID}/pdf-areas/${PADLET_ID}.base.png`);
  });

  it('a failed upload is 503, and no URL is returned', async () => {
    const sess = session({ uploadAreaImageVariant: vi.fn(async () => false) });
    const response = await run(sess);
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty('url');
  });

  it('a thrown upload is 503 as well', async () => {
    const sess = session({ uploadAreaImageVariant: vi.fn(async () => { throw new Error('storage down'); }) });
    expect((await run(sess)).status).toBe(503);
  });
});

describe('the module publishes nothing, by construction', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'lib/server/knowledge/knowledgePdfAreaImageEditRoute.ts'), 'utf8',
  );

  it('names no public bucket and mints no public or signed URL', () => {
    for (const forbidden of ["'padlet-files'", "'images'", "'thumbnails'",
      'getPublicUrl', 'createSignedUrl', 'storage/v1/object/public']) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it('writes to the private Knowledge bucket with upsert', () => {
    expect(source).toContain('KNOWLEDGE_STORAGE_BUCKET');
    expect(source).toContain('upsert: true');
    expect(source).toContain("contentType: 'image/png'");
    expect((source.match(/\.storage\s*\n?\s*\.from\(([^)]*)\)/g) ?? [])
      .every((m) => m.includes('KNOWLEDGE_STORAGE_BUCKET'))).toBe(true);
  });

  it('provenance gates the path, and the path is derived after it', () => {
    const gate = source.indexOf('parseKnowledgePdfAreaProvenance(padlet.metadata)');
    const derive = source.indexOf('knowledgePdfAreaImageVariantPath(boardId, padletId, variant)');
    expect(gate).toBeGreaterThan(-1);
    expect(derive).toBeGreaterThan(gate);
  });
});
