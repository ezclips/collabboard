// @vitest-environment jsdom
//
// PATCH-328. The connected-calendars UI and the once-per-mount auto-sync.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  readonly: false,
  refetchFromServer: vi.fn(async () => {}),
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanban: () => ({ canvasId: 'board-1', state: {}, dispatch: vi.fn() }),
  useKanbanData: () => ({
    cards: [], columns: [{ id: 'col-1', label: 'To do', order: 0 }], rows: [], users: [], columnGroups: [],
  }),
  useKanbanUI: () => ({ searchQuery: '', sortBy: null, sortOrder: 'asc', groupBy: 'none', groupFilter: null, locale: 'en' }),
  useKanbanHistory: () => ({ past: [], future: [] }),
  useKanbanPersistence: () => ({ addCard: vi.fn(async () => {}), refetchFromServer: hoisted.refetchFromServer, canvasId: 'board-1' }),
  useKanbanReadonly: () => hoisted.readonly,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key) }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { CalendarImportModal } from '@/components/kanban-canvas/CalendarImportModal';
import { KanbanCalendarAutoSync } from '@/components/kanban-canvas/KanbanCalendarAutoSync';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;

const CONNECTED = [{
  id: 'sub-1', urlHost: 'calendar.google.com', targetColumnId: 'col-1',
  lastSyncedAt: '2026-06-01T00:00:00Z', lastError: null, cardCount: 3,
}];

function stubFetch(subscriptions = CONNECTED) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.endsWith('/calendar-subscriptions')) {
      return new Response(JSON.stringify(subscriptions), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'POST' && url.endsWith('/sync')) {
      return new Response(JSON.stringify({ added: 0, updated: 0, removed: 0 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (method === 'DELETE') {
      return new Response(JSON.stringify({ removedCards: 3 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function mount(node: React.ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(node); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

beforeEach(() => {
  hoisted.readonly = false;
  hoisted.refetchFromServer.mockClear();
  stubFetch();
});
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-328 the connected-calendars UI', () => {
  it('the keep-updated checkbox is on by default', async () => {
    await mount(<CalendarImportModal isOpen onClose={vi.fn()} />);
    await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
    const checkbox = q('[data-calendar-keep-updated="true"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('renders the connected calendars list with the host', async () => {
    await mount(<CalendarImportModal isOpen onClose={vi.fn()} />);
    expect(q('[data-calendar-connected-list="true"]')).not.toBeNull();
    expect(q('[data-calendar-connected="sub-1"]')?.textContent).toContain('calendar.google.com');
  });

  it('Disconnect confirms with the host and the card count', async () => {
    await mount(<CalendarImportModal isOpen onClose={vi.fn()} />);
    await act(async () => { q('[data-calendar-disconnect="sub-1"]')!.click(); });
    const dialog = document.querySelector('.kanban-dialog-message');
    expect(dialog?.textContent).toContain('disconnectCalendarMessage');
    expect(dialog?.textContent).toContain('calendar.google.com');
    expect(dialog?.textContent).toContain('"count":3');
  });
});

describe('PATCH-328 the auto-sync', () => {
  it('syncs each subscription with ifOlderThanSeconds 3600 when editable', async () => {
    await mount(<KanbanCalendarAutoSync />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const syncCalls = fetchMock.mock.calls.filter((call) => String(call[0]).endsWith('/sync'));
    expect(syncCalls).toHaveLength(1);
    const body = JSON.parse(String((syncCalls[0][1] as RequestInit).body));
    expect(body.ifOlderThanSeconds).toBe(3600);
    expect(typeof body.timeZone).toBe('string');
  });

  it('does nothing on a read-only board', async () => {
    hoisted.readonly = true;
    await mount(<KanbanCalendarAutoSync />);
    await act(async () => { await Promise.resolve(); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
