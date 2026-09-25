import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// PATCH-183. These are obviously fake placeholder ids, never real Stripe ids.
const FAKE_PRICES = {
  STRIPE_PRICE_PRO_MONTHLY: 'price_test_pro_monthly',
  STRIPE_PRICE_PRO_YEARLY: 'price_test_pro_yearly',
  STRIPE_PRICE_PREMIUM_MONTHLY: 'price_test_premium_monthly',
  STRIPE_PRICE_PREMIUM_YEARLY: 'price_test_premium_yearly',
} as const;

// `client.ts` reads env at import time, so set it, then import a fresh module.
async function loadClient(env: Record<string, string> = FAKE_PRICES) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) {
    vi.stubEnv(key, value);
  }
  return import('./client');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('getStripePriceId', () => {
  it('maps two paid plans × two intervals', async () => {
    const { getStripePriceId } = await loadClient();
    expect(getStripePriceId('pro', 'monthly')).toBe(FAKE_PRICES.STRIPE_PRICE_PRO_MONTHLY);
    expect(getStripePriceId('pro', 'yearly')).toBe(FAKE_PRICES.STRIPE_PRICE_PRO_YEARLY);
    expect(getStripePriceId('premium', 'monthly')).toBe(FAKE_PRICES.STRIPE_PRICE_PREMIUM_MONTHLY);
    expect(getStripePriceId('premium', 'yearly')).toBe(FAKE_PRICES.STRIPE_PRICE_PREMIUM_YEARLY);
  });

  it('defaults to monthly', async () => {
    const { getStripePriceId } = await loadClient();
    expect(getStripePriceId('pro')).toBe(FAKE_PRICES.STRIPE_PRICE_PRO_MONTHLY);
    expect(getStripePriceId('premium')).toBe(FAKE_PRICES.STRIPE_PRICE_PREMIUM_MONTHLY);
  });

  it('free → null', async () => {
    const { getStripePriceId } = await loadClient();
    expect(getStripePriceId('free')).toBeNull();
  });

  it('an unknown plan → null', async () => {
    const { getStripePriceId } = await loadClient();
    expect(getStripePriceId('gold')).toBeNull();
  });
});

describe('planForStripePrice', () => {
  it('maps each of the four prices', async () => {
    const { planForStripePrice } = await loadClient();
    expect(planForStripePrice(FAKE_PRICES.STRIPE_PRICE_PRO_MONTHLY)).toBe('pro');
    expect(planForStripePrice(FAKE_PRICES.STRIPE_PRICE_PRO_YEARLY)).toBe('pro');
    expect(planForStripePrice(FAKE_PRICES.STRIPE_PRICE_PREMIUM_MONTHLY)).toBe('premium');
    expect(planForStripePrice(FAKE_PRICES.STRIPE_PRICE_PREMIUM_YEARLY)).toBe('premium');
  });

  it('an unknown price → free', async () => {
    const { planForStripePrice } = await loadClient();
    expect(planForStripePrice('price_test_unknown')).toBe('free');
  });

  it('a missing price → free', async () => {
    const { planForStripePrice } = await loadClient();
    expect(planForStripePrice(null)).toBe('free');
    expect(planForStripePrice(undefined)).toBe('free');
    expect(planForStripePrice('')).toBe('free');
  });

  it("with a premium env var set to '', planForStripePrice('') → free", async () => {
    const { planForStripePrice } = await loadClient({
      ...FAKE_PRICES,
      STRIPE_PRICE_PREMIUM_MONTHLY: '',
    });
    expect(planForStripePrice('')).toBe('free');
  });

  it('an empty env var never matches a non-empty price', async () => {
    const { planForStripePrice } = await loadClient({
      ...FAKE_PRICES,
      STRIPE_PRICE_PREMIUM_MONTHLY: '',
    });
    expect(planForStripePrice('price_test_premium_monthly')).toBe('free');
    expect(planForStripePrice(FAKE_PRICES.STRIPE_PRICE_PRO_MONTHLY)).toBe('pro');
  });
});

describe('parseCheckoutRequest', () => {
  it("plan: 'premium' uses the premium price", async () => {
    const { getStripePriceId, parseCheckoutRequest } = await loadClient();
    const parsed = parseCheckoutRequest({ plan: 'premium', interval: 'monthly' });
    expect(parsed).toEqual({ ok: true, plan: 'premium', interval: 'monthly' });
    if (parsed.ok) {
      expect(getStripePriceId(parsed.plan, parsed.interval)).toBe(
        FAKE_PRICES.STRIPE_PRICE_PREMIUM_MONTHLY,
      );
    }
  });

  it("plan: 'pro' is accepted", async () => {
    const { parseCheckoutRequest } = await loadClient();
    expect(parseCheckoutRequest({ plan: 'pro' })).toEqual({
      ok: true,
      plan: 'pro',
      interval: 'monthly',
    });
  });

  it("plan: 'free' → Unknown plan", async () => {
    const { parseCheckoutRequest } = await loadClient();
    expect(parseCheckoutRequest({ plan: 'free' })).toEqual({
      ok: false,
      error: 'Unknown plan',
    });
  });

  it('a missing plan → Unknown plan', async () => {
    const { parseCheckoutRequest } = await loadClient();
    expect(parseCheckoutRequest({ interval: 'monthly' })).toEqual({
      ok: false,
      error: 'Unknown plan',
    });
    expect(parseCheckoutRequest({})).toEqual({ ok: false, error: 'Unknown plan' });
    expect(parseCheckoutRequest(null)).toEqual({ ok: false, error: 'Unknown plan' });
  });

  it("plan: 'gold' → Unknown plan", async () => {
    const { parseCheckoutRequest } = await loadClient();
    expect(parseCheckoutRequest({ plan: 'gold' })).toEqual({
      ok: false,
      error: 'Unknown plan',
    });
  });

  it('interval handling is unchanged', async () => {
    const { parseCheckoutRequest } = await loadClient();
    expect(parseCheckoutRequest({ plan: 'pro', interval: 'yearly' })).toEqual({
      ok: true,
      plan: 'pro',
      interval: 'yearly',
    });
    expect(parseCheckoutRequest({ plan: 'pro', interval: 'weekly' })).toEqual({
      ok: true,
      plan: 'pro',
      interval: 'monthly',
    });
    expect(parseCheckoutRequest({ plan: 'premium', interval: 'monthly' })).toEqual({
      ok: true,
      plan: 'premium',
      interval: 'monthly',
    });
  });
});

describe('the plan routes parse their body with parseCheckoutRequest', () => {
  it('the checkout factory calls it, and the app route delegates to the factory', () => {
    const factory = readFileSync(
      resolve(__dirname, '../server/billing/checkoutRoute.ts'),
      'utf8',
    );
    expect(factory).toContain('parseCheckoutRequest');

    const route = readFileSync(
      resolve(__dirname, '../../app/api/stripe/checkout/route.ts'),
      'utf8',
    );
    expect(route).toContain('createCheckoutHandler');
    expect(route).toContain('@/lib/server/billing/checkoutRoute');
  });

  it('the change-plan factory calls it, and the app route delegates to the factory', () => {
    const factory = readFileSync(
      resolve(__dirname, '../server/billing/changePlanRoute.ts'),
      'utf8',
    );
    expect(factory).toContain('parseCheckoutRequest');

    const route = readFileSync(
      resolve(__dirname, '../../app/api/stripe/change-plan/route.ts'),
      'utf8',
    );
    expect(route).toContain('createChangePlanHandler');
    expect(route).toContain('@/lib/server/billing/changePlanRoute');
  });
});
