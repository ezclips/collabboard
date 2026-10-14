// @vitest-environment jsdom
//
// PATCH-362. The People tab: rows, the Guest badge, the inline confirm and the
// error states. `fetch` is stubbed; nothing is written except through the DELETE.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import CanvasPeopleTab from './CanvasPeopleTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function mount(canvasId = 'board-1') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<CanvasPeopleTab canvasId={canvasId} />);
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const click = async (element: HTMLElement | null) => {
  await act(async () => { element!.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

const PEOPLE = [
  { userId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com', role: 'editor', isGuest: false, joinedAt: '2026-01-01T00:00:00Z' },
  { userId: 'u2', name: 'Guest', email: null, role: 'viewer', isGuest: true, joinedAt: '2026-01-02T00:00:00Z' },
];

describe('PATCH-362 CanvasPeopleTab', () => {
  it('renders a row per person, with a Guest badge and no email for a guest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ people: PEOPLE })));
    await mount();

    expect(all('[data-person-row]')).toHaveLength(2);
    const text = q('[data-board-people]')?.textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('ada@example.com');
    expect(text).toContain('Guest');
    expect(text).toContain('Can edit');
    expect(text).toContain('Can view');
    expect(text).toContain('Removed people can join again while a share link is still valid.');
  });

  it('shows the empty state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ people: [] })));
    await mount();
    expect(q('[data-board-people]')?.textContent).toContain('No one has joined through a share link yet.');
  });

  it('asks inline before removing, then drops the row on success', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return jsonResponse({ removed: true });
      return jsonResponse({ people: PEOPLE });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(all('[data-person-remove]')[0]);
    expect(q('[data-person-remove-confirm]')).not.toBeNull();

    await click(q('[data-person-remove-confirm]'));
    expect(all('[data-person-row]')).toHaveLength(1);
    expect(fetchMock.mock.calls.some(
      ([url, init]) => String(url).endsWith('/collaborators/u1') && (init as RequestInit | undefined)?.method === 'DELETE',
    )).toBe(true);
  });

  it('shows the 403 message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Only the board owner can manage access.' }, 403)));
    await mount();
    expect(q('[data-person-error]')?.textContent).toContain('Only the board owner can manage access.');
  });

  it('a failed removal shows the error and keeps the row', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return jsonResponse({ error: 'Could not remove this person.' }, 500);
      return jsonResponse({ people: PEOPLE });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(all('[data-person-remove]')[0]);
    await click(q('[data-person-remove-confirm]'));

    expect(q('[data-person-error]')?.textContent).toContain('Could not remove this person.');
    expect(all('[data-person-row]')).toHaveLength(2);
  });
});
