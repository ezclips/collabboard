// @vitest-environment jsdom
//
// PATCH-244. A stored AntV text style must survive a redraw: `toAntvOptions`
// passes it back as AntV attributes, so the real engine paints the label with
// the stored fill instead of the theme default.
import React from 'react';
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

const outline: VisualOutline = {
  title: 'Seasons',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'Spring', textStyle: { label: { fill: '#ff0000' } } },
    { label: 'Summer' },
  ],
};

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

describe('PATCH-244 AntV stored text style is drawn', () => {
  it('draws the stored label fill on a redraw', async () => {
    const c = mount(<AntvInfographicRenderer data={data(outline)} />);
    await waitFor(c, '[data-ai-render-state="done"]');
    const labels = Array.from(c.querySelectorAll('[data-element-type="item-label"]'));
    expect(labels.length).toBeGreaterThan(0);
    // AntV draws a label as a foreignObject whose span carries the fill as
    // `color`; jsdom may normalise the hex to rgb.
    const colors = labels.map((label) => label.querySelector('span')?.style.color);
    expect(colors.some((color) => color === '#ff0000' || color === 'rgb(255, 0, 0)')).toBe(true);
  }, 30000);
});
