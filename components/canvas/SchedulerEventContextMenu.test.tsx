// @vitest-environment jsdom
//
// PATCH-308. The menu is portalled, but React still bubbles synthetic events
// through the React tree, so a press inside it reached the scheduler event
// wrapper and was read as a click on the event -- redrawing the calendar and
// discarding the open menu before the item's action fired. Every menu surface
// must stop pointer/mouse/click propagation while keeping its own selection.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import SchedulerEventContextMenu from './SchedulerEventContextMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!('DOMRect' in globalThis)) {
    (globalThis as unknown as { DOMRect: unknown }).DOMRect = class {
      constructor(
        public x = 0,
        public y = 0,
        public width = 0,
        public height = 0,
      ) {}
      get top() { return this.y; }
      get left() { return this.x; }
      get right() { return this.x + this.width; }
      get bottom() { return this.y + this.height; }
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as unknown as { hasPointerCapture?: () => boolean }).hasPointerCapture ??= () => false;
  (Element.prototype as unknown as { setPointerCapture?: () => void }).setPointerCapture ??= () => {};
  (Element.prototype as unknown as { releasePointerCapture?: () => void }).releasePointerCapture ??= () => {};
});

type Spies = { mouseDown: ReturnType<typeof vi.fn>; mouseUp: ReturnType<typeof vi.fn>; click: ReturnType<typeof vi.fn> };

let root: Root | null = null;
let container: HTMLElement;

function handlers() {
  return {
    onAddPost: vi.fn(),
    onSetDuration: vi.fn(),
    onSplitInHalf: vi.fn(),
    onSplitIntoQuarterHours: vi.fn(),
    onTrimToHalf: vi.fn(),
    onDeleteEvent: vi.fn(),
    onAddContainer: vi.fn(),
    onChangeColor: vi.fn(),
    onSetDaySpan: vi.fn(),
  };
}

async function mount(menuHandlers: ReturnType<typeof handlers>, spies: Spies) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <div onMouseDown={spies.mouseDown} onMouseUp={spies.mouseUp} onClick={spies.click}>
        <SchedulerEventContextMenu {...menuHandlers} daySpanCount={1}>
          <button data-testid="trigger">event</button>
        </SchedulerEventContextMenu>
      </div>,
    );
  });
}

async function openMenu() {
  const trigger = container.querySelector('[data-testid="trigger"]')!;
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 10, clientY: 10 }));
  });
  return document.querySelector<HTMLElement>('[role="menu"]')!;
}

function itemByText(text: string): HTMLElement {
  const match = Array.from(document.querySelectorAll<HTMLElement>('[role="menuitem"]')).find((el) =>
    el.textContent?.includes(text),
  );
  expect(match, `no menuitem containing "${text}"`).toBeTruthy();
  return match!;
}

async function press(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container?.remove();
  document.body.innerHTML = '';
});

describe('PATCH-308: the scheduler event menu isolates its clicks', () => {
  it('a top-level item fires once and never reaches the parent event wrapper', async () => {
    const menuHandlers = handlers();
    const spies: Spies = { mouseDown: vi.fn(), mouseUp: vi.fn(), click: vi.fn() };
    await mount(menuHandlers, spies);
    await openMenu();

    await press(itemByText('Add post'));

    expect(menuHandlers.onAddPost).toHaveBeenCalledTimes(1);
    expect(spies.mouseDown).not.toHaveBeenCalled();
    expect(spies.mouseUp).not.toHaveBeenCalled();
    expect(spies.click).not.toHaveBeenCalled();
  });

  it('an item inside a submenu fires once and never reaches the parent event wrapper', async () => {
    const menuHandlers = handlers();
    const spies: Spies = { mouseDown: vi.fn(), mouseUp: vi.fn(), click: vi.fn() };
    await mount(menuHandlers, spies);
    await openMenu();

    const subTrigger = Array.from(document.querySelectorAll<HTMLElement>('[aria-haspopup="menu"]')).find((el) =>
      el.textContent?.includes('Set duration'),
    )!;
    await act(async () => {
      subTrigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    });

    await press(itemByText('60 minutes'));

    expect(menuHandlers.onSetDuration).toHaveBeenCalledTimes(1);
    expect(menuHandlers.onSetDuration).toHaveBeenCalledWith(60);
    expect(spies.mouseDown).not.toHaveBeenCalled();
    expect(spies.mouseUp).not.toHaveBeenCalled();
    expect(spies.click).not.toHaveBeenCalled();
  });
});
