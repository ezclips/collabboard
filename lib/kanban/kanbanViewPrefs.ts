'use client';

// PATCH-325. Which Kanban/Gantt/Scheduler views a board shows, remembered per
// board and per browser.
//
// `localStorage` and not a database row: this is a per-browser convenience, not
// a setting the server needs. Every access is wrapped because a private window
// throws rather than returning null -- a throw here must leave the caller on the
// default, never break the board.

export interface KanbanViewPrefs {
  readonly kanban: boolean;
  readonly gantt: boolean;
  readonly scheduler: boolean;
}

/** Kanban only. The same default the UI starts from. */
export const DEFAULT_KANBAN_VIEWS: KanbanViewPrefs = {
  kanban: true,
  gantt: false,
  scheduler: false,
};

const storageKey = (boardId: string) => `kanban-views:${boardId}`;

/**
 * The stored choice, or the default.
 *
 * The default is returned for EVERY unusable shape -- missing, unparsable, not
 * an object, a value that is not a boolean, or all three false. "All false" is
 * included because it is not a real state: at least one view must stay open, so
 * a row saying otherwise is corrupt and must not be honoured.
 */
export function readKanbanViews(boardId: string): KanbanViewPrefs {
  try {
    const raw = window.localStorage.getItem(storageKey(boardId));
    if (raw === null) return DEFAULT_KANBAN_VIEWS;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return DEFAULT_KANBAN_VIEWS;
    const { kanban, gantt, scheduler } = parsed as Record<string, unknown>;
    if (typeof kanban !== 'boolean' || typeof gantt !== 'boolean' || typeof scheduler !== 'boolean') {
      return DEFAULT_KANBAN_VIEWS;
    }
    if (!kanban && !gantt && !scheduler) return DEFAULT_KANBAN_VIEWS;
    return { kanban, gantt, scheduler };
  } catch {
    // No storage, a quota error, a blocked page -- the choice is simply not
    // remembered, and the board still opens on the default.
    return DEFAULT_KANBAN_VIEWS;
  }
}

/** Remembers the choice. A storage failure leaves the board working. */
export function writeKanbanViews(boardId: string, views: KanbanViewPrefs): void {
  try {
    window.localStorage.setItem(storageKey(boardId), JSON.stringify({
      kanban: views.kanban,
      gantt: views.gantt,
      scheduler: views.scheduler,
    }));
  } catch {
    // Not remembering a layout is a small loss; throwing here would not be.
  }
}
