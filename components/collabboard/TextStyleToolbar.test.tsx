// @vitest-environment jsdom
//
// PATCH-315. The floating text-style bar: each control reports the merged
// style, the colour popover works, buttons keep the text input's focus, and
// nothing inside the bar reaches the surface beneath it.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TextStyleToolbar from './TextStyleToolbar';
import type { TextStyle } from '@/lib/domain/canvas/textStyle';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANCHOR = {
  left: 0,
  top: 100,
  width: 100,
  height: 20,
  right: 100,
  bottom: 120,
  x: 0,
  y: 100,
  toJSON: () => ({}),
} as DOMRect;

let root: Root | null = null;
let container: HTMLElement;

async function mount(value: TextStyle, onChange: (next: TextStyle) => void) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(<TextStyleToolbar value={value} onChange={onChange} anchorRect={ANCHOR} />);
  });
  return container;
}

const q = (selector: string) => container.querySelector(selector) as HTMLElement | null;

function setSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')!.set!;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

beforeEach(() => {
  document.body.innerHTML = '';
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('PATCH-315: the floating text-style bar', () => {
  it('reports a font choice merged into the current style', async () => {
    const onChange = vi.fn();
    await mount({ bold: true }, onChange);
    await act(async () => {
      setSelect(q('select[aria-label="Font"]') as HTMLSelectElement, 'serif');
    });
    expect(onChange).toHaveBeenCalledWith({ bold: true, fontFamily: 'serif' });
  });

  it('reports a size choice as a number', async () => {
    const onChange = vi.fn();
    await mount({}, onChange);
    await act(async () => {
      setSelect(q('select[aria-label="Text size"]') as HTMLSelectElement, '18');
    });
    expect(onChange).toHaveBeenCalledWith({ fontSize: 18 });
  });

  it('toggles bold and cycles alignment', async () => {
    const onChange = vi.fn();
    await mount({}, onChange);
    await act(async () => {
      q('button[aria-label="Bold"]')!.click();
    });
    expect(onChange).toHaveBeenCalledWith({ bold: true });

    await act(async () => {
      q('button[aria-label="Text alignment"]')!.click();
    });
    expect(onChange).toHaveBeenCalledWith({ align: 'center' });
  });

  it('opens the colour popover and sets a swatch colour', async () => {
    const onChange = vi.fn();
    await mount({}, onChange);
    expect(container.querySelector('[aria-label="Text colour palette"]')).toBeNull();

    await act(async () => {
      q('button[aria-label="Text colour"]')!.click();
    });
    expect(container.querySelector('[aria-label="Text colour palette"]')).not.toBeNull();

    await act(async () => {
      q('button[aria-label="Set colour #ef4444"]')!.click();
    });
    expect(onChange).toHaveBeenCalledWith({ color: '#ef4444' });
  });

  it('defaults a button mousedown so the text input keeps focus', async () => {
    await mount({}, vi.fn());
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    q('button[aria-label="Bold"]')!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it('stops pointer and click events reaching the parent', async () => {
    const onClick = vi.fn();
    const onMouseDown = vi.fn();
    const onChange = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <div onClick={onClick} onMouseDown={onMouseDown}>
          <TextStyleToolbar value={{}} onChange={onChange} anchorRect={ANCHOR} />
        </div>,
      );
    });

    const bold = q('button[aria-label="Bold"]')!;
    await act(async () => {
      bold.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      bold.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      bold.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onClick).not.toHaveBeenCalled();
    expect(onMouseDown).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith({ bold: true });
  });
});
