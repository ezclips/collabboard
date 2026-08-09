// @vitest-environment jsdom
//
// Characterization of LineContextMenu across its migration onto the positioned
// shared shell (PATCH 4C).
//
// These assertions were written and run GREEN against the pre-migration
// hand-rolled implementation at 43dba6f, then re-run against the migrated
// component. Anything asserted here is behavior that must not drift: action
// set, order, callbacks, payloads, swatch values/selection, the custom-color
// disclosure, close-vs-stay-open semantics, and the externally-owned {x,y}
// coordinate contract.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CanvasLine } from '@/types/collabboard';
import { LineContextMenu } from './menus/LineContextMenu';

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
 * Both implementations defer attaching their dismissal listeners so the
 * interaction that opened the menu cannot immediately close it — the
 * hand-rolled version by 10ms, the positioned shell by one macrotask. Wait
 * long enough to cover either.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 25));
}

/** The floating custom-colour panel, identified by its fixed 256px width. */
function customColorPanel(): HTMLElement | null {
  return surface().querySelector<HTMLElement>('[style*="256px"]');
}

function line(overrides: Partial<CanvasLine> = {}): CanvasLine {
  return {
    id: 'line-1',
    board_id: 'board-1',
    start_x: 0, start_y: 0, control_x: 0, control_y: 0, end_x: 10, end_y: 10,
    color: '#3b82f6',
    start_arrow: false,
    end_arrow: false,
    ...overrides,
  } as CanvasLine;
}

const LINE_COLOR_PRESETS = [
  '#3b82f6', '#06b6d4', '#10b981', '#84cc16', '#eab308',
  '#f97316', '#ef4444', '#ec4899', '#8b5cf6', '#6b7280',
];

/**
 * The menu surface: the single fixed-position element carrying the menu's
 * coordinates. Works for both the hand-rolled div and the positioned shell.
 */
function surface(): HTMLElement {
  const el = document.querySelector<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], .fixed'
  );
  expect(el, 'line menu surface not rendered').not.toBeNull();
  return el!;
}

/** Every actionable row label, in DOM order, excluding color swatches. */
function actionLabels(): string[] {
  return Array.from(surface().querySelectorAll<HTMLElement>('button, [role="menuitem"]'))
    .filter((el) => !el.hasAttribute('title')) // swatches carry title={color}
    .map((el) => el.textContent?.trim() ?? '');
}

function rowByText(text: string): HTMLElement {
  const match = Array.from(surface().querySelectorAll<HTMLElement>('button, [role="menuitem"]'))
    .find((el) => el.textContent?.trim() === text);
  expect(match, `no row labelled "${text}"`).toBeTruthy();
  return match!;
}

function swatchByColor(color: string): HTMLElement {
  const match = surface().querySelector<HTMLElement>(`[title="${color}"]`);
  expect(match, `no swatch for ${color}`).toBeTruthy();
  return match!;
}

