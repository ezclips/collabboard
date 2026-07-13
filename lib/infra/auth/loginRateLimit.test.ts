import { describe, expect, it } from 'vitest';

import {
  LOCAL_LOGIN_SUBMISSION_GUARD_SECONDS,
  resolveLoginRateLimit,
  UNKNOWN_SUPABASE_LOGIN_RATE_LIMIT_MESSAGE,
} from './loginRateLimit';

describe('resolveLoginRateLimit', () => {
  it('real Retry-After produces a countdown', () => {
    expect(
      resolveLoginRateLimit({
        headerValue: '120',
        payload: {
          error: 'Sign-in is temporarily rate-limited by Supabase. Try again in a few minutes.',
        },
        fallbackMessage: 'fallback',
      }),
    ).toEqual({
      blockSeconds: 120,
      message: 'Sign-in is temporarily rate-limited by Supabase. Try again in a few minutes.',
      retryAfterSeconds: 120,
      showCountdown: true,
    });
  });

  it('missing Retry-After produces unknown-cooldown messaging', () => {
    expect(
      resolveLoginRateLimit({
        headerValue: null,
        payload: {
          error: 'Request rate limit reached',
          providerCooldownUnknown: true,
        },
        fallbackMessage: 'fallback',
      }),
    ).toEqual({
      blockSeconds: LOCAL_LOGIN_SUBMISSION_GUARD_SECONDS,
      message: UNKNOWN_SUPABASE_LOGIN_RATE_LIMIT_MESSAGE,
      retryAfterSeconds: null,
      showCountdown: false,
    });
  });
});
