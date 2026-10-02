// @vitest-environment jsdom
//
// PATCH-250 -- "Make pie chart" on text without numbers asks the AI to estimate
// each point's share and opens the pie designs (one outline call), instead of
// running the old single-picture chart generator.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
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
function tiles(c: ParentNode): HTMLElement[] {
  return Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
}

const NO_NUMBERS_OUTLINE = {
  title: 'Budget',
  ordered: false,
  items: [{ label: 'Venue' }, { label: 'Food' }],
};

const ESTIMATED_OUTLINE = {
  title: 'Budget',
  ordered: false,
  valuesEstimated: true,
  items: [
    { label: 'Venue', value: 40 },
    { label: 'Food', value: 30 },
    { label: 'Travel', value: 20 },
    { label: 'Activities', value: 10 },
  ],
};

const LEGACY_CHART = {
  mode: 'diagram',
  version: 1,
  data: { type: 'diagram', subtype: 'pie_chart', renderer: 'chart', title: 'Budget', dataPoints: [] },
  meta: { renderer: 'chart', subtype: 'pie_chart', prompt: 'p' },
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/ai/generate-outline') {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const outline = body.options?.estimateValues ? ESTIMATED_OUTLINE : NO_NUMBERS_OUTLINE;
      return new Response(
        JSON.stringify({ outline, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify(LEGACY_CHART), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openGallery(c: HTMLElement, fetchMock: ReturnType<typeof stubFetch>) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'venue is the biggest cost, then food');
  click(buttonContaining(c, 'Generate'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline')).toHaveLength(1);
}

describe('PATCH-250 "Make pie chart" estimates the numbers', () => {
  it('asks the outline route to estimate values and opens the pie designs', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    await openGallery(c, fetchMock);

    click(c.querySelector('[data-ai-subtype-chip="pie_chart"]') as HTMLElement);
    const make = c.querySelector('[data-ai-make-chart="pie"]') as HTMLElement;
    expect(make).not.toBeNull();

    click(make);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    const outlineCalls = fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline');
    expect(outlineCalls).toHaveLength(2);
    const estimateCalls = outlineCalls.filter(
      (call) => JSON.parse(String(call[1]?.body)).options?.estimateValues === true,
    );
    expect(estimateCalls).toHaveLength(1);
    // The old single-picture chart generator is never called from here.
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);

    const keys = tiles(c).map((tile) => tile.getAttribute('data-ai-outline-option') ?? '');
    expect(keys.filter((k) => k.includes('chart-pie'))).toHaveLength(6);
    for (let i = 0; i < 6; i += 1) expect(keys[i]).toContain('chart-pie');

    const line = c.querySelector('[data-ai-family-filter="true"]') as HTMLElement;
    expect(line).not.toBeNull();
    expect(line.textContent).toContain('Pie Chart');
    expect(c.querySelector('[data-ai-values-estimated="true"]')).not.toBeNull();
    expect(c.textContent).toContain('The AI estimated these numbers');
  });
});
