// @vitest-environment jsdom
//
// PATCH-168 -- "Ask AI…" on the selected table cells.
//
// Harness: the react-dom/client + act pattern of TableEditor.fill.test.tsx, and
// its positioned-menu interaction model (right-click a cell, click a menuitem).
// Assertions are made through the DOM the panel renders or through `onSave`'s
// JSON -- the editor's own save-and-close path. `fetch` is stubbed; no test
// reaches a network.
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

const ASK_GRID = {
  rows: [
    ['Engine oil', 'synthetic 5W-30', ''],
    ['Tyre pressure', '32 psi', ''],
    ['Brakes', 'pads', 'already here'],
  ],
  columns: ['Item', 'Value', 'Notes'],
  cellStyles: { '1-1': { bg: '#dcfce7' } },
  caption: '',
  titleStyle: {},
};

function tableEditor(content: object, onSave = vi.fn(), boardId?: string) {
  const c = mount(<TableEditor isOpen onClose={vi.fn()} onSave={onSave} initialContent={JSON.stringify(content)} boardId={boardId} />);
  return { c, onSave };
}

function savedContent(onSave: ReturnType<typeof vi.fn>, container: HTMLElement) {
  act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(onSave).toHaveBeenCalledTimes(1);
  return JSON.parse(onSave.mock.calls[0][0].content);
}

const cellAt = (c: HTMLElement, row: number, col: number) =>
  c.querySelectorAll('tbody tr')[row].querySelectorAll('td')[col + 1]; // td[0] is the row-number cell
const columnHeaderCell = (c: HTMLElement, col: number) =>
  c.querySelectorAll('thead th')[col + 1] as HTMLElement;

/** PATCH-172. The column menu opens by RIGHT-clicking the column header now. */
function contextMenu(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); });
}
async function openColumnMenu(c: HTMLElement, col: number) {
  contextMenu(columnHeaderCell(c, col));
  await tick();
}

/** Drags a rectangular selection, the way the editor's own mouse handlers do. */
function selectRange(c: HTMLElement, startRow: number, startCol: number, endRow: number, endCol: number) {
  act(() => {
    cellAt(c, startRow, startCol).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  });
  act(() => {
    // React synthesizes onMouseEnter from native mouseover.
    cellAt(c, endRow, endCol).dispatchEvent(
      new MouseEvent('mouseover', { bubbles: true, cancelable: true, relatedTarget: document.body }),
    );
  });
  act(() => { window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
}

/** Right-clicks a cell and chooses Ask AI…, returning the panel. */
async function openAskAI(c: HTMLElement, row: number, col: number) {
  act(() => {
    cellAt(c, row, col).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
  });
  await tick();
  click(menuItem('Ask AI…'));
  await tick();
  return c.querySelector<HTMLElement>('[data-table-ask-ai-panel]')!;
}

async function choose(panel: HTMLElement, label: string) {
  click(buttonByText(panel, label));
  await tick();
  await tick();
}

function stubTextResponse(text: string) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ text }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PATCH-168 -- where the action lives', () => {
  it('the right-click menu shows "Ask AI…" first', async () => {
    const { c } = tableEditor(ASK_GRID);
    act(() => {
      cellAt(c, 0, 0).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await tick();
    expect(menuLabels()[0]).toBe('Ask AI…');
    // The rest of the menu is intact, in its PATCH-167 wording.
    expect(menuLabels()).toContain('Insert row above');
    expect(menuLabels()).toContain('Align');
  });

  it('choosing it opens the panel with the selected-cell count', async () => {
    const { c } = tableEditor(ASK_GRID);
    selectRange(c, 0, 0, 1, 2);
    const panel = await openAskAI(c, 0, 0);
    expect(panel.textContent).toContain('6 cells selected');
  });

  it('a REAL right-click (mousedown on the cell text box first) keeps a multi-cell selection', async () => {
    const { c } = tableEditor(ASK_GRID);
    selectRange(c, 0, 0, 1, 2);
    const input = cellAt(c, 1, 1).querySelector('input')!;
    act(() => {
      input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2 }));
      input.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await tick();
    click(menuItem('Ask AI…'));
    await tick();
    const panel = c.querySelector<HTMLElement>('[data-table-ask-ai-panel]')!;
    expect(panel.textContent).toContain('6 cells selected');
  });
});

describe('PATCH-168 -- what is sent', () => {
  it('Summarize posts the custom action, the selection text and the Edit role', async () => {
    const { c } = tableEditor(ASK_GRID);
    selectRange(c, 0, 0, 1, 2);
    const fetchMock = stubTextResponse('A summary.');
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      action: 'custom',
      selectedText: [
        'Row 1: Item: Engine oil | Value: synthetic 5W-30',
        'Row 2: Item: Tyre pressure | Value: 32 psi',
      ].join('\n'),
      instruction: 'Summarize these table cells in a few sentences.',
      purpose: 'edit',
    });
  });
});

