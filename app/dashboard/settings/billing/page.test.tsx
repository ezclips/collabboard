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
  getSession: vi.fn(),
  from: vi.fn(),
  getPermissionContext: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@/lib/supabase-provider', () => ({
  useSupabase: () => ({
    supabase: {
      auth: { getUser: mocks.getUser, getSession: mocks.getSession },
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

/** PATCH-191. The usage endpoint, stubbed at the fetch seam. */
function stubUsage(payload: unknown, status = 200) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  })) as unknown as typeof fetch);
}

const PRO_USAGE = {
  planId: 'pro',
  trialEndsAt: null,
  credits: { used: 7, total: 500, remaining: 493, renewsOn: '2026-10-25T17:35:45.000Z' },
  documents: { used: 38, limit: null },
  boards: { used: 12, limit: null },
};

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'test-token' } } });
  mocks.from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ is: async () => ({ count: 0 }) }) }),
  }));
  stubUsage(PRO_USAGE);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
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

describe('PATCH-191 — the usage meters', () => {
  const expiration = '2026-10-03T00:00:00.000Z';
  const usageSection = () => container.querySelector('[data-billing-usage="true"]')!;
  const meters = () => Array.from(container.querySelectorAll('[data-billing-usage="true"] [role="meter"]'));

  it('Pro shows credits used and the renewal date, the document count and the boards', async () => {
    await renderEntitled({ plan: 'pro', status: 'active', trialEndsAt: null });

    expect(text()).toContain('7 of 500 used');
    expect(text()).toContain('renews on 25 October');
    expect(text()).toContain('38 processed');
    expect(text()).toContain('12 boards');
    // Credits have a limit, so a bar exists for them.
    expect(meters().length).toBeGreaterThanOrEqual(1);
  });

  it('during the trial the credits read "of 100" and say when the trial ends', async () => {
    stubUsage({
      planId: 'premium',
      trialEndsAt: '2026-10-03T00:00:00.000Z',
      credits: { used: 7, total: 100, remaining: 93, renewsOn: '2026-10-03T00:00:00.000Z' },
      documents: { used: 38, limit: null },
      boards: { used: 12, limit: null },
    });
    await renderEntitled({ plan: 'premium', status: 'free', trialEndsAt: expiration });

    expect(text()).toContain('7 of 100 used');
    expect(text()).toContain('trial ends on 3 October');
  });

  it('Free shows "No AI on Free" with a See plans link and NO credits bar', async () => {
    stubUsage({
      planId: 'free',
      trialEndsAt: null,
      credits: { used: 0, total: 0, remaining: 0, renewsOn: null },
      documents: { used: 38, limit: 0 },
      boards: { used: 3, limit: 3 },
    });
    await renderEntitled({ plan: 'free', status: 'free', trialEndsAt: null });

    expect(text()).toContain('No AI on Free');
    expect(usageSection().querySelector('a[href="/dashboard/settings/billing"]')).not.toBeNull();
    expect(text()).toContain('38 processed · no new documents on Free');
    // Only the boards meter exists; credits have no bar.
    expect(meters()).toHaveLength(1);
  });

  it('3 of 3 boards is a full bar in the error colour', async () => {
    stubUsage({
      planId: 'free',
      trialEndsAt: null,
      credits: { used: 0, total: 0, remaining: 0, renewsOn: null },
      documents: { used: 38, limit: 0 },
      boards: { used: 3, limit: 3 },
    });
    await renderEntitled({ plan: 'free', status: 'free', trialEndsAt: null });

    expect(text()).toContain('3 of 3 boards');
    const meter = meters()[0];
    expect(meter.getAttribute('aria-valuenow')).toBe('3');
    expect(meter.getAttribute('aria-valuemax')).toBe('3');
    const fill = meter.querySelector('[data-meter-fill="true"]')!;
    expect(fill.className).toContain('bg-red-600');
    expect((fill as HTMLElement).style.width).toBe('100%');
  });

  it('a failed usage read says so and the plan cards still render', async () => {
    stubUsage({ error: 'Usage is unavailable right now.' }, 503);
    await renderEntitled({ plan: 'pro', status: 'active', trialEndsAt: null });

    expect(text()).toContain('Usage is unavailable right now.');
    // The rest of the page is unaffected.
    expect(text()).toContain('Premium');
    expect(usageSection().querySelectorAll('[role="meter"]')).toHaveLength(0);
  });
});
