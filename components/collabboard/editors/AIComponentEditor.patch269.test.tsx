// @vitest-environment jsdom
//
// PATCH-269. Editing the native mind map (rename/add/remove) used to rebuild
// each item from a short field list, dropping every real number and text style.
// Codex reproduced it live: 40/30/20/10 -> mindmap -> rename "Venue" -> Pie came
// back as four 25% example sectors with Save disabled. This walks the real
// generator through that sequence and checks the pie keeps the real numbers.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: ({ content }: { content?: unknown }) => React.createElement('div', {
    'data-testid': 'ai-content-stub',
    'data-ai-envelope': content === undefined ? undefined : JSON.stringify(content),
  }),
}));

// The pie preview is an editable infographic; stub the AntV leaf so jsdom never
// has to load the real engine (the tile envelopes are what we assert on).
vi.mock('@/components/ai/renderers/AntvInfographicRenderer', () => ({
  default: ({ data }: { data?: unknown }) => React.createElement('div', {
    'data-testid': 'antv-stub',
    'data-ai-antv-data': data === undefined ? undefined : JSON.stringify(data),
  }),
}));

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
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
  vi.unstubAllGlobals();
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function keydown(el: Element, key: string) {
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
function saveButton(c: ParentNode): HTMLButtonElement {
  return buttonContaining(c, 'Save to Canvas');
}
function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
}
function exampleBadge(c: ParentNode): HTMLElement | null {
  return c.querySelector('[data-ai-values-example="true"]') as HTMLElement | null;
}
/** The envelope a pie tile was given (the object `envelopeFor` builds). */
function pieTileOutline(c: ParentNode): any {
  const tile = tiles(c).find((t) => (t.getAttribute('data-ai-outline-option') ?? '').includes('chart-pie'));
  expect(tile, 'no pie tile').toBeTruthy();
  const stub = tile!.querySelector('[data-testid="ai-content-stub"]') as HTMLElement | null;
  expect(stub, 'pie tile has no envelope').not.toBeNull();
  return JSON.parse(stub!.getAttribute('data-ai-envelope')!).data.outline;
}

const NUMBERS_OUTLINE = {
  title: 'Budget',
  ordered: false,
  kind: 'parts',
  items: [
    { label: 'Venue', value: 40 },
    { label: 'Food', value: 30 },
    { label: 'Travel', value: 20 },
    { label: 'Activities', value: 10 },
  ],
};

async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

function stubFetch(outline: unknown = NUMBERS_OUTLINE) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const outlineCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline').length;

async function openGallery(c: HTMLElement, fetchMock: ReturnType<typeof stubFetch>) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(
    c.querySelector('textarea') as HTMLTextAreaElement,
    'Budget: Venue 40%, Food 30%, Travel 20%, Activities 10%.',
  );
  click(buttonContaining(c, 'Generate'));
  await flush();
  expect(outlineCalls(fetchMock)).toBe(1);
}

/** Select the native mind-map design and rename its first branch, in the preview. */
async function renameFirstBranchInNativeMindmap(c: HTMLElement, label: string) {
  click(c.querySelector('[data-ai-subtype-chip="mindmap"]') as HTMLElement);
  await flush();
  const nativeTile = tiles(c).find((tile) => tile.getAttribute('data-ai-outline-option') === 'mindmap');
  expect(nativeTile, 'no native mind-map tile').toBeTruthy();
  click(nativeTile!);
  await flush();

  const editRef = c.querySelector('[data-ai-outline-preview] [data-ai-edit-ref="0"]');
  expect(editRef, 'no editable mind-map branch').not.toBeNull();
  click(editRef!);
  const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
  setInputValue(input, label);
  keydown(input, 'Enter');
  await flush();
}

describe('PATCH-269 a native mind-map rename keeps the chart numbers', () => {
  it('40/30/20/10 survive the rename, the pie has no examples and Save is enabled', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    await renameFirstBranchInNativeMindmap(c, 'Venue renamed');

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    await flush();

    // The real numbers are back, so nothing is marked as an example and Save is on.
    expect(exampleBadge(c)).toBeNull();
    expect(saveButton(c).disabled).toBe(false);

    const outline = pieTileOutline(c);
    expect(outline.items.map((item: any) => item.value)).toEqual([40, 30, 20, 10]);
    expect(outline.valuesExample).toBeUndefined();
    expect(outline.items.map((item: any) => item.label)).toContain('Venue renamed');
  });
});
