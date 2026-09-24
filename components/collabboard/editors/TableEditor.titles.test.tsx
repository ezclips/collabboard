// @vitest-environment jsdom
//
// PATCH-172 -- column titles (double-click a header, or Rename in the menu).
//
// Harness: the react-dom/client + act pattern of TableEditor.handles.test.tsx.
// Assertions go through `onSave`'s JSON (the editor's own save path) or the
// rendered header DOM.
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
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function tick() {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
}
function key(target: HTMLElement, k: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
}
function doubleClick(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
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
const columnHeaderCell = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;
const rowNumberCell = (c: HTMLElement, index: number) =>
  c.querySelectorAll('tbody tr')[index].querySelectorAll('td')[0] as HTMLElement;
function contextMenu(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
}
async function openColumnMenu(c: HTMLElement, col: number) {
  contextMenu(columnHeaderCell(c, col));
  await tick();
}
async function openRowMenu(c: HTMLElement, index: number) {
  contextMenu(rowNumberCell(c, index));
  await tick();
}

const THREE_BY_THREE = {
  rows: [['a0', 'b0', 'c0'], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
  columns: ['A', 'B', 'C'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

const FILL_GRID = {
  rows: [['a0', 'b0', ''], ['a1', 'b1', 'c1'], ['a2', 'b2', 'c2']],
  columns: ['Item', 'Value', 'Notes'],
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
const renameInput = (c: HTMLElement) => c.querySelector<HTMLInputElement>('input[data-table-rename]');

describe('PATCH-172 -- column titles', () => {
  it('double-clicking a header and pressing Enter saves the title', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    doubleClick(columnHeaderCell(c, 1));
    const input = renameInput(c)!;
    expect(input).not.toBeNull();
    setInputValue(input, '  Oil capacity  ');
    key(input, 'Enter');

    expect(renameInput(c)).toBeNull();
    // The header shows the (trimmed) title, with the full title as its tooltip.
    expect(columnHeaderCell(c, 1).querySelector('[title="Oil capacity"]')).not.toBeNull();

    const saved = savedContent(onSave, c);
    expect(saved.columns).toEqual(['A', 'Oil capacity', 'C']);
  });

  it('the old title is selected when the edit starts, so typing replaces it', () => {
    const { c } = tableEditor(THREE_BY_THREE);
    doubleClick(columnHeaderCell(c, 1));
    const input = renameInput(c)!;
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(input.value.length).toBeGreaterThan(0);
  });

  it('Escape cancels the rename', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    doubleClick(columnHeaderCell(c, 1));
    const input = renameInput(c)!;
    setInputValue(input, 'Changed');
    key(input, 'Escape');

    expect(renameInput(c)).toBeNull();
    expect(savedContent(onSave, c).columns).toEqual(['A', 'B', 'C']);
  });

  it('an empty title cancels, keeping the old one', () => {
    const { c, onSave } = tableEditor(THREE_BY_THREE);
    doubleClick(columnHeaderCell(c, 1));
    const input = renameInput(c)!;
    setInputValue(input, '   ');
    key(input, 'Enter');

    expect(renameInput(c)).toBeNull();
    expect(savedContent(onSave, c).columns).toEqual(['A', 'B', 'C']);
  });

  it('a duplicate title shows the hint and does not save, until changed', () => {
    const { c } = tableEditor(THREE_BY_THREE);
    doubleClick(columnHeaderCell(c, 1));
    const input = renameInput(c)!;
    setInputValue(input, 'a'); // 'A' already exists, case-insensitively
    key(input, 'Enter');

    expect(c.textContent).toContain('Another column has this title');
    // Still editing; the old title is not committed.
    expect(renameInput(c)).not.toBeNull();

    // Changing it clears the hint.
    setInputValue(renameInput(c)!, 'Oil capacity');
    expect(c.textContent).not.toContain('Another column has this title');
  });

  it('Rename in the column menu starts the inline edit; the row menu has no Rename', async () => {
    const { c } = tableEditor(THREE_BY_THREE);
    await openColumnMenu(c, 1);
    expect(menuLabels()).toContain('Rename');
    click(menuItem('Rename'));
    await tick();
    expect(renameInput(c)).not.toBeNull();

    const second = tableEditor(THREE_BY_THREE);
    await openRowMenu(second.c, 0);
    expect(menuLabels()).not.toContain('Rename');
  });

  it('a renamed column is picked up by Fill with AI "Read from"', async () => {
    const { c } = tableEditor(FILL_GRID);
    // Rename Value -> Oil capacity.
    await openColumnMenu(c, 1);
    click(menuItem('Rename'));
    await tick();
    const input = renameInput(c)!;
    setInputValue(input, 'Oil capacity');
    key(input, 'Enter');

    // Open Fill with AI for the OTHER column (Notes) and read its source list.
    await openColumnMenu(c, 2);
    click(menuItem('Fill with AI…'));
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-fill-panel]')!;
    const source = panel.querySelector<HTMLSelectElement>('[data-table-fill-source]')!;
    expect(Array.from(source.options).map((option) => option.textContent)).toContain('Oil capacity');
  });
});
