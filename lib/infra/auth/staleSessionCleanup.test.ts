import { describe, expect, it } from 'vitest';

import {
  decodeJwtExpiryMs,
  evaluateStoredSession,
  findAuthTokenCookieNames,
  getStoredSessionExpiryMs,
  parseCookieHeader,
  resolveLoginPageSession,
  SESSION_EXPIRY_SKEW_MS,
} from './staleSessionCleanup';

const NOW_MS = 1_800_000_000_000; // fixed reference time

const base64Url = (value: string) =>
  Buffer.from(value, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const makeJwt = (expSeconds: number) =>
  `${base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64Url(
    JSON.stringify({ sub: 'user-1', exp: expSeconds }),
  )}.signature`;

const FUTURE_EXP_S = Math.floor(NOW_MS / 1000) + 3600;
const PAST_EXP_S = Math.floor(NOW_MS / 1000) - 3600;

const makeAuthHelpersCookieValue = (expSeconds: number) =>
  encodeURIComponent(
    JSON.stringify([makeJwt(expSeconds), 'refresh-token-value', null, null, null]),
  );

describe('parseCookieHeader', () => {
  it('parses multiple cookies and URI-decodes values', () => {
    const cookies = parseCookieHeader('a=1; sb-ref-auth-token=%5B%22x%22%5D; b=2');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('sb-ref-auth-token')).toBe('["x"]');
    expect(cookies.get('b')).toBe('2');
  });

  it('returns an empty map for an empty header', () => {
    expect(parseCookieHeader('').size).toBe(0);
  });
});

describe('findAuthTokenCookieNames', () => {
  it('matches base and chunked auth-token cookies only', () => {
    const names = findAuthTokenCookieNames([
      'other',
      'sb-atkgocwwqbjjhitpavei-auth-token.1',
      'sb-atkgocwwqbjjhitpavei-auth-token.0',
      'sb-atkgocwwqbjjhitpavei-auth-token-code-verifier',
    ]);
    expect(names).toEqual([
      'sb-atkgocwwqbjjhitpavei-auth-token.0',
      'sb-atkgocwwqbjjhitpavei-auth-token.1',
    ]);
  });

  it('orders chunks numerically, not lexically', () => {
    const names = findAuthTokenCookieNames([
      'sb-ref-auth-token.10',
      'sb-ref-auth-token.2',
    ]);
    expect(names).toEqual(['sb-ref-auth-token.2', 'sb-ref-auth-token.10']);
  });
});

describe('decodeJwtExpiryMs', () => {
  it('reads exp from a JWT payload', () => {
    expect(decodeJwtExpiryMs(makeJwt(FUTURE_EXP_S))).toBe(FUTURE_EXP_S * 1000);
  });

  it('returns null for non-JWT input', () => {
    expect(decodeJwtExpiryMs('not-a-jwt')).toBeNull();
    expect(decodeJwtExpiryMs(undefined)).toBeNull();
    expect(decodeJwtExpiryMs(42)).toBeNull();
  });
});

describe('getStoredSessionExpiryMs', () => {
  it('reads expiry from the auth-helpers array format', () => {
    const value = JSON.stringify([makeJwt(FUTURE_EXP_S), 'refresh', null, null, null]);
    expect(getStoredSessionExpiryMs(value)).toBe(FUTURE_EXP_S * 1000);
  });

  it('reads expires_at from an object-format session', () => {
    const value = JSON.stringify({ access_token: 'x', expires_at: FUTURE_EXP_S });
    expect(getStoredSessionExpiryMs(value)).toBe(FUTURE_EXP_S * 1000);
  });

  it('reads a base64- prefixed payload', () => {
    const raw = JSON.stringify({ expires_at: FUTURE_EXP_S });
    expect(getStoredSessionExpiryMs(`base64-${base64Url(raw)}`)).toBe(FUTURE_EXP_S * 1000);
  });

  it('returns null for malformed payloads', () => {
    expect(getStoredSessionExpiryMs('{')).toBeNull();
    expect(getStoredSessionExpiryMs('"just a string"')).toBeNull();
  });
});

