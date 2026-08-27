import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_DERIVATIVE_CONTENT_TYPE,
  knowledgePageDerivativePath,
} from '../../domain/knowledge/knowledgePdfRenderPolicy';
import { KNOWLEDGE_STORAGE_BUCKET } from '../../infra/knowledge/knowledgeIngestionAdapters';

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
const PAGE = 2;
const PAGE_COUNT = 5;
/** A recognisable byte run, so a truncated or re-encoded body is visible. */
const IMAGE_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x57, 0x45, 0x42, 0x50, 0xff]);

type Lookup<T> = { data: T; error: unknown };
type RouteModule = typeof import('../../../app/api/boards/[id]/knowledge/[documentId]/pages/[pageNumber]/image/route');

let route: RouteModule;

function context(boardId = BOARD_ID, documentId = DOCUMENT_ID, pageNumber: string = String(PAGE)) {
  return { params: Promise.resolve({ id: boardId, documentId, pageNumber }) };
}

/** Query params are deliberately supported here so A11 can prove they do nothing. */
function request(search = '') {
  return new Request(`http://localhost/api/boards/${BOARD_ID}/knowledge/${DOCUMENT_ID}/pages/${PAGE}/image${search}`);
}

function query<T>(result: Lookup<T>) {
  const filters: Array<[string, string]> = [];
  const columns: string[] = [];
  const builder = {
    eq: vi.fn((column: string, value: string) => { filters.push([column, value]); return builder; }),
    maybeSingle: vi.fn(async () => result),
  };
  return { filters, columns, select: vi.fn((selected: string) => { columns.push(selected); return builder; }) };
}

/** Mirrors storage-js: `download` rejects with a StorageUnknownError wrapping the raw Response. */
function storageUnknownError(status?: number) {
  return {
    __isStorageError: true,
    name: 'StorageUnknownError',
    message: '{}',
    originalError: status === undefined ? new TypeError('fetch failed') : { status, ok: false },
  };
}

function configure(options: {
  user?: { id: string } | null;
  authError?: unknown;
  owner?: Lookup<{ id: string } | null>;
  member?: Lookup<boolean | null>;
  document?: Lookup<{ page_count: number | null; processing_status: string } | null>;
  blob?: Blob | null;
  storageError?: unknown;
} = {}) {
  const ownerQuery = query(options.owner ?? { data: { id: BOARD_ID }, error: null });
  const documentQuery = query(options.document ?? {
    data: { page_count: PAGE_COUNT, processing_status: 'ready' }, error: null,
  });
  const download = vi.fn(async () => ({
    data: options.storageError ? null : (options.blob ?? new Blob([IMAGE_BYTES], { type: 'image/webp' })),
    error: options.storageError ?? null,
  }));
  const upload = vi.fn();
  const remove = vi.fn();
  const createSignedUrl = vi.fn();
  const buckets: string[] = [];

  const sessionFrom = vi.fn(() => ownerQuery);
  const rpc = vi.fn(async () => options.member ?? { data: false, error: null });
  const sessionClient = {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: options.user === undefined ? { id: USER_ID } : options.user },
        error: options.authError ?? null,
      })),
    },
    from: sessionFrom,
    rpc,
  };
  const adminFrom = vi.fn(() => documentQuery);
  const adminClient = {
    from: adminFrom,
    storage: { from: vi.fn((bucket: string) => { buckets.push(bucket); return { download, upload, remove, createSignedUrl }; }) },
  };

  mocks.cookies.mockResolvedValue({ get: vi.fn(() => null), set: vi.fn() });
  mocks.createRouteHandlerClient.mockReturnValue(sessionClient);
  mocks.getSupabaseAdmin.mockReturnValue(adminClient);

  return {
    sessionFrom, rpc, adminFrom, download, upload, remove, createSignedUrl, buckets,
    documentFilters: documentQuery.filters, documentColumns: documentQuery.columns,
  };
}

