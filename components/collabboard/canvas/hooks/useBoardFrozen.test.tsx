// @vitest-environment jsdom
//
// PATCH-366. The freeze hook: applies a frozen_at change, ignores unrelated
// board updates, reads the value when none was supplied, surfaces the 42501
// refusal, and (Addendum 1) gives each instance its OWN realtime topic so two
// hooks on the same board both stay live. The Supabase client and sonner are
// stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
  removeChannel: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

let realtimeHandlers: Map<string, (payload: { new: Record<string, unknown> }) => void> = new Map();
let channelNames: string[] = [];
let boardRow: { frozen_at: string | null } | null = null;
let updateResult: { data: unknown; error: unknown } = { data: [{ frozen_at: null }], error: null };

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: () => ({ maybeSingle: async () => ({ data: boardRow, error: null }) }),
      }),
      update: (_payload: Record<string, unknown>) => ({
        eq: () => ({ select: async () => updateResult }),
      }),
    }),
    channel: (name: string) => {
      channelNames.push(name);
      const channel: any = {
        on: (_type: string, _options: unknown, callback: (payload: { new: Record<string, unknown> }) => void) => {
          realtimeHandlers.set(name, callback);
          return channel;
        },
        subscribe: () => channel,
      };
      return channel;
    },
    removeChannel: mocks.removeChannel,
  }),
}));

import { useBoardFrozen } from './useBoardFrozen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
let capturedSetFrozen: ((next: boolean) => void) | null = null;

function Harness({ boardId, initial, slot }: { boardId: string; initial?: string | null; slot?: string }) {
  const { frozenAt, setFrozen } = useBoardFrozen(boardId, initial);
  capturedSetFrozen = setFrozen;
  return <div data-frozen={frozenAt ?? ''} data-slot={slot ?? ''} />;
}

/** The handler of the channel opened most recently. */
const lastHandler = () => realtimeHandlers.get(channelNames[channelNames.length - 1]);

async function mount(props: { boardId?: string; initial?: string | null } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Harness boardId={props.boardId ?? 'board-1'} initial={props.initial} />);
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const value = (slot = '') =>
  host.querySelector(`[data-slot="${slot}"]`)?.getAttribute('data-frozen');

beforeEach(() => {
  realtimeHandlers = new Map();
  channelNames = [];
  boardRow = null;
  updateResult = { data: [{ frozen_at: null }], error: null };
  capturedSetFrozen = null;
  mocks.toast.error.mockReset();
  mocks.removeChannel.mockReset();
  mocks.removeChannel.mockResolvedValue('ok');
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-366 useBoardFrozen', () => {
  it('starts from the supplied initial value', async () => {
    await mount({ initial: '2026-06-15T12:00:00Z' });
    expect(value()).toBe('2026-06-15T12:00:00Z');
  });

  it('applies a frozen_at change from realtime', async () => {
    await mount({ initial: null });
    await act(async () => { lastHandler()?.({ new: { frozen_at: '2026-06-15T13:00:00Z' } }); });
    expect(value()).toBe('2026-06-15T13:00:00Z');
  });

  it('ignores a board update that did not change frozen_at', async () => {
    await mount({ initial: '2026-06-15T12:00:00Z' });
    await act(async () => { lastHandler()?.({ new: { frozen_at: '2026-06-15T12:00:00Z', title: 'renamed' } }); });
    expect(value()).toBe('2026-06-15T12:00:00Z');
  });

  it('reads the value itself when none was supplied', async () => {
    boardRow = { frozen_at: '2026-06-20T00:00:00Z' };
    await mount({ initial: undefined });
    expect(value()).toBe('2026-06-20T00:00:00Z');
  });

  it('toasts the owner-only message on a 42501 refusal', async () => {
    updateResult = { data: null, error: { code: '42501' } };
    await mount({ initial: null });
    await act(async () => { capturedSetFrozen?.(true); await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.toast.error).toHaveBeenCalledWith('Only the board owner can freeze this board.');
  });

  it('applies the stored value after a successful set', async () => {
    updateResult = { data: [{ frozen_at: '2026-06-15T14:00:00Z' }], error: null };
    await mount({ initial: null });
    await act(async () => { capturedSetFrozen?.(true); await Promise.resolve(); await Promise.resolve(); });
    expect(value()).toBe('2026-06-15T14:00:00Z');
  });

  // Addendum 1. Two hooks for the SAME board must not share a topic, or one of
  // them silently stops receiving. Both must apply the update.
  it('two instances for one board use different topics and both stay live', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <>
          <Harness boardId="board-1" initial={null} slot="a" />
          <Harness boardId="board-1" initial={null} slot="b" />
        </>,
      );
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const topics = channelNames.filter((name) => name.startsWith('board-freeze:board-1'));
    expect(topics.length).toBe(2);
    expect(new Set(topics).size).toBe(2);

    await act(async () => {
      for (const topic of topics) {
        realtimeHandlers.get(topic)?.({ new: { frozen_at: '2026-06-15T13:00:00Z' } });
      }
    });
    expect(value('a')).toBe('2026-06-15T13:00:00Z');
    expect(value('b')).toBe('2026-06-15T13:00:00Z');
  });
});
