// @vitest-environment jsdom
//
// PATCH-320 §2. Toolbar "Add Group" creates a group (via the caller's modal),
// and "Group by" is its own button holding the group-by + filter selects.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  data: { cards: [], users: [], columns: [], rows: [], columnGroups: [], links: [] } as any,
  ui: { groupBy: 'none', groupFilter: null, sortBy: null, sortOrder: 'asc', searchQuery: '', locale: 'en' } as any,
  actions: {
    setGroupBy: vi.fn(),
    setGroupFilter: vi.fn(),
    setProjectFilter: vi.fn(),
    setStatusFilter: vi.fn(),
    setSort: vi.fn(),
    setSearchQuery: vi.fn(),
    setLocale: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    addColumn: vi.fn(),
    addRow: vi.fn(),
  } as any,
  history: { past: [], future: [] } as any,
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanPersistence: () => hoisted.actions,
  useKanbanUI: () => hoisted.ui,
  useKanbanHistory: () => hoisted.history,
  useKanbanReadonly: () => false,
  useKanbanData: () => hoisted.data,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));

import { Toolbar } from '@/components/kanban-canvas/Toolbar';

(globalThis as unknown as { React?: typeof React }).React = React;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mount(onAddGroup = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Toolbar onAddGroup={onAddGroup} />);
  });
  return onAddGroup;
}

beforeEach(() => {
  hoisted.ui = { groupBy: 'none', groupFilter: null, sortBy: null, sortOrder: 'asc', searchQuery: '', locale: 'en' };
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

describe('PATCH-320: the kanban toolbar', () => {
  it('Add Group calls the group-creation handler', async () => {
    const onAddGroup = await mount();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="addGroup"]')!.click();
    });
    expect(onAddGroup).toHaveBeenCalledTimes(1);
  });

  it('Group by is its own button showing the group-by select', async () => {
    await mount();
    expect(container.querySelector('select[aria-label="groupByLabel"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="groupByLabel"]')!.click();
    });
    expect(container.querySelector('select[aria-label="groupByLabel"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="filterBy"]')).toBeNull();
  });

  it('shows the filter select once a grouping is chosen', async () => {
    hoisted.ui = { ...hoisted.ui, groupBy: 'priority' };
    await mount();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[title="groupByLabel"]')!.click();
    });
    expect(container.querySelector('select[aria-label="groupByLabel"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="filterBy"]')).not.toBeNull();
  });
});
