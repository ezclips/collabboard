// @vitest-environment jsdom
//
// PATCH-173 -- "Fill row with AI…", the AI marker, and Undo.
//
// Harness: the react-dom/client + act pattern of TableEditor.fill.test.tsx;
// menus open by RIGHT-click (since PATCH-172). `fetch` is stubbed. Timers are
// flushed with microtasks so the 10-second Undo expiry can use fake timers.
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
  vi.useRealTimers();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
}
/** Flush microtasks, so the same tick works under real and fake timers. */
function tick() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}
function key(target: HTMLElement, k: string) {
  act(() => { target.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); });
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
function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button'))
    .find((el) => (el.textContent ?? '').trim() === text);
  expect(found, `no button "${text}"`).not.toBeUndefined();
  return found as HTMLButtonElement;
}
const rowNumberCell = (c: HTMLElement, index: number) =>
  c.querySelectorAll('tbody tr')[index].querySelectorAll('td')[0] as HTMLElement;
const columnHeaderCell = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;
function contextMenu(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
}
async function openRowMenu(c: HTMLElement, index: number) {
  contextMenu(rowNumberCell(c, index));
  await tick();
}
async function openColumnMenu(c: HTMLElement, col: number) {
  contextMenu(columnHeaderCell(c, col));
  await tick();
}

