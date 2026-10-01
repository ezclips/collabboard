// @vitest-environment jsdom
//
// PATCH-243 Addendum 2. On an AntV mind map we hide AntV's squares (they piled
// under the boxes) and draw PATCH-242's handles outside each node box instead.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const MINDMAP = 'antv:hierarchy-mindmap-branch-gradient-capsule-item';

const outline: VisualOutline = {
  title: 'Root',
  ordered: false,
  kind: 'list',
  items: [
    { label: 'Food', children: [{ label: 'Pizza' }] },
    { label: 'Venue' },
    { label: 'Travel' },
  ],
};

function data(): InfographicDiagramData {
  return {
    type: 'diagram',
    subtype: 'infographic',
    renderer: 'infographic',
    title: outline.title,
    template: `antv:${MINDMAP.slice('antv:'.length)}` as `antv:${string}`,
    outline,
  };
}

interface NodeBox {
  indexes: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Independent read of each node's on-screen box from the rendered SVG. */
function nodeBoxes(c: HTMLElement): NodeBox[] {
  const labels = Array.from(c.querySelectorAll('[data-element-type="item-label"][data-indexes]'));
  const seen = new Set<string>();
  const boxes: NodeBox[] = [];
  for (const label of labels) {
    const indexes = label.getAttribute('data-indexes')!;
    if (seen.has(indexes)) continue;
    seen.add(indexes);
    let group: Element | null = label.parentElement;
    let shape: Element | undefined;
    while (group) {
      shape = Array.from(group.children).find((child) => child.getAttribute('data-element-type') === 'shape');
      if (shape) break;
      group = group.parentElement;
    }
    if (!group || !shape) continue;
    boxes.push({
      indexes,
      x: Number(group.getAttribute('x')),
      y: Number(group.getAttribute('y')),
      w: Number(shape.getAttribute('width')),
      h: Number(shape.getAttribute('height')),
    });
  }
  return boxes;
}

function viewBox(c: HTMLElement): [number, number, number, number] {
  const svg = c.querySelector('svg')!;
  return svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number];
}

describe('PATCH-243 Addendum 2 AntV mind-map handles', () => {
  it('draws our handles outside every node box and hides AntV\u2019s group', async () => {
    const c = mount(<AntvInfographicRenderer data={data()} edit={{ onChange: vi.fn() }} />);
    expect(await waitFor(c, '[data-ai-edit-add]')).not.toBeNull();
    expect(c.querySelector('[data-antv-mindmap-overlay]')).not.toBeNull();
    expect(c.querySelector('[data-antv-container] [data-antv-editable]')).toBeNull();

    const [minX, minY, vbW, vbH] = viewBox(c);
    const boxes = nodeBoxes(c);
    expect(boxes.length).toBeGreaterThan(1);

    const handles = Array.from(
      c.querySelectorAll('[data-ai-edit-add],[data-ai-edit-remove]'),
    ) as HTMLElement[];
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) {
      const x = (parseFloat(handle.style.left) / 100) * vbW + minX;
      const y = (parseFloat(handle.style.top) / 100) * vbH + minY;
      for (const box of boxes) {
        const inside = x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
        expect(inside, `handle ${handle.getAttribute('data-ai-edit-add') ?? handle.getAttribute('data-ai-edit-remove')} inside ${box.indexes}`).toBe(false);
      }
    }
  }, 30000);

  it('root:right adds a right-side branch and a branch + adds a child', async () => {
    const onChange = vi.fn();
    const c = mount(<AntvInfographicRenderer data={data()} edit={{ onChange }} />);
    expect(await waitFor(c, '[data-ai-edit-add="root:right"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-add="root:left"]')).not.toBeNull();

    click(c.querySelector('[data-ai-edit-add="root:right"]') as Element);
    const branched = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(branched.items).toHaveLength(outline.items.length + 1);
    expect(branched.items.at(-1)!.side).toBe('right');
    // Existing branches keep the side they were on.
    expect(branched.items[0].side).toBe('right');
    expect(branched.items[1].side).toBe('left');

    onChange.mockClear();
    click(c.querySelector('[data-ai-edit-add="add:0"]') as Element);
    const child = onChange.mock.calls.at(-1)![0] as VisualOutline;
    expect(child.items[0].children?.map((entry) => entry.label)).toEqual(['Pizza', 'New point']);
  }, 30000);
});
