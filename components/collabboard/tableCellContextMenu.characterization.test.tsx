// @vitest-environment jsdom
//
// Characterization of TableCellContextMenu across its migration onto the
// positioned shared shell (PATCH 4D).
//
// These assertions were written and run GREEN against the pre-migration
// hand-rolled implementation at c4850a0, then re-run against the migrated
// component. Anything asserted here is behavior that must not drift.
//
// Contract note: TableEditor never tells this menu WHICH cell was clicked.
// It renders the menu only while `contextMenu` state exists, and passes
// zero-argument callbacks that close over `selectedCell` in the editor. The
// only data-carrying callback is `onAlignChange(align, vertical)`. So the
// "target payload" contract to preserve is: every structural action fires a
// zero-arg callback, and alignment forwards exactly the pair it was given.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { TableCellContextMenu } from './menus/TableCellContextMenu';

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

/**
 * Both implementations defer attaching dismissal listeners so the interaction
 * that opened the menu cannot immediately close it. Wait long enough for either.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/** React 17+ synthesizes onMouseEnter/onMouseLeave from native mouseover/mouseout. */
function hover(target: HTMLElement) {
  target.dispatchEvent(
    new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }),
  );
}

/** The single fixed-position surface, in either implementation. */
function surface(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], .fixed',
  );
  expect(el, 'table cell menu surface not rendered').not.toBeNull();
  return el!;
}

function rows(): HTMLElement[] {
  return Array.from(surface().querySelectorAll<HTMLElement>('button, [role="menuitem"]'));
}

/**
 * Row labels only. The hand-rolled MenuItem bakes its shortcut into the same
 * button's textContent, so strip a trailing shortcut span when present.
 */
function rowLabels(): string[] {
  return rows().map((el) => {
    const labelSpan = el.querySelector('span.flex.items-center.gap-2');
    if (labelSpan) return (labelSpan.textContent ?? '').trim();
    const shortcut = el.querySelector('[data-slot="context-menu-shortcut"]');
    const full = (el.textContent ?? '').trim();
    if (!shortcut) return full;
    const s = (shortcut.textContent ?? '').trim();
    return full.slice(0, full.length - s.length).trim();
  });
}

/** Label → shortcut text, for rows that have one. */
function rowShortcuts(): Record<string, string> {
  const out: Record<string, string> = {};
  rows().forEach((el, i) => {
    const label = rowLabels()[i];
    const shortcutEl =
      el.querySelector('[data-slot="context-menu-shortcut"]') ??
      el.querySelector('span.text-xs');
    const text = shortcutEl?.textContent?.trim();
    if (text) out[label] = text;
  });
  return out;
}

