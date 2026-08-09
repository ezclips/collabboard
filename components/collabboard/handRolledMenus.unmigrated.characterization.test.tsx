// @vitest-environment jsdom
//
// Characterization + hard-stop documentation for the three hand-rolled
// context menus that PATCH 4 deliberately did NOT migrate onto the shared
// shell in components/ui/context-menu.tsx:
//
//   - components/collabboard/menus/LineContextMenu.tsx
//   - components/collabboard/menus/TableCellContextMenu.tsx
//   - components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx
//
// All three are opened via externally-computed, raw {x,y} screen coordinates
// captured from a native contextmenu handler that lives in a DIFFERENT
// component/file than the menu itself (SimpleLineRenderer for lines, a table
// cell's own onContextMenu in TableEditor, and the Freeform canvas
// background in CanvasClient/FreeformPadletCards). None of them wrap a real
// trigger element the shared Radix-based shell could attach to; adopting it
// would require either a synthetic right-click on a hidden fake trigger, or
// restructuring the owning host component -- both explicitly forbidden by
// this patch's brief. See the PATCH 4 report for the full rationale.
//
// These tests freeze each menu's CURRENT (unmigrated) behavior so any future
// accidental edit to these files is caught, and prove they still use their
// original hand-rolled raw-div/button markup, not the shared shell.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasLine } from '@/types/collabboard';
import { LineContextMenu } from './menus/LineContextMenu';
import { TableCellContextMenu } from './menus/TableCellContextMenu';
import FreeformCanvasBoardMenu, { FREEFORM_BOARD_TOOL_ITEMS } from './canvas/ui/FreeformCanvasBoardMenu';

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

function buttonLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => b.textContent?.trim() ?? '');
}

/** MenuItem-style buttons in TableCellContextMenu bake their shortcut text
 *  into the same button; this extracts just the label span's own text. */
function menuItemLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button')).map((b) => {
    const labelSpan = b.querySelector('span.flex.items-center.gap-2');
    return (labelSpan?.textContent ?? b.textContent ?? '').trim();
  });
}

/** React 17+ synthesizes onMouseEnter/onMouseLeave from native mouseover/mouseout. */
function hover(target: HTMLElement) {
  target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }));
}

function line(overrides: Partial<CanvasLine> = {}): CanvasLine {
  return { id: 'line-1', start_arrow: false, end_arrow: false, color: '#3b82f6', ...overrides } as CanvasLine;
}

// ── LineContextMenu ──────────────────────────────────────────────────────
describe('LineContextMenu (unmigrated -- hard stop)', () => {
  it('preserves its action set and order', () => {
    const dom = mount(
      <LineContextMenu isOpen position={{ x: 40, y: 60 }} line={line()} onClose={vi.fn()} />,
    );
    expect(buttonLabels(dom)).toEqual([
      'Cut',
      'Duplicate',
      'Delete',
      'Add Start Arrow',
      'Add End Arrow',
      'Bring to Front',
      'Send to Back',
      // 10 color-preset swatch buttons carry no text.
      '', '', '', '', '', '', '', '', '', '',
      'Choose Custom Color...',
    ]);
  });

  it('flips arrow-toggle labels from the line\'s current state', () => {
    const dom = mount(
      <LineContextMenu isOpen position={{ x: 0, y: 0 }} line={line({ start_arrow: true, end_arrow: true })} onClose={vi.fn()} />,
    );
    expect(buttonLabels(dom)).toContain('Remove Start Arrow');
    expect(buttonLabels(dom)).toContain('Remove End Arrow');
  });

  it('renders at the exact requested screen coordinates', () => {
    const dom = mount(
      <LineContextMenu isOpen position={{ x: 123, y: 456 }} line={line()} onClose={vi.fn()} />,
    );
    const menu = dom.firstElementChild as HTMLElement;
    expect(menu.style.left).toBe('123px');
    expect(menu.style.top).toBe('456px');
  });

  it('highlights the swatch matching the line\'s current color', () => {
    const dom = mount(
      <LineContextMenu isOpen position={{ x: 0, y: 0 }} line={line({ color: '#ef4444' })} onClose={vi.fn()} />,
    );
    const selected = dom.querySelector('button[title="#ef4444"]')!;
    const unselected = dom.querySelector('button[title="#3b82f6"]')!;
    expect(selected.className).toContain('ring-1');
    expect(unselected.className).not.toContain('ring-1');
  });

  it('invokes the matching callback and closes on action click', () => {
    const onDelete = vi.fn();
    const onClose = vi.fn();
    const dom = mount(
      <LineContextMenu isOpen position={{ x: 0, y: 0 }} line={line()} onClose={onClose} onDelete={onDelete} />,
    );
    act(() => {
      Array.from(dom.querySelectorAll('button')).find((b) => b.textContent === 'Delete')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed or when there is no line', () => {
    const dom1 = mount(<LineContextMenu isOpen={false} position={{ x: 0, y: 0 }} line={line()} onClose={vi.fn()} />);
    expect(dom1.firstChild).toBeNull();
    const dom2 = mount(<LineContextMenu isOpen position={{ x: 0, y: 0 }} line={null} onClose={vi.fn()} />);
    expect(dom2.firstChild).toBeNull();
  });

  it('remains hand-rolled: no shared-shell import, no trigger-based Radix usage', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/LineContextMenu.tsx'),
      'utf8',
    );
    expect(source).not.toContain("from '@/components/ui/context-menu'");
    expect(source).toMatch(/isOpen:\s*boolean/);
    expect(source).toMatch(/position:\s*\{\s*x:\s*number;\s*y:\s*number\s*\}/);
  });
});