describe('evaluateStoredSession', () => {
  it('reports none when no auth cookie exists', () => {
    expect(evaluateStoredSession('other=1', NOW_MS)).toEqual({ kind: 'none' });
  });

  it('reports valid for an unexpired session', () => {
    const header = `sb-ref-auth-token=${makeAuthHelpersCookieValue(FUTURE_EXP_S)}`;
    const status = evaluateStoredSession(header, NOW_MS);
    expect(status.kind).toBe('valid');
    if (status.kind === 'valid') {
      expect(status.expiresAtMs).toBe(FUTURE_EXP_S * 1000);
    }
  });

  it('reports stale for an expired session', () => {
    const header = `sb-ref-auth-token=${makeAuthHelpersCookieValue(PAST_EXP_S)}`;
    expect(evaluateStoredSession(header, NOW_MS)).toEqual({
      kind: 'stale',
      cookieNames: ['sb-ref-auth-token'],
    });
  });

  it('treats a session expiring within the skew window as stale', () => {
    const nearExpS = Math.floor((NOW_MS + SESSION_EXPIRY_SKEW_MS) / 1000) - 1;
    const header = `sb-ref-auth-token=${makeAuthHelpersCookieValue(nearExpS)}`;
    expect(evaluateStoredSession(header, NOW_MS).kind).toBe('stale');
  });

  it('reassembles chunked cookies before parsing', () => {
    const whole = makeAuthHelpersCookieValue(FUTURE_EXP_S);
    const mid = Math.floor(whole.length / 2);
    const header = [
      `sb-ref-auth-token.0=${whole.slice(0, mid)}`,
      `sb-ref-auth-token.1=${whole.slice(mid)}`,
    ].join('; ');
    expect(evaluateStoredSession(header, NOW_MS).kind).toBe('valid');
  });

  it('reports unparseable for unreadable auth cookies', () => {
    const header = 'sb-ref-auth-token=garbage';
    expect(evaluateStoredSession(header, NOW_MS)).toEqual({
      kind: 'unparseable',
      cookieNames: ['sb-ref-auth-token'],
    });
  });
});

describe('resolveLoginPageSession', () => {
  const validHeader = `sb-ref-auth-token=${makeAuthHelpersCookieValue(FUTURE_EXP_S)}`;
  const staleHeader = `sb-ref-auth-token=${makeAuthHelpersCookieValue(PAST_EXP_S)}`;

  it('stays with no cookies', () => {
    expect(
      resolveLoginPageSession({ cookieHeader: '', nowMs: NOW_MS, switchAccount: false }),
    ).toEqual({ action: 'stay', cookieNames: [] });
  });

  it('redirects for a valid session', () => {
    const result = resolveLoginPageSession({
      cookieHeader: validHeader,
      nowMs: NOW_MS,
      switchAccount: false,
    });
    expect(result.action).toBe('redirect');
  });

  it('clears a stale session instead of refreshing it', () => {
    expect(
      resolveLoginPageSession({ cookieHeader: staleHeader, nowMs: NOW_MS, switchAccount: false }),
    ).toEqual({ action: 'cleared', cookieNames: ['sb-ref-auth-token'] });
  });

  it('clears even a valid session when switching accounts', () => {
    expect(
      resolveLoginPageSession({ cookieHeader: validHeader, nowMs: NOW_MS, switchAccount: true }),
    ).toEqual({ action: 'cleared', cookieNames: ['sb-ref-auth-token'] });
  });

  it('stays and leaves unparseable cookies untouched', () => {
    expect(
      resolveLoginPageSession({
        cookieHeader: 'sb-ref-auth-token=garbage',
        nowMs: NOW_MS,
        switchAccount: false,
      }),
    ).toEqual({ action: 'stay', cookieNames: [] });
  });
});
