import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createBrowserSupabaseClient } from './browserClient';
import { decodeJwtPayload, getSessionAccessToken } from './sessionToken';

vi.mock('./browserClient', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createBrowserSupabaseClient);

function createToken(payloadJson: string) {
  const base64 = Buffer.from(payloadJson, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

  return `header.${base64}.signature`;
}

function installFakeAuth(auth: Record<string, unknown>) {
  mockedCreateClient.mockReturnValue(
    { auth } as unknown as ReturnType<typeof createBrowserSupabaseClient>,
  );
}

beforeEach(() => {
  mockedCreateClient.mockReset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('decodeJwtPayload', () => {
  it('decodes a base64url payload with sub and email', () => {
    const token = createToken(JSON.stringify({ sub: 'user-1', email: 'user@example.com' }));

    expect(decodeJwtPayload(token)).toEqual({
      sub: 'user-1',
      email: 'user@example.com',
    });
  });

  it('handles - and _ characters in the payload encoding', () => {
    const token = createToken(JSON.stringify({ email: 'a+b/c@example.com' }));

    expect(decodeJwtPayload(token)).toEqual({
      email: 'a+b/c@example.com',
    });
  });

  it('handles missing padding', () => {
    const token = 'header.eyJzdWIiOiJ1c2VyLTEifQ.signature';

    expect(decodeJwtPayload(token)).toEqual({
      sub: 'user-1',
    });
  });
});

describe('getSessionAccessToken', () => {
  it('returns the current session access token without calling refreshSession', async () => {
    const getSession = vi.fn(async () => ({
      data: { session: { access_token: 'access-token' } },
      error: null,
    }));
    const refreshSession = vi.fn();
    const signOut = vi.fn();
    installFakeAuth({ getSession, refreshSession, signOut });

    await expect(getSessionAccessToken()).resolves.toBe('access-token');
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(refreshSession).not.toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('clears the local session and redirects to /auth once when no session is available', async () => {
    const getSession = vi.fn(async () => ({
      data: { session: null },
      error: null,
    }));
    const signOut = vi.fn(async () => ({ error: null }));
    installFakeAuth({ getSession, signOut });

    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: {
        pathname: '/dashboard/settings',
        search: '?tab=workspace',
        hash: '',
        assign,
      },
    });

    await expect(getSessionAccessToken()).resolves.toBeNull();
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign.mock.calls[0][0]).toContain('/auth?redirect=');
  });
});
