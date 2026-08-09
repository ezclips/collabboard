// @vitest-environment jsdom
//
// Characterization + hard-stop documentation for the one hand-rolled context
// menu still not migrated onto the shared shell in
// components/ui/context-menu.tsx:
//
//   - components/collabboard/canvas/ui/FreeformCanvasBoardMenu.tsx
//
// It is opened via externally-computed, raw {x,y} screen coordinates captured
// from a native contextmenu handler on the Freeform canvas background, which
// lives in CanvasClient/FreeformPadletCards rather than in the menu itself.
// See the PATCH 4 report for the full rationale.
//
// LineContextMenu and TableCellContextMenu were the other two members of this
// group. PATCH 4B added the positioned shared primitive that removed the
// blocker; PATCH 4C migrated the line menu and PATCH 4D the table cell menu.
// Their deferral assertions here are therefore obsolete -- keeping them would
// assert the opposite of the shipped behavior -- and their far richer coverage
// now lives in dedicated suites rather than being duplicated here:
//
//   - components/collabboard/lineContextMenu.characterization.test.tsx
//   - components/collabboard/tableCellContextMenu.characterization.test.tsx
//
// These tests freeze the remaining menu's CURRENT (unmigrated) behavior so any
// future accidental edit is caught, and prove it still uses its original
// hand-rolled raw-div/button markup, not the shared shell.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
