import { describe, expect, it, vi } from 'vitest';

import {
  AUTH_TOKEN_BACKOFF_MS,
  AUTH_TOKEN_BACKOFF_STORAGE_KEY,
  createAuthTokenCircuitBreaker,
  isAuthTokenRequest,
  isRefreshTokenGrantRequest,
} from './authTokenCircuitBreaker';

const TOKEN_URL = 'https://ref.supabase.co/auth/v1/token?grant_type=refresh_token';
const PASSWORD_URL = 'https://ref.supabase.co/auth/v1/token?grant_type=password';
const REST_URL = 'https://ref.supabase.co/rest/v1/posts';
const refreshInit = (refreshToken: string): RequestInit => ({
  method: 'POST',
  body: JSON.stringify({ refresh_token: refreshToken }),
});
const passwordInit = (): RequestInit => ({
  method: 'POST',
  body: JSON.stringify({ email: 'person@example.com', password: 'correct-password' }),
});

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

describe('isRefreshTokenGrantRequest', () => {
  it('matches only the refresh-token grant, not password grant or other token calls', () => {
    expect(isRefreshTokenGrantRequest(TOKEN_URL)).toBe(true);
    expect(isRefreshTokenGrantRequest(PASSWORD_URL)).toBe(false);
    expect(isRefreshTokenGrantRequest('https://ref.supabase.co/auth/v1/token?grant_type=pkce')).toBe(false);
    expect(isRefreshTokenGrantRequest(REST_URL)).toBe(false);
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

// ============================================================================
// AUTH-H1 -- refresh/password distinction and in-flight refresh coalescing
// ============================================================================
describe('AUTH-H1 refresh/password distinction and coalescing', () => {
  it('A: an ordinary non-token fetch passes through untouched', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => 1000 });

    const res = await guarded(REST_URL);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('B: password-grant requests are never coalesced with each other or with refresh', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => 1000 });

    const [a, b] = await Promise.all([
      guarded(PASSWORD_URL, passwordInit()),
      guarded(PASSWORD_URL, passwordInit()),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // Two independent password submissions, not merged into one network call.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('C: a single refresh request results in exactly one real fetch', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => 1000 });

    const res = await guarded(TOKEN_URL, refreshInit('solo-token'));
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('D: 20 concurrent identical refresh requests trigger exactly one real fetch', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'shared-session' }), { status: 200 }),
    );
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => 1000 });
    const init = refreshInit('same-refresh-token');

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => guarded(TOKEN_URL, init)),
    );

    expect(responses).toHaveLength(20);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('E: every concurrent caller receives its own independently-consumable response', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ access_token: 'shared-session' }), { status: 200 }),
    );
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => 1000 });
    const init = refreshInit('same-refresh-token');

    const responses = await Promise.all(
      Array.from({ length: 20 }, () => guarded(TOKEN_URL, init)),
    );

    // At least two callers actually read their body -- proves independent,
    // unconsumed streams rather than one Response object shared by reference.
    const [first, second] = await Promise.all([responses[0].json(), responses[1].json()]);
    expect(first).toEqual({ access_token: 'shared-session' });
    expect(second).toEqual({ access_token: 'shared-session' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('F: a genuine provider 429 on refresh activates the persisted backoff', async () => {
    const storage = makeStorage();
    const fetchImpl = vi.fn(async () => rateLimitedResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, storage, nowFn: () => 1000 });

    const res = await guarded(TOKEN_URL, refreshInit('token'));
    expect(res.status).toBe(429);
    expect(Number(storage.dump()[AUTH_TOKEN_BACKOFF_STORAGE_KEY])).toBeGreaterThan(1000);
  });

  it('G: a refresh request during active backoff issues zero real fetches', async () => {
    let now = 1000;
    const fetchImpl = vi.fn(async () => rateLimitedResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => now });

    await guarded(TOKEN_URL, refreshInit('token'));
    fetchImpl.mockClear();
    now += 1000;

    const res = await guarded(TOKEN_URL, refreshInit('token'));
    expect(res.status).toBe(429);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('H: a breaker created before another breaker\'s 429 still observes the newly persisted backoff', async () => {
    const storage = makeStorage();
    let now = 1000;

    const fetchImplA = vi.fn(async () => rateLimitedResponse());
    const breakerA = createAuthTokenCircuitBreaker({ fetchImpl: fetchImplA, storage, nowFn: () => now });

    const fetchImplB = vi.fn(async () => okResponse());
    // Constructed before breakerA ever sees a 429.
    const breakerB = createAuthTokenCircuitBreaker({ fetchImpl: fetchImplB, storage, nowFn: () => now });

    await breakerA(TOKEN_URL, refreshInit('token-a'));
    now += 1000;

    const responseFromB = await breakerB(TOKEN_URL, refreshInit('token-b'));
    expect(responseFromB.status).toBe(429);
    expect(fetchImplB).not.toHaveBeenCalled();
  });

  it('I: backoff expiry permits exactly one real refresh attempt again', async () => {
    let now = 1000;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse())
      .mockResolvedValueOnce(okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => now });

    await guarded(TOKEN_URL, refreshInit('token'));
    now += AUTH_TOKEN_BACKOFF_MS + 1;

    const res = await guarded(TOKEN_URL, refreshInit('token'));
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('J: a successful refresh after expiry clears the stale persisted backoff', async () => {
    const storage = makeStorage();
    let now = 1000;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse())
      .mockResolvedValueOnce(okResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, storage, nowFn: () => now });

    await guarded(TOKEN_URL, refreshInit('token'));
    now += AUTH_TOKEN_BACKOFF_MS + 1;
    await guarded(TOKEN_URL, refreshInit('token'));

    expect(storage.dump()[AUTH_TOKEN_BACKOFF_STORAGE_KEY]).toBe('0');
  });

  it('K: password sign-in is never blocked by an active refresh backoff', async () => {
    let now = 1000;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(rateLimitedResponse()) // trips the refresh backoff
      .mockResolvedValueOnce(okResponse()); // the password grant call itself
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => now });

    await guarded(TOKEN_URL, refreshInit('token')); // refresh -> 429
    now += 1000;

    const passwordResponse = await guarded(PASSWORD_URL, passwordInit());
    expect(passwordResponse.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('L: non-token API calls remain available while a refresh backoff is active', async () => {
    let now = 1000;
    const fetchImpl = vi.fn(async () => rateLimitedResponse());
    const guarded = createAuthTokenCircuitBreaker({ fetchImpl, nowFn: () => now });

    await guarded(TOKEN_URL, refreshInit('token')); // trips the breaker
    fetchImpl.mockClear();
    fetchImpl.mockResolvedValueOnce(okResponse());
    now += 1000;

    const res = await guarded(REST_URL);
    expect(res.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
