// @vitest-environment jsdom
//
// PATCH-368. The guest-settings hook: reads the flag once, applies a change from
// realtime, ignores unrelated board updates, and gives each instance its OWN
// realtime topic (so two hooks on one board both stay live). The Supabase client
// is stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ removeChannel: vi.fn() }));

let realtimeHandlers: Map<string, (payload: { new: Record<string, unknown> }) => void> = new Map();
let channelNames: string[] = [];
let boardRow: { hide_guest_names: boolean } | null = null;

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    from: (_table: string) => ({
      select: (_columns: string) => ({
        eq: () => ({ maybeSingle: async () => ({ data: boardRow, error: null }) }),
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

import { useBoardGuestSettings } from './useBoardGuestSettings';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

function Harness({ boardId, slot }: { boardId: string; slot?: string }) {
  const { hideGuestNames } = useBoardGuestSettings(boardId);
  return <div data-hide={hideGuestNames ? 'true' : 'false'} data-slot={slot ?? ''} />;
}

const lastHandler = () => realtimeHandlers.get(channelNames[channelNames.length - 1]);

async function mount(props: { boardId?: string } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<Harness boardId={props.boardId ?? 'board-1'} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const value = (slot = '') => host.querySelector(`[data-slot="${slot}"]`)?.getAttribute('data-hide');

beforeEach(() => {
  realtimeHandlers = new Map();
  channelNames = [];
  boardRow = { hide_guest_names: false };
  mocks.removeChannel.mockReset();
  mocks.removeChannel.mockResolvedValue('ok');
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-368 useBoardGuestSettings', () => {
  it('reads the flag once on mount', async () => {
    boardRow = { hide_guest_names: true };
    await mount();
    expect(value()).toBe('true');
  });

  it('applies a flag change from realtime', async () => {
    await mount();
    expect(value()).toBe('false');
    await act(async () => { lastHandler()?.({ new: { hide_guest_names: true } }); });
    expect(value()).toBe('true');
  });

  it('ignores an update that did not change the flag', async () => {
    boardRow = { hide_guest_names: true };
    await mount();
    await act(async () => { lastHandler()?.({ new: { hide_guest_names: true, title: 'renamed' } }); });
    expect(value()).toBe('true');
  });

  it('two instances for one board use different topics and both stay live', async () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(
        <>
          <Harness boardId="board-1" slot="a" />
          <Harness boardId="board-1" slot="b" />
        </>,
      );
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const topics = channelNames.filter((name) => name.startsWith('board-guest-settings:board-1'));
    expect(topics.length).toBe(2);
    expect(new Set(topics).size).toBe(2);

    await act(async () => {
      for (const topic of topics) realtimeHandlers.get(topic)?.({ new: { hide_guest_names: true } });
    });
    expect(value('a')).toBe('true');
    expect(value('b')).toBe('true');
  });
});
