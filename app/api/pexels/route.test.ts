import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-219. The Pexels proxy: signed-in only, validated paging, curated vs
 * search, cached at the fetch layer, and Pexels' raw body never forwarded.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  fetches: [] as Array<{ url: string; headers: Record<string, string> | undefined; revalidate?: number }>,
}));

vi.mock('next/headers', () => ({ cookies: async () => ({}) }));

vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: () => ({ auth: { getUser: h.getUser } }),
}));

import { GET } from './route';

function makeRequest(qs: string) {
  return new Request(`http://localhost/api/pexels${qs}`);
}

function installFetch(body: unknown, init: ResponseInit = { status: 200 }) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, cfg?: { headers?: Record<string, string>; next?: { revalidate?: number } }) => {
    h.fetches.push({ url: String(input), headers: cfg?.headers, revalidate: cfg?.next?.revalidate });
    return new Response(JSON.stringify(body), {
      status: init.status,
      headers: { 'content-type': 'application/json' },
    });
  }));
}

const PEXELS_BODY = { photos: [{ id: 1 }], page: 1, next_page: 'https://api.pexels.com/v1/curated?page=2' };

beforeEach(() => {
  h.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  h.fetches.length = 0;
  process.env.PEXELS_API_KEY = 'test-key-should-never-appear';
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/pexels', () => {
  it('no signed-in user -> 401 and Pexels is not called', async () => {
    h.getUser.mockResolvedValue({ data: { user: null } });
    const res = await GET(makeRequest('?query=cars'));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Sign in to search images');
    expect(h.fetches).toHaveLength(0);
  });

  it('no query -> the curated URL with per_page=24&page=1 and revalidate 3600', async () => {
    installFetch(PEXELS_BODY);
    const res = await GET(makeRequest(''));
    expect(res.status).toBe(200);
    const fetch = h.fetches[0];
    expect(fetch.url).toBe('https://api.pexels.com/v1/curated?per_page=24&page=1');
    expect(fetch.revalidate).toBe(3600);
    expect(fetch.headers?.Authorization).toBe('test-key-should-never-appear');
    expect(await res.json()).toEqual(PEXELS_BODY);
  });

  it('query=cars&page=2 -> the search URL with page=2 and revalidate 600', async () => {
    installFetch(PEXELS_BODY);
    const res = await GET(makeRequest('?query=cars&page=2'));
    expect(res.status).toBe(200);
    const fetch = h.fetches[0];
    expect(fetch.url).toBe('https://api.pexels.com/v1/search?query=cars&per_page=24&page=2');
    expect(fetch.revalidate).toBe(600);
  });

  it.each(['page=0', 'page=51', 'page=abc'])('invalid page (%s) -> 400', async (qs) => {
    installFetch(PEXELS_BODY);
    const res = await GET(makeRequest(`?query=cars&${qs}`));
    expect(res.status).toBe(400);
    expect(h.fetches).toHaveLength(0);
  });

  it('a 101-char query -> 400', async () => {
    installFetch(PEXELS_BODY);
    const res = await GET(makeRequest(`?query=${'a'.repeat(101)}`));
    expect(res.status).toBe(400);
    expect(h.fetches).toHaveLength(0);
  });

  it('Pexels 429 -> 429 with the friendly message', async () => {
    installFetch({ error: 'raw upstream body' }, { status: 429 });
    const res = await GET(makeRequest('?query=cars'));
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('Image search is busy. Please try again in a minute.');
  });

  it('never puts the API key in a response body', async () => {
    installFetch(PEXELS_BODY);
    const res = await GET(makeRequest('?query=cars'));
    const text = await res.text();
    expect(text).not.toContain('test-key-should-never-appear');
  });
});
