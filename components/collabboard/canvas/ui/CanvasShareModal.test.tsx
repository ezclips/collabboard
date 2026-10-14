// @vitest-environment jsdom
//
// PATCH-362. Share canvas gains a People tab; opening it renders the People
// component. The browser Supabase client and fetch are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({ auth: { getSession: async () => ({ data: { session: null } }) } }),
}));

import CanvasShareModal from './CanvasShareModal';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      <CanvasShareModal
        isOpen
        onClose={() => {}}
        canvasId="board-1"
        canvasTitle="Board"
        currentWorkspaceRole="owner"
      />,
    );
  });
}

const buttonWithText = (text: string) =>
  (Array.from(host.querySelectorAll('button')) as HTMLElement[])
    .find((button) => (button.textContent ?? '').includes(text)) ?? null;

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

describe('PATCH-362 CanvasShareModal: the People tab', () => {
  it('switches to People, which loads the collaborators', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ people: [
      { userId: 'u1', name: 'Guest', email: null, role: 'viewer', isGuest: true, joinedAt: '2026-01-01T00:00:00Z' },
    ] }));
    vi.stubGlobal('fetch', fetchMock);

    await mount();
    // The email tab is the default.
    expect(host.querySelector('input[placeholder^="Email(s)"]')).not.toBeNull();

    await click(buttonWithText('People'));

    expect(host.querySelector('[data-board-people]')).not.toBeNull();
    expect(host.querySelector('input[placeholder^="Email(s)"]')).toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/boards/board-1/collaborators'))).toBe(true);
  });

  it('does not render a Create button on the People tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ people: [] })));
    await mount();
    await click(buttonWithText('People'));
    expect(buttonWithText('Create')).toBeNull();
  });
});
