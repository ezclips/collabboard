// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { MindmapDiagramData } from '@/lib/ai/contracts';
import { layoutMindmap, type MindmapTree } from '@/lib/ai/mindmapLayout';
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

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function keydown(el: Element, key: string) {
  act(() => { el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const tree: MindmapTree = {
  label: 'Water cycle',
  children: [
    { label: 'Evaporation', children: [{ label: 'Oceans' }, { label: 'Lakes' }] },
    { label: 'Condensation' },
  ],
};

function data(t: MindmapTree = tree): MindmapDiagramData {
  return { type: 'diagram', subtype: 'mindmap', renderer: 'diagram_code', title: t.label, code: 'mindmap\n  root((x))', tree: t };
}

describe('PATCH-240 MindmapTreeRenderer edit handles', () => {
  it('renames a branch on the picture', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-ref="0"]') as Element);
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    expect(input.value).toBe('Evaporation');
    setInputValue(input, 'Evap');
    keydown(input, 'Enter');
    expect((onChange.mock.calls[0][0] as MindmapTree).children![0].label).toBe('Evap');
  });

  it('renames the root on the picture and opens with initialEditRef', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeRenderer data={data()} edit={{ onChange }} initialEditRef="root" />);
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    expect(input.value).toBe('Water cycle');
    setInputValue(input, 'The cycle');
    keydown(input, 'Enter');
    expect((onChange.mock.calls[0][0] as MindmapTree).label).toBe('The cycle');
  });

  it('+ on the root adds a branch and + on a branch adds a leaf', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-add="root:right"]') as Element);
    expect((onChange.mock.calls[0][0] as MindmapTree).children!.map((b) => b.label)).toContain('New branch');

    onChange.mockClear();
    click(c.querySelector('[data-ai-edit-add="0"]') as Element);
    expect((onChange.mock.calls[0][0] as MindmapTree).children![0].children!.map((l) => l.label)).toContain('New point');
  });

  it('− on a leaf removes it', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeRenderer data={data()} edit={{ onChange }} />);
    click(c.querySelector('[data-ai-edit-remove="0.1"]') as Element);
    expect((onChange.mock.calls[0][0] as MindmapTree).children![0].children!.map((l) => l.label)).toEqual(['Oceans']);
  });

  it('non-editable mind map carries data-ai-edit-ref but no handles', () => {
    const c = mount(<MindmapTreeRenderer data={data()} />);
    expect(c.querySelector('[data-ai-edit-ref="0"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-add]')).toBeNull();
    expect(c.querySelector('[data-ai-edit-remove]')).toBeNull();
    expect(c.querySelector('[data-ai-edit-overlay="true"]')).toBeNull();
  });
});

const twoBranches: MindmapTree = {
  label: 'Root',
  children: [{ label: 'Food' }, { label: 'Venue' }],
};

function handleCenter(c: HTMLElement, selector: string): { x: number; y: number } {
  const svg = c.querySelector('[data-mindmap-svg]') as SVGSVGElement;
  const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
  const btn = c.querySelector(selector) as HTMLElement;
  expect(btn, `missing handle ${selector}`).not.toBeNull();
  return {
    x: (parseFloat(btn.style.left) / 100) * w,
    y: (parseFloat(btn.style.top) / 100) * h,
  };
}

describe('PATCH-242 MindmapTreeRenderer handle placement and sides', () => {
  it('no +/− handle sits inside any node box (words are never covered)', () => {
    const c = mount(<MindmapTreeRenderer data={data(twoBranches)} edit={{ onChange: vi.fn() }} />);
    const layout = layoutMindmap(twoBranches);
    const svg = c.querySelector('[data-mindmap-svg]') as SVGSVGElement;
    const [, , w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
    const handles = Array.from(c.querySelectorAll('[data-ai-edit-add],[data-ai-edit-remove]'));
    expect(handles.length).toBeGreaterThan(0);
    for (const handle of handles) {
      const el = handle as HTMLElement;
      const x = (parseFloat(el.style.left) / 100) * w;
      const y = (parseFloat(el.style.top) / 100) * h;
      for (const node of layout.nodes) {
        const left = node.x - node.w / 2;
        const right = node.x + node.w / 2;
        const top = node.y - node.h / 2;
        const bottom = node.y + node.h / 2;
        const inside = x > left && x < right && y > top && y < bottom;
        expect(inside, `handle inside ${node.id}`).toBe(false);
      }
    }
  });

  it('the + sits on the outer edge: right for a right branch, left for a left branch', () => {
    const c = mount(<MindmapTreeRenderer data={data(twoBranches)} edit={{ onChange: vi.fn() }} />);
    const layout = layoutMindmap(twoBranches);
    const right = layout.nodes.find((n) => n.id === 'b0')!;
    const left = layout.nodes.find((n) => n.id === 'b1')!;
    expect(handleCenter(c, '[data-ai-edit-add="0"]').x).toBeGreaterThan(right.x + right.w / 2);
    expect(handleCenter(c, '[data-ai-edit-add="1"]').x).toBeLessThan(left.x - left.w / 2);
    // The − sits on the inner edge (toward the root).
    expect(handleCenter(c, '[data-ai-edit-remove="1"]').x).toBeGreaterThan(left.x + left.w / 2);
  });

  it('the root gets two +, each adding a branch on its own side with the rest frozen', () => {
    const onChange = vi.fn();
    const c = mount(<MindmapTreeRenderer data={data(twoBranches)} edit={{ onChange }} />);
    expect(c.querySelector('[data-ai-edit-add="root:left"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-add="root:right"]')).not.toBeNull();

    click(c.querySelector('[data-ai-edit-add="root:left"]') as Element);
    const leftNext = onChange.mock.calls[0][0] as MindmapTree;
    expect(leftNext.children!.map((b) => b.label)).toContain('New branch');
    expect(leftNext.children!.filter((b) => b.label === 'New branch')[0].side).toBe('left');
    expect(leftNext.children!.find((b) => b.label === 'Food')!.side).toBe('right');
    expect(leftNext.children!.find((b) => b.label === 'Venue')!.side).toBe('left');

    onChange.mockClear();
    click(c.querySelector('[data-ai-edit-add="root:right"]') as Element);
    const rightNext = onChange.mock.calls[0][0] as MindmapTree;
    expect(rightNext.children!.filter((b) => b.label === 'New branch')[0].side).toBe('right');
  });

  it('hides every +/− handle while a rename input is open', () => {
    const c = mount(<MindmapTreeRenderer data={data(twoBranches)} edit={{ onChange: vi.fn() }} />);
    expect(c.querySelector('[data-ai-edit-add]')).not.toBeNull();
    click(c.querySelector('[data-ai-edit-ref="0"]') as Element);
    expect(c.querySelector('[data-ai-edit-input="true"]')).not.toBeNull();
    expect(c.querySelector('[data-ai-edit-add]')).toBeNull();
    expect(c.querySelector('[data-ai-edit-remove]')).toBeNull();
  });
});
