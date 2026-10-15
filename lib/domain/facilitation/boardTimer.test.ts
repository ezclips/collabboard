import { describe, expect, it } from 'vitest';

import {
  FINISHED_VISIBLE_MS,
  SUMMON_FRESH_MS,
  TIMER_PRESETS,
  betterClockSample,
  clockSample,
  clockSkewMs,
  formatTimer,
  isFreshSummon,
  isSummonTarget,
  timerSecondsError,
  timerState,
} from './boardTimer';

/** A fixed "server now" so every expectation is arithmetic, not a race. */
const NOW = Date.parse('2026-03-01T12:00:00.000Z');
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

describe('timerState', () => {
  it('is idle when the row carries nothing', () => {
    expect(timerState({}, NOW)).toEqual({ phase: 'idle', remainingSeconds: 0, durationSeconds: null });
    expect(timerState({ timer_ends_at: null, timer_paused_remaining_seconds: null }, NOW).phase).toBe('idle');
  });

  it('is running while the end is in the future, rounded UP', () => {
    expect(timerState({ timer_ends_at: at(300_000), timer_duration_seconds: 300 }, NOW)).toEqual({
      phase: 'running',
      remainingSeconds: 300,
      durationSeconds: 300,
    });
    // A few ms in: still 5:00, not 4:59.
    expect(timerState({ timer_ends_at: at(299_400), timer_duration_seconds: 300 }, NOW).remainingSeconds).toBe(300);
  });

  it('is paused whenever paused remaining is non-null, even with an end set', () => {
    expect(timerState({ timer_paused_remaining_seconds: 42, timer_ends_at: at(300_000) }, NOW)).toEqual({
      phase: 'paused',
      remainingSeconds: 42,
      durationSeconds: null,
    });
  });

  it('is finished for the 10 s after the end, then idle, with no write', () => {
    expect(timerState({ timer_ends_at: at(-1_000) }, NOW).phase).toBe('finished');
    expect(timerState({ timer_ends_at: at(-FINISHED_VISIBLE_MS) }, NOW).phase).toBe('finished');
    expect(timerState({ timer_ends_at: at(-FINISHED_VISIBLE_MS - 1) }, NOW).phase).toBe('idle');
  });

  it('is idle, not running, for an unparseable end', () => {
    expect(timerState({ timer_ends_at: 'not a date' }, NOW).phase).toBe('idle');
  });

  it('never shows more than the timer was set for', () => {
    // PATCH-374 Addendum 1. A skew estimate taken over a slow round trip is too
    // large by up to rtt/2 -- this is the live 184-on-a-180 defect.
    expect(timerState({ timer_ends_at: at(184_000), timer_duration_seconds: 180 }, NOW).remainingSeconds).toBe(180);
    expect(timerState({ timer_ends_at: at(180_000), timer_duration_seconds: 180 }, NOW).remainingSeconds).toBe(180);
    expect(timerState({ timer_ends_at: at(179_000), timer_duration_seconds: 180 }, NOW).remainingSeconds).toBe(179);
  });

  it('does not clamp a running timer whose duration the row does not carry', () => {
    expect(timerState({ timer_ends_at: at(240_000) }, NOW).remainingSeconds).toBe(240);
  });

  it('does not clamp the PAUSED value: adding time while paused is legitimate', () => {
    expect(timerState({ timer_paused_remaining_seconds: 240, timer_duration_seconds: 180 }, NOW).remainingSeconds).toBe(240);
  });

  it('reads the full remaining time once an add has bumped the duration', () => {
    // PATCH-374 Addendum 1. `board_timer_add` now extends the recorded LENGTH
    // too (20261015140000), so a running +1 min is no longer clamped back to
    // the old duration.
    expect(timerState({ timer_ends_at: at(240_000), timer_duration_seconds: 240 }, NOW).remainingSeconds).toBe(240);
    expect(timerState({ timer_paused_remaining_seconds: 240, timer_duration_seconds: 240 }, NOW).remainingSeconds).toBe(240);
    // A row whose duration still lags (written before that migration) is still
    // clamped -- the clamp itself is unchanged.
    expect(timerState({ timer_ends_at: at(240_000), timer_duration_seconds: 180 }, NOW).remainingSeconds).toBe(180);
  });
});

describe('formatTimer', () => {
  it('is m:ss below an hour and h:mm:ss from an hour up', () => {
    expect(formatTimer(0)).toBe('0:00');
    expect(formatTimer(9)).toBe('0:09');
    expect(formatTimer(59)).toBe('0:59');
    expect(formatTimer(60)).toBe('1:00');
    expect(formatTimer(90)).toBe('1:30');
    expect(formatTimer(300)).toBe('5:00');
    expect(formatTimer(3599)).toBe('59:59');
    expect(formatTimer(3600)).toBe('1:00:00');
    expect(formatTimer(3661)).toBe('1:01:01');
  });

  it('reads a negative or non-finite value as 0:00', () => {
    expect(formatTimer(-5)).toBe('0:00');
    expect(formatTimer(Number.NaN)).toBe('0:00');
  });
});

describe('clockSkewMs', () => {
  it('is the server reading minus the midpoint of our round trip', () => {
    // 1000 ms there, 1000 ms back, and the server ran 3000 ms ahead of us.
    const t0 = 1_000;
    const t1 = 3_000;
    const serverNow = 5_000; // our midpoint is 2000, so the server is 3000 ahead
    expect(clockSkewMs(t0, serverNow, t1)).toBe(3_000);
  });
});

