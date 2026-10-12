import { describe, expect, it } from 'vitest';
import {
  LOW_CREDIT_FRACTION,
  creditFillPercent,
  creditLevel,
  creditWarningKey,
  shouldWarnCreditOnce,
  type CreditWarningStorage,
} from './creditLevel';

describe('PATCH-343 creditLevel', () => {
  it('is ok above the fraction', () => {
    expect(creditLevel(1500, 2000)).toBe('ok');
    expect(LOW_CREDIT_FRACTION).toBe(0.2);
  });

  it('is low at exactly 20%', () => {
    expect(creditLevel(400, 2000)).toBe('low');
    expect(creditLevel(401, 2000)).toBe('ok');
  });

  it('is empty at 0 remaining, and when there is no allowance', () => {
    expect(creditLevel(0, 2000)).toBe('empty');
    expect(creditLevel(5, 0)).toBe('empty');
    expect(creditLevel(0, 0)).toBe('empty');
  });

  it('fill percent rounds and clamps', () => {
    expect(creditFillPercent(1500, 2000)).toBe(75);
    expect(creditFillPercent(1, 3)).toBe(33);
    expect(creditFillPercent(0, 2000)).toBe(0);
    expect(creditFillPercent(5, 0)).toBe(0);
    expect(creditFillPercent(3000, 2000)).toBe(100);
    expect(creditFillPercent(-5, 2000)).toBe(0);
  });
});

function memoryStorage(): CreditWarningStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { map.set(key, value); },
  };
}

describe('PATCH-343 shouldWarnCreditOnce', () => {
  it('warns once per renewsOn + level, and again for a different level/period', () => {
    const storage = memoryStorage();
    const warned = new Set<string>();

    expect(shouldWarnCreditOnce(storage, warned, '2026-10-25T00:00:00.000Z', 'low')).toBe(true);
    expect(shouldWarnCreditOnce(storage, warned, '2026-10-25T00:00:00.000Z', 'low')).toBe(false);
    expect(shouldWarnCreditOnce(storage, warned, '2026-10-25T00:00:00.000Z', 'empty')).toBe(true);
    expect(shouldWarnCreditOnce(storage, warned, '2026-11-25T00:00:00.000Z', 'low')).toBe(true);
  });

  it('falls back to the in-memory set when storage throws', () => {
    const throwing: CreditWarningStorage = {
      getItem: () => { throw new Error('blocked'); },
      setItem: () => { throw new Error('blocked'); },
    };
    const warned = new Set<string>();

    expect(shouldWarnCreditOnce(throwing, warned, null, 'low')).toBe(true);
    expect(shouldWarnCreditOnce(throwing, warned, null, 'low')).toBe(false);
  });

  it('builds a key from the period and level', () => {
    expect(creditWarningKey('2026-10-25T00:00:00.000Z', 'empty'))
      .toBe('collabboard:ai-credit-warned:2026-10-25T00:00:00.000Z:empty');
    expect(creditWarningKey(null, 'low')).toBe('collabboard:ai-credit-warned:none:low');
  });
});
