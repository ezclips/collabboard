/**
 * No-network inspection of the Supabase auth-helpers session cookie.
 *
 * Why this exists: calling `supabase.auth.getSession()` on the /auth page
 * mount triggers a refresh-token exchange whenever the stored access token is
 * expired. With a stale refresh token that exchange returns 429
 * (over_request_rate_limit) and poisons the login page before the user can
 * submit the form (proven 2026-07-13). These helpers read the cookie payload
 * directly so the login page can decide "redirect / stay / clear stale
 * cookies" without ever hitting the Supabase auth endpoint.
 *
 * Cookie format (@supabase/auth-helpers-nextjs 0.10, BrowserCookieAuthStorage):
 * `sb-<project-ref>-auth-token` holding a URI-encoded JSON array
 * `[access_token, refresh_token, provider_token, provider_refresh_token, factors]`,
 * split into `sb-...-auth-token.0`, `.1`, ... chunks when longer than the
 * per-cookie limit. Expiry lives in the access-token JWT `exp` claim.
 * Object payloads (`{ access_token, expires_at, ... }`) and the newer
 * `base64-` prefix used by @supabase/ssr are tolerated for robustness.
 */

const AUTH_TOKEN_COOKIE_PATTERN = /^sb-[a-z0-9-]+-auth-token(\.\d+)?$/i;

/** Access tokens expiring within this window are treated as already expired,
 * because supabase-js would proactively refresh them. */
export const SESSION_EXPIRY_SKEW_MS = 60 * 1000;

export type StoredSessionStatus =
  | { kind: 'none' }
  | { kind: 'valid'; expiresAtMs: number; cookieNames: string[] }
  | { kind: 'stale'; cookieNames: string[] }
  | { kind: 'unparseable'; cookieNames: string[] };

export const parseCookieHeader = (cookieHeader: string): Map<string, string> => {
  const cookies = new Map<string, string>();

  for (const pair of cookieHeader.split(';')) {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex === -1) continue;
    const name = pair.slice(0, separatorIndex).trim();
    if (!name) continue;
    const rawValue = pair.slice(separatorIndex + 1).trim();
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }

  return cookies;
};

export const findAuthTokenCookieNames = (cookieNames: Iterable<string>): string[] => {
  const matches: string[] = [];
  for (const name of cookieNames) {
    if (AUTH_TOKEN_COOKIE_PATTERN.test(name)) {
      matches.push(name);
    }
  }

  // Base cookie first, then numeric chunks in ascending order so joined
  // chunked payloads reassemble correctly.
  return matches.sort((a, b) => {
    const chunkA = a.match(/\.(\d+)$/);
    const chunkB = b.match(/\.(\d+)$/);
    if (!chunkA && !chunkB) return a.localeCompare(b);
    if (!chunkA) return -1;
    if (!chunkB) return 1;
    return Number(chunkA[1]) - Number(chunkB[1]);
  });
};

const decodeBase64Url = (segment: string): string | null => {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try {
    if (typeof atob === 'function') {
      return atob(padded);
    }
    return Buffer.from(padded, 'base64').toString('utf-8');
  } catch {
    return null;
  }
};

/** Returns the `exp` claim of a JWT in milliseconds, or null if unreadable. */
export const decodeJwtExpiryMs = (jwt: unknown): number | null => {
  if (typeof jwt !== 'string') return null;
  const segments = jwt.split('.');
  if (segments.length !== 3) return null;

  const payloadText = decodeBase64Url(segments[1]);
  if (!payloadText) return null;

  try {
    const payload: unknown = JSON.parse(payloadText);
    if (
      typeof payload === 'object' &&
      payload !== null &&
      typeof (payload as { exp?: unknown }).exp === 'number'
    ) {
      return (payload as { exp: number }).exp * 1000;
    }
  } catch {
    return null;
  }
  return null;
};

/** Extracts the session expiry (ms) from a joined auth-token cookie value. */
export const getStoredSessionExpiryMs = (cookieValue: string): number | null => {
  let text = cookieValue;
  if (text.startsWith('base64-')) {
    const decoded = decodeBase64Url(text.slice('base64-'.length));
    if (!decoded) return null;
    text = decoded;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (Array.isArray(parsed)) {
    return decodeJwtExpiryMs(parsed[0]);
  }

  if (typeof parsed === 'object' && parsed !== null) {
    const session = parsed as { expires_at?: unknown; access_token?: unknown };
    if (typeof session.expires_at === 'number') {
      return session.expires_at * 1000;
    }
    return decodeJwtExpiryMs(session.access_token);
  }

  return null;
};

export const evaluateStoredSession = (
  cookieHeader: string,
  nowMs: number,
  expirySkewMs: number = SESSION_EXPIRY_SKEW_MS,
): StoredSessionStatus => {
  const cookies = parseCookieHeader(cookieHeader);
  const cookieNames = findAuthTokenCookieNames(cookies.keys());

  if (cookieNames.length === 0) {
    return { kind: 'none' };
  }

  const joinedValue = cookieNames.map((name) => cookies.get(name) ?? '').join('');
  const expiresAtMs = getStoredSessionExpiryMs(joinedValue);

  if (expiresAtMs === null) {
    return { kind: 'unparseable', cookieNames };
  }

  if (expiresAtMs <= nowMs + expirySkewMs) {
    return { kind: 'stale', cookieNames };
  }

  return { kind: 'valid', expiresAtMs, cookieNames };
};

/**
 * Expires the given cookies in the browser without any network call.
 * Supabase auth-helpers cookies are not httpOnly, so this fully removes the
 * stale session from every layer (browser client, middleware, route handlers).
 */
export const clearAuthCookiesInBrowser = (cookieNames: string[]): void => {
  if (typeof document === 'undefined') return;
  for (const name of cookieNames) {
    document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
  }
};

/**
 * Login-page bootstrap: decides what /auth should do on mount without
 * touching the network.
 *
 * - `redirect`: an unexpired session exists — safe to route the user onward.
 * - `cleared`: a stale or switch-account session was removed locally.
 * - `stay`: nothing stored (or unreadable) — just show the login form.
 */
export const resolveLoginPageSession = ({
  cookieHeader,
  nowMs,
  switchAccount,
}: {
  cookieHeader: string;
  nowMs: number;
  switchAccount: boolean;
}): { action: 'redirect' | 'cleared' | 'stay'; cookieNames: string[] } => {
  const status = evaluateStoredSession(cookieHeader, nowMs);

  if (status.kind === 'none') {
    return { action: 'stay', cookieNames: [] };
  }

  if (switchAccount) {
    return { action: 'cleared', cookieNames: status.cookieNames };
  }

  if (status.kind === 'valid') {
    return { action: 'redirect', cookieNames: status.cookieNames };
  }

  if (status.kind === 'stale') {
    return { action: 'cleared', cookieNames: status.cookieNames };
  }

  // Unparseable: leave the cookies alone (may be a newer format) and show
  // the form. Never call getSession() here — that is the poisoned path.
  return { action: 'stay', cookieNames: [] };
};
