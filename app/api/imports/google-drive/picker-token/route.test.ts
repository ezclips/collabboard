import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * PATCH-214. The Picker token route returns the user's own short-lived token and
 * the Cloud project number. A refused connection reads as 401 with `reconnect`.
 */

const h = vi.hoisted(() => ({
  auth: vi.fn(),
  token: vi.fn(),
}));

vi.mock('@/lib/imports/auth', () => ({ getAuthenticatedUserId: h.auth }));
vi.mock('@/lib/imports/tokenRefresh', () => ({ getValidAccessToken: h.token }));

import { GET } from './route';

function makeRequest() {
  return new NextRequest('http://localhost/api/imports/google-drive/picker-token');
}

const ORIGINAL_CLIENT_ID = process.env.GOOGLE_DRIVE_CLIENT_ID;
const ORIGINAL_SHARED_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;

beforeEach(() => {
  h.auth.mockResolvedValue({ userId: 'user-1', token: 'supabase-token' });
  h.token.mockResolvedValue('provider-token');
  process.env.GOOGLE_DRIVE_CLIENT_ID = '123456789012-abc.apps.googleusercontent.com';
  delete process.env.GOOGLE_CLIENT_ID;
});

afterEach(() => {
  vi.clearAllMocks();
  process.env.GOOGLE_DRIVE_CLIENT_ID = ORIGINAL_CLIENT_ID;
  process.env.GOOGLE_CLIENT_ID = ORIGINAL_SHARED_CLIENT_ID;
});

describe('GET /api/imports/google-drive/picker-token', () => {
  it('no auth is a 401', async () => {
    h.auth.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('not connected is a 401 with reconnect: true', async () => {
    h.token.mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Not connected', reconnect: true });
  });

  it('OK returns { accessToken, appId } with Cache-Control: no-store', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ accessToken: 'provider-token', appId: '123456789012' });
  });

  it('a client id with no project number is a 500', async () => {
    process.env.GOOGLE_DRIVE_CLIENT_ID = 'abc-def.apps.googleusercontent.com';
    const res = await GET(makeRequest());
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('Google Drive is not configured');
  });

  it('falls back to GOOGLE_CLIENT_ID when the Drive one is absent', async () => {
    delete process.env.GOOGLE_DRIVE_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = '555555555-xyz.apps.googleusercontent.com';
    const res = await GET(makeRequest());
    expect((await res.json()).appId).toBe('555555555');
  });
});
