// @vitest-environment jsdom
//
// PATCH-363. The presence hook: subscribes to the PRIVATE board channel, tracks
// after SUBSCRIBED, recomputes on presence sync, goes 'unavailable' on a channel
// error, and cleans up. The Supabase client is stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({ channel: mocks.channel, removeChannel: mocks.removeChannel }),
}));

import { useBoardPresence } from './useBoardPresence';
import type { PresenceState } from '@/lib/domain/presence/boardPresence';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
let syncHandler: (() => void) | null = null;
let presenceState: PresenceState = {};
let subscribeStatus = 'SUBSCRIBED';
let trackCalls: unknown[] = [];
let untrackCalls = 0;

function makeChannel() {
  const channel: any = {
    on: (type: string, _options: unknown, callback: () => void) => {
      if (type === 'presence') syncHandler = callback;
      return channel;
    },
    subscribe: (callback: (status: string) => void) => { callback(subscribeStatus); return channel; },
    track: (payload: unknown) => { trackCalls.push(payload); return Promise.resolve('ok'); },
    untrack: () => { untrackCalls += 1; return Promise.resolve('ok'); },
    presenceState: () => presenceState,
  };
  return channel;
}

function Harness({ boardId, user }: { boardId: string; user: { id: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown> } }) {
  const { people, status } = useBoardPresence(boardId, user);
  return (
    <div
      data-people={people.map((person) => person.userId).join(',')}
      data-status={status}
    />
  );
}

async function mount(
  boardId = 'board-1',
  user: { id: string; is_anonymous?: boolean; user_metadata?: Record<string, unknown> } = { id: 'u1', user_metadata: { full_name: 'Ada' } },
) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<Harness boardId={boardId} user={user} />);
  });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;

beforeEach(() => {
  mocks.channel.mockReset();
  mocks.removeChannel.mockReset();
  mocks.channel.mockImplementation(() => makeChannel());
  mocks.removeChannel.mockResolvedValue('ok');
  syncHandler = null;
  presenceState = {};
  subscribeStatus = 'SUBSCRIBED';
  trackCalls = [];
  untrackCalls = 0;
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-363 useBoardPresence', () => {
  it('subscribes to the private board channel keyed by the user id', async () => {
    await mount();
    expect(mocks.channel).toHaveBeenCalledWith('board:board-1', {
      config: { private: true, presence: { key: 'u1' } },
    });
  });

  it('tracks identity after SUBSCRIBED and reports live', async () => {
    await mount('board-1', { id: 'u1', is_anonymous: true, user_metadata: { display_name: 'Guesty' } });
    expect(q('[data-status]')?.getAttribute('data-status')).toBe('live');
    expect(trackCalls).toHaveLength(1);
    expect(trackCalls[0]).toMatchObject({ name: 'Guesty', isGuest: true });
    expect(typeof (trackCalls[0] as { color: string }).color).toBe('string');
    expect(typeof (trackCalls[0] as { joinedAt: string }).joinedAt).toBe('string');
  });

  it('recomputes the list on a presence sync', async () => {
    await mount();
    presenceState = {
      u2: [{ name: 'Bob', joinedAt: '2026-01-02T00:00:00Z' }],
      u1: [{ name: 'Ada', joinedAt: '2026-01-01T00:00:00Z' }],
    };
    await act(async () => { syncHandler?.(); });
    // Me (u1) first, then u2.
    expect(q('[data-people]')?.getAttribute('data-people')).toBe('u1,u2');
  });

  it('goes unavailable on a channel error, without tracking', async () => {
    subscribeStatus = 'CHANNEL_ERROR';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount();
    expect(q('[data-status]')?.getAttribute('data-status')).toBe('unavailable');
    expect(trackCalls).toHaveLength(0);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('cleans up: untrack and removeChannel', async () => {
    await mount();
    const r = root!;
    await act(async () => r.unmount());
    root = null;
    expect(untrackCalls).toBe(1);
    expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
  });
});
