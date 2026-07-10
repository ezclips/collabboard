import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getVerifiedAuthUser,
  onAuthSessionChanged,
  updateCurrentUserMetadata,
} from './authState';
import { createBrowserSupabaseClient } from './browserClient';

vi.mock('./browserClient', () => ({
  createBrowserSupabaseClient: vi.fn(),
}));

const mockedCreateClient = vi.mocked(createBrowserSupabaseClient);

/**
 * The fake exposes only the auth surface the functions under test touch;
 * the double-cast mirrors the production factory idiom
 * (`createClientComponentClient() as unknown as X`).
 */
function installFakeAuth(auth: Record<string, unknown>) {
  mockedCreateClient.mockReturnValue(
    { auth } as unknown as ReturnType<typeof createBrowserSupabaseClient>,
  );
}

beforeEach(() => {
  mockedCreateClient.mockReset();
});

describe('getVerifiedAuthUser', () => {
  it('returns the server-validated user object itself when signed in', async () => {
    const user = {
      id: 'user-1',
      email: 'u@example.com',
      user_metadata: { preferences: { toolbarCollapsed: true } },
    };
    const getUser = vi.fn(async () => ({ data: { user }, error: null }));
    installFakeAuth({ getUser });

    const result = await getVerifiedAuthUser();

    expect(getUser).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(user);
    }
  });

  it('returns ok(null) when nobody is signed in', async () => {
    const getUser = vi.fn(async () => ({ data: { user: null }, error: null }));
    installFakeAuth({ getUser });

    const result = await getVerifiedAuthUser();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeNull();
    }
  });

  it('maps a resolved auth error to an unavailable DomainError carrying the cause', async () => {
    const authError = { name: 'AuthApiError', message: 'service down' };
    const getUser = vi.fn(async () => ({ data: { user: null }, error: authError }));
    installFakeAuth({ getUser });

    const result = await getVerifiedAuthUser();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(authError);
    }
  });

  it('lets a THROWN failure reject through (deliberate no-catch - the legacy channel)', async () => {
    const networkError = new Error('fetch failed');
    const getUser = vi.fn(async () => {
      throw networkError;
    });
    installFakeAuth({ getUser });

    await expect(getVerifiedAuthUser()).rejects.toBe(networkError);
  });
});

describe('onAuthSessionChanged', () => {
  it('delivers the event name and the SAME session object to the callback', () => {
    let captured: ((event: string, session: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn((cb: (event: string, session: unknown) => void) => {
      captured = cb;
      return { data: { subscription: { unsubscribe } } };
    });
    installFakeAuth({ onAuthStateChange });

    const received: Array<{ event: string; session: unknown }> = [];
    onAuthSessionChanged((event, session) => {
      received.push({ event, session });
    });

    const session = { user: { id: 'user-1' } };
    captured?.('SIGNED_IN', session);
    captured?.('SIGNED_OUT', null);

    expect(received).toHaveLength(2);
    expect(received[0].event).toBe('SIGNED_IN');
    expect(received[0].session).toBe(session);
    expect(received[1].event).toBe('SIGNED_OUT');
    expect(received[1].session).toBeNull();
  });

  it('returns an unsubscribe function wired to the live subscription', () => {
    const unsubscribe = vi.fn();
    const onAuthStateChange = vi.fn(() => ({ data: { subscription: { unsubscribe } } }));
    installFakeAuth({ onAuthStateChange });

    const stop = onAuthSessionChanged(() => {});

    expect(unsubscribe).not.toHaveBeenCalled();
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('updateCurrentUserMetadata', () => {
  it('sends EXACTLY { data: metadata } - the user_metadata attribute family only', async () => {
    const updateUser = vi.fn(async (_attributes: { data: Record<string, unknown> }) => ({
      data: { user: { id: 'user-1' } },
      error: null,
    }));
    installFakeAuth({ updateUser });
    const metadata = {
      preferences: { toolbarCollapsed: true },
      preferences_updated_at: '2026-07-10T12:00:00.000Z',
    };

    const result = await updateCurrentUserMetadata(metadata);

    expect(result.ok).toBe(true);
    expect(updateUser).toHaveBeenCalledTimes(1);
    const payload = updateUser.mock.calls[0][0];
    expect(Object.keys(payload)).toEqual(['data']);
    expect(payload.data).toBe(metadata);
  });

  it('maps a resolved auth error to an unavailable DomainError carrying the cause', async () => {
    const authError = { name: 'AuthApiError', message: 'service down' };
    const updateUser = vi.fn(async (_attributes: { data: Record<string, unknown> }) => ({
      data: { user: null },
      error: authError,
    }));
    installFakeAuth({ updateUser });

    const result = await updateCurrentUserMetadata({ a: 1 });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('unavailable');
      expect(result.error.cause).toBe(authError);
    }
  });

  it('lets a THROWN failure reject through (deliberate no-catch - the void call site discards it)', async () => {
    const networkError = new Error('fetch failed');
    const updateUser = vi.fn(async (_attributes: { data: Record<string, unknown> }) => {
      throw networkError;
    });
    installFakeAuth({ updateUser });

    await expect(updateCurrentUserMetadata({ a: 1 })).rejects.toBe(networkError);
  });
});
