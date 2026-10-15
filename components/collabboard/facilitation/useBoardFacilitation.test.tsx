// @vitest-environment jsdom
//
// PATCH-374 -- the facilitation hook. This drives the REAL hook against a fake
// client that records every channel it opens, every `postgres_changes`
// registration and every `rpc` call, so a regression that shares the padlets
// channel's topic, forgets the board filter, or acts on a summon it should
// ignore shows up as an actual recorded call or an actual state value.
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardFacilitation } from './useBoardFacilitation';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { SummonTarget } from '@/lib/domain/facilitation/boardTimer';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
const toastError = vi.fn();
vi.mock('sonner', () => ({ toast: { error: (m: string) => toastError(m) } }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';
const ME = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'bbbbbbbb-0000-4000-8000-000000000002';

/** The server's clock, and the fake we pretend is our own. */
const SERVER_NOW = Date.parse('2026-03-01T12:00:00.000Z');

type Registration = { config: Record<string, unknown>; handler: (payload: unknown) => void };
type FakeChannel = { topic: string; registrations: Registration[] };

let channels: FakeChannel[] = [];
let rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
/** The row the fake `boards` select resolves to. */
let boardRow: Record<string, unknown> = {};
/** When set, the next `rpc` resolves with this error. */
let rpcError: { message: string } | null = null;
/**
 * Per-`board_clock`-call plan: what the round trip costs, and the skew it
 * implies. Exhausted entries default to an instantaneous, perfectly-synced
 * reading, so a test that does not care about the clock sees skew 0.
 */
let clockPlan: Array<{ rttMs: number; skewMs: number }> = [];
let clockCalls = 0;

function installSupabase() {
  const client = {
    channel: (topic: string) => {
      const registrations: Registration[] = [];
      const channel: Record<string, unknown> = {};
      channel.on = (_event: string, config: Record<string, unknown>, handler: (payload: unknown) => void) => {
        registrations.push({ config: { ...config }, handler });
        return channel;
      };
      channel.subscribe = () => channel;
      channels.push({ topic, registrations });
      return channel;
    },
    removeChannel: () => {},
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (rpcError) return { data: null, error: rpcError };
      if (name === 'board_clock') {
        const plan = clockPlan[clockCalls] ?? { rttMs: 0, skewMs: 0 };
        clockCalls += 1;
        const t0 = Date.now();
        // The server answered at the MIDPOINT of a trip that cost `rttMs`, so
        // `clockSample` recovers exactly `skewMs`. A LONGER trip makes the same
        // midpoint assumption worse -- which is what the min-RTT rule is for.
        const serverNow = t0 + plan.rttMs / 2 + plan.skewMs;
        vi.setSystemTime(t0 + plan.rttMs);
        return { data: [{ server_now: new Date(serverNow).toISOString() }], error: null };
      }
      return { data: [{ server_now: new Date(SERVER_NOW).toISOString() }], error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: boardRow, error: null }) }),
      }),
    }),
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
}

let mounted: ReturnType<typeof render> | null = null;
let api: ReturnType<typeof useBoardFacilitation> | null = null;
let summoned: SummonTarget[] = [];

function Harness({ boardId, currentUserId }: { boardId: string; currentUserId: string }) {
  const facilitation = useBoardFacilitation({
    boardId,
    currentUserId,
    onSummon: (target) => { summoned.push(target); },
  });
  api = facilitation;
  return (
    <div data-testid="probe">
      {JSON.stringify({
        phase: facilitation.timer.phase,
        remaining: facilitation.timer.remainingSeconds,
        duration: facilitation.timer.durationSeconds,
      })}
    </div>
  );
}

const probe = () => JSON.parse(screen.getByTestId('probe').textContent ?? '{}');

async function mount(currentUserId = ME) {
  await act(async () => {
    mounted = render(<Harness boardId={BOARD} currentUserId={currentUserId} />);
    await flush();
  });
}

async function flush() {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
}

/** The one registration the hook made for a `boards` UPDATE. */
function registration(): Registration {
  const found = channels.flatMap((c) => c.registrations).find((entry) => entry.config.table === 'boards');
  if (!found) throw new Error('no boards registration');
  return found;
}

