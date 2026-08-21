import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
  getSupabaseAdmin: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({ createRouteHandlerClient: mocks.createRouteHandlerClient }));
vi.mock('@/lib/supabase/admin', () => ({ getSupabaseAdmin: mocks.getSupabaseAdmin }));

const BOARD_ID = '11111111-1111-4111-8111-111111111111';
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const SIGNED_URL = 'https://storage.example/signed-original.pdf?token=temporary';

type Lookup<T> = { data: T; error: unknown };
type RouteModule = typeof import('../../../app/api/boards/[id]/knowledge/[documentId]/original/route');

let route: RouteModule;
let state: ReturnType<typeof configure>;

function context(boardId = BOARD_ID, documentId = DOCUMENT_ID) {
  return { params: Promise.resolve({ id: boardId, documentId }) };
}

function request() {
  return new Request('http://localhost/api/boards/' + BOARD_ID + '/knowledge/' + DOCUMENT_ID + '/original');
}

function query<T>(result: Lookup<T>) {
  const filters: Array<[string, string]> = [];
  const builder = {
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return builder;
    }),
    maybeSingle: vi.fn(async () => result),
  };
  return { filters, select: vi.fn(() => builder) };
}

function configure(options: {
  user?: { id: string } | null;
  authError?: unknown;
  owner?: Lookup<{ id: string } | null>;
  member?: Lookup<boolean | null>;
  document?: Lookup<{ storage_path: string; original_filename: string; mime_type: string; processing_status: string } | null>;
  signed?: Lookup<{ signedUrl: string } | null>;
} = {}) {
  const cookieStore = { get: vi.fn(() => null), set: vi.fn() };
  const ownerQuery = query(options.owner ?? { data: null, error: null });
  const documentQuery = query(options.document ?? {
    data: {
      storage_path: `knowledge/${BOARD_ID}/${DOCUMENT_ID}/original.pdf`,
      original_filename: 'EMG_checklist.pdf',
      mime_type: 'application/pdf',
      processing_status: 'ready',
    },
    error: null,
  });
  const signedResult = options.signed ?? { data: { signedUrl: SIGNED_URL }, error: null };
  const createSignedUrl = vi.fn(async () => signedResult);
  const sessionClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
        error: options.authError ?? null,
      })),
    },
    from: vi.fn(() => ownerQuery),
    rpc: vi.fn(async () => options.member ?? { data: false, error: null }),
  };
  const adminClient = {
    from: vi.fn(() => documentQuery),
    storage: {
      from: vi.fn(() => ({ createSignedUrl })),
    },
  };

  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.createRouteHandlerClient.mockReturnValue(sessionClient);
  mocks.getSupabaseAdmin.mockReturnValue(adminClient);
  return { cookieStore, ownerQuery, documentQuery, createSignedUrl, sessionClient, adminClient };
}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  route = await import('../../../app/api/boards/[id]/knowledge/[documentId]/original/route');
});

beforeEach(() => {
  vi.clearAllMocks();
  state = configure();
});

describe('Knowledge original PDF route', () => {
  it('returns 401 before authorization or Storage for unauthenticated users', async () => {
    state = configure({ user: null });

    const response = await route.GET(request(), context());

    expect(response.status).toBe(401);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('allows the board owner and redirects to a 60-second private signed URL', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null } });

    const response = await route.GET(request(), context());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(SIGNED_URL);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(state.sessionClient.rpc).not.toHaveBeenCalled();
    expect(state.createSignedUrl).toHaveBeenCalledWith(
      `knowledge/${BOARD_ID}/${DOCUMENT_ID}/original.pdf`,
      60,
    );
    expect(state.adminClient.storage.from).toHaveBeenCalledWith('knowledge-documents');
  });

  it.each(['editor', 'viewer'])('allows a %s collaborator through role-free membership', async () => {
    state = configure({ member: { data: true, error: null } });

    const response = await route.GET(request(), context());

    expect(response.status).toBe(307);
    expect(state.sessionClient.rpc).toHaveBeenCalledWith('is_board_member', {
      board_uuid: BOARD_ID,
      user_uuid: USER_ID,
    });
  });

  it('returns 403 for an unrelated authenticated user', async () => {
    state = configure({ user: { id: '44444444-4444-4444-8444-444444444444' } });

    const response = await route.GET(request(), context());

    expect(response.status).toBe(403);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when board authorization fails', async () => {
    state = configure({ owner: { data: null, error: { message: 'permission lookup failed' } } });

    const response = await route.GET(request(), context());

    expect(response.status).toBe(503);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('requires both document id and board id in the server-side lookup', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null } });

    await route.GET(request(), context());

    expect(state.documentQuery.filters).toEqual([
      ['id', DOCUMENT_ID],
      ['board_id', BOARD_ID],
    ]);
  });

  it('returns 404 for a missing or cross-board document without signing a path', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: { data: null, error: null },
    });

    const response = await route.GET(request(), context(BOARD_ID, '55555555-5555-4555-8555-555555555555'));

    expect(response.status).toBe(404);
    expect(state.createSignedUrl).not.toHaveBeenCalled();
    expect(state.documentQuery.filters).toContainEqual(['board_id', BOARD_ID]);
  });

  it('uses only the database storage path and fails closed on signing errors', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: {
        data: {
          storage_path: 'knowledge/server-owned/path.pdf',
          original_filename: 'server-owned.pdf',
          mime_type: 'application/pdf',
          processing_status: 'ready',
        },
        error: null,
      },
      signed: { data: null, error: { message: 'signing failed' } },
    });

    const response = await route.GET(request(), context());

    expect(response.status).toBe(503);
    expect(state.createSignedUrl).toHaveBeenCalledWith('knowledge/server-owned/path.pdf', 60);
    expect((await response.text())).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('rejects the legacy permission route and never exposes service-role access', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/api/boards/[id]/knowledge/[documentId]/original/route.ts'),
      'utf8',
    );

    expect(source).not.toContain('requireBoardPermission');
    expect(source).not.toContain('get_board_permission');
    expect(source).not.toContain('canvases');
    expect(source).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(source).toContain("from(KNOWLEDGE_STORAGE_BUCKET)");
    expect(source).toContain('NextResponse.redirect');
  });
});
