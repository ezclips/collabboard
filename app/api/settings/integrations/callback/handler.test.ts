import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-214b. The callback refuses to save a connection that did not grant the
 * scope it needs -- otherwise it is stored as "Connected" while every real call
 * fails. An empty `scope` (the provider did not say) is NOT a failure.
 */

const h = vi.hoisted(() => ({
  upserts: [] as unknown[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  getSupabaseAdmin: () => ({
    from: () => ({
      upsert: async (row: unknown) => {
        h.upserts.push(row);
        return { error: null };
      },
    }),
  }),
}));

vi.mock('@/lib/security/tokenCipher', () => ({
  encryptToken: (v: string | null) => (v ? `enc(${v})` : null),
}));

import { createOAuthState } from '../oauth';
import { handleOAuthCallback } from './handler';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(provider: string, state: string) {
  const url = new URL('https://app.test/api/settings/integrations/callback');
  url.searchParams.set('provider', provider);
  url.searchParams.set('code', 'auth-code');
  url.searchParams.set('state', state);
  return new NextRequest(url.toString());
}

/** A fetch double: the token endpoint, then the profile endpoint. */
function installFetch(tokenJson: Record<string, unknown>) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('token') || url.endsWith('/token')) {
      return new Response(JSON.stringify(tokenJson), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    // Profile.
    return new Response(JSON.stringify({ sub: 'u1', email: 'user@example.com', id: 'u1' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }));
}

beforeEach(() => {
  h.upserts.length = 0;
  process.env.GOOGLE_DRIVE_CLIENT_ID = '123456789012-abc.apps.googleusercontent.com';
  process.env.GOOGLE_DRIVE_CLIENT_SECRET = 'secret';
  process.env.OAUTH_STATE_SECRET = 'state-secret';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function locationOf(res: Response): URL {
  return new URL(res.headers.get('location')!);
}

describe('handleOAuthCallback scope gate', () => {
  it('Google without drive.file -> error redirect, NO upsert', async () => {
    installFetch({ access_token: 'tok', scope: 'openid email profile' });
    const res = await handleOAuthCallback(
      makeRequest('google-drive', createOAuthState('user-1', 'google-drive')),
    );

    const location = locationOf(res);
    expect(location.pathname).toBe('/dashboard/settings/integrations');
    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('message')).toContain('Google Drive access wasn\'t granted');
    expect(location.searchParams.get('message')).toContain('tick the box');
    expect(h.upserts).toHaveLength(0);
  });

  it('Google with drive.file -> upsert and success', async () => {
    installFetch({
      access_token: 'tok',
      scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
    });
    const res = await handleOAuthCallback(
      makeRequest('google-drive', createOAuthState('user-1', 'google-drive')),
    );

    expect(locationOf(res).searchParams.get('status')).toBe('success');
    expect(h.upserts).toHaveLength(1);
  });

  it('no scope field -> upsert and success (provider did not say)', async () => {
    installFetch({ access_token: 'tok' });
    const res = await handleOAuthCallback(
      makeRequest('google-drive', createOAuthState('user-1', 'google-drive')),
    );

    expect(locationOf(res).searchParams.get('status')).toBe('success');
    expect(h.upserts).toHaveLength(1);
  });

  it('Microsoft without Files.Read -> error redirect, NO upsert', async () => {
    process.env.MICROSOFT_CLIENT_ID = 'ms-client';
    process.env.MICROSOFT_CLIENT_SECRET = 'ms-secret';
    installFetch({ access_token: 'tok', scope: 'openid User.Read' });
    const res = await handleOAuthCallback(
      makeRequest('microsoft-onedrive', createOAuthState('user-1', 'microsoft-onedrive')),
    );

    const location = locationOf(res);
    expect(location.searchParams.get('status')).toBe('error');
    expect(location.searchParams.get('message')).toContain('OneDrive access wasn\'t granted');
    expect(h.upserts).toHaveLength(0);
  });
});
