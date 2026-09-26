import { describe, expect, it } from 'vitest';

import {
  AI_CREDIT_COSTS,
  BOARD_CHAT_SEARCH_SURCHARGE,
  PLAN_CREDITS_EXHAUSTED_CODE,
  PLAN_NO_BOARD_CODE,
  PLAN_NO_BOARD_ERROR,
  PLAN_NO_WORKSPACE_CODE,
  PLAN_NO_WORKSPACE_ERROR,
  PAID_PLAN_IDS,
  PLANS,
  PLAN_CURRENCY,
  PLAN_ORDER,
  PLAN_PAGE_LIMIT_PREFIX,
  aiCreditBalance,
  aiCreditPeriod,
  effectivePlanId,
  formatPlanPrice,
  isPlanId,
  isPlanPageLimitError,
  planCreditsExhaustedError,
  planIncludes,
  planLimits,
  planPageLimitError,
  splitAiCreditCharge,
  statusGrantsPlan,
  transcriptPunctuateCredits,
} from './plans';
import { sanitizeKnowledgeProcessingError } from '../knowledge/knowledgeExtraction';

// Deliberately independent of the module's own MB constant: if the source's
// unit were wrong, this assertion would still catch it.
const MB = 1024 * 1024;

describe('PRICING.md §3 — every plan, value by value', () => {
  it('Free', () => {
    expect(PLANS.free.id).toBe('free');
    expect(PLANS.free.name).toBe('Free');
    expect(PLANS.free.price.monthly).toBe(0);
    expect(PLANS.free.price.yearly).toBe(0);
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
    expect(PLANS.pro.price.monthly).toBe(9);
    expect(PLANS.pro.price.yearly).toBe(90);
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
    expect(PLANS.premium.price.monthly).toBe(19);
    expect(PLANS.premium.price.yearly).toBe(190);
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

describe('planPageLimitError', () => {
  it('is the exact stored refusal text', () => {
    expect(planPageLimitError(612, 50, 'Free')).toBe(
      'Page limit: This PDF has 612 pages. The Free plan allows 50 pages per PDF.',
    );
    expect(PLAN_PAGE_LIMIT_PREFIX).toBe('Page limit: ');
  });

  it('is recognised by isPlanPageLimitError, and nothing else is', () => {
    expect(isPlanPageLimitError(planPageLimitError(612, 50, 'Free'))).toBe(true);
    expect(isPlanPageLimitError('Extraction failed')).toBe(false);
    expect(isPlanPageLimitError(null)).toBe(false);
    expect(isPlanPageLimitError(undefined)).toBe(false);
    expect(isPlanPageLimitError(42)).toBe(false);
  });

  it('passes sanitizeKnowledgeProcessingError unchanged', () => {
    const message = planPageLimitError(612, 50, 'Free');
    expect(sanitizeKnowledgeProcessingError(message)).toBe(message);
    // No URL, token or secret construct for the sanitizer to touch.
    expect(message).not.toMatch(/[a-z][a-z0-9+.-]*:\/\//i);
    expect(message.length).toBeLessThanOrEqual(500);
  });
});

describe('formatPlanPrice', () => {
  it('shows the CHF amount, two decimals only when needed', () => {
    expect(PLAN_CURRENCY).toBe('CHF');
    expect(formatPlanPrice(9)).toBe('CHF 9');
    expect(formatPlanPrice(9.5)).toBe('CHF 9.50');
    expect(formatPlanPrice(0)).toBe('CHF 0');
    expect(formatPlanPrice(190)).toBe('CHF 190');
  });
});

describe('the objects are frozen', () => {
  it('PLANS plus every nested object, and the id lists', () => {
    expect(Object.isFrozen(PLANS)).toBe(true);
    for (const id of PLAN_ORDER) {
      expect(Object.isFrozen(PLANS[id])).toBe(true);
      expect(Object.isFrozen(PLANS[id].price)).toBe(true);
      expect(Object.isFrozen(PLANS[id].limits)).toBe(true);
    }
    expect(Object.isFrozen(PLAN_ORDER)).toBe(true);
    expect(Object.isFrozen(PAID_PLAN_IDS)).toBe(true);
  });
});

describe('PATCH-187 — AI credits', () => {
  it('AI_CREDIT_COSTS values', () => {
    expect(AI_CREDIT_COSTS).toEqual({
      board_chat: 1,
      table_from_document: 3,
      wiki_compile: 10,
      text_action: 1,
      table_fill: 1,
      table_plan: 1,
      transcript_punctuate: 1,
      component: 1,
    });
    expect(BOARD_CHAT_SEARCH_SURCHARGE).toBe(1);
    expect(Object.isFrozen(AI_CREDIT_COSTS)).toBe(true);
  });

  it('boardChatWhenOutOfCredits per plan', () => {
    expect(PLANS.free.limits.boardChatWhenOutOfCredits).toBe(false);
    expect(PLANS.pro.limits.boardChatWhenOutOfCredits).toBe(true);
    expect(PLANS.premium.limits.boardChatWhenOutOfCredits).toBe(true);
  });

  describe('aiCreditPeriod', () => {
    it('a paid period that contains now → that period', () => {
      const now = new Date('2026-09-15T12:00:00Z');
      const period = aiCreditPeriod(now, {
        start: '2026-09-01T00:00:00Z',
        end: '2026-10-01T00:00:00Z',
      });
      expect(period.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(period.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('no period → the UTC calendar month', () => {
      const period = aiCreditPeriod(new Date('2026-09-15T12:00:00Z'), null);
      expect(period.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(period.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('an expired period → the calendar month', () => {
      const period = aiCreditPeriod(new Date('2026-09-15T12:00:00Z'), {
        start: '2026-07-01T00:00:00Z',
        end: '2026-08-01T00:00:00Z',
      });
      expect(period.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
      expect(period.end.toISOString()).toBe('2026-10-01T00:00:00.000Z');
    });

    it('now at 2026-12-31T23:59Z → December to 1 January', () => {
      const period = aiCreditPeriod(new Date('2026-12-31T23:59:00Z'), null);
      expect(period.start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
      expect(period.end.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    });
  });

  describe('aiCreditBalance', () => {
    const period = aiCreditPeriod(new Date('2026-09-15T12:00:00Z'), null);

    it('Free, fresh → 40 remaining', () => {
      const balance = aiCreditBalance(PLANS.free.limits, period, { allowanceUsed: 0, grantUsed: 0 });
      expect(balance.allowance).toBe(10);
      expect(balance.grantTotal).toBe(30);
      expect(balance.remaining).toBe(40);
    });

    it('Free with 10 allowance used and 5 grant used → 25', () => {
      const balance = aiCreditBalance(PLANS.free.limits, period, { allowanceUsed: 10, grantUsed: 5 });
      expect(balance.remaining).toBe(25);
    });

    it('Pro → 500, grant 0', () => {
      const balance = aiCreditBalance(PLANS.pro.limits, period, { allowanceUsed: 0, grantUsed: 0 });
      expect(balance.allowance).toBe(500);
      expect(balance.grantTotal).toBe(0);
      expect(balance.remaining).toBe(500);
    });

    it('an overspent allowance never goes negative', () => {
      const balance = aiCreditBalance(PLANS.free.limits, period, { allowanceUsed: 999, grantUsed: 0 });
      expect(balance.remaining).toBe(30);
    });
  });

  describe('splitAiCreditCharge', () => {
    const period = aiCreditPeriod(new Date('2026-09-15T12:00:00Z'), null);
    const balanceOf = (allowanceUsed: number, grantUsed: number) =>
      aiCreditBalance(PLANS.free.limits, period, { allowanceUsed, grantUsed });

    it('all from the allowance', () => {
      expect(splitAiCreditCharge(balanceOf(0, 0), 3)).toEqual([
        { bucket: 'allowance', credits: 3 },
      ]);
    });

    it('allowance then grant (1 allowance left, charge 3 → 1 + 2)', () => {
      expect(splitAiCreditCharge(balanceOf(9, 0), 3)).toEqual([
        { bucket: 'allowance', credits: 1 },
        { bucket: 'grant', credits: 2 },
      ]);
    });

    it('overflow on the allowance when the grant is spent', () => {
      expect(splitAiCreditCharge(balanceOf(10, 30), 3)).toEqual([
        { bucket: 'allowance', credits: 3 },
      ]);
    });

    it('0 → []', () => {
      expect(splitAiCreditCharge(balanceOf(0, 0), 0)).toEqual([]);
    });
  });

  it('planCreditsExhaustedError is the exact text', () => {
    expect(planCreditsExhaustedError('Free', new Date('2026-10-01T00:00:00Z'))).toBe(
      "The Free plan's AI credits for this month are used up. They renew on 1 October. Upgrade for more.",
    );
    expect(PLAN_CREDITS_EXHAUSTED_CODE).toBe('plan_limit_credits');
  });

  it('PLAN_NO_WORKSPACE_ERROR is the exact text', () => {
    expect(PLAN_NO_WORKSPACE_ERROR).toBe(
      "This board isn't in a workspace, so it has no AI credits. Your own AI key still works here.",
    );
    expect(PLAN_NO_WORKSPACE_CODE).toBe('plan_limit_no_workspace');
  });
});

describe('PATCH-188 — board-less AI actions', () => {
  it('transcriptPunctuateCredits is one credit per ten passages, at least one', () => {
    expect(transcriptPunctuateCredits(1)).toBe(1);
    expect(transcriptPunctuateCredits(10)).toBe(1);
    expect(transcriptPunctuateCredits(11)).toBe(2);
    expect(transcriptPunctuateCredits(12)).toBe(2);
  });

  it('PLAN_NO_BOARD text and code', () => {
    expect(PLAN_NO_BOARD_CODE).toBe('plan_limit_no_board');
    expect(PLAN_NO_BOARD_ERROR).toBe(
      "This AI action isn't linked to a board, so it has no AI credits. Your own AI key still works.",
    );
  });
});
