import { describe, expect, it, vi } from 'vitest';

import {
  AUTH_TOKEN_BACKOFF_MS,
  AUTH_TOKEN_BACKOFF_STORAGE_KEY,
  createAuthTokenCircuitBreaker,
  isAuthTokenRequest,
} from './authTokenCircuitBreaker';

const TOKEN_URL = 'https://ref.supabase.co/auth/v1/token?grant_type=refresh_token';
const REST_URL = 'https://ref.supabase.co/rest/v1/posts';

const makeStorage = (initial: Record<string, string> = {}) => {
  const store = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    dump: () => Object.fromEntries(store),
  };
};

const okResponse = () => new Response('{}', { status: 200 });
const rateLimitedResponse = () =>
  new Response('{"code":"over_request_rate_limit"}', { status: 429 });

describe('isAuthTokenRequest', () => {
  it('matches only the auth token endpoint', () => {
    expect(isAuthTokenRequest(TOKEN_URL)).toBe(true);
    expect(isAuthTokenRequest(REST_URL)).toBe(false);
    expect(isAuthTokenRequest('https://ref.supabase.co/auth/v1/logout')).toBe(false);
  });
});

describe('createAuthTokenCircuitBreaker', () => {
  it('passes non-token requests through untouched, even while blocked', async () => {
    const fetchImpl = vi.fn(async () => rateLimitedResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => 1000 });

    await guarded(TOKEN_URL); // trips the breaker
    fetchImpl.mockClear();
    fetchImpl.mockResolvedValueOnce(okResponse());

    const res = await guarded(REST_URL);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('trips after a provider 429 and short-circuits the next token request', async () => {
    let now = 1000;
    const fetchImpl = vi.fn(async () => rateLimitedResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => now });

    const first = await guarded(TOKEN_URL);
    expect(first.status).toBe(429);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    now += 1000;
    const second = await guarded(TOKEN_URL);
    expect(second.status).toBe(429);
    expect(await second.json()).toMatchObject({ code: 'client_backoff_active' });
    // No extra network call while blocked
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('allows token requests again after the backoff expires', async () => {
    let now = 1000;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse())
      .mockResolvedValueOnce(okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => now });

    await guarded(TOKEN_URL);
    now += AUTH_TOKEN_BACKOFF_MS + 1;

    const res = await guarded(TOKEN_URL);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('clears the breaker on a successful token response', async () => {
    let now = 1000;
    const storage = makeStorage();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse())
      .mockResolvedValueOnce(okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, storage, nowFn: () => now });

    await guarded(TOKEN_URL);
    expect(storage.dump()[AUTH_TOKEN_BACKOFF_STORAGE_KEY]).toBe(String(1000 + AUTH_TOKEN_BACKOFF_MS));

    now += AUTH_TOKEN_BACKOFF_MS + 1;
    await guarded(TOKEN_URL);
    expect(storage.dump()[AUTH_TOKEN_BACKOFF_STORAGE_KEY]).toBe('0');
  });

  it('restores an active backoff from storage (survives reloads)', async () => {
    const storage = makeStorage({ [AUTH_TOKEN_BACKOFF_STORAGE_KEY]: '5000' });
    const fetchImpl = vi.fn(async () => okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, storage, nowFn: () => 4000 });

    const res = await guarded(TOKEN_URL);
    expect(res.status).toBe(429);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('ignores malformed storage values', async () => {
    const storage = makeStorage({ [AUTH_TOKEN_BACKOFF_STORAGE_KEY]: 'not-a-number' });
    const fetchImpl = vi.fn(async () => okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, storage, nowFn: () => 1000 });

    const res = await guarded(TOKEN_URL);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
