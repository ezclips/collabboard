// @vitest-environment jsdom
//
// PATCH-319. The editor's date inputs must show a stored TIMESTAMPTZ date
// (input[type=date] only accepts YYYY-MM-DD), and links must come from the
// store's data.links, not the never-populated card.links.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Card } from '@/types/kanban-canvas';

const hoisted = vi.hoisted(() => ({
  data: { cards: [], links: [], users: [], columns: [], columnGroups: [], rows: [] } as any,
  ui: { dateFormat: 'YYYY-MM-DD', collapsedColumns: new Set(), collapsedRows: new Set() } as any,
  actions: {
    updateCard: vi.fn(async () => {}),
    addLink: vi.fn(async () => ({ ok: true })),
    deleteLink: vi.fn(async () => {}),
  },
}));

vi.mock('@/components/kanban-canvas/store', () => ({
  useKanbanData: () => hoisted.data,
  useKanbanUI: () => hoisted.ui,
  useKanbanPersistence: () => hoisted.actions,
}));
vi.mock('@/components/kanban-canvas/useKanbanI18n', () => ({
  useKanbanI18n: () => ({ t: (key: string) => key }),
}));
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
    storage: { from: () => ({ upload: async () => ({ error: null }) }) },
  },
}));

import { Editor } from '@/components/kanban-canvas/Editor';

// The vitest esbuild transform compiles JSX to React.createElement; these
// components (like many older ones) have no React binding of their own.
(globalThis as unknown as { React?: typeof React }).React = React;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function mount(card: Card, onClose = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<Editor card={card} onClose={onClose} />);
  });
  return onClose;
}

beforeEach(() => {
  hoisted.actions.updateCard.mockReset().mockResolvedValue(undefined);
  hoisted.actions.addLink.mockReset().mockResolvedValue({ ok: true });
  hoisted.actions.deleteLink.mockReset().mockResolvedValue(undefined);
  hoisted.ui = { dateFormat: 'YYYY-MM-DD', collapsedColumns: new Set(), collapsedRows: new Set() };
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

const baseCard = (over: Partial<Card> = {}): Card => ({
  id: 'c1',
  label: 'Task',
  columnId: 'col-1',
  ...over,
});

describe('PATCH-319: the kanban editor', () => {
  it('shows a stored TIMESTAMPTZ date in the input and keeps it on save', async () => {
    const card = baseCard({ start_date: '2026-10-10T00:00:00+00:00' });
    hoisted.data = { ...hoisted.data, cards: [card], links: [] };
    await mount(card);

    const input = container.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(input.value).not.toBe('');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.kanban-editor-btn-save')!.click();
      await Promise.resolve();
    });

    expect(hoisted.actions.updateCard).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ start_date: '2026-10-10T00:00:00+00:00' }),
    );
  });

  it('shows links from the store data.links for this card', async () => {
    const card = baseCard({ links: undefined });
    const target = baseCard({ id: 'c2', label: 'Target Card' });
    hoisted.data = {
      ...hoisted.data,
      cards: [card, target],
      links: [{ id: 'l1', masterId: 'c1', slaveId: 'c2', relation: 'Relates to' }],
    };
    await mount(card);

    const list = container.querySelector('.kanban-links-list');
    expect(list).not.toBeNull();
    expect(list!.textContent).toContain('Target Card');
  });
});
