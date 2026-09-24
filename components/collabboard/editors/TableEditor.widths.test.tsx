// @vitest-environment jsdom
//
// PATCH-170 -- column widths: drag to resize, fit to content, distribute evenly.
//
// Harness: the react-dom/client + act pattern of TableEditor.handles.test.tsx.
// Pointer sequences are sent the way a browser sends them -- pointerdown on the
// handle, pointermove/pointerup on window -- and assertions go through `onSave`'s
// JSON or the rendered header styles.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import TableEditor from './TableEditor';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).setPointerCapture ??= () => {};
  (Element.prototype as any).releasePointerCapture ??= () => {};
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
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function tick() {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}
function surfaces(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], [data-slot="positioned-context-menu-sub-content"]',
  ));
}
function menuEls(): HTMLElement[] {
  return surfaces().flatMap((s) => Array.from(s.querySelectorAll<HTMLElement>('[role="menuitem"]')));
}
function menuLabels(): string[] {
  return menuEls().map((el) => (el.textContent ?? '').trim()).filter((l) => l.length > 0);
}
function menuItem(label: string): HTMLElement {
  const found = menuEls().find((el) => (el.textContent ?? '').trim() === label);
  expect(found).not.toBeUndefined();
  return found!;
}
function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button'))
    .find((el) => (el.textContent ?? '').trim() === text);
  expect(found, `no button "${text}"`).not.toBeUndefined();
  return found as HTMLButtonElement;
}

