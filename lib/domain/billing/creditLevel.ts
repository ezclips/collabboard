/**
 * PATCH-343. The AI credit bar's arithmetic and its one-time low warning.
 * Pure: no React, no DOM, no storage of its own -- the caller passes storage in
 * so the remember/should-warn rule can be unit-tested.
 */

export const LOW_CREDIT_FRACTION = 0.2;

export type CreditLevel = 'ok' | 'low' | 'empty';

/**
 * `empty` when there is no allowance at all or nothing left; `low` at or below
 * the fraction; `ok` otherwise.
 */
export function creditLevel(remaining: number, total: number): CreditLevel {
  if (total <= 0 || remaining <= 0) return 'empty';
  if (remaining / total <= LOW_CREDIT_FRACTION) return 'low';
  return 'ok';
}

/** The fill width, 0..100, rounded; 0 when there is no allowance. */
export function creditFillPercent(remaining: number, total: number): number {
  if (total <= 0) return 0;
  const percent = Math.round((remaining / total) * 100);
  return Math.max(0, Math.min(100, percent));
}

/** The storage key the warning is remembered under, per period and level. */
export function creditWarningKey(renewsOn: string | null, level: CreditLevel): string {
  return `collabboard:ai-credit-warned:${renewsOn ?? 'none'}:${level}`;
}

/** The two storage methods the warning needs; a real Storage satisfies it. */
export interface CreditWarningStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Whether to show the one-time warning, remembering it if so. Every storage
 * access is guarded: if storage throws, the `fallbackWarned` set (owned by the
 * caller, one per page load) warns at most once instead.
 */
export function shouldWarnCreditOnce(
  storage: CreditWarningStorage | null,
  fallbackWarned: Set<string>,
  renewsOn: string | null,
  level: CreditLevel,
): boolean {
  const key = creditWarningKey(renewsOn, level);
  if (storage) {
    try {
      if (storage.getItem(key) === '1') return false;
      storage.setItem(key, '1');
      return true;
    } catch {
      // fall through to the in-memory guard below
    }
  }
  if (fallbackWarned.has(key)) return false;
  fallbackWarned.add(key);
  return true;
}
