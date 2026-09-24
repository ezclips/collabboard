// @vitest-environment jsdom
//
// PATCH-169 -- select a row by its number; text sizes; no surprise panel.
//
// Harness: the react-dom/client + act pattern of TableEditor.handles.test.tsx.
// Clicks are dispatched the way a browser sends them: on the element the user
// actually hits (the row-number cell, the grip button, the toolbar button), and
// assertions go through `onSave`'s JSON or the rendered DOM.
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

function click(el: Element, init: MouseEventInit = {}) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ...init })); });
}
function tick() {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button'))
    .find((el) => (el.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).not.toBeUndefined();
  return found as HTMLButtonElement;
}
function menuLabels(): string[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], [data-slot="positioned-context-menu-sub-content"]',
  )).flatMap((s) => Array.from(s.querySelectorAll<HTMLElement>('[role="menuitem"]')))
    .map((el) => (el.textContent ?? '').trim())
    .filter((l) => l.length > 0);
}

const THREE_BY_THREE = {
  rows: [['a0', 'b0', 'c0'], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
  columns: ['A', 'B', 'C'],
  cellStyles: { '1-1': { bg: '#dcfce7' } },
  caption: '',
  titleStyle: {},
};

const FOUR_ROWS = {
  rows: [['a0', 'b0', 'c0'], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2'], ['a3', 'b3', 'c3']],
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

const rowHeader = (c: HTMLElement, index: number) =>
  c.querySelectorAll('tbody tr')[index].querySelectorAll('td')[0] as HTMLElement;
const rowDataCell = (c: HTMLElement, row: number, col: number) =>
  c.querySelectorAll('tbody tr')[row].querySelectorAll('td')[col + 1] as HTMLElement;
const rowGrip = (c: HTMLElement, index: number) =>
  c.querySelector<HTMLButtonElement>(`[data-table-row-handle="${index}"]`)!;
const columnLetter = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;

const SIZE_LABELS = ['Large heading', 'Normal heading', 'Normal text', 'Small text'];
function sizeButtonsInOrder(c: HTMLElement): string[] {
  return Array.from(c.querySelectorAll('button'))
    .filter((b) => SIZE_LABELS.some((label) => (b.textContent ?? '').includes(label)))
    .map((b) => SIZE_LABELS.find((label) => (b.textContent ?? '').includes(label))!);
}

/** Highlights text inside a cell input, then fires the mouseup the editor watches. */
function highlightCellText(c: HTMLElement, row: number, col: number) {
  const input = c.querySelectorAll('tbody tr')[row].querySelectorAll('input')[col] as HTMLInputElement;
  act(() => { input.focus(); input.setSelectionRange(0, 2); });
  act(() => { input.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
}

describe('PATCH-169 -- select a row by its number', () => {
  it('clicking row number 2 selects the whole row, and a size applies to every cell', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(rowHeader(c, 1));

    // The row header and every cell of the row show the selection look.
    expect(rowHeader(c, 1).className).toContain('bg-purple-100');
    for (let col = 0; col < 3; col += 1) {
      expect(rowDataCell(c, 1, col).className, `col ${col}`).toContain('bg-purple-100/40');
    }

    // Apply Large heading to the selection through the Text style panel.
    click(c.querySelector('button[title="Text style"]')!);
    await tick();
    click(buttonContaining(c, 'Large heading'));

    const saved = savedContent(onSave, c);
    expect(saved.cellStyles['1-0']).toEqual({ size: 'h1' });
    expect(saved.cellStyles['1-1']).toEqual({ bg: '#dcfce7', size: 'h1' });
    expect(saved.cellStyles['1-2']).toEqual({ size: 'h1' });
  });

  it('Shift-click on row 3 after row 1 selects rows 1-3', async () => {
    const { c } = tableEditor(FOUR_ROWS);
    click(rowHeader(c, 0));
    click(rowHeader(c, 2), { shiftKey: true });

    for (const row of [0, 1, 2]) {
      expect(rowHeader(c, row).className, `row ${row}`).toContain('bg-purple-100');
      expect(rowDataCell(c, row, 0).className, `row ${row}`).toContain('bg-purple-100/40');
    }
    // Row 4 is untouched.
    expect(rowHeader(c, 3).className).not.toContain('bg-purple-100');
    expect(rowDataCell(c, 3, 0).className).not.toContain('bg-purple-100/40');
  });

  it('the row grip opens its menu WITHOUT selecting the row; the number stays visible', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    const numberText = () => rowHeader(c, 1).textContent ?? '';
    expect(numberText()).toContain('2');

    // Hover does not remove the number.
    act(() => {
      rowHeader(c, 1).dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: document.body }));
    });
    expect(numberText()).toContain('2');

    click(rowGrip(c, 1));
    await tick();
    expect(menuLabels()).toContain('Insert above');
    expect(rowHeader(c, 1).className).not.toContain('bg-purple-100');
    expect(rowDataCell(c, 1, 0).className).not.toContain('bg-purple-100/40');

    // Control: clicking the number itself DOES select the row.
    click(rowHeader(c, 1));
    expect(rowHeader(c, 1).className).toContain('bg-purple-100');
  });
});

describe('PATCH-169 -- no surprise Text style panel', () => {
  it('clicking a column letter over a column with text does NOT open Text style', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    click(columnLetter(c, 0));
    await tick();
    expect(c.textContent).not.toContain('Editing: Cell');
  });

  it('clicking a row number does NOT open Text style', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    click(rowHeader(c, 0));
    await tick();
    expect(c.textContent).not.toContain('Editing: Cell');
  });

  it('highlighting text in a cell input DOES open it', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    highlightCellText(c, 0, 0);
    await tick();
    expect(c.textContent).toContain('Editing: Cell');
  });
});

describe('PATCH-169 -- text sizes in the Text style panel', () => {
  it('shows the four sizes in order for a cell, and not for the Post name', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    click(rowHeader(c, 0));
    click(c.querySelector('button[title="Text style"]')!);
    await tick();
    expect(sizeButtonsInOrder(c)).toEqual(SIZE_LABELS);

    // The Post name target has no size list.
    const title = c.querySelector<HTMLInputElement>('input[placeholder="Post name"]')!;
    act(() => { title.focus(); });
    expect(c.textContent).toContain('Editing: Post name');
    expect(sizeButtonsInOrder(c)).toEqual([]);
  });

  it('Normal text removes the size key', async () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    click(rowHeader(c, 1));
    click(c.querySelector('button[title="Text style"]')!);
    await tick();
    click(buttonContaining(c, 'Large heading'));
    click(buttonContaining(c, 'Normal text'));

    const saved = savedContent(onSave, c);
    // The cells with no other style end up with no style entry at all.
    expect(saved.cellStyles['1-0']).toBeUndefined();
    expect(saved.cellStyles['1-2']).toBeUndefined();
    // The cell that had a colour keeps it, with no `size`.
    expect(saved.cellStyles['1-1']).toEqual({ bg: '#dcfce7' });
  });
});
