'use client';

/**
 * PATCH-374. The facilitator kit's live session state: a shared countdown and
 * "Bring everyone here".
 *
 * The state is the `boards` row, so a late joiner sees a running timer and
 * nothing is lost on reconnect. Times come from the SERVER: `board_clock()` is
 * read once on mount to measure this tab's skew, and the RPCs answer with
 * `server_now`, so a host and a guest whose clocks disagree still read the same
 * countdown.
 *
 * ITS OWN CHANNEL, WITH A UNIQUE TOPIC (`useId`, the PATCH-373 lesson): a
 * subscription the server refuses kills the WHOLE channel it is on, so this must
 * never share `canvas-<id>` with the padlets subscription, and two instances for
 * one board must not share a topic (one of them would silently stop receiving).
 *
 * A summon is acted on only when it is a CHANGE this session saw, fresh on the
 * server clock, and sent by someone else -- so a late joiner never jumps and the
 * host is not thrown around by their own click.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { supabaseBrowser } from '@/lib/supabase/browser';
import {
  betterClockSample,
  clockSample,
  isFreshSummon,
  isSummonTarget,
  timerState,
  type BoardTimerRow,
  type ClockSample,
  type SummonTarget,
  type TimerState,
} from '@/lib/domain/facilitation/boardTimer';

/** The six facilitation columns, as a `boards` row carries them. */
export interface FacilitationRow extends BoardTimerRow {
  readonly summoned_at?: string | null;
  readonly summoned_by?: string | null;
  readonly summon_target?: unknown;
}

const FACILITATION_COLUMNS =
  'timer_ends_at, timer_duration_seconds, timer_paused_remaining_seconds, summoned_at, summoned_by, summon_target';

export interface UseBoardFacilitationParams {
  readonly boardId: string | null | undefined;
  /** The signed-in user; a summon they sent themselves is not acted on. */
  readonly currentUserId?: string | null;
  /** Called once per summon this session should act on. */
  readonly onSummon?: (target: SummonTarget) => void;
}

export interface UseBoardFacilitationResult {
  readonly timer: TimerState;
  /** The measured offset of this tab's clock from the server's, in ms. */
  readonly clockSkewMs: number;
  /** The round trip the winning measurement cost, in ms; null before one lands. */
  readonly clockRttMs: number | null;
  readonly start: (seconds: number) => Promise<void>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly add: (seconds: number) => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly summon: (target: SummonTarget) => Promise<void>;
}

