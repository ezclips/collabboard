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
        sourceBoardId="board-1"
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
      mode: 'notes',
      noteIds: ['n1', 'n3'],
      cards: undefined,
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

  it('Addendum 2: the middle scrolls, the footer stays outside it', async () => {
    await mount();
    const body = q('[data-send-kanban-body="true"]')!;
    expect(body).not.toBeNull();
    expect(body.className).toContain('overflow-y-auto');
    expect(body.className).toContain('min-h-0');

    const footer = q('[data-send-kanban-footer="true"]')!;
    expect(footer).not.toBeNull();
    // The footer (count + Create) is NOT inside the scrolling middle.
    expect(body.contains(footer)).toBe(false);
    expect(footer.querySelector('[data-send-kanban-confirm]')).not.toBeNull();

    // The dialog itself is a bounded column.
    expect(q('[data-send-to-kanban-dialog="true"]')?.className).toContain('max-h-[calc(100vh-48px)]');
  });
});

const buttonByText = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((el) => el.textContent?.includes(text)) ?? null;

describe('PATCH-342 SendToKanbanDialog AI mode', () => {
  it('suggests cards from the ticked notes, all ticked, and returns the ticked ones', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ cards: [{ title: 'Book the venue', description: 'Call three places.', sourceRefs: ['N1', 'N2'] }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const onConfirm = vi.fn();
    try {
      await mount({ preselectedIds: ['n1', 'n2'], onConfirm });

      await act(async () => { buttonByText('Suggest cards with AI')!.click(); });
      expect(q('[data-send-kanban-mode="ai"]')).not.toBeNull();

      await act(async () => { q<HTMLButtonElement>('[data-send-kanban-suggest]')!.click(); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      // Only refs + titles + texts leave the browser.
      const init = (fetchMock.mock.calls[0] as unknown[])[1] as RequestInit;
      const sent = JSON.parse(init.body as string);
      expect(sent.notes.map((n: { ref: string }) => n.ref)).toEqual(['N1', 'N2']);
      expect(JSON.stringify(sent)).not.toContain('n1');

      const suggestions = document.querySelectorAll('[data-send-kanban-suggestion]');
      expect(suggestions).toHaveLength(1);
      expect(q<HTMLInputElement>('[data-send-kanban-suggestion-checkbox]')!.checked).toBe(true);
      expect(q<HTMLInputElement>('[data-send-kanban-suggestion-title]')!.value).toBe('Book the venue');
      expect(q('[data-send-kanban-suggestion-sources]')?.textContent).toContain('First note');
      expect(q('[data-send-kanban-suggestion-sources]')?.textContent).toContain('Second note');
      expect(q('[data-send-kanban-count]')?.textContent).toContain('1 card will be created');

      // Edit the title, then create. (React's value tracker needs the native
      // setter, or the controlled onChange never fires.)
      const titleInput = q<HTMLInputElement>('[data-send-kanban-suggestion-title]')!;
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setValue.call(titleInput, 'Edited title');
        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () => { q<HTMLButtonElement>('[data-send-kanban-confirm]')!.click(); });

      expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({
        mode: 'ai',
        cards: [{ title: 'Edited title', description: 'Call three places.', sourceNoteIds: ['n1', 'n2'] }],
      }));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unticking a suggestion drops it from the count and disables create', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ cards: [{ title: 'One', description: '', sourceRefs: ['N1'] }] }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
    try {
      await mount({ preselectedIds: ['n1'] });
      await act(async () => { buttonByText('Suggest cards with AI')!.click(); });
      await act(async () => { q<HTMLButtonElement>('[data-send-kanban-suggest]')!.click(); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      expect(q('[data-send-kanban-count]')?.textContent).toContain('1 card will be created');
      await act(async () => { q<HTMLInputElement>('[data-send-kanban-suggestion-checkbox]')!.click(); });
      expect(q('[data-send-kanban-count]')?.textContent).toContain('0 cards will be created');
      expect(q<HTMLButtonElement>('[data-send-kanban-confirm]')!.disabled).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a plain-words error when the AI returns nothing usable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ cards: null }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )));
    try {
      await mount({ preselectedIds: ['n1'] });
      await act(async () => { buttonByText('Suggest cards with AI')!.click(); });
      await act(async () => { q<HTMLButtonElement>('[data-send-kanban-suggest]')!.click(); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(q('[data-send-kanban-ai-error]')?.textContent).toContain("Try 'One card per note'");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
