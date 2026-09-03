import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createKnowledgePdfAreaImageHandler,
  createRealKnowledgePdfAreaImageSession,
} from './knowledgePdfAreaImageRoute';
import {
  createKnowledgePdfAreaImageServeHandler,
  createRealKnowledgePdfAreaImageServeSession,
} from './knowledgePdfAreaImageServeRoute';
import { knowledgePageDerivativePath } from '../../domain/knowledge/knowledgePdfRenderPolicy';
import {
  KNOWLEDGE_PDF_AREA_SOURCE_KIND,
  knowledgePdfAreaImagePath,
} from '../../domain/knowledge/knowledgePdfAreaImagePolicy';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';

/**
 * R6B runtime proof against a REAL local Postgres and a REAL local private
 * Storage bucket: the crop, the upload, the row and the read all actually
 * happen. Nothing here touches a hosted project.
 *
 * The page is a SYNTHETIC rendered derivative built in-process -- four solid
 * quadrants -- not a user PDF. That is exactly what the crop authority reads,
 * so it proves the whole path while keeping every real document untouched.
 *
 * Bootstrap (scripts/db/bootstrap-local.mjs) owns the disposable stack: it
 * starts it, writes the env file, runs this test, and destroys the project.
 * Without that env file the suite skips, exactly like its Knowledge siblings.
 */
const envPath = path.join(process.cwd(), 'scripts', '.tmp-p4-env.json');
const hasLocalStack = fs.existsSync(envPath);
const env: Record<string, string> = hasLocalStack ? JSON.parse(fs.readFileSync(envPath, 'utf8')) : {};

const LOOPBACK_HOSTNAMES = ['127.0.0.1', 'localhost'];

/** Fails closed: no client may be constructed against a non-loopback host. */
function requireLoopbackUrl(value: string): string {
  const { hostname } = new URL(value);
  if (!LOOPBACK_HOSTNAMES.includes(hostname)) {
    throw new Error(`Refusing a non-loopback Supabase URL: ${hostname}`);
  }
  return value;
}

const PAGE = 1;
const PAGE_PIXELS = 400;
/** The top-right quadrant, comfortably inside it so rounding cannot straddle. */
const REGION = { x: 0.55, y: 0.05, width: 0.35, height: 0.35 };
const QUADRANTS = {
  topLeft: '#ff0000', topRight: '#00c000', bottomLeft: '#0000ff', bottomRight: '#ffffff',
} as const;

/** A synthetic rendered page: four solid quadrants, so a crop is checkable. */
async function syntheticPageDerivative(): Promise<Uint8Array> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const canvas = createCanvas(PAGE_PIXELS, PAGE_PIXELS);
  const ctx = canvas.getContext('2d');
  const half = PAGE_PIXELS / 2;
  ctx.fillStyle = QUADRANTS.topLeft; ctx.fillRect(0, 0, half, half);
  ctx.fillStyle = QUADRANTS.topRight; ctx.fillRect(half, 0, half, half);
  ctx.fillStyle = QUADRANTS.bottomLeft; ctx.fillRect(0, half, half, half);
  ctx.fillStyle = QUADRANTS.bottomRight; ctx.fillRect(half, half, half, half);
  return canvas.encode('webp', 100);
}

/** The colour at the middle of a decoded WebP, as [r, g, b]. */
async function centrePixel(bytes: Uint8Array): Promise<readonly [number, number, number]> {
  const { loadImage, createCanvas } = await import('@napi-rs/canvas');
  const image = await loadImage(Buffer.from(bytes));
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(Math.floor(image.width / 2), Math.floor(image.height / 2), 1, 1);
  return [data[0], data[1], data[2]] as const;
}

const describeLocal = hasLocalStack ? describe : describe.skip;

