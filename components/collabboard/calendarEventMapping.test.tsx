// PATCH-328. The shared event → card-field mapping, in explicit zones.
import { describe, expect, it } from 'vitest';
import { eventToCardFields } from '@/lib/kanban/calendarEventMapping';

describe('PATCH-328 eventToCardFields', () => {
  it('keeps all-day inclusive dates and drops empty parts', () => {
    const fields = eventToCardFields(
      { title: 'Holiday', description: '', allDay: true, startDate: '2026-06-10', endDate: '2026-06-12' },
      'Europe/Berlin',
    );
    expect(fields).toEqual({ label: 'Holiday', startDate: '2026-06-10', endDate: '2026-06-12' });
    expect(fields.description).toBeUndefined();
  });

  it('formats a timed event in Europe/Berlin', () => {
    const fields = eventToCardFields({
      title: 'Late call',
      description: '',
      location: 'Room 1',
      allDay: false,
      startIso: '2026-10-10T23:30:00.000Z',
      endIso: '2026-10-11T01:00:00.000Z',
    }, 'Europe/Berlin');
    // 23:30Z + 2h = 01:30 on the 11th; 01:00Z + 2h = 03:00 on the 11th.
    expect(fields.startDate).toBe('2026-10-11');
    expect(fields.endDate).toBe('2026-10-11');
    expect(fields.description).toBe('01:30\u201303:00\n\nLocation: Room 1');
  });

  it('formats the same instant differently in America/New_York', () => {
    const fields = eventToCardFields({
      title: 'Late call',
      description: '',
      allDay: false,
      startIso: '2026-10-10T23:30:00.000Z',
      endIso: '2026-10-11T01:00:00.000Z',
    }, 'America/New_York');
    // 23:30Z - 4h = 19:30 on the 10th; 01:00Z - 4h = 21:00 on the 10th.
    expect(fields.startDate).toBe('2026-10-10');
    expect(fields.endDate).toBe('2026-10-10');
    expect(fields.description).toBe('19:30\u201321:00');
  });

  it('ends on the day of end − 1 ms, so a midnight end does not spill over', () => {
    const fields = eventToCardFields({
      title: 'Overnight',
      description: 'Body',
      allDay: false,
      startIso: '2026-10-11T03:30:00.000Z', // 23:30 on the 10th, EDT
      endIso: '2026-10-11T04:30:00.000Z', // 00:30 on the 11th, EDT
    }, 'America/New_York');
    expect(fields.startDate).toBe('2026-10-10');
    expect(fields.endDate).toBe('2026-10-11');
    expect(fields.description).toBe('23:30\u201300:30\n\nBody');
  });
});
