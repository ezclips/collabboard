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
  const selects: string[] = [];
  let ordered: { column: string; ascending: boolean } | null = null;
  // A THENABLE builder, like the real PostgREST chain: order()/limit()/neq()
  // return the builder, and awaiting it resolves to the configured result.
  // PATCH-181's summary snippet query is `.eq().neq().order().limit(1)`.
  const builder: Record<string, unknown> = {};
  Object.assign(builder, {
    eq: vi.fn((column: string, value: string) => {
      filters.push([column, value]);
      return builder;
    }),
    neq: vi.fn((column: string, value: string) => {
      filters.push([`neq:${column}`, value]);
      return builder;
    }),
    // The pageless branch selects chunks with `.is('page_start', null)`, which
    // sits between the eq filters and the order in the real chain.
    is: vi.fn((column: string, value: unknown) => {
      filters.push([column, String(value)]);
      return builder;
    }),
    order: vi.fn((column: string, options: { ascending: boolean }) => {
      ordered = { column, ascending: options.ascending };
      return builder;
    }),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: (value: Lookup<T>) => unknown) => {
      // Apply any recorded neq filters, so the summary's `.neq('text','')`
      // snippet query really excludes empty page text -- the property under test.
      let data = result.data;
      for (const [column, value] of filters) {
        if (!column.startsWith('neq:') || !Array.isArray(data)) continue;
        const key = column.slice('neq:'.length);
        data = (data as Record<string, unknown>[]).filter((row) => String(row[key]) !== value) as T;
      }
      return Promise.resolve({ data, error: result.error }).then(resolve);
    },
  });
  return {
    filters,
    selects,
    get ordered() { return ordered; },
    select: vi.fn((columns: string) => { selects.push(columns); return builder; }),
  };
}

