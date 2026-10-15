// @vitest-environment jsdom
//
// PATCH-377 Addendum 1 -- the layout, live. A tab must rebuild when another
// viewer converts the board's layout, and must NOT rebuild for the frequent
// `boards` writes that leave the layout alone. This drives the REAL hook against
// a fake channel, so a regression that shares the padlets channel's topic or
// fires on every `boards` echo shows up as an actual recorded call.
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardLayoutLive } from './useBoardLayoutLive';
import { supabaseBrowser } from '@/lib/supabase/browser';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';

type Registration = { config: Record<string, unknown>; handler: (payload: unknown) => void };
type FakeChannel = { topic: string; registrations: Registration[] };

let channels: FakeChannel[] = [];

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
  };
  vi.mocked(supabaseBrowser).mockReturnValue(client as never);
}

let mounted: ReturnType<typeof render> | null = null;
const onLayoutChanged = vi.fn();

function Harness({ boardId, layout }: { boardId: string; layout: string }) {
  useBoardLayoutLive(boardId, layout, onLayoutChanged);
  return <div data-testid="probe" />;
}

async function mount(layout = 'columns') {
  await act(async () => {
    mounted = render(<Harness boardId={BOARD} layout={layout} />);
    await Promise.resolve();
  });
}

function registration(): Registration {
  const found = channels.flatMap((channel) => channel.registrations).find((entry) => entry.config.table === 'boards');
  if (!found) throw new Error('no boards registration');
  return found;
}

/** Deliver a `boards` UPDATE to the handler the hook registered. */
async function deliver(next: Record<string, unknown>) {
  await act(async () => {
    registration().handler({ eventType: 'UPDATE', new: { id: BOARD, ...next }, old: {} });
    await Promise.resolve();
  });
}

beforeEach(() => {
  channels = [];
  installSupabase();
  onLayoutChanged.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted) act(() => { mounted!.unmount(); });
  cleanup();
  mounted = null;
  vi.restoreAllMocks();
});

describe('A. its own channel', () => {
  it('opens one channel whose topic is unique and NOT the padlets channel topic', async () => {
    await mount();

    expect(channels).toHaveLength(1);
    expect(channels[0].topic).not.toBe(`canvas-${BOARD}`);
    expect(channels[0].topic.startsWith('board-layout:')).toBe(true);
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

  it('opens no channel without a board', async () => {
    await act(async () => {
      mounted = render(<Harness boardId="" layout="columns" />);
      await Promise.resolve();
    });
    expect(channels).toHaveLength(0);
  });
});

describe('B. when it rebuilds the page', () => {
  it('refetches when the layout differs from the one being shown', async () => {
    await mount('columns');
    await deliver({ layout: 'wall' });
    expect(onLayoutChanged).toHaveBeenCalledTimes(1);
  });

  it('does not refetch for a boards write that leaves the layout alone', async () => {
    await mount('columns');
    await deliver({ layout: 'columns', frozen_at: '2026-01-01T00:00:00.000Z' });
    await deliver({ layout: 'columns', last_visited_at: '2026-01-01T00:00:00.000Z' });
    expect(onLayoutChanged).not.toHaveBeenCalled();
  });

  it('does not refetch twice for the same change echoed again', async () => {
    await mount('columns');
    await deliver({ layout: 'grid' });
    await deliver({ layout: 'grid' });
    expect(onLayoutChanged).toHaveBeenCalledTimes(1);
  });

  it('refetches again for a second, different change', async () => {
    await mount('columns');
    await deliver({ layout: 'grid' });
    await deliver({ layout: 'wall' });
    expect(onLayoutChanged).toHaveBeenCalledTimes(2);
  });

  it('ignores an event with no layout at all', async () => {
    await mount('columns');
    await deliver({});
    await deliver({ layout: null });
    expect(onLayoutChanged).not.toHaveBeenCalled();
  });

  it('compares against the layout the page is showing NOW, not the one at subscribe time', async () => {
    await mount('columns');
    await act(async () => {
      mounted!.rerender(<Harness boardId={BOARD} layout="grid" />);
      await Promise.resolve();
    });
    // The page has re-rendered as Grid already, so a Grid echo is not a change.
    await deliver({ layout: 'grid' });
    expect(onLayoutChanged).not.toHaveBeenCalled();
  });
});
