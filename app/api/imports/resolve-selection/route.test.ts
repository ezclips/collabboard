import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-213. The resolve-selection route resolves the picked item on the SERVER
 * and fetches only the thumbnail the provider returned, from an exact allowlist,
 * without following redirects. The body's thumbnail URL is never fetched, the
 * token is never sent to a non-Google host, and the response's name/openUrl/
 * mimeType come from the resolver -- not from the browser.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
  resolveGoogle: vi.fn(),
  resolveOneDrive: vi.fn(),
  generatePreview: vi.fn(),
  uploads: [] as Array<{ path: string; data: unknown; options: Record<string, unknown> }>,
  fetches: [] as Array<{ url: string; headers: Record<string, string> | undefined }>,
}));

vi.mock('@/lib/imports/auth', () => ({ getAuthenticatedUserId: h.auth }));
vi.mock('@/lib/imports/tokenRefresh', () => ({ getValidAccessToken: h.token }));
vi.mock('@/lib/imports/googleDrive', () => ({ resolveGoogleDriveItem: h.resolveGoogle }));
vi.mock('@/lib/imports/oneDrive', () => ({ resolveOneDriveItem: h.resolveOneDrive }));
vi.mock('@/lib/imports/preview', () => ({ generatePreviewPng: h.generatePreview }));
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    storage: {
      from: () => ({
        upload: async (path: string, data: unknown, options: Record<string, unknown>) => {
          h.uploads.push({ path, data, options });
          return { error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.test/${path}` } }),
      }),
    },
  }),
}));

import { POST } from './route';

function makeRequest(body: unknown) {
  return new NextRequest('http://localhost/api/imports/resolve-selection', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  h.auth.mockResolvedValue({ userId: 'user-1', token: 'supabase-token' });
  h.token.mockResolvedValue('provider-token');
  h.resolveGoogle.mockResolvedValue(null);
  h.resolveOneDrive.mockResolvedValue(null);
  h.generatePreview.mockResolvedValue(Buffer.from('png-bytes'));
  h.uploads.length = 0;
  h.fetches.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { headers?: Record<string, string> }) => {
    h.fetches.push({ url: String(input), headers: init?.headers });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const GOOGLE_IMAGE = {
  id: 'FILEID1234567890',
  name: 'Real Name',
  mimeType: 'image/png',
  isFolder: false,
  rawThumbnailUrl: 'https://lh3.googleusercontent.com/raw',
  thumbnailUrl: '/api/imports/google-drive/thumbnail?url=encoded',
  openUrl: 'https://drive.google.com/file/d/FILEID1234567890/view',
  provider: 'google-drive' as const,
  sizeBytes: 42,
};

describe('resolve-selection: the body cannot choose what is fetched', () => {
  it('never fetches the body thumbnail URL; fetches the resolver raw thumbnail', async () => {
    h.resolveGoogle.mockResolvedValue(GOOGLE_IMAGE);

    const res = await POST(makeRequest({
      provider: 'google-drive',
      itemId: GOOGLE_IMAGE.id,
      name: 'Body Name',
      mimeType: 'text/plain',
      thumbnailUrl: 'https://evil.example/?googleapis.com',
      openUrl: 'https://evil.example/',
    }));

    expect(res.status).toBe(200);
    const fetched = h.fetches.map((f) => f.url);
    expect(fetched).not.toContain('https://evil.example/?googleapis.com');
    expect(fetched.some((u) => u.includes('evil.example'))).toBe(false);
    expect(fetched.some((u) => u.startsWith('https://lh3.googleusercontent.com/raw'))).toBe(true);

    // The token is attached to the allowlisted Google host.
    const googleFetch = h.fetches.find((f) => f.url.startsWith('https://lh3.googleusercontent.com'));
    expect(googleFetch?.headers?.Authorization).toBe('Bearer provider-token');
  });

  it('never sends the Authorization header to a non-Google host', async () => {
    h.resolveOneDrive.mockResolvedValue({
      id: 'AA!123',
      name: 'Doc',
      mimeType: 'application/pdf',
      isFolder: false,
      thumbnailUrl: 'https://contoso-my.sharepoint.com/personal/x/thumb',
      openUrl: 'https://contoso-my.sharepoint.com/personal/x/open',
      provider: 'microsoft-onedrive' as const,
    });

    const res = await POST(makeRequest({ provider: 'microsoft-onedrive', itemId: 'AA!123' }));
    expect(res.status).toBe(200);

    const fetch = h.fetches.find((f) => f.url.includes('contoso-my.sharepoint.com'));
    expect(fetch).toBeTruthy();
    expect(fetch?.headers?.Authorization).toBeUndefined();
  });

  it('the response name/openUrl/mimeType come from the resolver, not the body', async () => {
    h.resolveGoogle.mockResolvedValue(GOOGLE_IMAGE);

    const res = await POST(makeRequest({
      provider: 'google-drive',
      itemId: GOOGLE_IMAGE.id,
      name: 'Body Name',
      mimeType: 'text/plain',
      openUrl: 'https://evil.example/',
      sizeBytes: 999,
    }));

    const body = await res.json();
    expect(body.name).toBe('Real Name');
    expect(body.mimeType).toBe('image/png');
    expect(body.openUrl).toBe('https://drive.google.com/file/d/FILEID1234567890/view');
    expect(body.kind).toBe('image');
    expect(body.sizeBytes).toBe(42);
  });
});

describe('resolve-selection: resolution failures', () => {
  it('a resolver null is a 404, and nothing is fetched or uploaded', async () => {
    h.resolveGoogle.mockResolvedValue(null);

    const res = await POST(makeRequest({ provider: 'google-drive', itemId: 'FILEID1234567890' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('File not found');
    expect(h.uploads).toHaveLength(0);
    expect(h.fetches).toHaveLength(0);
  });

  it('a bad itemId is a 400 and never reaches the resolver', async () => {
    for (const bad of ['../x', 'a/b']) {
      const res = await POST(makeRequest({ provider: 'google-drive', itemId: bad }));
      expect(res.status).toBe(400);
    }
    expect(h.resolveGoogle).not.toHaveBeenCalled();
  });

  it('a folder is a 400', async () => {
    h.resolveGoogle.mockResolvedValue({ ...GOOGLE_IMAGE, isFolder: true });
    const res = await POST(makeRequest({ provider: 'google-drive', itemId: GOOGLE_IMAGE.id }));
    expect(res.status).toBe(400);
  });

  it('a missing token is a 401 "Not connected"', async () => {
    h.token.mockResolvedValue(null);
    const res = await POST(makeRequest({ provider: 'google-drive', itemId: GOOGLE_IMAGE.id }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Not connected');
  });
});

describe('resolve-selection: unguessable preview paths', () => {
  it('uploads under a random name, never the item id, with upsert false', async () => {
    h.resolveGoogle.mockResolvedValue(GOOGLE_IMAGE);

    const res = await POST(makeRequest({ provider: 'google-drive', itemId: GOOGLE_IMAGE.id }));
    expect(res.status).toBe(200);

    expect(h.uploads).toHaveLength(1);
    const { path, options } = h.uploads[0];
    expect(path).toMatch(/^imports\/user-1\/google-drive\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/);
    expect(path).not.toContain('FILEID1234567890');
    expect(options).toMatchObject({ upsert: false });
  });
});

describe('resolve-selection: a disallowed provider thumbnail falls back to a generated card', () => {
  it('does not fetch a non-allowlisted thumbnail and generates the card instead', async () => {
    h.resolveGoogle.mockResolvedValue({
      ...GOOGLE_IMAGE,
      mimeType: 'application/pdf',
      rawThumbnailUrl: 'https://evil.example/thumb',
    });

    const res = await POST(makeRequest({ provider: 'google-drive', itemId: GOOGLE_IMAGE.id }));
    expect(res.status).toBe(200);
    expect(h.fetches).toHaveLength(0);
    expect(h.generatePreview).toHaveBeenCalledTimes(1);
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0].path.endsWith('.png')).toBe(true);
  });
});
