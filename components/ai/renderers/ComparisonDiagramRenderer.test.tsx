// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { ComparisonDiagramData } from '@/lib/ai/contracts';
import ComparisonDiagramRenderer from './ComparisonDiagramRenderer';

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

const data: ComparisonDiagramData = {
  type: 'diagram',
  subtype: 'comparison',
  renderer: 'comparison',
  title: 'Cats vs Dogs',
  columns: [
    { heading: 'Cats', points: ['Independent', 'Quiet'] },
    { heading: 'Dogs', points: ['Loyal'] },
  ],
};

describe('PATCH-234 ComparisonDiagramRenderer', () => {
  it('colours each column band and bullet dots from the palette', () => {
    const c = mount(<ComparisonDiagramRenderer data={data} />);

    const columns = c.querySelectorAll('[data-ai-comparison-column]');
    expect(columns).toHaveLength(2);

    const band0 = columns[0].querySelector('[data-ai-comparison-band]') as HTMLElement;
    expect(band0.style.borderTopWidth).toBe('4px');
    expect(band0.style.borderTopColor).toBe('rgb(233, 162, 59)'); // #E9A23B
    expect(band0.style.backgroundColor).toBe('rgb(252, 239, 217)'); // #FCEFD9
    expect((band0.querySelector('h3') as HTMLElement).style.color).toBe('rgb(90, 59, 6)'); // #5A3B06

    expect((columns[0].querySelector('li span') as HTMLElement).style.backgroundColor).toBe('rgb(233, 162, 59)');

    const band1 = columns[1].querySelector('[data-ai-comparison-band]') as HTMLElement;
    expect(band1.style.borderTopColor).toBe('rgb(79, 157, 143)'); // #4F9D8F

    expect(c.textContent).toContain('Cats');
    expect(c.textContent).toContain('Loyal');
  });
});
