// @vitest-environment jsdom
//
// PATCH-366. The Freeze board switch: self-sufficient (reads the board + user),
// owner-only, and writes through useBoardFrozen. Both the Supabase client and
// the hook are stubbed.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ setFrozen: vi.fn(), useBoardFrozen: vi.fn() }));
vi.mock('../hooks/useBoardFrozen', () => ({ useBoardFrozen: mocks.useBoardFrozen }));

let currentUser: { id: string } | null = null;
let boardRow: { user_id: string | null; frozen_at: string | null } | null = null;

vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: boardRow }) }) }),
    }),
  }),
}));

import BoardFreezeToggle from './BoardFreezeToggle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<BoardFreezeToggle boardId="board-1" />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  mocks.setFrozen.mockReset();
  mocks.useBoardFrozen.mockReset();
  mocks.useBoardFrozen.mockReturnValue({ frozenAt: null, setFrozen: mocks.setFrozen });
  currentUser = { id: 'u1' };
  boardRow = { user_id: 'u1', frozen_at: null };
});

afterEach(async () => {
  if (root) { const r = root; await act(async () => r.unmount()); root = null; }
  host?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-366 BoardFreezeToggle', () => {
  it('is hidden for a non-owner', async () => {
    currentUser = { id: 'u2' };
    await mount();
    expect(host.querySelector('[data-board-freeze-toggle="true"]')).toBeNull();
  });

  it('shows the switch to the owner, reflecting the frozen state', async () => {
    await mount();
    const toggle = host.querySelector('[data-board-freeze-toggle="true"]') as HTMLElement;
    expect(toggle).not.toBeNull();
    expect(toggle.getAttribute('role')).toBe('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('Nobody else can add or change anything until you unfreeze.');
  });

  it('shows checked when the board is frozen', async () => {
    mocks.useBoardFrozen.mockReturnValue({ frozenAt: '2026-06-15T12:00:00Z', setFrozen: mocks.setFrozen });
    await mount();
    expect(host.querySelector('[data-board-freeze-toggle="true"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('clicking calls setFrozen with the inverted value', async () => {
    await mount();
    await act(async () => { (host.querySelector('[data-board-freeze-toggle="true"]') as HTMLElement).click(); });
    expect(mocks.setFrozen).toHaveBeenCalledWith(true);
  });
});
