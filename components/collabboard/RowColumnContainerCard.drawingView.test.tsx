// @vitest-environment jsdom
//
// PATCH-317. RowColumnContainerCard used to pass onView unconditionally, so a
// drawing child showed the "Click to view full size" tooltip and zoom cursor
// even in a host that never wired onViewDrawing. It now only wires the
// affordance when the host can actually open the viewer.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RowColumnContainerCard from './RowColumnContainerCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

const containerPadlet = () => ({ id: 'container-1', title: 'Container', content: '', type: 'container', metadata: {} });
const drawingChild = () => ({
  id: 'draw-1',
  title: 'Sketch',
  content: '',
  type: 'drawing',
  metadata: { parentId: 'container-1', previewUrl: 'data:image/png;base64,AAAA' },
});

const preview = (el: HTMLElement) => el.querySelector<HTMLElement>('[title="Click to view full size"]');

describe('PATCH-317: a drawing child only promises a viewer that exists', () => {
  it('calls onViewDrawing with that child when its preview is clicked', () => {
    const onViewDrawing = vi.fn();
    const child = drawingChild();
    const el = mount(
      <RowColumnContainerCard padlet={containerPadlet() as any} allPadlets={[child] as any} onViewDrawing={onViewDrawing} />,
    );

    const target = preview(el);
    expect(target).not.toBeNull();
    act(() => {
      target!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onViewDrawing).toHaveBeenCalledWith(child);
  });

  it('shows no tooltip and no zoom cursor when no onViewDrawing is wired', () => {
    const el = mount(<RowColumnContainerCard padlet={containerPadlet() as any} allPadlets={[drawingChild()] as any} />);
    expect(preview(el)).toBeNull();
    expect(el.querySelector('.cursor-zoom-in')).toBeNull();
  });
});
