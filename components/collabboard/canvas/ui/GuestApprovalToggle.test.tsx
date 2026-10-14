// @vitest-environment jsdom
//
// PATCH-367. The "Approve guest posts first" switch: self-sufficient (reads the
// board + user + pending count), owner-only, writes the column, toasts a 42501
// refusal. Both the Supabase client and sonner are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ toastError: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn(), info: vi.fn() } }));

let currentUser: { id: string } | null = null;
let boardRow: { user_id: string | null; guest_posts_need_approval: boolean } | null = null;
let pendingCount = 0;
let updateError: { code?: string } | null = null;
let updates: Array<Record<string, unknown>> = [];

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: (table: string) => {
      if (table === 'boards') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: boardRow, error: null }) }) }),
          update: (payload: Record<string, unknown>) => {
            updates.push(payload);
            return { eq: async () => ({ data: null, error: updateError }) };
          },
        };
      }
      return {
        select: () => ({ or: () => ({ eq: async () => ({ count: pendingCount, error: null }) }) }),
      };
    },
  }),
}));

import GuestApprovalToggle from './GuestApprovalToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<GuestApprovalToggle boardId="board-1" />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

const switchEl = () => host.querySelector('[data-guest-approval-toggle="true"]') as HTMLElement | null;

beforeEach(() => {
  mocks.toastError.mockReset();
  currentUser = { id: 'u1' };
  boardRow = { user_id: 'u1', guest_posts_need_approval: false };
  pendingCount = 0;
  updateError = null;
  updates = [];
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-367 GuestApprovalToggle', () => {
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
    expect(host.textContent).toContain('Approve guest posts first');
    expect(host.textContent).toContain('New guest posts stay hidden from everyone else until you approve them.');
  });

  it('reflects the stored value', async () => {
    boardRow = { user_id: 'u1', guest_posts_need_approval: true };
    await mount();
    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
  });

  it('shows the "already waiting" hint only when posts are pending', async () => {
    pendingCount = 0;
    await mount();
    expect(host.querySelector('[data-guest-approval-pending-hint="true"]')).toBeNull();

    host.remove();
    pendingCount = 2;
    await mount();
    const hint = host.querySelector('[data-guest-approval-pending-hint="true"]');
    expect(hint).not.toBeNull();
    expect(hint!.textContent).toContain('2 posts already waiting');
  });

  it('writes the column when toggled', async () => {
    await mount();
    await act(async () => { switchEl()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(updates).toEqual([{ guest_posts_need_approval: true }]);
    expect(switchEl()!.getAttribute('aria-checked')).toBe('true');
  });

  it('toasts the owner-only message on a 42501 refusal and rolls back', async () => {
    updateError = { code: '42501' };
    await mount();
    await act(async () => { switchEl()!.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(mocks.toastError).toHaveBeenCalledWith('Only the board owner can change guest post approval.');
    expect(switchEl()!.getAttribute('aria-checked')).toBe('false');
  });
});
