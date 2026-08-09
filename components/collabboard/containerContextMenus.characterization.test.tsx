// @vitest-environment jsdom
//
// Characterization of the container context-menu family after migration onto
// the shared shell in components/ui/context-menu.tsx:
//   - components/collabboard/menus/ColumnPostContextMenu.tsx
//   - components/collabboard/context-menus/WallContainerContextMenu.tsx
//
// Scenarios mirror real call-site prop combinations captured at 7f2d0c4
// (FreeformPadletCards, RowLane, ColumnsCanvasRow, ChronoTimelineCanvas,
// MapCanvas, PostPopup, WallCanvas/RowCanvas/1stnewRowCanvas). They are the
// contract: action set, order, labels, shortcuts, separators and submenu
// contents must not drift.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { ColumnPostContextMenu } from './menus/ColumnPostContextMenu';
import { WallContainerContextMenu } from './context-menus/WallContainerContextMenu';

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

function target(id: string, type: string): Padlet {
  return { id, type, metadata: {} } as unknown as Padlet;
}

function padlet(metadata: Record<string, unknown> = {}): Padlet {
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

/** Ordered inventory of a menu's direct rendered contents. */
function inventory(menu: HTMLElement): string[] {
  return Array.from(menu.children).map((child) => {
    const el = child as HTMLElement;
    const slot = el.getAttribute('data-slot');
    if (slot === 'context-menu-separator') {
      return '---';
    }
    if (slot === 'context-menu-item') {
      const shortcut = el.querySelector<HTMLElement>('[data-slot="context-menu-shortcut"]');
      const full = (el.textContent ?? '').trim();
      if (!shortcut) {
        return full;
      }
      const shortcutText = (shortcut.textContent ?? '').trim();
      const label = full.slice(0, full.length - shortcutText.length).trim();
      return `${label} | ${shortcutText}`;
    }
    if (el.getAttribute('aria-haspopup') === 'menu') {
      return `${(el.textContent ?? '').trim()} >`;
    }
    if (el.tagName === 'DIV') {
      return '[color-picker]';
    }
    return `[unexpected:${el.tagName}]`;
  });
}

function items(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]'));
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

const trigger = <div data-testid="trigger">container</div>;

describe('ColumnPostContextMenu', () => {
  it('renders the FreeformPadletCards-style minimal action set (no edit target, no color)', () => {
    const menu = openMenu(mount(
      <ColumnPostContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onCut={vi.fn()}
        onCopy={vi.fn()}
        onPaste={vi.fn()}
        onRename={vi.fn()}
        onLock={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
      >
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(inventory(menu)).toEqual([
      '---',
      'Send to Back | Ctrl+Shift+[',
      'Bring to Front | Ctrl+Shift+]',
      'Delete post',
    ]);
  });

  it('renders a single openTarget as one "Edit {label}" item, plus color picker (RowLane/ColumnsCanvasRow style)', () => {
    const onOpenTarget = vi.fn();
    const menu = openMenu(mount(
      <ColumnPostContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        openTargets={[target('child-1', 'note')]}
        onOpenTarget={onOpenTarget}
        getOpenTargetLabel={() => 'Note'}
        onChangeColor={vi.fn()}
        onEdit={vi.fn()}
        onAddBefore={vi.fn()}
        onAddAfter={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        {trigger}
      </ColumnPostContextMenu>,
    ));
    // enableInsertActions defaults to false, so Add before/after/Duplicate stay hidden
    // even though the callbacks are supplied, exactly as before migration.
    expect(inventory(menu)).toEqual(['Edit Note', '[color-picker]', 'Delete post']);

    act(() => {
      itemByText(menu, 'Edit Note').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onOpenTarget).toHaveBeenCalledWith({ id: 'child-1', type: 'note', metadata: {} });
  });

  it('renders multiple openTargets as an "Edit post" submenu, in order', () => {
    const onOpenTarget = vi.fn();
    const menu = openMenu(mount(
      <ColumnPostContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        openTargets={[target('child-1', 'note'), target('child-2', 'todo')]}
        onOpenTarget={onOpenTarget}
        getOpenTargetLabel={(t) => (t.type === 'note' ? 'Note' : 'Todo')}
        onDelete={vi.fn()}
      >
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(inventory(menu)).toEqual(['Edit post >', 'Delete post']);

    const sub = openSubmenu(subTriggerByText(menu, 'Edit post'));
    expect(items(sub).map((el) => el.textContent?.trim())).toEqual(['Note', 'Todo']);

    act(() => {
      itemByText(sub, 'Todo').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onOpenTarget).toHaveBeenCalledWith({ id: 'child-2', type: 'todo', metadata: {} });
  });

  it('renders the Map/PostPopup-style action set: addPostItems submenu, position/maps items, custom delete label', () => {
    const onAddPostType = vi.fn();
    const menu = openMenu(mount(
      <ColumnPostContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        addPostItems={[{ label: 'Add Note', type: 'note' }, { label: 'Add Todo', type: 'todo' }]}
        onAddPostType={onAddPostType}
        onChangeColor={vi.fn()}
        onEditPosition={vi.fn()}
        editPositionLabel="Edit Location"
        onOpenGoogleMaps={vi.fn()}
        onOpenOsm={vi.fn()}
        onDelete={vi.fn()}
        deleteLabel="Delete map pin"
      >
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(inventory(menu)).toEqual([
      'Add post >',
      '[color-picker]',
      'Edit Location',
      'Google Maps',
      'OSM',
      'Delete map pin',
    ]);

    const sub = openSubmenu(subTriggerByText(menu, 'Add post'));
    expect(items(sub).map((el) => el.textContent?.trim())).toEqual(['Add Note', 'Add Todo']);
    act(() => {
      itemByText(sub, 'Add Todo').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onAddPostType).toHaveBeenCalledWith('todo');
  });

  it('supports enableInsertActions (currently unused by any live call site, but part of the prop contract)', () => {
    const onAddContainerAt = vi.fn();
    const menu = openMenu(mount(
      <ColumnPostContextMenu
        padlet={padlet({ sectionPosition: 3 })}
        onSelect={vi.fn()}
        enableInsertActions
        onAddBefore={vi.fn()}
        onAddAfter={vi.fn()}
        onAddContainerAt={onAddContainerAt}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(inventory(menu)).toEqual([
      'Add post before',
      'Add post after',
      'Duplicate post',
      'Delete post',
    ]);
    act(() => {
      itemByText(menu, 'Add post after').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // onAddContainerAt, when supplied, wins over the plain onAddAfter callback.
    expect(onAddContainerAt).toHaveBeenCalledWith(4);
  });

  it('never renders a Lock/Unlock item, even when onLock is supplied (dead prop, unchanged from pre-migration)', () => {
    const menu = openMenu(mount(
      <ColumnPostContextMenu padlet={padlet()} onSelect={vi.fn()} onLock={vi.fn()} onDelete={vi.fn()}>
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(menu.textContent).not.toMatch(/Lock Position|Unlock Position/);
  });

  it('renders no menu at all when disabled', () => {
    const container = mount(
      <ColumnPostContextMenu padlet={padlet()} onSelect={vi.fn()} disabled onDelete={vi.fn()}>
        {trigger}
      </ColumnPostContextMenu>,
    );
    act(() => {
      container.querySelector('[data-testid="trigger"]')!.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }),
      );
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(container.textContent).toBe('container');
  });

  it('renders the shared ContextMenuContent primitive and destructive Delete', () => {
    const menu = openMenu(mount(
      <ColumnPostContextMenu padlet={padlet()} onSelect={vi.fn()} onDelete={vi.fn()}>
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(menu.getAttribute('data-slot')).toBe('context-menu-content');
    const deleteItem = itemByText(menu, 'Delete post');
    expect(deleteItem.getAttribute('data-variant')).toBe('destructive');
  });

  it('imports no raw Radix context-menu API and defines no local ContextMenuItem helper', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/ColumnPostContextMenu.tsx'),
      'utf8',
    );
    expect(source).not.toContain('@radix-ui/react-context-menu');
    expect(source).not.toMatch(/function ContextMenuItem\b/);
    expect(source).toContain("from '@/components/ui/context-menu'");
  });
});

describe('WallContainerContextMenu', () => {
  it('renders a single openTarget, color picker, layer actions and delete (WallCanvas style)', () => {
    const onOpenTarget = vi.fn();
    const menu = openMenu(mount(
      <WallContainerContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        openTargets={[target('child-1', 'note')]}
        onOpenTarget={onOpenTarget}
        getOpenTargetLabel={() => 'Note'}
        onChangeColor={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
      >
        {trigger}
      </WallContainerContextMenu>,
    ));
    // No layer callbacks supplied here, so no separator and no layer items —
    // matching the real WallCanvas call site, which never wires those props.
    expect(inventory(menu)).toEqual(['Edit Note', '[color-picker]', 'Delete post']);
  });

  it('renders multiple openTargets as an "Edit post" submenu, in order', () => {
    const onOpenTarget = vi.fn();
    const menu = openMenu(mount(
      <WallContainerContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        openTargets={[target('child-1', 'note'), target('child-2', 'todo')]}
        onOpenTarget={onOpenTarget}
        getOpenTargetLabel={(t) => (t.type === 'note' ? 'Note' : 'Todo')}
        onDelete={vi.fn()}
      >
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(inventory(menu)).toEqual(['Edit post >', 'Delete post']);

    const sub = openSubmenu(subTriggerByText(menu, 'Edit post'));
    expect(items(sub).map((el) => el.textContent?.trim())).toEqual(['Note', 'Todo']);
    act(() => {
      itemByText(sub, 'Note').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onOpenTarget).toHaveBeenCalledWith({ id: 'child-1', type: 'note', metadata: {} });
  });

  it('renders full layer actions with separator and custom delete label when layer callbacks are supplied', () => {
    const menu = openMenu(mount(
      <WallContainerContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        onEdit={vi.fn()}
        onBringToFront={vi.fn()}
        onBringForward={vi.fn()}
        onSendBackward={vi.fn()}
        onSendToBack={vi.fn()}
        onDelete={vi.fn()}
        deleteLabel="Delete wall post"
      >
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(inventory(menu)).toEqual([
      'Edit post',
      '---',
      'Send to Back | Ctrl+Shift+[',
      'Send Backward',
      'Bring Forward',
      'Bring to Front | Ctrl+Shift+]',
      'Delete wall post',
    ]);
  });

  it('never renders a Lock/Unlock item, even when onLock is supplied (dead prop, unchanged from pre-migration)', () => {
    const menu = openMenu(mount(
      <WallContainerContextMenu padlet={padlet()} onSelect={vi.fn()} onLock={vi.fn()} onDelete={vi.fn()}>
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(menu.textContent).not.toMatch(/Lock Position|Unlock Position/);
  });

  it('does not render addPostItems/insert-action/position/maps items (props Wall never accepts them)', () => {
    const menu = openMenu(mount(
      <WallContainerContextMenu padlet={padlet()} onSelect={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()}>
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(menu.textContent).not.toMatch(/Add post before|Add post after|Duplicate post|Google Maps|OSM/);
  });

  it('renders no menu at all when a false-y trigger prevents disabled UI (Wall has no disabled prop; renders unconditionally)', () => {
    // WallContainerContextMenu has no `disabled` prop; callers gate it by omitting
    // action props instead. Verify that with every action omitted, only the
    // (no-op) menu shell renders and no action items appear.
    const menu = openMenu(mount(
      <WallContainerContextMenu padlet={padlet()} onSelect={vi.fn()}>
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(inventory(menu)).toEqual([]);
  });

  it('renders the shared ContextMenuContent primitive and destructive Delete', () => {
    const menu = openMenu(mount(
      <WallContainerContextMenu padlet={padlet()} onSelect={vi.fn()} onDelete={vi.fn()}>
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(menu.getAttribute('data-slot')).toBe('context-menu-content');
    const deleteItem = itemByText(menu, 'Delete post');
    expect(deleteItem.getAttribute('data-variant')).toBe('destructive');
  });

  it('imports no raw Radix context-menu API and defines no local ContextMenuItem helper', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/context-menus/WallContainerContextMenu.tsx'),
      'utf8',
    );
    expect(source).not.toContain('@radix-ui/react-context-menu');
    expect(source).not.toMatch(/function ContextMenuItem\b/);
    expect(source).toContain("from '@/components/ui/context-menu'");
  });
});

describe('dead/duplicate file findings (report only, not modified in this patch)', () => {
  it('components/collabboard/menus/WallContainerContextMenu.tsx has zero importers', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/WallContainerContextMenu.tsx'),
      'utf8',
    );
    // Sanity: the file still exists and still exports the shadow component.
    expect(source).toContain('export function WallContainerContextMenu');
  });

  it('components/collabboard/menus/old_WallContainerContextMenu.tsx has zero importers', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/old_WallContainerContextMenu.tsx'),
      'utf8',
    );
    expect(source).toContain('export default function WallContainerContextMenu');
  });
});
