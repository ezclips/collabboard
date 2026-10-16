// @vitest-environment jsdom
//
// PATCH-365. The Guest link tab: loads and lists, creates (exact body), the
// password toggle + min-length, the shown-once password, turn-off confirm, the
// 403 owner-only message, and a failed create. fetch and sonner are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import CanvasGuestLinksTab from './CanvasGuestLinksTab';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const LINK = {
  id: 'l1',
  permission: 'edit',
  createdAt: '2026-06-01T00:00:00Z',
  expiresAt: null,
  isPasswordProtected: false,
  accessCount: 3,
  url: 'https://app.test/share/tok',
};

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<CanvasGuestLinksTab canvasId="board-1" canvasTitle="Retro" />);
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const all = (selector: string) => Array.from(host.querySelectorAll(selector)) as HTMLElement[];
const click = async (element: HTMLElement | null) => {
  await act(async () => { element!.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};
const setInput = async (selector: string, value: string) => {
  await act(async () => {
    const input = q(selector) as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  mocks.toast.mockReset();
  mocks.toast.success.mockReset();
  mocks.toast.error.mockReset();
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('PATCH-365 CanvasGuestLinksTab', () => {
  it('loads and lists the board’s guest links', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [LINK] })));
    await mount();
    expect(all('[data-guest-link-row]')).toHaveLength(1);
    expect(q('[data-guest-link-row]')?.getAttribute('data-guest-link-id')).toBe('l1');
    expect(q('[data-guest-links]')?.textContent).toContain('Can edit');
    expect(q('[data-guest-links]')?.textContent).toContain('3 opened');
    expect(q('[data-guest-links]')?.textContent).toContain('Never expires');
  });

  it('creates a link with the exact body and reloads', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ success: true, shareUrl: 'https://app.test/share/new' });
      return jsonResponse({ links: [LINK] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-create="true"]'));

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(post?.[0]).toBe('/api/share-link');
    expect(JSON.parse(String((post?.[1] as RequestInit).body))).toEqual({
      boardId: 'board-1',
      permission: 'edit',
      shareTarget: 'board',
      expirationDays: 7,
      password: null,
    });
    // Reloaded (a second GET).
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/share-links')).length).toBe(2);
  });

  it('validates the password length and does not post', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => jsonResponse({ links: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-password-toggle="true"]'));
    await setInput('[data-guest-link-password="true"]', 'ab');
    await click(q('[data-guest-link-create="true"]'));

    expect(q('[data-guest-link-error="true"]')?.textContent).toContain('at least 4 characters');
    expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('shows the password once after creating a protected link', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ success: true, shareUrl: 'https://app.test/share/new' });
      return jsonResponse({ links: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-password-toggle="true"]'));
    await setInput('[data-guest-link-password="true"]', 'abcd');
    await click(q('[data-guest-link-create="true"]'));

    const post = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(JSON.parse(String((post?.[1] as RequestInit).body)).password).toBe('abcd');
    expect((q('[data-guest-link-new-password="true"]') as HTMLInputElement)?.value).toBe('abcd');
  });

  it('turns a link off after an inline confirm', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'DELETE') return jsonResponse({ ok: true });
      return jsonResponse({ links: [LINK] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-off="true"]'));
    expect(q('[data-guest-link-off-confirm="true"]')).not.toBeNull();
    await click(q('[data-guest-link-off-confirm="true"]'));

    expect(fetchMock.mock.calls.some(
      ([url, init]) => String(url).endsWith('/share-links/l1') && (init as RequestInit | undefined)?.method === 'DELETE',
    )).toBe(true);
    expect(all('[data-guest-link-row]')).toHaveLength(0);
  });

  it('a 403 shows the owner-only message and hides the form', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Only the board owner can manage access.' }, 403)));
    await mount();
    expect(q('[data-guest-link-error="true"]')?.textContent).toContain('Only the board owner can manage access.');
    expect(q('[data-guest-link-create="true"]')).toBeNull();
  });

  it('a failed create shows the error', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return jsonResponse({ error: 'Nope.' }, 500);
      return jsonResponse({ links: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();
    await click(q('[data-guest-link-create="true"]'));
    expect(q('[data-guest-link-error="true"]')?.textContent).toContain('Nope.');
  });
});

