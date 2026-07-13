import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../../types/kanban-canvas';
import {
  buildLocalDate,
  formatLocalDate,
  formatWeekHeaderLabel,
  formatWeekRangeLabel,
  getDefaultNewTaskDateRange,
  getLocalDateParts,
} from '../../../components/gantt-canvas/dateUtils';
import { mapCardToGanttTask } from '../../../components/gantt-canvas/mappers';

describe('gantt date defaults', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('derives a new item default date from the current local date', () => {
    const now = new Date(2026, 6, 13, 16, 45, 0, 0);

    const parts = getLocalDateParts(now);

    expect(parts).toEqual({ day: 13, month: 6, year: 2026 });
    expect(formatLocalDate(buildLocalDate(parts))).toBe('2026-07-13');
  });

  it('falls back to the current local date when a gantt task has no persisted dates', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 31, 23, 45, 0, 0));

    const card: Card = {
      id: 'card-now',
      label: 'New task',
      columnId: 'col-1',
    };

    const task = mapCardToGanttTask(card);

    expect(task.start_date).toBe('2026-01-31');
    expect(task.end_date).toBe('2026-02-01');
  });

  it('seeds a newly created gantt task from today in local time', () => {
    const { startDate, endDate } = getDefaultNewTaskDateRange(new Date(2026, 6, 13, 16, 45, 0, 0));

    expect(formatLocalDate(startDate)).toBe('2026-07-13');
    expect(formatLocalDate(endDate)).toBe('2026-07-14');
  });

  it('formats week headers with a readable date range', () => {
    const weekStart = new Date(2026, 5, 10, 9, 0, 0, 0);

    expect(formatWeekHeaderLabel(weekStart)).toBe('Week #24');
    expect(formatWeekRangeLabel(weekStart)).toBe('10-17 June 2026');
  });

  it('initializes an existing gantt item from persisted dates exactly', () => {
    const card: Card = {
      id: 'card-1',
      label: 'Existing task',
      columnId: 'col-1',
      start_date: '2026-01-31',
      end_date: '2026-12-01',
    };

    const task = mapCardToGanttTask(card);

    expect(task.start_date).toBe('2026-01-31');
    expect(task.end_date).toBe('2026-12-01');
  });
});
