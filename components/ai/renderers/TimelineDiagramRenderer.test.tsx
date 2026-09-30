// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { TimelineDiagramData } from '@/lib/ai/contracts';
import TimelineDiagramRenderer from './TimelineDiagramRenderer';

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

const data: TimelineDiagramData = {
  type: 'diagram',
  subtype: 'timeline',
  renderer: 'timeline',
  title: 'Launch',
  items: [
    { title: 'Kickoff', dateLabel: 'Jan', description: 'Scope the work' },
    { title: 'Ship', dateLabel: 'Feb' },
  ],
};

describe('PATCH-234 TimelineDiagramRenderer', () => {
  it('colours each marker and date label from the palette', () => {
    const c = mount(<TimelineDiagramRenderer data={data} />);

    const dots = c.querySelectorAll('[data-ai-timeline-dot]') as NodeListOf<HTMLElement>;
    expect(dots).toHaveLength(2);
    expect(dots[0].style.backgroundColor).toBe('rgb(233, 162, 59)'); // #E9A23B
    expect(dots[1].style.backgroundColor).toBe('rgb(79, 157, 143)'); // #4F9D8F

    const dates = c.querySelectorAll('[data-ai-timeline-date]') as NodeListOf<HTMLElement>;
    expect(dates[0].style.color).toBe('rgb(233, 162, 59)');
    expect(dates[1].style.color).toBe('rgb(79, 157, 143)');

    expect(c.textContent).toContain('Kickoff');
    expect(c.textContent).toContain('Scope the work');
  });
});
