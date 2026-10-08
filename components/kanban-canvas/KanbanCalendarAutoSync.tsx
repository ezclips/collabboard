'use client';

// PATCH-328. Keep a board's connected calendars in step, once per mount.
//
// Rendered inside KanbanProvider in KanbanShell, so it runs whichever views are
// open. Silent by design: it never toasts; a failure shows only in the modal's
// connected-calendars list. Only an editable board syncs.

import { useEffect, useRef } from 'react';
import { useKanban, useKanbanPersistence, useKanbanReadonly } from './store';

const STALE_AFTER_SECONDS = 3600;

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function KanbanCalendarAutoSync() {
  const { canvasId } = useKanban();
  const actions = useKanbanPersistence();
  const readonly = useKanbanReadonly();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!canvasId || readonly || ranRef.current) return;
    ranRef.current = true;

    const timeZone = browserTimeZone();
    const base = `/api/boards/${encodeURIComponent(canvasId)}/calendar-subscriptions`;

    void (async () => {
      let changed = false;
      try {
        const response = await fetch(base, { method: 'GET' });
        if (!response.ok) return;
        const subscriptions = await response.json().catch(() => null);
        if (!Array.isArray(subscriptions)) return;

        // One after another, so a slow calendar does not hold up the rest.
        for (const subscription of subscriptions as { id?: unknown }[]) {
          if (typeof subscription?.id !== 'string') continue;
          try {
            const sync = await fetch(`${base}/${subscription.id}/sync`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ timeZone, ifOlderThanSeconds: STALE_AFTER_SECONDS }),
            });
            if (!sync.ok) continue;
            const body = await sync.json().catch(() => null) as { skipped?: boolean } | null;
            if (body && body.skipped !== true) changed = true;
          } catch {
            // Silent: the modal's list is where a failure surfaces.
          }
        }
      } catch {
        // Silent.
      }
      if (changed) {
        try { await actions.refetchFromServer(); } catch { /* the board will catch up on the next realtime event. */ }
      }
    })();
  }, [canvasId, readonly, actions]);

  return null;
}