// ── TableCellContextMenu ─────────────────────────────────────────────────
describe('TableCellContextMenu (unmigrated -- hard stop)', () => {
  it('preserves its action set and order', () => {
    const dom = mount(
      <TableCellContextMenu isOpen position={{ x: 0, y: 0 }} onClose={vi.fn()} />,
    );
    expect(menuItemLabels(dom)).toEqual([
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
    ]);
    // Shortcuts remain attached, just rendered in the same button as the label.
    const cut = Array.from(dom.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Cut'))!;
    expect(cut.textContent).toBe('CutCtrl+X');
  });

  it('renders destructive styling on Delete Row / Delete Column only', () => {
    const dom = mount(<TableCellContextMenu isOpen position={{ x: 0, y: 0 }} onClose={vi.fn()} />);
    const buttons = Array.from(dom.querySelectorAll('button'));
    const destructive = buttons.filter((b) => b.className.includes('text-red-600'));
    expect(destructive.map((b) => b.textContent?.trim())).toEqual(['Delete Row', 'Delete Column']);
  });

  it('renders at the exact requested screen coordinates', () => {
    const dom = mount(<TableCellContextMenu isOpen position={{ x: 77, y: 88 }} onClose={vi.fn()} />);
    const menu = dom.firstElementChild as HTMLElement;
    expect(menu.style.left).toBe('77px');
    expect(menu.style.top).toBe('88px');
  });

  it('opens the alignment submenu on hover, with default-state checkmarks', () => {
    const dom = mount(<TableCellContextMenu isOpen position={{ x: 0, y: 0 }} onClose={vi.fn()} />);
    const trigger = Array.from(dom.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Change Alignment'))!.parentElement!;
    expect(menuItemLabels(dom)).not.toContain('Left');
    act(() => {
      hover(trigger);
    });
    expect(menuItemLabels(dom)).toEqual(
      expect.arrayContaining(['Left', 'Center', 'Right', 'Top', 'Middle', 'Bottom']),
    );
    const left = Array.from(dom.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Left')!;
    expect(left.querySelector('svg')).not.toBeNull(); // checked by default (no currentAlign set)
  });

  it('invokes onAlignChange with the clicked alignment and closes', () => {
    const onAlignChange = vi.fn();
    const onClose = vi.fn();
    const dom = mount(
      <TableCellContextMenu isOpen position={{ x: 0, y: 0 }} onClose={onClose} onAlignChange={onAlignChange} currentVerticalAlign="middle" />,
    );
    const trigger = Array.from(dom.querySelectorAll('button'))
      .find((b) => b.textContent?.includes('Change Alignment'))!.parentElement!;
    act(() => { hover(trigger); });
    act(() => {
      Array.from(dom.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Right')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onAlignChange).toHaveBeenCalledWith('right', 'middle');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when closed', () => {
    const dom = mount(<TableCellContextMenu isOpen={false} position={{ x: 0, y: 0 }} onClose={vi.fn()} />);
    expect(dom.firstChild).toBeNull();
  });

  it('remains hand-rolled: no shared-shell import, raw isOpen/position contract', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/menus/TableCellContextMenu.tsx'),
      'utf8',
    );
    expect(source).not.toContain("from '@/components/ui/context-menu'");
    expect(source).toMatch(/isOpen:\s*boolean/);
    expect(source).toMatch(/position:\s*\{\s*x:\s*number;\s*y:\s*number\s*\}/);
  });
});

// ── FreeformCanvasBoardMenu ──────────────────────────────────────────────
describe('FreeformCanvasBoardMenu (unmigrated -- hard stop)', () => {
  function renderMenu(overrides: Partial<React.ComponentProps<typeof FreeformCanvasBoardMenu>> = {}) {
    return mount(
      <FreeformCanvasBoardMenu
        x={10}
        y={20}
        isEditable
        showGraphLine
        canPaste
        canUndoPaste
        showDotGrid={false}
        onClose={vi.fn()}
        onPaste={vi.fn()}
        onUndo={vi.fn()}
        onSelectAll={vi.fn()}
        onToolAction={vi.fn()}
        onOpenBackgroundEditor={vi.fn()}
        onToggleDotGrid={vi.fn()}
        {...overrides}
      />,
    );
  }

  it('preserves its action set and order, including every tool item', () => {
    const dom = renderMenu();
    expect(buttonLabels(dom)).toEqual([
      'Paste',
      'Undo',
      'Select All',
      ...FREEFORM_BOARD_TOOL_ITEMS.map((item) => item.label),
      'Change Board Background...',
      'Show Dot Grid',
    ]);
  });

  it('hides the New Graph Line tool when showGraphLine is false', () => {
    const dom = renderMenu({ showGraphLine: false });
    expect(buttonLabels(dom)).not.toContain('New Graph Line');
  });

  it('disables Paste/Undo/tools/background editor when not editable, but Select All and Show Dot Grid stay enabled', () => {
    const dom = renderMenu({ isEditable: false });
    const byLabel = (label: string) =>
      Array.from(dom.querySelectorAll('button')).find((b) => b.textContent?.trim() === label)!;
    expect(byLabel('Paste').disabled).toBe(true);
    expect(byLabel('Undo').disabled).toBe(true);
    expect(byLabel('New Note').disabled).toBe(true);
    expect(byLabel('Change Board Background...').disabled).toBe(true);
    expect(byLabel('Select All').disabled).toBe(false);
    expect(byLabel('Show Dot Grid').disabled).toBe(false);
  });

  it('renders the requested x/y position when it fits the viewport', () => {
    const dom = renderMenu({ x: 15, y: 25 });
    const menu = dom.firstElementChild as HTMLElement;
    expect(menu.style.left).toBe('15px');
    expect(menu.style.top).toBe('25px');
  });

  it('shows a checkmark on "Show Dot Grid" only when showDotGrid is true', () => {
    const withoutCheck = renderMenu({ showDotGrid: false });
    const dotGridBtn = () =>
      Array.from(withoutCheck.querySelectorAll('button')).find((b) => b.textContent?.includes('Show Dot Grid'))!;
    expect(dotGridBtn().querySelector('svg')).toBeNull();

    const withCheck = renderMenu({ showDotGrid: true });
    const dotGridBtn2 = Array.from(withCheck.querySelectorAll('button')).find((b) => b.textContent?.includes('Show Dot Grid'))!;
    expect(dotGridBtn2.querySelector('svg')).not.toBeNull();
  });

  it('invokes onToolAction with the tool type and does NOT auto-close (matches current behavior)', () => {
    const onToolAction = vi.fn();
    const onClose = vi.fn();
    const dom = renderMenu({ onToolAction, onClose });
    act(() => {
      Array.from(dom.querySelectorAll('button')).find((b) => b.textContent === 'New Table')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onToolAction).toHaveBeenCalledWith('table');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('"Change Board Background..." both opens the editor and closes the menu', () => {
    const onOpenBackgroundEditor = vi.fn();
    const onClose = vi.fn();
    const dom = renderMenu({ onOpenBackgroundEditor, onClose });
    act(() => {
      Array.from(dom.querySelectorAll('button')).find((b) => b.textContent === 'Change Board Background...')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onOpenBackgroundEditor).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on outside pointerdown and on Escape', () => {
    const onCloseOutside = vi.fn();
    renderMenu({ onClose: onCloseOutside });
    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    });
    expect(onCloseOutside).toHaveBeenCalledTimes(1);

    const onCloseEscape = vi.fn();
    renderMenu({ onClose: onCloseEscape });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCloseEscape).toHaveBeenCalledTimes(1);
  });

  it('remains hand-rolled: no shared-shell import, raw x/y contract with no isOpen flag', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx'),
      'utf8',
    );
    expect(source).not.toContain("from '@/components/ui/context-menu'");
    expect(source).toMatch(/x:\s*number;/);
    expect(source).toMatch(/y:\s*number;/);
  });
});
