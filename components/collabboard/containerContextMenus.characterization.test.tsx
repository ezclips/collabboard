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

/**
 * PATCH 4H: CollabBoard context menus display no keyboard-shortcut hints. The
 * shortcuts themselves are untouched — they live in
 * components/collabboard/canvas/hooks/useCanvasShortcuts.ts, not in menu markup.
 */
const SHORTCUT_TEXT = /Ctrl\+|Alt\+|Shift\+|Backspace|Return|⌥|⌘/;

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
      'Send to Back',
      'Bring to Front',
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

  it('displays no keyboard-shortcut hints', () => {
    const menu = openMenu(mount(
      <ColumnPostContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onCut={vi.fn()}
        onCopy={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
      >
        {trigger}
      </ColumnPostContextMenu>,
    ));
    expect(menu.querySelectorAll('[data-slot="context-menu-shortcut"]')).toHaveLength(0);
    expect(menu.textContent ?? '').not.toMatch(SHORTCUT_TEXT);
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

  it('displays no keyboard-shortcut hints, including on its layer actions', () => {
    const menu = openMenu(mount(
      <WallContainerContextMenu
        padlet={padlet()}
        onSelect={vi.fn()}
        openTargets={[target('child-1', 'note')]}
        onOpenTarget={vi.fn()}
        getOpenTargetLabel={() => 'Note'}
        onChangeColor={vi.fn()}
        onEdit={vi.fn()}
        onDuplicate={vi.fn()}
        onDelete={vi.fn()}
        onBringToFront={vi.fn()}
        onSendToBack={vi.fn()}
      >
        {trigger}
      </WallContainerContextMenu>,
    ));
    expect(menu.querySelectorAll('[data-slot="context-menu-shortcut"]')).toHaveLength(0);
    expect(menu.textContent ?? '').not.toMatch(SHORTCUT_TEXT);
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
      'Send to Back',
      'Send Backward',
      'Bring Forward',
      'Bring to Front',
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

// PATCH 7A deleted the two dead Wall duplicates this file used to document
// (menus/WallContainerContextMenu.tsx and menus/old_WallContainerContextMenu.tsx).
// Their "zero importers" assertions only existed to record that they were unused,
// so they went with them. The live implementation under context-menus/ is
// characterized above, and the guard below keeps the duplicates from returning.
// ─────────────────────────────────────────────────────────────────────────
// Color swatches (PATCH 7B)
//
// Written against the pre-7B local `<button>` rows and kept green through the
// migration onto the shared swatch primitives, so they characterize FUNCTION
// (which colors, in what order, what payload, whether the menu stays open)
// independently of the presentation that renders them.
// ─────────────────────────────────────────────────────────────────────────
const CONTAINER_COLORS = ['#fff', '#f87171', '#fbbf24', '#34d399', '#60a5fa', '#a78bfa'];

/** Swatches in DOM order, in either implementation (both label by color). */
function swatches(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>('[title^="#"]'));
}

function swatchColors(menu: HTMLElement): string[] {
  return swatches(menu).map((el) => el.getAttribute('title') ?? '');
}

describe.each([
  ['ColumnPostContextMenu', ColumnPostContextMenu as any],
  ['WallContainerContextMenu', WallContainerContextMenu as any],
])('%s color swatches', (_name, Menu) => {
  const mountMenu = (onChangeColor: (color: string) => void) =>
    openMenu(
      mount(
        <Menu padlet={padlet()} onSelect={vi.fn()} onChangeColor={onChangeColor}>
          <div data-testid="trigger">t</div>
        </Menu>,
      ),
    );

  it('offers exactly the six predefined colors, in order', () => {
    expect(swatchColors(mountMenu(vi.fn()))).toEqual(CONTAINER_COLORS);
  });

  // One test per color: each needs its own mount, and cleanup runs per test.
  it.each(CONTAINER_COLORS)('dispatches exactly %s when that swatch is chosen', (color) => {
    const onChangeColor = vi.fn();
    const menu = mountMenu(onChangeColor);
    const swatch = swatches(menu).find((el) => el.getAttribute('title') === color)!;
    expect(swatch, `no swatch for ${color}`).toBeTruthy();
    act(() => {
      swatch.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onChangeColor).toHaveBeenCalledTimes(1);
    expect(onChangeColor).toHaveBeenCalledWith(color);
  });

  it('keeps the menu open after a color is chosen', () => {
    const menu = mountMenu(vi.fn());
    act(() => {
      swatches(menu)[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
  });

  it('renders no swatch row at all when no color callback is supplied', () => {
    const menu = openMenu(
      mount(
        <Menu padlet={padlet()} onSelect={vi.fn()}>
          <div data-testid="trigger">t</div>
        </Menu>,
      ),
    );
    expect(swatches(menu)).toHaveLength(0);
  });

  it('marks no swatch as selected — these menus track no current color', () => {
    const menu = mountMenu(vi.fn());
    for (const swatch of swatches(menu)) {
      expect(swatch.hasAttribute('data-selected')).toBe(false);
    }
  });
});

// PATCH 7B: presentation is now the shared swatch primitive, so these menus
// look like every other CollabBoard menu. Function is pinned above.
describe.each([
  ['ColumnPostContextMenu', 'components/collabboard/menus/ColumnPostContextMenu.tsx', ColumnPostContextMenu as any],
  ['WallContainerContextMenu', 'components/collabboard/context-menus/WallContainerContextMenu.tsx', WallContainerContextMenu as any],
])('%s swatch presentation', (_name, relativePath, Menu) => {
  const source = () => fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

  const openWithColors = () =>
    openMenu(
      mount(
        <Menu padlet={padlet()} onSelect={vi.fn()} onChangeColor={vi.fn()}>
          <div data-testid="trigger">t</div>
        </Menu>,
      ),
    );

  it('renders the shared swatch row', () => {
    const row = openWithColors().querySelector('[data-slot="context-menu-swatch-row"]');
    expect(row).not.toBeNull();
    expect(row!.getAttribute('role')).toBe('group');
  });

  it('renders one shared swatch per predefined color', () => {
    const menu = openWithColors();
    const rendered = menu.querySelectorAll('[data-slot="context-menu-swatch"]');
    expect(rendered).toHaveLength(CONTAINER_COLORS.length);
  });

  it('paints each swatch with its own color and keeps it keyboard-reachable', () => {
    const menu = openWithColors();
    const rendered = Array.from(menu.querySelectorAll<HTMLElement>('[data-slot="context-menu-swatch"]'));
    rendered.forEach((el, index) => {
      expect(el.style.backgroundColor).not.toBe('');
      expect(el.getAttribute('aria-label')).toBe(CONTAINER_COLORS[index]);
      // Radix Items, so arrow-key navigation and disabled handling come free.
      expect(el.getAttribute('role')).toBe('menuitem');
    });
  });

  it('hand-rolls no swatch button, sizing or hover styling any more', () => {
    const src = source();
    expect(src).toContain('ContextMenuSwatchRow');
    expect(src).toContain('ContextMenuSwatch');
    expect(src).not.toMatch(/<button/);
    expect(src).not.toContain('rounded-full border-2 border-white');
    expect(src).not.toContain('hover:scale-110');
  });

  it('imports the swatch primitives only from the public barrel', () => {
    const src = source();
    expect(src).toContain("from '@/components/ui/context-menu'");
    expect(src).not.toContain('positioned-context-menu');
    expect(src).not.toContain('context-menu-styles');
  });

  it('branches on no canvas/layout name for styling', () => {
    const src = source();
    expect(src).not.toMatch(/layout\s*===/);
    for (const name of ['"map"', "'map'", '"timeline"', "'timeline'", '"grid"', "'grid'"]) {
      expect(src, `no layout-specific branch for ${name}`).not.toContain(name);
    }
  });
});

// Delete's wiring, not just its appearance. Added in 7B after a negative
// control showed the suites verified the destructive *styling* of the Delete
// row without ever proving it calls `onDelete`.
describe.each([
  ['ColumnPostContextMenu', ColumnPostContextMenu as any],
  ['WallContainerContextMenu', WallContainerContextMenu as any],
])('%s delete wiring', (_name, Menu) => {
  it('invokes onDelete, and nothing else, when the delete row is chosen', () => {
    const onDelete = vi.fn();
    const onEdit = vi.fn();
    const onChangeColor = vi.fn();
    const menu = openMenu(
      mount(
        <Menu
          padlet={padlet()}
          onSelect={vi.fn()}
          onEdit={onEdit}
          onChangeColor={onChangeColor}
          onDelete={onDelete}
        >
          <div data-testid="trigger">t</div>
        </Menu>,
      ),
    );
    act(() => {
      itemByText(menu, 'Delete post').dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true }),
      );
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onEdit).not.toHaveBeenCalled();
    expect(onChangeColor).not.toHaveBeenCalled();
  });

  it('honours a custom delete label without changing the callback', () => {
    const onDelete = vi.fn();
    const menu = openMenu(
      mount(
        <Menu padlet={padlet()} onSelect={vi.fn()} onDelete={onDelete} deleteLabel="Delete container">
          <div data-testid="trigger">t</div>
        </Menu>,
      ),
    );
    const row = itemByText(menu, 'Delete container');
    expect(row.getAttribute('data-variant')).toBe('destructive');
    act(() => {
      row.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

// The public prop contracts are frozen: tracked historical canvases still
// import the live Wall menu, so 7B had to require zero caller changes.
describe('container menu prop signatures are frozen', () => {
  it.each([
    ['ColumnPostContextMenu', 'components/collabboard/menus/ColumnPostContextMenu.tsx', 'onChangeColor?: (color: string) => void'],
    ['WallContainerContextMenu', 'components/collabboard/context-menus/WallContainerContextMenu.tsx', 'onChangeColor?: (color: string) => void'],
  ])('%s still declares the same color callback', (_name, relativePath, signature) => {
    const src = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
    expect(src).toContain(signature);
    expect(src).toContain('deleteLabel');
    expect(src).toContain('onDelete?: () => void');
  });

  it('no caller was touched to accommodate the new presentation', () => {
    // The two historical copies this list also covered (brocken_WallCanvas,
    // 1stnewRowCanvas) were deleted as dead in PATCH 7C; components/canvas/RowCanvas.tsx
    // (also dead, zero importers) was deleted in PATCH 8AI. WallCanvas.tsx is
    // the sole live caller now.
    for (const relative of [
      'components/canvas/WallCanvas.tsx',
    ]) {
      const src = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
      expect(src, `${relative} must not know about swatch primitives`)
        .not.toContain('ContextMenuSwatch');
    }
  });
});

describe('the dead Wall duplicates stay deleted', () => {
  it('no shadow copy exists alongside the live container menu', () => {
    for (const relative of [
      'components/collabboard/menus/WallContainerContextMenu.tsx',
      'components/collabboard/menus/old_WallContainerContextMenu.tsx',
    ]) {
      expect(
        fs.existsSync(path.join(process.cwd(), relative)),
        `${relative} was removed as dead; re-adding it re-creates the duplicate`,
      ).toBe(false);
    }
  });

  it('every Wall menu importer resolves to the live implementation', () => {
    for (const relative of ['components/canvas/WallCanvas.tsx']) {
      const source = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
      expect(source).toContain(
        "from '@/components/collabboard/context-menus/WallContainerContextMenu'",
      );
      expect(source).not.toContain("from '@/components/collabboard/menus/WallContainerContextMenu'");
    }
  });
});
