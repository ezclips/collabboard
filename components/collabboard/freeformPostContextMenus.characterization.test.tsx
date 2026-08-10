// @vitest-environment jsdom
//
// Characterization of the five Freeform post context menus after their
// migration onto the shared shell in components/ui/context-menu.tsx.
//
// The expected inventories below were captured from the pre-migration
// (raw-Radix) implementations at fac3383. They are the contract: action set,
// order, labels and separator placement must not drift.
//
// PATCH 4H removed every visible keyboard-shortcut hint from CollabBoard
// context menus. The shortcuts themselves are unaffected -- they live in
// components/collabboard/canvas/hooks/useCanvasShortcuts.ts and the editors,
// not here. `inventory()` still renders a row as `Label | Shortcut` when a
// shortcut slot is present, so these bare-label constants are themselves the
// guard against a hint reappearing.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { actionRegistry } from '@/lib/collabboard/ActionRegistry';
import { NotePostContextMenu } from './menus/NotePostContextMenu';
import { CommentPostContextMenu } from './menus/CommentPostContextMenu';
import { LinkPostContextMenu } from './menus/LinkPostContextMenu';
import { TodoPostContextMenu } from './menus/TodoPostContextMenu';
import { ImagePostContextMenu } from './context-menus/ImagePostContextMenu';

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

