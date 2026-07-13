import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '../../../types/kanban-canvas';
import { buildLocalDate, formatLocalDate, getLocalDateParts } from '../../../components/gantt-canvas/dateUtils';
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
