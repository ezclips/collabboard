// @vitest-environment jsdom
//
// PATCH-320 Addendum 6. After a successful update the store records the
// updated_at the server wrote, so the next save conditions on the right stamp
// instead of the stale one (the Gantt path has no realtime echo).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  saveCard: vi.fn(),
  loadKanbanData: vi.fn(async () => null),
  loadKanbanScaffoldData: vi.fn(async () => null),
  toastError: vi.fn(),
}));

vi.mock('@/lib/kanban/supabaseAdapter', () => ({
  loadKanbanData: hoisted.loadKanbanData,
  loadKanbanScaffoldData: hoisted.loadKanbanScaffoldData,
  loadKanbanCardsForColumn: vi.fn(async () => null),
  saveCard: hoisted.saveCard,
  saveCardAssignees: vi.fn(async () => {}),
  deleteCard: vi.fn(async () => true),
  saveColumn: vi.fn(),
  deleteColumn: vi.fn(),
  saveColumnGroup: vi.fn(),
  deleteColumnGroup: vi.fn(),
  saveSwimlane: vi.fn(),
  deleteSwimlane: vi.fn(),
  saveLink: vi.fn(),
  deleteLink: vi.fn(),
  saveComment: vi.fn(),
  deleteComment: vi.fn(),
  saveVote: vi.fn(),
  deleteVote: vi.fn(),
  saveMemberSortPreference: vi.fn(),
  saveMemberGroupByPreference: vi.fn(),
  saveMemberDateFormatPreference: vi.fn(),
}));
vi.mock('@/lib/supabase/browser', () => {
  const channel: Record<string, unknown> = {};
  channel.on = () => channel;
  channel.subscribe = () => channel;
  return {
    supabaseBrowser: () => ({
      channel: () => channel,
      removeChannel: () => {},
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    }),
  };
});
vi.mock('sonner', () => ({
  toast: { error: hoisted.toastError, success: vi.fn(), info: vi.fn() },
}));

import { KanbanProvider, useKanbanPersistence } from '@/components/kanban-canvas/store';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let api: ReturnType<typeof useKanbanPersistence> | null = null;
function Harness() {
  api = useKanbanPersistence();
  return null;
}

let root: Root | null = null;
let container: HTMLElement;

const card = (): Card => ({ id: 'c1', label: 'X', columnId: 'col-1', updated_at: 'old' } as Card);

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <KanbanProvider canvasId="board-1" initialData={{ cards: [card()] }}>
        <Harness />
      </KanbanProvider>,
    );
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-320 Addendum 6: the store records the saved stamp', () => {
  it('the next save conditions on the stamp the previous save returned', async () => {
    const calls: Array<Record<string, unknown>> = [];
    hoisted.saveCard.mockImplementation(async (dbUpdate: Record<string, unknown>) => {
      calls.push(dbUpdate);
      return {
        ok: true,
        conflict: false,
        updatedAt: dbUpdate.updated_at === 'old' ? 'server-1' : 'server-2',
      };
    });

    await mount();
    await act(async () => {
      await api!.updateCard('c1', { label: 'A' });
    });
    await act(async () => {
      await api!.updateCard('c1', { label: 'B' });
    });

    expect(calls[0].updated_at).toBe('old');
    expect(calls[1].updated_at).toBe('server-1');
  });

  it('a conflict still surfaces instead of syncing a stamp', async () => {
    hoisted.saveCard.mockResolvedValueOnce({
      ok: false,
      conflict: true,
      message: 'Card was changed by another user.',
    });

    await mount();
    await act(async () => {
      await api!.updateCard('c1', { label: 'A' });
    });

    expect(hoisted.toastError).toHaveBeenCalled();
  });
});
