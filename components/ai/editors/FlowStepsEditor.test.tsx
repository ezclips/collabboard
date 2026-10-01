// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FlowGraph } from '@/lib/ai/outlineToVisuals';
import FlowStepsEditor from './FlowStepsEditor';

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

const GRAPH: FlowGraph = {
  direction: 'LR',
  nodes: [{ id: 'N0', label: 'Start' }, { id: 'N1', label: 'End' }],
  edges: [{ from: 'N0', to: 'N1' }],
};

describe('PATCH-240 Flow connections rows shrink instead of overflowing', () => {
  it('the from/to selects carry min-w-0 so they shrink inside the left column', () => {
    const c = mount(<FlowStepsEditor graph={GRAPH} onChange={vi.fn()} />);
    const from = c.querySelector('[data-ai-flow-edge-from="0"]') as HTMLSelectElement;
    const to = c.querySelector('[data-ai-flow-edge-to="0"]') as HTMLSelectElement;
    expect(from.className).toContain('min-w-0');
    expect(to.className).toContain('min-w-0');
  });
});