/** Deliver a `boards` UPDATE to the handler the hook registered. */
async function deliver(next: Record<string, unknown>) {
  await act(async () => {
    registration().handler({ eventType: 'UPDATE', new: { id: BOARD, ...next }, old: {} });
    await flush();
  });
}

const rowAt = (offsetMs: number) => new Date(SERVER_NOW + offsetMs).toISOString();

beforeEach(() => {
  channels = [];
  rpcCalls = [];
  summoned = [];
  boardRow = {};
  rpcError = null;
  clockPlan = [];
  clockCalls = 0;
  installSupabase();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.useFakeTimers();
  // Our clock: the fake server's time, unless a test moves it.
  vi.setSystemTime(SERVER_NOW);
});

afterEach(() => {
  if (mounted) act(() => { mounted!.unmount(); });
  cleanup();
  mounted = null;
  api = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// == A. its own channel ===========================================

describe('A. its own channel', () => {
  it('opens one channel whose topic is unique and NOT the padlets channel topic', async () => {
    await mount();

    expect(channels).toHaveLength(1);
    expect(channels[0].topic).not.toBe(`canvas-${BOARD}`);
    expect(channels[0].topic.startsWith('board-facilitation:')).toBe(true);
    expect(channels[0].topic).toContain(BOARD);
  });

  it('subscribes to boards UPDATE for this board only', async () => {
    await mount();

    expect(channels[0].registrations).toHaveLength(1);
    expect(registration().config).toEqual({
      event: 'UPDATE',
      schema: 'public',
      table: 'boards',
      filter: `id=eq.${BOARD}`,
    });
  });
});

// == B. mount =====================================================

describe('B. mount', () => {
  it('reads board_clock once and reads the row so the first render is correct', async () => {
    boardRow = { timer_ends_at: rowAt(300_000), timer_duration_seconds: 300 };
    await mount();

    expect(rpcCalls.map((c) => c.name)).toEqual(['board_clock']);
    expect(probe()).toEqual({ phase: 'running', remaining: 300, duration: 300 });
  });

  it('is idle for a board with no timer', async () => {
    await mount();
    expect(probe()).toEqual({ phase: 'idle', remaining: 0, duration: null });
  });
});

// == C. summon ====================================================

describe('C. summon', () => {
  it('does NOT fire for a summon already on the board when this session starts', async () => {
    boardRow = {
      summoned_at: rowAt(0),
      summoned_by: OTHER,
      summon_target: { kind: 'post', postId: 'cccccccc-0000-4000-8000-000000000003' },
    };
    await mount();
    expect(summoned).toEqual([]);
  });

  it('fires once for a fresh summon from someone else, and not again for the same one', async () => {
    await mount();
    const target = { kind: 'post', postId: 'cccccccc-0000-4000-8000-000000000003' };
    await deliver({ summoned_at: rowAt(0), summoned_by: OTHER, summon_target: target });
    expect(summoned).toEqual([target]);

    // The same summoned_at arriving again is not a new summon.
    await deliver({ summoned_at: rowAt(0), summoned_by: OTHER, summon_target: target });
    expect(summoned).toHaveLength(1);
  });

  it('does not fire for a summon the current user sent', async () => {
    await mount(ME);
    await deliver({
      summoned_at: rowAt(0),
      summoned_by: ME,
      summon_target: { kind: 'post', postId: 'cccccccc-0000-4000-8000-000000000003' },
    });
    expect(summoned).toEqual([]);
  });

  it('does not fire for a stale summon (older than the fresh window)', async () => {
    await mount();
    await deliver({
      summoned_at: rowAt(-20_000),
      summoned_by: OTHER,
      summon_target: { kind: 'post', postId: 'cccccccc-0000-4000-8000-000000000003' },
    });
    expect(summoned).toEqual([]);
  });

  it('does not fire for a malformed target', async () => {
    await mount();
    await deliver({ summoned_at: rowAt(0), summoned_by: OTHER, summon_target: { kind: 'post', postId: 'nope' } });
    expect(summoned).toEqual([]);
  });

  it('fires a fresh freeform summon', async () => {
    await mount();
    const target = { kind: 'freeform', x: 120, y: -40, zoom: 0.5 } as const;
    await deliver({ summoned_at: rowAt(-1_000), summoned_by: OTHER, summon_target: target });
    expect(summoned).toEqual([target]);
  });
});

// == D. actions ===================================================

describe('D. actions call the right RPC with the right args', () => {
  it('maps each action to its RPC', async () => {
    await mount();
    rpcCalls = [];

    await act(async () => { await api!.start(180); });
    await act(async () => { await api!.pause(); });
    await act(async () => { await api!.resume(); });
    await act(async () => { await api!.add(60); });
    await act(async () => { await api!.stop(); });
    await act(async () => { await api!.summon({ kind: 'freeform', x: 1, y: 2, zoom: 1 }); });

    expect(rpcCalls).toEqual([
      { name: 'board_timer_start', args: { b: BOARD, seconds: 180 } },
      { name: 'board_timer_pause', args: { b: BOARD } },
      { name: 'board_timer_resume', args: { b: BOARD } },
      { name: 'board_timer_add', args: { b: BOARD, seconds: 60 } },
      { name: 'board_timer_stop', args: { b: BOARD } },
      { name: 'board_summon', args: { b: BOARD, target: { kind: 'freeform', x: 1, y: 2, zoom: 1 } } },
    ]);
  });

  it('says a failure once and never retries', async () => {
    await mount();
    rpcCalls = [];
    rpcError = { message: 'not allowed' };

    await act(async () => { await api!.start(60); });

    expect(rpcCalls).toHaveLength(1);
    expect(toastError).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith('Could not start the timer');
  });
});

// == E. skew and ticking ==========================================

describe('E. the server clock', () => {
  it('reads the countdown against the server clock, not this tab clock', async () => {
    // This tab's clock is a minute BEHIND the server's. Without the skew the
    // countdown would read a minute long.
    vi.setSystemTime(SERVER_NOW - 60_000);
    clockPlan = [{ rttMs: 50, skewMs: 60_000 }];
    boardRow = { timer_ends_at: rowAt(300_000), timer_duration_seconds: 300 };
    await mount();
    expect(api!.clockSkewMs).toBe(60_000);
    expect(probe().remaining).toBe(300);
  });

  it('takes three readings: on mount, ~2 s later and ~10 s later', async () => {
    await mount();
    expect(rpcCalls.filter((call) => call.name === 'board_clock')).toHaveLength(1);

    await act(async () => { vi.advanceTimersByTime(2_000); await flush(); });
    expect(rpcCalls.filter((call) => call.name === 'board_clock')).toHaveLength(2);

    await act(async () => { vi.advanceTimersByTime(8_000); await flush(); });
    expect(rpcCalls.filter((call) => call.name === 'board_clock')).toHaveLength(3);
  });

  it('keeps the skew from the FASTEST round trip, and a later slow one cannot undo it', async () => {
    // Addendum 1. The live defect: the guest measured once, during page boot,
    // over a slow trip -- 184 s appeared on a 180 s timer.
    clockPlan = [
      { rttMs: 5_100, skewMs: 2_450 }, // the boot-time reading: slow and wildly off
      { rttMs: 110, skewMs: 45 },      // a fast one
      { rttMs: 900, skewMs: 500 },     // slower again
    ];
    await mount();
    expect(api!.clockSkewMs).toBe(2_450);
    expect(api!.clockRttMs).toBe(5_100);

    await act(async () => { vi.advanceTimersByTime(2_000); await flush(); });
    expect(api!.clockSkewMs).toBe(45);
    expect(api!.clockRttMs).toBe(110);

    await act(async () => { vi.advanceTimersByTime(8_000); await flush(); });
    expect(api!.clockSkewMs).toBe(45);
    expect(api!.clockRttMs).toBe(110);
  });

  it('does not tick while idle', async () => {
    await mount();
    expect(probe().phase).toBe('idle');
    await act(async () => { vi.advanceTimersByTime(5_000); });
    expect(probe()).toEqual({ phase: 'idle', remaining: 0, duration: null });
  });

  it('counts down while running and reaches finished', async () => {
    boardRow = { timer_ends_at: rowAt(3_000), timer_duration_seconds: 3 };
    await mount();
    expect(probe().phase).toBe('running');

    await act(async () => { vi.advanceTimersByTime(3_500); });
    expect(probe().phase).toBe('finished');

    // "Time's up" is local and short: after the window it reads idle again,
    // with no write.
    await act(async () => { vi.advanceTimersByTime(11_000); });
    expect(probe().phase).toBe('idle');
  });
});
