// @vitest-environment jsdom
//
// PATCH-320 §3. "Move to Row" must only appear when there is a row to move to.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  data: { rows: [], columns: [], cards: [], users: [] } as any,
  actions: { moveCard: vi.fn(), setActiveCard: vi.fn(), duplicateCard: vi.fn() } as any,
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanPersistence: () => hoisted.actions,
  useKanbanData: () => hoisted.data,
  useKanbanReadonly: () => false,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));

import { useCardMenu } from '@/components/kanban-canvas/CardMenu';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Harness({ card }: { card: Card }) {
  const items = useCardMenu({ card, modals: {} as never });
  return <div data-testid="items">{items.map((item) => item.id).join(',')}</div>;
}

let root: Root | null = null;
let container: HTMLElement;

async function mount(card: Card) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Harness card={card} />);
  });
  return container.querySelector('[data-testid="items"]')!.textContent ?? '';
}

beforeEach(() => {
  hoisted.data = { rows: [], columns: [], cards: [], users: [] };
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

const card = (rowId?: string): Card => ({ id: 'c1', label: 'Task', columnId: 'col-1', rowId });

describe('PATCH-320: Move to Row is only shown when it can move', () => {
  it('single row, card already in it: no "Move to Row"', async () => {
    hoisted.data = { ...hoisted.data, rows: [{ id: 'row-1', label: 'Row 1', order: 0 }] };
    const ids = await mount(card('row-1'));
    expect(ids).not.toContain('move-row-label');
  });

  it('two rows: "Move to Row" with its targets', async () => {
    hoisted.data = {
      ...hoisted.data,
      rows: [
        { id: 'row-1', label: 'Row 1', order: 0 },
        { id: 'row-2', label: 'Row 2', order: 1 },
      ],
    };
    const ids = await mount(card('row-1'));
    expect(ids).toContain('move-row-label');
    expect(ids).toContain('move-row-row-2');
  });
});
