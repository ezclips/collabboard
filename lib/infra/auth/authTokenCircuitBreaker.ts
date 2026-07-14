/**
 * Client-side circuit breaker for Supabase auth token requests.
 *
 * When the provider returns 429 (over_request_rate_limit) on
 * `/auth/v1/token`, supabase-js keeps retrying (timer ticks, visibility
 * changes, new client instances after reloads). Every retry burns the same
 * per-IP budget the password sign-in needs, so the block never drains —
 * observed as a multi-hour login outage on 2026-07-13/14.
 *
 * This wraps `fetch` so that after one provider 429 on the token endpoint,
 * all further token requests short-circuit locally (synthetic 429, zero
 * network) until the backoff expires. Non-token requests pass through
 * untouched. The backoff timestamp persists in storage so reloads do not
 * reset the breaker.
 */

export const AUTH_TOKEN_BACKOFF_MS = 5 * 60 * 1000;
export const AUTH_TOKEN_BACKOFF_STORAGE_KEY = 'sb-auth-token-backoff-until';

export const isAuthTokenRequest = (url: string): boolean =>
  url.includes('/auth/v1/token');

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
  let backoffUntil = readBackoffUntil(storage);

  return async (input, init) => {
    const url = requestUrl(input);

    if (!isAuthTokenRequest(url)) {
      return fetchImpl(input, init);
    }

    const now = nowFn();
    if (now < backoffUntil) {
      return syntheticRateLimitResponse();
    }

    const response = await fetchImpl(input, init);

    if (response.status === 429) {
      backoffUntil = now + backoffMs;
      writeBackoffUntil(storage, backoffUntil);
    } else if (backoffUntil !== 0) {
      backoffUntil = 0;
      writeBackoffUntil(storage, 0);
    }

    return response;
  };
};
