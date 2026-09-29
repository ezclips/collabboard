import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-214. `connected` is true only when the row exists AND the token actually
 * resolves -- a refused refresh now reads as null, so a dead row shows
 * "not connected" rather than a lie.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock('@/lib/imports/auth', () => ({ getAuthenticatedUserId: h.auth }));
vi.mock('@/lib/imports/tokenRefresh', () => ({ getValidAccessToken: h.token }));
vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: h.maybeSingle }) }) }),
    }),
  }),
}));

import { GET } from './route';

function makeRequest(provider: string) {
  return new NextRequest(`http://localhost/api/imports/status?provider=${provider}`);
}

beforeEach(() => {
  h.auth.mockResolvedValue({ userId: 'user-1', token: 'supabase-token' });
  h.token.mockResolvedValue('provider-token');
  h.maybeSingle.mockResolvedValue({ data: { email: 'user@example.com' }, error: null });
});

afterEach(() => vi.clearAllMocks());

describe('GET /api/imports/status', () => {
  it('row present and a working token -> connected: true', async () => {
    const res = await GET(makeRequest('google-drive'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: 'google-drive',
      connected: true,
      email: 'user@example.com',
    });
  });

  it('row present but the token does not resolve -> connected: false', async () => {
    h.token.mockResolvedValue(null);
    const res = await GET(makeRequest('google-drive'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      provider: 'google-drive',
      connected: false,
      email: 'user@example.com',
    });
  });

  it('no row -> connected: false, and the token is never asked for', async () => {
    h.maybeSingle.mockResolvedValue({ data: null, error: null });
    const res = await GET(makeRequest('microsoft-onedrive'));
    expect((await res.json()).connected).toBe(false);
    expect(h.token).not.toHaveBeenCalled();
  });

  it('an unknown provider is a 400', async () => {
    const res = await GET(makeRequest('dropbox'));
    expect(res.status).toBe(400);
  });

  it('no auth is a 401', async () => {
    h.auth.mockResolvedValue(null);
    const res = await GET(makeRequest('google-drive'));
    expect(res.status).toBe(401);
  });
});
