import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-216. The download route: resolves the item server-side, enforces the
 * supported types and the size limits, follows at most one redirect to an
 * allowlisted host WITHOUT the token, and streams the bytes with their name.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
  resolveGoogle: vi.fn(),
  resolveOneDrive: vi.fn(),
  getOneDriveDownloadUrl: vi.fn(),
  fetches: [] as Array<{ url: string; headers: Record<string, string> | undefined; redirect?: string }>,
}));

vi.mock('@/lib/imports/auth', () => ({ getAuthenticatedUserId: h.auth }));
vi.mock('@/lib/imports/tokenRefresh', () => ({ getValidAccessToken: h.token }));
vi.mock('@/lib/imports/googleDrive', () => ({
  resolveGoogleDriveItem: h.resolveGoogle,
  googleDriveDownloadUrl: (id: string, exportPdf: boolean) =>
    exportPdf
      ? `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=application/pdf`
      : `https://www.googleapis.com/drive/v3/files/${id}?alt=media`,
}));
vi.mock('@/lib/imports/oneDrive', () => ({
  resolveOneDriveItem: h.resolveOneDrive,
  getOneDriveDownloadUrl: h.getOneDriveDownloadUrl,
}));

import { GET } from './route';

function makeRequest(provider: string, itemId: string) {
  return new NextRequest(
    `http://localhost/api/imports/download?provider=${provider}&itemId=${encodeURIComponent(itemId)}`
  );
}

const GOOGLE_PDF = {
  id: 'FILEID1234567890',
  name: 'report.pdf',
  mimeType: 'application/pdf',
  isFolder: false,
  provider: 'google-drive' as const,
  sizeBytes: 3,
};

/** A fetch double returning `body` for the caller's own URL. */
function installFetch(body: BodyInit | null, init: ResponseInit = { status: 200 }) {
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, config?: { headers?: Record<string, string>; redirect?: string }) => {
    h.fetches.push({ url: String(input), headers: config?.headers, redirect: config?.redirect });
    return new Response(body, init);
  }));
}

beforeEach(() => {
  h.auth.mockResolvedValue({ userId: 'user-1', token: 'supabase-token' });
  h.token.mockResolvedValue('provider-token');
  h.resolveGoogle.mockResolvedValue(null);
  h.resolveOneDrive.mockResolvedValue(null);
  h.getOneDriveDownloadUrl.mockResolvedValue(null);
  h.fetches.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('GET /api/imports/download', () => {
  it('no auth -> 401', async () => {
    h.auth.mockResolvedValue(null);
    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(401);
  });

  it('a bad itemId -> 400, and the resolver is not called', async () => {
    const res = await GET(makeRequest('google-drive', '../x'));
    expect(res.status).toBe(400);
    expect(h.resolveGoogle).not.toHaveBeenCalled();
  });

  it('a Google Sheet -> 415', async () => {
    h.resolveGoogle.mockResolvedValue({ ...GOOGLE_PDF, mimeType: 'application/vnd.google-apps.spreadsheet' });
    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(415);
    expect(h.fetches).toHaveLength(0);
  });

  it('an oversize sizeBytes -> 413 with no download fetch', async () => {
    h.resolveGoogle.mockResolvedValue({ ...GOOGLE_PDF, sizeBytes: 100 * 1024 * 1024 });
    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(413);
    expect(h.fetches).toHaveLength(0);
  });

  it('a Google PDF -> 200 with bytes, content-type and X-Import-Filename, token sent', async () => {
    h.resolveGoogle.mockResolvedValue(GOOGLE_PDF);
    installFetch(new Uint8Array([1, 2, 3]));

    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('X-Import-Filename')).toBe(encodeURIComponent('report.pdf'));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));

    const fetch = h.fetches[0];
    expect(fetch.url).toContain('alt=media');
    expect(fetch.url.startsWith('https://www.googleapis.com/')).toBe(true);
    expect(fetch.headers?.Authorization).toBe('Bearer provider-token');
    expect(fetch.redirect).toBe('manual');
  });

  it('a Google Doc -> the export URL is fetched', async () => {
    h.resolveGoogle.mockResolvedValue({ ...GOOGLE_PDF, name: 'My Doc', mimeType: 'application/vnd.google-apps.document' });
    installFetch(new Uint8Array([9]));

    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Import-Filename')).toBe(encodeURIComponent('My Doc.pdf'));
    expect(h.fetches[0].url).toContain('/export?mimeType=application/pdf');
  });

  it('OneDrive -> the downloadUrl is fetched WITHOUT Authorization', async () => {
    h.resolveOneDrive.mockResolvedValue({
      id: 'AA!123', name: 'doc.pdf', mimeType: 'application/pdf', isFolder: false,
      provider: 'microsoft-onedrive', sizeBytes: 2,
    });
    h.getOneDriveDownloadUrl.mockResolvedValue('https://contoso-my.sharepoint.com/personal/x/download');
    installFetch(new Uint8Array([5, 6]));

    const res = await GET(makeRequest('microsoft-onedrive', 'AA!123'));
    expect(res.status).toBe(200);
    const fetch = h.fetches[0];
    expect(fetch.url).toBe('https://contoso-my.sharepoint.com/personal/x/download');
    expect(fetch.headers?.Authorization).toBeUndefined();
  });

  it('a redirect to a non-allowlisted host -> 502 and no second fetch', async () => {
    h.resolveGoogle.mockResolvedValue(GOOGLE_PDF);
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, config?: { headers?: Record<string, string> }) => {
      h.fetches.push({ url: String(input), headers: config?.headers });
      return new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } });
    }));

    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(502);
    expect(h.fetches).toHaveLength(1);
  });

  it('an allowlisted redirect -> one hop WITHOUT Authorization', async () => {
    h.resolveGoogle.mockResolvedValue(GOOGLE_PDF);
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, config?: { headers?: Record<string, string> }) => {
      const url = String(input);
      h.fetches.push({ url, headers: config?.headers });
      if (url.includes('/files/')) {
        return new Response(null, {
          status: 302,
          headers: { location: 'https://lh3.googleusercontent.com/real-bytes' },
        });
      }
      return new Response(new Uint8Array([7]), { status: 200 });
    }));

    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(200);
    expect(h.fetches).toHaveLength(2);
    expect(h.fetches[0].headers?.Authorization).toBe('Bearer provider-token');
    expect(h.fetches[1].url).toBe('https://lh3.googleusercontent.com/real-bytes');
    expect(h.fetches[1].headers?.Authorization).toBeUndefined();
  });

  it('a stream larger than the limit -> 413', async () => {
    h.resolveGoogle.mockResolvedValue({ ...GOOGLE_PDF, sizeBytes: undefined });
    const big = new Uint8Array(51 * 1024 * 1024); // one byte over the 50 MB PDF limit
    installFetch(big);

    const res = await GET(makeRequest('google-drive', GOOGLE_PDF.id));
    expect(res.status).toBe(413);
  });
});
