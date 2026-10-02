// @vitest-environment jsdom
//
// PATCH-254. While an outline request runs the editor shows a calm progress
// placeholder and a design skeleton instead of the old full white spinner; on a
// regenerate the designs already on screen stay visible but dimmed. The other
// modes keep the old spinner.
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

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/** A fetch whose promises we resolve by hand, so a request can be held open. */
function holdFetch() {
  const pending: Array<{ url: string; resolve: (r: Response) => void }> = [];
  const fetchMock = vi.fn((url: string) => new Promise<Response>((resolve) => { pending.push({ url, resolve }); }));
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, pending };
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

function startOutline(c: HTMLElement) {
  click(buttonContaining(c, 'Diagram'));
  click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
  setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
  click(buttonContaining(c, 'Generate'));
}

async function finishOutline(pending: Array<{ resolve: (r: Response) => void }>, index = 0) {
  await act(async () => {
    pending[index].resolve(jsonResponse({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }));
  });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
}

describe('PATCH-254 AIComponentEditor outline progress', () => {
  it('shows the progress line and an 8-tile skeleton while the outline is in flight, then the real tiles', async () => {
    const { pending } = holdFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    startOutline(c);
    await flush();

    const progress = c.querySelector('[data-ai-outline-progress]') as HTMLElement;
    expect(progress).not.toBeNull();
    expect(progress.textContent).toContain('Reading your text');

    const skeleton = c.querySelector('[data-ai-designs-skeleton]') as HTMLElement;
    expect(skeleton).not.toBeNull();
    expect(skeleton.children).toHaveLength(8);

    // PATCH-252: the panel opened on Designs, so the modal widened.
    expect(c.querySelector('[data-ai-side-panel-host]')).not.toBeNull();

    await finishOutline(pending);

    expect(c.querySelector('[data-ai-designs-skeleton]')).toBeNull();
    expect(c.querySelectorAll('[data-ai-outline-option]').length).toBeGreaterThan(0);
  });

  it('keeps the old tiles visible but dimmed while a regenerate waits', async () => {
    const { pending } = holdFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    startOutline(c);
    await flush();
    await finishOutline(pending);
    expect(c.querySelectorAll('[data-ai-outline-option]').length).toBeGreaterThan(0);

    click(buttonContaining(c, 'Regenerate'));
    await flush();

    // The old designs stay on screen, not replaced by a skeleton.
    expect(c.querySelector('[data-ai-designs-skeleton]')).toBeNull();
    expect(c.querySelectorAll('[data-ai-outline-option]').length).toBeGreaterThan(0);
    // ...but dimmed and inert, with the same progress line over the preview.
    expect((c.querySelector('[data-ai-outline-preview]') as HTMLElement).className).toContain('opacity-50');
    expect((c.querySelector('[data-ai-outline-preview]') as HTMLElement).className).toContain('pointer-events-none');
    expect(c.querySelector('[data-ai-outline-progress]')).not.toBeNull();

    await finishOutline(pending, 1);
  });

  it('keeps the old spinner for a lesson-board generation', async () => {
    const { pending, fetchMock } = holdFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Photosynthesis for middle school');
    click(buttonContaining(c, 'Generate'));
    await flush();

    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/generate-component');
    expect(c.querySelector('[data-ai-outline-progress]')).toBeNull();
    expect(c.textContent).toContain('Generating structured content');

    await act(async () => {
      pending[0].resolve(jsonResponse({ mode: 'lesson_board', version: 1, data: { type: 'lesson_board', title: 't', sections: [] } }));
    });
  });
});
