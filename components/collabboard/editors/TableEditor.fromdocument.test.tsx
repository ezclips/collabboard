// @vitest-environment jsdom
//
// PATCH-176 -- "Table from a document": build a table from a ready PDF or video
// transcript on the board. Harness of TableEditor.aiedit.test.tsx; `fetch` is
// stubbed for both the document list (GET) and the proposal (POST).
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
function setInputValue(input: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  act(() => {
    const proto = input instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : input instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
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

const BOARD = '11111111-1111-4111-8111-111111111111';

const EMPTY_GRID = {
  rows: [['', '']],
  columns: ['A', 'B'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

const FULL_GRID = {
  rows: [['existing', 'data'], ['more', 'here']],
  columns: ['A', 'B'],
  cellStyles: {},
  caption: '',
  titleStyle: {},
};

const DOCS = {
  documents: [
    { id: '22222222-2222-4222-8222-222222222222', originalFilename: 'manual.pdf', pageCount: 64, processingStatus: 'ready' },
    { id: '33333333-3333-4333-8333-333333333333', originalFilename: 'video.txt', pageCount: null, processingStatus: 'ready' },
    { id: '44444444-4444-4444-8444-444444444444', originalFilename: 'busy.pdf', pageCount: 10, processingStatus: 'processing' },
  ],
};

const TABLE = {
  message: 'A parts list.',
  columns: ['Part', 'Number', 'Price'],
  rows: [['Brake pad', 'BR-01', '45 L'], ['Filter', 'FL-02', '']],
};
const SOURCE = {
  filename: 'manual.pdf',
  kind: 'pdf',
  coverage: { pagesFrom: 1, pagesTo: 2, pageCount: 64, truncated: false },
};

function tableEditor(content: object, opts: { boardId?: string; onSave?: ReturnType<typeof vi.fn> } = {}) {
  const onSave = opts.onSave ?? vi.fn();
  const c = mount(
    <TableEditor isOpen onClose={vi.fn()} onSave={onSave} initialContent={JSON.stringify(content)} boardId={opts.boardId} />,
  );
  return { c, onSave };
}
function latestSave(onSave: ReturnType<typeof vi.fn>, container: HTMLElement) {
  act(() => { container.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const calls = onSave.mock.calls;
  return JSON.parse(calls[calls.length - 1][0].content);
}

/** Stubs GET (list) and POST (proposal) distinctly. */
function stubFetch(over: { list?: unknown; listStatus?: number; post?: unknown; postStatus?: number } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    if (method === 'GET') {
      return new Response(JSON.stringify(over.list ?? DOCS), { status: over.listStatus ?? 200 });
    }
    return new Response(JSON.stringify(over.post ?? { table: TABLE, source: SOURCE }), { status: over.postStatus ?? 200 });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openPanel(c: HTMLElement) {
  click(c.querySelector('button[title="Switch to Cell Editing"]')!);
  await tick();
  click(c.querySelector('button[title="From a document"]')!);
  await tick();
  return c.querySelector<HTMLElement>('[data-table-from-document-panel]')!;
}
async function generate(panel: HTMLElement) {
  click(buttonByText(panel, 'Generate'));
  await tick();
  await tick();
}

describe('PATCH-176 -- the tool and the document list', () => {
  it('the tool is absent without boardId and present with it', async () => {
    const { c } = tableEditor(EMPTY_GRID);
    click(c.querySelector('button[title="Switch to Cell Editing"]')!);
    await tick();
    expect(c.querySelector('button[title="From a document"]')).toBeNull();

    const withBoard = tableEditor(EMPTY_GRID, { boardId: BOARD });
    click(withBoard.c.querySelector('button[title="Switch to Cell Editing"]')!);
    await tick();
    expect(withBoard.c.querySelector('button[title="From a document"]')).not.toBeNull();
  });

  it('lists only ready documents, with a page count in the label', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch();
    const panel = await openPanel(c);
    const options = Array.from(panel.querySelectorAll('option')).map((o) => o.textContent);
    expect(options).toEqual(['manual.pdf · 64 pages', 'video.txt']);
  });

  it('shows page inputs for a PDF and not for a transcript', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch();
    const panel = await openPanel(c);
    expect(panel.querySelector('[data-table-from-document-page-from]')).not.toBeNull();

    // Switch to the transcript.
    setInputValue(panel.querySelector('[data-table-from-document-source]') as HTMLSelectElement, '33333333-3333-4333-8333-333333333333');
    await tick();
    expect(panel.querySelector('[data-table-from-document-page-from]')).toBeNull();
  });

  it('a range over 20 pages disables Generate and warns', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch();
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'everything');
    setInputValue(panel.querySelector('[data-table-from-document-page-to]') as HTMLInputElement, '40');
    await tick();
    expect(panel.querySelector('[data-table-from-document-range-error]')).not.toBeNull();
    expect(buttonByText(panel, 'Generate').disabled).toBe(true);
  });
});

describe('PATCH-176 -- generate and preview', () => {
  it('posts the exact body for a PDF', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    const fetchMock = stubFetch();
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'every part with its number and price');
    await generate(panel);

    const postCall = fetchMock.mock.calls.find(([, init]) => (init?.method ?? 'GET') === 'POST')!;
    expect(postCall[0]).toBe(`/api/boards/${BOARD}/ai/table-from-document`);
    expect(JSON.parse(String((postCall[1] as RequestInit).body))).toEqual({
      documentId: '22222222-2222-4222-8222-222222222222',
      request: 'every part with its number and price',
      pageFrom: 1,
      pageTo: 20,
    });
  });

  it('shows the message, the coverage line and the preview', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch();
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'parts');
    await generate(panel);

    expect(panel.querySelector('[data-table-from-document-message]')!.textContent).toContain('A parts list.');
    expect(panel.querySelector('[data-table-from-document-coverage]')!.textContent).toContain('Read pages 1–2 of 64');
    const preview = panel.querySelector('[data-table-plan-preview]')!;
    expect(preview.querySelector('thead')!.textContent).toContain('Part');
  });

  it('shows the replace warning only when the table has text, and locks the table', async () => {
    const empty = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch();
    let panel = await openPanel(empty.c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'parts');
    await generate(panel);
    expect(panel.querySelector('[data-table-from-document-replace-warning]')).toBeNull();

    const full = tableEditor(FULL_GRID, { boardId: BOARD });
    stubFetch();
    panel = await openPanel(full.c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'parts');
    await generate(panel);
    expect(panel.querySelector('[data-table-from-document-replace-warning]')!.textContent)
      .toContain('Apply replaces the current table.');

    // The real table is locked: the cell input is read-only and no menu opens.
    const input = full.c.querySelector('tbody tr td input') as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    act(() => {
      full.c.querySelector('thead th')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    });
    await tick();
    expect(surfaces()).toHaveLength(0);
  });
});

