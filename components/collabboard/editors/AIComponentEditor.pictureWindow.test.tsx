// @vitest-environment jsdom
//
// PATCH-246 -- one window for every new AI picture: type the text, press
// Generate, then filter the gallery. Boards and photo cards move under "Other
// formats"; a locked regenerate keeps today's behaviour.
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

const CHART = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'pie_chart',
    renderer: 'chart',
    title: 'Budget',
    dataPoints: [{ label: 'A', value: 60 }, { label: 'B', value: 40 }],
  },
  meta: { renderer: 'chart', subtype: 'pie_chart', prompt: 'p' },
};

const STORED_FLOW = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'flowchart',
    renderer: 'diagram_code',
    title: 'Flow',
    code: 'flowchart TD\n  A --> B',
  },
  meta: { renderer: 'diagram_code', subtype: 'flowchart', prompt: 'p' },
};

function outlineFetch() {
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === '/api/ai/generate-outline') {
      return new Response(
        JSON.stringify({ outline: OUTLINE, generatedBy: { source: 'collabboard-default', model: 'm' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(JSON.stringify(CHART), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('PATCH-246 AIComponentEditor picture window', () => {
  it('a new picture shows the prompt, Generate, and closed Other formats -- no mode list or subtype grid', () => {
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    expect(c.textContent).toContain('What do you want to visualize?');
    expect(buttonContaining(c, 'Generate')).toBeTruthy();
    expect(c.querySelector('[data-ai-other-formats]')).not.toBeNull();
    // Closed: the board cards are not rendered yet.
    expect(Array.from(c.querySelectorAll('button')).some((b) => (b.textContent ?? '').includes('Lesson Board'))).toBe(
      false,
    );
    expect(c.querySelector('[data-ai-subtype-chip]')).toBeNull();
    expect(c.textContent).not.toContain('Choose a mode');
    expect(c.textContent).not.toContain('Diagram subtype');
    // The picture window carries no subtype description (the Flowchart one
    // used to leak in under the textarea).
    expect(c.textContent).not.toContain('Step-by-step process visualization.');
  });

  it('Generate runs the outline route exactly once', async () => {
    const fetchMock = outlineFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
    click(buttonContaining(c, 'Generate'));

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    expect(fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline')).toHaveLength(1);
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
    // The gallery with its family chips is now showing.
    expect(c.querySelector('[data-ai-family-chip="all"]')).not.toBeNull();
  });

  it('Other formats -> Lesson Board runs that mode generator, and Back returns to pictures', async () => {
    const fetchMock = outlineFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    click(c.querySelector('[data-ai-other-formats-toggle="true"]') as HTMLElement);
    click(buttonContaining(c, 'Lesson Board'));
    expect(buttonContaining(c, 'Back to pictures')).toBeTruthy();

    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Photosynthesis');
    click(buttonContaining(c, 'Generate'));

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    const componentCall = fetchMock.mock.calls.find((call) => call[0] === '/api/ai/generate-component');
    expect(componentCall).toBeTruthy();
    expect(JSON.parse(String(componentCall![1]?.body)).mode).toBe('lesson_board');

    click(c.querySelector('[data-ai-back-to-pictures="true"]') as HTMLElement);
    expect(c.textContent).toContain('What do you want to visualize?');
    expect(c.querySelector('[data-ai-other-formats]')).not.toBeNull();
  });

  it('regenerating a locked stored flowchart still shows today\'s locked UI', () => {
    const c = mount(
      <AIComponentEditor
        isOpen
        lockedMode="diagram"
        lockedSubtype="flowchart"
        initialContent={STORED_FLOW}
        initialPrompt="p"
        onClose={() => {}}
        onSave={() => {}}
      />,
    );

    expect(c.textContent).toContain('Regenerate AI Component');
    expect(c.textContent).toContain('Mode locked');
    expect(c.textContent).not.toContain('What do you want to visualize?');
    expect(c.querySelector('[data-ai-family-chip]')).toBeNull();
  });

  it('Chart with no chart designs offers both buttons; Pie chart posts the chart generator and selects the result', async () => {
    const fetchMock = outlineFetch();
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);

    setTextareaValue(c.querySelector('textarea') as HTMLTextAreaElement, 'Water cycle for 7th grade');
    click(buttonContaining(c, 'Generate'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    click(c.querySelector('[data-ai-family-chip="chart"]') as HTMLElement);
    expect(c.textContent).toContain('Charts need numbers.');
    expect(c.querySelector('[data-ai-make-chart="pie"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-make-chart="bar"]')).not.toBeNull();

    click(c.querySelector('[data-ai-make-chart="pie"]') as HTMLElement);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    const chartCall = fetchMock.mock.calls.find((call) => call[0] === '/api/ai/generate-component');
    expect(chartCall).toBeTruthy();
    const body = JSON.parse(String(chartCall![1]?.body));
    expect(body.mode).toBe('diagram');
    expect(body.subtype).toBe('pie_chart');

    const shown = c.querySelector('[data-ai-outline-option="chart:pie_chart"]') as HTMLElement;
    expect(shown).not.toBeNull();
    expect(shown.getAttribute('aria-pressed')).toBe('true');
  });
});
