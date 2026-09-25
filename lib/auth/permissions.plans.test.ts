import { describe, expect, it } from 'vitest';

import type { PlanId } from '@/lib/domain/billing/plans';
import type { EntitlementsContext, SubscriptionStatus } from '@/types/permissions';

import {
  FREE_PLAN_BOARD_LIMIT,
  getBoardLimitForEntitlements,
  hasPremiumEntitlements,
  hasProEntitlements,
} from './permissions';

function entitlements(plan: PlanId, status: SubscriptionStatus): EntitlementsContext {
  return { plan, status };
}

const GRANTING: SubscriptionStatus[] = ['active', 'trialing', 'past_due'];

describe('hasProEntitlements', () => {
  it('is true for pro and premium with a granting status', () => {
    for (const status of GRANTING) {
      expect(hasProEntitlements(entitlements('pro', status))).toBe(true);
      expect(hasProEntitlements(entitlements('premium', status))).toBe(true);
    }
  });

  it('is false for free', () => {
    expect(hasProEntitlements(entitlements('free', 'free'))).toBe(false);
    expect(hasProEntitlements(entitlements('free', 'active'))).toBe(false);
  });

  it('is false for canceled', () => {
    expect(hasProEntitlements(entitlements('pro', 'canceled'))).toBe(false);
    expect(hasProEntitlements(entitlements('premium', 'canceled'))).toBe(false);
  });
});

describe('hasPremiumEntitlements', () => {
  it('is true only for premium with a granting status', () => {
    for (const status of GRANTING) {
      expect(hasPremiumEntitlements(entitlements('premium', status))).toBe(true);
    }
  });

  it('is false for pro, free, and non-granting statuses', () => {
    expect(hasPremiumEntitlements(entitlements('pro', 'active'))).toBe(false);
    expect(hasPremiumEntitlements(entitlements('free', 'active'))).toBe(false);
    expect(hasPremiumEntitlements(entitlements('premium', 'canceled'))).toBe(false);
    expect(hasPremiumEntitlements(entitlements('premium', 'free'))).toBe(false);
  });
});

describe('getBoardLimitForEntitlements', () => {
  it('free → 3', () => {
    expect(getBoardLimitForEntitlements(entitlements('free', 'free'))).toBe(3);
    expect(getBoardLimitForEntitlements(entitlements('free', 'active'))).toBe(3);
  });

  it('pro active → unlimited', () => {
    expect(getBoardLimitForEntitlements(entitlements('pro', 'active'))).toBe('unlimited');
  });

  it('premium active → unlimited', () => {
    expect(getBoardLimitForEntitlements(entitlements('premium', 'active'))).toBe('unlimited');
  });

  it('premium canceled → 3', () => {
    expect(getBoardLimitForEntitlements(entitlements('premium', 'canceled'))).toBe(3);
  });

  it('FREE_PLAN_BOARD_LIMIT === 3', () => {
    expect(FREE_PLAN_BOARD_LIMIT).toBe(3);
  });
});