describe('PATCH-176 -- apply, discard, errors', () => {
  it('Apply writes the table with aiFilled cells, offers Undo, and Undo restores', async () => {
    const { c, onSave } = tableEditor(FULL_GRID, { boardId: BOARD });
    stubFetch();
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'parts');
    await generate(panel);
    click(buttonByText(panel, 'Apply'));

    expect(c.querySelector('[data-table-undo-bar]')!.textContent).toContain('Created from manual.pdf');
    const saved = latestSave(onSave, c);
    expect(saved.columns).toEqual(['Part', 'Number', 'Price']);
    expect(saved.rows[0]).toEqual(['Brake pad', 'BR-01', '45 L']);
    expect(saved.cellStyles['0-0']).toEqual({ aiFilled: true });
    // The empty Price cell on row 1 has no sparkle.
    expect(saved.cellStyles['1-2']).toBeUndefined();

    click(buttonByText(c, 'Undo'));
    const restored = latestSave(onSave, c);
    expect(restored.columns).toEqual(['A', 'B']);
    expect(restored.rows).toEqual([['existing', 'data'], ['more', 'here']]);
  });

  it('Discard leaves the table unchanged and unlocked', async () => {
    const { c, onSave } = tableEditor(FULL_GRID, { boardId: BOARD });
    stubFetch();
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'parts');
    await generate(panel);
    click(buttonByText(panel, 'Discard'));

    expect((c.querySelector('tbody tr td input') as HTMLInputElement).readOnly).toBe(false);
    const saved = latestSave(onSave, c);
    expect(saved.columns).toEqual(['A', 'B']);
  });

  it('rows: [] shows the nothing-found text', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch({ post: { table: { message: '', columns: ['A'], rows: [] }, source: SOURCE } });
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'nothing');
    await generate(panel);
    expect(panel.querySelector('[data-table-from-document-nothing]')!.textContent)
      .toContain('Nothing in this document matched your request.');
  });

  it('table: null shows the unusable-answer error', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch({ post: { table: null, source: SOURCE } });
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'x');
    await generate(panel);
    expect(panel.querySelector('[data-table-from-document-error]')!.textContent)
      .toContain("The AI's answer couldn't be used.");
  });

  it('404 shows the not-available text', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch({ post: { error: 'This document is not available.' }, postStatus: 404 });
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'x');
    await generate(panel);
    expect(panel.querySelector('[data-table-from-document-error]')!.textContent)
      .toContain('This document is not available.');
  });

  it('409 shows the still-processing text', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch({ post: { error: 'This document is still being processed.' }, postStatus: 409 });
    const panel = await openPanel(c);
    setInputValue(panel.querySelector('[data-table-from-document-request]') as HTMLTextAreaElement, 'x');
    await generate(panel);
    expect(panel.querySelector('[data-table-from-document-error]')!.textContent)
      .toContain('This document is still being processed.');
  });
});

describe('PATCH-176 -- one panel at a time', () => {
  it('opening Edit with AI closes this panel, and opening this panel closes Edit with AI', async () => {
    const { c } = tableEditor(EMPTY_GRID, { boardId: BOARD });
    stubFetch();
    let panel = await openPanel(c);
    expect(panel).not.toBeNull();

    // Open Edit with AI: this panel goes.
    click(c.querySelector('button[title="Edit with AI"]')!);
    await tick();
    expect(c.querySelector('[data-table-from-document-panel]')).toBeNull();
    expect(c.querySelector('[data-table-ai-edit-panel]')).not.toBeNull();

    // Open this panel again: Edit with AI goes.
    click(c.querySelector('button[title="From a document"]')!);
    await tick();
    expect(c.querySelector('[data-table-ai-edit-panel]')).toBeNull();
    expect(c.querySelector('[data-table-from-document-panel]')).not.toBeNull();
  });
});
