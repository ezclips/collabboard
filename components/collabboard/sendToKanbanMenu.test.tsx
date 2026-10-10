// @vitest-environment jsdom
//
// PATCH-340. The note context menu gains "Send to Kanban" (unlinked) or
// "Open card" + "Unlink card" (linked). A viewer still gets "Open card".
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { NotePostContextMenu } from './menus/NotePostContextMenu';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
  (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
  (Element.prototype as unknown as { releasePointerCapture?: () => void }).releasePointerCapture ??= () => {};
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function note(over: Record<string, unknown> = {}): Padlet {
  return {
    id: 'n1', board_id: 'b1', title: '', content: '', type: 'text',
    position_x: 0, position_y: 0, width: 100, height: 100,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    metadata: {},
    ...over,
  } as unknown as Padlet;
}

async function openMenu(props: Partial<React.ComponentProps<typeof NotePostContextMenu>>) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <NotePostContextMenu padlet={note()} onSelect={vi.fn()} {...props}>
        <button data-testid="trigger">note</button>
      </NotePostContextMenu>,
    );
  });
  const trigger = container.querySelector('[data-testid="trigger"]')!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  });
}

const menuLabels = () =>
  Array.from(document.querySelectorAll('[role="menuitem"]')).map((el) => el.textContent ?? '');

afterEach(() => {
  if (root) { act(() => root!.unmount()); root = null; }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-340 note context menu', () => {
  it('offers "Send to Kanban" for an unlinked note', async () => {
    await openMenu({ onSendToKanban: vi.fn() });
    expect(menuLabels().some((label) => label.includes('Send to Kanban'))).toBe(true);
    expect(menuLabels().some((label) => label.includes('Open card'))).toBe(false);
  });

  it('offers "Open card" and "Unlink card" for a linked note, not Send', async () => {
    await openMenu({
      padlet: note({ metadata: { kanbanLink: { boardId: 'kb', cardId: 'kc' } } }),
      onSendToKanban: vi.fn(),
      onOpenKanbanCard: vi.fn(),
      onUnlinkKanban: vi.fn(),
    });
    const labels = menuLabels();
    expect(labels.some((label) => label.includes('Open card'))).toBe(true);
    expect(labels.some((label) => label.includes('Unlink card'))).toBe(true);
    expect(labels.some((label) => label.includes('Send to Kanban'))).toBe(false);
  });

  it('gives a viewer a one-row "Open card" menu for a linked note', async () => {
    await openMenu({
      padlet: note({ metadata: { kanbanLink: { boardId: 'kb', cardId: 'kc' } } }),
      disabled: true,
      onOpenKanbanCard: vi.fn(),
    });
    expect(menuLabels()).toEqual(['Open card']);
  });

  it('gives a viewer no menu for an unlinked note', async () => {
    await openMenu({ disabled: true, onSendToKanban: vi.fn() });
    expect(document.querySelectorAll('[role="menuitem"]')).toHaveLength(0);
  });
});
