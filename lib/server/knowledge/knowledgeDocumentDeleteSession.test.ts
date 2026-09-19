import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * THE BOARD IN THE PATH MUST OWN THE DOCUMENT.
 *
 * `deleteKnowledgeDocument` authorizes against the document's OWN board, which
 * is what makes it safe -- an attacker cannot gain a permission by addressing a
 * document through a board they happen to control. What they COULD do without
 * the check here is address board B's document through board A's URL and have
 * it work whenever they are an editor of B as well: the request would succeed
 * while being a lie about what it operated on, and any audit reading the path
 * would be wrong about which board lost a file.
 *
 * So the check is asserted directly, including that the domain delete is never
 * reached when the scope does not match -- a 404 that still deleted would be
 * the worst of both.
 */

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  deleteKnowledgeDocument: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));
vi.mock('../../supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('../../domain/knowledge/knowledgeDeletion', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../domain/knowledge/knowledgeDeletion')>()),
  deleteKnowledgeDocument: mocks.deleteKnowledgeDocument,
}));

const BOARD = '11111111-1111-4111-8111-111111111111';
const OTHER_BOARD = '99999999-9999-4999-8999-999999999999';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';

/** An admin client whose knowledge_documents lookup returns `row`. */
function adminReturning(row: unknown, error: unknown = null) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: row, error })),
        })),
      })),
    })),
  };
}

let getKnowledgeDocumentDeleteSession: typeof import('./knowledgeDocumentDeleteSession')['getKnowledgeDocumentDeleteSession'];

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  mocks.createRouteHandlerClient.mockReturnValue({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } }, error: null })) },
  });
  mocks.deleteKnowledgeDocument.mockResolvedValue({
    ok: true,
    value: { deleted: true, storageCleanup: { status: 'complete', attemptedPaths: [], failedPaths: [], failures: [] } },
  });
  ({ getKnowledgeDocumentDeleteSession } = await import('./knowledgeDocumentDeleteSession'));
});

describe('identity', () => {
  it('is null when nobody is signed in, so the handler can only 401', async () => {
    mocks.createRouteHandlerClient.mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: null })) },
    });
    expect(await getKnowledgeDocumentDeleteSession()).toBeNull();
  });

  it('carries the authenticated user id, not one a caller supplied', async () => {
    const session = await getKnowledgeDocumentDeleteSession();
    expect(session?.userId).toBe(USER);
  });
});

describe('board scope', () => {
  it('deletes when the document belongs to the board in the path', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(adminReturning({ id: DOCUMENT, board_id: BOARD }));
    const session = await getKnowledgeDocumentDeleteSession();

    const result = await session!.deleteDocument({ boardId: BOARD, documentId: DOCUMENT, userId: USER });

    expect(result.ok).toBe(true);
    expect(mocks.deleteKnowledgeDocument).toHaveBeenCalledTimes(1);
    expect(mocks.deleteKnowledgeDocument.mock.calls[0][1]).toEqual({
      documentId: DOCUMENT,
      userId: USER,
    });
  });

  it('refuses a document that belongs to a DIFFERENT board, and deletes nothing', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(adminReturning({ id: DOCUMENT, board_id: OTHER_BOARD }));
    const session = await getKnowledgeDocumentDeleteSession();

    const result = await session!.deleteDocument({ boardId: BOARD, documentId: DOCUMENT, userId: USER });

    expect(result.ok).toBe(false);
    // not_found rather than permission_denied: saying "forbidden" would confirm
    // that this id exists somewhere the caller cannot see.
    expect(result.ok === false && result.error.code).toBe('not_found');
    expect(mocks.deleteKnowledgeDocument).not.toHaveBeenCalled();
  });

  it('refuses a document that does not exist at all', async () => {
    mocks.getSupabaseAdmin.mockReturnValue(adminReturning(null));
    const session = await getKnowledgeDocumentDeleteSession();

    const result = await session!.deleteDocument({ boardId: BOARD, documentId: DOCUMENT, userId: USER });

    expect(result.ok === false && result.error.code).toBe('not_found');
    expect(mocks.deleteKnowledgeDocument).not.toHaveBeenCalled();
  });

  it('reports a failed lookup as unavailable rather than as a missing document', async () => {
    // "We could not tell" must not become "it is not there": the second would
    // make a transient outage look like a completed delete.
    mocks.getSupabaseAdmin.mockReturnValue(adminReturning(null, { message: 'timeout' }));
    const session = await getKnowledgeDocumentDeleteSession();

    const result = await session!.deleteDocument({ boardId: BOARD, documentId: DOCUMENT, userId: USER });

    expect(result.ok === false && result.error.code).toBe('unavailable');
    expect(mocks.deleteKnowledgeDocument).not.toHaveBeenCalled();
  });
});