function configure(options: {
  user?: { id: string } | null;
  owner?: Lookup<{ id: string } | null>;
  member?: Lookup<boolean | null>;
  document?: Lookup<{ id: string; original_filename: string; page_count: number | null; processing_status: string; kind?: string; content_sha256?: string } | null>;
  chunks?: Lookup<{ chunk_index: number; char_start: number; char_end: number; text: string }[] | null>;
  pages?: Lookup<{
    page_number: number; text: string;
    width_points: number | null; height_points: number | null; rotation: number | null;
  }[] | null>;
} = {}) {
  const ownerQuery = query(options.owner ?? { data: null, error: null });
  const documentQuery = query(options.document ?? {
    data: {
      id: DOCUMENT_ID,
      original_filename: 'EMG_checklist.pdf',
      page_count: 2,
      processing_status: 'ready',
      kind: 'pdf',
    },
    error: null,
  });
  const chunksQuery = query(options.chunks ?? { data: [], error: null });
  const pagesQuery = query(options.pages ?? {
    data: [
      { page_number: 1, text: 'first', width_points: 612, height_points: 792, rotation: 0 },
      { page_number: 2, text: 'second', width_points: 595, height_points: 842, rotation: 90 },
    ],
    error: null,
  });
  const sessionClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user: options.user === undefined ? { id: USER_ID } : options.user }, error: null })) },
    from: vi.fn(() => ownerQuery),
    rpc: vi.fn(async () => options.member ?? { data: false, error: null }),
  };
  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'knowledge_documents') return documentQuery;
      if (table === 'knowledge_chunks') return chunksQuery;
      return pagesQuery;
    }),
  };
  const cookieStore = { get: vi.fn(() => null), set: vi.fn() };
  mocks.cookies.mockResolvedValue(cookieStore);
  mocks.createRouteHandlerClient.mockReturnValue(sessionClient);
  mocks.getSupabaseAdmin.mockReturnValue(adminClient);
  return { ownerQuery, documentQuery, pagesQuery, chunksQuery, sessionClient, adminClient };
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
      // WIDENED DELIBERATELY: the client can no longer infer a source's shape
      // from its page list, because a pageless source has none. Pinned so a
      // silently widened payload is still a failure.
      document: { id: DOCUMENT_ID, originalFilename: 'EMG_checklist.pdf', pageCount: 2, kind: 'pdf' },
      pages: [
        { pageNumber: 1, text: 'first', widthPoints: 612, heightPoints: 792, rotation: 0 },
        { pageNumber: 2, text: 'second', widthPoints: 595, heightPoints: 842, rotation: 90 },
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

  /**
   * P6J-F9-A2b corrective. A browser run proved loading="lazy" inert: with no
   * intrinsic size every section measured 57px and Chrome fetched all twelve
   * images at open. The reader can only reserve each image's ratio if this
   * route surfaces geometry the worker ALREADY persisted -- no recomputation.
   */
  it('C1: selects and returns the persisted page geometry verbatim', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      pages: {
        data: [{ page_number: 1, text: 'first', width_points: 612.5, height_points: 792, rotation: 270 }],
        error: null,
      },
    });
    const response = await route.GET(new Request('http://localhost'), context());

    for (const column of ['width_points', 'height_points', 'rotation']) {
      expect(state.pagesQuery.selects[0], `pages query must select ${column}`).toContain(column);
    }
    // Passed through untouched: no rounding, no rotation applied, no raster
    // pixel size invented here. Display reservation is the client's business.
    expect((await response.json()).pages).toEqual([
      { pageNumber: 1, text: 'first', widthPoints: 612.5, heightPoints: 792, rotation: 270 },
    ]);
  });

  it('C1: reports absent geometry as null instead of inventing a default', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      pages: {
        data: [{ page_number: 1, text: 'first', width_points: null, height_points: null, rotation: null }],
        error: null,
      },
    });
    const response = await route.GET(new Request('http://localhost'), context());
    // Pre-A1 rows are legitimate; the client owns the fallback, not this route.
    expect((await response.json()).pages).toEqual([
      { pageNumber: 1, text: 'first', widthPoints: null, heightPoints: null, rotation: null },
    ]);
  });

  it('C1: adds no second query and no geometry recomputation', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/api/boards/[id]/knowledge/[documentId]/pages/route.ts'), 'utf8');
    expect(source).not.toMatch(/pdfjs|getViewport|normalizeRotation|widthPx|heightPx/);
    // PATCH-181: THREE knowledge_pages reads now -- the full list, the summary's
    // metadata-only list, and the summary's one-page snippet -- and still no
    // geometry recomputation. Pinned so an unbounded fourth read is a failure.
    expect(source.match(/\.from\('knowledge_pages'\)/g) ?? []).toHaveLength(3);
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

/**
 * Stage 1 -- the same route, the same authorization, a different body.
 *
 * A pageless source is served here rather than from a sibling endpoint
 * precisely so the session check, the owner-or-member check, the board-scoped
 * document read and the readiness gate above cannot drift into two copies.
 * These tests therefore care about the body and about what the route refuses.
 */
describe('Knowledge pages route: a source with no pages', () => {
  const textDocument = (kind = 'text') => ({
    data: {
      id: DOCUMENT_ID,
      original_filename: 'tide-pools.md',
      page_count: null,
      processing_status: 'ready',
      kind,
    },
    error: null,
  });

  const chunkRows = (...texts: string[]) => {
    let cursor = 0;
    return texts.map((text, index) => {
      const row = { chunk_index: index, char_start: cursor, char_end: cursor + text.length, text };
      cursor += text.length;
      return row;
    });
  };

  it('returns the canonical text, an empty page list, and its kind', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: textDocument(),
      chunks: { data: chunkRows('Alpha.\n\n', 'Beta paragraph.'), error: null },
    });
    const response = await route.GET(new Request('http://localhost'), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.text).toBe('Alpha.\n\nBeta paragraph.');
    expect(payload.pages).toEqual([]);
    // Null, not zero: this document has no pages, rather than a page count
    // that was measured and found to be none.
    expect(payload.document).toEqual({
      id: DOCUMENT_ID, originalFilename: 'tide-pools.md', pageCount: null, kind: 'text',
      // Null for an ordinary text source. A reader that inferred
      // 'transcript' from the absence of pages would attach an
      // unverified-claim notice to every plain text file.
      transcriptRepresentation: null,
    });
  });

  it('reads only the PAGELESS chunks of that document, in index order', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: textDocument(),
      chunks: { data: chunkRows('one'), error: null },
    });
    await route.GET(new Request('http://localhost'), context());

    expect(state.chunksQuery.filters).toContainEqual(['document_id', DOCUMENT_ID]);
    expect(state.chunksQuery.filters).toContainEqual(['page_start', 'null']);
    expect(state.chunksQuery.ordered).toEqual({ column: 'chunk_index', ascending: true });
    // Never the page table for a source that has none.
    expect(state.adminClient.from).not.toHaveBeenCalledWith('knowledge_pages');
  });

  it.each([
    ['a gap between chunks', [
      { chunk_index: 0, char_start: 0, char_end: 3, text: 'abc' },
      { chunk_index: 1, char_start: 9, char_end: 12, text: 'def' },
    ]],
    ['an overlap', [
      { chunk_index: 0, char_start: 0, char_end: 3, text: 'abc' },
      { chunk_index: 1, char_start: 1, char_end: 4, text: 'bcd' },
    ]],
    ['a span that disagrees with its text', [
      { chunk_index: 0, char_start: 0, char_end: 99, text: 'abc' },
    ]],
    ['a first chunk that does not start at zero', [
      { chunk_index: 0, char_start: 5, char_end: 8, text: 'abc' },
    ]],
  ])('refuses %s rather than serving text whose offsets lie', async (_label, chunks) => {
    // Every citation after a gap would name the wrong characters. A document
    // that reads correctly and highlights the wrong words is the exact defect
    // this stage exists to prevent, so this fails rather than degrading.
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: textDocument(),
      chunks: { data: chunks, error: null },
    });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(503);
  });

  it('a source with no chunks at all is empty, not broken', async () => {
    // A legitimately blank file: the upload succeeded and indexed nothing.
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: textDocument(),
      chunks: { data: [], error: null },
    });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(200);
    expect((await response.json()).text).toBe('');
  });

  it('refuses a kind it does not know rather than serving its chunks as text', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: textDocument('hologram'),
    });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(409);
    expect(state.adminClient.from).not.toHaveBeenCalledWith('knowledge_chunks');
  });

  it('still refuses an unauthorized reader, by the same check as a PDF', async () => {
    // The point of sharing the route: this cannot be forgotten on one path.
    state = configure({ document: textDocument(), member: { data: false, error: null } });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(403);
  });

  it('still refuses a document that is not ready', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: {
        data: {
          id: DOCUMENT_ID, original_filename: 'tide-pools.md', page_count: null,
          processing_status: 'uploaded', kind: 'text',
        },
        error: null,
      },
    });
    const response = await route.GET(new Request('http://localhost'), context());
    expect(response.status).toBe(409);
  });
});

