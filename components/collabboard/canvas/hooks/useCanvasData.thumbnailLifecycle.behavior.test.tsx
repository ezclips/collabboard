// @vitest-environment jsdom
//
// CANVAS_THUMBNAIL_BOARD_SNAPSHOT_CORRECTION_1 -- F3.
//
// The cleanup that saves a board's thumbnail on unmount/board-switch reads a
// ref of "the current padlets" and pairs it with whichever canvasId that
// particular effect closure was bound to. Before this fix that ref was just
// `padlets` state mirrored blindly -- so a switch to board B whose own fetch
// is still pending (or fails, or resolves late and out of order) could pair
// B's id with board A's still-resident rows. This suite drives the REAL
// hook, mounted, through REAL board switches (rerender with a new canvasId)
// and REAL realtime callbacks (captured off the mocked channel), and reads
// only generateAndSaveThumbnail's recorded calls -- never the extracted
// cleanup logic directly.
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
const C = 'c1000000-0000-4000-8000-0000000000b3';

type ReadReply<T> = { data: T; error: { message: string } | null };
const okReply = <T,>(data: T): ReadReply<T> => ({ data, error: null });
const failReply = <T,>(): ReadReply<T | null> => ({ data: null, error: { message: 'read failed' } });

/** A padlet row tagged with its OWN board, so a mispaired cleanup call is
 *  visible directly from the row id (`${boardId}-...`) without cross-checking. */
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

type RealtimeHandler = (payload: unknown) => void;
type Writes = Array<{ table: string; op: 'insert' | 'update' }>;

/**
 * The ONE client fetchData's reads (and any reintroduced recovery writes)
 * go through. Every board's padlets read is DEFERRED by default (a gate
 * this test releases explicitly with resolvePadlets), which is what lets a
 * test hold "board B's fetch is still pending" open across a switch to C.
 * Pass `instantPadlets` for a board that should resolve immediately instead.
 */
function installSupabase(writes: Writes, opts: { instantPadlets?: Record<string, ReadReply<unknown>> } = {}) {
  const gates = new Map<string, { promise: Promise<ReadReply<unknown>>; resolve: (r: ReadReply<unknown>) => void }>();
  const gateFor = (boardId: string) => {
    let g = gates.get(boardId);
    if (!g) {
      let resolve!: (r: ReadReply<unknown>) => void;
      const promise = new Promise<ReadReply<unknown>>((res) => { resolve = res; });
      g = { promise, resolve };
      gates.set(boardId, g);
    }
    return g;
  };
  let realtimeHandler: RealtimeHandler | null = null;

  const client = {
    channel: () => {
      const ch = {
        on: (_event: string, _cfg: unknown, handler: RealtimeHandler) => { realtimeHandler = handler; return ch; },
        subscribe: () => ch,
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
            const instant = opts.instantPadlets?.[boardId];
            if (instant) return { then: (resolve: (r: unknown) => void) => resolve(instant) };
            return { then: (resolve: (r: unknown) => void) => gateFor(boardId).promise.then(resolve) };
          },
        }),
        insert(payload: unknown) {
          writes.push({ table, op: 'insert' });
          return { select: () => ({ single: async () => ({ data: null, error: null }), then: (resolve: (r: unknown) => void) => resolve({ data: [], error: null }) }) };
        },
        update(payload: unknown) {
          writes.push({ table, op: 'update' });
          return { eq: async () => ({ data: null, error: null }) };
        },
      };
    },
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
  return {
    resolvePadlets: (boardId: string, reply: ReadReply<unknown>) => gateFor(boardId).resolve(reply),
    getRealtimeHandler: () => realtimeHandler,
  };
}

function Harness({ canvasId }: { canvasId: string }) {
  const dispatch: React.Dispatch<CanvasAction> = () => {};
  const data = useCanvasData({ canvasId, dispatch });
  return (
    <div data-testid="probe">
      {JSON.stringify({ padletCount: data.padlets.length })}
    </div>
  );
}

let current: RenderResult | null = null;
const flush = async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve(); };

async function mount(canvasId: string) {
  await act(async () => {
    current = render(<Harness canvasId={canvasId} />);
    await flush();
  });
  return current!;
}
async function switchTo(canvasId: string) {
  await act(async () => {
    current!.rerender(<Harness canvasId={canvasId} />);
    await flush();
  });
}
async function unmountCurrent() {
  await act(async () => { current!.unmount(); });
}
function padletCount(): number {
  return JSON.parse(screen.getByTestId('probe').textContent ?? '{}').padletCount ?? 0;
}

const thumb = () => vi.mocked(generateAndSaveThumbnail);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (current) { act(() => { current!.unmount(); }); }
  cleanup();
  current = null;
  vi.restoreAllMocks();
});

// == A. load then unmount =============================================

