// @vitest-environment jsdom
//
// PATCH-321. Add/duplicate/update persist None as 0 (not Medium), an update
// without the priority key leaves it untouched, and a loaded 0 shows no badge.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card as CardType } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  saveCard: vi.fn(),
  loadKanbanData: vi.fn(async (): Promise<any> => null),
  loadKanbanScaffoldData: vi.fn(async (): Promise<any> => null),
  toastError: vi.fn(),
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
vi.mock('sonner', () => ({ toast: { error: hoisted.toastError, success: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/kanban/supabaseAdapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kanban/supabaseAdapter')>();
  return {
    ...actual,
    loadKanbanData: hoisted.loadKanbanData,
    loadKanbanScaffoldData: hoisted.loadKanbanScaffoldData,
    loadKanbanCardsForColumn: vi.fn(async () => null),
    saveCard: hoisted.saveCard,
    saveCardAssignees: vi.fn(async () => {}),
  };
});

import { KanbanProvider, useKanbanData, useKanbanPersistence } from '@/components/kanban-canvas/store';
import { Card } from '@/components/kanban-canvas/Card';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let api: ReturnType<typeof useKanbanPersistence> | null = null;
function ApiHarness() {
  api = useKanbanPersistence();
  return null;
}
function CardHarness() {
  const data = useKanbanData();
  return (
    <>
      {data.cards.map((card) => (
        <Card key={card.id} card={card} />
      ))}
    </>
  );
}

let root: Root | null = null;
let container: HTMLElement;

async function mount(children: React.ReactNode, initialData?: { cards?: CardType[] }) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <KanbanProvider canvasId="board-1" initialData={initialData}>
        {children}
      </KanbanProvider>,
    );
    await Promise.resolve();
    await Promise.resolve();
  });
}

const noneCard = (): CardType => ({ id: 'c1', label: 'X', columnId: 'col-1' } as CardType);

beforeEach(() => {
  hoisted.saveCard.mockReset().mockResolvedValue({ ok: true, conflict: false, updatedAt: 'stamp' });
  hoisted.loadKanbanScaffoldData.mockReset().mockResolvedValue(null);
  hoisted.loadKanbanData.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-321: priority persistence', () => {
  it('add card with no priority saves 0', async () => {
    await mount(<ApiHarness />, { cards: [] });
    await act(async () => {
      await api!.addCard({ id: 'new-1', label: 'New', columnId: 'col-1' } as CardType);
    });
    expect(hoisted.saveCard.mock.calls[0][0].priority).toBe(0);
  });

  it('duplicate of a None card saves 0', async () => {
    await mount(<ApiHarness />, { cards: [noneCard()] });
    await act(async () => {
      await api!.duplicateCard('c1');
    });
    const payload = hoisted.saveCard.mock.calls.find((call) => call[1] === true)?.[0];
    expect(payload.priority).toBe(0);
  });

  it('an explicit None update writes 0', async () => {
    await mount(<ApiHarness />, { cards: [noneCard()] });
    await act(async () => {
      await api!.updateCard('c1', { priority: undefined });
    });
    expect(hoisted.saveCard.mock.calls[0][0].priority).toBe(0);
  });

  it('an update without the priority key sends no priority field', async () => {
    await mount(<ApiHarness />, { cards: [noneCard()] });
    await act(async () => {
      await api!.updateCard('c1', { label: 'A' });
    });
    expect('priority' in hoisted.saveCard.mock.calls[0][0]).toBe(false);
  });

  it('a card loaded with priority 0 shows no badge; 2 shows one', async () => {
    const base = {
      columns: [],
      columnGroups: [],
      rows: [],
      links: [],
      assignees: [],
      comments: [],
      votes: [],
      members: [],
    };
    hoisted.loadKanbanScaffoldData.mockResolvedValueOnce({
      ...base,
      cards: [{ id: 'c1', title: 'None card', priority: 0, order_index: 0, column_id: 'col-1', score: 0, content: '' }],
    });
    await mount(<CardHarness />);
    expect(container.querySelector('.kanban-card-priority')).toBeNull();

    act(() => root!.unmount());
    root = null;
    container.remove();

    hoisted.loadKanbanScaffoldData.mockResolvedValueOnce({
      ...base,
      cards: [{ id: 'c2', title: 'Medium card', priority: 2, order_index: 0, column_id: 'col-1', score: 0, content: '' }],
    });
    await mount(<CardHarness />);
    expect(container.querySelector('.kanban-card-priority')?.textContent).toContain('medium');
  });
});