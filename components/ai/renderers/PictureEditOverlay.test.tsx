// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PictureEditOverlay from './PictureEditOverlay';

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
