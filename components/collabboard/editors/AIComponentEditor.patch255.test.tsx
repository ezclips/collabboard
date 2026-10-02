// @vitest-environment jsdom
//
// PATCH-255. The window is wide and the docked host column exists ONLY while the
// suggestions panel is actually mounted and reports open. Switching to another
// mode unmounts the panel; the window must shrink even though the panel's own
// open state is reported separately.
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

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ mode: 'lesson_board', version: 1, data: { type: 'lesson_board', title: 't', sections: [] } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function flush(ms = 300) {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });
}

function modal(c: HTMLElement): HTMLElement {
  const all = Array.from(c.querySelectorAll('div')) as HTMLElement[];
  const found = all.find(
    (el) => el.className.includes('max-w-[96vw]') && (el.className.includes('w-[980px]') || el.className.includes('w-[1320px]')),
  );
  expect(found, 'modal not found').toBeTruthy();
  return found!;
}

describe('PATCH-255 AIComponentEditor side column', () => {
  it('only widens while the suggestions panel is mounted, and shrinks when it unmounts', async () => {
    stubFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    // Open the outline gallery on Diagram and generate designs.
    click(buttonContaining(c, 'Diagram'));
    click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
    click(buttonContaining(c, 'Generate'));
    await flush();

    // Designs arrived: the panel is mounted, the window is wide and the host exists.
    expect(c.querySelectorAll('[data-ai-outline-option]').length).toBeGreaterThan(0);
    expect(c.querySelector('[data-ai-side-panel-host]')).not.toBeNull();
    expect(modal(c).className).toContain('w-[1320px]');

    // Switch mode: the panel unmounts and the window must shrink, with no host.
    click(buttonContaining(c, 'Lesson Board'));
    expect(modal(c).className).toContain('w-[980px]');
    expect(modal(c).className).not.toContain('w-[1320px]');
    expect(c.querySelector('[data-ai-side-panel-host]')).toBeNull();

    // Back to Diagram: still narrow while no designs are on screen.
    click(buttonContaining(c, 'Diagram'));
    expect(modal(c).className).toContain('w-[980px]');
    expect(c.querySelector('[data-ai-side-panel-host]')).toBeNull();

    // Generate again: the panel mounts again, so the window widens again.
    click(c.querySelector('[data-ai-subtype-chip="options"]') as HTMLElement);
    click(buttonContaining(c, 'Regenerate'));
    await flush();

    expect(c.querySelector('[data-ai-side-panel-host]')).not.toBeNull();
    expect(modal(c).className).toContain('w-[1320px]');
  });
});
