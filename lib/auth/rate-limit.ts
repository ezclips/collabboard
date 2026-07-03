import { createHash } from 'crypto';

export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_RATE_LIMIT_THRESHOLD = 5;
export const LOGIN_RATE_LIMIT_INITIAL_BACKOFF_MS = 30 * 1000;
export const LOGIN_RATE_LIMIT_MAX_BACKOFF_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
export const PASSWORD_RESET_RATE_LIMIT_THRESHOLD = 3;
export const PASSWORD_RESET_RATE_LIMIT_BACKOFF_MS = 10 * 60 * 1000;
export const SIGNUP_RATE_LIMIT_WINDOW_MS = 30 * 60 * 1000;
export const SIGNUP_RATE_LIMIT_THRESHOLD = 3;
export const SIGNUP_RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000;

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function hashRateLimitValue(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export function getRequestIp(headers: Headers) {
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim();
    if (first) return first;
  }

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  return 'unknown';
}

export function getLoginBackoffMs(failureCount: number) {
  if (failureCount < LOGIN_RATE_LIMIT_THRESHOLD) {
    return 0;
  }

  const multiplier = 2 ** (failureCount - LOGIN_RATE_LIMIT_THRESHOLD);
  return Math.min(LOGIN_RATE_LIMIT_INITIAL_BACKOFF_MS * multiplier, LOGIN_RATE_LIMIT_MAX_BACKOFF_MS);
}

export function getPasswordResetBackoffMs(failureCount: number) {
  if (failureCount < PASSWORD_RESET_RATE_LIMIT_THRESHOLD) {
    return 0;
  }

  return PASSWORD_RESET_RATE_LIMIT_BACKOFF_MS;
}

export function getSignupBackoffMs(failureCount: number) {
  if (failureCount < SIGNUP_RATE_LIMIT_THRESHOLD) {
    return 0;
  }

  return SIGNUP_RATE_LIMIT_BACKOFF_MS;
}
