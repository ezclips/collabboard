// @vitest-environment jsdom
//
// PATCH-319. A column created after the initial load is new and has no server
// cards, so it must not show "Cards not loaded"; a card added to it renders.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card, Column } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  data: { cards: [], links: [], users: [], columns: [], columnGroups: [], rows: [] } as any,
  ui: {
    dateFormat: 'YYYY-MM-DD',
    collapsedColumns: new Set(),
    collapsedRows: new Set(),
    searchQuery: '',
    groupBy: 'none',
    groupFilter: null,
    sortBy: null,
    sortOrder: 'asc',
  } as any,
  actions: {
    addRow: vi.fn(async () => {}),
    addCard: vi.fn(async () => {}),
    updateCard: vi.fn(async () => {}),
    loadCardsForColumn: vi.fn(async () => ({ ok: true })),
    toggleColumnCollapsed: vi.fn(),
    addColumn: vi.fn(async () => {}),
    deleteColumn: vi.fn(async () => {}),
    addColumnGroup: vi.fn(async () => {}),
  } as any,
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => hoisted.data,
  useKanbanUI: () => hoisted.ui,
  useKanbanPersistence: () => hoisted.actions,
  useKanbanReadonly: () => false,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));

import { Board } from '@/components/kanban-canvas/Board';

// The vitest esbuild transform compiles JSX to React.createElement; these
// components (like many older ones) have no React binding of their own.
(globalThis as unknown as { React?: typeof React }).React = React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

const col = (id: string, label: string, order: number): Column => ({ id, label, order });
const card = (id: string, label: string, columnId: string): Card => ({ id, label, columnId, order: 0 });

async function render(cards: Card[], columns: Column[]) {
  await act(async () => {
    root!.render(<Board cards={cards} columns={columns} rows={[]} />);
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  hoisted.actions.loadCardsForColumn.mockReset().mockResolvedValue({ ok: true });
  hoisted.data = { cards: [], links: [], users: [], columns: [], columnGroups: [], rows: [] };
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

describe('PATCH-319: a column created this session is already loaded', () => {
  it('does not show "Cards not loaded" and renders a card added to it', async () => {
    const a = col('col-a', 'A', 0);
    const b = col('col-b', 'B', 1);

    await render([], [a]);
    // A column appears after the initial server load -- a local creation.
    await render([card('card-b', 'Card B', 'col-b')], [a, b]);

    const columnsWithTitleB = Array.from(container.querySelectorAll<HTMLElement>('.kanban-column')).filter(
      (columnEl) => columnEl.querySelector('.kanban-column-title')?.textContent === 'B',
    );
    expect(columnsWithTitleB.length).toBeGreaterThan(0);
    for (const columnEl of columnsWithTitleB) {
      expect(columnEl.textContent).not.toContain('cardsNotLoaded');
    }
    expect(container.textContent).toContain('Card B');
  });
});
