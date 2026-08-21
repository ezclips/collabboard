import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  createRouteHandlerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/server/knowledge/knowledgeUploadRoute', () => ({
  createKnowledgeUploadPostHandler: (deps: UploadAuthDependencies) => async () => {
    const userId = await deps.getAuthenticatedUserId();
    return userId
      ? Response.json({ userId })
      : Response.json({ error: 'Unauthorized' }, { status: 401 });
  },
}));
/**
 * Mirrors the real list handler's contract: a thrown authorization error is a
 * 503 (fail closed), a false result is a 403.
 */
vi.mock('@/lib/server/knowledge/knowledgeListRoute', () => ({
  createKnowledgeListGetHandler: (deps: ReadAuthDependencies) => async (
    _request: Request,
    context: { params: Promise<{ id: string }> },
  ) => {
    const session = await deps.getAuthenticatedSession();
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    try {
      const allowed = await session.canViewBoard(id);
      return Response.json({ allowed }, { status: allowed ? 200 : 403 });
    } catch {
      return Response.json(
        { error: 'Knowledge documents are temporarily unavailable' },
        { status: 503 },
      );
    }
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

type BoardLookup = { data: { id: string } | null; error: unknown };
type MemberLookup = { data: boolean | null; error: unknown };

/**
 * Board access fixture. `ownerRow` stands in for the RLS-filtered
 * `boards` lookup; `isBoardMember` stands in for the `is_board_member` RPC.
 */
function configureAuth(
  user: { id: string } | null,
  access: {
    ownerRow?: BoardLookup;
    isBoardMember?: MemberLookup;
  } = {},
) {
  const cookieStore = { get: vi.fn(() => null), set: vi.fn() };

  const ownerResult: BoardLookup = access.ownerRow ?? { data: null, error: null };
  const memberResult: MemberLookup = access.isBoardMember ?? { data: false, error: null };

  const eqFilters: Array<[string, string]> = [];
  const maybeSingle = vi.fn(async () => ownerResult);
  const builder = {
    eq: vi.fn((column: string, value: string) => {
      eqFilters.push([column, value]);
      return builder;
    }),
    maybeSingle,
  };
  const from = vi.fn(() => ({ select: vi.fn(() => builder) }));
  const rpc = vi.fn(async () => memberResult);

  const authClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user }, error: null })) },
    from,
    rpc,
  };

  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.createRouteHandlerClient.mockImplementation((options: unknown) => {
    capturedOptions = options;
    return authClient;
  });

  return { cookieStore, authClient, from, rpc, eqFilters };
}

const routeSource = () =>
  readFileSync(resolve(process.cwd(), 'app/api/boards/[id]/knowledge/route.ts'), 'utf8');

/**
 * Strips comments so the negative guards below test what the route DOES, not
 * what its documentation says it deliberately avoids -- the route explains at
 * length why it does not use requireBoardPermission/get_board_permission, and
 * naming a thing in order to exclude it must not trip the guard.
 */
const routeCode = () =>
  routeSource()
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

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

describe('Knowledge GET uses board read authorization, not the canvas RPC', () => {
  it('no longer imports or calls requireBoardPermission', () => {
    const source = routeCode();
    expect(source).not.toContain('requireBoardPermission');
    expect(source).not.toContain('@/lib/auth/permissions');
  });

  it('no longer depends on the legacy get_board_permission RPC', () => {
    // That RPC selects canvases.workspace_id, which does not exist -> 42703.
    const source = routeCode();
    expect(source).not.toContain('get_board_permission');
    expect(source).not.toContain('canvases');
  });

  it('authorizes through boards ownership and the is_board_member RPC', () => {
    const source = routeSource();
    expect(source).toContain("client.rpc('is_board_member'");
    expect(source).toContain("board_uuid: boardId");
    expect(source).toContain("user_uuid: userId");
  });

  it('does not reuse the editor-only mutation authorizer for reads', () => {
    // canMutateBoard requires role='editor' and would lock out viewers.
    const source = routeCode();
    const getSection = source.slice(0, source.indexOf('export const POST'));
    expect(getSection).not.toContain('canMutateBoard');
  });
});

