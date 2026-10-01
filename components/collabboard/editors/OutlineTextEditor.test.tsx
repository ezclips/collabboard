// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { VisualOutline } from '@/lib/ai/outline';
import OutlineTextEditor from './OutlineTextEditor';

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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function outline(count: number): VisualOutline {
  return {
    title: 'Seasons',
    ordered: false,
    kind: 'levels',
    items: Array.from({ length: count }, (_, i) => ({ label: `Item ${i + 1}` })),
  };
}

describe('PATCH-242 OutlineTextEditor "Add item" side', () => {
  it('adds on the side with fewer items (tie -> right)', () => {
    const onChange = vi.fn();
    const c = mount(<OutlineTextEditor outline={outline(3)} onChange={onChange} />);
    click(c.querySelector('[data-ai-outline-add-item="true"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((i) => i.label)).toEqual(['Item 1', 'Item 2', 'Item 3', 'New item']);
    // Default sides for three items are right/left/right -> left has fewer.
    expect(next.items.map((i) => i.side)).toEqual(['right', 'left', 'right', 'left']);
  });

  it('breaks a tie to the right', () => {
    const onChange = vi.fn();
    const c = mount(<OutlineTextEditor outline={outline(2)} onChange={onChange} />);
    click(c.querySelector('[data-ai-outline-add-item="true"]') as Element);
    const next = onChange.mock.calls[0][0] as VisualOutline;
    expect(next.items.map((i) => i.side)).toEqual(['right', 'left', 'right']);
  });
});
