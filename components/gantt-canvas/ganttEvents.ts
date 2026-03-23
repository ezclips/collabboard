import type { Card, Link } from '@/types/kanban-canvas';
import type { MutableRefObject } from 'react';
import {
  mapGanttLinkToKanban,
  mapGanttTaskToCardPatch,
  resolveDefaultPlacement,
  type GanttLinkType,
  type GanttTask,
} from './mappers';

type GanttLike = {
  attachEvent: (name: string, callback: (...args: unknown[]) => unknown) => string;
  detachEvent: (id: string) => void;
  changeTaskId: (id: string, newId: string) => void;
  deleteTask: (id: string) => void;
  /**
   * Returns the task object for a given id, or null if not found.
   * Used to read the task's current parent during reorder validation.
   */
  getTask: (id: string | number) => (GanttTaskLike & { parent?: string | number }) | null;
  /**
   * Returns an array of direct child IDs for a given parent id.
   * Pass 0 (the root sentinel) to get top-level tasks.
   * Used after onAfterTaskMove to update sibling order_index values.
   */
  getChildren: (id: string | number) => string[];
};

type GanttTaskLike = Partial<GanttTask> & { text?: string };
type GanttLinkLike = { id?: string | number; source?: string | number; target?: string | number; type?: string | number };

type PersistenceActions = {
  addCard: (card: Card) => Promise<unknown>;
  updateCard: (id: string, updates: Partial<Card>) => Promise<unknown>;
  deleteCard: (id: string) => Promise<unknown>;
  addLink: (link: Link) => Promise<unknown>;
  deleteLink: (id: string) => Promise<unknown>;
};

function toUuid(id: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(id)) return id;
  return crypto.randomUUID();
}