const ROUTE_PATH = 'app/api/boards/[id]/knowledge/[documentId]/pages/[pageNumber]/image/route.ts';
/** Strips comments so negative scans test what the route DOES, not what it documents avoiding. */
const routeCode = () => readFileSync(resolve(process.cwd(), ROUTE_PATH), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

beforeAll(async () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key');
  route = await import('../../../app/api/boards/[id]/knowledge/[documentId]/pages/[pageNumber]/image/route');
});

beforeEach(() => { vi.clearAllMocks(); });

describe('Knowledge page image route -- access control', () => {
  it('A1: rejects unauthenticated callers before authorization, lookup or Storage', async () => {
    const state = configure({ user: null });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(401);
    expect(state.sessionFrom).not.toHaveBeenCalled();
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.adminFrom).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
  });

  it('A2: streams the derivative to the board owner with canonical headers', async () => {
    const state = configure();
    const response = await route.GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(KNOWLEDGE_DERIVATIVE_CONTENT_TYPE);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(IMAGE_BYTES);
    // Owner short-circuits: membership is not consulted.
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.buckets).toEqual([KNOWLEDGE_STORAGE_BUCKET]);
  });

  it('A2b: allows a non-owner board member through is_board_member', async () => {
    const state = configure({
      owner: { data: null, error: null },
      member: { data: true, error: null },
    });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(200);
    expect(state.rpc).toHaveBeenCalledWith('is_board_member', {
      board_uuid: BOARD_ID, user_uuid: USER_ID,
    });
    // is_board_member applies no role filter, so viewers are valid readers.
    expect(JSON.stringify(state.rpc.mock.calls)).not.toContain('editor');
  });

  it('A4: denies an authenticated user without board access, before lookup or Storage', async () => {
    const state = configure({
      owner: { data: null, error: null },
      member: { data: false, error: null },
    });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(403);
    expect(state.adminFrom).not.toHaveBeenCalled();
    expect(state.download).not.toHaveBeenCalled();
  });

  it('fails closed with 503 when the authorization lookup errors', async () => {
    const state = configure({ owner: { data: null, error: { code: '42703' } } });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(503);
    expect(state.download).not.toHaveBeenCalled();
  });
});

