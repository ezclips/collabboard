// @vitest-environment jsdom
//
// PATCH 9A: "Group into Column" destination-selection behavior, shared by
// every post-type menu that offers it via GroupIntoColumnMenuItem. Exercised
// through a real host menu (NotePostContextMenu) since the item only makes
// sense mounted inside an open ContextMenu/ContextMenuSub tree -- the same
// approach containerContextMenus.characterization.test.tsx uses for
// ColumnPostContextMenu's analogous "Edit post" openTargets submenu.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { NotePostContextMenu } from './menus/NotePostContextMenu';
import { LinkPostContextMenu } from './menus/LinkPostContextMenu';

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

function padlet(): Padlet {
  return { id: 'p1', type: 'text', metadata: {} } as unknown as Padlet;
}

function containerTarget(id: string, title: string): Padlet {
  return { id, type: 'container', title, metadata: {} } as unknown as Padlet;
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

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function itemByText(scope: ParentNode, text: string): HTMLElement {
  const match = Array.from((scope as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((el) => el.textContent?.includes(text) && el.getAttribute('aria-haspopup') !== 'menu');
  expect(match, `no menuitem containing "${text}"`).toBeTruthy();
  return match!;
}

function subTriggerByText(scope: ParentNode, text: string): HTMLElement {
  const match = Array.from((scope as HTMLElement).querySelectorAll<HTMLElement>('[aria-haspopup="menu"]'))
    .find((el) => el.textContent?.includes(text));
  expect(match, `no sub-trigger containing "${text}"`).toBeTruthy();
  return match!;
}

/** Opens a submenu via the real Radix ArrowRight keyboard interaction. */
function openSubmenu(trigger: HTMLElement): HTMLElement {
  act(() => {
    trigger.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }),
    );
  });
  expect(trigger.getAttribute('data-state')).toBe('open');
  const sub = document.querySelector<HTMLElement>('[data-slot="context-menu-sub-content"]');
  expect(sub, 'submenu did not open').not.toBeNull();
  return sub!;
}

const trigger = <div data-testid="trigger">post</div>;

describe('Group into Column -- zero existing containers', () => {
  it('renders as a plain menuitem (no submenu) and acts immediately with no target id', () => {
    const onGroupIntoColumn = vi.fn();
    const container = mount(
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} onGroupIntoColumn={onGroupIntoColumn} groupIntoColumnTargets={[]}>
        {trigger}
      </NotePostContextMenu>,
    );
    const menu = openMenu(container);

    const row = itemByText(menu, 'Group into Column');
    expect(row.getAttribute('aria-haspopup')).not.toBe('menu');

    click(row);

    expect(onGroupIntoColumn).toHaveBeenCalledTimes(1);
    expect(onGroupIntoColumn).toHaveBeenCalledWith();
  });

  it('same flat behavior when groupIntoColumnTargets is simply omitted', () => {
    const onGroupIntoColumn = vi.fn();
    const container = mount(
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} onGroupIntoColumn={onGroupIntoColumn}>
        {trigger}
      </NotePostContextMenu>,
    );
    const menu = openMenu(container);

    click(itemByText(menu, 'Group into Column'));

    expect(onGroupIntoColumn).toHaveBeenCalledWith();
  });
});

describe('Group into Column -- existing containers present', () => {
  it('becomes a submenu listing New Column first, then each existing container in order', () => {
    const targets = [containerTarget('c1', 'Marketing Tasks'), containerTarget('c2', '')];
    const container = mount(
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} onGroupIntoColumn={vi.fn()} groupIntoColumnTargets={targets}>
        {trigger}
      </NotePostContextMenu>,
    );
    const menu = openMenu(container);

    const subTrigger = subTriggerByText(menu, 'Group into Column');
    const sub = openSubmenu(subTrigger);
    const rowLabels = Array.from(sub.querySelectorAll<HTMLElement>('[role="menuitem"]')).map(
      (el) => el.textContent?.trim(),
    );

    expect(rowLabels).toEqual(['New Column', 'Marketing Tasks', 'Container']);
  });

  it('clicking "New Column" calls onGroupIntoColumn with no target id', () => {
    const onGroupIntoColumn = vi.fn();
    const targets = [containerTarget('c1', 'Marketing Tasks')];
    const container = mount(
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} onGroupIntoColumn={onGroupIntoColumn} groupIntoColumnTargets={targets}>
        {trigger}
      </NotePostContextMenu>,
    );
    const menu = openMenu(container);
    const sub = openSubmenu(subTriggerByText(menu, 'Group into Column'));

    click(itemByText(sub, 'New Column'));

    expect(onGroupIntoColumn).toHaveBeenCalledWith();
  });

  it('clicking an existing container calls onGroupIntoColumn with that container\'s id', () => {
    const onGroupIntoColumn = vi.fn();
    const targets = [containerTarget('c1', 'Marketing Tasks'), containerTarget('c2', 'Q3 Ideas')];
    const container = mount(
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} onGroupIntoColumn={onGroupIntoColumn} groupIntoColumnTargets={targets}>
        {trigger}
      </NotePostContextMenu>,
    );
    const menu = openMenu(container);
    const sub = openSubmenu(subTriggerByText(menu, 'Group into Column'));

    click(itemByText(sub, 'Q3 Ideas'));

    expect(onGroupIntoColumn).toHaveBeenCalledTimes(1);
    expect(onGroupIntoColumn).toHaveBeenCalledWith('c2');
    // Only the chosen container's id is forwarded -- the other target is
    // never touched (row isolation, same guarantee as every other post-menu
    // action in this family).
    expect(onGroupIntoColumn).not.toHaveBeenCalledWith('c1');
  });

  it('is wired identically on a second host menu (LinkPostContextMenu)', () => {
    const onGroupIntoColumn = vi.fn();
    const targets = [containerTarget('c1', 'Reading List')];
    const container = mount(
      <LinkPostContextMenu padlet={padlet()} onSelect={vi.fn()} onGroupIntoColumn={onGroupIntoColumn} groupIntoColumnTargets={targets}>
        {trigger}
      </LinkPostContextMenu>,
    );
    const menu = openMenu(container);
    const sub = openSubmenu(subTriggerByText(menu, 'Group into Column'));

    click(itemByText(sub, 'Reading List'));

    expect(onGroupIntoColumn).toHaveBeenCalledWith('c1');
  });
});
