// @vitest-environment jsdom
//
// PATCH-368. The "Hide guest names" switch: self-sufficient (reads the board +
// user), owner-only, writes the column, toasts a 42501 refusal. The Supabase
// client and sonner are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() } }));

let currentUser: { id: string } | null = null;
let boardRow: { user_id: string | null; hide_guest_names: boolean } | null = null;
let updateError: { code?: string } | null = null;
let updates: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: boardRow, error: null }) }) }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return { eq: async () => ({ data: null, error: updateError }) };
      },
    }),
  }),
}));

import GuestNamesToggle from './GuestNamesToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<GuestNamesToggle boardId="board-1" />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

const switchEl = () => host.querySelector('[data-hide-guest-names-toggle="true"]') as HTMLElement | null;

beforeEach(() => {
  mocks.toastError.mockReset();
  currentUser = { id: 'u1' };
  boardRow = { user_id: 'u1', hide_guest_names: false };
  updateError = null;
  updates = [];
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-368 GuestNamesToggle', () => {
  it('is hidden for a non-owner', async () => {
    currentUser = { id: 'u2' };
    await mount();
    expect(switchEl()).toBeNull();
  });

  it('shows the switch to the owner with the hint', async () => {
    await mount();
    const el = switchEl();
    expect(el).not.toBeNull();
    expect(el!.getAttribute('role')).toBe('switch');
    expect(el!.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('Hide guest names');
    expect(host.textContent).toContain('Guests appear as Guest 1–99 to everyone. You still see real names on the People tab.');
  });

  it('reflects the stored value', async () => {
    boardRow = { user_id: 'u1', hide_guest_names: true };
    await mount();
    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
  });

  it('writes the column when toggled', async () => {
    await mount();
    await act(async () => { switchEl()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(updates).toEqual([{ hide_guest_names: true }]);
    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
  });

  it('toasts the owner-only message on a 42501 refusal and rolls back', async () => {
    updateError = { code: '42501' };
    await mount();
    await act(async () => { switchEl()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.toastError).toHaveBeenCalledWith('Only the board owner can change guest name visibility.');
    expect(switchEl()!.getAttribute('aria-checked')).toBe('false');
  });
});
