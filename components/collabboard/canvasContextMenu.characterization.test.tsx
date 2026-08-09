// @vitest-environment jsdom
//
// Characterization of the Drawing card context menu across its migration onto
// the positioned shared shell (PATCH 5).
//
// components/collabboard/canvas/ui/CanvasContextMenu.tsx
//
// Everything in the "frozen contract" blocks was written and run GREEN against
// the pre-migration hand-built implementation at 160d7f4, then re-run against
// the migrated component. Those are the hard preservation boundaries: action
// set, ordering, conditional visibility, disabled state and callback payloads.
//
// The "normalized" and "adoption" blocks are deliberately RED before the
// migration. They record presentation/interaction that PATCH 5 standardized
// onto the shared CollabBoard menu conventions.
//
// Contract notes:
//   - DrawingLayout owns open state (it mounts the menu only while its
//     `contextMenu` state is non-null), owns the {x,y} viewport coordinates,
//     owns which padlet was right-clicked, and owns the read-only gate that
//     decides whether the menu opens at all. Every host callback already calls
//     setContextMenu(null) itself.
//   - Shortcut HINTS are not part of the preserved contract. PATCH 4H made
//     "no shortcut hints in right-click menus" the product rule; the old menu
//     rendered `shortcut="Ctrl+X"` and friends, and those must not survive.
//     The actual keyboard commands live elsewhere and are untouched.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import { CanvasContextMenu } from './canvas/ui/CanvasContextMenu';

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
function unmountAll() {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
}
afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/** React synthesizes onMouseEnter/onMouseLeave from native mouseover/mouseout. */
function hover(target: HTMLElement) {
  act(() => {
    target.dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }),
    );
  });
}