describe('Knowledge GET access matrix', () => {
  it('authenticates with auth.getUser() before any board lookup', async () => {
    const { authClient, from } = configureAuth(
      { id: SIGNED_IN_USER_ID },
      { ownerRow: { data: { id: BOARD_ID }, error: null } },
    );

    await route.GET(getRequest(), context());

    expect(authClient.auth.getUser).toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith('boards');
  });

  it('permits the board owner', async () => {
    const { rpc, eqFilters } = configureAuth(
      { id: SIGNED_IN_USER_ID },
      { ownerRow: { data: { id: BOARD_ID }, error: null } },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(200);
    // Ownership is decided by the authenticated user id, never by request input.
    expect(eqFilters).toEqual([
      ['id', BOARD_ID],
      ['user_id', SIGNED_IN_USER_ID],
    ]);
    // Owner short-circuits: no membership RPC needed.
    expect(rpc).not.toHaveBeenCalled();
  });

  it('permits an editor collaborator', async () => {
    const { rpc } = configureAuth(
      { id: SIGNED_IN_USER_ID },
      { ownerRow: { data: null, error: null }, isBoardMember: { data: true, error: null } },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('is_board_member', {
      board_uuid: BOARD_ID,
      user_uuid: SIGNED_IN_USER_ID,
    });
  });

  it('permits a VIEWER collaborator -- is_board_member applies no role filter', async () => {
    // The regression this patch exists to prevent: a read path that demands
    // role='editor' would deny read-only members the SELECT policy admits.
    const { rpc } = configureAuth(
      { id: SIGNED_IN_USER_ID },
      { ownerRow: { data: null, error: null }, isBoardMember: { data: true, error: null } },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('is_board_member', {
      board_uuid: BOARD_ID,
      user_uuid: SIGNED_IN_USER_ID,
    });
    // No role was ever considered.
    expect(JSON.stringify(rpc.mock.calls)).not.toContain('editor');
  });

  it('denies an unrelated authenticated user with 403', async () => {
    configureAuth(
      { id: ATTACKER_USER_ID },
      { ownerRow: { data: null, error: null }, isBoardMember: { data: false, error: null } },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(403);
  });

  it('denies unauthenticated GET and POST with 401 before any lookup', async () => {
    const { from, rpc } = configureAuth(null);

    const postResponse = await route.POST(postRequest(), context());
    const getResponse = await route.GET(getRequest(), context());

    expect(postResponse.status).toBe(401);
    expect(getResponse.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Knowledge GET authorization fails closed', () => {
  it('does not grant access when the board ownership lookup errors', async () => {
    const { rpc } = configureAuth(
      { id: SIGNED_IN_USER_ID },
      { ownerRow: { data: null, error: { code: '42703', message: 'boom' } } },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(503);
    expect(response.status).not.toBe(200);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not grant access when the is_board_member RPC errors', async () => {
    configureAuth(
      { id: SIGNED_IN_USER_ID },
      {
        ownerRow: { data: null, error: null },
        isBoardMember: { data: null, error: { code: '42883', message: 'missing function' } },
      },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(503);
    expect(response.status).not.toBe(200);
  });

  it('treats a non-boolean membership result as denial', async () => {
    configureAuth(
      { id: SIGNED_IN_USER_ID },
      { ownerRow: { data: null, error: null }, isBoardMember: { data: null, error: null } },
    );

    const response = await route.GET(getRequest(), context());

    expect(response.status).toBe(403);
  });
});

describe('Knowledge POST wiring is unchanged', () => {
  it('uses the authenticated server user for POST and ignores client identity', async () => {
    const { cookieStore } = configureAuth({ id: SIGNED_IN_USER_ID });

    const response = await route.POST(postRequest(), context());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ userId: SIGNED_IN_USER_ID });

    if (!capturedOptions) throw new Error('SSR client options were not captured');
    const adapter = capturedOptions as {
      cookies: () => {
        get(name: string): unknown;
        set(name: string, value: string, options: unknown): void;
      };
    };
    expect(adapter.cookies()).toBe(cookieStore);
    expect(adapter.cookies()).not.toBeInstanceOf(Promise);
    adapter.cookies().set('sb-refresh-token', 'refreshed', { path: '/' });
    expect(cookieStore.set).toHaveBeenCalledWith('sb-refresh-token', 'refreshed', { path: '/' });
  });

  it('still authorizes uploads through the editor-level mutation authorizer', () => {
    const source = routeSource();
    const postSection = source.slice(source.indexOf('export const POST'));
    expect(postSection).toContain('SupabaseKnowledgeBoardAuthorizer');
    expect(postSection).toContain('createKnowledgeUploadPostHandler');
  });
});

describe('P6C.3 Next 15 resolved-cookie compatibility is intact', () => {
  it('keeps GET and POST on the canonical auth-helper cookie format', () => {
    const source = routeSource();

    expect(source).toContain("import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';");
    expect(source).not.toContain('@supabase/ssr');
    expect(source).not.toContain('cookies: async () => cookieStore');
    expect(source).toContain('const cookieStore = await cookies()');
    expect(source).toContain('createKnowledgeRouteClient(cookieStore)');
  });
});
