// @vitest-environment jsdom
//
// PATCH-341 Addendum 1. ?openCard must NOT reset the whole board (that races
// the lazy per-column load and drops a column's cards). It reads the card's
// column with one small query, loads just that column, then opens the card.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  data: { cards: [] as Array<{ id: string }> },
  actions: {
    setActiveCard: vi.fn(),
    loadCardColumnId: vi.fn(async (): Promise<string | null> => 'col-1'),
    loadCardsForColumn: vi.fn(async () => ({ ok: true })),
    refetchFromServer: vi.fn(async () => {}),
  },
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => hoisted.data,
  useKanbanPersistence: () => hoisted.actions,
}));
// The shell imports these; the helper under test does not need them.
vi.mock('@/components/kanban-canvas', () => ({ KanbanCanvas: () => null }));
vi.mock('@/components/scheduler-canvas/KanbanGanttSchedulerSplit', () => ({ KanbanGanttSchedulerSplit: () => null }));
vi.mock('@/components/kanban-canvas/KanbanBoardAiBridge', () => ({
  KanbanBoardAiBridge: () => null,
  KanbanBoardAiContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));
vi.mock('@/components/kanban-canvas/KanbanCalendarAutoSync', () => ({ KanbanCalendarAutoSync: () => null }));
vi.mock('@/components/collabboard/canvas/ui/CanvasShareModal', () => ({ default: () => null }));

import { KanbanOpenCard } from './canvas/ui/KanbanShell';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function render(cardId = 'c1') {
  if (!root) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  }
  await act(async () => { root!.render(<KanbanOpenCard cardId={cardId} />); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

beforeEach(() => {
  hoisted.data = { cards: [] };
  hoisted.actions.setActiveCard.mockReset();
  hoisted.actions.loadCardColumnId.mockReset().mockResolvedValue('col-1');
  hoisted.actions.loadCardsForColumn.mockReset().mockResolvedValue({ ok: true });
  hoisted.actions.refetchFromServer.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-341 Addendum 1 KanbanOpenCard', () => {
  it('loads the card\'s column (never a full reset) when the card is not loaded yet', async () => {
    await render();

    expect(hoisted.actions.loadCardColumnId).toHaveBeenCalledWith('c1');
    expect(hoisted.actions.loadCardsForColumn).toHaveBeenCalledWith('col-1');
    expect(hoisted.actions.refetchFromServer).not.toHaveBeenCalled();
    expect(hoisted.actions.setActiveCard).not.toHaveBeenCalled();
  });

  it('opens the card once it appears, at most once', async () => {
    await render();
    expect(hoisted.actions.setActiveCard).not.toHaveBeenCalled();

    hoisted.data = { cards: [{ id: 'c1' }] };
    await render();

    expect(hoisted.actions.setActiveCard).toHaveBeenCalledTimes(1);
    expect(hoisted.actions.setActiveCard).toHaveBeenCalledWith('c1');
    // A further render must not open it again.
    await render();
    expect(hoisted.actions.setActiveCard).toHaveBeenCalledTimes(1);
  });

  it('ignores an unknown id: no column load, no open, no reset', async () => {
    hoisted.actions.loadCardColumnId.mockResolvedValue(null);
    await render();

    expect(hoisted.actions.loadCardsForColumn).not.toHaveBeenCalled();
    expect(hoisted.actions.setActiveCard).not.toHaveBeenCalled();
    expect(hoisted.actions.refetchFromServer).not.toHaveBeenCalled();
  });
});
