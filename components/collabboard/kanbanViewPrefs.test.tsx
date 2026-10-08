// @vitest-environment jsdom
//
// PATCH-325. The per-browser Kanban/Gantt/Scheduler choice.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_KANBAN_VIEWS,
  readKanbanViews,
  writeKanbanViews,
} from '@/lib/kanban/kanbanViewPrefs';

const KEY = 'kanban-views:board-1';

beforeEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('PATCH-325 readKanbanViews', () => {
  it('returns the default when nothing is stored', () => {
    expect(readKanbanViews('board-1')).toEqual(DEFAULT_KANBAN_VIEWS);
  });

  it('returns the default for unparsable storage', () => {
    window.localStorage.setItem(KEY, '{not json');
    expect(readKanbanViews('board-1')).toEqual(DEFAULT_KANBAN_VIEWS);
  });

  it('returns the default when every view is false', () => {
    window.localStorage.setItem(KEY, JSON.stringify({ kanban: false, gantt: false, scheduler: false }));
    expect(readKanbanViews('board-1')).toEqual(DEFAULT_KANBAN_VIEWS);
  });

  it('returns the default for wrong or missing value types', () => {
    for (const value of [
      JSON.stringify({ kanban: 'yes', gantt: true, scheduler: false }),
      JSON.stringify({ kanban: true, gantt: 1, scheduler: false }),
      JSON.stringify({ kanban: true, gantt: false }),
      JSON.stringify(['kanban']),
      JSON.stringify('kanban'),
      JSON.stringify(null),
    ]) {
      window.localStorage.setItem(KEY, value);
      expect(readKanbanViews('board-1'), value).toEqual(DEFAULT_KANBAN_VIEWS);
    }
  });

  it('round-trips a written choice', () => {
    writeKanbanViews('board-1', { kanban: false, gantt: true, scheduler: true });
    expect(readKanbanViews('board-1')).toEqual({ kanban: false, gantt: true, scheduler: true });
  });

  it('a throwing storage reads as the default and never throws', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => readKanbanViews('board-1')).not.toThrow();
    expect(readKanbanViews('board-1')).toEqual(DEFAULT_KANBAN_VIEWS);
    getItem.mockRestore();

    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeKanbanViews('board-1', DEFAULT_KANBAN_VIEWS)).not.toThrow();
    setItem.mockRestore();
  });

  it('keeps each board’s choice separate', () => {
    writeKanbanViews('board-1', { kanban: true, gantt: true, scheduler: false });
    expect(readKanbanViews('board-2')).toEqual(DEFAULT_KANBAN_VIEWS);
  });
});
