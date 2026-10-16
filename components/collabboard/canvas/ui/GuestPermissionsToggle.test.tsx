// @vitest-environment jsdom
//
// PATCH-380. The two "what may guests do" switches: self-sufficient (reads the
// board + user), owner-only, writes each column, toasts a 42501 refusal and rolls
// back. The Supabase client and sonner are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() } }));

let currentUser: { id: string } | null = null;
let boardRow: {
  user_id: string | null;
  guest_uploads_allowed: boolean;
  guest_ai_allowed: boolean;
} | null = null;
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

import GuestPermissionsToggle from './GuestPermissionsToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<GuestPermissionsToggle boardId="board-1" />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

const uploadsSwitch = () => host.querySelector('[data-guest-permission="uploads"]') as HTMLElement | null;
const aiSwitch = () => host.querySelector('[data-guest-permission="ai"]') as HTMLElement | null;

beforeEach(() => {
  mocks.toastError.mockReset();
  currentUser = { id: 'u1' };
  boardRow = { user_id: 'u1', guest_uploads_allowed: false, guest_ai_allowed: false };
  updateError = null;
  updates = [];
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-380 GuestPermissionsToggle', () => {
  it('is hidden for a non-owner', async () => {
    currentUser = { id: 'u2' };
    await mount();
    expect(uploadsSwitch()).toBeNull();
    expect(aiSwitch()).toBeNull();
  });

  it('shows both switches to the owner, off by default, with the AI hint', async () => {
    await mount();
    expect(uploadsSwitch()).not.toBeNull();
    expect(aiSwitch()).not.toBeNull();
    expect(uploadsSwitch()!.getAttribute('aria-checked')).toBe('false');
    expect(aiSwitch()!.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('Guests may upload images and PDFs');
    expect(host.textContent).toContain('Guests may use Board AI');
    expect(host.textContent).toContain('Uses your AI credits');
  });

  it('reflects the stored values', async () => {
    boardRow = { user_id: 'u1', guest_uploads_allowed: true, guest_ai_allowed: true };
    await mount();
    expect(uploadsSwitch()!.getAttribute('aria-checked')).toBe('true');
    expect(aiSwitch()!.getAttribute('aria-checked')).toBe('true');
  });

  it('writes the uploads column when that switch is toggled', async () => {
    await mount();
    await act(async () => { uploadsSwitch()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(updates).toEqual([{ guest_uploads_allowed: true }]);
    expect(uploadsSwitch()!.getAttribute('aria-checked')).toBe('true');
    // The other switch is untouched.
    expect(aiSwitch()!.getAttribute('aria-checked')).toBe('false');
  });

  it('writes the AI column when that switch is toggled', async () => {
    await mount();
    await act(async () => { aiSwitch()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(updates).toEqual([{ guest_ai_allowed: true }]);
    expect(aiSwitch()!.getAttribute('aria-checked')).toBe('true');
  });

  it('toasts the owner-only message on a 42501 refusal and rolls back', async () => {
    updateError = { code: '42501' };
    await mount();
    await act(async () => { uploadsSwitch()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.toastError).toHaveBeenCalledWith('Only the board owner can change what guests may do.');
    expect(uploadsSwitch()!.getAttribute('aria-checked')).toBe('false');
  });
});
