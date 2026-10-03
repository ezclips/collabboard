// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { BarChartDiagramData, PieChartDiagramData } from '@/lib/ai/contracts';
import ChartDiagramRenderer from './ChartDiagramRenderer';

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
});

const pie: PieChartDiagramData = {
  type: 'diagram',
  subtype: 'pie_chart',
  renderer: 'chart',
  title: 'Budget',
  dataPoints: [
    { label: 'Venue', value: 40 },
    { label: 'Food', value: 60 },
  ],
};

const bar: BarChartDiagramData = {
  type: 'diagram',
  subtype: 'bar_chart',
  renderer: 'chart',
  title: 'Sales',
  dataPoints: [
    { label: 'Q1', value: 10 },
    { label: 'Q2', value: 20 },
  ],
};

describe('PATCH-264 ChartDiagramRenderer kicker', () => {
  it('shows the default label when the kicker is absent', () => {
    expect(mount(<ChartDiagramRenderer data={pie} />).querySelector('[data-ai-kicker]')!.textContent).toBe('pie chart');
    expect(mount(<ChartDiagramRenderer data={bar} />).querySelector('[data-ai-kicker]')!.textContent).toBe('bar chart');
  });

  it('shows a custom kicker', () => {
    const c = mount(<ChartDiagramRenderer data={{ ...pie, kicker: 'Q3 plan' }} />);
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('Q3 plan');
  });

  it('shows no label for an explicit empty kicker', () => {
    const c = mount(<ChartDiagramRenderer data={{ ...pie, kicker: '' }} />);
    expect(c.querySelector('[data-ai-kicker]')).toBeNull();
  });
});
