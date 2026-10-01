// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import type { MindmapDiagramData } from '@/lib/ai/contracts';
import { VISUAL_PALETTE } from '@/lib/ai/visualPalette';
import { VISUAL_THEMES, type VisualThemeId } from '@/lib/ai/visualThemes';
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

function data(tree: MindmapDiagramData['tree']): MindmapDiagramData {
  return {
    type: 'diagram',
    subtype: 'mindmap',
    renderer: 'diagram_code',
    title: 'Water cycle',
    code: 'mindmap\n  root((water))',
    tree,
  };
}

describe('PATCH-234 MindmapTreeRenderer', () => {
  it('renders every label as text', () => {
    const c = mount(
      <MindmapTreeRenderer
        data={data({ label: 'Root name', children: [{ label: 'Branch A', children: [{ label: 'Leaf A1' }] }] })}
      />,
    );
    const text = c.textContent ?? '';
    expect(text).toContain('Root name');
    expect(text).toContain('Branch A');
    expect(text).toContain('Leaf A1');
  });

  it('renders a hostile label as literal text with no img element', () => {
    const c = mount(<MindmapTreeRenderer data={data({ label: '<img src=x onerror=alert(1)>' })} />);
    expect(c.querySelector('img')).toBeNull();
    expect(c.querySelector('svg')).not.toBeNull();
    expect(c.textContent ?? '').toContain('onerror=alert(1)>');
  });

  it('paints a branch rect with its palette fill and stroke', () => {
    const c = mount(<MindmapTreeRenderer data={data({ label: 'Root', children: [{ label: 'Branch A' }] })} />);
    const rect = c.querySelector('[data-mindmap-node="b0"] rect')!;
    expect(rect.getAttribute('fill')).toBe(VISUAL_PALETTE[0].fill);
    expect(rect.getAttribute('stroke')).toBe(VISUAL_PALETTE[0].stroke);
  });

  it('PATCH-238: teal-night paints the theme background and keeps the labels', () => {
    const c = mount(
      <MindmapTreeRenderer
        data={{ ...data({ label: 'Root name', children: [{ label: 'Branch A' }] }), theme: 'teal-night' }}
      />,
    );
    const block = c.querySelector('[data-ai-theme-background]') as HTMLElement;
    expect(block.style.backgroundColor).toBe('rgb(30, 77, 70)'); // #1E4D46
    expect(c.textContent).toContain('Root name');
    expect(c.textContent).toContain('Branch A');
  });

  it('PATCH-238 Addendum 1: every theme colours branch and leaf nodes with their palette entry', () => {
    const tree = { label: 'Root', children: [{ label: 'Branch A', children: [{ label: 'Leaf A1' }] }] };
    for (const id of Object.keys(VISUAL_THEMES) as VisualThemeId[]) {
      const entry = VISUAL_THEMES[id].palette[0];
      const c = mount(<MindmapTreeRenderer data={{ ...data(tree), theme: id }} />);
      for (const nodeId of ['b0', 'b0l0']) {
        expect((c.querySelector(`[data-mindmap-node="${nodeId}"] rect`) as SVGRectElement).getAttribute('fill'), `${id}/${nodeId}`).toBe(entry.fill);
        expect((c.querySelector(`[data-mindmap-node="${nodeId}"] text`) as SVGTextElement).getAttribute('fill'), `${id}/${nodeId}`).toBe(entry.text);
      }
    }
  });
});
