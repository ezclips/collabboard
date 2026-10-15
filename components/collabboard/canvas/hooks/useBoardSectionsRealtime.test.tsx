// @vitest-environment jsdom
//
// PATCH-373 -- board_sections realtime, on its OWN channel.
//
// Addendum 1. The first version put these handlers on the existing
// `canvas-${canvasId}` channel, and because `board_sections` was not yet in the
// realtime publication the live run showed the WHOLE channel failing to
// subscribe -- and with it every `padlets` event. This suite drives the REAL
// hook's handlers, captured from the fake channel it actually subscribes on, so
// a regression that puts them back on the padlets channel (or reuses its topic)
// shows up as an actual assertion, never as a call to something this test
// mocked out of the path.
import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useBoardSectionsRealtime } from './useBoardSectionsRealtime';
import { supabaseBrowser } from '@/lib/supabase/browser';
import type { BoardSection } from '@/types/collabboard';

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn() }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOARD = 'f1000000-0000-4000-8000-0000000000b1';

/** One `channel.on(...)` call, exactly as the hook made it. */
type Registration = {
  /** The first argument: 'postgres_changes'. */
  channelEvent: string;
  /** The second argument: event/schema/table/filter. */
  config: Record<string, unknown>;
  handler: (payload: unknown) => void;
};
type FakeChannel = { topic: string; registrations: Registration[] };

let channels: FakeChannel[] = [];

function installSupabase() {
  const client = {
    channel: (topic: string) => {
      const registrations: Registration[] = [];
      const channel: Record<string, unknown> = {};
      channel.on = (channelEvent: string, config: Record<string, unknown>, handler: (payload: unknown) => void) => {
        registrations.push({ channelEvent, config: { ...config }, handler });
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

function Harness({ canvasId }: { canvasId: string }) {
  const [sections, setSections] = React.useState<BoardSection[]>([]);
  useBoardSectionsRealtime(canvasId, setSections);
  return (
    <div data-testid="probe">
      {JSON.stringify(sections.map((s) => ({ id: s.id, title: s.title, position: s.position })))}
    </div>
  );
}

const probe = (): Array<{ id: number; title: string; position: number }> =>
  JSON.parse(screen.getByTestId('probe').textContent ?? '[]');

async function mount(canvasId = BOARD) {
  await act(async () => {
    mounted = render(<Harness canvasId={canvasId} />);
    await Promise.resolve();
  });
}

/** The one registration the hook made for a `board_sections` event. */
function registration(event: string): Registration {
  const found = channels
    .flatMap((channel) => channel.registrations)
    .find((entry) => entry.config.table === 'board_sections' && entry.config.event === event);
  if (!found) throw new Error(`no board_sections ${event} registration`);
  return found;
}

/** Deliver one realtime event to the handler the hook registered. */
async function deliver(event: string, payload: Record<string, unknown>) {
  await act(async () => {
    registration(event).handler({ eventType: event, ...payload });
    await Promise.resolve();
  });
}

const section = (id: number | string, title: string, position: number) => ({
  id,
  board_id: BOARD,
  title,
  description: '',
  position,
  created_at: 't',
  updated_at: 't',
});

beforeEach(() => {
  channels = [];
  installSupabase();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  if (mounted) act(() => { mounted!.unmount(); });
  cleanup();
  mounted = null;
  vi.restoreAllMocks();
});

// == A. its own channel ===========================================

describe('A. the handlers ride a channel of their own', () => {
  it('registers three board_sections handlers, filters INSERT/UPDATE by board, leaves DELETE unfiltered', async () => {
    await mount();

    expect(channels).toHaveLength(1);
    expect(registration('INSERT').config.filter).toBe(`board_id=eq.${BOARD}`);
    expect(registration('UPDATE').config.filter).toBe(`board_id=eq.${BOARD}`);
    // DELETE carries only the primary key, so it can never be board-filtered.
    expect(registration('DELETE').config.filter).toBeUndefined();

    expect(channels[0].registrations.every((entry) => entry.channelEvent === 'postgres_changes')).toBe(true);
    expect(channels[0].registrations).toHaveLength(3);
    // No padlets handler here: the posts channel is not this hook's business.
    expect(channels[0].registrations.some((entry) => entry.config.table === 'padlets')).toBe(false);
  });

  it('uses a topic that is NOT the padlets channel topic', async () => {
    await mount();

    // Addendum 1: a shared topic (or a shared channel) let one unpublished table
    // kill the padlets subscription too.
    expect(channels[0].topic).not.toBe(`canvas-${BOARD}`);
    expect(channels[0].topic).toContain(BOARD);
    expect(channels[0].topic.startsWith('canvas-sections:')).toBe(true);
  });
});

// == B. INSERT ====================================================

describe('B. INSERT adds once, sorted by position', () => {
  it('adds a section, and an own echo whose id is a string is not duplicated', async () => {
    await mount();

    await deliver('INSERT', { new: section(42, 'First', 1) });
    expect(probe()).toEqual([{ id: 42, title: 'First', position: 1 }]);

    // Our own create already added the row; the echo arrives with the same id
    // as a STRING (the column is a BIGINT).
    await deliver('INSERT', { new: section('42', 'First', 1) });
    expect(probe()).toHaveLength(1);

    await deliver('INSERT', { new: section(43, 'Second', 5) });
    await deliver('INSERT', { new: section(44, 'Zeroth', 0) });
    expect(probe().map((s) => s.id)).toEqual([44, 42, 43]);
  });

  it('ignores an event with no id', async () => {
    await mount();
    await deliver('INSERT', { new: {} });
    expect(probe()).toEqual([]);
  });
});

// == C. UPDATE ====================================================

describe('C. UPDATE replaces the row and re-sorts', () => {
  it('keeps the id, takes the new title and moves to the new position', async () => {
    await mount();
    await deliver('INSERT', { new: section(42, 'First', 1) });
    await deliver('INSERT', { new: section(43, 'Second', 2) });

    await deliver('UPDATE', { new: section(42, 'Renamed', 9) });

    expect(probe()).toEqual([
      { id: 43, title: 'Second', position: 2 },
      { id: 42, title: 'Renamed', position: 9 },
    ]);
  });

  it('adds a row this viewer does not hold yet (an UPDATE it just became able to see)', async () => {
    await mount();
    await deliver('UPDATE', { new: section(50, 'Newly visible', 3) });
    expect(probe()).toEqual([{ id: 50, title: 'Newly visible', position: 3 }]);
  });
});

// == D. DELETE ====================================================

describe('D. DELETE removes by id and ignores unknown ids', () => {
  it('drops the matching section and leaves the others', async () => {
    await mount();
    await deliver('INSERT', { new: section(42, 'First', 1) });
    await deliver('INSERT', { new: section(43, 'Second', 2) });

    await deliver('DELETE', { old: { id: 42 } });
    expect(probe().map((s) => s.id)).toEqual([43]);

    // An id this board does not hold -- another board's section, arriving
    // because DELETE cannot be board-filtered.
    await deliver('DELETE', { old: { id: 999 } });
    expect(probe().map((s) => s.id)).toEqual([43]);

    await deliver('DELETE', { old: { id: '43' } });
    expect(probe()).toEqual([]);
  });
});
