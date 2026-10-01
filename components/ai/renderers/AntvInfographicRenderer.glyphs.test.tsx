// @vitest-environment jsdom
//
// PATCH-243 Addendum 2. AntV's on-picture buttons were blank blue squares; each
// editable one is now a circle with a white + / − glyph drawn as a sibling.
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
  items: [{ label: 'Spring' }, { label: 'Summer' }],
};

function data(): InfographicDiagramData {
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: outline.title,
    template: 'antv:list-grid-badge-card',
    outline,
  };
}

describe('PATCH-243 Addendum 2 AntV button glyphs', () => {
  it('makes every editable button a circle with a white + / − glyph', async () => {
    const c = mount(<AntvInfographicRenderer data={data()} edit={{ onChange: () => {} }} />);
    expect(await waitFor(c, '[data-ai-render-state="done"]')).not.toBeNull();
    await waitFor(c, '[data-antv-button-glyph]');

    const adds = Array.from(c.querySelectorAll('[data-element-type="btn-add"]'));
    const removes = Array.from(c.querySelectorAll('[data-element-type="btn-remove"]'));
    expect(adds.length).toBeGreaterThan(0);
    expect(removes.length).toBeGreaterThan(0);

    for (const el of adds) {
      expect(el.getAttribute('rx')).toBe(String(Number(el.getAttribute('width')) / 2));
      expect(el.getAttribute('ry')).toBe(String(Number(el.getAttribute('height')) / 2));
      const glyph = el.nextElementSibling!;
      expect(glyph.getAttribute('data-antv-button-glyph')).toBe('add');
      expect(glyph.getAttribute('stroke')).toBe('#fff');
      expect(glyph.getAttribute('stroke-width')).toBe('2');
      expect(glyph.getAttribute('pointer-events')).toBe('none');
      expect(glyph.getAttribute('d')).toContain('M');
    }
    for (const el of removes) {
      expect(el.getAttribute('rx')).toBe(String(Number(el.getAttribute('width')) / 2));
      expect(el.nextElementSibling!.getAttribute('data-antv-button-glyph')).toBe('remove');
    }
  }, 30000);

  it('adds no glyphs when the picture is not editable', async () => {
    const c = mount(<AntvInfographicRenderer data={data()} />);
    expect(await waitFor(c, '[data-ai-render-state="done"]')).not.toBeNull();
    expect(c.querySelector('[data-element-type="btn-add"]')).not.toBeNull();
    expect(c.querySelector('[data-antv-button-glyph]')).toBeNull();
  }, 30000);
});