const ROW_GRID = {
  rows: [
    ['Toyota', 'Corolla', '', ''],
    ['other', 'row', 'x', 'y'],
  ],
  columns: ['Brand', 'Model', 'Oil capacity', 'Tank capacity'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

const DEFAULT_GRID = {
  rows: [['x', '', '']],
  columns: ['A', 'B', 'C'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

/** Column C has an empty target cell, for the column-fill regression case. */
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
function stubResponse(values: Array<{ row: number; value: string }>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ values }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openRowFillPanel(c: HTMLElement, rowIndex: number) {
  await openRowMenu(c, rowIndex);
  click(menuItem('Fill row with AI…'));
  await tick();
  return c.querySelector<HTMLElement>('[data-table-row-fill-panel]')!;
}
async function generate(panel: HTMLElement) {
  click(buttonByText(panel, 'Generate'));
  await tick();
  await tick();
}

async function renameColumnViaMenu(c: HTMLElement, col: number, title: string) {
  await openColumnMenu(c, col);
  click(menuItem('Rename'));
  await tick();
  const input = c.querySelector<HTMLInputElement>('input[data-table-rename]')!;
  setInputValue(input, title);
  key(input, 'Enter');
}

/** Accepts the row-fill suggestions for a small grid. */
async function acceptRowFill(c: HTMLElement) {
  const panel = await openRowFillPanel(c, 0);
  await generate(panel);
  click(buttonByText(c, 'Accept all'));
}

describe('PATCH-173 -- where the row fill lives', () => {
  it('the row menu shows "Fill row with AI…"', async () => {
    const { c } = tableEditor(ROW_GRID);
    await openRowMenu(c, 0);
    expect(menuLabels()).toContain('Fill row with AI…');
  });

  it('the column menu does NOT show it', async () => {
    const { c } = tableEditor(ROW_GRID);
    await openColumnMenu(c, 0);
    expect(menuLabels()).not.toContain('Fill row with AI…');
  });
});

describe('PATCH-173 -- what the row fill sends', () => {
  it('posts the custom preset, the row instruction and one item per empty cell', async () => {
    const { c } = tableEditor(ROW_GRID);
    const fetchMock = stubResponse([{ row: 2, value: '5.5 L' }, { row: 3, value: '50 L' }]);
    const panel = await openRowFillPanel(c, 0);
    await generate(panel);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.preset).toBe('custom');
    expect(body.detail).toContain("after 'Find:'");
    expect(body.items).toEqual([
      { row: 2, input: 'Brand: Toyota | Model: Corolla | Find: Oil capacity' },
      { row: 3, input: 'Brand: Toyota | Model: Corolla | Find: Tank capacity' },
    ]);
  });
});

describe('PATCH-173 -- reviewing and accepting a row fill', () => {
  const VALUES = [{ row: 2, value: '5.5 L' }, { row: 3, value: '50 L' }];

  it('renders suggestions in the row\'s cells; Accept all writes them and marks aiFilled', async () => {
    const { c, onSave } = tableEditor(ROW_GRID);
    stubResponse(VALUES);
    const panel = await openRowFillPanel(c, 0);
    await generate(panel);

    const suggestions = c.querySelectorAll('[data-table-fill-suggestion]');
    expect(suggestions).toHaveLength(2);
    expect(Array.from(suggestions).map((el) => el.textContent)).toEqual(['5.5 L', '50 L']);

    click(buttonByText(c, 'Accept all'));
    const saved = savedContent(onSave, c);
    expect(saved.rows[0]).toEqual(['Toyota', 'Corolla', '5.5 L', '50 L']);
    expect(saved.cellStyles['0-2']).toEqual({ aiFilled: true });
    expect(saved.cellStyles['0-3']).toEqual({ aiFilled: true });
  });

  it('Discard drops the row suggestions', async () => {
    const { c, onSave } = tableEditor(ROW_GRID);
    stubResponse(VALUES);
    const panel = await openRowFillPanel(c, 0);
    await generate(panel);
    click(buttonByText(c, 'Discard'));

    const saved = savedContent(onSave, c);
    expect(saved.rows[0]).toEqual(['Toyota', 'Corolla', '', '']);
    expect(saved.cellStyles['0-2']).toBeUndefined();
  });

  it('shows the default-title hint for A/B/C and not after renaming', async () => {
    const { c } = tableEditor(DEFAULT_GRID);
    const panel = await openRowFillPanel(c, 0);
    expect(panel.querySelector('[data-table-row-fill-title-hint]')).not.toBeNull();

    click(buttonByText(panel, 'Cancel'));
    await renameColumnViaMenu(c, 1, 'Oil capacity');
    await renameColumnViaMenu(c, 2, 'Tank capacity');

    const second = await openRowFillPanel(c, 0);
    expect(second.querySelector('[data-table-row-fill-title-hint]')).toBeNull();
  });
});

describe('PATCH-173 -- the AI marker', () => {
  it('marks accepted cells with a sparkle, and typing removes it', async () => {
    const { c, onSave } = tableEditor(ROW_GRID);
    stubResponse([{ row: 2, value: '5.5 L' }, { row: 3, value: '50 L' }]);
    await acceptRowFill(c);
    expect(c.querySelectorAll('[data-table-ai-filled]')).toHaveLength(2);

    const input = c.querySelectorAll('tbody tr')[0].querySelectorAll('input')[2] as HTMLInputElement;
    setInputValue(input, '6 L');
    expect(c.querySelectorAll('[data-table-ai-filled]')).toHaveLength(1);

    const saved = savedContent(onSave, c);
    expect(saved.rows[0][2]).toBe('6 L');
    expect(saved.cellStyles['0-2']).toBeUndefined();
    expect(saved.cellStyles['0-3']).toEqual({ aiFilled: true });
  });
});

describe('PATCH-173 -- Undo after Accept all', () => {
  it('restores the previous content', async () => {
    const { c, onSave } = tableEditor(ROW_GRID);
    stubResponse([{ row: 2, value: '5.5 L' }, { row: 3, value: '50 L' }]);
    await acceptRowFill(c);

    expect(c.querySelector('[data-table-undo-bar]')!.textContent).toContain('Filled 2 cells');
    click(buttonByText(c, 'Undo'));
    expect(c.querySelector('[data-table-undo-bar]')).toBeNull();

    const saved = savedContent(onSave, c);
    expect(saved.rows[0]).toEqual(['Toyota', 'Corolla', '', '']);
    expect(saved.cellStyles['0-2']).toBeUndefined();
  });

  it('disappears as soon as any other cell is edited', async () => {
    const { c } = tableEditor(ROW_GRID);
    stubResponse([{ row: 2, value: '5.5 L' }]);
    await acceptRowFill(c);
    expect(c.querySelector('[data-table-undo-bar]')).not.toBeNull();

    const input = c.querySelectorAll('tbody tr')[1].querySelectorAll('input')[0] as HTMLInputElement;
    setInputValue(input, 'Honda');
    expect(c.querySelector('[data-table-undo-bar]')).toBeNull();
  });

  it('disappears after ten seconds', async () => {
    vi.useFakeTimers();
    const { c } = tableEditor(ROW_GRID);
    stubResponse([{ row: 2, value: '5.5 L' }]);
    await acceptRowFill(c);
    expect(c.querySelector('[data-table-undo-bar]')).not.toBeNull();

    act(() => { vi.advanceTimersByTime(10_000); });
    expect(c.querySelector('[data-table-undo-bar]')).toBeNull();
  });
});

describe('PATCH-173 -- the column fill still sets the marker', () => {
  it('Accept all in a column fill marks the accepted cells aiFilled', async () => {
    const { c, onSave } = tableEditor(FILL_GRID);
    stubResponse([{ row: 0, value: 'Filled by column AI' }]);
    await openColumnMenu(c, 2);
    click(menuItem('Fill with AI…'));
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-fill-panel]')!;
    await generate(panel);
    click(buttonByText(c, 'Accept all'));

    const saved = savedContent(onSave, c);
    expect(saved.rows[0][2]).toBe('Filled by column AI');
    expect(saved.cellStyles['0-2']).toEqual({ aiFilled: true });
  });
});