export function useBoardFacilitation({
  boardId,
  currentUserId,
  onSummon,
}: UseBoardFacilitationParams): UseBoardFacilitationResult {
  const [row, setRow] = useState<FacilitationRow>({});
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [skewMs, setSkewMs] = useState(0);
  const [rttMs, setRttMs] = useState<number | null>(null);
  const instanceId = useId();

  // The best clock reading so far, by round trip. See `sampleClock`.
  const bestClockRef = useRef<ClockSample | null>(null);

  // Read through refs so the row handler and the actions stay stable.
  const onSummonRef = useRef(onSummon);
  useEffect(() => { onSummonRef.current = onSummon; }, [onSummon]);
  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  const skewRef = useRef(0);
  useEffect(() => { skewRef.current = skewMs; }, [skewMs]);

  // The `summoned_at` this session has already seen. `undefined` until the
  // FIRST row lands, so whatever was already on the board when this viewer
  // arrived is recorded, not acted on -- a late joiner never jumps.
  const seenSummonAtRef = useRef<string | null | undefined>(undefined);

  const serverNowMs = nowMs + skewMs;
  const timer = useMemo(() => timerState(row, serverNowMs), [row, serverNowMs]);

  /** Take a row and, if it carries a summon this session should act on, act. */
  const applyRow = useCallback((next: FacilitationRow) => {
    setRow(next);
    const summonedAt = next.summoned_at ?? null;
    const seen = seenSummonAtRef.current;
    seenSummonAtRef.current = summonedAt;
    if (seen === undefined || !summonedAt || summonedAt === seen) return;
    if (next.summoned_by && next.summoned_by === currentUserIdRef.current) return;
    if (!isFreshSummon(summonedAt, Date.now() + skewRef.current)) return;
    if (!isSummonTarget(next.summon_target)) return;
    onSummonRef.current?.(next.summon_target);
  }, []);

  /**
   * One `board_clock` reading, NTP style: measure the round trip, and keep the
   * skew only when it came from a FASTER trip than the best so far.
   *
   * A single reading taken while the page is booting is exactly how the live
   * run produced 184 s on a 180 s timer -- the reply spent most of a slow round
   * trip in flight, and the midpoint estimate is then too large by up to rtt/2.
   * Three readings (mount, ~2 s, ~10 s) plus this rule make that self-correcting.
   */
  const sampleClock = useCallback(async () => {
    const t0 = Date.now();
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase.rpc('board_clock');
      if (error) return;
      const t1 = Date.now();
      const first = (Array.isArray(data) ? data[0] : data) as { server_now?: string } | null;
      const serverNow = first?.server_now ? Date.parse(first.server_now) : Number.NaN;
      if (!Number.isFinite(serverNow)) return;

      const best = betterClockSample(bestClockRef.current, clockSample(t0, serverNow, t1));
      if (best === bestClockRef.current) return;
      bestClockRef.current = best;
      setSkewMs(best.skewMs);
      setRttMs(best.rttMs);
    } catch (error) {
      console.error('Error reading the board clock:', error);
    }
  }, []);

  const readRow = useCallback(async () => {
    if (!boardId) return;
    try {
      const supabase = supabaseBrowser();
      const { data, error } = await supabase
        .from('boards')
        .select(FACILITATION_COLUMNS)
        .eq('id', boardId)
        .maybeSingle();
      if (error) {
        console.error('Error reading the board timer:', error);
        return;
      }
      if (data) applyRow(data as FacilitationRow);
    } catch (error) {
      console.error('Error reading the board timer:', error);
    }
  }, [boardId, applyRow]);

  // Mount: read the row so the first render is correct, and take the clock
  // readings. Nothing waits on the clock -- a reading that lands late just
  // corrects the countdown.
  useEffect(() => {
    if (!boardId) return;
    let cancelled = false;
    seenSummonAtRef.current = undefined;
    bestClockRef.current = null;

    void sampleClock();
    const clockTimers = [2000, 10000].map((delay) => window.setTimeout(() => {
      if (!cancelled) void sampleClock();
    }, delay));

    void (async () => { if (!cancelled) await readRow(); })();

    return () => {
      cancelled = true;
      clockTimers.forEach((id) => window.clearTimeout(id));
    };
  }, [boardId, readRow, sampleClock]);

  // Live updates. Its OWN channel with a per-instance topic.
  useEffect(() => {
    if (!boardId) return;
    let cleanup: (() => void) | undefined;
    try {
      const supabase = supabaseBrowser();
      const channel = supabase
        .channel(`board-facilitation:${boardId}:${instanceId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'boards', filter: `id=eq.${boardId}` },
          (payload) => {
            if (payload.new) applyRow(payload.new as FacilitationRow);
          },
        )
        .subscribe();
      cleanup = () => { void supabase.removeChannel(channel); };
    } catch (error) {
      console.error('Error subscribing to board facilitation:', error);
      return;
    }
    return cleanup;
  }, [boardId, instanceId, applyRow]);

  // Tick only while there is something to count: a running countdown, or the
  // ten seconds "Time's up" is shown for before it reads as idle.
  useEffect(() => {
    if (timer.phase !== 'running' && timer.phase !== 'finished') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [timer.phase]);

  /**
   * One RPC. A failure is said ONCE and never retried; a success re-reads the
   * row so the caller's own view is right immediately rather than waiting for
   * the realtime echo.
   */
  const runRpc = useCallback(async (name: string, args: Record<string, unknown>, failure: string) => {
    if (!boardId) return;
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.rpc(name, args);
      if (error) {
        toast.error(failure);
        return;
      }
      setNowMs(Date.now());
      await readRow();
    } catch (error) {
      console.error('Board facilitation RPC failed:', error);
      toast.error(failure);
    }
  }, [boardId, readRow]);

  const start = useCallback((seconds: number) => (
    runRpc('board_timer_start', { b: boardId, seconds }, 'Could not start the timer')
  ), [boardId, runRpc]);
  const pause = useCallback(() => (
    runRpc('board_timer_pause', { b: boardId }, 'Could not pause the timer')
  ), [boardId, runRpc]);
  const resume = useCallback(() => (
    runRpc('board_timer_resume', { b: boardId }, 'Could not resume the timer')
  ), [boardId, runRpc]);
  const add = useCallback((seconds: number) => (
    runRpc('board_timer_add', { b: boardId, seconds }, 'Could not add time')
  ), [boardId, runRpc]);
  const stop = useCallback(() => (
    runRpc('board_timer_stop', { b: boardId }, 'Could not stop the timer')
  ), [boardId, runRpc]);
  const summon = useCallback((target: SummonTarget) => (
    runRpc('board_summon', { b: boardId, target }, 'Could not bring everyone here')
  ), [boardId, runRpc]);

  return { timer, clockSkewMs: skewMs, clockRttMs: rttMs, start, pause, resume, add, stop, summon };
}
