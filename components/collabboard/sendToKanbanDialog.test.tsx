// @vitest-environment jsdom
//
// PATCH-340 Addendum 1. The dialog lists the candidate notes with a checkbox
// each (Freeform has no multi-select gesture, so the choice lives here).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';

vi.mock('@/lib/kanban/sendNotesToKanban', () => ({
  listEditableKanbanBoards: vi.fn(),
  loadBoardColumns: vi.fn(),
}));

import { loadBoardColumns, listEditableKanbanBoards } from '@/lib/kanban/sendNotesToKanban';
import { SendToKanbanDialog } from './SendToKanbanDialog';

class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function note(id: string, title: string): Padlet {
  return {
    id, board_id: 'fb', title, content: '', type: 'text',
    position_x: 0, position_y: 0, width: 100, height: 100,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  } as unknown as Padlet;
}

const NOTES = [note('n1', 'First note'), note('n2', 'Second note'), note('n3', 'Third note')];

async function mount(props: Partial<React.ComponentProps<typeof SendToKanbanDialog>> = {}) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <SendToKanbanDialog
        isOpen
        onClose={vi.fn()}
        notes={NOTES}
        preselectedIds={[]}
        userId="u1"
        onConfirm={vi.fn()}
        {...props}
      />,
    );
  });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

const q = <T extends Element>(selector: string) => document.querySelector(selector) as T | null;
const checkbox = (id: string) => q<HTMLInputElement>(`[data-send-kanban-note="${id}"]`);

beforeEach(() => {
  vi.mocked(listEditableKanbanBoards).mockReset();
  vi.mocked(loadBoardColumns).mockReset();
  vi.mocked(listEditableKanbanBoards).mockResolvedValue([{ id: 'kb1', title: 'Roadmap', updatedAt: null }]);
  vi.mocked(loadBoardColumns).mockResolvedValue([
    { id: 'c1', name: 'Todo', order: 0 },
    { id: 'c2', name: 'Doing', order: 1 },
  ]);
});

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-340 Addendum 1 SendToKanbanDialog', () => {
  it('lists the candidate notes with card-title labels and pre-ticks the selection', async () => {
    await mount({ preselectedIds: ['n1', 'n3'] });

    expect(document.querySelectorAll('[data-send-kanban-note]')).toHaveLength(3);
    expect(checkbox('n1')!.checked).toBe(true);
    expect(checkbox('n2')!.checked).toBe(false);
    expect(checkbox('n3')!.checked).toBe(true);
    expect(q('[data-send-kanban-count]')?.textContent).toContain('2 cards will be created');
    expect(q('[data-send-kanban-confirm]')?.textContent).toContain('Create 2 cards');
  });

  it('select all / none toggles every note and the count follows the ticks', async () => {
    await mount({ preselectedIds: ['n1'] });
    expect(q('[data-send-kanban-count]')?.textContent).toContain('1 card will be created');

    await act(async () => { q<HTMLButtonElement>('[data-send-kanban-select-all]')!.click(); });
    expect(checkbox('n2')!.checked).toBe(true);
    expect(q('[data-send-kanban-count]')?.textContent).toContain('3 cards will be created');

    await act(async () => { q<HTMLButtonElement>('[data-send-kanban-select-all]')!.click(); });
    expect(checkbox('n1')!.checked).toBe(false);
    expect(q('[data-send-kanban-count]')?.textContent).toContain('0 cards will be created');
    expect(q<HTMLButtonElement>('[data-send-kanban-confirm]')!.disabled).toBe(true);
  });

  it('confirm returns exactly the ticked ids with the board and column', async () => {
    const onConfirm = vi.fn();
    await mount({ preselectedIds: ['n1', 'n3'], onConfirm });

    const column = q<HTMLSelectElement>('[data-send-kanban-column]')!;
    await act(async () => {
      column.value = 'c2';
      column.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => { q<HTMLButtonElement>('[data-send-kanban-confirm]')!.click(); });

    expect(onConfirm).toHaveBeenCalledWith({
      noteIds: ['n1', 'n3'],
      boardId: 'kb1',
      boardTitle: 'Roadmap',
      columnId: 'c2',
      columnTitle: 'Doing',
      swimlaneId: null,
    });
  });

  it('shows how many notes are already on a board', async () => {
    await mount({ linkedCount: 2 });
    expect(q('[data-send-kanban-linked-count]')?.textContent).toContain('2 notes already on a board');
  });

  it('shows the empty state with a create-board link when there is no editable board', async () => {
    vi.mocked(listEditableKanbanBoards).mockResolvedValue([]);
    await mount();

    expect(q('[data-send-kanban-empty]')?.textContent).toContain('no Kanban board you can edit');
    expect(q<HTMLAnchorElement>('[data-send-kanban-empty] a')!.getAttribute('href')).toBe('/dashboard/create-canvas');
  });
});
