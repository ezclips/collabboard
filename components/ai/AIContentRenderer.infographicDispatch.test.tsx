// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIContentRenderer from './AIContentRenderer';

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
    subtype: 'infographic',
    renderer: 'infographic',
    title: 'T',
    template: 'pyramid',
    outline: { title: 'T', ordered: false, kind: 'levels', items: [{ label: 'A' }, { label: 'B' }] },
  },
  meta: { renderer: 'infographic', subtype: 'infographic' },
};

describe('PATCH-236 AIContentRenderer infographic dispatch', () => {
  it('routes an infographic to the new renderer', async () => {
    const c = mount(<AIContentRenderer content={envelope} />);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(c.querySelector('[data-testid="infographic-renderer"]')).not.toBeNull();
  });
});
