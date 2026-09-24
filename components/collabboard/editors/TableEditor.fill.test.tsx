// @vitest-environment jsdom
//
// PATCH-166 -- "Fill with AI…" for a table column.
//
// Harness: the react-dom/client + act pattern of TableEditor.handles.test.tsx,
// and its positioned-menu interaction model (click a menuitem button). Every
// assertion is made through `onSave`'s JSON -- the editor's own save-and-close
// path -- or through the DOM the panel and suggestion overlay actually render.
// `fetch` is stubbed; no test reaches a network.
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

const FILL_GRID = {
  rows: [
    ['Engine oil', 'synthetic 5W-30', ''],
    ['Tyre pressure', '', ''],
    ['Brakes', 'pads', 'already here'],
  ],
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

const rowNumberCell = (c: HTMLElement, index: number) =>
  c.querySelectorAll('tbody tr')[index].querySelectorAll('td')[0] as HTMLElement;
const columnHeaderCell = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;

/** PATCH-172. Menus open by RIGHT-clicking the header/row number now. */
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

/** Opens the column menu for `column` and the Fill with AI panel. */
async function openFillPanel(c: HTMLElement, column: number) {
  await openColumnMenu(c, column);
  click(menuItem('Fill with AI…'));
  await tick();
  return c.querySelector<HTMLElement>('[data-table-fill-panel]')!;
}

/** Clicks Generate and waits for the stubbed fetch to resolve. */
async function generate(panel: HTMLElement) {
  click(buttonByText(panel, 'Generate'));
  await tick();
  await tick();
}

function stubFillResponse(values: Array<{ row: number; value: string }>) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ values }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PATCH-166 -- where the action lives', () => {
  it('the column menu shows "Fill with AI…"', async () => {
    const { c } = tableEditor(FILL_GRID);
    await openColumnMenu(c, 2);
    expect(menuLabels()).toContain('Fill with AI…');
  });

  it('the row menu does NOT show "Fill with AI…"', async () => {
    const { c } = tableEditor(FILL_GRID);
    await openRowMenu(c, 0);
    expect(menuLabels()).not.toContain('Fill with AI…');
    // The row menu is intact.
    expect(menuLabels()).toContain('Duplicate');
  });
});

describe('PATCH-166 -- what is sent', () => {
  it('Generate sends exactly the empty-target items for the chosen column', async () => {
    const { c } = tableEditor(FILL_GRID);
    const fetchMock = stubFillResponse([]);
    const panel = await openFillPanel(c, 2);
    await generate(panel);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.preset).toBe('summarize');
    expect(body.items).toEqual([
      { row: 0, input: 'Item: Engine oil | Value: synthetic 5W-30' },
      { row: 1, input: 'Item: Tyre pressure' },
    ]);
  });
});

describe('PATCH-166 -- review before anything is written', () => {
  const VALUES = [
    { row: 0, value: 'Change the oil' },
    { row: 1, value: 'Check the pressure' },
  ];

  it('renders suggestions in the cells, leaves cell text alone, and locks the table', async () => {
    const { c } = tableEditor(FILL_GRID);
    stubFillResponse(VALUES);
    const panel = await openFillPanel(c, 2);
    await generate(panel);

    const suggestions = c.querySelectorAll('[data-table-fill-suggestion]');
    expect(suggestions).toHaveLength(2);
    expect(Array.from(suggestions).map((el) => el.textContent)).toEqual(['Change the oil', 'Check the pressure']);

    // The real cell text is unchanged: the target cells are still empty.
    const targetInputs = Array.from(c.querySelectorAll<HTMLInputElement>('tbody tr'))
      .map((tr) => tr.querySelectorAll('input')[2] as HTMLInputElement);
    expect(targetInputs[0].value).toBe('');
    expect(targetInputs[1].value).toBe('');
    expect(targetInputs[2].value).toBe('already here');

    // Locked: every cell input is read-only.
    expect(Array.from(c.querySelectorAll<HTMLInputElement>('td input')).every((i) => i.readOnly)).toBe(true);

    // Grips are inert: opening a row menu does nothing.
    await openRowMenu(c, 0);
    expect(surfaces()).toHaveLength(0);
  });

  it('Accept all writes the values into the target column through save-and-close', async () => {
    const { c, onSave } = tableEditor(FILL_GRID);
    stubFillResponse(VALUES);
    const panel = await openFillPanel(c, 2);
    await generate(panel);

    click(buttonByText(c, 'Accept all'));
    const saved = savedContent(onSave, c);
    expect(saved.rows[0]).toEqual(['Engine oil', 'synthetic 5W-30', 'Change the oil']);
    expect(saved.rows[1]).toEqual(['Tyre pressure', '', 'Check the pressure']);
    // A cell with no suggestion keeps its own text.
    expect(saved.rows[2]).toEqual(['Brakes', 'pads', 'already here']);
  });

  it('Discard drops them, so save-and-close contains no values', async () => {
    const { c, onSave } = tableEditor(FILL_GRID);
    stubFillResponse(VALUES);
    const panel = await openFillPanel(c, 2);
    await generate(panel);

    click(buttonByText(c, 'Discard'));
    expect(c.querySelectorAll('[data-table-fill-suggestion]')).toHaveLength(0);

    const saved = savedContent(onSave, c);
    expect(saved.rows[0][2]).toBe('');
    expect(saved.rows[1][2]).toBe('');
  });

  it('save-and-close while suggestions are pending drops them', async () => {
    const { c, onSave } = tableEditor(FILL_GRID);
    stubFillResponse(VALUES);
    const panel = await openFillPanel(c, 2);
    await generate(panel);
    expect(c.querySelectorAll('[data-table-fill-suggestion]')).toHaveLength(2);

    const saved = savedContent(onSave, c);
    expect(saved.rows[0][2]).toBe('');
    expect(saved.rows[1][2]).toBe('');
  });
});

describe('PATCH-166 -- errors', () => {
  it('a 502 shows the route error in the panel and locks nothing', async () => {
    const { c } = tableEditor(FILL_GRID);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'The provider is unavailable.' }),
      { status: 502 },
    )));
    const panel = await openFillPanel(c, 2);
    await generate(panel);

    expect(panel.textContent).toContain('The provider is unavailable.');
    // Nothing locked: no suggestions, inputs writable, grips still work.
    expect(c.querySelectorAll('[data-table-fill-suggestion]')).toHaveLength(0);
    expect(Array.from(c.querySelectorAll<HTMLInputElement>('td input')).every((i) => i.readOnly)).toBe(false);
    await openRowMenu(c, 0);
    expect(menuLabels()).toContain('Duplicate');
  });

  it("an empty answer says no suggestions came back and locks nothing", async () => {
    const { c } = tableEditor(FILL_GRID);
    stubFillResponse([]);
    const panel = await openFillPanel(c, 2);
    await generate(panel);

    expect(panel.textContent).toContain("No suggestions came back.");
    expect(c.textContent).not.toContain("AI suggestions");
    expect(Array.from(c.querySelectorAll<HTMLInputElement>("td input")).every((i) => i.readOnly)).toBe(false);
  });
});