describe('A. a board loads, then unmounts', () => {
  it('the cleanup thumbnail call names exactly that board and its own rows', async () => {
    installSupabase([], { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    expect(padletCount()).toBe(1);

    await unmountCurrent();

    expect(thumb()).toHaveBeenCalledTimes(1);
    const boardId = thumb().mock.calls[0][0] as string;
    const rows = thumb().mock.calls[0][1] as unknown as Array<{ id: string }>;
    expect(boardId).toBe(A);
    expect(rows.map((r) => r.id)).toEqual([`${A}-p1`]);
  });
});

// == B. A -> B while B's fetch is pending ==============================

describe('B. switching to B while B\'s own fetch is still pending', () => {
  it('A\'s cleanup may save A with A\'s rows; B\'s later cleanup must not use A\'s rows', async () => {
    installSupabase([], { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    await switchTo(B); // B's padlets read is left pending -- never resolved in this test.

    expect(thumb(), 'A\'s own cleanup fired during the switch').toHaveBeenCalledTimes(1);
    expect(thumb().mock.calls[0][0]).toBe(A);

    await unmountCurrent(); // B's cleanup, with B's own fetch still unresolved.

    expect(thumb(), 'B\'s cleanup made no further call -- it never pairs B with A\'s rows').toHaveBeenCalledTimes(1);
  });
});

// == C. A -> B where B's fetch fails ===================================

describe('C. switching to B where B\'s fetch fails', () => {
  it('no thumbnail write naming B ever carries A\'s rows', async () => {
    const { resolvePadlets } = installSupabase([], { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    await switchTo(B);

    await act(async () => { resolvePadlets(B, failReply()); await flush(); });
    await unmountCurrent();

    const mispaired = thumb().mock.calls.some(
      ([boardId, rows]) => boardId === B && (rows as Array<{ id: string }>).some((r) => r.id.startsWith(`${A}-`)),
    );
    expect(mispaired).toBe(false);
    // And B itself was never saved at all -- its own read never succeeded.
    expect(thumb().mock.calls.some(([boardId]) => boardId === B)).toBe(false);
  });
});

// == D. A -> B where B's fetch succeeds ================================

describe('D. switching to B where B\'s fetch succeeds', () => {
  it('B\'s cleanup uses only B\'s own rows', async () => {
    const { resolvePadlets } = installSupabase([], { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    await switchTo(B);
    await act(async () => { resolvePadlets(B, okReply([row(B, 'p1'), row(B, 'p2')])); await flush(); });
    expect(padletCount()).toBe(2);

    thumb().mockClear();
    await unmountCurrent();

    expect(thumb()).toHaveBeenCalledTimes(1);
    const boardId = thumb().mock.calls[0][0] as string;
    const rows = thumb().mock.calls[0][1] as unknown as Array<{ id: string }>;
    expect(boardId).toBe(B);
    expect(rows.map((r) => r.id).sort()).toEqual([`${B}-p1`, `${B}-p2`]);
  });
});

// == E. rapid A -> B -> C with a late, out-of-order completion =========

describe('E. rapid A -> B -> C, with B\'s fetch resolving late (after C is active)', () => {
  it('no cleanup call ever pairs one board\'s id with another board\'s rows', async () => {
    const { resolvePadlets } = installSupabase([], { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    await switchTo(B); // B pending
    await switchTo(C); // C also pending; B's own cleanup already ran (mismatch, skipped)

    // B's stale read finally lands, out of order, while C is on screen.
    await act(async () => { resolvePadlets(B, okReply([row(B, 'p1')])); await flush(); });

    await unmountCurrent(); // C's cleanup

    for (const call of thumb().mock.calls) {
      const boardId = call[0] as string;
      const rows = call[1] as unknown as Array<{ id: string }>;
      for (const r of rows) {
        expect(r.id.startsWith(`${boardId}-`), `row ${r.id} must belong to the board it was saved under (${boardId})`).toBe(true);
      }
    }
    // C's own fetch never resolved, so C is never saved at all -- not with
    // its own (nonexistent) rows and certainly not with B's or A's.
    expect(thumb().mock.calls.some(([boardId]) => boardId === C)).toBe(false);
  });
});

// == F. a same-board padlet update keeps the snapshot current ==========

describe('F. a same-board padlet state change after load', () => {
  it('the cleanup uses the latest rows for that board, not the ones it loaded with', async () => {
    const { getRealtimeHandler } = installSupabase([], { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);

    await act(async () => {
      getRealtimeHandler()!({
        eventType: 'UPDATE',
        new: { ...row(A, 'p1'), title: 'Edited Title' },
        old: null,
      });
    });

    await unmountCurrent();

    expect(thumb()).toHaveBeenCalledTimes(1);
    const boardId = thumb().mock.calls[0][0] as string;
    const rows = thumb().mock.calls[0][1] as unknown as Array<{ id: string; title: string }>;
    expect(boardId).toBe(A);
    expect(rows[0].title).toBe('Edited Title');
  });
});

// == G. empty-board behavior is unchanged ===============================

describe('G. an empty board', () => {
  it('never triggers thumbnail generation on cleanup, as before', async () => {
    installSupabase([], { instantPadlets: { [A]: okReply([]) } });
    await mount(A);
    expect(padletCount()).toBe(0);

    await unmountCurrent();

    expect(thumb()).not.toHaveBeenCalled();
  });
});

// == H. fetchData stays backend-read-only through this lifecycle too ===

describe('H. fetchData remains backend-read-only', () => {
  it('a load, a switch, and a failed fetch make zero create/update requests to any table', async () => {
    const writes: Writes = [];
    const { resolvePadlets } = installSupabase(writes, { instantPadlets: { [A]: okReply([row(A, 'p1')]) } });
    await mount(A);
    await switchTo(B);
    await act(async () => { resolvePadlets(B, failReply()); await flush(); });
    await unmountCurrent();

    expect(writes, 'no section/post recovery mutation of any kind').toEqual([]);
  });
});
