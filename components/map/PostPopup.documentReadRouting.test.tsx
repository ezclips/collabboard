// @vitest-environment jsdom
//
// PATCH 9D.1 -- PostPopup (Map pin popup) previously wired a Container's
// embedded Document Read action to `() => onOpenDocument(post)`, where
// `post` is the CONTAINER itself, not the clicked child -- discarding the
// argument RowColumnContainerCard actually passes. Since a Container is
// never itself a Document, this made Read silently no-op for every Document
// child on the Map layout (Read button rendered, click did nothing).
// Fixed to a direct pass-through (`onOpenDocument={onOpenDocument}`),
// letting RowColumnContainerCard's own internal per-child rebinding supply
// the correct target -- the same pattern already correct in DrawingLayout.
import React from 'react';
import { act } from 'react';
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
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  for (const m of mounted) {
    act(() => { m.root.unmount(); });
    m.container.remove();
  }
  mounted = [];
});

// jsdom performs no real layout, so DocumentCardContent's real-overflow Read
// gate never sees overflow by default -- mirrors the technique established
// in DocumentCardContent.test.tsx / RowColumnContainerCard.documentChildChrome.test.tsx.
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

const readBtn = (c: HTMLElement) => Array.from(c.querySelectorAll('button[aria-label="Read document"]')) as HTMLButtonElement[];

const CONTAINER = {
  id: 'pin-container-1',
  title: 'Pin container',
  content: '',
  type: 'container',
  metadata: { childPadletIds: ['doc-a', 'doc-b'], mapLocation: { lng: 1, lat: 2 } },
};

function documentChild(id: string, title: string): any {
  return { id, title, content: '<p>a lot of document body text</p>', type: 'card', metadata: { parentId: 'pin-container-1' } };
}

function mountPopup(overrides: Partial<React.ComponentProps<typeof PostPopup>> = {}) {
  return mount(
    <PostPopup
      post={CONTAINER as any}
      allPadlets={[CONTAINER as any, documentChild('doc-a', 'Doc A'), documentChild('doc-b', 'Doc B')]}
      onClose={vi.fn()}
      currentUserId="real-user-123"
      currentUserName="Real Name"
      {...overrides}
    />,
  );
}

describe('Map pin PostPopup: Document child Read routing (PATCH 9D.1)', () => {
  it('renders a Read action for a Document child inside a Container pin [matrix 13]', () => {
    const c = withOverflow(() => mountPopup({ onOpenDocument: vi.fn() }));
    expect(readBtn(c).length).toBeGreaterThan(0);
  });

  it('Read opens the correct child, never the parent Container [matrix 14]', () => {
    const onOpenDocument = vi.fn();
    const c = withOverflow(() => mountPopup({ onOpenDocument }));
    const buttons = readBtn(c);
    expect(buttons).toHaveLength(2);
    act(() => { buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
    expect(onOpenDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-b' }));
    expect(onOpenDocument).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'pin-container-1' }));
  });

  it('does not close the popup or otherwise fire onClose when Read is clicked [matrix 15]', () => {
    const onClose = vi.fn();
    const c = withOverflow(() => mountPopup({ onOpenDocument: vi.fn(), onClose }));
    act(() => { readBtn(c)[0].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onClose).not.toHaveBeenCalled();
  });
});
