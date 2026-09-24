// @vitest-environment jsdom
//
// PATCH-174 -- sort by column, find & replace, a summary row.
//
// Harness: the react-dom/client + act pattern of TableEditor.rowfill.test.tsx;
// menus open by RIGHT-click (since PATCH-172). Assertions go through `onSave`'s
// JSON or the rendered DOM.
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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function tick() {
  return act(async () => { await new Promise((resolve) => setTimeout(resolve, 25)); });
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
function menuItem(label: string): HTMLElement {
  const found = menuEls().find((el) => (el.textContent ?? '').trim() === label);
  expect(found, `no menuitem "${label}"`).not.toBeUndefined();
  return found!;
}
function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button'))
    .find((el) => (el.textContent ?? '').trim() === text);
  expect(found, `no button "${text}"`).not.toBeUndefined();
  return found as HTMLButtonElement;
}
const columnHeaderCell = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;
function contextMenu(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
}
async function openColumnMenu(c: HTMLElement, col: number) {
  contextMenu(columnHeaderCell(c, col));
  await tick();
}
/** Opens the Summary submenu by hovering its trigger. */
async function openSummarySubmenu() {
  const trigger = menuItem('Summary');
  act(() => {
    trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }));
  });
  await tick();
}

const SORT_GRID = {
  rows: [['10 L', 'ten'], ['9 L', 'nine'], ['', 'empty'], ['2 L', 'two']],
  columns: ['Volume', 'Label'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

const FIND_GRID = {
  rows: [['cat', 'Cat'], ['dog', 'concat']],
  columns: ['A', 'B'],
  cellStyles: { '0-0': { aiFilled: true } },
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

describe('PATCH-174 -- sort by a column', () => {
  it('Sort A → Z orders numerically, empties last', async () => {
    const { c, onSave } = tableEditor(SORT_GRID);
    await openColumnMenu(c, 0);
    click(menuItem('Sort A → Z'));
    expect(savedContent(onSave, c).rows).toEqual([
      ['2 L', 'two'], ['9 L', 'nine'], ['10 L', 'ten'], ['', 'empty'],
    ]);
  });

  it('Sort Z → A reverses, empties STILL last', async () => {
    const { c, onSave } = tableEditor(SORT_GRID);
    await openColumnMenu(c, 0);
    click(menuItem('Sort Z → A'));
    expect(savedContent(onSave, c).rows).toEqual([
      ['10 L', 'ten'], ['9 L', 'nine'], ['2 L', 'two'], ['', 'empty'],
    ]);
  });

  it('offers an Undo, cleared by any other change', async () => {
    const { c } = tableEditor(SORT_GRID);
    await openColumnMenu(c, 0);
    click(menuItem('Sort A → Z'));
    expect(c.querySelector('[data-table-undo-bar]')!.textContent).toContain('Sorted by Volume');

    // A hand edit clears it.
    const input = c.querySelectorAll('tbody tr')[0].querySelectorAll('input')[1] as HTMLInputElement;
    setInputValue(input, 'x');
    expect(c.querySelector('[data-table-undo-bar]')).toBeNull();
  });
});

describe('PATCH-174 -- the column summary', () => {
  it('Summary ▸ Sum shows the footer and saves columnSummaries', async () => {
    const { c, onSave } = tableEditor(SORT_GRID);
    await openColumnMenu(c, 0);
    await openSummarySubmenu();
    click(menuItem('Sum'));

    const footer = c.querySelector('[data-table-footer]')!;
    expect(footer.textContent).toContain('Sum 21 L');

    const saved = savedContent(onSave, c);
    expect(saved.columnSummaries).toEqual(['sum', null]);
  });

  it('None removes the summary and the key', async () => {
    const { c, onSave } = tableEditor({ ...SORT_GRID, columnSummaries: ['count', null] });
    // A summary already shows.
    expect(c.querySelector('[data-table-footer]')!.textContent).toContain('Count 3');

    await openColumnMenu(c, 0);
    await openSummarySubmenu();
    click(menuItem('None'));
    expect(c.querySelector('[data-table-footer]')).toBeNull();

    expect(savedContent(onSave, c).columnSummaries).toBeUndefined();
  });

  it('a table with no summaries saves without the key and shows no footer', () => {
    const { c, onSave } = tableEditor(SORT_GRID);
    expect(c.querySelector('[data-table-footer]')).toBeNull();
    expect(savedContent(onSave, c).columnSummaries).toBeUndefined();
  });
});

describe('PATCH-174 -- find & replace', () => {
  it('Ctrl+F opens the panel, which highlights matches and counts them', async () => {
    const { c } = tableEditor(FIND_GRID);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-find-panel]')!;
    expect(panel).not.toBeNull();

    setInputValue(panel.querySelector('[data-table-find-input]')!, 'cat');
    await tick();
    expect(panel.textContent).toContain('3 cells match');
    expect(c.querySelectorAll('[data-table-find-match]')).toHaveLength(3);
  });

  it('Replace all changes the cells, shows the message, and Undo restores', async () => {
    const { c, onSave } = tableEditor(FIND_GRID);
    // Open Find: Ctrl+F reaches it from either toolbar mode.
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-find-panel]')!;
    setInputValue(panel.querySelector('[data-table-find-input]')!, 'cat');
    setInputValue(panel.querySelector('[data-table-replace-input]')!, 'X');
    await tick();
    click(buttonByText(panel, 'Replace all'));

    expect(panel.textContent).toContain('Replaced in 3 cells');
    expect(c.querySelector('[data-table-undo-bar]')!.textContent).toContain('Replaced in 3 cells');

    // Undo restores the previous text.
    click(buttonByText(c, 'Undo'));
    const restored = savedContent(onSave, c);
    expect(restored.rows).toEqual([['cat', 'Cat'], ['dog', 'concat']]);
    expect(restored.cellStyles['0-0']).toEqual({ aiFilled: true });
  });

  it('the Find toolbar tool opens the panel from inside mode', async () => {
    const { c } = tableEditor(FIND_GRID);
    // Switch the toolbar to its inside mode, then click Find.
    click(c.querySelector('button[title="Switch to Cell Editing"]')!);
    await tick();
    click(c.querySelector('button[title="Find"]')!);
    await tick();
    expect(c.querySelector('[data-table-find-panel]')).not.toBeNull();
  });

  it('an empty Find highlights nothing and disables Replace all', async () => {
    const { c } = tableEditor(FIND_GRID);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }));
    });
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-find-panel]')!;
    expect(c.querySelectorAll('[data-table-find-match]')).toHaveLength(0);
    expect(buttonByText(panel, 'Replace all').disabled).toBe(true);
  });
});
