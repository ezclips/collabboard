// @vitest-environment jsdom
//
// PATCH-332. Connected calendars in Settings -> Integrations.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({ useSearchParams: () => ({ get: () => null }) }));
vi.mock('@/lib/infra/supabase/sessionToken', () => ({
  getSessionAccessToken: vi.fn(async () => 'token'),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import IntegrationsPage from './page';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CALENDAR = {
  id: 'sub-1',
  boardId: 'board-1',
  boardTitle: 'Roadmap',
  urlHost: 'calendar.google.com',
  lastSyncedAt: new Date().toISOString(),
  lastError: null,
};

let root: Root | null = null;
let container: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch(calendars: unknown[]) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'DELETE') {
      return new Response(JSON.stringify({ removedCards: 2 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/settings/calendar-subscriptions')) {
      return new Response(JSON.stringify({ calendars }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.includes('/api/settings/integrations')) {
      return new Response(JSON.stringify({ integrations: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<IntegrationsPage />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('confirm', vi.fn(() => true));
});
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-332 calendars in Settings → Integrations', () => {
  it('renders a connected calendar with a link to its board', async () => {
    stubFetch([CALENDAR]);
    await mount();
    const row = q('[data-calendar-row="sub-1"]');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('calendar.google.com');
    expect(row!.textContent).toContain('Roadmap');
    expect(q('[data-calendar-board-link="sub-1"]')?.getAttribute('href')).toBe('/dashboard/canvas/board-1');
  });

  it('shows the empty state when nothing is connected', async () => {
    stubFetch([]);
    await mount();
    expect(q('[data-calendars-empty="true"]')?.textContent).toContain('No calendars connected');
    expect(q('[data-calendar-row]')).toBeNull();
  });

  it('Disconnect confirms, calls the DELETE route, and removes the row', async () => {
    stubFetch([CALENDAR]);
    await mount();
    await act(async () => { q('[data-calendar-disconnect="sub-1"]')!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(window.confirm).toHaveBeenCalled();
    const deleteCall = fetchMock.mock.calls.find((call) => (call[1] as RequestInit | undefined)?.method === 'DELETE');
    expect(deleteCall).toBeDefined();
    expect(String(deleteCall![0])).toBe('/api/boards/board-1/calendar-subscriptions/sub-1');
    expect(q('[data-calendar-row="sub-1"]')).toBeNull();
  });

  it('PATCH-333 says "entries" for a Scheduler board', async () => {
    stubFetch([{ ...CALENDAR, boardLayout: 'scheduler' }]);
    await mount();
    await act(async () => { q('[data-calendar-disconnect="sub-1"]')!.click(); });
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('entries will be removed'));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('posts inside are kept'));
  });

  it('a declined confirm does not call DELETE', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    stubFetch([CALENDAR]);
    await mount();
    await act(async () => { q('[data-calendar-disconnect="sub-1"]')!.click(); });
    expect(fetchMock.mock.calls.some((call) => (call[1] as RequestInit | undefined)?.method === 'DELETE')).toBe(false);
    expect(q('[data-calendar-row="sub-1"]')).not.toBeNull();
  });
});
