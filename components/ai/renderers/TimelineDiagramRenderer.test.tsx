// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { TimelineDiagramData } from '@/lib/ai/contracts';
import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';
import TimelineDiagramRenderer from './TimelineDiagramRenderer';

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

  it('PATCH-238: a chosen theme paints the ground and swaps the palette', () => {
    const c = mount(<TimelineDiagramRenderer data={{ ...data, theme: 'teal-night' }} />);
    const block = c.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.style.backgroundColor).toBe('rgb(30, 77, 70)'); // #1E4D46
    const dots = c.querySelectorAll('[data-ai-timeline-dot]') as NodeListOf<HTMLElement>;
    expect(dots[0].style.backgroundColor).toBe('rgb(94, 234, 212)'); // #5EEAD4
    expect(c.textContent).toContain('Kickoff');
  });

  it('PATCH-238 Addendum 1: every theme colours the card body with its palette entry', () => {
    for (const id of Object.keys(VISUAL_THEMES) as VisualThemeId[]) {
      const entry = VISUAL_THEMES[id].palette[0];
      const c = mount(<TimelineDiagramRenderer data={{ ...data, theme: id }} />);
      const body = c.querySelector('[data-ai-timeline-body]') as HTMLElement;
      expect(body.style.backgroundColor, id).toBe(rgb(entry.fill));
      expect((c.querySelector('[data-ai-timeline-title]') as HTMLElement).style.color, id).toBe(rgb(entry.text));
      expect((c.querySelector('[data-ai-timeline-description]') as HTMLElement).style.color, id).toBe(rgb(entry.detail));
    }
  });
});
