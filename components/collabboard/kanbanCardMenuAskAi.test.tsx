// @vitest-environment jsdom
//
// PATCH-323. "Ask Board AI" on a card attaches the card and opens the drawer.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  data: { rows: [], columns: [], cards: [], users: [] } as any,
  actions: { setActiveCard: vi.fn(), duplicateCard: vi.fn() } as any,
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
import { KanbanBoardAiContext, type KanbanBoardAiHost } from '@/components/kanban-canvas/KanbanBoardAiBridge';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function Inner({ card }: { card: Card }) {
  const items = useCardMenu({ card, modals: {} as never });
  // Expose the items so the test can read ids and fire an item's onClick.
  (globalThis as unknown as { __items?: unknown }).__items = items;
  return <div data-testid="items">{items.map((item) => item.id).join(',')}</div>;
}

function Harness({ card, host }: { card: Card; host: KanbanBoardAiHost | null }) {
  // The provider must WRAP the component that calls the hook, exactly as it does
  // in the board.
  return (
    <KanbanBoardAiContext.Provider value={host}>
      <Inner card={card} />
    </KanbanBoardAiContext.Provider>
  );
}

async function mount(card: Card, host: KanbanBoardAiHost | null) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root!.render(<Harness card={card} host={host} />); });
  return container.querySelector('[data-testid="items"]')!.textContent ?? '';
}

beforeEach(() => {
  hoisted.data = { rows: [], columns: [], cards: [], users: [] };
  delete (globalThis as unknown as { __items?: unknown }).__items;
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const card: Card = { id: 'c1', label: 'Ship the release', columnId: 'col-1' };

describe('PATCH-323 Ask Board AI on a card', () => {
  it('appears after Edit Card and attaches this card, opening the drawer', async () => {
    const askAboutCard = vi.fn();
    const ids = await mount(card, { askAboutCard });
    // Directly after "Edit Card", as the design places it.
    expect(ids.split(',').slice(0, 3)).toEqual(['edit', 'ask-board-ai', 'duplicate']);
    const items = (globalThis as unknown as { __items: { id: string; onClick: () => void }[] }).__items;
    await act(async () => { items.find((item) => item.id === 'ask-board-ai')!.onClick(); });
    expect(askAboutCard).toHaveBeenCalledWith({ id: 'c1', title: 'Ship the release' });
  });

  it('is absent where no Board AI host exists', async () => {
    const ids = await mount(card, null);
    expect(ids).not.toContain('ask-board-ai');
  });
});
