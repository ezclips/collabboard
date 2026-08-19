// @vitest-environment jsdom
//
// Characterization of FreeformCanvasBoardMenu across its migration onto the
// positioned shared shell (PATCH 4E).
//
// Everything in the "frozen contract" blocks was written and run GREEN against
// the pre-migration hand-rolled implementation at 9e33423, then re-run against
// the migrated component. Those are the hard preservation boundaries: action
// set, ordering, permission/visibility rules, and callback arguments.
//
// The "normalized" and "adoption" blocks are deliberately RED before the
// migration. They record presentation/interaction that PATCH 4E intentionally
// standardized onto the shared CollabBoard menu conventions.
//
// Contract notes:
//   - CanvasClient owns open state (it mounts the menu only while
//     `freeformBoardMenu` is non-null), owns the {x,y} screen coordinates
//     captured from its own canvas contextmenu handler, and owns the canvas
//     coordinates used for paste. The menu is told nothing about the click
//     target beyond x/y.
//   - Every action callback is zero-argument except `onToolAction(toolType)`.
//   - `FREEFORM_BOARD_TOOL_ITEMS` is also imported by components/map/MapCanvas
//     and must remain exported.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FreeformCanvasBoardMenu, {
  FREEFORM_BOARD_TOOL_ITEMS,
} from './canvas/ui/FreeformCanvasBoardMenu';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
 * The shared shell defers attaching dismissal listeners by a macrotask so the
 * interaction that opened the menu cannot immediately close it. The hand-rolled
 * menu attached them synchronously. Waiting covers both.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/**
 * The single fixed-position surface, in either implementation. The migrated
 * menu portals to document.body, the hand-rolled one rendered in place, so this
 * always searches the whole document.
 */
function surface(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], .fixed',
  );
  expect(el, 'board menu surface not rendered').not.toBeNull();
  return el!;
}

/** Rows in DOM order: hand-rolled <button>s or shared <div role="menuitem">s. */
function rows(): HTMLElement[] {
  return Array.from(surface().querySelectorAll<HTMLElement>('button, [role="menuitem"]'));
}

function rowLabels(): string[] {
  return rows().map((el) => (el.textContent ?? '').trim());
}

function rowByLabel(label: string): HTMLElement {
  const idx = rowLabels().indexOf(label);
  expect(idx, `no row labelled "${label}"`).toBeGreaterThan(-1);
  return rows()[idx];
}

/** True for both the hand-rolled `<button disabled>` and the shared data-attr. */
function isDisabled(el: HTMLElement): boolean {
  return el.hasAttribute('data-disabled') || (el as HTMLButtonElement).disabled === true;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Every callback prop, so any test can assert that siblings stayed silent. */
function makeHandlers() {
  return {
    onClose: vi.fn(),
    onPaste: vi.fn(),
    onUndo: vi.fn(),
    onSelectAll: vi.fn(),
    onToolAction: vi.fn(),
    onOpenBackgroundEditor: vi.fn(),
    onToggleDotGrid: vi.fn(),
    onToggleSnapToGrid: vi.fn(),
    onToggleAlignmentGuides: vi.fn(),
  };
}

type Handlers = ReturnType<typeof makeHandlers>;

/** Action callbacks only — `onClose` is dismissal, not an action. */
const ACTION_KEYS = [
  'onPaste',
  'onUndo',
  'onSelectAll',
  'onToolAction',
  'onOpenBackgroundEditor',
  'onToggleDotGrid',
  'onToggleSnapToGrid',
  'onToggleAlignmentGuides',
] as const;

function renderMenu(
  overrides: Partial<React.ComponentProps<typeof FreeformCanvasBoardMenu>> = {},
  handlers: Handlers = makeHandlers(),
) {
  mount(
    <FreeformCanvasBoardMenu
      x={10}
      y={20}
      isEditable
      showGraphLine
      canPaste
      canUndoPaste
      showDotGrid={false}
      snapToGrid={false}
      alignmentGuides={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

/**
 * Pin element box metrics so the viewport clamp is measurable in jsdom, which
 * otherwise reports 0 for every offset dimension.
 */
function withMeasuredMenu(width: number, height: number, run: () => void) {
  const w = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const h = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => width });
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => height });
  try {
    run();
  } finally {
    if (w) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', w);
    else delete (HTMLElement.prototype as any).offsetWidth;
    if (h) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', h);
    else delete (HTMLElement.prototype as any).offsetHeight;
  }
}

