/**
 * Client-side circuit breaker for Supabase's refresh-token requests.
 *
 * When the provider returns 429 (over_request_rate_limit) on
 * `/auth/v1/token?grant_type=refresh_token`, supabase-js keeps retrying
 * (timer ticks, visibility changes, new client instances after reloads).
 * Every retry burns the same per-IP budget the password sign-in needs, so the
 * block never drains -- observed as a multi-hour login outage on
 * 2026-07-13/14, and again as a refresh-token storm racing a single mistyped
 * password on 2026-08-25 (AUTH-H1).
 *
 * This wraps `fetch` so that after one provider 429 on a refresh-token
 * request, all further refresh requests short-circuit locally (synthetic
 * 429, zero network) until the backoff expires. Only the refresh-token grant
 * is gated -- supabase-js also calls `/auth/v1/token?grant_type=password` for
 * password sign-in, and that must never wait behind or be coalesced with a
 * refresh call, or this protection would itself become a login lockout.
 * Non-token requests pass through untouched.
 *
 * The backoff timestamp persists in storage and is re-read on every request
 * (not cached at construction), so a second breaker instance left running by
 * Next.js Fast Refresh (a stale module evaluation whose GoTrueClient still
 * has live timers) observes a backoff written by a newer instance instead of
 * hammering the provider on its own stale schedule.
 *
 * Concurrent refresh requests for the same session are coalesced: only the
 * first reaches the network, and every caller gets its own `Response.clone()`
 * so consuming one caller's body never consumes another's.
 */

export const AUTH_TOKEN_BACKOFF_MS = 5 * 60 * 1000;
export const AUTH_TOKEN_BACKOFF_STORAGE_KEY = 'sb-auth-token-backoff-until';

export const isAuthTokenRequest = (url: string): boolean =>
  url.includes('/auth/v1/token');

// supabase-js (GoTrueClient) always distinguishes token grants via this exact
// query parameter -- `${url}/token?grant_type=refresh_token` for refresh,
// `${url}/token?grant_type=password` for password sign-in -- never a
// body-only signal. Confirmed against @supabase/auth-js's GoTrueClient
// source rather than assumed.
export const isRefreshTokenGrantRequest = (url: string): boolean =>
  isAuthTokenRequest(url) && /[?&]grant_type=refresh_token(?:&|$)/.test(url);

type MinimalStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const requestUrl = (input: RequestInfo | URL): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const readBackoffUntil = (storage: MinimalStorage | null): number => {
  if (!storage) return 0;
  try {
    const raw = storage.getItem(AUTH_TOKEN_BACKOFF_STORAGE_KEY);
    const parsed = raw === null ? 0 : Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

const writeBackoffUntil = (storage: MinimalStorage | null, until: number): void => {
  if (!storage) return;
  try {
    storage.setItem(AUTH_TOKEN_BACKOFF_STORAGE_KEY, String(until));
  } catch {
    // Storage unavailable (private mode, quota) — in-memory state still applies.
  }
};

const syntheticRateLimitResponse = (): Response =>
  new Response(
    JSON.stringify({
      code: 'client_backoff_active',
      message: 'Auth token requests are paused after a provider rate limit.',
    }),
    { status: 429, headers: { 'Content-Type': 'application/json' } },
  );

// Same-refresh-token concurrent requests share one network call; a
// differently-keyed refresh (a genuinely different session) is never merged
// into it. The request body is supabase-js's own JSON-stringified
// `{ refresh_token }` payload -- used only as an in-memory Map key for the
// lifetime of the in-flight request, never logged and never written to
// storage.
const coalescingKeyFor = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

export const createAuthTokenCircuitBreaker = ({
  fetchImpl,
  storage = null,
  nowFn = Date.now,
  backoffMs = AUTH_TOKEN_BACKOFF_MS,
}: {
  fetchImpl: FetchLike;
  storage?: MinimalStorage | null;
  nowFn?: () => number;
  backoffMs?: number;
}): FetchLike => {
  const inFlightRefreshes = new Map<string, Promise<Response>>();
  // Mirrors the backoff in-memory so a single instance still works when no
  // `storage` is supplied (tests, or storage unavailable). The effective
  // value on every check is the newer of this and whatever is in `storage`,
  // so a second, independently-constructed breaker sharing the same storage
  // still observes a backoff this instance never wrote itself.
  let localBackoffUntil = 0;

  const currentBackoffUntil = () => Math.max(localBackoffUntil, readBackoffUntil(storage));

  return async (input, init) => {
    const url = requestUrl(input);

    if (!isRefreshTokenGrantRequest(url)) {
      return fetchImpl(input, init);
    }

    const now = nowFn();
    if (now < currentBackoffUntil()) {
      return syntheticRateLimitResponse();
    }

    const key = coalescingKeyFor(init);
    const existing = inFlightRefreshes.get(key);
    if (existing) {
      const response = await existing;
      return response.clone();
    }

    const inFlight = (async () => {
      const response = await fetchImpl(input, init);
      const nextBackoffUntil = response.status === 429 ? nowFn() + backoffMs : 0;
      localBackoffUntil = nextBackoffUntil;
      writeBackoffUntil(storage, nextBackoffUntil);
      return response;
    })();

    inFlightRefreshes.set(key, inFlight);
    try {
      const response = await inFlight;
      return response.clone();
    } finally {
      inFlightRefreshes.delete(key);
    }
  };
};
