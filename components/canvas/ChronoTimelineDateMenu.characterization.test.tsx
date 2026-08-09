// @vitest-environment jsdom
//
// Characterization of the Timeline date-badge context menu after its
// migration onto the shared shell in components/ui/context-menu.tsx.
//
// Pre-migration, this menu was a single hand-rolled <div> positioned at raw
// {x,y} coordinates captured from the badge's onContextMenu event, driven by
// component-level state (dateMenuOpen/dateMenuPosition/activeDateContainerId)
// shared across every date badge on the timeline. Post-migration, each date
// badge owns its own Radix ContextMenu, closing the same functional gap
// (only one visibly open at a time) via Radix's own per-instance dismissal
// rather than the shared state. Action set, order, labels, callback
// arguments and editable gating must not drift.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import ChronoTimelineCanvas from './ChronoTimelineCanvas';

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
  (Element.prototype as any).scrollTo ??= () => {};
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

function containerPadlet(id: string, overrides: Record<string, unknown> = {}): Padlet {
  return {
    id,
    type: 'container',
    title: `Container ${id}`,
    created_at: '2026-01-15T00:00:00.000Z',
    metadata: { childPadletIds: [], ...overrides },
  } as unknown as Padlet;
}

function baseProps(overrides: Partial<React.ComponentProps<typeof ChronoTimelineCanvas>> = {}) {
  return {
    padlets: [],
    canvasId: 'canvas-1',
    chronoMode: 'vertical' as const,
    isEditable: true,
    onOpenContainer: vi.fn(),
    onUpdateContainerMetadata: vi.fn(),
    ...overrides,
  };
}

function dateBadge(container: HTMLElement): HTMLElement {
  const badge = container.querySelector<HTMLElement>('.cursor-context-menu');
  expect(badge, 'date badge not found').not.toBeNull();
  return badge!;
}

/**
 * Radix's DismissableLayer attaches its outside-pointerdown listener via a
 * real setTimeout(0), so tests that dismiss an already-open menu need to let
 * that macrotask flush first.
 */