const TOOL_LABELS = FREEFORM_BOARD_TOOL_ITEMS.map((item) => item.label);

/** Frozen: exactly these rows, in exactly this order. */
const ALL_ROWS = [
  'Paste',
  'Undo',
  'Select All',
  ...TOOL_LABELS,
  'Change Board Background...',
  'Show Dot Grid',
  'Snap to Grid',
  'Alignment Guides',
];

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

const MENU_SOURCE_PATH = 'components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx';

// ══════════════════════════════════════════════════════════════════════════
// FROZEN CONTRACT — action set, ordering, permissions, callbacks
// ══════════════════════════════════════════════════════════════════════════
describe('FreeformCanvasBoardMenu — frozen action set', () => {
  it('renders exactly the same actions in the same order', () => {
    renderMenu();
    expect(rowLabels()).toEqual(ALL_ROWS);
  });

  it('exposes all 14 board tools, keyed to the shared FREEFORM_BOARD_TOOL_ITEMS table', () => {
    // MapCanvas imports the same table, so this export is part of the contract.
    expect(FREEFORM_BOARD_TOOL_ITEMS).toHaveLength(14);
    expect(FREEFORM_BOARD_TOOL_ITEMS.map((i) => i.type)).toEqual([
      'note', 'link', 'todo', 'line', 'graph-line', 'container', 'table',
      'comment', 'image', 'upload', 'import', 'draw', 'library', 'ai-component',
    ]);
    renderMenu();
    for (const label of TOOL_LABELS) expect(rowLabels()).toContain(label);
  });

  it('adds no action beyond the frozen set', () => {
    renderMenu();
    expect(rows()).toHaveLength(ALL_ROWS.length);
  });

  it('groups the rows with exactly two separators', () => {
    renderMenu();
    const separators = surface().querySelectorAll(
      '[data-slot="context-menu-separator"], [role="separator"], .h-px',
    );
    expect(separators).toHaveLength(2);
  });

  it('has no destructive action at all', () => {
    // There is no delete/clear action on the board background menu. Migration
    // must not invent one, and must not mark an existing row destructive.
    renderMenu();
    expect(rows().filter((r) => r.getAttribute('data-variant') === 'destructive')).toHaveLength(0);
    expect(rowLabels().some((l) => /delete|remove|clear/i.test(l))).toBe(false);
  });
});

