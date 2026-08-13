// @vitest-environment jsdom
//
// PATCH 9C -- the "Show post titles" / "Hide post titles" Container menu
// item, additive to ColumnPostContextMenu (the exact component that
// produces the "Edit post / Send to Back / Bring to Front / Delete post"
// menu shown for a Container padlet in FreeformPadletCards.tsx). Mirrors
// the mount/openMenu convention established in
// containerContextMenus.characterization.test.tsx.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { ColumnPostContextMenu } from './menus/ColumnPostContextMenu';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
  vi.restoreAllMocks();
});

function containerPadlet(metadata: Record<string, unknown> = {}): Padlet {
  return { id: 'container-1', type: 'container', metadata } as unknown as Padlet;
}

function openMenu(container: HTMLElement): HTMLElement {
  const trigger = container.querySelector('[data-testid="trigger"]')!;
  act(() => {
    trigger.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
    );
  });
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, 'context menu did not open').not.toBeNull();
  return menu!;
}

function itemLabels(menu: HTMLElement): string[] {
  return Array.from(menu.querySelectorAll('[data-slot="context-menu-item"]')).map(
    (el) => (el.textContent ?? '').trim(),
  );
}

describe('ColumnPostContextMenu: Container child-post-titles toggle (PATCH 9C)', () => {
  it('renders "Show post titles" when titles are currently off (missing/false)', () => {
    const container = mount(
      <ColumnPostContextMenu
        padlet={containerPadlet()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onSendToBack={vi.fn()}
        onBringToFront={vi.fn()}
        onDelete={vi.fn()}
        onToggleChildTitles={vi.fn()}
        childTitlesVisible={false}
      >
        <div data-testid="trigger">Container</div>
      </ColumnPostContextMenu>,
    );
    const menu = openMenu(container);
    expect(itemLabels(menu)).toContain('Show post titles');
    expect(itemLabels(menu)).not.toContain('Hide post titles');
  });

  it('renders "Hide post titles" when titles are currently on', () => {
    const container = mount(
      <ColumnPostContextMenu
        padlet={containerPadlet({ showChildPostTitles: true })}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onSendToBack={vi.fn()}
        onBringToFront={vi.fn()}
        onDelete={vi.fn()}
        onToggleChildTitles={vi.fn()}
        childTitlesVisible={true}
      >
        <div data-testid="trigger">Container</div>
      </ColumnPostContextMenu>,
    );
    const menu = openMenu(container);
    expect(itemLabels(menu)).toContain('Hide post titles');
    expect(itemLabels(menu)).not.toContain('Show post titles');
  });

  it('clicking the item invokes onToggleChildTitles', () => {
    const onToggleChildTitles = vi.fn();
    const container = mount(
      <ColumnPostContextMenu
        padlet={containerPadlet()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onSendToBack={vi.fn()}
        onBringToFront={vi.fn()}
        onDelete={vi.fn()}
        onToggleChildTitles={onToggleChildTitles}
        childTitlesVisible={false}
      >
        <div data-testid="trigger">Container</div>
      </ColumnPostContextMenu>,
    );
    const menu = openMenu(container);
    const item = Array.from(menu.querySelectorAll('[data-slot="context-menu-item"]')).find(
      (el) => (el.textContent ?? '').trim() === 'Show post titles',
    )!;
    act(() => { item.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onToggleChildTitles).toHaveBeenCalledTimes(1);
  });

  it('is absent entirely when onToggleChildTitles is not provided (non-Container menus, or readonly via the disabled gate, are unaffected)', () => {
    const container = mount(
      <ColumnPostContextMenu
        padlet={containerPadlet()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onSendToBack={vi.fn()}
        onBringToFront={vi.fn()}
        onDelete={vi.fn()}
      >
        <div data-testid="trigger">Container</div>
      </ColumnPostContextMenu>,
    );
    const menu = openMenu(container);
    expect(itemLabels(menu)).not.toContain('Show post titles');
    expect(itemLabels(menu)).not.toContain('Hide post titles');
  });

  it('sits between "Edit post" and the layer actions, matching the requested menu ordering', () => {
    const container = mount(
      <ColumnPostContextMenu
        padlet={containerPadlet()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onSendToBack={vi.fn()}
        onBringToFront={vi.fn()}
        onDelete={vi.fn()}
        onToggleChildTitles={vi.fn()}
        childTitlesVisible={false}
      >
        <div data-testid="trigger">Container</div>
      </ColumnPostContextMenu>,
    );
    const menu = openMenu(container);
    const labels = itemLabels(menu);
    expect(labels).toEqual(['Edit post', 'Show post titles', 'Send to Back', 'Bring to Front', 'Delete post']);
  });
});
