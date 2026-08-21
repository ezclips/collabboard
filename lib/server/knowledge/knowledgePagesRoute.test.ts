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

type Lookup<T> = { data: T; error: unknown };
type RouteModule = typeof import('../../../app/api/boards/[id]/knowledge/[documentId]/pages/route');

let route: RouteModule;
let state: ReturnType<typeof configure>;

function context(boardId = BOARD_ID, documentId = DOCUMENT_ID) {
  return { params: Promise.resolve({ id: boardId, documentId }) };
}

function query<T>(result: Lookup<T>) {
  const filters: Array<[string, string]> = [];
  let ordered: { column: string; ascending: boolean } | null = null;
  const builder = {
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return builder;
    }),
    order: vi.fn(async (column: string, options: { ascending: boolean }) => {
      ordered = { column, ascending: options.ascending };
      return result;
    }),
    maybeSingle: vi.fn(async () => result),
  };
  return { filters, get ordered() { return ordered; }, select: vi.fn(() => builder) };
}

function configure(options: {
  user?: { id: string } | null;
  owner?: Lookup<{ id: string } | null>;
  member?: Lookup<boolean | null>;
  document?: Lookup<{ id: string; original_filename: string; page_count: number | null; processing_status: string } | null>;
  pages?: Lookup<{ page_number: number; text: string }[] | null>;
} = {}) {
  const ownerQuery = query(options.owner ?? { data: null, error: null });
  const documentQuery = query(options.document ?? {
    data: {
      id: DOCUMENT_ID,
      original_filename: 'EMG_checklist.pdf',
      page_count: 2,
      processing_status: 'ready',
    },
    error: null,
  });
  const pagesQuery = query(options.pages ?? {
    data: [
      { page_number: 1, text: 'first' },
      { page_number: 2, text: 'second' },
    ],
    error: null,
  });
  const sessionClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.user === undefined ? { id: USER_ID } : options.user }, error: null })) },
    from: vi.fn(() => ownerQuery),
    rpc: vi.fn(async () => options.member ?? { data: false, error: null }),
  };
  const adminClient = {
    from: vi.fn((table: string) => table === 'knowledge_documents' ? documentQuery : pagesQuery),
  };
  const cookieStore = { get: vi.fn(() => null), set: vi.fn() };
  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.createRouteHandlerClient.mockReturnValue(sessionClient);
  mocks.getSupabaseAdmin.mockReturnValue(adminClient);
  return { ownerQuery, documentQuery, pagesQuery, sessionClient, adminClient };
}

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  route = await import('../../../app/api/boards/[id]/knowledge/[documentId]/pages/route');
});

beforeEach(() => {
  vi.clearAllMocks();
  state = configure();
});

describe('Knowledge extracted pages route', () => {
  it('returns 401 before any board or document lookup when unauthenticated', async () => {
    state = configure({ user: null });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(401);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('allows the owner and returns only ordered page text with no-store', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null } });
    const response = await route.GET(new Request('http://localhost'), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(payload).toEqual({
      document: { id: DOCUMENT_ID, originalFilename: 'EMG_checklist.pdf', pageCount: 2 },
      pages: [
        { pageNumber: 1, text: 'first' },
        { pageNumber: 2, text: 'second' },
      ],
    });
    expect(state.pagesQuery.ordered).toEqual({ column: 'page_number', ascending: true });
  });

  it.each(['editor', 'viewer'])('allows a %s collaborator without role filtering', async () => {
    state = configure({ member: { data: true, error: null } });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(200);
    expect(state.sessionClient.rpc).toHaveBeenCalledWith('is_board_member', {
      board_uuid: BOARD_ID,
      user_uuid: USER_ID,
    });
  });

  it('returns 403 for an unrelated authenticated user', async () => {
    state = configure({ user: { id: '44444444-4444-4444-8444-444444444444' } });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(403);
    expect(mocks.getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it('fails closed with 503 on owner or membership authorization errors', async () => {
    state = configure({ owner: { data: null, error: { message: 'owner lookup failed' } } });
    expect((await route.GET(new Request('http://localhost'), context())).status).toBe(503);

    state = configure({ member: { data: null, error: { message: 'member lookup failed' } } });
    expect((await route.GET(new Request('http://localhost'), context())).status).toBe(503);
  });

  it('looks up the document with both document and board identity', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null } });
    await route.GET(new Request('http://localhost'), context());
    expect(state.documentQuery.filters).toEqual([
      ['id', DOCUMENT_ID],
      ['board_id', BOARD_ID],
    ]);
  });

  it('returns 404 for a missing or cross-board document', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null }, document: { data: null, error: null } });
    const response = await route.GET(new Request('http://localhost'), context(BOARD_ID, '55555555-5555-4555-8555-555555555555'));
    expect(response.status).toBe(404);
    expect(state.documentQuery.filters).toContainEqual(['board_id', BOARD_ID]);
  });

  it('returns 409 for a document that is not ready and 200 for zero pages', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: {
        data: { id: DOCUMENT_ID, original_filename: 'pending.pdf', page_count: 2, processing_status: 'processing' },
        error: null,
      },
    });
    expect((await route.GET(new Request('http://localhost'), context())).status).toBe(409);

    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      pages: { data: [], error: null },
    });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(200);
    expect((await response.json()).pages).toEqual([]);
  });

  it('does not use the legacy permission path or expose unsafe fields', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/api/boards/[id]/knowledge/[documentId]/pages/route.ts'), 'utf8');
    expect(source).not.toContain('requireBoardPermission');
    expect(source).not.toContain('get_board_permission');
    expect(source).not.toContain('canvases');
    expect(source).not.toContain('storage_path');
    expect(source).not.toContain('raw_artifact_path');
  });
});
