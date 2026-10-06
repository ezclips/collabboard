// @vitest-environment jsdom
//
// PATCH-300: the Board AI and wiki buttons now render on freeform boards only,
// so the column they forced the "Layout: Vertical" button away from no longer
// exists on a Timeline board. It moves back to the corner at `right-2`. Nothing
// else moves.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import TimelineHeaderBar from './TimelineHeaderBar';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
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

describe('TimelineHeaderBar layout button position (PATCH-300)', () => {
  it('sits back in the corner at right-2, not right-16', () => {
    const container = mount(
      <TimelineHeaderBar currentMode="vertical" onModeChange={() => {}} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('right-2');
    expect(root.className).not.toContain('right-16');
  });
});