describe('PATCH-380 CanvasGuestLinksTab: delete-link also removes the people who joined', () => {
  const peopleResponse = () => jsonResponse({ people: [
    { userId: 'g1', name: 'Guest', email: null, role: 'editor', isGuest: true, joinedAt: null, joinedViaLinkId: 'l1' },
    { userId: 'g2', name: 'Guest', email: null, role: 'viewer', isGuest: true, joinedAt: null, joinedViaLinkId: 'l1' },
    { userId: 'g3', name: 'Other', email: 'o@x.com', role: 'viewer', isGuest: false, joinedAt: null, joinedViaLinkId: null },
  ] });

  const mockedFetch = (onDelete: (body: unknown) => Response) => vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'DELETE') return onDelete(JSON.parse(String(init.body)));
    if (String(url).endsWith('/collaborators')) return peopleResponse();
    return jsonResponse({ links: [LINK] });
  });

  it('shows the count and sends removeJoined: true by default', async () => {
    const fetchMock = mockedFetch(() => jsonResponse({ removed: 2 }));
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-off="true"]'));
    const box = q('[data-remove-joined="true"]') as HTMLInputElement | null;
    expect(box).not.toBeNull();
    expect(box!.checked).toBe(true);
    expect(q('[data-guest-links]')?.textContent).toContain('Also remove the 2 people who joined with this link');

    await click(q('[data-guest-link-off-confirm="true"]'));
    expect(fetchMock.mock.calls.some(
      ([url, init]) => String(url).endsWith('/share-links/l1') && (init as RequestInit | undefined)?.method === 'DELETE',
    )).toBe(true);
    expect(all('[data-guest-link-row]')).toHaveLength(0);
  });

  it('unticking the box sends removeJoined: false', async () => {
    const bodies: unknown[] = [];
    const fetchMock = mockedFetch((body) => { bodies.push(body); return jsonResponse({ removed: 0 }); });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-off="true"]'));
    await click(q('[data-remove-joined="true"]'));
    await click(q('[data-guest-link-off-confirm="true"]'));

    expect(bodies).toEqual([{ removeJoined: false }]);
  });

  it('hides the checkbox when nobody joined through the link', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/collaborators')) return jsonResponse({ people: [] });
      if (init?.method === 'DELETE') return jsonResponse({ removed: 0 });
      return jsonResponse({ links: [LINK] });
    });
    vi.stubGlobal('fetch', fetchMock);
    await mount();

    await click(q('[data-guest-link-off="true"]'));
    expect(q('[data-remove-joined="true"]')).toBeNull();
  });
});

describe('PATCH-369 CanvasGuestLinksTab: compact form', () => {
  it('keeps both selects and puts the checkbox and Create on one row', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [] })));
    await mount();

    expect(q('[data-guest-link-permission="true"]')).not.toBeNull();
    expect(q('[data-guest-link-expiry="true"]')).not.toBeNull();

    const checkbox = q('[data-guest-link-password-toggle="true"]')!;
    const create = q('[data-guest-link-create="true"]')!;
    const row = checkbox.closest('div.flex');
    expect(row).not.toBeNull();
    expect(row!.contains(create)).toBe(true);
  });

  it('shows the password field only when the checkbox is checked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [] })));
    await mount();
    expect(q('[data-guest-link-password="true"]')).toBeNull();
    await click(q('[data-guest-link-password-toggle="true"]'));
    expect(q('[data-guest-link-password="true"]')).not.toBeNull();
  });

  it('shows the footnote only when there is at least one link', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [] })));
    await mount();
    expect(q('[data-guest-links]')?.textContent).not.toContain('Turning a link off');

    if (root) { const r = root; await act(async () => r.unmount()); root = null; }
    host?.remove();

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ links: [LINK] })));
    await mount();
    expect(q('[data-guest-links]')?.textContent).toContain('Turning a link off');
  });
});
