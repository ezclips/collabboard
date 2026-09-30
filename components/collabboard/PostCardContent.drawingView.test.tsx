// @vitest-environment jsdom
//
// PATCH-223 -- the drawing wrapper's zoom affordance is gated on `onView`.
// On the board no viewer is passed, so a drawing hovers/clicks like any other
// post; a column child still passes `onViewDrawing` -> `onView`, so it keeps
// click-to-view.
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PostCardContent from './PostCardContent';
import type { Padlet } from '@/types/collabboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// PostCardContent calls useScrollbarLane unconditionally; jsdom lacks the API.
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = NoopResizeObserver;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mountWithParent(onParentClick: () => void, ui: React.ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<div onClick={onParentClick}>{ui}</div>);
  });
  return host;
}

const drawing = (): Padlet =>
  ({
    id: 'd-1',
    board_id: 'b',
    title: 'Drawing',
    content: '',
    type: 'drawing',
    metadata: { previewUrl: '' },
  } as unknown as Padlet);

const wrapper = (c: HTMLElement) => c.querySelector('[class*="drawing-preview"]') as HTMLElement;

describe('PATCH-223 the drawing wrapper zooms only when a viewer is passed', () => {
  it('without onView: no zoom cursor, no title, and the click is not swallowed', () => {
    const parent = vi.fn();
    const c = mountWithParent(parent, <PostCardContent padlet={drawing()} />);
    const el = wrapper(c);

    expect(el.className).not.toContain('cursor-zoom-in');
    expect(el.getAttribute('title')).toBeNull();

    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(parent, 'the click reaches the card / canvas').toHaveBeenCalledTimes(1);
  });

  it('with onView: zoom cursor + title, click calls onView and never reaches the parent', () => {
    const parent = vi.fn();
    const onView = vi.fn();
    const c = mountWithParent(parent, <PostCardContent padlet={drawing()} onView={onView} />);
    const el = wrapper(c);

    expect(el.className).toContain('cursor-zoom-in');
    expect(el.getAttribute('title')).toBe('Click to view full size');

    act(() => {
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(onView).toHaveBeenCalledTimes(1);
    expect(parent).not.toHaveBeenCalled();
  });
});
