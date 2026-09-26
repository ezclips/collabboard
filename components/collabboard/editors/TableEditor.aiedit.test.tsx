// @vitest-environment jsdom
//
// PATCH-175 -- "Edit table with AI": a command becomes a checked plan, previewed
// before it applies. Harness of TableEditor.basics.test.tsx; `fetch` is stubbed.
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
function setInputValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const proto = input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonByText(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button'))
    .find((el) => (el.textContent ?? '').trim() === text);
  expect(found, `no button "${text}"`).not.toBeUndefined();
  return found as HTMLButtonElement;
}
function surfaces(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(
    '[data-slot="positioned-context-menu-content"], [data-slot="positioned-context-menu-sub-content"]',
  ));
}

const GRID = {
  rows: [['9 L', 'nine'], ['10 L', 'ten'], ['2 L', 'two']],
  columns: ['Volume', 'Label'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

const PLAN = {
  message: 'Sorted and totalled.',
  steps: [
    { action: 'sortRows', column: 'Volume', direction: 'desc' },
    { action: 'setSummary', column: 'Volume', summary: 'sum' },
  ],
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
/** Saves and returns the LATEST saved content, whatever was saved before. */
function latestSave(onSave: ReturnType<typeof vi.fn>, container: HTMLElement) {
  act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const calls = onSave.mock.calls;
  return JSON.parse(calls[calls.length - 1][0].content);
}
function stubPlan(plan: unknown) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify({ plan }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openPanel(c: HTMLElement) {
  click(c.querySelector('button[title="Switch to Cell Editing"]')!);
  await tick();
  click(c.querySelector('button[title="Edit with AI"]')!);
  await tick();
  return c.querySelector<HTMLElement>('[data-table-ai-edit-panel]')!;
}
async function planCommand(panel: HTMLElement, command: string) {
  setInputValue(panel.querySelector<HTMLTextAreaElement>('[data-table-ai-edit-command]')!, command);
  click(buttonByText(panel, 'Plan'));
  await tick();
  await tick();
}

describe('PATCH-175 -- opening and planning', () => {
  it('the Edit with AI tool opens the panel, and Plan posts the request body', async () => {
    const { c } = tableEditor(GRID);
    const fetchMock = stubPlan(PLAN);
    const panel = await openPanel(c);
    expect(panel).not.toBeNull();
    await planCommand(panel, 'sort by volume, largest first, and show the total');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/ai/table-plan');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      command: 'sort by volume, largest first, and show the total',
      columns: ['Volume', 'Label'],
      sampleRows: [['9 L', 'nine'], ['10 L', 'ten'], ['2 L', 'two']],
      rowCount: 3,
    });
  });
});

describe('PATCH-175 -- preview', () => {
  it('shows the message, the two step lines, and the draft; the real table is unchanged and locked', async () => {
    const { c, onSave } = tableEditor(GRID);
    stubPlan(PLAN);
    const panel = await openPanel(c);
    await planCommand(panel, 'sort and total');

    expect(panel.querySelector('[data-table-plan-message]')!.textContent).toContain('Sorted and totalled.');
    const steps = Array.from(panel.querySelectorAll('[data-table-plan-steps] li')).map((el) => el.textContent);
    expect(steps).toEqual([
      'Sort by "Volume", Z → A / largest first',
      'Show the sum under "Volume"',
    ]);
    const preview = panel.querySelector('[data-table-plan-preview]')!;
    // The draft volume column is sorted descending, with a Sum footer.
    const firstCell = preview.querySelector('tbody tr td')!;
    expect(firstCell.textContent).toBe('10 L');
    expect(preview.querySelector('tfoot')!.textContent).toContain('Sum 21 L');

    // The REAL table is unchanged and locked.
    expect(c.querySelector('[data-table-footer]')).toBeNull();
    const firstInput = c.querySelector('tbody tr td input') as HTMLInputElement;
    expect(firstInput.readOnly).toBe(true);

    // A right-click opens no menu while locked.
    act(() => {
      c.querySelector('thead th')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await tick();
    expect(surfaces()).toHaveLength(0);

    // And nothing was saved before Apply.
    expect(onSave).not.toHaveBeenCalled();
  });

  it('Apply writes the draft, offers Undo, and Undo restores the original', async () => {
    const { c, onSave } = tableEditor(GRID);
    stubPlan(PLAN);
    const panel = await openPanel(c);
    await planCommand(panel, 'sort and total');
    click(buttonByText(panel, 'Apply'));

    expect(c.querySelector('[data-table-undo-bar]')!.textContent).toContain('Applied 2 AI changes');

    const saved = latestSave(onSave, c);
    expect(saved.rows.map((row: string[]) => row[0])).toEqual(['10 L', '9 L', '2 L']);
    expect(saved.columnSummaries).toEqual(['sum', null]);

    // Undo restores the original order and drops the summary.
    click(buttonByText(c, 'Undo'));
    const restored = latestSave(onSave, c);
    expect(restored.rows.map((row: string[]) => row[0])).toEqual(['9 L', '10 L', '2 L']);
    expect(restored.columnSummaries).toBeUndefined();
  });

  it('Discard leaves the table unchanged and unlocked', async () => {
    const { c, onSave } = tableEditor(GRID);
    stubPlan(PLAN);
    const panel = await openPanel(c);
    await planCommand(panel, 'sort and total');
    click(buttonByText(panel, 'Discard'));

    expect(c.querySelector('[data-table-plan-preview]')).toBeNull();
    const firstInput = c.querySelector('tbody tr td input') as HTMLInputElement;
    expect(firstInput.readOnly).toBe(false);

    const saved = savedContent(onSave, c);
    expect(saved.rows.map((row: string[]) => row[0])).toEqual(['9 L', '10 L', '2 L']);
  });
});

describe('PATCH-175 -- nothing to do and errors', () => {
  it('steps: [] shows the message and Try again', async () => {
    const { c } = tableEditor(GRID);
    stubPlan({ message: 'I can only sort, total and tidy.', steps: [] });
    const panel = await openPanel(c);
    await planCommand(panel, 'do something impossible');

    expect(panel.querySelector('[data-table-plan-nothing]')!.textContent)
      .toContain('I can only sort, total and tidy.');
    click(buttonByText(panel, 'Try again'));
    expect(panel.querySelector('[data-table-ai-edit-command]')).not.toBeNull();
  });

  it('plan: null shows the unusable-answer error', async () => {
    const { c } = tableEditor(GRID);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ plan: null }), { status: 200 })));
    const panel = await openPanel(c);
    await planCommand(panel, 'anything');

    expect(panel.querySelector('[data-table-plan-error]')!.textContent)
      .toContain("The AI's answer couldn't be used.");
  });

  it('a plan naming a missing column shows the apply error and leaves the table unchanged', async () => {
    const { c, onSave } = tableEditor(GRID);
    stubPlan({ message: 'x', steps: [{ action: 'sortRows', column: 'Missing', direction: 'asc' }] });
    const panel = await openPanel(c);
    await planCommand(panel, 'sort by missing');

    expect(panel.querySelector('[data-table-plan-error]')!.textContent)
      .toContain('The plan couldn\'t be applied: No column named "Missing".');
    // Unlocked, and nothing saved.
    expect((c.querySelector('tbody tr td input') as HTMLInputElement).readOnly).toBe(false);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('PATCH-188 -- the board pays', () => {
  const BOARD = '11111111-1111-4111-8111-111111111111';
  const PLAN_LIMIT = {
    error: "The Free plan's AI credits for this month are used up.",
    code: 'plan_limit_credits',
  };

  it('sends boardId when the editor has one', async () => {
    const { c } = tableEditor(GRID, vi.fn(), BOARD);
    const fetchMock = stubPlan(PLAN);
    const panel = await openPanel(c);
    await planCommand(panel, 'sort and total');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).boardId).toBe(BOARD);
  });

  it('a 402 plan_limit_credits shows the message and the See plans link', async () => {
    const { c } = tableEditor(GRID, vi.fn(), BOARD);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(PLAN_LIMIT), { status: 402 })));
    const panel = await openPanel(c);
    await planCommand(panel, 'sort and total');

    const error = panel.querySelector('[data-table-plan-error]')!;
    const notice = error.querySelector('[data-plan-limit-notice="true"]');
    expect(notice).not.toBeNull();
    expect(notice!.textContent).toContain(PLAN_LIMIT.error);
    expect(notice!.querySelector('a')?.getAttribute('href')).toBe('/dashboard/settings/billing');
  });

  it("any other error keeps today's text", async () => {
    const { c } = tableEditor(GRID, vi.fn(), BOARD);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ error: 'The provider is unavailable.' }),
      { status: 502 },
    )));
    const panel = await openPanel(c);
    await planCommand(panel, 'sort and total');

    expect(panel.querySelector('[data-table-plan-error]')!.textContent).toContain('The provider is unavailable.');
    expect(panel.querySelector('[data-plan-limit-notice="true"]')).toBeNull();
  });
});
