export type LoginSubmissionRejection =
  | {
      accepted: false;
      reason: "pending";
      retryAfterSeconds: 0;
    }
  | {
      accepted: false;
      reason: "cooldown";
      retryAfterSeconds: number;
    };

export type LoginSubmissionAcceptance<T> = {
  accepted: true;
  value: T;
};

export type LoginSubmissionResult<T> =
  | LoginSubmissionAcceptance<T>
  | LoginSubmissionRejection;

const normalizeRetryAfterSeconds = (seconds: number) =>
  Math.max(1, Math.ceil(seconds));

export const parseRetryAfterSeconds = (
  headerValue: string | null | undefined,
  fallbackSeconds: number,
) => {
  const fallback = normalizeRetryAfterSeconds(fallbackSeconds);
  if (!headerValue) {
    return fallback;
  }

  const numericSeconds = Number(headerValue);
  if (Number.isFinite(numericSeconds) && numericSeconds > 0) {
    return normalizeRetryAfterSeconds(numericSeconds);
  }

  const retryAt = Date.parse(headerValue);
  if (Number.isNaN(retryAt)) {
    return fallback;
  }

  return normalizeRetryAfterSeconds((retryAt - Date.now()) / 1000);
};

export const createLoginSubmissionGate = ({
  now = () => Date.now(),
}: {
  now?: () => number;
} = {}) => {
  let pending = false;
  let cooldownUntil: number | null = null;

  const getRetryAfterSeconds = () => {
    if (!cooldownUntil) {
      return 0;
    }

    const remainingMs = cooldownUntil - now();
    if (remainingMs <= 0) {
      cooldownUntil = null;
      return 0;
    }

    return Math.ceil(remainingMs / 1000);
  };

  return {
    isPending: () => pending,
    getCooldownUntil: () => cooldownUntil,
    getRetryAfterSeconds,
    startCooldown: (retryAfterSeconds: number) => {
      cooldownUntil = now() + normalizeRetryAfterSeconds(retryAfterSeconds) * 1000;
    },
    clearCooldown: () => {
      cooldownUntil = null;
    },
    async submit<T>(run: () => Promise<T>): Promise<LoginSubmissionResult<T>> {
      if (pending) {
        return { accepted: false, reason: "pending", retryAfterSeconds: 0 };
      }

      const retryAfterSeconds = getRetryAfterSeconds();
      if (retryAfterSeconds > 0) {
        return { accepted: false, reason: "cooldown", retryAfterSeconds };
      }

      pending = true;
      try {
        return { accepted: true, value: await run() };
      } finally {
        pending = false;
      }
    },
  };
};
