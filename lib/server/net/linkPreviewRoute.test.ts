import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// app/api/** is not in vitest.config.ts's include globs, so the route module is
// imported and exercised from here. The REAL publicUrlGuard runs; only the
// network `fetch` underneath it is stubbed.
const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  createRouteHandlerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('@supabase/auth-helpers-nextjs', () => ({
  createRouteHandlerClient: mocks.createRouteHandlerClient,
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PUBLIC_URL = 'http://93.184.216.34/page';

let route: typeof import('../../../app/api/link-preview/route');
let fetchMock: ReturnType<typeof vi.fn>;

const authed = () => mocks.createRouteHandlerClient.mockReturnValue({
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER_ID } }, error: null })) },
});

const post = (body: unknown) => route.POST(
  new NextRequest('http://localhost/api/link-preview', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  }),
);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  mocks.cookies.mockResolvedValue({});
  authed();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  route = await import('../../../app/api/link-preview/route');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PATCH-327 link-preview authorization and scheme', () => {
  it('401 for an unauthenticated caller', async () => {
    mocks.createRouteHandlerClient.mockReturnValue({
      auth: { getUser: vi.fn(async () => ({ data: { user: null }, error: { message: 'no' } })) },
    });
    expect((await post({ url: PUBLIC_URL })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 for a non-http scheme, without fetching', async () => {
    const response = await post({ url: 'ftp://93.184.216.34/page' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid URL scheme' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('400 "URL host is not allowed" for a private literal host, without fetching', async () => {
    const response = await post({ url: 'http://169.254.169.254/latest/meta-data/' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'URL host is not allowed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PATCH-327 link-preview follows no redirect to a private host', () => {
  it('refuses a public page that redirects to 169.254.169.254, fetching only the public hop', async () => {
    fetchMock.mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data/' },
    }));

    const response = await post({ url: PUBLIC_URL });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'URL host is not allowed' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(PUBLIC_URL);
  });
});

describe('PATCH-327 link-preview reads a normal page as before', () => {
  it('parses the title and description and sends the preview user-agent', async () => {
    fetchMock.mockResolvedValue(new Response(
      '<html><head><title>Hello</title><meta name="description" content="World"></head></html>',
      { status: 200, headers: { 'content-type': 'text/html' } },
    ));

    const response = await post({ url: PUBLIC_URL });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.title).toBe('Hello');
    expect(body.description).toBe('World');
    expect(body.domain).toBe('93.184.216.34');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        Accept: 'text/html,*/*',
      },
    });
  });

  it('an upstream 404 is an empty preview, not an error', async () => {
    fetchMock.mockResolvedValue(new Response('not found', { status: 404 }));
    const response = await post({ url: PUBLIC_URL });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ url: PUBLIC_URL, title: '', description: '', image: '' });
  });
});
