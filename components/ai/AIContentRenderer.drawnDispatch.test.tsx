// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIContentRenderer from './AIContentRenderer';

vi.mock('./renderers/DrawnPictureRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'drawn-renderer' }),
}));
vi.mock('./renderers/InfographicRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'infographic-renderer' }),
}));

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

const envelope = {
  mode: 'diagram',
  version: 1,
  data: {
    type: 'diagram',
    subtype: 'drawn',
    renderer: 'drawn',
    title: 'T',
    kind: 'flowchart',
    seed: 3,
    outline: { title: 'T', ordered: false, kind: 'steps', items: [{ label: 'A' }, { label: 'B' }] },
    picture: {
      version: 1,
      width: 800,
      height: 600,
      background: '#ffffff',
      elements: [{ id: 'r', type: 'rect', x: 0, y: 0, w: 100, h: 50, fill: '#aabbcc', stroke: '#000000' }],
    },
  },
  meta: { renderer: 'drawn', subtype: 'drawn' },
};

describe('PATCH-284 AIContentRenderer drawn dispatch', () => {
  it('routes a drawn picture to the drawn renderer', async () => {
    const c = mount(<AIContentRenderer content={envelope} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(c.querySelector('[data-testid="drawn-renderer"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="infographic-renderer"]')).toBeNull();
  });
});
