// @vitest-environment jsdom
//
// PATCH-358. The guest join card: name validation, single-flight, and the
// "anonymous sign-ins disabled" / 429 errors mapped to friendly text. The
// browser Supabase client and the router are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  signInAnonymously: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({ auth: { signInAnonymously: mocks.signInAnonymously } }),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));

import GuestJoinCard from '@/app/share/[token]/GuestJoinCard';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount(props: { token?: string; boardTitle?: string | null } = {}) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<GuestJoinCard token={props.token ?? 'tok'} boardTitle={props.boardTitle ?? 'Retro'} />);
  });
}

const q = (selector: string) => host.querySelector(selector) as HTMLElement | null;
const setName = async (value: string) => {
  await act(async () => {
    const input = q('[data-guest-name]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const clickJoin = async () => {
  await act(async () => { q('[data-guest-join]')!.click(); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

beforeEach(() => {
  mocks.signInAnonymously.mockReset();
  mocks.refresh.mockReset();
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-358 GuestJoinCard', () => {
  it('shows the board title and a sign-in link', async () => {
    await mount({ token: 'abc', boardTitle: 'Retro' });
    expect(q('[data-guest-join-card]')?.textContent).toContain('Retro');
    expect(q('[data-guest-signin]')?.getAttribute('href')).toBe('/auth?redirect=%2Fshare%2Fabc');
  });

  it('refuses an empty name without calling sign-in', async () => {
    await mount();
    await clickJoin();
    expect(q('[data-guest-error]')?.textContent).toContain('Please type a name.');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it('refuses a name with angle brackets', async () => {
    await mount();
    await setName('<b>Ada</b>');
    await clickJoin();
    expect(q('[data-guest-error]')?.textContent).toContain('<');
    expect(mocks.signInAnonymously).not.toHaveBeenCalled();
  });

  it('signs in with the normalised name and refreshes', async () => {
    mocks.signInAnonymously.mockResolvedValue({ error: null });
    await mount();
    await setName('  Ada   Lovelace  ');
    await clickJoin();
    expect(mocks.signInAnonymously).toHaveBeenCalledWith({
      options: { data: { display_name: 'Ada Lovelace' } },
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it('is single-flight: the button disables while the request runs', async () => {
    let resolve!: (value: { error: null }) => void;
    mocks.signInAnonymously.mockReturnValue(new Promise((r) => { resolve = r; }));
    await mount();
    await setName('Ada');
    await act(async () => { q('[data-guest-join]')!.click(); });
    await act(async () => { await Promise.resolve(); });

    expect((q('[data-guest-join]') as HTMLButtonElement).disabled).toBe(true);
    // A second click while in flight does nothing.
    await act(async () => { q('[data-guest-join]')!.click(); });
    expect(mocks.signInAnonymously).toHaveBeenCalledTimes(1);

    await act(async () => { resolve({ error: null }); await Promise.resolve(); });
  });

  it('maps the "anonymous sign-ins disabled" error to friendly text', async () => {
    mocks.signInAnonymously.mockResolvedValue({ error: { message: 'Anonymous sign-ins are disabled' } });
    await mount();
    await setName('Ada');
    await clickJoin();
    expect(q('[data-guest-error]')?.textContent)
      .toContain('Guest access is not available yet. Sign in or create an account instead.');
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it('maps a 429 to the rate-limit message', async () => {
    mocks.signInAnonymously.mockResolvedValue({ error: { message: 'Too many requests', status: 429 } });
    await mount();
    await setName('Ada');
    await clickJoin();
    expect(q('[data-guest-error]')?.textContent)
      .toContain('Too many people joined from this network just now. Try again in a few minutes.');
  });

  it('maps any other error to the generic message', async () => {
    mocks.signInAnonymously.mockResolvedValue({ error: { message: 'boom' } });
    await mount();
    await setName('Ada');
    await clickJoin();
    expect(q('[data-guest-error]')?.textContent).toContain('Could not join as a guest. Try again.');
  });
});
