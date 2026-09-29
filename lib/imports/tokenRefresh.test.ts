import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-214. A refresh the provider REFUSES (400/401, e.g. invalid_grant) must
 * read as "not connected" -- null -- not as a stale access token behind a
 * "Connected" label. A network error or a 5xx keeps the old fallback.
 */

const h = vi.hoisted(() => ({
  single: vi.fn(),
  updateEq: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ single: h.single }),
        }),
      }),
      update: () => ({ eq: () => ({ eq: h.updateEq }) }),
    }),
  }),
}));

vi.mock('@/lib/security/tokenCipher', () => ({
  decryptToken: (v: string | null) => v,
  encryptToken: (v: string | null) => v,
}));

import { getValidAccessToken } from './tokenRefresh';

// A row whose access token is EXPIRED and that has a refresh token, so the
// refresh path always runs.
function expiredRow() {
  return {
    data: {
      access_token: 'stale-token',
      refresh_token: 'refresh-token',
      access_token_encrypted: null,
      refresh_token_encrypted: null,
      expires_at: new Date(Date.now() - 60_000).toISOString(),
      email: 'user@example.com',
    },
    error: null,
  };
}

beforeEach(() => {
  h.single.mockResolvedValue(expiredRow());
  h.updateEq.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('getValidAccessToken: a refused refresh means not connected', () => {
  it('returns null when the provider answers 400 invalid_grant', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 })
    ));

    expect(await getValidAccessToken('user-1', 'google-drive')).toBeNull();
  });

  it('returns null when the provider answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 401 })));
    expect(await getValidAccessToken('user-1', 'microsoft-onedrive')).toBeNull();
  });

  it('returns the OLD access token on a network error (today\'s fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await getValidAccessToken('user-1', 'google-drive')).toBe('stale-token');
  });

  it('returns the OLD access token on a 5xx (transient)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    expect(await getValidAccessToken('user-1', 'google-drive')).toBe('stale-token');
  });

  it('returns the NEW token on a successful refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'fresh-token', expires_in: 3600 }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    ));

    expect(await getValidAccessToken('user-1', 'google-drive')).toBe('fresh-token');
    expect(h.updateEq).toHaveBeenCalledTimes(1);
  });
});
