// @vitest-environment jsdom
//
// PATCH 9C.1 -- replaces the global "Show/Hide post titles" toggle with a
// "Post titles >" submenu, one independently-toggleable entry per child.
// Reuses the exact same child inventory (openTargets) and label convention
// (getOpenTargetLabel / getContainerEditTargetLabel) as the existing
// "Edit post >" submenu, per the spec's explicit instruction not to build a
// second child-discovery algorithm. Mirrors the mount/openMenu convention
// established in containerContextMenus.characterization.test.tsx.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { ColumnPostContextMenu } from './menus/ColumnPostContextMenu';
import { getContainerEditTargetLabel } from '@/lib/infra/collabboard/containerEditTargetLabel';

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

function child(id: string, title: string, type = 'note'): Padlet {
  return { id, title, type, metadata: { parentId: 'container-1' } } as unknown as Padlet;
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

function openSubmenu(menu: HTMLElement, triggerLabel: string): HTMLElement {
  const trigger = Array.from(menu.querySelectorAll('[aria-haspopup="menu"]')).find(
    (el) => (el.textContent ?? '').trim() === triggerLabel,
  ) as HTMLElement | undefined;
  expect(trigger, `submenu trigger "${triggerLabel}" not found`).toBeDefined();
  act(() => {
    trigger!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
  });
  const submenus = document.querySelectorAll<HTMLElement>('[role="menu"]');
  expect(submenus.length, 'submenu did not open').toBeGreaterThan(1);
  return submenus[submenus.length - 1];
}

const THREE_CHILDREN = [
  child('child-a', 'Hallo world'),
  child('child-b', 'Hallo World'),
  child('child-c', '', 'image'),
];

function mountMenu(overrides: Partial<React.ComponentProps<typeof ColumnPostContextMenu>> = {}) {
  return mount(
    <ColumnPostContextMenu
      padlet={containerPadlet()}
      onSelect={vi.fn()}
      onEdit={vi.fn()}
      onOpenTarget={vi.fn()}
      getOpenTargetLabel={getContainerEditTargetLabel}
      openTargets={THREE_CHILDREN}
      onSendToBack={vi.fn()}
      onBringToFront={vi.fn()}
      onDelete={vi.fn()}
      onTogglePostTitleVisibility={vi.fn()}
      postTitleVisibleIds={[]}
      {...overrides}
    >
      <div data-testid="trigger">Container</div>
    </ColumnPostContextMenu>,
  );
}

describe('ColumnPostContextMenu: Post titles submenu (PATCH 9C.1)', () => {
  it('the Container menu has a "Post titles >" submenu trigger [matrix 1]', () => {
    const container = mountMenu();
    const menu = openMenu(container);
    const triggers = Array.from(menu.querySelectorAll('[aria-haspopup="menu"]')).map((el) => (el.textContent ?? '').trim());
    expect(triggers).toContain('Post titles');
  });

  it('the old global "Show post titles" / "Hide post titles" actions are gone [matrix 2, 3]', () => {
    const container = mountMenu();
    const menu = openMenu(container);
    expect(itemLabels(menu)).not.toContain('Show post titles');
    expect(itemLabels(menu)).not.toContain('Hide post titles');
  });

  it('the submenu lists every child, in the same order as Edit post > [matrix 4, 5]', () => {
    const container = mountMenu();
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Post titles');
    const editSubmenuLabels = itemLabels(openSubmenu(openMenu(container), 'Edit post'));
    expect(itemLabels(submenu)).toEqual(editSubmenuLabels);
  });

  it('an actually-titled child uses its actual title as the menu label [matrix 6]', () => {
    const container = mountMenu();
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Post titles');
    expect(itemLabels(submenu)).toContain('Hallo world');
    expect(itemLabels(submenu)).toContain('Hallo World');
  });

  it('an untitled Image child uses "Image" as the MENU label only [matrix 7]', () => {
    const container = mountMenu();
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Post titles');
    expect(itemLabels(submenu)).toContain('Image');
  });

  it('an untitled Note child uses the corresponding type fallback as the MENU label [matrix 8]', () => {
    const container = mountMenu({ openTargets: [child('child-note-untitled', '', 'note')] });
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Post titles');
    expect(itemLabels(submenu)).toEqual([getContainerEditTargetLabel({ title: '', type: 'note' })]);
  });

  it('a currently-visible child shows a checkmark; a hidden one does not [matrix 9]', () => {
    const container = mountMenu({ postTitleVisibleIds: ['child-a'] });
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Post titles');
    const items = Array.from(submenu.querySelectorAll('[data-slot="context-menu-item"]'));
    const childAItem = items.find((el) => (el.textContent ?? '').trim() === 'Hallo world')!;
    const childBItem = items.find((el) => (el.textContent ?? '').trim() === 'Hallo World')!;
    expect(childAItem.querySelector('svg')).not.toBeNull();
    expect(childBItem.querySelector('svg')).toBeNull();
  });

  it('clicking one entry toggles only that child [matrix 10]', () => {
    const onTogglePostTitleVisibility = vi.fn();
    const container = mountMenu({ onTogglePostTitleVisibility });
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Post titles');
    const items = Array.from(submenu.querySelectorAll('[data-slot="context-menu-item"]'));
    const childBItem = items.find((el) => (el.textContent ?? '').trim() === 'Hallo World')!;
    act(() => { childBItem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onTogglePostTitleVisibility).toHaveBeenCalledTimes(1);
    expect(onTogglePostTitleVisibility).toHaveBeenCalledWith('child-b');
  });

  it('is absent when there are no children (empty Container) or no handler provided', () => {
    const noChildren = mountMenu({ openTargets: [] });
    const menu1 = openMenu(noChildren);
    expect(Array.from(menu1.querySelectorAll('[aria-haspopup="menu"]')).map((el) => el.textContent?.trim())).not.toContain('Post titles');

    const noHandler = mountMenu({ onTogglePostTitleVisibility: undefined });
    const menu2 = openMenu(noHandler);
    expect(Array.from(menu2.querySelectorAll('[aria-haspopup="menu"]')).map((el) => el.textContent?.trim())).not.toContain('Post titles');
  });
});

describe('ColumnPostContextMenu: Edit post submenu regression (PATCH 9C.1) [matrix 31]', () => {
  it('Edit post submenu is unchanged -- same children, same pencil-icon presentation, unaffected by Post titles', () => {
    const container = mountMenu();
    const menu = openMenu(container);
    const submenu = openSubmenu(menu, 'Edit post');
    expect(itemLabels(submenu)).toEqual(['Hallo world', 'Hallo World', 'Image']);
  });
});
