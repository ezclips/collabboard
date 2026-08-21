import { describe, expect, it, vi } from 'vitest';
import { domainError } from '@/lib/domain/core/errors';
import type { KnowledgeDocumentListItem } from '@/lib/infra/knowledge/knowledgeReadAdapters';
import { createKnowledgeListGetHandler } from './knowledgeListRoute';

const BOARD_ID = '11111111-1111-4111-8111-111111111111';

function context() {
  return { params: Promise.resolve({ id: BOARD_ID }) };
}

function getRequest(): Request {
  return new Request(`http://localhost/api/boards/${BOARD_ID}/knowledge`, {
    method: 'GET',
  });
}

function item(
  id: string,
  processingStatus: KnowledgeDocumentListItem['processingStatus'],
  pageCount: number | null,
): KnowledgeDocumentListItem {
  return {
    id: id as KnowledgeDocumentListItem['id'],
    boardId: BOARD_ID as KnowledgeDocumentListItem['boardId'],
    originalFilename: `${processingStatus}.pdf`,
    fileSizeBytes: 1234,
    pageCount,
    processingStatus,
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:01:00.000Z',
  };
}

describe('P6B Knowledge PDF board list/status HTTP boundary', () => {
  it('rejects unauthenticated requests before constructing the read repository', async () => {
    const createRepository = vi.fn();
    const get = createKnowledgeListGetHandler({
      getAuthenticatedSession: async () => null,
      createRepository,
    });

    const response = await get(getRequest(), context());

    expect(response.status).toBe(401);
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('rejects a user without reader access before querying Knowledge documents', async () => {
    const canViewBoard = vi.fn(async () => false);
    const createRepository = vi.fn();
    const get = createKnowledgeListGetHandler({
      getAuthenticatedSession: async () => ({ canViewBoard }),
      createRepository,
    });

    const response = await get(getRequest(), context());

    expect(response.status).toBe(403);
    expect(canViewBoard).toHaveBeenCalledWith(BOARD_ID);
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('returns safe board PDF metadata to a reader and preserves all processing states', async () => {
    const documents = [
      item('10000000-0000-4000-8000-000000000001', 'uploaded', null),
      item('10000000-0000-4000-8000-000000000002', 'processing', null),
      item('10000000-0000-4000-8000-000000000003', 'ready', 7),
      item('10000000-0000-4000-8000-000000000004', 'failed', null),
    ];
    const listDocumentsByBoardId = vi.fn(async () => ({
      ok: true as const,
      value: documents,
    }));
    const get = createKnowledgeListGetHandler({
      getAuthenticatedSession: async () => ({ canViewBoard: async () => true }),
      createRepository: () => ({ listDocumentsByBoardId }),
    });

    const response = await get(getRequest(), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(listDocumentsByBoardId).toHaveBeenCalledWith(BOARD_ID);
    expect(payload).toEqual({ documents });
    expect(payload.documents.map((document: { processingStatus: string }) => document.processingStatus)).toEqual([
      'uploaded',
      'processing',
      'ready',
      'failed',
    ]);
    expect(Object.keys(payload.documents[0]).sort()).toEqual(
      [
        'id',
        'boardId',
        'originalFilename',
        'fileSizeBytes',
        'pageCount',
        'processingStatus',
        'createdAt',
        'updatedAt',
      ].sort(),
    );
  });

  it('maps a board-permission lookup failure to 503 rather than granting access', async () => {
    const createRepository = vi.fn();
    const get = createKnowledgeListGetHandler({
      getAuthenticatedSession: async () => ({
        canViewBoard: async () => {
          throw new Error('permission rpc unavailable');
        },
      }),
      createRepository,
    });

    const response = await get(getRequest(), context());

    expect(response.status).toBe(503);
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('maps repository failure to a sanitized 503 response', async () => {
    const get = createKnowledgeListGetHandler({
      getAuthenticatedSession: async () => ({ canViewBoard: async () => true }),
      createRepository: () => ({
        listDocumentsByBoardId: async () => ({
          ok: false as const,
          error: domainError('unavailable', 'database details that must not escape'),
        }),
      }),
    });

    const response = await get(getRequest(), context());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: 'Knowledge documents are temporarily unavailable' });
    expect(JSON.stringify(payload)).not.toContain('database details');
  });
});
