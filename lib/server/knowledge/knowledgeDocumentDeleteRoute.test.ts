import { describe, expect, it, vi } from 'vitest';

import { createKnowledgeDocumentDeleteHandler } from './knowledgeDocumentDeleteRoute';
import type { KnowledgeDocumentDeleteSession } from './knowledgeDocumentDeleteRoute';
import { domainError } from '../../domain/core/errors';
import { err, ok } from '../../domain/core/result';

/**
 * The HTTP edge of deleting ONE Knowledge document -- followups item 15.
 *
 * The handler is deliberately thin, so these assert the things a thin handler
 * can still get wrong: who it refuses, what it says when it refuses, what it
 * passes inward, and what it never reads.
 */

const BOARD = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

const cleanup = (status: 'complete' | 'partial', attempted: string[], failed: string[]) => ({
  status,
  attemptedPaths: attempted,
  failedPaths: failed,
  failures: failed.map((path) => ({ path, message: 'boom' })),
});

function sessionWith(
  deleteDocument: KnowledgeDocumentDeleteSession['deleteDocument'],
): KnowledgeDocumentDeleteSession {
  return { userId: USER, deleteDocument };
}

const request = (body?: unknown) => new Request(
  `http://localhost/api/boards/${BOARD}/knowledge/${DOCUMENT}`,
  body === undefined
    ? { method: 'DELETE' }
    : { method: 'DELETE', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } },
);

const context = { params: Promise.resolve({ id: BOARD, documentId: DOCUMENT }) };

describe('the delete handler refuses before it does anything', () => {
  it('401s when there is no session', async () => {
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => null,
    });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(401);
  });

  it('401s when the session factory throws, rather than surfacing the throw', async () => {
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => { throw new Error('cookie jar on fire'); },
    });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });
});

describe('identity comes from the path and the session, never the request', () => {
  it('passes the route board, the route document and the SESSION user inward', async () => {
    const deleteDocument = vi.fn(async () => ok({
      deleted: true as const,
      storageCleanup: cleanup('complete', ['a'], []),
    }));
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => sessionWith(deleteDocument),
    });

    // A body naming a different board, document and user. It must reach
    // nothing -- the handler never reads one.
    await DELETE(
      request({ boardId: 'other-board', documentId: 'other-document', userId: 'other-user' }),
      context,
    );

    expect(deleteDocument).toHaveBeenCalledWith({
      boardId: BOARD,
      documentId: DOCUMENT,
      userId: USER,
    });
  });
});

describe('domain outcomes become stable public responses', () => {
  const cases: readonly [Parameters<typeof domainError>[0], number][] = [
    ['not_found', 404],
    ['permission_denied', 403],
    ['unavailable', 503],
    ['validation', 400],
    ['conflict', 409],
  ];

  for (const [code, status] of cases) {
    it(`maps ${code} to ${status}`, async () => {
      const DELETE = createKnowledgeDocumentDeleteHandler({
        getAuthenticatedSession: async () => sessionWith(async () => err(domainError(code, 'developer detail'))),
      });
      const response = await DELETE(request(), context);
      expect(response.status).toBe(status);
      // The developer-facing message never travels.
      expect(JSON.stringify(await response.json())).not.toContain('developer detail');
    });
  }

  it('503s when the bound command throws', async () => {
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => sessionWith(async () => { throw new Error('network'); }),
    });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(503);
  });
});

describe('a partial storage cleanup is a success, and says so', () => {
  it('200s with counts when every object was removed', async () => {
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => sessionWith(async () => ok({
        deleted: true as const,
        storageCleanup: cleanup('complete', ['one', 'two'], []),
      })),
    });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deleted: true,
      storageCleanup: { status: 'complete', attempted: 2, failed: 0 },
    });
  });

  it('200s -- not an error -- when the row is gone but an object was left behind', async () => {
    // The row is deleted either way, and storage cleanup runs after it. A
    // client cannot fix a leaked object and must NOT retry the delete, because
    // the document no longer exists to delete.
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => sessionWith(async () => ok({
        deleted: true as const,
        storageCleanup: cleanup('partial', ['one', 'two'], ['two']),
      })),
    });
    const response = await DELETE(request(), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      deleted: true,
      storageCleanup: { status: 'partial', attempted: 2, failed: 1 },
    });
  });

  it('reports counts and never storage paths', async () => {
    const DELETE = createKnowledgeDocumentDeleteHandler({
      getAuthenticatedSession: async () => sessionWith(async () => ok({
        deleted: true as const,
        storageCleanup: cleanup('partial', ['knowledge/b/d/original.pdf'], ['knowledge/b/d/original.pdf']),
      })),
    });
    const response = await DELETE(request(), context);
    const body = JSON.stringify(await response.json());
    // A storage key is infrastructure detail; a browser has no use for it.
    expect(body).not.toContain('knowledge/');
    expect(body).not.toContain('original.pdf');
  });
});
