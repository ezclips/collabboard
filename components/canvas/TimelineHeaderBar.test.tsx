// @vitest-environment jsdom
//
// PATCH-297 defect 3: the "Layout: Vertical" button sat at `right-2`, under the
// Board AI column (fixed right-4 top-4, 36px) and its wiki button. It must move
// to `right-16`, left of that column. Nothing else moves.
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

describe('TimelineHeaderBar layout button position (PATCH-297 defect 3)', () => {
  it('sits at right-16, left of the Board AI column, not right-2', () => {
    const container = mount(
      <TimelineHeaderBar currentMode="vertical" onModeChange={() => {}} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('right-16');
    expect(root.className).not.toContain('right-2');
  });
});
