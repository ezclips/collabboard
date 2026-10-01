// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MindmapTree } from '@/lib/ai/mindmapLayout';
import MindmapTreeEditor from './MindmapTreeEditor';

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

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const TREE: MindmapTree = {
  label: 'Water cycle',
  children: [{ label: 'Evaporation' }, { label: 'Condensation' }],
};

describe('PATCH-241 MindmapTreeEditor', () => {
  it('has no separate Centre topic field', () => {
    const c = mount(<MindmapTreeEditor tree={TREE} onChange={vi.fn()} />);
    expect(c.querySelector('[data-ai-mindmap-title]')).toBeNull();
    expect(c.querySelector('[data-ai-mindmap-editor]')).not.toBeNull();
  });

  it('renaming a branch keeps the root label intact', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeEditor tree={TREE} onChange={onChange} />);
    setInputValue(c.querySelector('[data-ai-mindmap-branch="0"]') as HTMLInputElement, 'Evaporation X');
    const next = onChange.mock.calls[0][0] as MindmapTree;
    expect(next.label).toBe('Water cycle');
    expect(next.children?.[0].label).toBe('Evaporation X');
  });
});
