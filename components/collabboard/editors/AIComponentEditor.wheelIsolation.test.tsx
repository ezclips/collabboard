// @vitest-environment jsdom
//
// PATCH-247. The AI window scrolls itself: a wheel inside the modal is isolated
// from the board's wheel handling, and a plain wheel is never prevented.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AIComponentEditor from './AIComponentEditor';

vi.mock('@/components/ai/AIContentRenderer', () => ({
  default: () => React.createElement('div', { 'data-testid': 'ai-content-stub' }),
}));

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
  vi.unstubAllGlobals();
});

describe('PATCH-247 AIComponentEditor isolates wheel from the board', () => {
  it('a ctrl+wheel inside the window does not reach a wheel listener on its parent', () => {
    const parentWheel = vi.fn();
    function Parent({ children }: { children: React.ReactNode }) {
      return <div onWheel={parentWheel}>{children}</div>;
    }
    const c = mount(
      <Parent>
        <AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />
      </Parent>,
    );
    const modal = c.querySelector('.fixed.inset-0') as Element;
    const event = new WheelEvent('wheel', {
      ctrlKey: true, deltaY: -100, bubbles: true, cancelable: true,
    });
    act(() => { (modal.firstElementChild as Element).dispatchEvent(event); });
    expect(parentWheel).not.toHaveBeenCalled();
  });

  it('a plain wheel inside the window is not defaultPrevented (the window still scrolls)', () => {
    const c = mount(<AIComponentEditor isOpen onClose={() => {}} onSave={() => {}} />);
    const modal = c.querySelector('.fixed.inset-0') as Element;
    const event = new WheelEvent('wheel', {
      deltaY: 100, bubbles: true, cancelable: true,
    });
    act(() => { (modal.firstElementChild as Element).dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(false);
  });
});
