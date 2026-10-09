// PATCH-330 Addendum 1. A week range is seven days: the end is the last day
// (start + 6), not the first day of the next week.
import { describe, expect, it } from 'vitest';
import { formatWeekRangeLabel } from '@/components/gantt-canvas/dateUtils';

describe('PATCH-330 Addendum 1 formatWeekRangeLabel', () => {
  it('Week #41 2026 is 5-11 October 2026, not 5-12', () => {
    expect(formatWeekRangeLabel(new Date(2026, 9, 5))).toBe('5-11 October 2026');
  });

  it('a week across months reads 28 September-4 October 2026', () => {
    expect(formatWeekRangeLabel(new Date(2026, 8, 28))).toBe('28 September-4 October 2026');
  });

  it('a week across years reads 28 December 2026-3 January 2027', () => {
    expect(formatWeekRangeLabel(new Date(2026, 11, 28))).toBe('28 December 2026-3 January 2027');
  });
});
