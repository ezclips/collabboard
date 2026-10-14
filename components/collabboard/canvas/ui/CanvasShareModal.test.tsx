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

// PATCH-366. The freeze switch is self-sufficient and has its own test; stub it
// here so this suite stays about the modal's tabs.
vi.mock('./BoardFreezeToggle', () => ({ default: () => null }));

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

/** A button whose trimmed label is exactly `text` (the footer's primary action). */
const exactButton = (text: string) =>
  (Array.from(host.querySelectorAll('button')) as HTMLElement[])
    .find((button) => (button.textContent ?? '').trim() === text) ?? null;

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

describe('PATCH-365 CanvasShareModal: the Guest link tab', () => {
  it('renders all four tab buttons, including Guest link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [] })));
    await mount();
    const tabs = Array.from(host.querySelectorAll('button')).map((button) => button.textContent ?? '');
    expect(tabs.some((label) => label.includes('Email'))).toBe(true);
    expect(tabs.some((label) => label.includes('Invite link'))).toBe(true);
    expect(tabs.some((label) => label.includes('Guest link'))).toBe(true);
    expect(tabs.some((label) => label.includes('People'))).toBe(true);
  });

  it('switches to the Guest link tab and renders it', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ links: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await mount();
    await click(host.querySelector('[data-share-tab="guests"]') as HTMLElement);

    expect(host.querySelector('[data-guest-links]')).not.toBeNull();
    expect(host.querySelector('[data-guest-link-create="true"]')).not.toBeNull();
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/api/boards/board-1/share-links'))).toBe(true);
    // The footer's primary action is not a Create link on this tab.
    expect(exactButton('Create')).toBeNull();
  });
});

describe('PATCH-369 CanvasShareModal: compact frame', () => {
  it('marks the panel, one-line header, and drops the Canvas access box', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [] })));
    await mount();
    expect(host.querySelector('[data-share-modal="true"]')).not.toBeNull();
    expect(host.textContent).not.toContain('Canvas access');
    expect(host.textContent).not.toContain('Invite people directly to');
    expect(host.textContent).toContain('Share “Board”');
  });

  it('keeps the footer on Email and Invite link, and hides it on Guest link and People', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [], people: [] })));
    await mount();

    // Email (default): footer present.
    expect(exactButton('Cancel')).not.toBeNull();

    await click(buttonWithText('Invite link'));
    expect(exactButton('Cancel')).not.toBeNull();

    await click(host.querySelector('[data-share-tab="guests"]') as HTMLElement);
    expect(exactButton('Cancel')).toBeNull();

    await click(buttonWithText('People'));
    expect(exactButton('Cancel')).toBeNull();
  });
});