describe('Knowledge page image route -- document binding', () => {
  it('A3/A18: 404s a cross-board document and filters on BOTH id and board_id', async () => {
    const state = configure({ document: { data: null, error: null } });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Not found' });
    expect(state.documentFilters).toEqual([['id', DOCUMENT_ID], ['board_id', BOARD_ID]]);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('409s a document that is not ready, without touching Storage', async () => {
    const state = configure({ document: { data: { page_count: PAGE_COUNT, processing_status: 'processing' }, error: null } });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(409);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('A5/A6: fails closed on ids the path authority rejects, before any lookup', async () => {
    for (const [boardId, documentId] of [[('not-a-uuid'), DOCUMENT_ID], [BOARD_ID, 'nope']] as const) {
      const state = configure();
      const response = await route.GET(request(), context(boardId, documentId));
      expect(response.status).toBe(404);
      expect(state.adminFrom).not.toHaveBeenCalled();
      expect(state.download).not.toHaveBeenCalled();
    }
  });
});

describe('Knowledge page image route -- strict 1-based page parsing', () => {
  it.each(['4.0', '1e3', '+4', ' 4', '04', 'abc', '..%2f..', '2/../3', '', '9007199254740993'])(
    'A7/A8: rejects the page segment %j with 400 and no Storage call',
    async (segment) => {
      const state = configure();
      const response = await route.GET(request(), context(BOARD_ID, DOCUMENT_ID, segment));
      expect(response.status).toBe(400);
      expect(state.download).not.toHaveBeenCalled();
    },
  );

  it.each(['0', '-1'])('A8: rejects page %s below the 1-based minimum', async (segment) => {
    const state = configure();
    const response = await route.GET(request(), context(BOARD_ID, DOCUMENT_ID, segment));
    expect(response.status).toBe(400);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('A9: 404s a page above the persisted page_count BEFORE downloading', async () => {
    const state = configure();
    const response = await route.GET(request(), context(BOARD_ID, DOCUMENT_ID, String(PAGE_COUNT + 1)));
    expect(response.status).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });

  it('A9: 404s when page_count is null, rather than trusting the object to exist', async () => {
    const state = configure({ document: { data: { page_count: null, processing_status: 'ready' }, error: null } });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });
});

describe('Knowledge page image route -- server-derived object identity', () => {
  it('A10: downloads exactly the canonical derivative path', async () => {
    const state = configure();
    await route.GET(request(), context());
    const expected = knowledgePageDerivativePath(BOARD_ID, DOCUMENT_ID, PAGE);
    expect(expected).not.toBeNull();
    expect(state.download).toHaveBeenCalledTimes(1);
    expect(state.download).toHaveBeenCalledWith(expected);
  });

  it('A11: ignores forged Storage query parameters entirely', async () => {
    const state = configure();
    const response = await route.GET(
      request('?path=forged/evil.webp&bucket=padlet-files&url=https://evil.example&object=x'),
      context(),
    );
    expect(response.status).toBe(200);
    expect(state.download).toHaveBeenCalledWith(knowledgePageDerivativePath(BOARD_ID, DOCUMENT_ID, PAGE));
    expect(state.buckets).toEqual([KNOWLEDGE_STORAGE_BUCKET]);
  });

  it('A15: never selects storage_path and never reads the source PDF', async () => {
    const state = configure();
    await route.GET(request(), context());
    expect(state.documentColumns.join(' ')).not.toContain('storage_path');
    expect(state.download).toHaveBeenCalledTimes(1);
    expect(state.download).not.toHaveBeenCalledWith(expect.stringContaining('original.pdf'));
  });

  it('A17: performs no Storage write and issues no signed URL', async () => {
    const state = configure();
    await route.GET(request(), context());
    expect(state.upload).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
    expect(state.createSignedUrl).not.toHaveBeenCalled();
  });
});

describe('Knowledge page image route -- missing derivative vs Storage outage', () => {
  it.each([404, 400])('A12: reports a missing object (status %i) as 404, not a failure', async (status) => {
    const state = configure({ storageError: storageUnknownError(status) });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(404);
    // The document stays ready: nothing here records a failure or re-ingests.
    expect(state.upload).not.toHaveBeenCalled();
    expect(routeCode()).not.toMatch(/recordFailure|\.update\(|\.insert\(/);
  });

  it.each([500, 502, 401])('A13: reports Storage failure %i as 503', async (status) => {
    configure({ storageError: storageUnknownError(status) });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(503);
  });

  it('A13: reports an unreachable Storage backend as 503 and leaks no detail', async () => {
    configure({ storageError: storageUnknownError(undefined) });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Unavailable' });
  });

  it('A14: pins the canonical content type even when the Blob advertises another', async () => {
    configure({ blob: new Blob([IMAGE_BYTES], { type: 'image/svg+xml' }) });
    const response = await route.GET(request(), context());
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(KNOWLEDGE_DERIVATIVE_CONTENT_TYPE);
    expect(response.headers.get('content-type')).not.toContain('svg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(IMAGE_BYTES);
  });
});

describe('Knowledge page image route -- source boundaries', () => {
  it('A16: imports no PDF.js and parses no PDF', () => {
    expect(routeCode()).not.toMatch(/pdfjs-dist|pdfjs|getDocument/i);
  });

  it('A10/A17: uses the canonical authorities and builds no path of its own', () => {
    const code = routeCode();
    for (const authority of [
      'knowledgePageDerivativePath', 'KNOWLEDGE_STORAGE_BUCKET', 'KNOWLEDGE_DERIVATIVE_CONTENT_TYPE',
    ]) {
      expect(code, `the route must use ${authority}`).toContain(authority);
    }
    // No hand-rolled object key, bucket literal, extension or signing.
    expect(code).not.toContain('knowledge/${');
    expect(code).not.toContain('pages/');
    expect(code).not.toContain('.webp');
    expect(code).not.toContain("'knowledge-documents'");
    expect(code).not.toContain('createSignedUrl');
  });

  it('A11: derives object identity without reading the request at all', () => {
    const code = routeCode();
    expect(code).not.toContain('searchParams');
    expect(code).not.toContain('nextUrl');
    expect(code).not.toMatch(/_request\./);
  });
});
