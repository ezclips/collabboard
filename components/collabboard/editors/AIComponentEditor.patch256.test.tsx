// @vitest-environment jsdom
//
// PATCH-256. A failed "Show options" outline used to be visible only in the left
// column, scrolled out of view, while the preview fell back to the empty
// placeholder. Now the preview area shows the message plus a Try again button
// that replays the same generate.
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
function insideDashedPreview(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (typeof (node as HTMLElement).className === 'string' && (node as HTMLElement).className.includes('border-dashed')) {
      return true;
    }
  }
  return false;
}

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

const FAILED_MESSAGE = 'The AI outline needs at least two usable points.';

function stubFetch() {
  let outlineCalls = 0;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      outlineCalls += 1;
      if (outlineCalls === 1) {
        return new Response(JSON.stringify({ error: FAILED_MESSAGE }), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(
        JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

const outlineCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline').length;

function startOutline(c: HTMLElement) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'My fancy padlet-slideshow.pdf / It is watson.ch');
  click(buttonContaining(c, 'Generate'));
}

describe('PATCH-256 AIComponentEditor preview error', () => {
  it('shows the failure in the preview with Try again, then designs on retry', async () => {
    const fetchMock = stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    startOutline(c);
    await flush();

    // The outline call failed with 422.
    expect(outlineCalls(fetchMock)).toBe(1);

    // The message is inside the preview area, not (only) the left column, and
    // the empty placeholder is gone.
    const card = c.querySelector('[data-ai-preview-error]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain(FAILED_MESSAGE);
    expect(insideDashedPreview(card)).toBe(true);
    expect(c.textContent).not.toContain('Your component will appear here');

    // Try again replays the outline request...
    click(c.querySelector('[data-ai-preview-retry]') as HTMLElement);
    await flush();
    expect(outlineCalls(fetchMock)).toBe(2);

    // ...and its success shows designs with no error card left.
    expect(c.querySelectorAll('[data-ai-outline-option]').length).toBeGreaterThan(0);
    expect(c.querySelector('[data-ai-preview-error]')).toBeNull();
  });
});
