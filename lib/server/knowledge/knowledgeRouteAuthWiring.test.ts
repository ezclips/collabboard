import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type UploadAuthDependencies = {
  getAuthenticatedUserId(): Promise<string | null>;
};

type ReadAuthDependencies = {
  getAuthenticatedSession(): Promise<{
    canViewBoard(boardId: string): Promise<boolean>;
  } | null>;
};

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createServerClient: vi.fn(),
  requireBoardPermission: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/ssr', () => ({ createServerClient: mocks.createServerClient }));
vi.mock('@/lib/auth/permissions', () => ({ requireBoardPermission: mocks.requireBoardPermission }));
vi.mock('@/lib/server/knowledge/knowledgeUploadRoute', () => ({
  createKnowledgeUploadPostHandler: (deps: UploadAuthDependencies) => async () => {
    const userId = await deps.getAuthenticatedUserId();
    return userId
      ? Response.json({ userId })
      : Response.json({ error: 'Unauthorized' }, { status: 401 });
  },
}));
vi.mock('@/lib/server/knowledge/knowledgeListRoute', () => ({
  createKnowledgeListGetHandler: (deps: ReadAuthDependencies) => async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const session = await deps.getAuthenticatedSession();
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const allowed = await session.canViewBoard(id);
    return Response.json({ allowed }, { status: allowed ? 200 : 403 });
  },
}));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const SIGNED_IN_USER_ID = '22222222-2222-4222-8222-222222222222';
const ATTACKER_USER_ID = '33333333-3333-4333-8333-333333333333';

let route: typeof import('../../../app/api/boards/[id]/knowledge/route');
let capturedOptions: unknown;

function context() {
  return { params: Promise.resolve({ id: BOARD_ID }) };
}

function getRequest() {
  return new Request('http://localhost/api/boards/' + BOARD_ID + '/knowledge');
}

function postRequest() {
  return new Request('http://localhost/api/boards/' + BOARD_ID + '/knowledge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': ATTACKER_USER_ID,
    },
    body: JSON.stringify({ userId: ATTACKER_USER_ID }),
  });
}

function configureAuth(user: { id: string } | null) {
  const cookieStore = {
    getAll: vi.fn(() => [{ name: 'sb-access-token', value: 'signed-cookie' }]),
    set: vi.fn(),
  };
  const authClient = {
    auth: {
      getUser: vi.fn(async () => ({ data: { user }, error: null })),
    },
  };

  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.createServerClient.mockImplementation((_url: string, _key: string, options: unknown) => {
    capturedOptions = options;
    return authClient;
  });

  return { cookieStore, authClient };
}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  route = await import('../../../app/api/boards/[id]/knowledge/route');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

beforeEach(() => {
  vi.clearAllMocks();
  capturedOptions = undefined;
});

describe('Knowledge route Next 15 auth cookie wiring', () => {
  it('uses the authenticated server user for POST and ignores client identity', async () => {
    const { cookieStore } = configureAuth({ id: SIGNED_IN_USER_ID });

    const response = await route.POST(postRequest(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: SIGNED_IN_USER_ID });

    if (!capturedOptions) throw new Error('SSR client options were not captured');
    const adapter = capturedOptions as {
      cookies: {
        getAll(): unknown;
        setAll(values: readonly { name: string; value: string; options?: unknown }[]): void;
      };
    };
    expect(adapter.cookies.getAll()).toEqual(cookieStore.getAll());
    adapter.cookies.setAll([{ name: 'sb-refresh-token', value: 'refreshed', options: { path: '/' } }]);
    expect(cookieStore.set).toHaveBeenCalledWith(
      'sb-refresh-token',
      'refreshed',
      { path: '/' },
    );
  });

  it('authenticates GET before evaluating board reader permission', async () => {
    configureAuth({ id: SIGNED_IN_USER_ID });
    mocks.requireBoardPermission.mockResolvedValue({ allowed: true });

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(200);
    expect(mocks.requireBoardPermission).toHaveBeenCalledWith(
      expect.anything(),
      BOARD_ID,
      SIGNED_IN_USER_ID,
      'reader',
    );
  });

  it('returns 401 for unauthenticated GET and POST requests', async () => {
    configureAuth(null);

    const postResponse = await route.POST(postRequest(), context());
    const getResponse = await route.GET(getRequest(), context());

    expect(postResponse.status).toBe(401);
    expect(getResponse.status).toBe(401);
    expect(mocks.requireBoardPermission).not.toHaveBeenCalled();
  });

  it('preserves board authorization after authentication', async () => {
    configureAuth({ id: SIGNED_IN_USER_ID });
    mocks.requireBoardPermission.mockResolvedValue({ allowed: false });

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(403);
    expect(mocks.requireBoardPermission).toHaveBeenCalledWith(
      expect.anything(),
      BOARD_ID,
      SIGNED_IN_USER_ID,
      'reader',
    );
  });
});