describeLocal('R6B private PDF area images, against a real local stack', () => {
  let admin: SupabaseClient;
  let boardId: string;
  let ownerId: string;
  let viewerId: string;
  let unrelatedId: string;
  let documentId: string;
  let derivativePath: string;
  const createdPadletIds: string[] = [];

  beforeAll(async () => {
    admin = createClient(requireLoopbackUrl(env.P4_SUPABASE_URL), env.P4_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    boardId = env.P4_BOARD_A;
    ownerId = env.P4_OWNER;
    viewerId = env.P4_VIEWER;
    unrelatedId = env.P4_UNRELATED;
    documentId = randomUUID();

    const inserted = await admin.from('knowledge_documents').insert({
      id: documentId,
      board_id: boardId,
      created_by: ownerId,
      kind: 'pdf',
      original_filename: 'r6b-synthetic.pdf',
      mime_type: 'application/pdf',
      file_size_bytes: 1024,
      storage_path: `knowledge/${boardId}/${documentId}/original.pdf`,
      content_sha256: 'c'.repeat(64),
      page_count: 1,
      processing_status: 'ready',
    });
    expect(inserted.error).toBeNull();

    const page = await admin.from('knowledge_pages').insert({
      document_id: documentId, page_number: PAGE, text: 'synthetic',
      width_points: PAGE_PIXELS, height_points: PAGE_PIXELS, rotation: 0,
    });
    expect(page.error).toBeNull();

    derivativePath = knowledgePageDerivativePath(boardId, documentId, PAGE)!;
    const uploaded = await admin.storage
      .from(KNOWLEDGE_STORAGE_BUCKET)
      .upload(derivativePath, Buffer.from(await syntheticPageDerivative()),
        { contentType: 'image/webp', upsert: true });
    expect(uploaded.error).toBeNull();
  });

  afterAll(async () => {
    if (!admin) return;
    const objectPaths = createdPadletIds
      .map((id) => knowledgePdfAreaImagePath(boardId, id))
      .filter((value): value is string => value !== null);
    if (objectPaths.length > 0) await admin.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove(objectPaths);
    if (derivativePath) await admin.storage.from(KNOWLEDGE_STORAGE_BUCKET).remove([derivativePath]);
    if (createdPadletIds.length > 0) await admin.from('padlets').delete().in('id', createdPadletIds);
    if (documentId) await admin.from('knowledge_documents').delete().eq('id', documentId);
  });

  const createHandler = (userId: string) => createKnowledgePdfAreaImageHandler({
    getAuthenticatedSession: async () => createRealKnowledgePdfAreaImageSession(admin, admin, userId),
  });

  const serveHandler = (userId: string) => createKnowledgePdfAreaImageServeHandler({
    getAuthenticatedSession: async () => createRealKnowledgePdfAreaImageServeSession(admin, admin, userId),
  });

  const createRequest = (overrides: Record<string, unknown> = {}) =>
    new Request(`http://localhost/api/boards/${boardId}/knowledge/area-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        knowledgeDocumentId: documentId, pageNumber: PAGE, region: REGION,
        title: 'r6b-synthetic.pdf', positionX: 100, positionY: 200, ...overrides,
      }),
    });

  it('L1: an editor turns a real area into a real private Image card', async () => {
    const response = await createHandler(ownerId)(createRequest(), { params: Promise.resolve({ id: boardId }) });
    expect(response.status).toBe(201);
    const { padlet } = await response.json() as { padlet: Record<string, unknown> };
    createdPadletIds.push(padlet.id as string);

    // The row is really in Postgres, on this board, as an ordinary Image card.
    const stored = await admin.from('padlets')
      .select('id, board_id, type, file_url, metadata').eq('id', padlet.id as string).single();
    expect(stored.error).toBeNull();
    expect(stored.data!.board_id).toBe(boardId);
    expect(stored.data!.type).toBe('image');
    expect(stored.data!.file_url).toBe(`/api/boards/${boardId}/padlets/${padlet.id}/image`);
    expect((stored.data!.metadata as { source: { kind: string } }).source.kind)
      .toBe(KNOWLEDGE_PDF_AREA_SOURCE_KIND);
  });

  it('L2: the crop really exists in the PRIVATE bucket, and is the region asked for', async () => {
    const padletId = createdPadletIds[0];
    const objectPath = knowledgePdfAreaImagePath(boardId, padletId)!;
    const downloaded = await admin.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
    expect(downloaded.error).toBeNull();
    const bytes = new Uint8Array(await downloaded.data!.arrayBuffer());

    // The top-right quadrant is green. A wrong rectangle, a wrong rotation or a
    // wrong page would all land on a different colour.
    const [r, g, b] = await centrePixel(bytes);
    expect(g).toBeGreaterThan(150);
    expect(r).toBeLessThan(100);
    expect(b).toBeLessThan(100);
  });

  it('L3: the crop is NOT reachable without a session -- there is no public URL', async () => {
    const padletId = createdPadletIds[0];
    const objectPath = knowledgePdfAreaImagePath(boardId, padletId)!;
    const publicUrl = `${env.P4_SUPABASE_URL}/storage/v1/object/public/${KNOWLEDGE_STORAGE_BUCKET}/${objectPath}`;
    const anonymous = await fetch(requireLoopbackUrl(publicUrl));
    expect(anonymous.ok).toBe(false);
    expect([400, 401, 403, 404]).toContain(anonymous.status);
  });

  it('L4: a board member reads it through the authenticated route, byte for byte', async () => {
    const padletId = createdPadletIds[0];
    const response = await serveHandler(ownerId)(
      new Request(`http://localhost/api/boards/${boardId}/padlets/${padletId}/image`),
      { params: Promise.resolve({ id: boardId, padletId }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/webp');
    expect(response.headers.get('Cache-Control')).toContain('no-store');

    const served = new Uint8Array(await response.arrayBuffer());
    const objectPath = knowledgePdfAreaImagePath(boardId, padletId)!;
    const stored = await admin.storage.from(KNOWLEDGE_STORAGE_BUCKET).download(objectPath);
    expect(served).toEqual(new Uint8Array(await stored.data!.arrayBuffer()));
  });

  it('L5: a non-member is refused the image, so revocation is real', async () => {
    const padletId = createdPadletIds[0];
    const response = await serveHandler(unrelatedId)(
      new Request(`http://localhost/api/boards/${boardId}/padlets/${padletId}/image`),
      { params: Promise.resolve({ id: boardId, padletId }) },
    );
    expect(response.status).toBe(403);
  });

  it('L6: a VIEWER cannot create one, and nothing is written when they try', async () => {
    const before = await admin.from('padlets').select('id').eq('board_id', boardId);
    const response = await createHandler(viewerId)(createRequest(), { params: Promise.resolve({ id: boardId }) });
    expect(response.status).toBe(403);
    const after = await admin.from('padlets').select('id').eq('board_id', boardId);
    expect(after.data!.length).toBe(before.data!.length);
  });

  it('L7: an ordinary card on the same board is never served from the bucket', async () => {
    const plainId = randomUUID();
    const inserted = await admin.from('padlets').insert({
      id: plainId, board_id: boardId, title: 'R6B plain', content: '', type: 'image',
      metadata: { imageUrl: 'https://example.test/a.png' },
    });
    expect(inserted.error).toBeNull();
    createdPadletIds.push(plainId);

    const response = await serveHandler(ownerId)(
      new Request(`http://localhost/api/boards/${boardId}/padlets/${plainId}/image`),
      { params: Promise.resolve({ id: boardId, padletId: plainId }) },
    );
    expect(response.status).toBe(404);
  });

  it('L8: a page with no rendered derivative refuses rather than inventing a card', async () => {
    const response = await createHandler(ownerId)(
      createRequest({ pageNumber: 2 }), { params: Promise.resolve({ id: boardId }) },
    );
    // page_count is 1, so page 2 is out of bounds for this document.
    expect(response.status).toBe(404);
  });
});
