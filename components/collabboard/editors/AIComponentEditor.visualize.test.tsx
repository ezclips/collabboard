// @vitest-environment jsdom
//
// PATCH-235 -- "Visualize…" opens AIComponentEditor in Diagram + Show options
// and runs the outline ONCE, automatically. Without the flag, nothing auto-runs.
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

const OUTLINE = {
  title: 'Water cycle',
  ordered: false,
  items: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};

function stubFetch() {
  const fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/ai/generate-outline') {
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

const outlineCalls = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter((call) => call[0] === '/api/ai/generate-outline').length;

describe('PATCH-235 AIComponentEditor "Visualize…" auto-run', () => {
  it('with initialVisualize: opens Show options and calls the outline route exactly once', async () => {
    const fetchMock = stubFetch();
    const c = mount(
      <AIComponentEditor
        isOpen
        initialVisualize
        initialPrompt="Water moves through evaporation and condensation."
        onClose={() => {}}
        onSave={() => {}}
      />,
    );

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });

    expect(outlineCalls(fetchMock)).toBe(1);
    expect(fetchMock.mock.calls.some((call) => call[0] === '/api/ai/generate-component')).toBe(false);
    // The Show options grid is showing.
    expect(c.querySelectorAll('[data-ai-outline-option]').length).toBeGreaterThan(0);
  });

  it('without initialVisualize: nothing auto-runs', async () => {
    const fetchMock = stubFetch();
    mount(
      <AIComponentEditor
        isOpen
        initialPrompt="Water moves through evaporation and condensation."
        onClose={() => {}}
        onSave={() => {}}
      />,
    );

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
