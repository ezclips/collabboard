// PATCH-320 §4. A card with no dates must not draw a fake bar at "today"; it is
// an unscheduled task, and an update from the Gantt for it never writes dates.
import { describe, expect, it } from 'vitest';
import { mapCardToGanttTask, mapGanttTaskToCardPatch } from '@/components/gantt-canvas/mappers';
import type { Card } from '@/types/kanban-canvas';

const base: Card = { id: 'c1', label: 'Task', columnId: 'col-1' };

describe('PATCH-320: undated Gantt tasks', () => {
  it('marks a card with no dates unscheduled', () => {
    expect(mapCardToGanttTask(base).unscheduled).toBe(true);
  });

  it('leaves a card with dates scheduled', () => {
    const task = mapCardToGanttTask({ ...base, start_date: '2026-01-01', end_date: '2026-01-03' });
    expect(task.unscheduled).toBeUndefined();
  });

  it('never writes dates from an unscheduled task patch (e.g. a rename)', () => {
    const patch = mapGanttTaskToCardPatch({
      id: 'c1',
      unscheduled: true,
      text: 'Renamed',
      start_date: '2026-01-01',
      end_date: '2026-01-05',
    });
    expect(patch.label).toBe('Renamed');
    expect(patch.start_date).toBeUndefined();
    expect(patch.end_date).toBeUndefined();
  });
});
