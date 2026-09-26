// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PATCH-189. The billing page's trial lines and the small Free plan.
 *
 * The plan data and the permission helpers are REAL; only the session client
 * and `getPermissionContext` are stubbed, so the assertions cover the strings
 * and the card list the page actually renders.
 */

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  getPermissionContext: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase-provider', () => ({
  useSupabase: () => ({
    supabase: {
      auth: { getUser: mocks.getUser },
      from: mocks.from,
    },
  }),
}));

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>();
  return { ...actual, getPermissionContext: mocks.getPermissionContext };
});

vi.mock('sonner', () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import BillingPage from '@/app/dashboard/settings/billing/page';

const DAY = 24 * 60 * 60 * 1000;

let container: HTMLDivElement;
let root: Root;

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function renderEntitled(entitlements: {
  plan: string;
  status: string;
  trialEndsAt: string | null;
}) {
  mocks.getPermissionContext.mockResolvedValue({
    workspaceMembership: { workspaceId: 'workspace-1', role: 'owner' },
    entitlements,
  });
  await act(async () => { root.render(<BillingPage />); });
  await flush();
}

const text = () => container.textContent ?? '';

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ is: async () => ({ count: 0 }) }) }),
  }));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

describe('PATCH-189 — the billing page and the trial', () => {
  it('during the trial shows the days left and still offers Pro and Premium checkout', async () => {
    const endsAt = new Date(Date.now() + 5 * DAY).toISOString();
    await renderEntitled({ plan: 'premium', status: 'free', trialEndsAt: endsAt });

    const banner = container.querySelector('[data-billing-trial="true"]');
    expect(banner).not.toBeNull();
    expect(banner!.textContent).toContain('Premium trial');
    expect(banner!.textContent).toContain('5 days left');
    expect(container.querySelector('[data-billing-trial-ended="true"]')).toBeNull();

    // No card is "current" during the trial, so a paid checkout is still offered
    // for both Pro and Premium.
    const upgrades = Array.from(container.querySelectorAll('button'))
      .filter((button) => button.textContent?.trim() === 'Upgrade');
    expect(upgrades).toHaveLength(2);

    // The Stripe portal is NOT offered: there is no subscription yet.
    expect(text()).not.toContain('Open billing portal');
  });

  it('on the last day says "1 day left"', async () => {
    const endsAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await renderEntitled({ plan: 'premium', status: 'free', trialEndsAt: endsAt });
    expect(container.querySelector('[data-billing-trial="true"]')!.textContent).toContain('1 day left');
  });

  it('after the trial on Free shows the ended line and the small Free features', async () => {
    await renderEntitled({ plan: 'free', status: 'free', trialEndsAt: null });

    expect(container.querySelector('[data-billing-trial="true"]')).toBeNull();
    const ended = container.querySelector('[data-billing-trial-ended="true"]');
    expect(ended).not.toBeNull();
    expect(ended!.textContent).toContain('Your Premium trial has ended.');
    expect(ended!.textContent).toContain("You're on Free");

    // The Free card describes what Free keeps and what it no longer has.
    expect(text()).toContain('No AI');
    expect(text()).toContain('No new documents');
    // "2000 AI credits / month" must not be misread as a Free "0 AI credits".
    expect(text()).not.toMatch(/(^|[^0-9])0 AI credits \/ month/);
    expect(text()).not.toContain('0 Knowledge documents');
  });

  it('a paid workspace shows neither line', async () => {
    await renderEntitled({ plan: 'pro', status: 'active', trialEndsAt: null });
    expect(container.querySelector('[data-billing-trial="true"]')).toBeNull();
    expect(container.querySelector('[data-billing-trial-ended="true"]')).toBeNull();
  });
});
