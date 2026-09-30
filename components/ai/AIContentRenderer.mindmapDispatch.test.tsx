// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIContentRenderer from './AIContentRenderer';

vi.mock('./renderers/MindmapTreeRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'tree-renderer' }),
}));
vi.mock('./renderers/CodeDiagramRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'code-renderer' }),
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

function envelope(tree?: { label: string }): unknown {
  return {
    mode: 'diagram',
    version: 1,
    data: {
      type: 'diagram',
      subtype: 'mindmap',
      renderer: 'diagram_code',
      title: 'Water cycle',
      code: 'mindmap\n  root((water))',
      ...(tree ? { tree } : {}),
    },
    meta: { renderer: 'diagram_code', subtype: 'mindmap' },
  };
}

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('PATCH-234 AIContentRenderer mindmap dispatch', () => {
  it('a mindmap with a tree renders the tree renderer', async () => {
    const c = mount(<AIContentRenderer content={envelope({ label: 'Root' })} />);
    await flush();
    expect(c.querySelector('[data-testid="tree-renderer"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="code-renderer"]')).toBeNull();
  });

  it('a mindmap without a tree renders the code renderer', async () => {
    const c = mount(<AIContentRenderer content={envelope()} />);
    await flush();
    expect(c.querySelector('[data-testid="code-renderer"]')).not.toBeNull();
    expect(c.querySelector('[data-testid="tree-renderer"]')).toBeNull();
  });
});
