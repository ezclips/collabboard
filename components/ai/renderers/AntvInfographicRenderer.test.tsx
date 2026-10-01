// @vitest-environment jsdom
import React, { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';
import AntvInfographicRenderer from './AntvInfographicRenderer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(() => {
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}

async function waitFor(container: HTMLElement, selector: string, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (container.querySelector(selector)) return container.querySelector(selector);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  }
  return null;
}

function data(o: VisualOutline): InfographicDiagramData {
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: o.title,
    template: 'antv:list-grid-badge-card',
    outline: o,
  };
}

const outline: VisualOutline = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'Spring', icon: 'flower-2' },
    { label: 'Summer', icon: 'sun' },
  ],
};

describe('PATCH-241 AntvInfographicRenderer', () => {
  it('reaches done under StrictMode (no stuck loading)', async () => {
    const c = mount(
      <StrictMode>
        <AntvInfographicRenderer data={data(outline)} />
      </StrictMode>,
    );
    const done = await waitFor(c, '[data-ai-render-state="done"]');
    expect(done).not.toBeNull();
    expect(c.querySelector('[data-antv-container]')).not.toBeNull();
  }, 30000);

  it('does not print the title in our header (AntV draws it inside the picture)', async () => {
    const c = mount(<AntvInfographicRenderer data={data(outline)} />);
    await waitFor(c, '[data-ai-render-state="done"]');
    // jsdom does not lay out AntV's foreignObject text nodes, so we assert the
    // header itself: the eyebrow stays, our title heading does not.
    expect(c.querySelector('h2')).toBeNull();
    expect(c.textContent).toContain('infographic');
  }, 30000);

  it('renders a hostile label as literal text, never as markup', async () => {
    const hostile = '<img src=x onerror="alert(1)">';
    const c = mount(
      <AntvInfographicRenderer
        data={data({ title: hostile, ordered: false, kind: 'list', items: [{ label: hostile }, { label: 'Plain' }] })}
      />,
    );
    await waitFor(c, '[data-ai-render-state="done"]');
    // No element built from data: no <img> and no live event-handler attribute.
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('[onerror]')).toBeNull();
  }, 30000);
});
