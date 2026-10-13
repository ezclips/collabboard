// @vitest-environment jsdom
//
// PATCH-350. The bridge applies user-approved proposed changes through the
// store's own actions. The store hooks are mocked here: this file proves the
// bridge's mapping and ordering, not the store (which has its own suite).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = vi.hoisted(() => ({
  data: {
    cards: [] as Array<Record<string, unknown>>,
    columns: [] as Array<Record<string, unknown>>,
    rows: [] as Array<Record<string, unknown>>,
  },
  actions: {
    addCard: vi.fn(async (_card: Record<string, unknown>) => {}),
    updateCard: vi.fn(async (_id: string, _updates: Record<string, unknown>) => {}),
    moveCard: vi.fn(async (_id: string, _columnId: string, _rowId?: string, _order?: number) => {}),
    setActiveCard: vi.fn(),
  },
}));

vi.mock('./store', () => ({
  useKanbanData: () => store.data,
  useKanbanPersistence: () => store.actions,
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { KanbanBoardAiBridge, type KanbanBoardAiBridgeApi } from './KanbanBoardAiBridge';
import type { KanbanProposedChange } from '@/lib/domain/ai/kanbanChangeProposals';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement;
let api: KanbanBoardAiBridgeApi | null = null;

beforeEach(() => {
  store.data.cards = [
    { id: 'card-1', label: 'Fix login bug', columnId: 'col-todo', rowId: 'row-a' },
    { id: 'card-2', label: 'Ship it', columnId: 'col-todo', rowId: 'row-a' },
  ];
  store.data.columns = [
    { id: 'col-todo', label: 'To Do', order: 0 },
    { id: 'col-done', label: 'Done', order: 1 },
  ];
  store.data.rows = [{ id: 'row-a', label: 'A', order: 0 }];
  store.actions.addCard.mockClear();
  store.actions.updateCard.mockClear();
  store.actions.moveCard.mockClear();
  api = null;
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  host?.remove();
});

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<KanbanBoardAiBridge onRegister={(registered) => { api = registered; }} />);
  });
}

describe('PATCH-350 KanbanBoardAiBridge.applyProposedChanges', () => {
  it('a create adds a card at the bottom of the resolved column, with priority mapped', async () => {
    await mount();
    const changes: KanbanProposedChange[] = [{
      kind: 'create',
      label: 'Create card “Task A” in Done',
      columnId: 'col-done',
      title: 'Task A',
      description: 'do it',
      priority: 3,
      startDate: '2026-10-14',
      endDate: '2026-10-20',
    }];
    const results = await act(async () => api!.applyProposedChanges(changes));
    expect(results).toEqual([{ ok: true }]);
    expect(store.actions.addCard).toHaveBeenCalledTimes(1);
    const card = store.actions.addCard.mock.calls[0][0] as Record<string, unknown>;
    expect(card).toMatchObject({
      label: 'Task A',
      description: 'do it',
      columnId: 'col-done',
      priority: 'high',
      start_date: '2026-10-14',
      end_date: '2026-10-20',
    });
    expect(typeof card.id).toBe('string');
  });

  it('an update calls updateCard with the mapped fields', async () => {
    await mount();
    const changes: KanbanProposedChange[] = [{
      kind: 'update',
      label: 'Set priority of “Fix login bug” to High',
      cardId: 'card-1',
      priority: 3,
      endDate: '2026-10-14',
    }];
    const results = await act(async () => api!.applyProposedChanges(changes));
    expect(results).toEqual([{ ok: true }]);
    expect(store.actions.updateCard).toHaveBeenCalledWith('card-1', { priority: 'high', end_date: '2026-10-14' });
  });

  it('a move calls moveCard to the resolved column and row', async () => {
    await mount();
    const changes: KanbanProposedChange[] = [{
      kind: 'move',
      label: 'Move “Fix login bug” to Done',
      cardId: 'card-1',
      columnId: 'col-done',
      rowId: 'row-a',
    }];
    const results = await act(async () => api!.applyProposedChanges(changes));
    expect(results).toEqual([{ ok: true }]);
    expect(store.actions.moveCard).toHaveBeenCalledTimes(1);
    const [id, columnId, rowId] = store.actions.moveCard.mock.calls[0];
    expect(id).toBe('card-1');
    expect(columnId).toBe('col-done');
    expect(rowId).toBe('row-a');
  });

  it('a card that no longer exists fails that change, and calls no store action', async () => {
    await mount();
    const changes: KanbanProposedChange[] = [
      { kind: 'move', label: 'Move “Gone” to Done', cardId: 'card-gone', columnId: 'col-done' },
    ];
    const results = await act(async () => api!.applyProposedChanges(changes));
    expect(results).toEqual([{ ok: false, message: 'This card no longer exists' }]);
    expect(store.actions.moveCard).not.toHaveBeenCalled();
    expect(store.actions.updateCard).not.toHaveBeenCalled();
  });

  it('applies sequentially, in the order given, and the rest still run after a failure', async () => {
    await mount();
    const order: string[] = [];
    store.actions.addCard.mockImplementation(async () => { order.push('create'); });
    store.actions.updateCard.mockImplementation(async () => { order.push('update'); });
    store.actions.moveCard.mockImplementation(async () => { order.push('move'); });

    const changes: KanbanProposedChange[] = [
      { kind: 'create', label: 'Create “X” in To Do', columnId: 'col-todo', title: 'X' },
      { kind: 'move', label: 'Move “Gone” to Done', cardId: 'card-gone', columnId: 'col-done' },
      { kind: 'update', label: 'Set priority of “Ship it” to Low', cardId: 'card-2', priority: 1 },
    ];
    const results = await act(async () => api!.applyProposedChanges(changes));
    expect(results).toEqual([
      { ok: true },
      { ok: false, message: 'This card no longer exists' },
      { ok: true },
    ]);
    expect(order).toEqual(['create', 'update']);
  });
});
