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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
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

describe('PATCH-242 MindmapTreeEditor "+ Add branch" side', () => {
  const newNode = (t: MindmapTree) => t.children!.find((b) => b.label === 'New branch')!;

  it('adds on the side with fewer branches (one right branch -> left)', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeEditor tree={{ label: 'Root', children: [{ label: 'A' }] }} onChange={onChange} />);
    click(c.querySelector('[data-ai-mindmap-add-branch="true"]') as Element);
    const next = onChange.mock.calls[0][0] as MindmapTree;
    expect(newNode(next).side).toBe('left');
  });

  it('breaks a tie to the right (one per side -> right)', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeEditor tree={{ label: 'Root', children: [{ label: 'A' }, { label: 'B' }] }} onChange={onChange} />);
    click(c.querySelector('[data-ai-mindmap-add-branch="true"]') as Element);
    const next = onChange.mock.calls[0][0] as MindmapTree;
    expect(newNode(next).side).toBe('right');
    // New branch sits after the last right branch; the rest are frozen.
    expect(next.children!.map((b) => b.side)).toEqual(['right', 'right', 'left']);
  });
});
