// @vitest-environment jsdom
//
// Addendum 1 (PATCH-296), defect 1: a Map pin (root container) with
// metadata.startExpanded === true must open expanded, and one toggle must
// collapse it; without the flag it stays collapsed (unchanged default).
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import PostPopup from './PostPopup';

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
  act(() => { root.render(ui); });
  mounted.push({ root, container });
  return container;
}
afterEach(() => {
  for (const m of mounted) { act(() => { m.root.unmount(); }); m.container.remove(); }
  mounted = [];
  vi.restoreAllMocks();
});

/** jsdom does no layout, so force the overflow that shows the toggle. */
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

function pin(startExpanded?: boolean): any {
  return {
    id: 'pin-1',
    type: 'container',
    title: 'Pin',
    content: '',
    metadata: { childPadletIds: ['child-1'], ...(startExpanded === undefined ? {} : { startExpanded }) },
  };
}

const CHILD: any = { id: 'child-1', type: 'text', title: '', content: '<p>child body</p>', metadata: { parentId: 'pin-1' } };

function mountPopup(startExpanded?: boolean) {
  const container = pin(startExpanded);
  return mount(
    <PostPopup post={container} allPadlets={[container, CHILD]} onClose={vi.fn()} />,
  );
}

function expandToggle(container: HTMLElement): HTMLButtonElement | null {
  return container.querySelector('button[aria-label="Collapse container"], button[aria-label="Expand container"]');
}

describe('PostPopup expanded default (addendum 1 defect 1)', () => {
  it('opens a container with the flag expanded', () => {
    const c = withOverflow(() => mountPopup(true));
    expect(expandToggle(c)?.getAttribute('aria-label')).toBe('Collapse container');
  });

  it('collapses on one toggle', () => {
    withOverflow(() => {
      const c = mountPopup(true);
      act(() => { expandToggle(c)!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      expect(expandToggle(c)?.getAttribute('aria-label')).toBe('Expand container');
    });
  });

  it('stays collapsed without the flag', () => {
    const c = withOverflow(() => mountPopup(undefined));
    expect(expandToggle(c)?.getAttribute('aria-label')).toBe('Expand container');
  });
});
