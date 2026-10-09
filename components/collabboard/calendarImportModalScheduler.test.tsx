// @vitest-environment jsdom
//
// PATCH-333. The calendar modal on a standalone Scheduler board: it must render
// OUTSIDE the Kanban provider, with no column picker, and call the scheduler
// endpoints.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No Kanban provider: the store hooks would throw if the modal called them.
vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanUI: () => { throw new Error('useKanban must be used within KanbanProvider'); },
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { CalendarImportModal } from '@/components/kanban-canvas/CalendarImportModal';
import { toast } from 'sonner';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const EVENT = { title: 'Meeting', description: '', allDay: false, startIso: '2026-06-10T09:00:00.000Z', endIso: '2026-06-10T10:00:00.000Z' };

let root: Root | null = null;
let container: HTMLElement;
let fetchMock: ReturnType<typeof vi.fn>;

function stubFetch() {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    if (method === 'GET' && url.endsWith('/calendar-subscriptions')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/calendar-import')) {
      return new Response(JSON.stringify({ events: [EVENT], truncated: false }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/calendar-subscriptions')) {
      return new Response(JSON.stringify({ id: 'sub-1', urlHost: 'calendar.google.com', added: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (url.endsWith('/calendar-import/apply')) {
      return new Response(JSON.stringify({ added: 1 }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
}

async function mount(onChanged = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <CalendarImportModal
        isOpen
        onClose={vi.fn()}
        target={{ kind: 'scheduler', boardId: 'board-1', existingEntries: [], onChanged }}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  return onChanged;
}

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

async function previewLink() {
  await act(async () => { q('[data-calendar-import-tab="link"]')!.click(); });
  const input = q('[data-calendar-import-url="true"]') as HTMLInputElement;
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, 'https://example.com/cal.ics');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { q('[data-calendar-import-preview="true"]')!.click(); await Promise.resolve(); });
}

beforeEach(() => { document.body.innerHTML = ''; stubFetch(); });
afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PATCH-333 the modal on a Scheduler board', () => {
  it('renders outside the Kanban provider with no column picker', async () => {
    await mount();
    expect(q('[data-calendar-import-target="scheduler"]')).not.toBeNull();
    await previewLink();
    expect(q('[data-calendar-import-column="true"]')).toBeNull();
  });

  it('keep-updated on: Import connects a subscription and calls onChanged', async () => {
    const onChanged = await mount();
    await previewLink();
    await act(async () => { q('[data-calendar-import-confirm="true"]')!.click(); await Promise.resolve(); });
    const post = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/calendar-subscriptions') && (call[1] as RequestInit)?.method === 'POST');
    expect(post).toBeDefined();
    expect(onChanged).toHaveBeenCalled();
  });

  it('keep-updated off: Import calls /calendar-import/apply', async () => {
    const onChanged = await mount();
    await previewLink();
    await act(async () => { (q('[data-calendar-keep-updated="true"]') as HTMLInputElement).click(); });
    await act(async () => { q('[data-calendar-import-confirm="true"]')!.click(); await Promise.resolve(); });
    const apply = fetchMock.mock.calls.find((call) => String(call[0]).endsWith('/calendar-import/apply'));
    expect(apply).toBeDefined();
    expect(onChanged).toHaveBeenCalled();
  });

  it('PATCH-333 Addendum 1 says "entries" in the Disconnect confirm', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/calendar-subscriptions')) {
        return new Response(JSON.stringify([{ id: 'sub-1', urlHost: 'calendar.google.com', lastSyncedAt: null, lastError: null, cardCount: 2 }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await mount();
    await act(async () => { q('[data-calendar-disconnect="sub-1"]')!.click(); });
    const dialog = document.querySelector('.kanban-dialog-message');
    expect(dialog?.textContent).toContain('entries will be removed');
    expect(dialog?.textContent).toContain('posts inside are kept');
  });

  it('PATCH-333 Addendum 1 a failed Update now shows the error, not "up to date"', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/calendar-subscriptions')) {
        return new Response(JSON.stringify([{ id: 'sub-1', urlHost: 'calendar.google.com', lastSyncedAt: '2026-06-01T00:00:00Z', lastError: null, cardCount: 0 }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.endsWith('/sync')) {
        return new Response(JSON.stringify({ error: 'The calendar link could not be read.', reason: 'upstream_error' }), { status: 502, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await mount();
    await act(async () => { q('[data-calendar-update-now="sub-1"]')!.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(q('[data-calendar-import-error="true"]')?.textContent).toContain('could not be read');
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('up to date'));
  });

  it('PATCH-333 Addendum 2 says "1 entry" for a single-entry disconnect', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/calendar-subscriptions')) {
        return new Response(JSON.stringify([{ id: 'sub-1', urlHost: 'calendar.google.com', lastSyncedAt: null, lastError: null, cardCount: 1 }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await mount();
    await act(async () => { q('[data-calendar-disconnect="sub-1"]')!.click(); });
    expect(document.querySelector('.kanban-dialog-message')?.textContent).toContain('1 entry will be removed');
  });

  it('PATCH-333 Addendum 2 shows the plain-words error in the connected row', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (method === 'GET' && url.endsWith('/calendar-subscriptions')) {
        return new Response(JSON.stringify([{ id: 'sub-1', urlHost: 'calendar.google.com', lastSyncedAt: null, lastError: 'upstream_error', cardCount: 0 }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });
    await mount();
    expect(q('[data-calendar-connected="sub-1"]')?.textContent).toContain('Could not reach the calendar');
    expect(q('[data-calendar-connected="sub-1"]')?.textContent).not.toContain('upstream_error');
  });
});
