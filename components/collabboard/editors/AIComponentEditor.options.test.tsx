// @vitest-environment jsdom
//
// PATCH-233 -- "Show options": the outline route draws several pictures locally,
// the editor shows them as a grid, and Save stores the SELECTED one with the
// same envelope a normal diagram generation would.
//
// PATCH-246: the toolbar now opens the picture window directly (no "Choose a
// mode" step and no "Diagram subtype" grid), so the test types the prompt and
// presses Generate without selecting Diagram / Show options first.
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
function buttonContaining(root: ParentNode, text: string): HTMLButtonElement {
  const found = Array.from(root.querySelectorAll('button'))
    .find((b) => (b.textContent ?? '').includes(text));
  expect(found, `no button containing "${text}"`).toBeTruthy();
  return found as HTMLButtonElement;
}
function setTextareaValue(input: HTMLTextAreaElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }, { label: 'Precipitation' }],
};

describe('PATCH-233 AIComponentEditor "Show options"', () => {
  it('calls the outline route, shows the grid, and saves the selected option', async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(
      JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    const onSave = vi.fn();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={onSave} />);

    // The toolbar entry opens the picture window straight away (PATCH-246).
    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
    click(buttonContaining(c, 'Generate'));

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    // The outline route, never the component route.
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ai/generate-outline');
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);

    const options = Array.from(c.querySelectorAll('[data-ai-outline-option]')) as HTMLElement[];
    const keys = options.map((o) => o.getAttribute('data-ai-outline-option'));
    // PATCH-236: the suggestions now include the infographic designs too.
    for (const expected of ['mindmap', 'comparison', 'flow']) {
      expect(keys).toContain(expected);
    }
    expect(keys.some((k) => k!.startsWith('infographic:'))).toBe(true);
    // "Suggested" holds the first four, the first badged "Best match".
    expect(c.textContent).toContain('Suggested');
    expect(c.textContent).toContain('Best match');

    // PATCH-234: one large preview, and the first option selected by default.
    expect(c.querySelector('[data-ai-outline-preview="true"]')).not.toBeNull();
    expect(options[0].getAttribute('aria-pressed')).toBe('true');

    // MUTATION: saving the first option regardless of selection makes this fail.
    const comparisonButton = options.find((o) => o.getAttribute('data-ai-outline-option') === 'comparison')!;
    click(comparisonButton);
    expect(comparisonButton.getAttribute('aria-pressed')).toBe('true');
    click(buttonContaining(c, 'Save to Canvas'));

    const saved = onSave.mock.calls[0][0];
    expect(saved.aiComponentJson.meta.subtype).toBe('comparison');
    expect(saved.aiComponentJson.meta.renderer).toBe('comparison');
    expect(saved.aiComponentJson.data.type).toBe('diagram');
    expect(saved.aiComponentJson.data.subtype).toBe('comparison');
  });
});