describe('FreeformCanvasBoardMenu — frozen visibility & permissions', () => {
  it('hides New Graph Line unless showGraphLine is true', () => {
    renderMenu({ showGraphLine: false });
    expect(rowLabels()).not.toContain('New Graph Line');
    expect(rowLabels()).toEqual(ALL_ROWS.filter((l) => l !== 'New Graph Line'));
  });

  it('shows New Graph Line when showGraphLine is true', () => {
    renderMenu({ showGraphLine: true });
    expect(rowLabels()).toContain('New Graph Line');
  });

  it('read-only boards disable Paste, Undo, every tool, and the background editor', () => {
    renderMenu({ isEditable: false });
    expect(isDisabled(rowByLabel('Paste'))).toBe(true);
    expect(isDisabled(rowByLabel('Undo'))).toBe(true);
    for (const label of TOOL_LABELS) expect(isDisabled(rowByLabel(label))).toBe(true);
    expect(isDisabled(rowByLabel('Change Board Background...'))).toBe(true);
  });

  it('read-only boards still allow Select All, Show Dot Grid, Snap to Grid and Alignment Guides (view-only/personal-preference actions)', () => {
    renderMenu({ isEditable: false });
    expect(isDisabled(rowByLabel('Select All'))).toBe(false);
    expect(isDisabled(rowByLabel('Show Dot Grid'))).toBe(false);
    expect(isDisabled(rowByLabel('Snap to Grid'))).toBe(false);
    expect(isDisabled(rowByLabel('Alignment Guides'))).toBe(false);
  });

  it('editable boards enable every row when clipboard state allows', () => {
    renderMenu();
    for (const label of ALL_ROWS) expect(isDisabled(rowByLabel(label))).toBe(false);
  });

  it('disables Paste when the clipboard is empty even on an editable board', () => {
    renderMenu({ canPaste: false });
    expect(isDisabled(rowByLabel('Paste'))).toBe(true);
    expect(isDisabled(rowByLabel('Undo'))).toBe(false);
  });

  it('disables Undo when there is no paste to undo even on an editable board', () => {
    renderMenu({ canUndoPaste: false });
    expect(isDisabled(rowByLabel('Undo'))).toBe(true);
    expect(isDisabled(rowByLabel('Paste'))).toBe(false);
  });

  it('grants no new capability: a disabled row fires nothing when clicked', () => {
    const handlers = renderMenu({ isEditable: false });
    click(rowByLabel('Paste'));
    click(rowByLabel('Undo'));
    click(rowByLabel('New Note'));
    click(rowByLabel('Change Board Background...'));
    for (const key of ACTION_KEYS) expect(handlers[key]).not.toHaveBeenCalled();
  });

  it('checks Show Dot Grid only when showDotGrid is true', () => {
    renderMenu({ showDotGrid: false });
    expect(rowByLabel('Show Dot Grid').querySelector('svg')).toBeNull();

    mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
    mounted = [];

    renderMenu({ showDotGrid: true });
    expect(rowByLabel('Show Dot Grid').querySelector('svg')).not.toBeNull();
  });

  it('checks Snap to Grid only when snapToGrid is true', () => {
    renderMenu({ snapToGrid: false });
    expect(rowByLabel('Snap to Grid').querySelector('svg')).toBeNull();

    mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
    mounted = [];

    renderMenu({ snapToGrid: true });
    expect(rowByLabel('Snap to Grid').querySelector('svg')).not.toBeNull();
  });

  it('Show Dot Grid and Snap to Grid check independently of each other', () => {
    renderMenu({ showDotGrid: true, snapToGrid: false });
    expect(rowByLabel('Show Dot Grid').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Snap to Grid').querySelector('svg')).toBeNull();

    mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
    mounted = [];

    renderMenu({ showDotGrid: false, snapToGrid: true });
    expect(rowByLabel('Show Dot Grid').querySelector('svg')).toBeNull();
    expect(rowByLabel('Snap to Grid').querySelector('svg')).not.toBeNull();
  });

  it('checks Alignment Guides only when alignmentGuides is true', () => {
    renderMenu({ alignmentGuides: false });
    expect(rowByLabel('Alignment Guides').querySelector('svg')).toBeNull();

    mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
    mounted = [];

    renderMenu({ alignmentGuides: true });
    expect(rowByLabel('Alignment Guides').querySelector('svg')).not.toBeNull();
  });

  it('Show Dot Grid, Snap to Grid and Alignment Guides check independently of each other', () => {
    renderMenu({ showDotGrid: true, snapToGrid: false, alignmentGuides: false });
    expect(rowByLabel('Show Dot Grid').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Snap to Grid').querySelector('svg')).toBeNull();
    expect(rowByLabel('Alignment Guides').querySelector('svg')).toBeNull();

    mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
    mounted = [];

    renderMenu({ showDotGrid: false, snapToGrid: true, alignmentGuides: true });
    expect(rowByLabel('Show Dot Grid').querySelector('svg')).toBeNull();
    expect(rowByLabel('Snap to Grid').querySelector('svg')).not.toBeNull();
    expect(rowByLabel('Alignment Guides').querySelector('svg')).not.toBeNull();
  });
});

describe('FreeformCanvasBoardMenu — frozen callback parity', () => {
  const CASES: Array<{ label: string; key: (typeof ACTION_KEYS)[number] }> = [
    { label: 'Paste', key: 'onPaste' },
    { label: 'Undo', key: 'onUndo' },
    { label: 'Select All', key: 'onSelectAll' },
    { label: 'Change Board Background...', key: 'onOpenBackgroundEditor' },
    { label: 'Show Dot Grid', key: 'onToggleDotGrid' },
    { label: 'Snap to Grid', key: 'onToggleSnapToGrid' },
    { label: 'Alignment Guides', key: 'onToggleAlignmentGuides' },
  ];

  for (const { label, key } of CASES) {
    it(`"${label}" fires ${key} exactly once and no sibling action`, () => {
      const handlers = renderMenu();
      click(rowByLabel(label));
      expect(handlers[key]).toHaveBeenCalledTimes(1);
      for (const other of ACTION_KEYS) {
        if (other !== key) expect(handlers[other]).not.toHaveBeenCalled();
      }
    });
  }

  for (const item of FREEFORM_BOARD_TOOL_ITEMS) {
    it(`"${item.label}" fires onToolAction("${item.type}") and nothing else`, () => {
      const handlers = renderMenu();
      click(rowByLabel(item.label));
      expect(handlers.onToolAction).toHaveBeenCalledTimes(1);
      expect(handlers.onToolAction).toHaveBeenCalledWith(item.type);
      for (const other of ACTION_KEYS) {
        if (other !== 'onToolAction') expect(handlers[other]).not.toHaveBeenCalled();
      }
    });
  }

  it('"Change Board Background..." both opens the editor and dismisses the menu', () => {
    const handlers = renderMenu();
    click(rowByLabel('Change Board Background...'));
    expect(handlers.onOpenBackgroundEditor).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('"Show Dot Grid" toggles without dismissing, so the checkmark stays visible', () => {
    const handlers = renderMenu();
    click(rowByLabel('Show Dot Grid'));
    expect(handlers.onToggleDotGrid).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('"Snap to Grid" toggles without dismissing, so the checkmark stays visible', () => {
    const handlers = renderMenu();
    click(rowByLabel('Snap to Grid'));
    expect(handlers.onToggleSnapToGrid).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('"Alignment Guides" toggles without dismissing, so the checkmark stays visible', () => {
    const handlers = renderMenu();
    click(rowByLabel('Alignment Guides'));
    expect(handlers.onToggleAlignmentGuides).toHaveBeenCalledTimes(1);
    expect(handlers.onClose).not.toHaveBeenCalled();
  });
});

describe('FreeformCanvasBoardMenu — frozen positioning contract', () => {
  it('renders at the externally supplied x/y when it fits the viewport', () => {
    renderMenu({ x: 15, y: 25 });
    expect(surface().style.left).toBe('15px');
    expect(surface().style.top).toBe('25px');
  });

  it('pulls back from the right/bottom edges by an 8px margin when it would overflow', () => {
    withMeasuredMenu(272, 400, () => {
      renderMenu({ x: 1000, y: 700 });
      // jsdom viewport is 1024x768.
      expect(surface().style.left).toBe(`${1024 - 272 - 8}px`);
      expect(surface().style.top).toBe(`${768 - 400 - 8}px`);
    });
  });

  it('clamps only the overflowing axis', () => {
    withMeasuredMenu(272, 400, () => {
      renderMenu({ x: 1000, y: 30 });
      expect(surface().style.left).toBe(`${1024 - 272 - 8}px`);
      expect(surface().style.top).toBe('30px');
    });
  });

  it('keeps the canvas-overlay stacking order and menu width', () => {
    renderMenu();
    expect(surface().className).toContain('z-[9999]');
    expect(surface().className).toContain('min-w-[272px]');
  });
});

describe('FreeformCanvasBoardMenu — frozen dismissal', () => {
  it('closes on outside pointer interaction', async () => {
    const handlers = renderMenu();
    await act(async () => { await tick(); });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('does not close on pointer interaction inside the menu', async () => {
    const handlers = renderMenu();
    await act(async () => { await tick(); });
    act(() => {
      rowByLabel('Select All').dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
      );
    });
    expect(handlers.onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const handlers = renderMenu();
    act(() => {
      surface().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
  });

  it('swallows a right-click on itself rather than opening the browser menu', () => {
    renderMenu();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    act(() => { surface().dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// NORMALIZED — interaction standardized onto the shared conventions (PATCH 4E)
// ══════════════════════════════════════════════════════════════════════════
describe('FreeformCanvasBoardMenu — normalized interaction', () => {
  it('dismisses after a terminal action, which the host was already doing itself', () => {
    // CanvasClient's onPaste/onUndo/onSelectAll/onToolAction handlers each call
    // setFreeformBoardMenu(null), so the shared close-on-select is a no-op for
    // the real host; it only makes the menu self-consistent in isolation.
    for (const label of ['Paste', 'Undo', 'Select All', 'New Note']) {
      const handlers = renderMenu();
      click(rowByLabel(label));
      expect(handlers.onClose, `${label} should dismiss`).toHaveBeenCalledTimes(1);
      mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
      mounted = [];
    }
  });

  it('calls the zero-argument action props with zero arguments', () => {
    // The hand-rolled rows wired `onClick={onPaste}` directly, so React leaked
    // its SyntheticEvent as argument 0 on Paste/Undo/Select All/Show Dot Grid.
    // Every one of these props is declared `() => void` and every CanvasClient
    // handler is a zero-parameter arrow, so nothing ever read it. The shared
    // shell's `onSelect` carries no DOM event, which matches the declared type.
    for (const [label, key] of [
      ['Paste', 'onPaste'],
      ['Undo', 'onUndo'],
      ['Select All', 'onSelectAll'],
      ['Show Dot Grid', 'onToggleDotGrid'],
      ['Snap to Grid', 'onToggleSnapToGrid'],
      ['Alignment Guides', 'onToggleAlignmentGuides'],
    ] as const) {
      const handlers = renderMenu();
      click(rowByLabel(label));
      expect(handlers[key], `${label} should pass no arguments`).toHaveBeenCalledWith();
      mounted.forEach((m) => { act(() => { m.root.unmount(); }); m.container.remove(); });
      mounted = [];
    }
  });

  it('exposes rows as keyboard-navigable menu items on a role="menu" surface', () => {
    renderMenu();
    expect(surface().getAttribute('role')).toBe('menu');
    expect(rows().every((r) => r.getAttribute('role') === 'menuitem')).toBe(true);
  });

  it('activates a row from the keyboard with Enter', () => {
    const handlers = renderMenu();
    act(() => {
      rowByLabel('Select All').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(handlers.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('marks disabled rows with the shared aria/data contract instead of <button disabled>', () => {
    renderMenu({ isEditable: false });
    const paste = rowByLabel('Paste');
    expect(paste.getAttribute('data-disabled')).toBe('');
    expect(paste.getAttribute('aria-disabled')).toBe('true');
  });

  it('uses the shared row and surface styling rather than a local one-off', () => {
    renderMenu();
    expect(surface().className).toContain('bg-gray-50');
    expect(rows().every((r) => r.getAttribute('data-slot') === 'context-menu-item')).toBe(true);
    // The hand-rolled rows hard-coded a font-family that no other CollabBoard
    // menu sets; the shared shell inherits the app font instead.
    expect(rows().every((r) => r.style.fontFamily === '')).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// ADOPTION — proves the shared shell is what is actually rendering
// ══════════════════════════════════════════════════════════════════════════
describe('FreeformCanvasBoardMenu — shared shell adoption', () => {
  it('renders the shared positioned surface', () => {
    renderMenu();
    expect(
      document.querySelectorAll('[data-slot="positioned-context-menu-content"]'),
    ).toHaveLength(1);
  });

  it('imports the shared primitives and no longer hand-rolls a surface', () => {
    const source = readSource(MENU_SOURCE_PATH);
    expect(source).toContain("from '@/components/ui/context-menu'");
    expect(source).toContain('PositionedContextMenu');
    expect(source).toContain('PositionedContextMenuItem');
    expect(source).toContain('PositionedContextMenuSeparator');
  });

  it('drops the superseded local listeners, clamping and fixed surface', () => {
    const source = readSource(MENU_SOURCE_PATH);
    expect(source).not.toContain('addEventListener');
    expect(source).not.toContain('window.innerWidth');
    expect(source).not.toContain('window.innerHeight');
    expect(source).not.toContain('useLayoutEffect');
    expect(source).not.toMatch(/className="fixed/);
  });

  it('uses no fake trigger and synthesizes no contextmenu event', () => {
    const source = readSource(MENU_SOURCE_PATH);
    expect(source).not.toContain('ContextMenuTrigger');
    expect(source).not.toContain("new MouseEvent('contextmenu'");
    expect(source).not.toContain('dispatchEvent');
    // Coordinate ownership stays with the host: raw x/y props, no isOpen flag.
    expect(source).toMatch(/x:\s*number;/);
    expect(source).toMatch(/y:\s*number;/);
  });

  it('keeps the host prop contract byte-identical in CanvasClient', () => {
    const source = readSource('app/dashboard/canvas/[id]/CanvasClient.tsx');
    const start = source.indexOf('<FreeformCanvasBoardMenu');
    expect(start).toBeGreaterThan(-1);
    const call = source.slice(start, source.indexOf('/>', start));
    for (const prop of [
      'x=', 'y=', 'isEditable=', 'showGraphLine=', 'canPaste=', 'canUndoPaste=',
      'showDotGrid=', 'snapToGrid=', 'alignmentGuides=', 'onClose=', 'onPaste=', 'onUndo=', 'onSelectAll=',
      'onToolAction=', 'onOpenBackgroundEditor=', 'onToggleDotGrid=', 'onToggleSnapToGrid=', 'onToggleAlignmentGuides=',
    ]) {
      expect(call, `CanvasClient must still pass ${prop}`).toContain(prop);
    }
    // The menu is mounted only while board-menu state exists — the host, not
    // the menu, owns open/closed.
    expect(source).toContain('isFreeformLayout && freeformBoardMenu &&');
  });

  it('leaves FreeformPadletCards out of the board-menu contract entirely', () => {
    const source = readSource('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
    expect(source).not.toContain('FreeformCanvasBoardMenu');
  });
});
