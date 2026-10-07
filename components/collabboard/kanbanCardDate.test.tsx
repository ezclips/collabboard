// PATCH-319. `cardDate` turns a stored kanban date into a local `YYYY-MM-DD`
// for `<input type="date">`, without shifting a date-only value by timezone.
import { describe, expect, it } from 'vitest';
import { parseCardDate, toDateInputValue } from '@/components/kanban-canvas/cardDate';

const pad = (n: number) => String(n).padStart(2, '0');
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

describe('PATCH-319: cardDate', () => {
  it('keeps a date-only value as the same local day', () => {
    expect(toDateInputValue('2026-10-10')).toBe('2026-10-10');
  });

  it('formats an ISO midnight-UTC value as its local day', () => {
    const value = '2026-10-10T00:00:00+00:00';
    expect(toDateInputValue(value)).toBe(localYmd(new Date(value)));
  });

  it('formats an ISO local-time value from the calendar as its local day', () => {
    const value = '2026-10-10T13:45:00.000Z';
    expect(toDateInputValue(value)).toBe(localYmd(new Date(value)));
  });

  it('returns empty for missing or garbage values', () => {
    expect(toDateInputValue()).toBe('');
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue('not-a-date')).toBe('');
  });

  it('parseCardDate reads a date-only value as a local date and rejects garbage', () => {
    expect(parseCardDate('not-a-date')).toBeNull();
    const d = parseCardDate('2026-10-10')!;
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(9);
    expect(d.getDate()).toBe(10);
  });
});
