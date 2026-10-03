// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { ComparisonDiagramData } from '@/lib/ai/contracts';
import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';
import ComparisonDiagramRenderer from './ComparisonDiagramRenderer';

function rgb(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

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

  it('PATCH-238: a chosen theme paints the ground and swaps the palette', () => {
    const c = mount(<ComparisonDiagramRenderer data={{ ...data, theme: 'teal-night' }} />);
    const block = c.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.style.backgroundColor).toBe('rgb(30, 77, 70)'); // #1E4D46
    const band0 = c.querySelectorAll('[data-ai-comparison-band]')[0] as HTMLElement;
    expect(band0.style.borderTopColor).toBe('rgb(94, 234, 212)'); // #5EEAD4
    expect(c.textContent).toContain('Cats');
  });

  it('PATCH-238 Addendum 1: every theme colours the card body with its palette entry', () => {
    for (const id of Object.keys(VISUAL_THEMES) as VisualThemeId[]) {
      const entry = VISUAL_THEMES[id].palette[0];
      const c = mount(<ComparisonDiagramRenderer data={{ ...data, theme: id }} />);
      const col0 = c.querySelectorAll('[data-ai-comparison-column]')[0] as HTMLElement;
      expect(col0.style.backgroundColor, id).toBe(rgb(entry.fill));
      expect((col0.querySelector('h3') as HTMLElement).style.color, id).toBe(rgb(entry.text));
      expect((col0.querySelector('[data-ai-comparison-body]') as HTMLElement).style.color, id).toBe(rgb(entry.detail));
    }
  });
});

describe('PATCH-264 ComparisonDiagramRenderer kicker', () => {
  it('shows the default label when the kicker is absent', () => {
    const c = mount(<ComparisonDiagramRenderer data={data} />);
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('comparison');
  });

  it('shows a custom kicker', () => {
    const c = mount(<ComparisonDiagramRenderer data={{ ...data, kicker: 'Q3 plan' }} />);
    expect(c.querySelector('[data-ai-kicker]')!.textContent).toBe('Q3 plan');
  });

  it('shows no label for an explicit empty kicker', () => {
    const c = mount(<ComparisonDiagramRenderer data={{ ...data, kicker: '' }} />);
    expect(c.querySelector('[data-ai-kicker]')).toBeNull();
  });
});