export function bindGanttEvents(params: {
  gantt: GanttLike;
  actions: PersistenceActions;
  getDataSnapshot: () => {
    cards: Card[];
    columns: { id: string; order?: number }[];
    rows: { id: string; order?: number }[];
  };
  isApplyingExternalUpdateRef: MutableRefObject<boolean>;
}) {
  const { gantt, actions, getDataSnapshot, isApplyingExternalUpdateRef } = params;
  const eventIds: string[] = [];
  const updateTimers = new Map<string, ReturnType<typeof setTimeout>>();

  // Note: onTaskClick removed - Gantt tasks don't open the Kanban Editor modal
  // Only the "+" button opens the simple NewTaskModal for creating new tasks

  eventIds.push(
    gantt.attachEvent('onAfterTaskAdd', (async (rawId: string, task: GanttTaskLike) => {
      if (isApplyingExternalUpdateRef.current) return;

      const taskId = toUuid(String(rawId));
      if (taskId !== String(rawId)) {
        gantt.changeTaskId(rawId, taskId);
      }

      const snapshot = getDataSnapshot();
      const placement = resolveDefaultPlacement(snapshot.columns as any, snapshot.rows as any);
      if (!placement.columnId) {
        // Keep UI consistent by reverting visual task when no valid Kanban column exists.
        gantt.deleteTask(taskId);
        return;
      }

      const patch = mapGanttTaskToCardPatch(task);
      const nextCard: Card = {
        id: taskId,
        label: patch.label || task.text || 'Untitled',
        description: patch.description,
        color: patch.color,
        task_type: patch.task_type,
        start_date: patch.start_date,
        end_date: patch.end_date,
        progress: patch.progress,
        priority: 'medium',
        columnId: patch.columnId || placement.columnId,
        rowId: placement.rowId,
        order: snapshot.cards.filter((card) => card.columnId === (patch.columnId || placement.columnId)).length + 1,
        parent: typeof task.parent === 'string' && task.parent !== '0' ? task.parent : undefined,
      };
      await actions.addCard(nextCard);
    }) as any)
  );

  eventIds.push(
    gantt.attachEvent('onAfterTaskUpdate', (async (id: string, task: GanttTaskLike) => {
      if (isApplyingExternalUpdateRef.current) return;
      const taskId = String(id);
      const previousTimer = updateTimers.get(taskId);
      if (previousTimer) clearTimeout(previousTimer);

      const timer = setTimeout(async () => {
        updateTimers.delete(taskId);
        const patch = mapGanttTaskToCardPatch(task);
        const currentCard = getDataSnapshot().cards.find((card) => card.id === taskId);
        if (!currentCard) return;

        const hasChange = Object.entries(patch).some(([key, value]) => {
          const cardValue = (currentCard as unknown as Record<string, unknown>)[key];
          return cardValue !== value;
        });
        if (!hasChange) return;

        await actions.updateCard(taskId, patch);
      }, 120);

      updateTimers.set(taskId, timer);
    }) as any)
  );

  eventIds.push(
    gantt.attachEvent('onAfterTaskDelete', (async (id: string) => {
      if (isApplyingExternalUpdateRef.current) return;
      await actions.deleteCard(String(id));
    }) as any)
  );

  eventIds.push(
    gantt.attachEvent('onAfterLinkAdd', (async (_id: string, link: GanttLinkLike) => {
      if (isApplyingExternalUpdateRef.current) return;
      const nextLink = mapGanttLinkToKanban({
        id: toUuid(String(link.id || crypto.randomUUID())),
        source: String(link.source),
        target: String(link.target),
        type: String(link.type ?? '0') as GanttLinkType,
      });
      await actions.addLink(nextLink);
    }) as any)
  );

  eventIds.push(
    gantt.attachEvent('onAfterLinkDelete', (async (id: string) => {
      if (isApplyingExternalUpdateRef.current) return;
      await actions.deleteLink(String(id));
    }) as any)
  );

  // ── Row reorder: commit-time cross-branch guard ──────────────────────────
  // onBeforeTaskMove fires when a drag-reorder is about to be committed.
  // It acts as a secondary safety net; the primary guard is order_branch_free=false
  // in GanttConfig.ts, which already restricts the drag UI to siblings only.
  // Returning false here cancels the move without any visual side-effect.
  eventIds.push(
    gantt.attachEvent('onBeforeTaskMove', (id: unknown, parent: unknown) => {
      const task = gantt.getTask(String(id));
      if (!task) return true;
      const currentParent = String(task.parent ?? 0);
      const newParent = String(parent ?? 0);
      // Block any move that would place the task under a different parent.
      if (currentParent !== newParent) return false;
      return true;
    })
  );

  // ── Row reorder: drag-time drop-position guard ───────────────────────────
  // onBeforeRowDragMove fires continuously as the user hovers over candidate
  // drop positions during a marker-mode drag. Returning false hides the
  // drop-line marker at that position, giving immediate feedback.
  // Currently allows all positions — adjust the condition if you need to
  // block specific drop targets (e.g. tindex === 0 to block the first slot).
  eventIds.push(
    gantt.attachEvent('onBeforeRowDragMove', (_id: unknown, _parent: unknown, _tindex: unknown) => {
      return true;
    })
  );

  // ── Row reorder: persist new sibling order after committed move ──────────
  // onAfterTaskMove fires once the row drag has been committed.
  // We retrieve the full sibling list (now in the new order from DHTMLX) and
  // write each sibling's new order_index to the Kanban store / Supabase.
  // Promise.all fires all updates concurrently so React 18's automatic
  // batching can collapse the resulting state updates into fewer re-renders.
  eventIds.push(
    gantt.attachEvent('onAfterTaskMove', (id: unknown, parent: unknown) => {
      if (isApplyingExternalUpdateRef.current) return;
      const parentId = parent as string | number;
      const siblings = gantt.getChildren(parentId);
      Promise.all(
        siblings.map((sibId: string, index: number) =>
          actions.updateCard(String(sibId), { order: index })
        )
      ).catch((err) => console.error('[Gantt] Failed to persist row reorder:', err));
    })
  );

  return () => {
    updateTimers.forEach((timer) => clearTimeout(timer));
    updateTimers.clear();
    eventIds.forEach((eventId) => gantt.detachEvent(eventId));
  };
}
