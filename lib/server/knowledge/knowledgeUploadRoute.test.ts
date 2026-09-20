import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeIngestionDeps } from '@/lib/domain/knowledge/knowledgeIngestion';
import type { KnowledgeDocument } from '@/lib/domain/knowledge/knowledgePersistence';
import { createKnowledgeUploadPostHandler } from './knowledgeUploadRoute';
import type { KnowledgeTextIngestionWiring } from './knowledgeUploadRoute';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const DOCUMENT_ID = '33333333-3333-4333-8333-333333333333';

function document(filename: string): KnowledgeDocument {
  return {
    id: DOCUMENT_ID as KnowledgeDocument['id'],
    boardId: BOARD_ID as KnowledgeDocument['boardId'],
    createdBy: USER_ID as KnowledgeDocument['createdBy'],
    kind: 'pdf',
    originalFilename: filename,
    mimeType: 'application/pdf',
    fileSizeBytes: 12,
    storagePath: `knowledge/${BOARD_ID}/${DOCUMENT_ID}/original.pdf`,
    contentSha256: 'a'.repeat(64),
    pageCount: null,
    processingStatus: 'uploaded',
    processingError: null,
    parserName: null,
    parserVersion: null,
    parserOptionsHash: null,
    rawArtifactPath: null,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
  };
}

function ingestionDeps(authorized = true) {
  const upload = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const remove = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const insertDocument = vi.fn(async (record: { originalFilename: string }) => ({
    ok: true as const,
    value: document(record.originalFilename),
  }));
  const canMutateBoard = vi.fn(async () => ({ ok: true as const, value: authorized }));
  const sha256 = vi.fn(async () => 'a'.repeat(64));
  const newDocumentId = vi.fn(() => DOCUMENT_ID as KnowledgeDocument['id']);

  const deps: KnowledgeIngestionDeps = {
    authorizer: { canMutateBoard },
    repository: { insertDocument: insertDocument as KnowledgeIngestionDeps['repository']['insertDocument'] },
    storage: { upload, remove },
    hasher: { sha256 },
    ids: { newDocumentId },
  };

  return { deps, upload, remove, insertDocument, canMutateBoard, sha256, newDocumentId };
}

function textDeps(authorized = true) {
  const upload = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const remove = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const insertTextChunks = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const deleteDocument = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const markDocumentReady = vi.fn(async () => ({
    ok: true as const,
    value: { ...document('notes.md'), kind: 'text' as const, processingStatus: 'ready' as const },
  }));
  const insertTextDocument = vi.fn(async (record: { originalFilename: string }) => ({
    ok: true as const,
    value: { ...document(record.originalFilename), kind: 'text' as const, processingStatus: 'ready' as const },
  }));
  const canMutateBoard = vi.fn(async () => ({ ok: true as const, value: authorized }));

  const wiring = {
    deps: {
      authorizer: { canMutateBoard },
      repository: { insertTextDocument, insertTextChunks, markDocumentReady, deleteDocument },
      storage: { upload, remove },
      hasher: { sha256: vi.fn(async () => 'b'.repeat(64)) },
      ids: { newDocumentId: vi.fn(() => DOCUMENT_ID as KnowledgeDocument['id']) },
    },
    hashChunk: (text: string) => `hash:${text.length}`,
  } as unknown as KnowledgeTextIngestionWiring;

  return { wiring, upload, remove, insertTextDocument, insertTextChunks, markDocumentReady, deleteDocument, canMutateBoard };
}

function context() {
  return { params: Promise.resolve({ id: BOARD_ID }) };
}

function postRequest(file?: File): Request {
  const body = new FormData();
  if (file) body.set('file', file);
  return new Request(`http://localhost/api/boards/${BOARD_ID}/knowledge`, {
    method: 'POST',
    body,
  });
}

function pdfFile(
  bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46]),
  type = 'application/pdf',
  name = 'smoke.pdf',
) {
  return new File([bytes], name, { type });
}

