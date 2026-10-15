// @vitest-environment jsdom
//
// PATCH-300 moved this bar back to the corner at `right-2`: the floating Board
// AI and wiki launchers rendered on freeform boards only, so the column they had
// forced the "Layout: Vertical" button away from no longer existed here.
//
// PATCH-375 puts the floating Board AI button BACK on the five Padlet layouts --
// it replaces the toolbar's duplicate Sparkles tool -- so this bar has to clear
// it again. `right-14` (56px) is past the button's 16-52px band. A vertical
// offset on the button could not have worked instead: the bar's own y depends on
// whether the title header is shown (it defaults to hidden), so any single
// `top-*` would overlap in one of the two states.
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

describe('TimelineHeaderBar layout button position (PATCH-375)', () => {
  it('clears the floating Board AI button at right-14', () => {
    const container = mount(
      <TimelineHeaderBar currentMode="vertical" onModeChange={() => {}} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('right-14');
    expect(root.className).not.toContain('right-2');
    expect(root.className).not.toContain('right-16');
  });
});