function click(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

function renderMenu(props: Record<string, any> = {}) {
  return mount(
    <LineContextMenu
      isOpen
      position={{ x: 140, y: 260 }}
      line={line()}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

const EXPECTED_ACTIONS = [
  'Cut',
  'Duplicate',
  'Delete',
  'Add Start Arrow',
  'Add End Arrow',
  'Bring to Front',
  'Send to Back',
  'Choose Custom Color...',
];

describe('LineContextMenu', () => {
  it('preserves its action set and order', () => {
    renderMenu();
    expect(actionLabels()).toEqual(EXPECTED_ACTIONS);
  });

  it('renders exactly two separators between the three action groups', () => {
    renderMenu();
    const separators = surface().querySelectorAll(
      '[data-slot="context-menu-separator"], .h-\\[1px\\]'
    );
    expect(separators).toHaveLength(2);
  });

  it('flips arrow-toggle labels from the line\'s current state', () => {
    renderMenu({ line: line({ start_arrow: true, end_arrow: true }) });
    expect(actionLabels()).toEqual([
      'Cut',
      'Duplicate',
      'Delete',
      'Remove Start Arrow',
      'Remove End Arrow',
      'Bring to Front',
      'Send to Back',
      'Choose Custom Color...',
    ]);
  });

  it('honors the externally supplied x/y coordinates', () => {
    renderMenu({ position: { x: 140, y: 260 } });
    const el = surface();
    expect(el.style.left).toBe('140px');
    expect(el.style.top).toBe('260px');
  });

  it('retains its high overlay z-index', () => {
    renderMenu();
    // Line menus sit above canvas overlays; the shared default (z-50) is not enough.
    expect(surface().className).toContain('z-[9999]');
  });

  it('keeps the surface able to overflow so the custom color panel can escape', () => {
    renderMenu();
    expect(surface().className).toContain('overflow-visible');
  });

  it('renders nothing when closed or when there is no line', () => {
    const dom1 = mount(<LineContextMenu isOpen={false} position={{ x: 0, y: 0 }} line={line()} onClose={vi.fn()} />);
    expect(dom1.textContent).toBe('');
    expect(document.querySelector('[data-slot="positioned-context-menu-content"]')).toBeNull();

    const dom2 = mount(<LineContextMenu isOpen position={{ x: 0, y: 0 }} line={null} onClose={vi.fn()} />);
    expect(dom2.textContent).toBe('');
    expect(document.querySelector('[data-slot="positioned-context-menu-content"]')).toBeNull();
  });

  it.each([
    ['Cut', 'onCut'],
    ['Duplicate', 'onDuplicate'],
    ['Delete', 'onDelete'],
    ['Add Start Arrow', 'onToggleStartArrow'],
    ['Add End Arrow', 'onToggleEndArrow'],
    ['Bring to Front', 'onBringToFront'],
    ['Send to Back', 'onSendToBack'],
  ])('"%s" invokes %s exactly once and closes the menu', (label, propName) => {
    const handler = vi.fn();
    const onClose = vi.fn();
    renderMenu({ [propName]: handler, onClose });
    click(rowByText(label));
    expect(handler).toHaveBeenCalledTimes(1);
    // Callbacks take no arguments -- the owner closes over the line id.
    expect(handler).toHaveBeenCalledWith();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('still closes when the matching callback prop is omitted', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    click(rowByText('Duplicate'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders all ten color presets in order with their exact values', () => {
    renderMenu();
    const swatches = Array.from(surface().querySelectorAll<HTMLElement>('[title^="#"]'));
    expect(swatches.map((s) => s.getAttribute('title'))).toEqual(LINE_COLOR_PRESETS);
  });

  it('marks only the swatch matching the line\'s current color as selected', () => {
    renderMenu({ line: line({ color: '#ef4444' }) });
    const selected = swatchByColor('#ef4444');
    const other = swatchByColor('#3b82f6');
    const selectedMarked =
      selected.hasAttribute('data-selected') || selected.className.includes('ring-1');
    const otherMarked =
      other.hasAttribute('data-selected') || other.className.includes('ring-1');
    expect(selectedMarked).toBe(true);
    expect(otherMarked).toBe(false);
  });

  it('a preset swatch reports its exact color and closes the menu', () => {
    const onColorChange = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onColorChange, onClose });
    click(swatchByColor('#8b5cf6'));
    expect(onColorChange).toHaveBeenCalledWith('#8b5cf6');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('"Choose Custom Color..." toggles the picker WITHOUT closing the menu', () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    expect(customColorPanel()).toBeNull();

    click(rowByText('Choose Custom Color...'));
    expect(onClose).not.toHaveBeenCalled();
    expect(customColorPanel()).not.toBeNull();

    click(rowByText('Choose Custom Color...'));
    expect(onClose).not.toHaveBeenCalled();
    expect(customColorPanel()).toBeNull();
  });

  it('the custom color picker reports colors without closing the menu', () => {
    const onColorChange = vi.fn();
    const onClose = vi.fn();
    renderMenu({ onColorChange, onClose, line: line({ color: '#3b82f6' }) });
    click(rowByText('Choose Custom Color...'));

    // The picker's own preset grid uses the same LINE_COLOR_PRESETS values.
    const panel = customColorPanel()!;
    expect(panel).not.toBeNull();
    const pickerSwatch = panel.querySelector<HTMLElement>('[title="#10b981"]')!;
    expect(pickerSwatch).not.toBeNull();
    click(pickerSwatch);
    expect(onColorChange).toHaveBeenCalledWith('#10b981');
    // Unlike the compact preset row, the custom picker leaves the menu open.
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Escape closes the menu', async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    await act(async () => { await tick(); });
    act(() => {
      surface().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
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

  it('stops clicks from bubbling out to the canvas beneath', () => {
    const onOuterClick = vi.fn();
    mount(
      <div onClick={onOuterClick}>
        <LineContextMenu isOpen position={{ x: 10, y: 10 }} line={line()} onClose={vi.fn()} />
      </div>,
    );
    // React portals still bubble through the React tree, so the surface's own
    // stopPropagation is what keeps canvas handlers from firing.
    click(rowByText('Cut'));
    expect(onOuterClick).not.toHaveBeenCalled();
  });

  it('never renders an item for the onCopy / onLock props it accepts', () => {
    renderMenu({ onCopy: vi.fn(), onLock: vi.fn() });
    // Dead props, unchanged from pre-migration -- no Copy or Lock row exists.
    expect(actionLabels()).toEqual(EXPECTED_ACTIONS);
  });

  it('no action is ever disabled; read-only gating lives in the owner', () => {
    renderMenu();
    const rows = Array.from(surface().querySelectorAll<HTMLElement>('button, [role="menuitem"]'));
    expect(rows.some((el) => el.hasAttribute('data-disabled'))).toBe(false);
    expect(rows.some((el) => (el as HTMLButtonElement).disabled)).toBe(false);
  });
});

describe('LineContextMenu shared-shell adoption', () => {
  const source = () =>
    fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/LineContextMenu.tsx'),
      'utf8',
    );

  it('renders through the positioned shared surface', () => {
    renderMenu();
    expect(surface().getAttribute('data-slot')).toBe('positioned-context-menu-content');
    expect(surface().getAttribute('role')).toBe('menu');
  });

  it('keeps Delete on the default variant, exactly as before the migration', () => {
    // Unlike the Column/Wall container menus -- which carried a hand-rolled
    // `text-red-600` class and therefore adopted `variant="destructive"` in
    // Patch 3 -- LineContextMenu's Delete has never had destructive styling.
    // Adding it here would be a redesign, so the default variant is preserved.
    renderMenu();
    const del = rowByText('Delete');
    expect(del.getAttribute('data-variant')).toBe('default');
    expect(del.className).not.toContain('text-red-600');
    const variants = Array.from(surface().querySelectorAll<HTMLElement>('[data-slot="context-menu-item"]'))
      .map((el) => el.getAttribute('data-variant'));
    expect(variants.every((v) => v === 'default')).toBe(true);
  });

  it('uses the shared item/separator/swatch primitives', () => {
    renderMenu();
    const el = surface();
    expect(el.querySelectorAll('[data-slot="context-menu-item"]').length).toBeGreaterThan(0);
    expect(el.querySelectorAll('[data-slot="context-menu-separator"]')).toHaveLength(2);
    expect(el.querySelector('[data-slot="context-menu-swatch-row"]')).not.toBeNull();
    expect(el.querySelectorAll('[data-slot="context-menu-swatch"]')).toHaveLength(10);
  });

  it('imports the positioned family and keeps the externally-owned coordinate contract', () => {
    expect(source()).toContain("from '@/components/ui/context-menu'");
    expect(source()).toContain('PositionedContextMenu');
    expect(source()).toMatch(/isOpen:\s*boolean/);
    expect(source()).toMatch(/position:\s*\{\s*x:\s*number;\s*y:\s*number\s*\}/);
  });

  it('no longer hand-rolls a fixed surface, item styling, or dismissal listeners', () => {
    const src = source();
    expect(src).not.toMatch(/function MenuItem\b/);
    expect(src).not.toContain('fixed z-[9999]');
    expect(src).not.toContain("addEventListener('mousedown'");
    expect(src).not.toContain("addEventListener('keydown'");
    expect(src).not.toMatch(/h-\[1px\] bg-gray-100/);
  });

  it('uses no Radix context-menu trigger and synthesizes no contextmenu event', () => {
    const src = source();
    expect(src).not.toContain('@radix-ui/react-context-menu');
    expect(src).not.toContain('ContextMenuTrigger');
    renderMenu();
    expect(document.querySelectorAll('[aria-haspopup="menu"]')).toHaveLength(0);
  });
});