function key(target: HTMLElement, k: string) {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** The root surface, in either implementation. */
function surface(): HTMLElement {
  const el =
    document.querySelector<HTMLElement>('[data-slot="positioned-context-menu-content"]') ??
    document.querySelector<HTMLElement>('div.fixed');
  expect(el, 'canvas context menu did not render').not.toBeNull();
  return el!;
}

/** The Edit submenu surface. Nested in the old build, portaled in the new one. */
function subSurface(): HTMLElement | null {
  return (
    document.querySelector<HTMLElement>('[data-slot="positioned-context-menu-sub-content"]') ??
    document.querySelector<HTMLElement>('div.absolute')
  );
}

function openSubSurface(): HTMLElement {
  const el = subSurface();
  expect(el, 'Edit submenu is not open').not.toBeNull();
  return el!;
}

/** Rows across both levels, root first, without double-counting a nested submenu. */
function rows(): HTMLElement[] {
  const root = surface();
  const out = Array.from(root.querySelectorAll<HTMLElement>('button, [role="menuitem"]'));
  const sub = subSurface();
  if (sub && !root.contains(sub)) {
    out.push(...Array.from(sub.querySelectorAll<HTMLElement>('button, [role="menuitem"]')));
  }
  return out;
}

/**
 * Row labels with any shortcut suffix stripped. The old hand-built rows baked
 * the shortcut into the same button's textContent, so this normalizes both
 * builds to the label alone -- letting the frozen inventories below stay
 * identical across the migration while the no-hints tests police the removal.
 */
function rowLabels(): string[] {
  return rows().map((el) => {
    const shortcut = el.querySelector('[data-slot="context-menu-shortcut"], span.opacity-60');
    const full = (el.textContent ?? '').trim();
    if (!shortcut) return full;
    const text = (shortcut.textContent ?? '').trim();
    return full.slice(0, full.length - text.length).trim();
  });
}

function rowByLabel(label: string): HTMLElement {
  const idx = rowLabels().indexOf(label);
  expect(idx, `no row labelled "${label}"`).toBeGreaterThan(-1);
  return rows()[idx];
}

function isDisabled(el: HTMLElement): boolean {
  return el.hasAttribute('data-disabled') || (el as HTMLButtonElement).disabled === true;
}

function separatorCount(scope: HTMLElement): number {
  return scope.querySelectorAll('[data-slot="context-menu-separator"], .border-t').length;
}

/** Pin box metrics so viewport handling is measurable in jsdom. */
function withMenuBox(width: number, height: number, run: () => void) {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
  try { run(); } finally {
    if (w) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', w);
    else delete (HTMLElement.prototype as any).offsetWidth;
    if (h) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', h);
    else delete (HTMLElement.prototype as any).offsetHeight;
  }
}

function makePadlet(overrides: Record<string, unknown> = {}): Padlet {
  return { id: 'card-1', type: 'note', metadata: {}, ...overrides } as unknown as Padlet;
}

function makeHandlers() {
  return {
    onClose: vi.fn(),
    onEdit: vi.fn(),
    onCut: vi.fn(),
    onCopy: vi.fn(),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onSendToBack: vi.fn(),
    onSendBackward: vi.fn(),
    onBringForward: vi.fn(),
    onBringToFront: vi.fn(),
    onCopyAsPNG: vi.fn(),
    onExportAsPNG: vi.fn(),
  };
}
type Handlers = ReturnType<typeof makeHandlers>;

/** Action callbacks only -- onClose is dismissal, not an action. */
const ACTION_KEYS = [
  'onEdit', 'onCut', 'onCopy', 'onPaste', 'onDuplicate', 'onDelete',
  'onSendToBack', 'onSendBackward', 'onBringForward', 'onBringToFront',
  'onCopyAsPNG', 'onExportAsPNG',
] as const;

function renderMenu(
  overrides: Record<string, any> = {},
  handlers: Handlers = makeHandlers(),
) {
  mount(
    <CanvasContextMenu
      x={100}
      y={200}
      padlet={makePadlet()}
      hasPaste
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

// Frozen inventories, captured from the pre-migration implementation.
// Labels are verbatim from source, including its lowercase z-order casing.
const CARD_INVENTORY = [
  'Edit',
  '---',
  'Cut',
  'Copy',
  'Paste',
  '---',
  'Send to back',
  'Send backward',
  'Bring forward',
  'Bring to front',
  '---',
  'Copy to clipboard as PNG',
  'Export as PNG',
  '---',
  'Duplicate',
  '---',
  'Delete',
];

const COMMENT_INVENTORY = ['View comment', '---', 'Cut', 'Copy', 'Paste', '---', 'Delete'];

/** Inventory including separators, derived from labels + separator positions. */
function inventory(): string[] {
  const root = surface();
  const out: string[] = [];
  const walk = (node: Element) => {
    for (const child of Array.from(node.children)) {
      const el = child as HTMLElement;
      if (el.matches('[data-slot="context-menu-separator"], .border-t')) {
        out.push('---');
        continue;
      }
      if (el.matches('button, [role="menuitem"]')) {
        const idx = rows().indexOf(el);
        out.push(idx > -1 ? rowLabels()[idx] : (el.textContent ?? '').trim());
        continue;
      }
      // Submenu wrappers and portaled content are not part of root order.
      if (el.matches('[data-slot="positioned-context-menu-sub-content"], div.absolute')) continue;
      walk(el);
    }
  };
  walk(root);
  return out;
}

const SHORTCUT_TEXT = /Ctrl\+|Alt\+|Shift\+|Cmd\+|⌘|⌥|\bDel\b|Backspace|Return/;

const SOURCE_PATH = 'components/collabboard/canvas/ui/CanvasContextMenu.tsx';
function source(): string {
  return fs.readFileSync(path.join(process.cwd(), SOURCE_PATH), 'utf8');
}

// ══════════════════════════════════════════════════════════════════════════
// FROZEN CONTRACT — inventory, visibility, payloads
// ══════════════════════════════════════════════════════════════════════════
describe('CanvasContextMenu — frozen inventory', () => {
  it('renders the normal card actions in order, with five separators', () => {
    renderMenu();
    expect(inventory()).toEqual(CARD_INVENTORY);
    expect(separatorCount(surface())).toBe(5);
  });

  it('renders the comment actions in order, with two separators', () => {
    renderMenu({ padlet: makePadlet({ type: 'comment' }) });
    expect(inventory()).toEqual(COMMENT_INVENTORY);
    expect(separatorCount(surface())).toBe(2);
  });

  it('hides z-order, PNG and Duplicate groups for a comment', () => {
    renderMenu({ padlet: makePadlet({ type: 'comment' }) });
    for (const hidden of [
      'Send to back', 'Send backward', 'Bring forward', 'Bring to front',
      'Copy to clipboard as PNG', 'Export as PNG', 'Duplicate',
    ]) {
      expect(rowLabels(), `${hidden} must stay hidden for comments`).not.toContain(hidden);
    }
  });

  it('omits Delete entirely when onDelete is not supplied', () => {
    const handlers = makeHandlers();
    mount(
      <CanvasContextMenu
        x={10} y={10} padlet={makePadlet()} hasPaste
        {...handlers}
        onDelete={undefined}
      />,
    );
    expect(rowLabels()).not.toContain('Delete');
    // One fewer separator than the full card menu.
    expect(separatorCount(surface())).toBe(4);
  });

  it('adds no action beyond the frozen set', () => {
    renderMenu();
    expect(rows()).toHaveLength(CARD_INVENTORY.filter((l) => l !== '---').length);
  });
});

describe('CanvasContextMenu — frozen edit-target behavior', () => {
  const container = makePadlet({ id: 'container-1', type: 'container' });
  const targetA = makePadlet({ id: 'child-a', type: 'note', title: 'Alpha' });
  const targetB = makePadlet({ id: 'child-b', type: 'todo', title: 'Beta' });

  it('labels the row "Edit" for an ordinary card', () => {
    renderMenu();
    expect(rowLabels()[0]).toBe('Edit');
  });

  it('labels the row "View comment" for a comment', () => {
    renderMenu({ padlet: makePadlet({ type: 'comment' }) });
    expect(rowLabels()[0]).toBe('View comment');
  });

  it('labels the row "Edit Post" for a container with onEditPadletAsPost and no targets', () => {
    renderMenu({ padlet: container, onEditPadletAsPost: vi.fn() });
    expect(rowLabels()[0]).toBe('Edit Post');
  });

  it('inlines a single edit target as "Edit {label}" with no submenu', () => {
    renderMenu({
      padlet: container,
      openTargets: [targetA],
      onOpenTarget: vi.fn(),
    });
    expect(rowLabels()[0]).toBe('Edit Alpha');
    expect(subSurface()).toBeNull();
  });

  it('a single edit target fires onOpenTarget with that target and closes', () => {
    const onOpenTarget = vi.fn();
    const handlers = renderMenu({ padlet: container, openTargets: [targetA], onOpenTarget });
    click(rowByLabel('Edit Alpha'));
    expect(onOpenTarget).toHaveBeenCalledTimes(1);
    expect(onOpenTarget).toHaveBeenCalledWith(targetA);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onEdit).not.toHaveBeenCalled();
  });

  it('labels the row "Edit post" when multiple targets exist', () => {
    renderMenu({ padlet: container, openTargets: [targetA, targetB], onOpenTarget: vi.fn() });
    expect(rowLabels()[0]).toBe('Edit post');
  });

  it('keeps the multi-target submenu closed until it is opened', () => {
    renderMenu({ padlet: container, openTargets: [targetA, targetB], onOpenTarget: vi.fn() });
    expect(subSurface()).toBeNull();
    expect(rowLabels()).not.toContain('Alpha');
  });

  it('lists every target in order inside the submenu', () => {
    renderMenu({ padlet: container, openTargets: [targetA, targetB], onOpenTarget: vi.fn() });
    openEditSubmenu();
    const labels = rowLabels();
    expect(labels.filter((l) => l === 'Alpha' || l === 'Beta')).toEqual(['Alpha', 'Beta']);
  });

  it('routes the correct target to onOpenTarget from the submenu, and closes', () => {
    const onOpenTarget = vi.fn();
    const handlers = renderMenu({
      padlet: container, openTargets: [targetA, targetB], onOpenTarget,
    });
    openEditSubmenu();
    click(rowByLabel('Beta'));
    expect(onOpenTarget).toHaveBeenCalledTimes(1);
    expect(onOpenTarget).toHaveBeenCalledWith(targetB);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('falls back to a custom label, then title, then a type-indexed name', () => {
    const untitled = makePadlet({ id: 'child-c', type: 'sticky_note', title: '' });
    renderMenu({
      padlet: container,
      openTargets: [targetA, untitled],
      onOpenTarget: vi.fn(),
      getOpenTargetLabel: (p: Padlet) => (p.id === 'child-a' ? 'Custom A' : ''),
    });
    openEditSubmenu();
    const labels = rowLabels();
    expect(labels).toContain('Custom A');
    // Underscores become spaces and the index is 1-based.
    expect(labels).toContain('sticky note 2');
  });

  it('ignores openTargets when the padlet is not a container', () => {
    renderMenu({ padlet: makePadlet({ type: 'note' }), openTargets: [targetA], onOpenTarget: vi.fn() });
    expect(rowLabels()[0]).toBe('Edit');
  });

  it('treats metadata.isContainer as a container', () => {
    renderMenu({
      padlet: makePadlet({ type: 'note', metadata: { isContainer: true } }),
      openTargets: [targetA],
      onOpenTarget: vi.fn(),
    });
    expect(rowLabels()[0]).toBe('Edit Alpha');
  });
});

describe('CanvasContextMenu — frozen callback payloads', () => {
  const padlet = makePadlet({ id: 'card-42' });

  const CASES: Array<{ label: string; key: (typeof ACTION_KEYS)[number] }> = [
    { label: 'Edit', key: 'onEdit' },
    { label: 'Cut', key: 'onCut' },
    { label: 'Copy', key: 'onCopy' },
    { label: 'Send to back', key: 'onSendToBack' },
    { label: 'Send backward', key: 'onSendBackward' },
    { label: 'Bring forward', key: 'onBringForward' },
    { label: 'Bring to front', key: 'onBringToFront' },
    { label: 'Copy to clipboard as PNG', key: 'onCopyAsPNG' },
    { label: 'Export as PNG', key: 'onExportAsPNG' },
    { label: 'Duplicate', key: 'onDuplicate' },
    { label: 'Delete', key: 'onDelete' },
  ];

  for (const { label, key: prop } of CASES) {
    it(`"${label}" forwards the target padlet to ${prop}, closes, and fires nothing else`, () => {
      const handlers = renderMenu({ padlet });
      click(rowByLabel(label));
      expect(handlers[prop]).toHaveBeenCalledTimes(1);
      expect(handlers[prop]).toHaveBeenCalledWith(padlet);
      expect(handlers.onClose).toHaveBeenCalledTimes(1);
      for (const other of ACTION_KEYS) {
        if (other !== prop) expect(handlers[other], `${other} should not fire`).not.toHaveBeenCalled();
      }
    });
  }

  it('"Paste" forwards the supplied x/y -- not the clamped position -- and closes', () => {
    const handlers = renderMenu({ x: 321, y: 654 });
    click(rowByLabel('Paste'));
    expect(handlers.onPaste).toHaveBeenCalledTimes(1);
    expect(handlers.onPaste).toHaveBeenCalledWith(321, 654);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('a container with onEditPadletAsPost routes Edit to that callback, not onEdit', () => {
    const onEditPadletAsPost = vi.fn();
    const container = makePadlet({ id: 'container-1', type: 'container' });
    const handlers = renderMenu({ padlet: container, onEditPadletAsPost });
    click(rowByLabel('Edit Post'));
    expect(onEditPadletAsPost).toHaveBeenCalledTimes(1);
    expect(onEditPadletAsPost).toHaveBeenCalledWith(container);
    expect(handlers.onEdit).not.toHaveBeenCalled();
  });

  it('"View comment" routes to onEdit with the comment padlet', () => {
    // The comment path has no dedicated callback: it reuses onEdit.
    const comment = makePadlet({ id: 'comment-9', type: 'comment' });
    const handlers = renderMenu({ padlet: comment });
    click(rowByLabel('View comment'));
    expect(handlers.onEdit).toHaveBeenCalledTimes(1);
    expect(handlers.onEdit).toHaveBeenCalledWith(comment);
  });
});

describe('CanvasContextMenu — frozen paste gating', () => {
  it('enables Paste when hasPaste is true', () => {
    renderMenu({ hasPaste: true });
    expect(isDisabled(rowByLabel('Paste'))).toBe(false);
  });

  it('disables Paste when hasPaste is false', () => {
    renderMenu({ hasPaste: false });
    expect(isDisabled(rowByLabel('Paste'))).toBe(true);
  });

  it('a disabled Paste fires nothing and does not close', () => {
    const handlers = renderMenu({ hasPaste: false });
    click(rowByLabel('Paste'));
    expect(handlers.onPaste).not.toHaveBeenCalled();
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('disables nothing else when Paste is disabled', () => {
    renderMenu({ hasPaste: false });
    const enabled = rowLabels().filter((_, i) => !isDisabled(rows()[i]));
    expect(enabled).toEqual(CARD_INVENTORY.filter((l) => l !== '---' && l !== 'Paste'));
  });
});

describe('CanvasContextMenu — frozen positioning contract', () => {
  it('renders at the externally supplied x/y', () => {
    renderMenu({ x: 120, y: 240 });
    expect(surface().style.left).toBe('120px');
    expect(surface().style.top).toBe('240px');
  });

  it('keeps the Drawing overlay stacking order and menu width', () => {
    renderMenu();
    expect(surface().className).toContain('z-[9999]');
    expect(surface().className).toContain('w-[272px]');
  });

  it('is a fixed-position surface', () => {
    renderMenu();
    expect(surface().className).toContain('fixed');
  });
});

// ══════════════════════════════════════════════════════════════════════════
// NO SHORTCUT HINTS — the PATCH 4H product rule, applied here by PATCH 5
// ══════════════════════════════════════════════════════════════════════════
describe('CanvasContextMenu — no keyboard-shortcut hints', () => {
  it('renders no shortcut text anywhere in the card menu', () => {
    renderMenu();
    expect(surface().textContent ?? '').not.toMatch(SHORTCUT_TEXT);
  });

  it('renders no shortcut text in the comment menu', () => {
    renderMenu({ padlet: makePadlet({ type: 'comment' }) });
    expect(surface().textContent ?? '').not.toMatch(SHORTCUT_TEXT);
  });

  it('uses no shared shortcut slot and no hand-rolled shortcut span', () => {
    renderMenu();
    expect(surface().querySelectorAll('[data-slot="context-menu-shortcut"]')).toHaveLength(0);
    expect(surface().querySelectorAll('span.opacity-60')).toHaveLength(0);
    expect(surface().querySelectorAll('kbd')).toHaveLength(0);
    expect(surface().querySelectorAll('[title]')).toHaveLength(0);
  });

  it('keeps no shortcut prop or literal in the source', () => {
    const src = source();
    expect(src).not.toContain('ContextMenuShortcut');
    expect(src).not.toMatch(/shortcut[?]?:/);
    expect(src).not.toMatch(/shortcut=/);
    expect(src).not.toMatch(SHORTCUT_TEXT);
  });

  it('leaves the real keyboard command handlers untouched', () => {
    // Hints are display only. The bindings that make Ctrl+Shift+[ and friends
    // work live in the shared canvas shortcut hook and must be unaffected.
    const shortcuts = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/canvas/hooks/useCanvasShortcuts.ts'),
      'utf8',
    );
    expect(shortcuts).toContain('ctrlKey');
    expect(shortcuts).toContain('metaKey');
    expect(shortcuts).toMatch(/e\.key === '\['/);
    expect(shortcuts).toMatch(/e\.key === '\]'/);
    expect(shortcuts).toContain("e.key === 'Delete'");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// NORMALIZED — behavior standardized onto the shared conventions (PATCH 5)
// ══════════════════════════════════════════════════════════════════════════
describe('CanvasContextMenu — normalized presentation', () => {
  it('marks Delete with the shared destructive variant, not hand-rolled red', () => {
    renderMenu();
    expect(rowByLabel('Delete').getAttribute('data-variant')).toBe('destructive');
    expect(rowByLabel('Delete').className).not.toContain('#f03e3e');
    expect(rowByLabel('Cut').getAttribute('data-variant')).toBe('default');
  });

  it('uses the shared surface and row styling rather than the old local palette', () => {
    renderMenu();
    expect(surface().className).toContain('bg-gray-50');
    expect(surface().className).toContain('rounded-lg');
    expect(rows().every((r) => r.className.includes('text-[13px]'))).toBe(true);
    // The old inline palette and hard-coded font are gone.
    expect(surface().style.background).toBe('');
    expect(rows().every((r) => r.style.fontFamily === '')).toBe(true);
  });

  it('exposes rows as menu items on a role="menu" surface', () => {
    renderMenu();
    expect(surface().getAttribute('role')).toBe('menu');
    expect(rows().every((r) => r.getAttribute('role') === 'menuitem')).toBe(true);
  });

  it('marks a disabled row with the shared aria/data contract', () => {
    renderMenu({ hasPaste: false });
    const paste = rowByLabel('Paste');
    expect(paste.getAttribute('data-disabled')).toBe('');
    expect(paste.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('CanvasContextMenu — normalized keyboard and dismissal', () => {
  it('dismisses on Escape', () => {
    const handlers = renderMenu();
    key(surface(), 'Escape');
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('dismisses on outside pointer interaction', async () => {
    const handlers = renderMenu();
    await act(async () => { await tick(); });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not dismiss on interaction inside the surface', async () => {
    const handlers = renderMenu();
    await act(async () => { await tick(); });
    act(() => {
      surface().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('navigates rows with ArrowDown and ArrowUp', () => {
    renderMenu();
    key(surface(), 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Edit'));
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Cut'));
    key(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(rowByLabel('Edit'));
  });

  it('skips a disabled Paste during keyboard navigation', () => {
    renderMenu({ hasPaste: false });
    key(surface(), 'ArrowDown');
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Cut'));
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Copy'));
    // Paste is next in DOM order but disabled, so focus jumps past it.
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Send to back'));
  });

  it('jumps to the first and last rows with Home and End', () => {
    renderMenu();
    key(surface(), 'End');
    expect(document.activeElement).toBe(rowByLabel('Delete'));
    key(document.activeElement as HTMLElement, 'Home');
    expect(document.activeElement).toBe(rowByLabel('Edit'));
  });

  it('activates a focused row with Enter and with Space', () => {
    const first = renderMenu();
    key(surface(), 'ArrowDown');
    key(document.activeElement as HTMLElement, 'Enter');
    expect(first.onEdit).toHaveBeenCalledTimes(1);

    unmountAll();

    const second = renderMenu();
    key(surface(), 'ArrowDown');
    key(document.activeElement as HTMLElement, ' ');
    expect(second.onEdit).toHaveBeenCalledTimes(1);
  });
});

describe('CanvasContextMenu — normalized viewport handling', () => {
  it('pulls back from the right edge by the shared 8px margin', () => {
    withMenuBox(272, 300, () => {
      renderMenu({ x: 1000, y: 50 });
      // jsdom viewport is 1024 wide.
      expect(surface().style.left).toBe(`${1024 - 272 - 8}px`);
    });
  });

  it('pulls back from the bottom edge instead of flipping above the cursor', () => {
    withMenuBox(272, 400, () => {
      renderMenu({ x: 50, y: 700 });
      // The old menu flipped to y - height; the shared surface clamps to fit.
      expect(surface().style.top).toBe(`${768 - 400 - 8}px`);
    });
  });

  it('clamps only the overflowing axis', () => {
    withMenuBox(272, 300, () => {
      renderMenu({ x: 1000, y: 40 });
      expect(surface().style.left).toBe(`${1024 - 272 - 8}px`);
      expect(surface().style.top).toBe('40px');
    });
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADOPTION — proves the shared primitives are what actually render
// ══════════════════════════════════════════════════════════════════════════
function openEditSubmenu() {
  hover(rowByLabel('Edit post'));
  // The pre-migration build disclosed the submenu on click, not hover.
  if (!subSurface()) click(rowByLabel('Edit post'));
}

describe('CanvasContextMenu — shared shell adoption', () => {
  const container = makePadlet({ id: 'container-1', type: 'container' });
  const targetA = makePadlet({ id: 'child-a', type: 'note', title: 'Alpha' });
  const targetB = makePadlet({ id: 'child-b', type: 'todo', title: 'Beta' });

  function renderMulti(extra: Record<string, any> = {}) {
    return renderMenu({
      padlet: container,
      openTargets: [targetA, targetB],
      onOpenTarget: vi.fn(),
      ...extra,
    });
  }

  it('renders through the shared positioned surface', () => {
    renderMenu();
    expect(
      document.querySelectorAll('[data-slot="positioned-context-menu-content"]'),
    ).toHaveLength(1);
    expect(surface().querySelectorAll('[data-slot="context-menu-item"]').length).toBeGreaterThan(0);
    expect(surface().querySelectorAll('[data-slot="context-menu-separator"]')).toHaveLength(5);
  });

  it('renders the Edit submenu through the shared positioned submenu', () => {
    renderMulti();
    hover(rowByLabel('Edit post'));
    const content = openSubSurface();
    expect(content.getAttribute('data-slot')).toBe('positioned-context-menu-sub-content');
    expect(content.getAttribute('role')).toBe('menu');
    expect(content.className).toContain('bg-gray-50');
    expect(
      Array.from(content.querySelectorAll('[role="menuitem"]'))
        .every((el) => el.getAttribute('data-slot') === 'context-menu-item'),
    ).toBe(true);
  });

  it('exposes canonical submenu ARIA on the Edit trigger', () => {
    renderMulti();
    const trigger = rowByLabel('Edit post');
    expect(trigger.getAttribute('data-slot')).toBe('context-menu-sub-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    hover(trigger);
    expect(rowByLabel('Edit post').getAttribute('aria-expanded')).toBe('true');
    expect(rowByLabel('Edit post').getAttribute('aria-controls')).toBe(openSubSurface().id);
  });

  it('opens the Edit submenu with ArrowRight and focuses its first target', () => {
    renderMulti();
    key(rowByLabel('Edit post'), 'ArrowRight');
    expect(document.activeElement).toBe(rowByLabel('Alpha'));
  });

  it('closes the Edit submenu on ArrowLeft and restores focus to its trigger', () => {
    renderMulti();
    key(rowByLabel('Edit post'), 'ArrowRight');
    openSubSurface();
    key(document.activeElement as HTMLElement, 'ArrowLeft');
    expect(subSurface()).toBeNull();
    expect(document.activeElement).toBe(rowByLabel('Edit post'));
  });

  it('navigates submenu targets with ArrowDown and ArrowUp', () => {
    renderMulti();
    key(rowByLabel('Edit post'), 'ArrowRight');
    key(document.activeElement as HTMLElement, 'ArrowDown');
    expect(document.activeElement).toBe(rowByLabel('Beta'));
    key(document.activeElement as HTMLElement, 'ArrowUp');
    expect(document.activeElement).toBe(rowByLabel('Alpha'));
  });

  it('keeps the Pencil icon in the shared leading icon slot', () => {
    renderMulti();
    hover(rowByLabel('Edit post'));
    const alpha = rowByLabel('Alpha');
    const icon = alpha.querySelector('[data-slot="context-menu-icon"]');
    expect(icon).not.toBeNull();
    expect(icon!.getAttribute('aria-hidden')).toBe('true');
    expect(alpha.firstElementChild).toBe(icon);
    expect(icon!.querySelector('svg')).not.toBeNull();
  });

  it('imports the shared primitives from the public barrel only', () => {
    const src = source();
    expect(src).toMatch(/from ["']@\/components\/ui\/context-menu["']/);
    for (const name of [
      'PositionedContextMenu',
      'PositionedContextMenuItem',
      'PositionedContextMenuSeparator',
      'PositionedContextMenuSub',
      'PositionedContextMenuSubTrigger',
      'PositionedContextMenuSubContent',
    ]) {
      expect(src, `missing ${name}`).toContain(name);
    }
    // Internal implementation modules are off limits to consumers.
    expect(src).not.toContain('positioned-context-menu');
    expect(src).not.toContain('context-menu-styles');
  });

  it('drops the old hand-built surface, helpers, submenu and clamping', () => {
    const src = source();
    expect(src).not.toMatch(/function MenuItem\b/);
    expect(src).not.toMatch(/function Sep\b/);
    expect(src).not.toContain('UI_FONT');
    expect(src).not.toContain('absolute left-[calc(100%-10px)]');
    expect(src).not.toContain('window.innerWidth');
    expect(src).not.toContain('window.innerHeight');
    expect(src).not.toContain('useLayoutEffect');
    // No local open/visibility state survives; the shared shell owns both.
    expect(src).not.toContain('useState');
    expect(src).not.toContain('useRef');
    expect(src).not.toMatch(/className="fixed/);
    expect(src).not.toContain('#f1f3f5');
  });

  it('uses no fake trigger and synthesizes no contextmenu event', () => {
    const src = source();
    expect(src).not.toContain('@radix-ui/react-context-menu');
    expect(src).not.toContain('ContextMenuTrigger');
    expect(src).not.toContain('dispatchEvent');
    renderMenu();
    expect(document.querySelector('[data-radix-context-menu-trigger]')).toBeNull();
    // A plain card menu has no submenu, so nothing declares haspopup.
    expect(document.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
  });

  it('keeps the externally-owned prop contract unchanged', () => {
    const src = source();
    expect(src).toMatch(/x:\s*number;/);
    expect(src).toMatch(/y:\s*number;/);
    expect(src).toMatch(/padlet:\s*Padlet;/);
    expect(src).toMatch(/hasPaste:\s*boolean;/);
    expect(src).toMatch(/onPaste:\s*\(x:\s*number,\s*y:\s*number\)\s*=>\s*void;/);
    // No isOpen flag: DrawingLayout mounts the menu only while it should show.
    expect(src).not.toMatch(/isOpen[?]?:\s*boolean/);
  });

  it('leaves DrawingLayout as the owner of open state, coordinates and permissions', () => {
    const host = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/canvas/layouts/DrawingLayout.tsx'),
      'utf8',
    );
    const start = host.indexOf('<CanvasContextMenu');
    expect(start).toBeGreaterThan(-1);
    const call = host.slice(start, host.indexOf('/>', start));
    for (const prop of [
      'x=', 'y=', 'padlet=', 'openTargets=', 'onOpenTarget=', 'getOpenTargetLabel=',
      'hasPaste=', 'onEdit=', 'onEditPadletAsPost=', 'onCut=', 'onCopy=', 'onPaste=',
      'onDuplicate=', 'onDelete=', 'onSendToBack=', 'onSendBackward=', 'onBringForward=',
      'onBringToFront=', 'onCopyAsPNG=', 'onExportAsPNG=', 'onClose=',
    ]) {
      expect(call, `DrawingLayout must still pass ${prop}`).toContain(prop);
    }
    // The host still mounts conditionally and still owns its backdrop.
    expect(host).toContain('{contextMenu && (');
    expect(host).toContain('fixed inset-0 z-[9998]');
  });
});
