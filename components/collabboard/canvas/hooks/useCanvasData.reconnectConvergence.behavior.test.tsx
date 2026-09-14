// @vitest-environment jsdom
//
// CANVAS_REALTIME_RECONNECT_CONVERGENCE_1 -- F4.
//
// A Supabase Realtime channel that drops and rejoins delivers a SECOND
// SUBSCRIBED status on the SAME channel subscription. Before this fix
// nothing listened to that status at all, so a stale client could sit
// indefinitely out of sync after a reconnect. This suite drives the REAL
// hook, mounted, and invokes the REAL status callback captured off the
// mocked channel's .subscribe(status => ...) -- never the extracted
// reconnect logic directly. It also exercises the request-generation guard
// fetchData now carries, since a reconnect reconciliation is just another
// fetchData call that can race a board switch or another fetchData call.
import React from 'react';
import { act, cleanup, render, screen, type RenderResult } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCanvasData } from './useCanvasData';
import { supabaseBrowser } from '@/lib/supabase/browser';
import { generateAndSaveThumbnail, updateLastVisited } from '@/lib/collabboard/thumbnailGenerator';
import type { CanvasAction } from '../store/actions';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));
vi.mock('@/lib/collabboard/thumbnailGenerator', () => ({
  generateAndSaveThumbnail: vi.fn(),
  updateLastVisited: vi.fn(),
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = 'a1000000-0000-4000-8000-0000000000b1';
const B = 'b1000000-0000-4000-8000-0000000000b2';

type ReadReply<T> = { data: T; error: { message: string } | null };
const okReply = <T,>(data: T): ReadReply<T> => ({ data, error: null });
const failReply = <T,>(): ReadReply<T | null> => ({ data: null, error: { message: 'read failed' } });

const row = (boardId: string, suffix: string) => ({
  id: `${boardId}-${suffix}`,
  board_id: boardId,
  type: 'card',
  title: 'T',
  content: '',
  position_x: 0,
  position_y: 0,
  width: 200,
  height: 150,
  metadata: {},
});

type StatusHandler = (status: string) => void;
type RealtimeHandler = (payload: unknown) => void;
type Writes = Array<{ table: string; op: 'insert' | 'update' }>;
type PadletsCall = { boardId: string; resolve: (r: ReadReply<unknown>) => void };

/**
 * The ONE client every read (and any reintroduced write) goes through.
 * Every padlets read for board_id=X is recorded in `padletsCalls`, in call
 * order, and stays pending until resolved -- via `instantPadlets[boardId]`
 * (resolved the instant the call is made) or `resolvePadletsCall(index, r)`
 * (resolved on command, in whatever order the test chooses). This is what
 * lets a test hold two overlapping requests -- same board or different --
 * open at once and resolve them out of order.
 */
function installSupabase(writes: Writes, padletsCalls: PadletsCall[], opts: { instantPadlets?: Record<string, ReadReply<unknown>> } = {}) {
  const channels = new Map<string, { realtime: RealtimeHandler | null; status: StatusHandler | null }>();

  const client = {
    channel: (name: string) => {
      const rec = { realtime: null as RealtimeHandler | null, status: null as StatusHandler | null };
      channels.set(name, rec);
      const ch = {
        on: (_event: string, _cfg: unknown, handler: RealtimeHandler) => { rec.realtime = handler; return ch; },
        subscribe: (statusCb?: StatusHandler) => { rec.status = statusCb ?? null; return ch; },
      };
      return ch;
    },
    removeChannel: () => {},
    from(table: string) {
      return {
        select: () => ({
          eq: (_col: string, boardId: string) => {
            if (table === 'boards') return { maybeSingle: async () => ({ data: { id: boardId, layout: 'freeform' }, error: null }) };
            if (table === 'canvas_lines' || table === 'board_sections') {
              return { then: (resolve: (r: unknown) => void) => resolve(okReply([])) };
            }
            let resolveCall!: (r: ReadReply<unknown>) => void;
            const promise = new Promise<ReadReply<unknown>>((res) => { resolveCall = res; });
            padletsCalls.push({ boardId, resolve: resolveCall });
            // Consumed once: only the FIRST read for a given board auto-resolves.
            // A later read for the same board (a reconcile, an overlapping
            // fetchData call) stays pending by default so the test controls it.
            const instant = opts.instantPadlets?.[boardId];
            if (instant) { delete opts.instantPadlets![boardId]; resolveCall(instant); }
            return { then: (resolve: (r: unknown) => void) => promise.then(resolve) };
          },
        }),
        insert() { writes.push({ table, op: 'insert' }); return { select: () => ({ single: async () => ({ data: null, error: null }), then: (r: (x: unknown) => void) => r({ data: [], error: null }) }) }; },
        update() { writes.push({ table, op: 'update' }); return { eq: async () => ({ data: null, error: null }) }; },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
  return {
    resolvePadletsCall: (index: number, reply: ReadReply<unknown>) => padletsCalls[index].resolve(reply),
    getStatusHandler: (boardId: string) => channels.get(`canvas-${boardId}`)?.status ?? null,
  };
}

type Api = ReturnType<typeof useCanvasData>;
let api: Api | null = null;

function Harness({ canvasId }: { canvasId: string }) {
  const dispatch: React.Dispatch<CanvasAction> = () => {};
  const data = useCanvasData({ canvasId, dispatch });
  api = data;
  return (
    <div data-testid="probe">
      {JSON.stringify({
        padletIds: data.padlets.map((p) => p.id),
        loading: data.loading,
        error: data.error,
      })}
    </div>
  );
}

let current: RenderResult | null = null;
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

async function mount(canvasId: string) {
  await act(async () => { current = render(<Harness canvasId={canvasId} />); await flush(); });
  return current!;
}
async function switchTo(canvasId: string) {
  await act(async () => { current!.rerender(<Harness canvasId={canvasId} />); await flush(); });
}
async function unmountCurrent() {
  await act(async () => { current!.unmount(); });
}
function probe() {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as { padletIds: string[]; loading: boolean; error: string | null };
}
const thumb = () => vi.mocked(generateAndSaveThumbnail);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (current) { act(() => { current!.unmount(); }); }
  cleanup();
  current = null;
  api = null;
  vi.restoreAllMocks();
});

// == A. initial fetch + first SUBSCRIBED ================================

describe('A. the initial load and the channel\'s first SUBSCRIBED', () => {
  it('the first SUBSCRIBED on a fresh subscription triggers no extra fetch', async () => {
    const calls: PadletsCall[] = [];
    const { getStatusHandler } = installSupabase([], calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    expect(calls.length, 'one read from the initial fetchData(true)').toBe(1);

    await act(async () => { getStatusHandler(A)!('SUBSCRIBED'); await flush(); });

    expect(calls.length, 'the first SUBSCRIBED is the initial join, not a reconnect').toBe(1);
  });
});

// == B. error/rejoin triggers exactly one new fetch ======================

describe('B. a channel error followed by rejoin', () => {
  it('triggers exactly one new fetchData reconciliation', async () => {
    const calls: PadletsCall[] = [];
    const { getStatusHandler, resolvePadletsCall } = installSupabase([], calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    const status = getStatusHandler(A)!;

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // initial join
    await act(async () => { status('CHANNEL_ERROR'); await flush(); }); // disconnected -- no fetch
    expect(calls.length).toBe(1);

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // rejoin
    expect(calls.length, 'exactly one new fetch for the rejoin').toBe(2);

    resolvePadletsCall(1, okReply([row(A, 'p1'), row(A, 'p2')]));
    await act(async () => { await flush(); });
    expect(probe().padletIds).toEqual([`${A}-p1`, `${A}-p2`]);
  });
});

// == C. duplicate rejoin notifications coalesce ==========================

describe('C. duplicate SUBSCRIBED notifications while a reconcile is pending', () => {
  it('remain coalesced into the one already in flight', async () => {
    const calls: PadletsCall[] = [];
    const { getStatusHandler } = installSupabase([], calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    const status = getStatusHandler(A)!;

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // join
    await act(async () => { status('SUBSCRIBED'); await flush(); }); // rejoin -- fetch #2, left pending
    expect(calls.length).toBe(2);

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // duplicate while #2 is still pending
    expect(calls.length, 'no third call while the reconcile is still in flight').toBe(2);
  });
});

// == D. a later, genuinely new reconnect after completion ================

describe('D. a later reconnect after the previous reconciliation completed', () => {
  it('may trigger another refetch', async () => {
    const calls: PadletsCall[] = [];
    const { getStatusHandler, resolvePadletsCall } = installSupabase([], calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    const status = getStatusHandler(A)!;

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // join
    await act(async () => { status('SUBSCRIBED'); await flush(); }); // rejoin #1
    expect(calls.length).toBe(2);
    await act(async () => { resolvePadletsCall(1, okReply([row(A, 'p1')])); await flush(); });

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // a genuinely new reconnect
    expect(calls.length, 'the completed reconcile freed the coalescing gate').toBe(3);
  });
});

// == E. cleanup prevents late status callbacks from fetching ============

describe('E. after cleanup/unsubscribe', () => {
  it('a late status callback firing anyway triggers no fetch', async () => {
    const calls: PadletsCall[] = [];
    const { getStatusHandler } = installSupabase([], calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    const status = getStatusHandler(A)!;
    await act(async () => { status('SUBSCRIBED'); await flush(); }); // join
    expect(calls.length).toBe(1);

    await unmountCurrent();

    await act(async () => { status('SUBSCRIBED'); await flush(); }); // a late, queued callback
    expect(calls.length, 'cleanup already ran -- this callback must not fetch').toBe(1);
  });
});

// == F. A -> B: a late A completion cannot overwrite B's state ==========

describe('F. board A -> B, with A\'s own fetch completing late', () => {
  it('A\'s late data never overwrites B\'s already-applied state', async () => {
    const calls: PadletsCall[] = [];
    const { resolvePadletsCall } = installSupabase([], calls, {});
    await mount(A); // calls[0]: A, pending
    await switchTo(B); // calls[1]: B, pending

    await act(async () => { resolvePadletsCall(1, okReply([row(B, 'p1')])); await flush(); });
    expect(probe().padletIds).toEqual([`${B}-p1`]);

    await act(async () => { resolvePadletsCall(0, okReply([row(A, 'p1'), row(A, 'p2')])); await flush(); }); // A, late
    expect(probe().padletIds, 'A\'s late rows never replace B\'s state').toEqual([`${B}-p1`]);
  });
});

// == G. same-board overlapping requests: only the newest applies ========

describe('G. two overlapping requests for the SAME board', () => {
  it('only the newest completion is ever applied', async () => {
    const calls: PadletsCall[] = [];
    const { resolvePadletsCall } = installSupabase([], calls, {});
    await mount(A); // calls[0]: A, pending (the initial load)
    await act(async () => { api!.fetchData(); await flush(); }); // calls[1]: A, pending (a second, newer request)
    expect(calls.length).toBe(2);

    await act(async () => { resolvePadletsCall(1, okReply([row(A, 'newest')])); await flush(); });
    expect(probe().padletIds).toEqual([`${A}-newest`]);

    await act(async () => { resolvePadletsCall(0, okReply([row(A, 'stale-1'), row(A, 'stale-2')])); await flush(); });
    expect(probe().padletIds, 'the older same-board completion is discarded').toEqual([`${A}-newest`]);
  });
});

// == H. a stale request cannot clear loading or publish an error ========

describe('H. a stale request completing after a newer one is still pending', () => {
  it('cannot clear loading or publish an error for the current request', async () => {
    const calls: PadletsCall[] = [];
    const { resolvePadletsCall } = installSupabase([], calls, {});
    await mount(A); // calls[0], showLoading=true, pending
    expect(probe().loading).toBe(true);
    await act(async () => { api!.fetchData(true); await flush(); }); // calls[1], showLoading=true, pending
    expect(calls.length).toBe(2);

    await act(async () => { resolvePadletsCall(0, failReply()); await flush(); }); // stale failure
    expect(probe().loading, 'a stale failure must not clear loading for the current request').toBe(true);
    expect(probe().error, 'a stale failure must not publish an error over the current request').toBeNull();

    await act(async () => { resolvePadletsCall(1, okReply([row(A, 'p1')])); await flush(); }); // the current request succeeds
    expect(probe().loading).toBe(false);
    expect(probe().error).toBeNull();
    expect(probe().padletIds).toEqual([`${A}-p1`]);
  });
});

// == I. reconnect reconciliation is backend-read-only ====================

describe('I. reconnect reconciliation makes zero backend writes', () => {
  it('a join, an error, and a rejoin reconciliation produce zero inserts/updates of any kind', async () => {
    const writes: Writes = [];
    const calls: PadletsCall[] = [];
    const { getStatusHandler, resolvePadletsCall } = installSupabase(writes, calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    const status = getStatusHandler(A)!;
    await act(async () => { status('SUBSCRIBED'); await flush(); });
    await act(async () => { status('CHANNEL_ERROR'); await flush(); });
    await act(async () => { status('SUBSCRIBED'); await flush(); }); // rejoin reconcile
    await act(async () => { resolvePadletsCall(1, okReply([row(A, 'p1')])); await flush(); });

    expect(writes, 'no create/update/RPC/storage request of any kind').toEqual([]);
  });
});

// == J. thumbnail cleanup remains board/snapshot consistent (cffcaba) ===

describe('J. the board-bound thumbnail snapshot correction still holds', () => {
  it('a switch to B while B\'s fetch is pending saves only A, never a mismatched pairing', async () => {
    const calls: PadletsCall[] = [];
    installSupabase([], calls, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    await switchTo(B); // B's fetch left pending

    expect(thumb()).toHaveBeenCalledTimes(1);
    expect(thumb().mock.calls[0][0]).toBe(A);
    expect((thumb().mock.calls[0][1] as Array<{ id: string }>).map((r) => r.id)).toEqual([`${A}-p1`]);

    await unmountCurrent(); // B's cleanup, B's fetch still unresolved
    expect(thumb(), 'B\'s cleanup must not save anything using A\'s rows').toHaveBeenCalledTimes(1);
  });
});
