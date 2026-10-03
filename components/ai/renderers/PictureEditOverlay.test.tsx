// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PictureEditOverlay from './PictureEditOverlay';
import { PictureZoomContext } from './PictureStage';

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

describe('PATCH-240 PictureEditOverlay', () => {
  it('renders + and − handles and calls their handlers', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const c = mount(
      <PictureEditOverlay
        handles={[
          { key: 'add-0', kind: 'add', left: 10, top: 20, target: '0', onActivate: onAdd },
          { key: 'remove-2', kind: 'remove', left: 30, top: 40, target: '2', onActivate: onRemove },
        ]}
      />,
    );
    click(c.querySelector('[data-ai-edit-add="0"]') as Element);
    click(c.querySelector('[data-ai-edit-remove="2"]') as Element);
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('shows an input, commits on Enter', () => {
    const onCommit = vi.fn();
    const c = mount(
      <PictureEditOverlay
        handles={[]}
        activeEdit={{ key: 'label:1', value: 'Summer', maxLength: 40, left: 0, top: 0, onCommit, onCancel: vi.fn() }}
      />,
    );
    const input = c.querySelector('[data-ai-edit-input="true"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.value).toBe('Summer');
    expect(input.maxLength).toBe(40);

    setInputValue(input, 'High summer');
    keydown(input, 'Enter');
    expect(onCommit).toHaveBeenCalledWith('High summer');
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    const c = mount(
      <PictureEditOverlay
        handles={[]}
        activeEdit={{ key: 'label:1', value: 'Summer', maxLength: 40, left: 0, top: 0, onCommit: vi.fn(), onCancel }}
      />,
    );
    keydown(c.querySelector('[data-ai-edit-input="true"]') as Element, 'Escape');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders the six swatches plus Auto and reports the pick', () => {
    const onPick = vi.fn();
    const c = mount(
      <PictureEditOverlay
        handles={[]}
        colorPopover={{ key: 'c0', left: 5, top: 5, swatches: ['#a', '#b', '#c', '#d', '#e', '#f'], onPick }}
      />,
    );
    click(c.querySelector('[data-ai-edit-color="3"]') as Element);
    click(c.querySelector('[data-ai-edit-color="auto"]') as Element);
    expect(onPick).toHaveBeenNthCalledWith(1, 3);
    expect(onPick).toHaveBeenNthCalledWith(2, null);
  });
});

// ── PATCH-263 Addendum 1: on-screen size, hover gating and node clearance ─────

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
}

/** The real on-screen box the test tells the layer it occupies. */
function mockLayer(container: HTMLElement, width: number, height: number) {
  const layer = container.querySelector('[data-ai-edit-overlay]') as HTMLElement;
  layer.getBoundingClientRect = () => rect(0, 0, width, height) as DOMRect;
  Object.defineProperty(layer, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(layer, 'offsetHeight', { value: height, configurable: true });
  act(() => { window.dispatchEvent(new Event('resize')); });
  return layer;
}

function scaleOf(el: HTMLElement): number {
  const match = /scale\(([\d.]+)\)/.exec(el.style.transform);
  return match ? Number(match[1]) : Number.NaN;
}

function move(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX, clientY }));
  });
}

describe('PATCH-263 Addendum 1 PictureEditOverlay', () => {
  it('sizes every control from the layer real screen scale, not the context zoom', () => {
    const c = mount(
      <PictureZoomContext.Provider value={0.5}>
        <PictureEditOverlay
          handles={[{ key: 'add-0', kind: 'add', left: 50, top: 50, target: '0', onActivate: vi.fn() }]}
          activeEdit={{ key: 'label:1', value: 'Summer', maxLength: 40, left: 0, top: 0, onCommit: vi.fn(), onCancel: vi.fn() }}
          colorPopover={{ key: 'c0', left: 5, top: 5, swatches: ['#a', '#b', '#c', '#d', '#e', '#f'], onPick: vi.fn() }}
        />
      </PictureZoomContext.Provider>,
    );
    // The layer is NOT css-scaled (rect === offsetWidth): the context zoom of
    // 0.5 must be ignored, so every control keeps scale 1.
    mockLayer(c, 400, 300);

    expect(18 * scaleOf(c.querySelector('[data-ai-edit-add="0"]') as HTMLElement)).toBeCloseTo(18, 6);
    expect(scaleOf(c.querySelector('[data-ai-edit-input="true"]') as HTMLElement)).toBeCloseTo(1, 6);
    expect(scaleOf(c.querySelector('[data-ai-edit-color-popover="true"]') as HTMLElement)).toBeCloseTo(1, 6);
  });

  it('lets only the hovered node\u2019s handle take pointer events; the other stays click-through', () => {
    const c = mount(
      <PictureEditOverlay
        handles={[
          { key: 'add-a', kind: 'add', left: 10, top: 10, target: 'a', nodeKey: 'a', nodeBox: { left: 0, top: 0, width: 20, height: 20 }, onActivate: vi.fn() },
          { key: 'add-b', kind: 'add', left: 90, top: 90, target: 'b', nodeKey: 'b', nodeBox: { left: 80, top: 80, width: 20, height: 20 }, onActivate: vi.fn() },
        ]}
      />,
    );
    mockLayer(c, 200, 200);

    const a = c.querySelector('[data-ai-edit-add="a"]') as HTMLElement;
    const b = c.querySelector('[data-ai-edit-add="b"]') as HTMLElement;
    // Neither node is hovered yet: both are click-through.
    expect(a.style.pointerEvents).toBe('none');
    expect(b.style.pointerEvents).toBe('none');

    move(20, 20); // inside node a's box (0..20% of a 200px layer)

    expect(a.style.pointerEvents).toBe('auto');
    expect(a.style.opacity).toBe('1');
    expect(b.style.pointerEvents).toBe('none');
    expect(b.style.opacity).toBe('0');
  });

  it('keeps a visible handle\u2019s full rect clear of its node box', () => {
    const c = mount(
      <PictureEditOverlay
        handles={[
          // Node a screen box is 0..40; its handle centre sits 12px past the
          // edge (52), so an 18px handle (half 9) clears it by 3px.
          { key: 'add-a', kind: 'add', left: 26, top: 26, target: 'a', nodeKey: 'a', nodeBox: { left: 0, top: 0, width: 20, height: 20 }, onActivate: vi.fn() },
        ]}
      />,
    );
    mockLayer(c, 200, 200);
    move(20, 20);

    const button = c.querySelector('[data-ai-edit-add="a"]') as HTMLElement;
    expect(button.style.opacity).toBe('1');
    const half = (18 * scaleOf(button)) / 2;
    const cx = (parseFloat(button.style.left) / 100) * 200;
    const cy = (parseFloat(button.style.top) / 100) * 200;
    const node = { left: 0, top: 0, right: 40, bottom: 40 };
    const handle = { left: cx - half, top: cy - half, right: cx + half, bottom: cy + half };
    const intersects = handle.left < node.right && handle.right > node.left && handle.top < node.bottom && handle.bottom > node.top;
    expect(intersects).toBe(false);
  });
});