function tick(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function rightClick(target: HTMLElement) {
  // A real right-click fires pointerdown/mousedown before contextmenu; Radix's
  // outside-dismissal listens for pointerdown specifically.
  target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
}

function openDateMenu(container: HTMLElement): HTMLElement {
  act(() => {
    rightClick(dateBadge(container));
  });
  const menu = document.querySelector<HTMLElement>('[role="menu"]');
  expect(menu, 'date menu did not open').not.toBeNull();
  return menu!;
}

/** Ordered inventory of the date menu's direct rendered contents. */
function inventory(menu: HTMLElement): string[] {
  return Array.from(menu.children).map((child) => {
    const el = child as HTMLElement;
    const slot = el.getAttribute('data-slot');
    if (slot === 'context-menu-separator') return '---';
    if (slot === 'context-menu-item') return (el.textContent ?? '').trim();
    if (el.tagName === 'DIV') return '[color-picker]';
    return `[unexpected:${el.tagName}]`;
  });
}

function itemByText(scope: ParentNode, text: string): HTMLElement {
  const match = Array.from((scope as HTMLElement).querySelectorAll<HTMLElement>('[role="menuitem"]'))
    .find((el) => el.textContent?.includes(text));
  expect(match, `no menuitem containing "${text}"`).toBeTruthy();
  return match!;
}

const EXPECTED_INVENTORY = [
  'Edit date label',
  'Reset to created date',
  '---',
  '[color-picker]',
  'Choose Custom Color...',
  '---',
  'Apply color to all dates',
  'Reset all date colors',
];

describe('Timeline date-badge context menu', () => {
  it('preserves the action set and order', () => {
    const menu = openDateMenu(mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')] })} />,
    ));
    expect(inventory(menu)).toEqual(EXPECTED_INVENTORY);
  });

  it('renders no destructive item (this menu has no delete action, unchanged from pre-migration)', () => {
    const menu = openDateMenu(mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')] })} />,
    ));
    const items = Array.from(menu.querySelectorAll<HTMLElement>('[data-slot="context-menu-item"]'));
    expect(items.every((el) => el.getAttribute('data-variant') !== 'destructive')).toBe(true);
  });

  it('passes the correct container id and current metadata to callbacks', () => {
    const onUpdateContainerMetadata = vi.fn();
    const c1 = containerPadlet('c1', { timelineBadgeColor: '#eab308' });
    const c2 = containerPadlet('c2', { timelineBadgeColor: '#ef4444' });
    const dom = mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [c1, c2], onUpdateContainerMetadata })} />,
    );
    const badges = dom.querySelectorAll<HTMLElement>('.cursor-context-menu');
    expect(badges).toHaveLength(2);

    // Right-click the SECOND badge; every callback must target c2, not c1.
    act(() => {
      badges[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    });
    const menu = document.querySelector<HTMLElement>('[role="menu"]')!;
    act(() => {
      itemByText(menu, 'Reset to created date').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onUpdateContainerMetadata).toHaveBeenCalledWith('c2', { timelineLabel: null });

    onUpdateContainerMetadata.mockClear();
    const menu2 = openDateMenu(dom);
    act(() => {
      itemByText(menu2, 'Apply color to all dates').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // "Apply to all" reads the RIGHT-CLICKED badge's own current color and
    // propagates it to every container -- must use c1's color, not c2's,
    // since openDateMenu() re-right-clicks the first matching badge.
    expect(onUpdateContainerMetadata).toHaveBeenCalledWith('c1', { timelineBadgeColor: '#eab308' });
    expect(onUpdateContainerMetadata).toHaveBeenCalledWith('c2', { timelineBadgeColor: '#eab308' });
  });

  it('opens the "Edit date label" dialog pre-filled with the right-clicked container label', () => {
    const c1 = containerPadlet('c1', { timelineLabel: 'Launch day' });
    const dom = mount(<ChronoTimelineCanvas {...baseProps({ padlets: [c1] })} />);
    const menu = openDateMenu(dom);
    act(() => {
      itemByText(menu, 'Edit date label').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    const input = dom.ownerDocument.querySelector<HTMLInputElement>('input[placeholder="Enter date label"]')
      ?? document.querySelector<HTMLInputElement>('input[placeholder="Enter date label"]');
    expect(input?.value).toBe('Launch day');
  });

  it('color swatches carry no selected-state styling, matching the pre-migration markup', () => {
    const menu = openDateMenu(mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1', { timelineBadgeColor: '#3b82f6' })] })} />,
    ));
    const swatches = Array.from(menu.querySelectorAll<HTMLElement>('button[title="#3b82f6"]'));
    expect(swatches.length).toBeGreaterThan(0);
    for (const swatch of swatches) {
      expect(swatch.className).not.toContain('ring-1');
      expect(swatch.className).toContain('border-gray-300');
    }
  });

  it('toggles the custom color picker without closing the menu, and resets on next open', () => {
    const dom = mount(<ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')] })} />);
    const menu = openDateMenu(dom);
    expect(menu.textContent).not.toMatch(/Hex|Opacity/i);
    act(() => {
      itemByText(menu, 'Choose Custom Color...').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    // Menu must still be open (custom color picker doesn't close it).
    expect(document.querySelector('[role="menu"]')).not.toBeNull();

    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[role="menu"]')).toBeNull();

    const reopened = openDateMenu(dom);
    expect(reopened.querySelector('[data-slot="context-menu-swatch-row"], .rounded-lg.shadow-2xl')).toBeNull();
  });

  it('does not open a menu, and leaves the native context menu unblocked, when not editable', () => {
    const dom = mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')], isEditable: false })} />,
    );
    const badge = dateBadge(dom);
    let defaultPrevented: boolean | null = null;
    act(() => {
      const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 });
      badge.dispatchEvent(event);
      defaultPrevented = event.defaultPrevented;
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(defaultPrevented).toBe(false);
  });

  it('Escape closes the menu', () => {
    const dom = mount(<ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')] })} />);
    openDateMenu(dom);
    act(() => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('outside interaction closes the menu', async () => {
    const dom = mount(<ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')] })} />);
    openDateMenu(dom);
    await act(async () => { await tick(); });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });

  it('opening a second badge\'s menu closes the first (only one open at a time, preserved)', async () => {
    const dom = mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1'), containerPadlet('c2')] })} />,
    );
    const badges = dom.querySelectorAll<HTMLElement>('.cursor-context-menu');
    act(() => {
      rightClick(badges[0]);
    });
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
    await act(async () => { await tick(); });
    act(() => {
      rightClick(badges[1]);
    });
    expect(document.querySelectorAll('[role="menu"]')).toHaveLength(1);
  });

  it('uses the shared ContextMenuContent primitive', () => {
    const menu = openDateMenu(mount(
      <ChronoTimelineCanvas {...baseProps({ padlets: [containerPadlet('c1')] })} />,
    ));
    expect(menu.getAttribute('data-slot')).toBe('context-menu-content');
  });

  it('imports the shared shell and defines no hand-rolled date-menu wrapper', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/canvas/ChronoTimelineCanvas.tsx'),
      'utf8',
    );
    expect(source).toContain("from '@/components/ui/context-menu'");
    expect(source).not.toMatch(/dateMenuOpen|dateMenuPosition|dateMenuRef/);
  });
});
