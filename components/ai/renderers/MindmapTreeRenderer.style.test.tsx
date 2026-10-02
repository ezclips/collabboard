// @vitest-environment jsdom
//
// PATCH-253. Our own mind-map renderer reads a stored `style`: the background,
// the palette slot colours and the title / label / detail fonts.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { MindmapDiagramData } from '@/lib/ai/contracts';
import { fontStack } from '@/lib/ai/visualStyle';
import MindmapTreeRenderer from './MindmapTreeRenderer';

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

function data(): MindmapDiagramData {
  return {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: 'Water cycle',
    code: 'mindmap\n  root((water))',
    explanation: 'How water moves',
    tree: { label: 'Water cycle', children: [{ label: 'Rain', children: [{ label: 'Clouds' }] }] },
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

describe('PATCH-253 MindmapTreeRenderer style', () => {
  it('paints the stored background and palette colour', () => {
    const c = mount(<MindmapTreeRenderer data={data()} />);
    const block = c.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.style.backgroundColor).toBe('rgb(17, 34, 51)'); // #112233
    const branch = c.querySelector('[data-mindmap-node="b0"] rect') as SVGRectElement;
    expect(branch.getAttribute('stroke')).toBe('#ff0000');
  });

  it('applies the stored title / label / desc fonts', () => {
    const c = mount(<MindmapTreeRenderer data={data()} />);
    const heading = c.querySelector('h2') as HTMLElement;
    expect(heading.style.fontFamily).toContain('Georgia');
    expect(heading.style.fontWeight).toBe('700');
    const branch = c.querySelector('[data-mindmap-node="b0"] text') as SVGTextElement;
    expect(branch.getAttribute('font-family')).toContain('ui-monospace');
    expect(branch.getAttribute('font-weight')).toBe('500');
    const root = c.querySelector('[data-mindmap-node="root"] text') as SVGTextElement;
    expect(root.getAttribute('font-family')).toContain('Georgia');
    const explanation = c.querySelector('p') as HTMLElement;
    expect(explanation.style.fontFamily).toContain('Segoe Print');
  });
});
