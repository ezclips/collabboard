// @vitest-environment jsdom
//
// PATCH-253. A style chosen in the Colours & Fonts panel reaches the saved
// envelope (`data.style`) with no AI call.
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
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button')).find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

function stubFetch() {
  const fetchMock = vi.fn(async () =>
    new Response(
      JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function openGallery(c: HTMLElement) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
  click(buttonContaining(c, 'Generate'));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
}

describe('PATCH-253 AIComponentEditor style', () => {
  it('saves the chosen style on the envelope and makes no extra fetch', async () => {
    const fetchMock = stubFetch();
    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);
    await openGallery(c);

    const callsAfterGenerate = fetchMock.mock.calls.length;

    click(c.querySelector('[data-ai-colours-toggle="true"]') as HTMLElement);
    setInputValue(c.querySelector('[data-ai-style-background]') as HTMLInputElement, '#112233');

    expect(fetchMock.mock.calls.length).toBe(callsAfterGenerate);

    click(buttonContaining(c, 'Save to Canvas'));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.aiComponentJson.data.style).toEqual({ background: '#112233' });
  });
});
