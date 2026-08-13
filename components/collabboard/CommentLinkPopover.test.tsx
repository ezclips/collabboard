// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CommentLinkPopover } from './CommentLinkPopover';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return { container, root };
}
afterEach(() => {
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
});

const noop = () => {};

describe('CommentLinkPopover', () => {
  it('renders the supplied URL value', () => {
    const { container } = mount(
      <CommentLinkPopover url="https://example.com" onUrlChange={noop} onApply={noop} onCancel={noop} inputClassName="in" applyButtonClassName="btn" />
    );
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('https://example.com');
  });

  it('reports a new value via onUrlChange as the user types', () => {
    const onUrlChange = vi.fn();
    const { container } = mount(
      <CommentLinkPopover url="" onUrlChange={onUrlChange} onApply={noop} onCancel={noop} inputClassName="in" applyButtonClassName="btn" />
    );
    const input = container.querySelector('input') as HTMLInputElement;
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      nativeInputValueSetter.call(input, 'example.com');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(onUrlChange).toHaveBeenCalledWith('example.com');
  });

  it('applies on Enter', () => {
    const onApply = vi.fn();
    const { container } = mount(
      <CommentLinkPopover url="x" onUrlChange={noop} onApply={onApply} onCancel={noop} inputClassName="in" applyButtonClassName="btn" />
    );
    const input = container.querySelector('input') as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });

  it('cancels on Escape', () => {
    const onCancel = vi.fn();
    const { container } = mount(
      <CommentLinkPopover url="x" onUrlChange={noop} onApply={noop} onCancel={onCancel} inputClassName="in" applyButtonClassName="btn" />
    );
    const input = container.querySelector('input') as HTMLInputElement;
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('applies when the Add button is clicked', () => {
    const onApply = vi.fn();
    const { container } = mount(
      <CommentLinkPopover url="x" onUrlChange={noop} onApply={onApply} onCancel={noop} inputClassName="in" applyButtonClassName="btn" />
    );
    const button = container.querySelector('button') as HTMLButtonElement;
    act(() => {
      button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onApply).toHaveBeenCalledTimes(1);
  });
});