function padlet(metadata: Record<string, unknown> = {}): Padlet {
  return { id: 'p1', type: 'text', metadata } as unknown as Padlet;
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

/**
 * Ordered inventory of a menu's contents: every item as `Label` or
 * `Label | Shortcut`, and every separator as `---`.
 */
function inventory(menu: HTMLElement): string[] {
  return Array.from(menu.children).map((child) => {
    const el = child as HTMLElement;
    if (el.getAttribute('data-slot') === 'context-menu-separator') {
      return '---';
    }
    const shortcut = el.querySelector<HTMLElement>('[data-slot="context-menu-shortcut"]');
    const full = (el.textContent ?? '').trim();
    if (!shortcut) {
      return full;
    }
    // The shortcut slot is the row's last child, so its text is a suffix.
    const shortcutText = (shortcut.textContent ?? '').trim();
    const label = full.slice(0, full.length - shortcutText.length).trim();
    return `${label} | ${shortcutText}`;
  });
}

function items(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
}

function itemByLabel(menu: HTMLElement, label: string): HTMLElement {
  const match = items(menu).find((el) => el.textContent?.includes(label));
  expect(match, `no item labelled "${label}"`).toBeTruthy();
  return match!;
}

const NOTE_INVENTORY = [
  'Cut',
  'Copy',
  'Duplicate',
  'Create Synced Copy',
  'Add to Library',
  'Delete',
  '---',
  'Group into Column',
  '---',
  'Lock Position',
  '---',
  'Send to Back',
  'Send Backward',
  'Bring Forward',
  'Bring to Front',
];

const COMMENT_INVENTORY = [
  'Paste',
  'Cut',
  'Copy',
  'Duplicate',
  'Add to Library',
  'Delete',
  '---',
  'Rename',
  '---',
  'Lock Position',
  '---',
  'Bring to Front',
  'Send to Back',
];

const LINK_INVENTORY = [
  'Cut',
  'Copy',
  'Duplicate',
  'Add to Library',
  'Delete',
  '---',
  'Add Image',
  'Copy link address',
  '---',
  'Group into Column',
  '---',
  'Lock Position',
  '---',
  'Bring to Front',
  'Send to Back',
];

const TODO_INVENTORY = [
  'Cut',
  'Copy',
  'Duplicate',
  'Add to Library',
  'Delete',
  '---',
  'Rename',
  '---',
  'Group into Column',
  '---',
  'Lock Position',
  '---',
  'Bring to Front',
  'Send to Back',
];

const IMAGE_INVENTORY = [
  'Cut',
  'Copy',
  'Duplicate',
  'Add to Library',
  'Delete',
  '---',
  'Replace Image',
  'Download Original Image',
  'Crop Image to Fit Dot Grid',
  'Full View',
  '---',
  'Group into Column',
  '---',
  'Lock Position',
  '---',
  'Bring to Front',
  'Send to Back',
];

const trigger = <div data-testid="trigger">post</div>;

const MENUS = [
  {
    name: 'Note',
    expected: NOTE_INVENTORY,
    file: 'components/collabboard/menus/NotePostContextMenu.tsx',
    render: (props: Record<string, unknown> = {}) => (
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
        {trigger}
      </NotePostContextMenu>
    ),
  },
  {
    name: 'Comment',
    expected: COMMENT_INVENTORY,
    file: 'components/collabboard/menus/CommentPostContextMenu.tsx',
    render: (props: Record<string, unknown> = {}) => (
      <CommentPostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
        {trigger}
      </CommentPostContextMenu>
    ),
  },
  {
    name: 'Link',
    expected: LINK_INVENTORY,
    file: 'components/collabboard/menus/LinkPostContextMenu.tsx',
    render: (props: Record<string, unknown> = {}) => (
      <LinkPostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
        {trigger}
      </LinkPostContextMenu>
    ),
  },
  {
    name: 'Todo',
    expected: TODO_INVENTORY,
    file: 'components/collabboard/menus/TodoPostContextMenu.tsx',
    render: (props: Record<string, unknown> = {}) => (
      <TodoPostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
        {trigger}
      </TodoPostContextMenu>
    ),
  },
  {
    name: 'Image',
    expected: IMAGE_INVENTORY,
    file: 'components/collabboard/context-menus/ImagePostContextMenu.tsx',
    render: (props: Record<string, unknown> = {}) => (
      <ImagePostContextMenu padlet={padlet()} onSelect={vi.fn()} {...props}>
        {trigger}
      </ImagePostContextMenu>
    ),
  },
] as const;

describe.each(MENUS)('$name post context menu', ({ name, expected, file, render }) => {
  it('preserves its action set, order and labels', () => {
    const menu = openMenu(mount(render()));
    expect(inventory(menu)).toEqual(expected);
  });

  it('displays no keyboard-shortcut hints', () => {
    const menu = openMenu(mount(render()));
    expect(menu.querySelectorAll('[data-slot="context-menu-shortcut"]')).toHaveLength(0);
    // Nothing hand-written stands in for the removed slot either.
    expect(menu.textContent ?? '').not.toMatch(/Ctrl+|Alt+|Shift+|Backspace|Return|⌥|⌘/);
  });

  it('renders every action through the shared shell primitives', () => {
    const menu = openMenu(mount(render()));
    expect(menu.getAttribute('data-slot')).toBe('context-menu-content');
    const actionCount = expected.filter((entry) => entry !== '---').length;
    const separatorCount = expected.filter((entry) => entry === '---').length;
    expect(items(menu)).toHaveLength(actionCount);
    expect(
      items(menu).every((el) => el.getAttribute('data-slot') === 'context-menu-item'),
    ).toBe(true);
    expect(
      menu.querySelectorAll('[data-slot="context-menu-separator"]'),
    ).toHaveLength(separatorCount);
    // The shared surface, plus the stacking/width overrides these menus need.
    expect(menu.className).toContain('bg-gray-50');
    expect(menu.className).toContain('min-w-[220px]');
    expect(menu.style.zIndex).toBe('9999');
  });

  it('keeps "Add to Library" available', () => {
    const onAddToLibrary = vi.fn();
    const execute = vi.spyOn(actionRegistry, 'execute').mockImplementation(() => undefined as never);
    const menu = openMenu(mount(render({ onAddToLibrary })));
    act(() => {
      itemByLabel(menu, 'Add to Library')
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onAddToLibrary).toHaveBeenCalledTimes(1);
    // The local callback and the registry both still fire, as before.
    expect(execute).toHaveBeenCalledWith('post.addToLibrary', expect.objectContaining({ scope: 'post' }));
  });

  it('toggles the lock action label and icon from padlet metadata', () => {
    const unlockedMenu = openMenu(mount(render()));
    const locked = itemByLabel(unlockedMenu, 'Lock Position');
    expect(locked.querySelector('[data-slot="context-menu-icon"]')).not.toBeNull();

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

    const lockedMenu = openMenu(mount(render({ padlet: padlet({ isLocked: true }) })));
    expect(inventory(lockedMenu)).toEqual(
      expected.map((entry) => (entry === 'Lock Position' ? 'Unlock Position' : entry)),
    );
    expect(
      itemByLabel(lockedMenu, 'Unlock Position').querySelector('[data-slot="context-menu-icon"]'),
    ).not.toBeNull();
  });

  it('renders no menu at all when disabled', () => {
    const container = mount(render({ disabled: true }));
    const target = container.querySelector('[data-testid="trigger"]')!;
    act(() => {
      target.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(container.textContent).toBe('post');
  });

  it('no longer declares a local ContextMenuItem helper or raw Radix import', () => {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    expect(source).not.toMatch(/function ContextMenuItem\b/);
    expect(source).not.toContain('@radix-ui/react-context-menu');
    expect(source).toContain("from '@/components/ui/context-menu'");
  });

  it(`keeps every ${name} action on the default variant, as before the migration`, () => {
    const menu = openMenu(mount(render()));
    // No action carried the destructive variant pre-migration; none does now.
    expect(items(menu).map((el) => el.getAttribute('data-variant'))).toEqual(
      items(menu).map(() => 'default'),
    );
    // And nothing became disabled/non-selectable in the process.
    expect(items(menu).some((el) => el.hasAttribute('data-disabled'))).toBe(false);
  });
});

describe('menu-specific behaviour preserved', () => {
  it('fires the Note menu callback and the registry for a plain action', () => {
    const onCut = vi.fn();
    const execute = vi.spyOn(actionRegistry, 'execute').mockImplementation(() => undefined as never);
    const menu = openMenu(mount(
      <NotePostContextMenu padlet={padlet()} onSelect={vi.fn()} onCut={onCut}>
        {trigger}
      </NotePostContextMenu>,
    ));
    act(() => {
      itemByLabel(menu, 'Cut').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onCut).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith('edit.cut', {
      scope: 'post',
      target: { kind: 'post', postId: 'p1', postType: 'text', x: 0, y: 0 },
    });
  });

  it('calls onSelect when the Note menu opens', () => {
    const onSelect = vi.fn();
    openMenu(mount(
      <NotePostContextMenu padlet={padlet()} onSelect={onSelect}>
        {trigger}
      </NotePostContextMenu>,
    ));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('shows the Image crop checkmark only when cropToGrid is set', () => {
    const without = openMenu(mount(
      <ImagePostContextMenu padlet={padlet()} onSelect={vi.fn()}>{trigger}</ImagePostContextMenu>,
    ));
    expect(itemByLabel(without, 'Crop Image to Fit Dot Grid').querySelector('svg')).toBeNull();

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

    const withCrop = openMenu(mount(
      <ImagePostContextMenu padlet={padlet({ cropToGrid: true })} onSelect={vi.fn()}>
        {trigger}
      </ImagePostContextMenu>,
    ));
    expect(itemByLabel(withCrop, 'Crop Image to Fit Dot Grid').querySelector('svg')).not.toBeNull();
  });
});
