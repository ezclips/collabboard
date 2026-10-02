// @vitest-environment jsdom
//
// PATCH-253. Our own infographic renderer reads a stored `style`: the
// background, the palette slot colours and the title / label / detail fonts.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { InfographicDiagramData } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';
import InfographicRenderer from './InfographicRenderer';

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

const outline: VisualOutline = {
  title: 'Water cycle',
  ordered: false,
  kind: 'steps',
  items: [
    { label: 'Evaporation', detail: 'Sun heats water' },
    { label: 'Condensation', detail: 'Clouds form' },
    { label: 'Precipitation', detail: 'Rain falls' },
  ],
};

function data(): InfographicDiagramData {
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: outline.title,
    template: 'stack',
    outline,
    style: {
      background: '#112233',
      colors: ['#ff0000'],
      fonts: {
        title: { family: 'serif', weight: 700 },
        label: { family: 'mono', weight: 500 },
        desc: { family: 'hand', weight: 400 },
      },
    },
  };
}

describe('PATCH-253 InfographicRenderer style', () => {
  it('paints the stored background and palette colour', () => {
    const c = mount(<InfographicRenderer data={data()} />);
    const block = c.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.style.backgroundColor).toBe('rgb(17, 34, 51)'); // #112233
    expect(c.querySelector('[stroke="#ff0000"]')).not.toBeNull();
  });

  it('applies the stored title / label / desc fonts', () => {
    const c = mount(<InfographicRenderer data={data()} />);
    const heading = c.querySelector('h2') as HTMLElement;
    expect(heading.style.fontFamily).toContain('Georgia');
    expect(heading.style.fontWeight).toBe('700');
    const label = c.querySelector('[data-ai-edit-ref="label:0"]') as SVGTextElement;
    expect(label.getAttribute('font-family')).toContain('ui-monospace');
    expect(label.getAttribute('font-weight')).toBe('500');
    const detail = c.querySelector('[data-ai-edit-ref="detail:0"]') as SVGTextElement;
    expect(detail.getAttribute('font-family')).toContain('Segoe Print');
    expect(detail.getAttribute('font-weight')).toBe('400');
  });
});
