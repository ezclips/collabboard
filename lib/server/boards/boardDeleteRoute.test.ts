import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// app/api/** is outside vitest.config.ts's include globs, so the route module is
// imported and exercised from here -- the same pattern as
// lib/server/settings/aiProvidersRoute.test.ts.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  deleteKnowledgeBoard: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));
vi.mock('@/lib/domain/knowledge/knowledgeDeletion', () => ({
  deleteKnowledgeBoard: mocks.deleteKnowledgeBoard,
}));
// Adapters are constructed with the admin client; their internals are not under
// test here and must not reach Supabase.
vi.mock('@/lib/infra/knowledge/knowledgeDeletionAdapters', () => ({
  SupabaseBoardDeletionAuthorizer: class {},
  SupabaseKnowledgeDeletionRepository: class {},
}));
vi.mock('@/lib/infra/knowledge/knowledgeIngestionAdapters', () => ({
  SupabaseKnowledgeStorageGateway: class {},
}));

let route: typeof import('../../../app/api/boards/[id]/route');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_ID = '84da6ea7-865d-4c8d-a229-0fd0124d8c10';

/** A Next 15 cookie store: resolved by `await cookies()`, with a sync `.get`. */
function cookieStore() {
  return { get: vi.fn(() => ({ name: 'sb', value: 'token' })), getAll: vi.fn(() => []) };
}

function request() {
  return new Request(`http://localhost/api/boards/${BOARD_ID}`, { method: 'DELETE' });
}

function context() {
  return { params: Promise.resolve({ id: BOARD_ID }) };
}

function configureAuth(userId: string | null) {
  mocks.createRouteHandlerClient.mockImplementation((options: { cookies: () => unknown }) => {
    // Mirror the helper: it calls the adapter and uses the store synchronously.
    const store = options.cookies() as { get?: unknown };
    if (typeof store?.get !== 'function') {
      throw new TypeError('nextCookies.get is not a function');
    }
    return {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: userId ? { id: userId } : null },
          error: userId ? null : { message: 'no session' },
        })),
      },
    };
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  mocks.cookies.mockResolvedValue(cookieStore());
  mocks.getSupabaseAdmin.mockReturnValue({});
  configureAuth(USER_ID);
  mocks.deleteKnowledgeBoard.mockResolvedValue({
    ok: true,
    value: { deleted: true, storageCleanup: { status: 'complete', attemptedPaths: [], failedPaths: [], failures: [] } },
  });
  route = await import('../../../app/api/boards/[id]/route');
});

afterEach(() => { vi.resetModules(); });

describe('1. the cookie adapter matches the working repository convention', () => {
  it('hands createRouteHandlerClient a store with a synchronous get -- not a Promise', async () => {
    await route.DELETE(request(), context());

    expect(mocks.createRouteHandlerClient).toHaveBeenCalledTimes(1);
    const options = mocks.createRouteHandlerClient.mock.calls[0][0] as { cookies: () => unknown };
    const store = options.cookies();

    // The regression: an async adapter returns a Promise, whose .get is undefined.
    expect(store).not.toBeInstanceOf(Promise);
    expect(typeof (store as { get?: unknown }).get).toBe('function');
  });

  it('no longer throws the cookie-adapter TypeError that produced a 500', async () => {
    const response = await route.DELETE(request(), context());
    expect(response.status).not.toBe(500);
    await expect(response.json()).resolves.not.toMatchObject({ error: 'Internal server error' });
  });
});

describe('2 + 3. authorization is unchanged', () => {
  it('an unauthenticated request is still rejected with 401', async () => {
    configureAuth(null);
    const response = await route.DELETE(request(), context());
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
    expect(mocks.deleteKnowledgeBoard).not.toHaveBeenCalled();
  });

  it('a non-owner is still rejected by the existing authorizer, mapped to 403', async () => {
    mocks.deleteKnowledgeBoard.mockResolvedValue({
      ok: false,
      error: { code: 'permission_denied', message: 'You do not have permission to delete this board' },
    });
    const response = await route.DELETE(request(), context());
    expect(response.status).toBe(403);
  });

  it('a missing board still maps to 404', async () => {
    mocks.deleteKnowledgeBoard.mockResolvedValue({
      ok: false,
      error: { code: 'not_found', message: 'Board was not found' },
    });
    expect((await route.DELETE(request(), context())).status).toBe(404);
  });
});

describe('4 + 5 + 6. deletion orchestration is untouched', () => {
  it('an authorized delete reaches deleteKnowledgeBoard with the board and user', async () => {
    const response = await route.DELETE(request(), context());

    expect(response.status).toBe(200);
    expect(mocks.deleteKnowledgeBoard).toHaveBeenCalledTimes(1);
    const [deps, input] = mocks.deleteKnowledgeBoard.mock.calls[0];
    expect(input).toEqual({ boardId: BOARD_ID, userId: USER_ID });
    // The same three collaborators the route has always supplied.
    expect(Object.keys(deps).sort()).toEqual(['authorizer', 'repository', 'storage']);
  });

  it('returns the storage cleanup outcome, so callers can verify completeness', async () => {
    const response = await route.DELETE(request(), context());
    await expect(response.json()).resolves.toMatchObject({
      deleted: true,
      storageCleanup: { status: 'complete' },
    });
  });

  it('adds no direct board delete of its own -- deleteKnowledgeBoard stays the authority', async () => {
    const admin = { from: vi.fn() };
    mocks.getSupabaseAdmin.mockReturnValue(admin);
    await route.DELETE(request(), context());
    expect(admin.from).not.toHaveBeenCalled();
  });
});
