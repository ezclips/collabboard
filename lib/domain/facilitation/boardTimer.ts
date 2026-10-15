/**
 * PATCH-374. The facilitator timer's pure rules.
 *
 * The state lives on the `boards` row and every time comes from the SERVER
 * clock, so this module never reads a clock itself: the caller passes
 * `serverNowMs` (its own `Date.now()` corrected by {@link clockSkewMs}). That is
 * what makes the same countdown readable by a host and a guest whose clocks
 * disagree, and it is why every function here is trivially testable.
 *
 * The row is never cleared when a countdown ends, so `finished` is a LOCAL,
 * short-lived phase: the last {@link FINISHED_VISIBLE_MS} after the end reads as
 * `finished` ("Time's up") and then as `idle` without any write.
 */

export interface BoardTimerRow {
  readonly timer_ends_at?: string | null;
  readonly timer_duration_seconds?: number | null;
  readonly timer_paused_remaining_seconds?: number | null;
}

export type TimerPhase = 'idle' | 'running' | 'paused' | 'finished';

export interface TimerState {
  readonly phase: TimerPhase;
  /** Whole seconds left, rounded UP while running so a start shows its full value. */
  readonly remainingSeconds: number;
  readonly durationSeconds: number | null;
}

/** 1, 3, 5 and 10 minutes. */
export const TIMER_PRESETS: readonly number[] = [60, 180, 300, 600];

/** How long "Time's up" stays up after the countdown ends. */
export const FINISHED_VISIBLE_MS = 10_000;

/** The last stretch of a countdown, drawn red and pulsing. */
export const TIMER_URGENT_SECONDS = 10;

/**
 * A summon older than this is not acted on: it belongs to a session this viewer
 * joined after, and a late joiner must never jump.
 */
export const SUMMON_FRESH_MS = 15_000;

const numberOf = (value: unknown): number | null => (
  typeof value === 'number' && Number.isFinite(value) ? value : null
);

/** The countdown as this viewer should read it right now. */
export function timerState(row: BoardTimerRow, serverNowMs: number): TimerState {
  const durationSeconds = numberOf(row.timer_duration_seconds);
  const pausedSeconds = numberOf(row.timer_paused_remaining_seconds);

  // Non-null paused remaining IS the paused state.
  if (pausedSeconds !== null) {
    return { phase: 'paused', remainingSeconds: Math.max(0, Math.round(pausedSeconds)), durationSeconds };
  }

  const endsAtMs = row.timer_ends_at ? Date.parse(row.timer_ends_at) : Number.NaN;
  if (Number.isFinite(endsAtMs)) {
    const remainingMs = endsAtMs - serverNowMs;
    if (remainingMs > 0) {
      const remaining = Math.ceil(remainingMs / 1000);
      // PATCH-374 Addendum 1. Never more than the timer was SET for. A skew
      // estimate taken over a slow round trip is wrong by up to rtt/2, which is
      // exactly how a 180 s timer read 184 s in the live run.
      return {
        phase: 'running',
        remainingSeconds: durationSeconds !== null ? Math.min(remaining, durationSeconds) : remaining,
        durationSeconds,
      };
    }
    if (-remainingMs <= FINISHED_VISIBLE_MS) {
      return { phase: 'finished', remainingSeconds: 0, durationSeconds };
    }
  }

  return { phase: 'idle', remainingSeconds: 0, durationSeconds };
}

/** `m:ss`, or `h:mm:ss` from an hour up. Negative and non-finite read as 0:00. */
export function formatTimer(totalSeconds: number): string {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const ss = String(seconds).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${ss}`;
  }
  return `${minutes}:${ss}`;
}

/**
 * Our clock's offset from the server's, in ms: the server's reading minus the
 * midpoint of our own round trip (`t0` sent, `t1` received). Add it to
 * `Date.now()` to get `serverNowMs`.
 */
export function clockSkewMs(t0: number, serverNow: number, t1: number): number {
  return serverNow - (t0 + t1) / 2;
}

/** One clock reading: our offset from the server, and what the round trip cost. */
export interface ClockSample {
  readonly skewMs: number;
  readonly rttMs: number;
}

/** Read the clock NTP-style: `t0` sent, the server answered `serverNow`, `t1` received. */
export function clockSample(t0: number, serverNow: number, t1: number): ClockSample {
  return { skewMs: clockSkewMs(t0, serverNow, t1), rttMs: t1 - t0 };
}

/**
 * The better of two readings: the one with the SMALLER round trip.
 *
 * The skew a reading implies is only correct if the reply took half the round
 * trip to come back; if it took most of it, the estimate is too large by up to
 * rtt/2. So a fast reading always wins, and a later slow one can never undo an
 * earlier good one. (The live defect: the guest's ONE reading was taken during
 * page boot, and 184 s appeared on a 180 s timer.)
 */
export function betterClockSample(current: ClockSample | null, candidate: ClockSample): ClockSample {
  if (!current) return candidate;
  return candidate.rttMs < current.rttMs ? candidate : current;
}

/**
 * A validated summon target, mirroring `public.board_summon`'s validation
 * exactly (the SQL is the boundary; this is what keeps a bad target from being
 * sent, and what keeps a malformed row from being acted on).
 */
export type SummonTarget =
  | { readonly kind: 'freeform'; readonly x: number; readonly y: number; readonly zoom: number }
  | { readonly kind: 'post'; readonly postId: string };

const UUID_SHAPE = /^[0-9a-fA-F-]{36}$/;

export function isSummonTarget(value: unknown): value is SummonTarget {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const target = value as Record<string, unknown>;
  if (target.kind === 'freeform') {
    const x = numberOf(target.x);
    const y = numberOf(target.y);
    const zoom = numberOf(target.zoom);
    return x !== null && y !== null && zoom !== null && zoom >= 0.1 && zoom <= 4;
  }
  if (target.kind === 'post') {
    return typeof target.postId === 'string' && UUID_SHAPE.test(target.postId);
  }
  return false;
}

/**
 * True when a summon was called within the fresh window of `serverNowMs`. A
 * little negative slack is allowed: `serverNowMs` is an ESTIMATE (skew measured
 * over one round trip), so an immediate summon can read a few ms in the future.
 */
export function isFreshSummon(
  summonedAt: string | null | undefined,
  serverNowMs: number,
  windowMs: number = SUMMON_FRESH_MS,
): boolean {
  if (!summonedAt) return false;
  const atMs = Date.parse(summonedAt);
  if (!Number.isFinite(atMs)) return false;
  const ageMs = serverNowMs - atMs;
  return ageMs >= -1000 && ageMs <= windowMs;
}

/** A validation message for a start/add length in seconds, or null when it is fine. */
export function timerSecondsError(seconds: number): string | null {
  if (!Number.isFinite(seconds) || !Number.isInteger(seconds)) return 'Enter a whole number of seconds';
  if (seconds < 10 || seconds > 7200) return 'Choose between 10 seconds and 2 hours';
  return null;
}
