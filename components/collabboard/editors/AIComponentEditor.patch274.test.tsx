// @vitest-environment jsdom
//
// PATCH-274 through the real generator. A structural Edit-text change (remove
// item A) must carry item B's positional element override to B's new index --
// never leave it on the item that shifted into that slot (Codex F4).
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
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

const OVERRIDE = { template: 'list-grid-badge-card', items: { 'item-label@1': { fill: '#ff0000' } } };

const THREE_ITEMS = {
  title: 'Water cycle',
  ordered: false,
  kind: 'list',
  elementOverrides: OVERRIDE,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

function stubFetch(outline: unknown) {
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

function previewOutline(c: HTMLElement): { items: Array<{ id?: string; label?: string }>; elementOverrides?: { items: Record<string, unknown> } } {
  const el = c.querySelector('[data-ai-outline-preview] [data-testid="antv-stub"]') as HTMLElement | null;
  expect(el, 'no AntV renderer in the main preview').not.toBeNull();
  return JSON.parse(el!.getAttribute('data-ai-antv-data')!).outline;
}

describe('PATCH-274 generator: edits stay on the right item', () => {
  it("removing item A keeps B's colour on B and off C", async () => {
    const fetchMock = stubFetch(THREE_ITEMS);
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    click(buttonContaining(c, 'Diagram'));
    click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle');
    click(buttonContaining(c, 'Generate'));
    await flush();
    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline')).toHaveLength(1);

    // Pick an AntV design so the main preview is the AntV renderer.
    const antvTile = Array.from(c.querySelectorAll('[data-ai-outline-option]')).find((tile) =>
      (tile.getAttribute('data-ai-outline-option') ?? '').startsWith('antv:'),
    ) as HTMLElement | undefined;
    expect(antvTile, 'no AntV tile offered').toBeTruthy();
    click(antvTile!);

    // Ids are assigned when the outline enters editing.
    const before = previewOutline(c);
    expect(before.items.map((item) => item.id)).toHaveLength(3);
    expect(new Set(before.items.map((item) => item.id)).size).toBe(3);

    // Edit text -> remove item A (index 0).
    click(c.querySelector('[data-ai-edit-text-toggle="true"]') as HTMLElement);
    click(c.querySelector('[data-ai-outline-item-remove="0"]') as HTMLElement);

    const after = previewOutline(c);
    expect(after.items.map((item) => item.label)).toEqual(['Condensation', 'Precipitation']);
    // B's colour moved to index 0; nothing is left on index 1 (C).
    expect(after.elementOverrides!.items['item-label@0']).toEqual({ fill: '#ff0000' });
    expect(after.elementOverrides!.items['item-label@1']).toBeUndefined();
  });
});