const THREE_BY_THREE = {
  rows: [['a0', 'b0', 'c0'], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
  columns: ['A', 'B', 'C'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

/** A one-column table whose first cell is longer than its header. */
const LONG_TEXT_GRID = {
  rows: [['a longer cell value'], ['short']],
  columns: ['A'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

/** Column C has an empty target cell, so Fill with AI has something to do. */
const FILL_GRID = {
  rows: [['a0', 'b0', ''], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
  columns: ['A', 'B', 'C'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

function tableEditor(content: object, onSave = vi.fn()) {
  const c = mount(<TableEditor isOpen onClose={vi.fn()} onSave={onSave} initialContent={JSON.stringify(content)} />);
  return { c, onSave };
}
function savedContent(onSave: ReturnType<typeof vi.fn>, container: HTMLElement) {
  act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(onSave).toHaveBeenCalledTimes(1);
  return JSON.parse(onSave.mock.calls[0][0].content);
}

const columnHeader = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;
const columnResizeHandle = (c: HTMLElement, col: number) =>
  c.querySelector<HTMLElement>(`[data-table-column-resize="${col}"]`)!;
const rowNumberCell = (c: HTMLElement, index: number) =>
  c.querySelectorAll('tbody tr')[index].querySelectorAll('td')[0] as HTMLElement;

/** PATCH-172. Menus open by RIGHT-clicking the header/row number now. */
function contextMenu(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
}
async function openRowMenu(c: HTMLElement, index: number) {
  contextMenu(rowNumberCell(c, index));
  await tick();
}
async function openColumnMenu(c: HTMLElement, col: number) {
  contextMenu(columnHeader(c, col));
  await tick();
}

/** The browser's pointer sequence for a drag: down on the handle, move/up on window. */
function pointerDrag(handle: Element, dx: number) {
  act(() => {
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: dx }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
}

describe('PATCH-170 -- an untouched table', () => {
  it('renders 100px columns and saves WITHOUT columnWidths', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    expect(columnHeader(c, 0).style.width).toBe('100px');
    expect(columnHeader(c, 1).style.width).toBe('100px');
    const saved = savedContent(onSave, c);
    expect(saved.columnWidths).toBeUndefined();
  });
});

describe('PATCH-170 -- drag to resize', () => {
  it('dragging a handle +80px sets that column to 180 and saves the rest at 100', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    pointerDrag(columnResizeHandle(c, 0), 80);
    expect(columnHeader(c, 0).style.width).toBe('180px');
    expect(columnHeader(c, 1).style.width).toBe('100px');

    const saved = savedContent(onSave, c);
    expect(saved.columnWidths).toEqual([180, 100, 100]);
  });

  it('dragging far left clamps the width to 60', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    pointerDrag(columnResizeHandle(c, 0), -500);
    const saved = savedContent(onSave, c);
    expect(saved.columnWidths).toEqual([60, 100, 100]);
  });

  it('pointerdown on the handle does not select the column', () => {
    const { c } = tableEditor(THREE_BY_THREE);
    const handle = columnResizeHandle(c, 1);
    // The browser's click sequence: down, up, click -- all on the handle.
    act(() => { handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 0 })); });
    act(() => { handle.dispatchEvent(new MouseEvent('pointerup', { bubbles: true })); });
    act(() => { handle.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(columnHeader(c, 1).className).not.toContain('bg-purple-100');

    // Control: clicking the header itself DOES select the column.
    click(columnHeader(c, 1));
    expect(columnHeader(c, 1).className).toContain('bg-purple-100');
  });
});

describe('PATCH-170 -- fit to content and keyboard', () => {
  it('double-clicking the handle fits the column to its longest content', () => {
    const { c, onSave } = tableEditor(LONG_TEXT_GRID);
    const handle = columnResizeHandle(c, 0);
    act(() => { handle.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); });
    // Longest is 'a longer cell value' (19): ceil(19 * 7.5) + 24 = 167.
    expect(columnHeader(c, 0).style.width).toBe('167px');
    expect(savedContent(onSave, c).columnWidths).toEqual([167]);
  });

  it('ArrowRight on a focused handle adds 10px', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    const handle = columnResizeHandle(c, 1);
    act(() => { handle.focus(); });
    act(() => {
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });
    expect(savedContent(onSave, c).columnWidths).toEqual([100, 110, 100]);
  });
});

describe('PATCH-170 -- the column menu', () => {
  it('shows Fit to content and Distribute columns evenly', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    await openColumnMenu(c, 1);
    expect(menuLabels()).toContain('Fit to content');
    expect(menuLabels()).toContain('Distribute columns evenly');
  });

  it('the row menu does NOT show them', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    await openRowMenu(c, 0);
    expect(menuLabels()).not.toContain('Fit to content');
    expect(menuLabels()).not.toContain('Distribute columns evenly');
    expect(menuLabels()).toContain('Duplicate');
  });

  it('Fit to content fits that column', async () => {
    const { c, onSave } = tableEditor({
      ...THREE_BY_THREE,
      rows: [['a longer cell value', 'b0', 'c0'], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
    });
    await openColumnMenu(c, 0);
    click(menuItem('Fit to content'));
    expect(savedContent(onSave, c).columnWidths).toEqual([167, 100, 100]);
  });

  it('Distribute columns evenly sets every column to the average', async () => {
    const { c, onSave } = tableEditor({ ...THREE_BY_THREE, columnWidths: [80, 120, 200] });
    await openColumnMenu(c, 0);
    click(menuItem('Distribute columns evenly'));
    // floor((80 + 120 + 200) / 3) = 133.
    expect(savedContent(onSave, c).columnWidths).toEqual([133, 133, 133]);
  });
});

describe('PATCH-170 -- widths survive structural edits', () => {
  it('inserting a column left of a sized column moves its width with it', async () => {
    const { c, onSave } = tableEditor({ ...THREE_BY_THREE, columnWidths: [100, 180, 100] });
    await openColumnMenu(c, 1);
    click(menuItem('Insert left'));
    expect(savedContent(onSave, c).columnWidths).toEqual([100, 100, 180, 100]);
  });
});

describe('PATCH-170 -- locked while AI fill suggestions are pending', () => {
  it('dragging does nothing while suggestions are pending', async () => {
    const { c } = tableEditor(FILL_GRID);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ values: [{ row: 0, value: 'suggested' }] }),
      { status: 200 },
    )));

    // Open Fill with AI for column C and generate, so the table locks.
    await openColumnMenu(c, 2);
    click(menuItem('Fill with AI…'));
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-fill-panel]')!;
    click(buttonByText(panel, 'Generate'));
    await tick();
    await tick();
    expect(c.querySelectorAll('[data-table-fill-suggestion]')).toHaveLength(1);

    pointerDrag(columnResizeHandle(c, 0), 80);
    expect(columnHeader(c, 0).style.width).toBe('100px');
  });
});
