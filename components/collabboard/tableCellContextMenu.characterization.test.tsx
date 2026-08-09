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

/**
 * The alignment submenu is portaled by the shared primitive, so it is a sibling
 * of the root surface rather than a descendant. Rows are collected across both
 * levels, root first, matching reading order.
 */
function subSurface(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-slot="positioned-context-menu-sub-content"]');
}

function openSubSurface(): HTMLElement {
  const el = subSurface();
  expect(el, 'alignment submenu is not open').not.toBeNull();
  return el!;
}

function rows(): HTMLElement[] {
  return [surface(), subSurface()]
    .filter((el): el is HTMLElement => el !== null)
    .flatMap((el) => Array.from(el.querySelectorAll<HTMLElement>('button, [role="menuitem"]')));
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

function alignmentTrigger(): HTMLElement {
  return rowByLabel('Change Alignment...');
}

function openAlignmentSubmenu() {
  act(() => { hover(alignmentTrigger()); });
}

function key(target: HTMLElement, k: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
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

  it('returns the surface to the canonical clipping behavior', () => {
    // PATCH 4D needed `overflow-visible` because the old alignment submenu was
    // an absolutely positioned child that a clipping surface would have hidden.
    // The shared submenu is portaled, so that workaround is obsolete and the
    // surface keeps the shared default.
    renderMenu();
    expect(surface().className).not.toContain('overflow-visible');
    expect(surface().className).toContain('overflow-hidden');
  });

  it('pins the full root surface class contract', () => {
    renderMenu();
    const className = surface().className;
    expect(className).toContain('z-[9999]');
    expect(className).toContain('min-w-[200px]');
    expect(className).not.toContain('overflow-visible');
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

  it('the alignment trigger changes no alignment and dismisses nothing when activated', () => {
    const onClose = vi.fn();
    const onAlignChange = vi.fn();
    renderMenu({ onClose, onAlignChange });
    click(alignmentTrigger());
    // It opens a level rather than performing an action. PATCH 4G adopted the
    // canonical trigger, so clicking now discloses the submenu where the old
    // hand-built trigger ignored clicks entirely -- but it still must not
    // mutate alignment or tear down the menu.
    expect(onAlignChange).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(subSurface()).not.toBeNull();
  });

  it('keeps Change Alignment... last in the root menu', () => {
    renderMenu();
    expect(rowLabels()[rowLabels().length - 1]).toBe('Change Alignment...');
  });

  it('hides the alignment submenu until it is opened', () => {
    renderMenu();
    expect(subSurface()).toBeNull();
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

  it('separates the horizontal and vertical alignment groups', () => {
    renderMenu();
    openAlignmentSubmenu();
    expect(
      openSubSurface().querySelectorAll('[data-slot="context-menu-separator"]'),
    ).toHaveLength(1);
    // The root keeps exactly its own three; the submenu's is portaled away.
    expect(surface().querySelectorAll('[data-slot="context-menu-separator"]')).toHaveLength(3);
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

  it('lets the pointer travel from the trigger into the submenu without it closing', () => {
    vi.useFakeTimers();
    try {
      renderMenu();
      openAlignmentSubmenu();
      const content = openSubSurface();

      // Pointer leaves the trigger heading for the submenu.
      act(() => {
        alignmentTrigger().dispatchEvent(
          new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: document.body }),
        );
      });
      act(() => { vi.advanceTimersByTime(50); });
      expect(subSurface(), 'closed before the pointer could arrive').not.toBeNull();

      act(() => { hover(content); });
      act(() => { vi.advanceTimersByTime(500); });
      expect(subSurface(), 'closed even though the pointer is inside it').not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens the submenu with ArrowRight and lands focus on an enabled item', () => {
    renderMenu();
    key(alignmentTrigger(), 'ArrowRight');
    expect(document.activeElement).toBe(rowByLabel('Left'));
  });

  it('navigates the submenu with ArrowDown and ArrowUp', () => {
    renderMenu();
    key(alignmentTrigger(), 'ArrowRight');
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Center'));
    key(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(rowByLabel('Left'));
  });

  it('closes the submenu on ArrowLeft and returns focus to Change Alignment...', () => {
    renderMenu();
    key(alignmentTrigger(), 'ArrowRight');
    openSubSurface();
    key(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(subSurface()).toBeNull();
    expect(document.activeElement).toBe(alignmentTrigger());
  });

  it('Escape inside the submenu dismisses the whole menu, matching the root contract', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    key(alignmentTrigger(), 'ArrowRight');
    key(document.activeElement as HTMLElement, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('activates an alignment choice from the keyboard', () => {
    const onAlignChange = vi.fn();
    renderMenu({ onAlignChange, currentVerticalAlign: 'bottom' });
    key(alignmentTrigger(), 'ArrowRight');
    key(document.activeElement as HTMLElement, 'ArrowDown');
    key(document.activeElement as HTMLElement, 'Enter');
    expect(onAlignChange).toHaveBeenCalledWith('center', 'bottom');
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
    expect(source()).not.toContain('dispatchEvent');
    renderMenu();
    // The only aria-haspopup is the genuine submenu trigger, not a fake root
    // trigger standing in for a right-click target.
    const haspopup = Array.from(document.querySelectorAll('[aria-haspopup="menu"]'));
    expect(haspopup).toHaveLength(1);
    expect(haspopup[0].getAttribute('data-slot')).toBe('context-menu-sub-trigger');
    expect(document.querySelector('[data-radix-context-menu-trigger]')).toBeNull();
  });

  it('renders the alignment submenu through the shared positioned submenu', () => {
    renderMenu();
    openAlignmentSubmenu();
    const content = openSubSurface();
    expect(content.getAttribute('role')).toBe('menu');
    // Same shared surface constants as every other CollabBoard menu.
    expect(content.className).toContain('bg-gray-50');
    expect(content.className).toContain('rounded-lg');
    expect(content.className).toContain('fixed');
    // Submenu rows are the shared item primitive, not bespoke markup.
    expect(
      Array.from(content.querySelectorAll('[role="menuitem"]'))
        .every((el) => el.getAttribute('data-slot') === 'context-menu-item'),
    ).toBe(true);
  });

  it('exposes canonical submenu ARIA on the alignment trigger', () => {
    renderMenu();
    const trigger = alignmentTrigger();
    expect(trigger.getAttribute('role')).toBe('menuitem');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    openAlignmentSubmenu();
    expect(alignmentTrigger().getAttribute('aria-expanded')).toBe('true');
    expect(alignmentTrigger().getAttribute('aria-controls')).toBe(openSubSurface().id);
  });

  it('gets its submenu chevron from the shared trigger rather than local markup', () => {
    renderMenu();
    const chevron = alignmentTrigger().lastElementChild!;
    expect(chevron.tagName.toLowerCase()).toBe('svg');
    expect(chevron.getAttribute('class')).toContain('ml-auto');
    // The old local chevron span is gone.
    expect(source()).not.toContain('ChevronRight');
  });

  it('imports the shared submenu primitives from the public barrel only', () => {
    const src = source();
    for (const name of [
      'PositionedContextMenuSub',
      'PositionedContextMenuSubTrigger',
      'PositionedContextMenuSubContent',
    ]) {
      expect(src, `missing import of ${name}`).toContain(name);
    }
    expect(src).toContain("from '@/components/ui/context-menu'");
    // Internal implementation modules are off limits to consumers.
    expect(src).not.toContain('positioned-context-menu');
    expect(src).not.toContain('context-menu-styles');
  });

  it('no longer hand-builds the alignment submenu', () => {
    const src = source();
    // The old absolute surface, its local styling and its hover state.
    expect(src).not.toContain('absolute left-full');
    expect(src).not.toContain('shadow-xl');
    expect(src).not.toContain('activeSubmenu');
    expect(src).not.toContain('setActiveSubmenu');
    expect(src).not.toContain('onMouseEnter');
    expect(src).not.toContain('onMouseLeave');
    expect(src).not.toContain('useState');
    // No local suppression of the shared trigger's canonical behavior.
    expect(src).not.toContain('event.preventDefault()');
  });
});
