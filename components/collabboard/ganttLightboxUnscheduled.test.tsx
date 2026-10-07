// PATCH-320 Addendum 3. Double-clicking an undated (unscheduled) row's Start
// time opened the lightbox with placeholder dates, and because the task stayed
// unscheduled the picked dates were dropped. A save with changed dates must
// schedule the task; a save with unchanged dates (e.g. a description edit) must
// keep it unscheduled.
import { describe, expect, it, vi } from 'vitest';
import { bindGanttEvents } from '@/components/gantt-canvas/ganttEvents';
import { mapGanttTaskToCardPatch } from '@/components/gantt-canvas/mappers';

type Handler = (...args: any[]) => unknown;

function makeFakeGantt(task: Record<string, unknown>) {
  const handlers: Record<string, Handler> = {};
  const gantt = {
    attachEvent: (name: string, cb: Handler) => {
      handlers[name] = cb;
      return name;
    },
    detachEvent: vi.fn(),
    changeTaskId: vi.fn(),
    deleteTask: vi.fn(),
    getTask: () => task,
    getChildren: () => [],
  };
  return { gantt, handlers };
}

function bind(gantt: unknown) {
  return bindGanttEvents({
    gantt: gantt as never,
    actions: {
      addCard: vi.fn(),
      updateCard: vi.fn(),
      deleteCard: vi.fn(),
      addLink: vi.fn(),
      deleteLink: vi.fn(),
    } as never,
    getDataSnapshot: () => ({ cards: [], columns: [], rows: [] }),
    isApplyingExternalUpdateRef: { current: false } as never,
  });
}

const unscheduledTask = () => ({
  id: 'c1',
  text: 'X',
  unscheduled: true,
  start_date: new Date(2026, 0, 1),
  end_date: new Date(2026, 0, 2),
});

describe('PATCH-320 Addendum 3: the lightbox can schedule an undated card', () => {
  it('changed dates make the task scheduled and the patch carry them', () => {
    const task = unscheduledTask();
    const { gantt, handlers } = makeFakeGantt(task);
    bind(gantt);

    handlers['onBeforeLightbox']('c1');
    const submitted = { ...task, start_date: new Date(2026, 1, 1), end_date: new Date(2026, 1, 3) };
    handlers['onLightboxSave']('c1', submitted);

    expect(submitted.unscheduled).toBe(false);
    const patch = mapGanttTaskToCardPatch(submitted);
    expect(patch.start_date).toBe('2026-02-01');
    expect(patch.end_date).toBe('2026-02-03');
  });

  it('unchanged dates keep it unscheduled (a description edit adds no dates)', () => {
    const task = unscheduledTask();
    const { gantt, handlers } = makeFakeGantt(task);
    bind(gantt);

    handlers['onBeforeLightbox']('c1');
    const submitted = { ...task, text: 'X edited' };
    handlers['onLightboxSave']('c1', submitted);

    expect(submitted.unscheduled).toBe(true);
    const patch = mapGanttTaskToCardPatch(submitted);
    expect(patch.label).toBe('X edited');
    expect(patch.start_date).toBeUndefined();
    expect(patch.end_date).toBeUndefined();
  });
});
