import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeIngestionDeps } from '@/lib/domain/knowledge/knowledgeIngestion';
import type { KnowledgeDocument } from '@/lib/domain/knowledge/knowledgePersistence';
import { createKnowledgeUploadPostHandler } from './knowledgeUploadRoute';

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
    });

    const response = await post(postRequest(), context());

    expect(response.status).toBe(400);
    expect(state.canMutateBoard).not.toHaveBeenCalled();
  });

  it('rejects a non-PDF MIME type through the existing domain validator', async () => {
    const state = ingestionDeps();
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
    });

    const response = await post(postRequest(pdfFile(undefined, 'text/plain', 'smoke.txt')), context());

    expect(response.status).toBe(400);
    expect(state.canMutateBoard).toHaveBeenCalledOnce();
    expect(state.upload).not.toHaveBeenCalled();
  });

  it('rejects a fake .pdf without the %PDF- signature', async () => {
    const state = ingestionDeps();
    const post = createKnowledgeUploadPostHandler({
      getAuthenticatedUserId: async () => USER_ID,
      createIngestionDeps: () => state.deps,
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
    });

    const response = await post(postRequest(pdfFile()), context());
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload).toEqual({
      id: DOCUMENT_ID,
      boardId: BOARD_ID,
      originalFilename: 'smoke.pdf',
      processingStatus: 'uploaded',
    });
    expect(state.canMutateBoard).toHaveBeenCalledOnce();
    expect(state.sha256).toHaveBeenCalledOnce();
    expect(state.newDocumentId).toHaveBeenCalledOnce();
    expect(state.upload).toHaveBeenCalledOnce();
    expect(state.insertDocument).toHaveBeenCalledOnce();
    expect(state.remove).not.toHaveBeenCalled();
  });
});
