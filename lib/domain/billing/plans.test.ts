import { describe, expect, it } from 'vitest';

import {
  PAID_PLAN_IDS,
  PLANS,
  PLAN_ORDER,
  effectivePlanId,
  isPlanId,
  planIncludes,
  planLimits,
  statusGrantsPlan,
} from './plans';

// Deliberately independent of the module's own MB constant: if the source's
// unit were wrong, this assertion would still catch it.
const MB = 1024 * 1024;

describe('PRICING.md §3 — every plan, value by value', () => {
  it('Free', () => {
    expect(PLANS.free.id).toBe('free');
    expect(PLANS.free.name).toBe('Free');
    expect(PLANS.free.priceUsd.monthly).toBe(0);
    expect(PLANS.free.priceUsd.yearly).toBe(0);
    expect(PLANS.free.limits.boards).toBe(3);
    expect(PLANS.free.limits.fileSizeBytes).toBe(20 * MB);
    expect(PLANS.free.limits.processedDocuments).toBe(5);
    expect(PLANS.free.limits.pagesPerPdf).toBe(50);
    expect(PLANS.free.limits.monthlyAiCredits).toBe(10);
    expect(PLANS.free.limits.welcomeAiCredits).toBe(30);
    expect(PLANS.free.limits.modelTier).toBe('basic');
  });

  it('Pro', () => {
    expect(PLANS.pro.id).toBe('pro');
    expect(PLANS.pro.name).toBe('Pro');
    expect(PLANS.pro.priceUsd.monthly).toBe(9);
    expect(PLANS.pro.priceUsd.yearly).toBe(90);
    expect(PLANS.pro.limits.boards).toBeNull();
    expect(PLANS.pro.limits.fileSizeBytes).toBe(250 * MB);
    expect(PLANS.pro.limits.processedDocuments).toBeNull();
    expect(PLANS.pro.limits.pagesPerPdf).toBe(500);
    expect(PLANS.pro.limits.monthlyAiCredits).toBe(500);
    expect(PLANS.pro.limits.welcomeAiCredits).toBe(0);
    expect(PLANS.pro.limits.modelTier).toBe('basic');
  });

  it('Premium', () => {
    expect(PLANS.premium.id).toBe('premium');
    expect(PLANS.premium.name).toBe('Premium');
    expect(PLANS.premium.priceUsd.monthly).toBe(19);
    expect(PLANS.premium.priceUsd.yearly).toBe(190);
    expect(PLANS.premium.limits.boards).toBeNull();
    expect(PLANS.premium.limits.fileSizeBytes).toBe(1024 * MB);
    expect(PLANS.premium.limits.processedDocuments).toBeNull();
    expect(PLANS.premium.limits.pagesPerPdf).toBe(2000);
    expect(PLANS.premium.limits.monthlyAiCredits).toBe(2000);
    expect(PLANS.premium.limits.welcomeAiCredits).toBe(0);
    expect(PLANS.premium.limits.modelTier).toBe('premium');
  });

  it('PLAN_ORDER and PAID_PLAN_IDS', () => {
    expect(PLAN_ORDER).toEqual(['free', 'pro', 'premium']);
    expect(PAID_PLAN_IDS).toEqual(['pro', 'premium']);
  });
});

describe('isPlanId', () => {
  it('accepts exactly the three plan ids', () => {
    expect(isPlanId('free')).toBe(true);
    expect(isPlanId('pro')).toBe(true);
    expect(isPlanId('premium')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isPlanId('enterprise')).toBe(false);
    expect(isPlanId('')).toBe(false);
    expect(isPlanId(null)).toBe(false);
    expect(isPlanId(undefined)).toBe(false);
    expect(isPlanId(3)).toBe(false);
    expect(isPlanId({})).toBe(false);
  });
});

describe('statusGrantsPlan', () => {
  it('grants active, trialing and past_due', () => {
    expect(statusGrantsPlan('active')).toBe(true);
    expect(statusGrantsPlan('trialing')).toBe(true);
    expect(statusGrantsPlan('past_due')).toBe(true);
  });

  it('refuses every other status', () => {
    for (const status of [
      'canceled',
      'unpaid',
      'incomplete',
      'incomplete_expired',
      'free',
      'weird',
      '',
      null,
      undefined,
    ]) {
      expect(statusGrantsPlan(status)).toBe(false);
    }
  });
});

describe('effectivePlanId', () => {
  it('pro + active → pro', () => {
    expect(effectivePlanId('pro', 'active')).toBe('pro');
  });

  it('premium + trialing → premium', () => {
    expect(effectivePlanId('premium', 'trialing')).toBe('premium');
  });

  it('premium + canceled → free', () => {
    expect(effectivePlanId('premium', 'canceled')).toBe('free');
  });

  it('pro + null status → free', () => {
    expect(effectivePlanId('pro', null)).toBe('free');
  });

  it("'enterprise' + active → free", () => {
    expect(effectivePlanId('enterprise', 'active')).toBe('free');
  });
});

describe('planIncludes over the full 3×3 matrix', () => {
  const ids = ['free', 'pro', 'premium'] as const;
  const expected: Record<string, boolean> = {
    'free:free': true,
    'free:pro': false,
    'free:premium': false,
    'pro:free': true,
    'pro:pro': true,
    'pro:premium': false,
    'premium:free': true,
    'premium:pro': true,
    'premium:premium': true,
  };

  for (const planId of ids) {
    for (const required of ids) {
      it(`${planId} includes ${required}`, () => {
        expect(planIncludes(planId, required)).toBe(expected[`${planId}:${required}`]);
      });
    }
  }
});

describe('planLimits', () => {
  it('returns the plan limits object', () => {
    expect(planLimits('free')).toBe(PLANS.free.limits);
    expect(planLimits('pro')).toBe(PLANS.pro.limits);
    expect(planLimits('premium')).toBe(PLANS.premium.limits);
  });
});

describe('the objects are frozen', () => {
  it('PLANS plus every nested object, and the id lists', () => {
    expect(Object.isFrozen(PLANS)).toBe(true);
    for (const id of PLAN_ORDER) {
      expect(Object.isFrozen(PLANS[id])).toBe(true);
      expect(Object.isFrozen(PLANS[id].priceUsd)).toBe(true);
      expect(Object.isFrozen(PLANS[id].limits)).toBe(true);
    }
    expect(Object.isFrozen(PLAN_ORDER)).toBe(true);
    expect(Object.isFrozen(PAID_PLAN_IDS)).toBe(true);
  });
});
