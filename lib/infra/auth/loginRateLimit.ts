export const UNKNOWN_SUPABASE_LOGIN_RATE_LIMIT_MESSAGE =
  'Sign-in is temporarily rate-limited by Supabase. Please wait several minutes before trying again.';

export const LOCAL_LOGIN_SUBMISSION_GUARD_SECONDS = 5;

const normalizeRetryAfterSeconds = (seconds: number) =>
  Math.max(1, Math.ceil(seconds));

export const parseRetryAfterHeaderSeconds = (
  headerValue: string | null | undefined,
) => {
  if (!headerValue) {
    return null;
  }

  const numericSeconds = Number(headerValue);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return normalizeRetryAfterSeconds(numericSeconds);
  }

  const retryAt = Date.parse(headerValue);
  if (Number.isNaN(retryAt)) {
    return null;
  }

  return normalizeRetryAfterSeconds((retryAt - Date.now()) / 1000);
};

export type LoginRateLimitResponsePayload = {
  error?: unknown;
  retryAfterSeconds?: unknown;
  providerCooldownUnknown?: unknown;
};

export type ResolvedLoginRateLimit =
  | {
      blockSeconds: number;
      message: string;
      retryAfterSeconds: number;
      showCountdown: true;
    }
  | {
      blockSeconds: number;
      message: string;
      retryAfterSeconds: null;
      showCountdown: false;
    };

export const resolveLoginRateLimit = ({
  headerValue,
  payload,
  fallbackMessage,
  localGuardSeconds = LOCAL_LOGIN_SUBMISSION_GUARD_SECONDS,
}: {
  headerValue: string | null | undefined;
  payload: LoginRateLimitResponsePayload;
  fallbackMessage: string;
  localGuardSeconds?: number;
}): ResolvedLoginRateLimit => {
  const headerRetryAfterSeconds = parseRetryAfterHeaderSeconds(headerValue);
  const payloadRetryAfterSeconds =
    typeof payload.retryAfterSeconds === 'number' && payload.retryAfterSeconds > 0
      ? normalizeRetryAfterSeconds(payload.retryAfterSeconds)
      : null;
  const retryAfterSeconds = headerRetryAfterSeconds ?? payloadRetryAfterSeconds;

  if (retryAfterSeconds) {
    return {
      blockSeconds: retryAfterSeconds,
      message:
        typeof payload.error === 'string' && payload.error
          ? payload.error
          : fallbackMessage,
      retryAfterSeconds,
      showCountdown: true,
    };
  }

  if (payload.providerCooldownUnknown) {
    return {
      blockSeconds: normalizeRetryAfterSeconds(localGuardSeconds),
      message: UNKNOWN_SUPABASE_LOGIN_RATE_LIMIT_MESSAGE,
      retryAfterSeconds: null,
      showCountdown: false,
    };
  }

  return {
    blockSeconds: normalizeRetryAfterSeconds(localGuardSeconds),
    message:
      typeof payload.error === 'string' && payload.error
        ? payload.error
        : fallbackMessage,
    retryAfterSeconds: null,
    showCountdown: false,
  };
};
