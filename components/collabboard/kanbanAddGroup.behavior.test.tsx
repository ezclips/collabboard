// @vitest-environment jsdom
//
// PATCH-320 §2. Add Group opens the name modal and the store action creates the
// group with that name (next order, not collapsed).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  data: { cards: [], columns: [], rows: [], links: [], users: [], columnGroups: [] } as any,
  ui: { activeCardId: null } as any,
  actions: { addColumnGroup: vi.fn(), undo: vi.fn(), redo: vi.fn(), setActiveCard: vi.fn() } as any,
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => hoisted.data,
  useKanbanPersistence: () => hoisted.actions,
  useKanbanUI: () => hoisted.ui,
  useKanbanReadonly: () => false,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/components/kanban-canvas/Board', () => ({ Board: () => null }));
vi.mock('@/components/kanban-canvas/Editor', () => ({ Editor: () => null }));
vi.mock('@/components/kanban-canvas/Toolbar', async () => {
  const ReactModule = await import('react');
  return {
    Toolbar: ({ onAddGroup }: { onAddGroup?: () => void }) =>
      ReactModule.createElement(
        'button',
        { 'data-testid': 'add-group', onClick: onAddGroup },
        'Add Group',
      ),
  };
});

import { KanbanCanvas } from '@/components/kanban-canvas/KanbanCanvas';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

beforeEach(() => {
  hoisted.actions.addColumnGroup.mockReset();
  hoisted.data = { cards: [], columns: [], rows: [], links: [], users: [], columnGroups: [] };
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

describe('PATCH-320: Add Group creates a column group', () => {
  it('opens the modal and creates the group with its name', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<KanbanCanvas canvasId="board-1" />);
    });

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="add-group"]')!.click();
    });

    const input = container.querySelector<HTMLInputElement>('.kanban-dialog-input');
    expect(input).not.toBeNull();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, 'My Group');
      input!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(hoisted.actions.addColumnGroup).toHaveBeenCalledWith(
      expect.objectContaining({ label: 'My Group', order: 10, collapsed: false }),
    );
  });
});