describe('P6A Knowledge PDF upload HTTP boundary', () => {
  it('rejects unauthenticated requests before constructing ingestion dependencies', async () => {
    const createIngestionDeps = vi.fn(() => ingestionDeps().deps);
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => null,
      createIngestionDeps,
      createTextIngestionDeps: () => textDeps().wiring,
    });

    const response = await post(postRequest(pdfFile()), context());

    expect(response.status).toBe(401);
    expect(createIngestionDeps).not.toHaveBeenCalled();
  });

  it('rejects a missing file', async () => {
    const state = ingestionDeps();
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
      createTextIngestionDeps: () => textDeps().wiring,
    });

    const response = await post(postRequest(), context());

    expect(response.status).toBe(400);
    expect(state.canMutateBoard).not.toHaveBeenCalled();
  });

  it('rejects a type neither path handles, through the existing domain validator', async () => {
    // CHANGED DELIBERATELY. This case used to upload a text/plain file and
    // expect a refusal, which was the truth when PDF was the only kind. A .txt
    // is now a supported source, so the case that still tests this boundary is
    // a type NEITHER path claims -- it falls through to the PDF validator and
    // is refused there, as before.
    const state = ingestionDeps();
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
      createTextIngestionDeps: () => textDeps().wiring,
    });

    const response = await post(postRequest(pdfFile(undefined, 'image/png', 'photo.png')), context());

    expect(response.status).toBe(400);
    expect(state.canMutateBoard).toHaveBeenCalledOnce();
    expect(state.upload).not.toHaveBeenCalled();
  });

  it('rejects a fake .pdf without the %PDF- signature', async () => {
    const state = ingestionDeps();
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
      createTextIngestionDeps: () => textDeps().wiring,
    });

    const response = await post(
      postRequest(pdfFile(new TextEncoder().encode('not a pdf'), 'application/pdf', 'fake.pdf')),
      context(),
    );

    expect(response.status).toBe(400);
    expect(state.upload).not.toHaveBeenCalled();
  });

  it('rejects a user who cannot mutate the board', async () => {
    const state = ingestionDeps(false);
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
      createTextIngestionDeps: () => textDeps().wiring,
    });

    const response = await post(postRequest(pdfFile()), context());

    expect(response.status).toBe(403);
    expect(state.canMutateBoard).toHaveBeenCalledOnce();
    expect(state.upload).not.toHaveBeenCalled();
  });

  it('delegates an authorized PDF to Knowledge ingestion and returns minimal uploaded metadata', async () => {
    const state = ingestionDeps();
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
      createTextIngestionDeps: () => textDeps().wiring,
    });

    const response = await post(postRequest(pdfFile()), context());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      id: DOCUMENT_ID,
      boardId: BOARD_ID,
      originalFilename: 'smoke.pdf',
      processingStatus: 'uploaded',
      // ADDED DELIBERATELY: the client can no longer infer from the status
      // alone whether something is coming later, because a text source arrives
      // already ready. Pinned so a silently widened payload is still a failure.
      kind: 'pdf',
    });
    expect(state.canMutateBoard).toHaveBeenCalledOnce();
    expect(state.sha256).toHaveBeenCalledOnce();
    expect(state.newDocumentId).toHaveBeenCalledOnce();
    expect(state.upload).toHaveBeenCalledOnce();
    expect(state.insertDocument).toHaveBeenCalledOnce();
    expect(state.remove).not.toHaveBeenCalled();
  });
});

describe('Stage 1 text sources reach the text path, and only they do', () => {
  function handler(text = textDeps(), pdf = ingestionDeps()) {
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => pdf.deps,
      createTextIngestionDeps: () => text.wiring,
    });
    return { post, text, pdf };
  }

  const textFile = (name: string, type: string, body = 'Alpha.\r\n\r\nBeta paragraph with enough text to be worth indexing.') =>
    new File([new TextEncoder().encode(body)], name, { type });

  it.each([
    ['notes.txt', 'text/plain'],
    ['notes.md', 'text/markdown'],
    ['README.markdown', 'application/octet-stream'],
  ])('%s is ingested as text, and the PDF path is never constructed', async (name, type) => {
    const state = handler();
    const response = await state.post(postRequest(textFile(name, type)), context());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.kind).toBe('text');
    // READY, not uploaded: nothing will come later to make it searchable.
    expect(payload.processingStatus).toBe('ready');
    expect(state.text.insertTextDocument).toHaveBeenCalledOnce();
    expect(state.text.insertTextChunks).toHaveBeenCalledOnce();
    // 'ready' in the response comes from the PROMOTION, not from the insert:
    // the document is only searchable once what makes it searchable exists.
    expect(state.text.markDocumentReady).toHaveBeenCalledOnce();
    expect(state.pdf.insertDocument).not.toHaveBeenCalled();
  });

  it('a PDF still takes the PDF path untouched', async () => {
    // The regression control for the branch itself.
    const state = handler();
    const response = await state.post(postRequest(pdfFile()), context());

    expect(response.status).toBe(201);
    expect(state.pdf.insertDocument).toHaveBeenCalledOnce();
    expect(state.text.insertTextDocument).not.toHaveBeenCalled();
  });

  it('a .txt full of binary is refused with the reason, not stored', async () => {
    // The extension said text; the bytes decide. The refusal must reach the
    // user as something they can act on.
    const state = handler();
    const file = new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], 'notes.txt', { type: 'text/plain' });
    const response = await state.post(postRequest(file), context());

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/not valid UTF-8/);
    expect(state.text.upload).not.toHaveBeenCalled();
  });

  it('an unauthorized user is refused before any text is written', async () => {
    const state = handler(textDeps(false));
    const response = await state.post(postRequest(textFile('notes.txt', 'text/plain')), context());

    expect(response.status).toBe(403);
    expect(state.text.upload).not.toHaveBeenCalled();
    expect(state.text.insertTextDocument).not.toHaveBeenCalled();
  });

  it('a failed chunk write compensates both ways and reports the failure', async () => {
    const state = textDeps();
    state.insertTextChunks.mockResolvedValueOnce(
      { ok: false, error: { code: 'unavailable', message: 'chunks' } } as never,
    );
    const { post } = handler(state);
    const response = await post(postRequest(textFile('notes.txt', 'text/plain')), context());

    expect(response.status).toBe(503);
    // The state being ruled out: a document row in the library that reports
    // itself ready and can never be found.
    expect(state.deleteDocument).toHaveBeenCalledOnce();
    expect(state.remove).toHaveBeenCalledOnce();
  });
});