/**
 * PATCH-181 -- the SUMMARY mode. Same route, same authorization, less text.
 * A canvas card asks for `?view=summary` so it does not download the text of
 * every page to draw one picture and a page count.
 */
describe('Knowledge pages route: the summary view', () => {
  const summaryRequest = (etag?: string) => new Request(
    'http://localhost?view=summary',
    etag ? { headers: { 'if-none-match': etag } } : undefined,
  );
  const SHA = 'a'.repeat(64);
  const withSha = (over: Record<string, unknown> = {}) => ({
    data: {
      id: DOCUMENT_ID,
      original_filename: 'EMG_checklist.pdf',
      page_count: 2,
      processing_status: 'ready',
      kind: 'pdf',
      content_sha256: SHA,
      ...over,
    },
    error: null,
  });

  it('a PDF summary carries page metadata with NO text, and the first non-empty snippet', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: withSha(),
      pages: {
        data: [
          { page_number: 1, text: '', width_points: 612, height_points: 792, rotation: 0 },
          { page_number: 2, text: '  The first real words.  ', width_points: 595, height_points: 842, rotation: 90 },
        ],
        error: null,
      },
    });
    const response = await route.GET(summaryRequest(), context());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.pages).toEqual([
      { pageNumber: 1, widthPoints: 612, heightPoints: 792, rotation: 0 },
      { pageNumber: 2, widthPoints: 595, heightPoints: 842, rotation: 90 },
    ]);
    // No page object carries text at all.
    for (const page of payload.pages) expect(page).not.toHaveProperty('text');
    expect(payload.snippet).toBe('The first real words.');
    // The metadata query selected no text column.
    expect(state.pagesQuery.selects.some((s) => s.includes('width_points') && !s.includes('text'))).toBe(true);
  });

  it('a PDF with no non-empty page has snippet null', async () => {
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: withSha(),
      pages: {
        data: [{ page_number: 1, text: '', width_points: 1, height_points: 1, rotation: 0 }],
        error: null,
      },
    });
    const response = await route.GET(summaryRequest(), context());
    expect((await response.json()).snippet).toBeNull();
  });

  it('a text summary is the excerpt, with textTruncated true or false', async () => {
    const long = 'x'.repeat(1500);
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: withSha({ original_filename: 'notes.md', page_count: null, kind: 'text' }),
      chunks: { data: [{ chunk_index: 0, char_start: 0, char_end: long.length, text: long }], error: null },
    });
    const truncated = await (await route.GET(summaryRequest(), context())).json();
    expect(truncated.text).toHaveLength(600);
    expect(truncated.textTruncated).toBe(true);
    expect(truncated.pages).toEqual([]);

    const short = 'just a short note';
    state = configure({
      owner: { data: { id: BOARD_ID }, error: null },
      document: withSha({ original_filename: 'notes.md', page_count: null, kind: 'text' }),
      chunks: { data: [{ chunk_index: 0, char_start: 0, char_end: short.length, text: short }], error: null },
    });
    const whole = await (await route.GET(summaryRequest(), context())).json();
    expect(whole.text).toBe(short);
    expect(whole.textTruncated).toBe(false);
  });

  it('the summary ETag differs from the full one, and a matching If-None-Match is 304', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null }, document: withSha() });
    const full = await route.GET(new Request('http://localhost'), context());
    const summary = await route.GET(summaryRequest(), context());

    const fullEtag = full.headers.get('etag');
    const summaryEtag = summary.headers.get('etag');
    expect(fullEtag).not.toBeNull();
    expect(summaryEtag).not.toBeNull();
    expect(summaryEtag).not.toBe(fullEtag);
    // The full ETag must NOT satisfy a summary request, or a browser would be
    // handed the wrong representation on a 304.
    expect((await route.GET(summaryRequest(fullEtag!), context())).status).toBe(200);
    expect((await route.GET(summaryRequest(summaryEtag!), context())).status).toBe(304);
  });

  it('WITHOUT ?view=summary the full shape is unchanged', async () => {
    state = configure({ owner: { data: { id: BOARD_ID }, error: null }, document: withSha() });
    const payload = await (await route.GET(new Request('http://localhost'), context())).json();
    expect(payload.pages[0]).toHaveProperty('text');
    expect(payload).not.toHaveProperty('snippet');
    expect(payload).not.toHaveProperty('textTruncated');
  });

  it('refuses a non-member in summary mode exactly as in full mode', async () => {
    state = configure({ document: withSha(), member: { data: false, error: null } });
    expect((await route.GET(summaryRequest(), context())).status).toBe(403);
  });
});
