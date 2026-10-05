// @vitest-environment jsdom
//
// PATCH-285. The drawn picture becomes selectable: a click names the element it
// hit, a click on the ground names the picture (null), and only edit mode wires
// handlers at all.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DrawnDiagramData } from '@/lib/ai/contracts';
import type { DrawnPicture } from '@/lib/ai/drawn/format';

import DrawnPictureRenderer from './DrawnPictureRenderer';

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

const outline = { title: 'T', ordered: false, kind: 'steps' as const, items: [{ label: 'A' }] };

const picture: DrawnPicture = {
  version: 1,
  width: 800,
  height: 600,
  background: '#ffffff',
  elements: [
    { id: 'e3', type: 'rect', x: 10, y: 10, w: 200, h: 80, fill: '#dceef5', stroke: '#2c7da0' },
    { id: 'e4', type: 'text', text: 'Hello', x: 20, y: 30, w: 180, size: 16, color: '#111111', in: 'e3' },
  ],
};

function data(): DrawnDiagramData {
  return { type: 'diagram', subtype: 'drawn', renderer: 'drawn', title: 'T', kind: 'flowchart', seed: 1, outline, picture };
}

describe('PATCH-285 DrawnPictureRenderer selection', () => {
  it('calls onSelect with the element id when editable', () => {
    const onSelect = vi.fn();
    const c = mount(<DrawnPictureRenderer data={data()} editable onSelect={onSelect} />);
    const target = c.querySelector('[data-drawn-id="e3"]') as Element;
    expect(target).not.toBeNull();
    click(target);
    expect(onSelect).toHaveBeenCalledWith('e3');
  });

  it('calls onSelect(null) on a ground click', () => {
    const onSelect = vi.fn();
    const c = mount(<DrawnPictureRenderer data={data()} editable onSelect={onSelect} />);
    click(c.querySelector('svg > rect') as Element);
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('wires no handlers when not editable', () => {
    const onSelect = vi.fn();
    const c = mount(<DrawnPictureRenderer data={data()} onSelect={onSelect} />);
    click(c.querySelector('[data-drawn-id="e3"]') as Element);
    click(c.querySelector('svg > rect') as Element);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the selected node with data-drawn-selected', () => {
    const c = mount(<DrawnPictureRenderer data={data()} editable selectedId="e3" onSelect={() => {}} />);
    expect(c.querySelector('[data-drawn-id="e3"]')!.getAttribute('data-drawn-selected')).toBe('true');
    expect(c.querySelector('[data-drawn-id="e4"]')!.getAttribute('data-drawn-selected')).toBeNull();
  });

  it('escapes a hostile id so it stays inert', () => {
    const hostile: DrawnPicture = {
      ...picture,
      elements: [
        { id: 'x"/><script>alert(1)</script>', type: 'rect', x: 0, y: 0, w: 10, h: 10, fill: '#ffffff', stroke: '#000000' },
      ],
    };
    const c = mount(
      <DrawnPictureRenderer
        data={{ ...data(), picture: hostile }}
        editable
        onSelect={() => {}}
      />,
    );
    const root = c.querySelector('[data-ai-drawn="true"]') as HTMLElement;
    // The id lands inside the attribute, sanitised: no markup can break out.
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('[onload]')).toBeNull();
    expect(root.innerHTML).not.toContain('<script');
    expect(root.querySelector('rect[data-drawn-id]')!.getAttribute('data-drawn-id')).toMatch(/^[A-Za-z0-9_.:-]+$/);
  });
});
