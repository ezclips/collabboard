// @vitest-environment jsdom
//
// Addendum 1 (PATCH-296), defect 1: a Timeline container with
// metadata.startExpanded === true must render expanded, and one toggle must
// collapse it; without the flag it stays collapsed (unchanged default).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import ChronoTimelineCanvas from './ChronoTimelineCanvas';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  Element.prototype.scrollIntoView ??= () => {};
  (Element.prototype as any).hasPointerCapture ??= () => false;
  (Element.prototype as any).scrollTo ??= () => {};
});

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
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
  vi.restoreAllMocks();
});

function withOverflow<T>(fn: () => T): T {
  const scrollDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight');
  const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 500 });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 100 });
  try {
    return fn();
  } finally {
    if (scrollDesc) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', scrollDesc);
    else delete (HTMLElement.prototype as any).scrollHeight;
    if (clientDesc) Object.defineProperty(HTMLElement.prototype, 'clientHeight', clientDesc);
    else delete (HTMLElement.prototype as any).clientHeight;
  }
}

function container(startExpanded?: boolean): any {
  return {
    id: 'c1',
    type: 'container',
    title: 'Container c1',
    content: '',
    created_at: '2026-01-15T00:00:00.000Z',
    metadata: { childPadletIds: ['k1'], ...(startExpanded === undefined ? {} : { startExpanded }) },
  };
}
const CHILD: any = { id: 'k1', type: 'text', title: '', content: '<p>child body</p>', metadata: { parentId: 'c1' } };

function mountTimeline(startExpanded?: boolean) {
  const c = container(startExpanded);
  return mount(
    <ChronoTimelineCanvas
      padlets={[c]}
      allPadlets={[c, CHILD]}
      canvasId="canvas-1"
      chronoMode="vertical"
      isEditable
      onOpenContainer={vi.fn()}
      onUpdateContainerMetadata={vi.fn()}
    />,
  );
}

function expandToggle(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button[aria-label="Collapse"], button[aria-label="Expand"]');
}

describe('ChronoTimelineCanvas expanded default (addendum 1 defect 1)', () => {
  it('renders a container with the flag expanded', () => {
    withOverflow(() => {
      const c = mountTimeline(true);
      expect(expandToggle(c)?.getAttribute('aria-label')).toBe('Collapse');
    });
  });

  it('collapses on one toggle', () => {
    withOverflow(() => {
      const c = mountTimeline(true);
      act(() => { expandToggle(c)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(expandToggle(c)?.getAttribute('aria-label')).toBe('Expand');
    });
  });

  it('stays collapsed without the flag', () => {
    withOverflow(() => {
      const c = mountTimeline(undefined);
      expect(expandToggle(c)?.getAttribute('aria-label')).toBe('Expand');
    });
  });
});
