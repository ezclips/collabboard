// PATCH-352. A Kanban card's end_date is the LAST day of the work, INCLUDED;
// DHTMLX Gantt's end_date is EXCLUSIVE. The two mappers convert at the
// boundary, so a round trip returns the card's own dates. This lives under
// lib/infra because vitest does NOT run tests under components/gantt-canvas.
import { describe, expect, it } from 'vitest';
import type { Card } from '../../../types/kanban-canvas';
import { countInclusiveDays } from '../../../components/gantt-canvas/dateUtils';
import { mapCardToGanttTask, mapGanttTaskToCardPatch } from '../../../components/gantt-canvas/mappers';

const card = (overrides: Partial<Card>): Card => ({
  id: 'c1', label: 'Task', columnId: 'col-1', ...overrides,
});

/** Run `fn` with the process time zone set, restoring it afterwards. */
function withTimeZone<T>(tz: string, fn: () => T): T {
  const original = process.env.TZ;
  process.env.TZ = tz;
  try {
    return fn();
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

describe('PATCH-352 card -> Gantt end_date (exclusive)', () => {
  it('adds a day to a multi-day card: 14 -> 16 Oct is Gantt 14 -> 17 Oct, duration 3', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-10-14', end_date: '2026-10-16' }));
    expect(task.start_date).toBe('2026-10-14');
    expect(task.end_date).toBe('2026-10-17');
    expect(task.duration).toBe(3);
  });

  it('gives a one-day card a real bar: 21 -> 21 Oct is Gantt 21 -> 22 Oct, duration 1', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-10-21', end_date: '2026-10-21' }));
    expect(task.end_date).toBe('2026-10-22');
    expect(task.duration).toBe(1);
  });

  it('a card with only a start is one day', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-10-14' }));
    expect(task.start_date).toBe('2026-10-14');
    expect(task.end_date).toBe('2026-10-15');
    expect(task.duration).toBe(1);
  });

  it('a card with only an end starts on that day', () => {
    const task = mapCardToGanttTask(card({ end_date: '2026-10-14' }));
    expect(task.start_date).toBe('2026-10-14');
    expect(task.end_date).toBe('2026-10-15');
    expect(task.duration).toBe(1);
  });

  it('an end before the start is a one-day task at the start', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-10-14', end_date: '2026-10-10' }));
    expect(task.start_date).toBe('2026-10-14');
    expect(task.end_date).toBe('2026-10-15');
    expect(task.duration).toBe(1);
  });

  it('crosses a month end: 31 Jan -> 1 Feb is Gantt 31 Jan -> 2 Feb', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-01-31', end_date: '2026-02-01' }));
    expect(task.end_date).toBe('2026-02-02');
    expect(task.duration).toBe(2);
  });

  it('crosses a year end: 31 Dec -> 1 Jan is Gantt 31 Dec -> 2 Jan', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-12-31', end_date: '2027-01-01' }));
    expect(task.end_date).toBe('2027-01-02');
    expect(task.duration).toBe(2);
  });

  it('a date-only end is never shifted by the midnight rule', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-10-13', end_date: '2026-10-15' }));
    expect(task.end_date).toBe('2026-10-16');
  });

  it('a timestamp end at 10:00 is that day', () => {
    const task = mapCardToGanttTask(card({ start_date: '2026-10-13', end_date: '2026-10-14T10:00:00' }));
    expect(task.end_date).toBe('2026-10-15');
  });
});

describe('PATCH-352 Gantt -> card end_date (inclusive)', () => {
  it('subtracts a day: Gantt end 17 Oct is card end 16 Oct', () => {
    const patch = mapGanttTaskToCardPatch({ start_date: '2026-10-14', end_date: '2026-10-17' });
    expect(patch.start_date).toBe('2026-10-14');
    expect(patch.end_date).toBe('2026-10-16');
  });

  it('Gantt end = start + 1 is a one-day card', () => {
    const patch = mapGanttTaskToCardPatch({ start_date: '2026-10-21', end_date: '2026-10-22' });
    expect(patch.end_date).toBe('2026-10-21');
  });

  it('no Gantt end with duration 3 is start + 2', () => {
    const patch = mapGanttTaskToCardPatch({ start_date: '2026-10-14', duration: 3 });
    expect(patch.end_date).toBe('2026-10-16');
  });

  it('no Gantt end with duration 1 is a one-day card', () => {
    const patch = mapGanttTaskToCardPatch({ start_date: '2026-10-14', duration: 1 });
    expect(patch.end_date).toBe('2026-10-14');
  });

  it('an end not after the start yields card end = start', () => {
    const patch = mapGanttTaskToCardPatch({ start_date: '2026-10-14', end_date: '2026-10-14' });
    expect(patch.end_date).toBe('2026-10-14');
  });
});

