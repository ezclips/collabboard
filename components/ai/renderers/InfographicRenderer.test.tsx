// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { InfographicDiagramData, InfographicTemplate } from '@/lib/ai/contracts';
import type { VisualOutline } from '@/lib/ai/outline';
import { ALL_TEMPLATES } from '@/lib/ai/infographic';
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

function data(template: InfographicTemplate, o: VisualOutline = outline): InfographicDiagramData {
  return { type: 'diagram', subtype: 'infographic', renderer: 'infographic', title: o.title, template, outline: o };
}

describe('PATCH-236 InfographicRenderer', () => {
  it('renders every label as text', () => {
    const c = mount(<InfographicRenderer data={data('stack')} />);
    const text = c.textContent ?? '';
    for (const item of outline.items) {
      expect(text).toContain(item.label);
      expect(text).toContain(item.detail!);
    }
  });

  it('renders a hostile label as literal text with no img', () => {
    const hostile: VisualOutline = { ...outline, items: [{ label: '<img src=x onerror=alert(1)>' }, { label: 'B' }, { label: 'C' }] };
    const c = mount(<InfographicRenderer data={data('stack', hostile)} />);
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('svg')).not.toBeNull();
  });

  for (const template of ALL_TEMPLATES) {
    it(`renders ${template} without throwing`, () => {
      const c = mount(<InfographicRenderer data={data(template)} />);
      expect(c.querySelector(`[data-infographic-svg="${template}"]`)).not.toBeNull();
    });
  }

  it('PATCH-238: teal-night paints the theme background and keeps the labels', () => {
    const c = mount(<InfographicRenderer data={{ ...data('stack'), theme: 'teal-night' }} />);
    const block = c.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.getAttribute('data-ai-theme-background')).toBe('teal-night');
    expect(block.style.backgroundColor).toBe('rgb(30, 77, 70)'); // #1E4D46
    expect(c.textContent).toContain('Evaporation');
  });
});
