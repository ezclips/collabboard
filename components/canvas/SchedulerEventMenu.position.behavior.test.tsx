// @vitest-environment jsdom
//
// PATCH-311 Addendum 1. The event menu opens at the cursor with no bound, so
// its lower items can fall off screen. It must clamp itself inside the window.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SchedulerEventMenu } from '@/components/scheduler-canvas/SchedulerEventMenu';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function mount(y: number) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(
      <SchedulerEventMenu
        x={0}
        y={y}
        canRevert={false}
        onClose={vi.fn()}
        onSetDuration={vi.fn()}
        onSplitInHalf={vi.fn()}
        onTrimToHalf={vi.fn()}
        onRevertTimeSetting={vi.fn()}
        onDuplicateEvent={vi.fn()}
        onDeleteEvent={vi.fn()}
        onChangeColor={vi.fn()}
      />,
    );
  });
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
  Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const isMenu = this.classList?.contains('scheduler-event-menu');
    return {
      width: isMenu ? 200 : 0,
      height: isMenu ? 400 : 0,
      left: 0,
      top: 0,
      right: isMenu ? 200 : 0,
      bottom: isMenu ? 400 : 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect;
  });
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

describe('PATCH-311 Addendum 1: the event menu stays inside the window', () => {
  it('clamps a menu opened near the bottom so its top is at most 192', () => {
    mount(500);
    const menu = document.querySelector<HTMLElement>('.scheduler-event-menu');
    expect(menu).not.toBeNull();
    expect(Number.parseFloat(menu!.style.top)).toBeLessThanOrEqual(192);
    expect(Number.parseFloat(menu!.style.top)).toBeGreaterThanOrEqual(8);
  });
});
