// @vitest-environment jsdom
//
// PATCH-325. The card editor host: it renders the active card's Editor and owns
// the Escape-to-close shortcut wherever it is mounted.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  ui: { activeCardId: null as string | null },
  cards: [{ id: 'c1', label: 'Ship the release', columnId: 'col-1' }],
  setActiveCard: vi.fn((id: string | null) => { hoisted.ui.activeCardId = id; }),
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => ({ cards: hoisted.cards }),
  useKanbanPersistence: () => ({ setActiveCard: hoisted.setActiveCard }),
  useKanbanUI: () => hoisted.ui,
  useKanbanReadonly: () => false,
}));
vi.mock('@/components/kanban-canvas/Editor', () => ({
  Editor: ({ onClose }: { onClose: () => void }) => (
    <button data-testid="kanban-editor" onClick={onClose}>editor</button>
  ),
}));

import { KanbanCardEditorHost } from '@/components/kanban-canvas/KanbanCardEditorHost';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function render() {
  await act(async () => { root!.render(<KanbanCardEditorHost />); });
}

beforeEach(() => {
  hoisted.ui.activeCardId = null;
  hoisted.setActiveCard.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-325 KanbanCardEditorHost', () => {
  it('renders nothing when no card is active', async () => {
    await render();
    expect(container.querySelector('[data-testid="kanban-editor"]')).toBeNull();
  });

  it('renders the Editor for the active card', async () => {
    hoisted.ui.activeCardId = 'c1';
    await render();
    expect(container.querySelector('[data-testid="kanban-editor"]')).not.toBeNull();
  });

  it('Escape closes the editor', async () => {
    hoisted.ui.activeCardId = 'c1';
    await render();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(hoisted.setActiveCard).toHaveBeenCalledWith(null);
  });

  it('the Editor close control closes it too', async () => {
    hoisted.ui.activeCardId = 'c1';
    await render();
    await act(async () => {
      (container.querySelector('[data-testid="kanban-editor"]') as HTMLButtonElement).click();
    });
    expect(hoisted.setActiveCard).toHaveBeenCalledWith(null);
  });
});