function rowByLabel(label: string): HTMLElement {
  const idx = rowLabels().indexOf(label);
  expect(idx, `no row labelled "${label}"`).toBeGreaterThan(-1);
  return rows()[idx];
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function openAlignmentSubmenu() {
  // The submenu opens on hover of the trigger's wrapper in the old build and
  // of the row itself in the migrated build; hovering both covers each.
  const trigger = rowByLabel('Change Alignment...');
  act(() => {
    if (trigger.parentElement) hover(trigger.parentElement);
    hover(trigger);
  });
}

function renderMenu(props: Record<string, any> = {}) {
  return mount(
    <TableCellContextMenu
      isOpen
      position={{ x: 150, y: 275 }}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

const ROOT_ACTIONS = [
  'Cut',
  'Copy',
  'Paste',
  'Add Row Above',
  'Add Row Below',
  'Add Column Left',
  'Add Column Right',
  'Delete Row',
  'Delete Column',
  'Change Alignment...',
];

const ROOT_SHORTCUTS = {
  Cut: 'Ctrl+X',
  Copy: 'Ctrl+C',
  Paste: 'Ctrl+V',
  'Add Row Above': 'Alt+↑',
  'Add Row Below': 'Alt+↓',
  'Add Column Left': 'Alt+←',
  'Add Column Right': 'Alt+→',
};

const ALIGNMENT_ITEMS = ['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom'];

describe('TableCellContextMenu', () => {
  it('preserves its root action set and order', () => {
    renderMenu();
    expect(rowLabels()).toEqual(ROOT_ACTIONS);
  });

  it('preserves every keyboard shortcut, and adds none to the delete/alignment rows', () => {
    renderMenu();
    expect(rowShortcuts()).toEqual(ROOT_SHORTCUTS);
  });

  it('renders exactly three separators between the four root groups', () => {
    renderMenu();
    const separators = surface().querySelectorAll(
      '[data-slot="context-menu-separator"], .border-t',
    );
    expect(separators).toHaveLength(3);
  });

  it('honors the externally supplied x/y coordinates', () => {
    renderMenu({ position: { x: 150, y: 275 } });
    expect(surface().style.left).toBe('150px');
    expect(surface().style.top).toBe('275px');
  });

  it('retains its high overlay z-index and minimum width', () => {
    renderMenu();
    expect(surface().className).toContain('z-[9999]');
    expect(surface().className).toContain('min-w-[200px]');
  });

  it('keeps the surface able to overflow so the alignment submenu can escape', () => {
    renderMenu();
    // The submenu is absolutely positioned at left-full; a clipping surface
    // would hide it entirely.
    expect(surface().className).not.toContain('overflow-hidden');
  });

  it('renders nothing when closed', () => {
    const dom = mount(<TableCellContextMenu isOpen={false} position={{ x: 0, y: 0 }} onClose={vi.fn()} />);
    expect(dom.textContent).toBe('');
    expect(document.querySelector('[data-slot="positioned-context-menu-content"]')).toBeNull();
  });

  it.each([
    ['Cut', 'onCut'],
    ['Copy', 'onCopy'],
    ['Paste', 'onPaste'],
  ])('clipboard action "%s" invokes %s with no arguments and closes', (label, prop) => {
    const handler = vi.fn();
    const onClose = vi.fn();
    renderMenu({ [prop]: handler, onClose });
    click(rowByLabel(label));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Add Row Above', 'onAddRowAbove'],
    ['Add Row Below', 'onAddRowBelow'],
    ['Delete Row', 'onDeleteRow'],
  ])('row operation "%s" invokes %s with no arguments and closes', (label, prop) => {
    const handler = vi.fn();
    const onClose = vi.fn();
    renderMenu({ [prop]: handler, onClose });
    click(rowByLabel(label));
    expect(handler).toHaveBeenCalledTimes(1);
    // Zero-arg: the editor closes over the target cell itself.
    expect(handler).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Add Column Left', 'onAddColumnLeft'],
    ['Add Column Right', 'onAddColumnRight'],
    ['Delete Column', 'onDeleteColumn'],
  ])('column operation "%s" invokes %s with no arguments and closes', (label, prop) => {
    const handler = vi.fn();
    const onClose = vi.fn();
    renderMenu({ [prop]: handler, onClose });
    click(rowByLabel(label));
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires no sibling callback when one action is chosen', () => {
    const handlers = {
      onCut: vi.fn(), onCopy: vi.fn(), onPaste: vi.fn(),
      onAddRowAbove: vi.fn(), onAddRowBelow: vi.fn(),
      onAddColumnLeft: vi.fn(), onAddColumnRight: vi.fn(),
      onDeleteRow: vi.fn(), onDeleteColumn: vi.fn(),
    };
    renderMenu(handlers);
    click(rowByLabel('Delete Column'));
    expect(handlers.onDeleteColumn).toHaveBeenCalledTimes(1);
    for (const [name, fn] of Object.entries(handlers)) {
      if (name !== 'onDeleteColumn') expect(fn, `${name} should not fire`).not.toHaveBeenCalled();
    }
  });

  it('still closes when the matching callback prop is omitted', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    click(rowByLabel('Add Row Above'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('styles Delete Row / Delete Column as destructive and nothing else', () => {
    renderMenu();
    const destructive = rows().filter(
      (el) => el.className.includes('text-red-600') || el.getAttribute('data-variant') === 'destructive',
    );
    expect(destructive.map((el) => rowLabels()[rows().indexOf(el)])).toEqual([
      'Delete Row',
      'Delete Column',
    ]);
  });

  it('clicking the alignment trigger itself does nothing and keeps the menu open', () => {
    const onClose = vi.fn();
    const onAlignChange = vi.fn();
    renderMenu({ onClose, onAlignChange });
    click(rowByLabel('Change Alignment...'));
    // The trigger is a pure hover-disclosure: no callback, no dismissal.
    expect(onAlignChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the alignment submenu until hovered', () => {
    renderMenu();
    for (const label of ALIGNMENT_ITEMS) {
      expect(rowLabels()).not.toContain(label);
    }
  });

  it('opens the alignment submenu on hover with its six items in order', () => {
    renderMenu();
    openAlignmentSubmenu();
    const labels = rowLabels();
    expect(labels.filter((l) => ALIGNMENT_ITEMS.includes(l))).toEqual(ALIGNMENT_ITEMS);
  });

  it('checkmarks Left and Top by default when no alignment is set', () => {
    renderMenu();
    openAlignmentSubmenu();
    expect(rowByLabel('Left').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Top').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Center').querySelector('svg')).toBeNull();
    expect(rowByLabel('Middle').querySelector('svg')).toBeNull();
  });

  it('checkmarks the supplied current horizontal and vertical alignment', () => {
    renderMenu({ currentAlign: 'right', currentVerticalAlign: 'bottom' });
    openAlignmentSubmenu();
    expect(rowByLabel('Right').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Bottom').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Left').querySelector('svg')).toBeNull();
    expect(rowByLabel('Top').querySelector('svg')).toBeNull();
  });

  it.each([
    ['Left', 'left'],
    ['Center', 'center'],
    ['Right', 'right'],
  ])('horizontal alignment "%s" forwards (%s, currentVerticalAlign) and closes', (label, value) => {
    const onAlignChange = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onAlignChange, onClose, currentVerticalAlign: 'middle' });
    openAlignmentSubmenu();
    click(rowByLabel(label));
    // Horizontal choices preserve the existing vertical alignment verbatim.
    expect(onAlignChange).toHaveBeenCalledWith(value, 'middle');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['Top', 'top'],
    ['Middle', 'middle'],
    ['Bottom', 'bottom'],
  ])('vertical alignment "%s" forwards (currentAlign, %s) and closes', (label, value) => {
    const onAlignChange = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onAlignChange, onClose, currentAlign: 'center' });
    openAlignmentSubmenu();
    click(rowByLabel(label));
    // Vertical choices preserve the existing horizontal alignment verbatim.
    expect(onAlignChange).toHaveBeenCalledWith('center', value);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('forwards undefined alignment when the corresponding prop is unset', () => {
    const onAlignChange = vi.fn();
    renderMenu({ onAlignChange });
    openAlignmentSubmenu();
    click(rowByLabel('Center'));
    expect(onAlignChange).toHaveBeenCalledWith('center', undefined);
  });

  it('no action is ever disabled; editability gating lives in TableEditor', () => {
    renderMenu();
    openAlignmentSubmenu();
    expect(rows().some((el) => el.hasAttribute('data-disabled'))).toBe(false);
    expect(rows().some((el) => (el as HTMLButtonElement).disabled)).toBe(false);
  });

  it('outside interaction closes the menu', async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    await act(async () => { await tick(); });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('interaction inside the surface does not close the menu', async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    await act(async () => { await tick(); });
    act(() => {
      surface().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops clicks from bubbling out to the editor beneath', () => {
    const onOuterClick = vi.fn();
    mount(
      <div onClick={onOuterClick}>
        <TableCellContextMenu isOpen position={{ x: 10, y: 10 }} onClose={vi.fn()} />
      </div>,
    );
    click(rowByLabel('Cut'));
    expect(onOuterClick).not.toHaveBeenCalled();
  });
});

describe('TableCellContextMenu shared-shell adoption', () => {
  const source = () =>
    fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/TableCellContextMenu.tsx'),
      'utf8',
    );

  it('renders through the positioned shared surface', () => {
    renderMenu();
    expect(surface().getAttribute('data-slot')).toBe('positioned-context-menu-content');
    expect(surface().getAttribute('role')).toBe('menu');
  });

  it('uses the shared item and separator primitives', () => {
    renderMenu();
    const el = surface();
    expect(el.querySelectorAll('[data-slot="context-menu-item"]').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('[data-slot="context-menu-separator"]')).toHaveLength(3);
  });

  it('uses the shared right-aligned shortcut slot', () => {
    renderMenu();
    const cut = rowByLabel('Cut');
    const shortcut = cut.querySelector<HTMLElement>('[data-slot="context-menu-shortcut"]');
    expect(shortcut).not.toBeNull();
    expect(shortcut!.textContent).toBe('Ctrl+X');
    expect(shortcut!.className).toContain('ml-auto');
  });

  it('marks the two delete rows with the shared destructive variant', () => {
    renderMenu();
    expect(rowByLabel('Delete Row').getAttribute('data-variant')).toBe('destructive');
    expect(rowByLabel('Delete Column').getAttribute('data-variant')).toBe('destructive');
    expect(rowByLabel('Cut').getAttribute('data-variant')).toBe('default');
  });

  it('Escape closes the menu', async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    await act(async () => { await tick(); });
    act(() => {
      surface().dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
      );
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('imports the positioned family and keeps the externally-owned contract', () => {
    expect(source()).toContain("from '@/components/ui/context-menu'");
    expect(source()).toContain('PositionedContextMenu');
    expect(source()).toMatch(/isOpen:\s*boolean/);
    expect(source()).toMatch(/position:\s*\{\s*x:\s*number;\s*y:\s*number\s*\}/);
  });

  it('no longer hand-rolls a fixed surface, item styling, or a dismissal listener', () => {
    const src = source();
    expect(src).not.toMatch(/function MenuItem\b/);
    expect(src).not.toContain('fixed z-[9999]');
    expect(src).not.toContain("addEventListener('mousedown'");
    expect(src).not.toMatch(/border-t border-gray-200/);
  });

  it('uses no Radix trigger and synthesizes no contextmenu event', () => {
    expect(source()).not.toContain('@radix-ui/react-context-menu');
    expect(source()).not.toContain('ContextMenuTrigger');
    renderMenu();
    expect(document.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
  });
});