describe('PATCH-168 -- review before anything is written', () => {
  it('renders the answer as plain text, never HTML', async () => {
    const { c } = tableEditor(ASK_GRID);
    stubTextResponse('<b>x</b>');
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Explain');

    const result = c.querySelector<HTMLElement>('[data-table-ask-ai-result]')!;
    expect(result.textContent).toBe('<b>x</b>');
    expect(result.querySelector('b')).toBeNull();
  });

  it('Insert into cell writes the answer to the active cell, collapsing newlines and keeping styles', async () => {
    const { c, onSave } = tableEditor(ASK_GRID);
    stubTextResponse('line one\nline two');
    // Cell (1,1) already has text and a background.
    const panel = await openAskAI(c, 1, 1);
    await choose(panel, 'Summarize');

    // The active cell has text, so the action is a replace.
    const insert = buttonByText(panel, 'Replace cell text');
    click(insert);

    const saved = savedContent(onSave, c);
    expect(saved.rows[1][1]).toBe('line one line two');
    expect(saved.cellStyles['1-1']).toEqual({ bg: '#dcfce7' });
  });

  it('Copy writes the answer to the clipboard and shows Copied', async () => {
    const { c } = tableEditor(ASK_GRID);
    stubTextResponse('copy me');
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');

    click(buttonByText(panel, 'Copy'));
    await tick();
    expect(writeText).toHaveBeenCalledWith('copy me');
    expect(buttonByText(panel, 'Copied')).toBeTruthy();
  });

  it('Ask again returns to the four action buttons', async () => {
    const { c } = tableEditor(ASK_GRID);
    stubTextResponse('answer');
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');
    expect(c.querySelector('[data-table-ask-ai-result]')).not.toBeNull();

    click(buttonByText(panel, 'Ask again'));
    expect(c.querySelector('[data-table-ask-ai-result]')).toBeNull();
    expect(buttonByText(panel, 'Summarize')).toBeTruthy();
  });
});

describe('PATCH-168 -- errors and empty selections', () => {
  it('a 502 shows the route error', async () => {
    const { c } = tableEditor(ASK_GRID);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'The provider is unavailable.' }),
      { status: 502 },
    )));
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');
    expect(panel.textContent).toContain('The provider is unavailable.');
  });

  it('an empty selection shows the empty message and sends nothing', async () => {
    const grid = {
      rows: [['', ''], ['has text', '']],
      columns: ['A', 'B'],
      cellStyles: {},
      caption: '',
      titleStyle: {},
    };
    const { c } = tableEditor(grid);
    const fetchMock = stubTextResponse('should not be sent');
    const panel = await openAskAI(c, 0, 0);

    expect(panel.textContent).toContain('The selected cells are empty.');
    expect(panel.querySelectorAll('button')).toHaveLength(1); // the close button only
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PATCH-168 -- the two AI panels are mutually exclusive', () => {
  it('opening Ask AI closes an open Fill with AI panel', async () => {
    const { c } = tableEditor(ASK_GRID);
    await openColumnMenu(c, 2);
    click(menuItem('Fill with AI…'));
    await tick();
    expect(c.querySelector('[data-table-fill-panel]')).not.toBeNull();

    await openAskAI(c, 0, 0);
    expect(c.querySelector('[data-table-fill-panel]')).toBeNull();
    expect(c.querySelector('[data-table-ask-ai-panel]')).not.toBeNull();
  });

  it('opening Fill with AI closes an open Ask AI panel', async () => {
    const { c } = tableEditor(ASK_GRID);
    await openAskAI(c, 0, 0);
    expect(c.querySelector('[data-table-ask-ai-panel]')).not.toBeNull();

    await openColumnMenu(c, 2);
    click(menuItem('Fill with AI…'));
    await tick();
    expect(c.querySelector('[data-table-ask-ai-panel]')).toBeNull();
    expect(c.querySelector('[data-table-fill-panel]')).not.toBeNull();
  });
});

describe('PATCH-188 -- the board pays', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const PLAN_LIMIT = {
    error: "The Free plan's AI credits for this month are used up.",
    code: 'plan_limit_credits',
  };

  it('sends boardId when the editor has one', async () => {
    const { c } = tableEditor(ASK_GRID, vi.fn(), BOARD);
    selectRange(c, 0, 0, 1, 2);
    const fetchMock = stubTextResponse('A summary.');
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).boardId).toBe(BOARD);
  });

  it('a 402 plan_limit_credits shows the message and the See plans link', async () => {
    const { c } = tableEditor(ASK_GRID, vi.fn(), BOARD);
    selectRange(c, 0, 0, 1, 2);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(PLAN_LIMIT), { status: 402 })));
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');

    const notice = panel.querySelector('[data-plan-limit-notice="true"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain(PLAN_LIMIT.error);
    expect(notice!.querySelector('a')?.getAttribute('href')).toBe('/dashboard/settings/billing');
  });

  it("any other error keeps today's text", async () => {
    const { c } = tableEditor(ASK_GRID, vi.fn(), BOARD);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'The provider is unavailable.' }),
      { status: 502 },
    )));
    const panel = await openAskAI(c, 0, 0);
    await choose(panel, 'Summarize');

    expect(panel.textContent).toContain('The provider is unavailable.');
    expect(panel.querySelector('[data-plan-limit-notice="true"]')).toBeNull();
  });
});