describe('clockSample / betterClockSample', () => {
  it('records the round trip alongside the skew', () => {
    expect(clockSample(1_000, 5_000, 3_000)).toEqual({ skewMs: 3_000, rttMs: 2_000 });
  });

  it('shows how a slow round trip inflates the skew', () => {
    // The reply spends 5000 of a 5100 ms trip in flight: the midpoint estimate
    // is 2450 ms too large. A fast trip of 110 ms is off by only 45 ms.
    const slow = clockSample(0, 5_000, 5_100);
    const fast = clockSample(0, 100, 110);
    expect(slow).toEqual({ skewMs: 2_450, rttMs: 5_100 });
    expect(fast).toEqual({ skewMs: 45, rttMs: 110 });
  });

  it('keeps the reading with the SMALLER round trip', () => {
    const fast = clockSample(0, 1_100, 1_100);
    const slower = clockSample(0, 9_000, 12_000);

    expect(betterClockSample(null, fast)).toBe(fast);
    // A LATER slow reading never overrides the fast one...
    expect(betterClockSample(fast, slower)).toBe(fast);
    // ...and an even faster one does.
    const fastest = clockSample(0, 20, 40);
    expect(betterClockSample(fast, fastest)).toBe(fastest);
  });

  it('recovers the true skew from the best of three readings', () => {
    const readings = [
      clockSample(0, 5_000, 5_100), // boot-time reading: slow, off by +2450
      clockSample(0, 100, 110),     // fast, off by +45
      clockSample(0, 900, 1_000),   // slower again, off by +400
    ];
    const best = readings.reduce(
      (current, candidate) => betterClockSample(current, candidate),
      null as ReturnType<typeof clockSample> | null,
    );
    expect(best).toEqual({ skewMs: 45, rttMs: 110 });
  });
});

describe('isSummonTarget', () => {
  it('accepts a freeform view within the zoom range', () => {
    expect(isSummonTarget({ kind: 'freeform', x: -120.5, y: 40, zoom: 0.3 })).toBe(true);
    expect(isSummonTarget({ kind: 'freeform', x: 0, y: 0, zoom: 0.1 })).toBe(true);
    expect(isSummonTarget({ kind: 'freeform', x: 0, y: 0, zoom: 4 })).toBe(true);
  });

  it('refuses a freeform view that is out of range or not numeric', () => {
    expect(isSummonTarget({ kind: 'freeform', x: 0, y: 0, zoom: 0.05 })).toBe(false);
    expect(isSummonTarget({ kind: 'freeform', x: 0, y: 0, zoom: 4.1 })).toBe(false);
    expect(isSummonTarget({ kind: 'freeform', x: 0, y: 0 })).toBe(false);
    expect(isSummonTarget({ kind: 'freeform', x: '0', y: 0, zoom: 1 })).toBe(false);
    expect(isSummonTarget({ kind: 'freeform', x: 0, y: Number.NaN, zoom: 1 })).toBe(false);
  });

  it('accepts a post target only with a uuid-shaped id', () => {
    expect(isSummonTarget({ kind: 'post', postId: 'f1000000-0000-4000-8000-0000000000b1' })).toBe(true);
    expect(isSummonTarget({ kind: 'post', postId: 'nope' })).toBe(false);
    expect(isSummonTarget({ kind: 'post' })).toBe(false);
  });

  it('refuses anything that is not a known target object', () => {
    expect(isSummonTarget(null)).toBe(false);
    expect(isSummonTarget('freeform')).toBe(false);
    expect(isSummonTarget([{ kind: 'freeform' }])).toBe(false);
    expect(isSummonTarget({ kind: 'map' })).toBe(false);
    expect(isSummonTarget({})).toBe(false);
  });
});

describe('isFreshSummon', () => {
  it('is fresh inside the window and stale outside it', () => {
    expect(isFreshSummon(at(0), NOW)).toBe(true);
    expect(isFreshSummon(at(-SUMMON_FRESH_MS), NOW)).toBe(true);
    expect(isFreshSummon(at(-SUMMON_FRESH_MS - 1), NOW)).toBe(false);
  });

  it('tolerates a small negative age (the skew estimate is not exact)', () => {
    expect(isFreshSummon(at(500), NOW)).toBe(true);
    expect(isFreshSummon(at(60_000), NOW)).toBe(false);
  });

  it('is not fresh when there is nothing usable to read', () => {
    expect(isFreshSummon(null, NOW)).toBe(false);
    expect(isFreshSummon(undefined, NOW)).toBe(false);
    expect(isFreshSummon('not a date', NOW)).toBe(false);
  });
});

describe('timerSecondsError', () => {
  it('accepts the RPC range and rejects what the SQL would reject', () => {
    expect(timerSecondsError(60)).toBeNull();
    expect(timerSecondsError(10)).toBeNull();
    expect(timerSecondsError(7200)).toBeNull();
    expect(timerSecondsError(9)).toBe('Choose between 10 seconds and 2 hours');
    expect(timerSecondsError(7201)).toBe('Choose between 10 seconds and 2 hours');
    expect(timerSecondsError(90.5)).toBe('Enter a whole number of seconds');
    expect(timerSecondsError(Number.NaN)).toBe('Enter a whole number of seconds');
  });
});

describe('TIMER_PRESETS', () => {
  it('is 1, 3, 5 and 10 minutes', () => {
    expect(TIMER_PRESETS).toEqual([60, 180, 300, 600]);
  });
});