describe('PATCH-352 round trip returns the card’s own dates', () => {
  const roundTrip = (start: string, end: string) => {
    const task = mapCardToGanttTask(card({ start_date: start, end_date: end }));
    const patch = mapGanttTaskToCardPatch(task);
    return { start_date: patch.start_date, end_date: patch.end_date };
  };

  it('one-day, multi-day, month end and year end', () => {
    expect(roundTrip('2026-10-21', '2026-10-21')).toEqual({ start_date: '2026-10-21', end_date: '2026-10-21' });
    expect(roundTrip('2026-10-14', '2026-10-16')).toEqual({ start_date: '2026-10-14', end_date: '2026-10-16' });
    expect(roundTrip('2026-01-31', '2026-02-01')).toEqual({ start_date: '2026-01-31', end_date: '2026-02-01' });
    expect(roundTrip('2026-12-31', '2027-01-01')).toEqual({ start_date: '2026-12-31', end_date: '2027-01-01' });
  });
});

describe('PATCH-352 milestones and unscheduled tasks are unchanged', () => {
  it('a milestone has duration 0 and end = start', () => {
    const task = mapCardToGanttTask(card({ task_type: 'Milestone', start_date: '2026-10-14', end_date: '2026-10-16' }));
    expect(task.type).toBe('milestone');
    expect(task.duration).toBe(0);
    expect(task.end_date).toBe('2026-10-14');
  });

  it('a milestone patch keeps end = start', () => {
    const patch = mapGanttTaskToCardPatch({ start_date: '2026-10-14', end_date: '2026-10-14', type: 'milestone' });
    expect(patch.end_date).toBe('2026-10-14');
  });

  it('an undated card is unscheduled with a one-day bar', () => {
    const task = mapCardToGanttTask(card({}));
    expect(task.unscheduled).toBe(true);
    expect(task.duration).toBe(1);
  });

  it('an unscheduled patch writes no dates', () => {
    const patch = mapGanttTaskToCardPatch({
      unscheduled: true, text: 'X', start_date: '2026-10-14', end_date: '2026-10-17',
    });
    expect(patch.start_date).toBeUndefined();
    expect(patch.end_date).toBeUndefined();
  });
});

describe('PATCH-352 countInclusiveDays', () => {
  it('same day is 1, Wed to Fri is 3', () => {
    expect(countInclusiveDays(new Date(2026, 9, 14), new Date(2026, 9, 14))).toBe(1);
    expect(countInclusiveDays(new Date(2026, 9, 14), new Date(2026, 9, 16))).toBe(3);
  });
});

describe('PATCH-352 Addendum 1: a stored date-only value is UTC midnight, never shifted', () => {
  // The database stores `date_due` as `timestamptz`, so a date-only due date
  // arrives as this stored form.
  const stored = { start_date: '2026-10-21T00:00:00.000Z', end_date: '2026-10-23T00:00:00.000Z' };

  it.each(['UTC', 'Europe/Berlin'])('a stored 21 -> 23 Oct card is Gantt 21 -> 24 Oct in %s', (tz) => {
    const task = withTimeZone(tz, () => mapCardToGanttTask(card(stored)));
    expect(task.start_date).toBe('2026-10-21');
    expect(task.end_date).toBe('2026-10-24');
    expect(task.duration).toBe(3);
  });

  it('Berlin: an end at local midnight that is NOT UTC midnight still rolls back', () => {
    // 22:00Z on the 14th is midnight in Berlin (UTC+2 in October), so the work
    // covers up to the 14th -- inclusive end 14 Oct, Gantt end 15 Oct.
    const task = withTimeZone('Europe/Berlin', () => mapCardToGanttTask(card({
      start_date: '2026-10-14',
      end_date: '2026-10-14T22:00:00.000Z',
    })));
    expect(task.end_date).toBe('2026-10-15');
    expect(task.duration).toBe(1);
  });

  it('the stored form round-trips to the same calendar days in both zones', () => {
    for (const tz of ['UTC', 'Europe/Berlin']) {
      withTimeZone(tz, () => {
        const patch = mapGanttTaskToCardPatch(mapCardToGanttTask(card(stored)));
        expect(patch.start_date).toBe('2026-10-21');
        expect(patch.end_date).toBe('2026-10-23');
      });
    }
  });
});
