// PATCH-320 §5 / Addendum 4. The board DELETE route removes every kanban card's
// attachment folder for the board, but only after the authorized delete succeeds
// (deleteKnowledgeBoard stays the sole authority), and never blocks.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  deleteBoard: vi.fn(async (): Promise<any> => ({
    ok: true,
    value: { deleted: true, storageCleanup: { status: 'complete', attemptedPaths: [], failedPaths: [], failures: [] } },
  })),
  removeForCards: vi.fn(async () => {}),
  kanbanCards: [{ id: 'card-1' }, { id: 'card-2' }] as Array<{ id: string }>,
  storage: { marker: 'admin-storage' },
}));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ status: init?.status ?? 200, body }),
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({}) }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
  }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({ select: () => ({ eq: async () => ({ data: hoisted.kanbanCards, error: null }) }) }),
    storage: hoisted.storage,
  }),
}));
vi.mock('@/lib/domain/knowledge/knowledgeDeletion', () => ({ deleteKnowledgeBoard: hoisted.deleteBoard }));
vi.mock('@/lib/infra/knowledge/knowledgeDeletionAdapters', () => ({
  SupabaseBoardDeletionAuthorizer: class {},
  SupabaseKnowledgeDeletionRepository: class {},
}));
vi.mock('@/lib/infra/knowledge/knowledgeIngestionAdapters', () => ({
  SupabaseKnowledgeStorageGateway: class {},
}));
vi.mock('@/lib/kanban/kanbanAttachmentStorage', () => ({
  removeKanbanCardAttachmentsForCards: hoisted.removeForCards,
}));

import { DELETE } from '@/app/api/boards/[id]/route';

const call = () =>
  DELETE(new Request('http://localhost/api/boards/board-1') as never, {
    params: Promise.resolve({ id: 'board-1' }),
  });

describe('PATCH-320: the board DELETE route cleans up kanban attachments', () => {
  beforeEach(() => {
    hoisted.deleteBoard.mockReset().mockResolvedValue({
      ok: true,
      value: { deleted: true, storageCleanup: { status: 'complete', attemptedPaths: [], failedPaths: [], failures: [] } },
    });
    hoisted.removeForCards.mockReset().mockResolvedValue(undefined);
  });

  it('an authorized success removes each of the board\'s kanban card folders', async () => {
    const response = (await call()) as { status: number };
    expect(response.status).toBe(200);
    expect(hoisted.removeForCards).toHaveBeenCalledWith(hoisted.storage, ['card-1', 'card-2']);
    // deleteKnowledgeBoard remains the sole authority (no direct authorizer call
    // and no direct board delete by the route itself).
    expect(hoisted.deleteBoard).toHaveBeenCalledTimes(1);
  });

  it('a non-owner (403) removes nothing', async () => {
    hoisted.deleteBoard.mockResolvedValueOnce({
      ok: false,
      error: { code: 'permission_denied', message: 'You do not have permission to delete this board' },
    });
    const response = (await call()) as { status: number };
    expect(response.status).toBe(403);
    expect(hoisted.removeForCards).not.toHaveBeenCalled();
  });

  it('a missing board (404) removes nothing', async () => {
    hoisted.deleteBoard.mockResolvedValueOnce({
      ok: false,
      error: { code: 'not_found', message: 'Board was not found' },
    });
    const response = (await call()) as { status: number };
    expect(response.status).toBe(404);
    expect(hoisted.removeForCards).not.toHaveBeenCalled();
  });
});
