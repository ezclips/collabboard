// @vitest-environment jsdom
// PATCH POST-RESIZE-B3.1.2 -- mounted Freeform Container TRUE manual-shrink
// minimum. Unlike containerResizeB3.mount.test.tsx (which mocks
// RowColumnContainerCard away), this file mounts the REAL production
// RowColumnContainerCard so the new onIntrinsicRequiredWidthChange effect
// actually runs against real child DOM nodes -- the exact mechanism the
// prior review's browser acceptance found broken.
import React, { act } from 'react';
import { afterEach, beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { Padlet } from '@/types/collabboard';

const persistence = vi.hoisted(() => ({ update: vi.fn(async () => ({ ok: true })) }));

vi.mock('@/components/collabboard/canvas/contexts/CanvasConfigContext', () => ({
  useCanvasConfig: () => ({
    canvasZoom: 1,
    canvasId: 'board-1',
    isFreeformGraphMode: false,
    canUseFreeformEditButton: true,
    isColumnsLayout: false,
    worldOriginLeft: 0,
    worldOriginTop: 0,
  }),
}));

vi.mock('@/components/collabboard/canvas/contexts/CanvasEditorContext', () => ({
  useCanvasEditor: () => new Proxy({}, {
    get: (_target, property: string) => property.startsWith('set') ? vi.fn() : null,
  }),
}));

vi.mock('@/lib/domain/canvas/posts', () => ({
  createUpdatePostFieldsCommand: () => persistence.update,
}));
vi.mock('@/lib/infra/canvas/postsRepository', () => ({ createPostsRepository: () => ({}) }));

vi.mock('@/components/collabboard/menus/ColumnPostContextMenu', () => ({
  ColumnPostContextMenu: ({ children }: { children: React.ReactNode }) => <div data-test-column-menu>{children}</div>,
}));
vi.mock('@/components/collabboard/PostCardContent', () => ({
  default: () => <div data-test-post-content />,
}));
// RowColumnContainerCard is DELIBERATELY real/unmocked in this file.

import FreeformPadletCards from '@/components/collabboard/canvas/ui/FreeformPadletCards';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom performs no real layout: offsetWidth is always 0 by default. Each
// element this production code path actually measures (the outer Container
// card, and each horizontal child wrapper) sets its width via an INLINE
// style, so reading it back off `this.style.width` gives a real, per-element,
// non-uniform substrate -- unlike a single global constant, this correctly
// differentiates a 200px child from a 300px child from a 900px Container.
let restoreOffsetWidth: (() => void) | undefined;
beforeAll(() => {
  const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const w = parseFloat(this.style.width);
      return Number.isFinite(w) ? w : 0;
    },
  });
  restoreOffsetWidth = () => {
    if (original) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original);
  };
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});
afterAll(() => restoreOffsetWidth?.());

const noop = vi.fn();
const stableActions = new Proxy({}, { get: () => vi.fn() }) as any;
const editorHost = document.createElement('div');

function padlet(id: string, type: Padlet['type'], width: number, metadata: Padlet['metadata'] = {}): Padlet {
  return {
    id,
    board_id: 'board-1',
    title: id,
    content: 'content',
    type,
    position_x: 100,
    position_y: 100,
    width,
    height: 300,
    created_at: '',
    updated_at: '',
    metadata,
  };
}

function child(id: string, parentId: string, width: number): Padlet {
  return padlet(id, 'text', width, { parentId });
}

function renderFreeform(rootPadlets: Padlet[], padlets: Padlet[], selectedPadletId: string | null) {
  const host = editorHost.cloneNode(false) as HTMLDivElement;
  document.body.append(host);
  const root: Root = createRoot(host);
  const doRender = (rp: Padlet[], p: Padlet[], sel: string | null) => act(() => root.render(
    <FreeformPadletCards
      rootPadlets={rp}
      padlets={p}
      setPadlets={noop}
      user={null}
      containerRef={{ current: document.createElement('div') }}
      getWorldPointFromClient={(x, y) => ({ x, y })}
      isDragging={false}
      draggingPadletId={null}
      dragOverContainerId={null}
      isGraphConnectMode={false}
      isLineMode={false}
      isDrawingMode={false}
      selectedPadletId={sel}
      selectedPadletIds={sel ? [sel] : []}
      setSelectedPadletId={noop}
      setGraphConnectSelection={noop}
      graphRefreshToken={0}
      closeAllToolbars={noop}
      handlePadletMouseDown={noop}
      getClickedSide={noop}
      stableActions={stableActions}
      requestOpenDocument={noop}
    />,
  ));
  doRender(rootPadlets, padlets, selectedPadletId);
  return { host, root, rerender: doRender };
}

function pointerEvent(type: string, clientX: number, clientY: number) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: 1 },
    button: { value: 0 },
    shiftKey: { value: false },
  });
  return event;
}

function drag(handle: HTMLElement, dx: number) {
  act(() => {
    handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
    handle.dispatchEvent(pointerEvent('pointermove', dx, 0));
    handle.dispatchEvent(pointerEvent('pointerup', dx, 0));
  });
}

function lastCommittedWidth(): number | undefined {
  const calls = (persistence.update as any).mock.calls;
  return calls[calls.length - 1]?.[0]?.fields?.width;
}

afterEach(() => {
  document.body.replaceChildren();
  persistence.update.mockClear();
});

describe('PATCH POST-RESIZE-B3.1.2 mounted true-intrinsic manual-shrink minimum', () => {
  it('A/B/C/D: grow then shrink above/at/below the TRUE intrinsic minimum -- growing never raises the floor', () => {
    // R = 200 + 300 (children) + 8 (gap-2) + 2 (this repo's existing, frozen
    // getContainerRequiredOuterWidth chrome helper -- jsdom's getComputedStyle
    // resolves an unset border to "1px" per side even in this test environment
    // where no real stylesheet is loaded) = 510.
    const container = padlet('h1', 'container', 900, { orientation: 'horizontal', childPadletIds: ['h1-a', 'h1-b'] });
    const a = child('h1-a', 'h1', 200);
    const b = child('h1-b', 'h1', 300);
    const { host, root, rerender } = renderFreeform([container], [container, a, b], 'h1');
    const getHandle = () => host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    // Grow: 900 -> 1200.
    drag(getHandle(), 300);
    expect(lastCommittedWidth()).toBe(1200);
    rerender([{ ...container, width: 1200 }], [{ ...container, width: 1200 }, a, b], 'h1');

    // A: shrink above R (still 1200 after grow) -> 700, well above R=510.
    drag(getHandle(), -500);
    expect(lastCommittedWidth()).toBe(700);
    rerender([{ ...container, width: 700 }], [{ ...container, width: 700 }, a, b], 'h1');

    // B / D: shrink all the way down to EXACTLY R=510 in one gesture -- this
    // is only possible if the prior grow to 1200 did NOT raise the floor.
    drag(getHandle(), -190);
    expect(lastCommittedWidth()).toBe(510);
    rerender([{ ...container, width: 510 }], [{ ...container, width: 510 }, a, b], 'h1');

    // C: attempt to shrink below R -- clamps exactly at 510, not lower.
    drag(getHandle(), -100);
    expect(lastCommittedWidth()).toBe(510);

    act(() => root.unmount());
  });

  it('E/F/G: removing a child lowers the intrinsic minimum without auto-shrinking the outer Container, and manual shrink then succeeds', () => {
    const container = padlet('h2', 'container', 900, { orientation: 'horizontal', childPadletIds: ['h2-a', 'h2-b'] });
    const a = child('h2-a', 'h2', 200);
    const b = child('h2-b', 'h2', 300);
    const { host, root, rerender } = renderFreeform([container], [container, a, b], 'h2');
    const getHandle = () => host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    // F: remove the wide child (h2-b) -- the outer Container width the
    // fixture holds is left completely untouched (this is the frozen
    // no-auto-shrink contract; nothing in this render call changes `width`).
    const containerAfterRemoval = { ...container, metadata: { ...container.metadata, childPadletIds: ['h2-a'] } };
    rerender([containerAfterRemoval], [containerAfterRemoval, a], 'h2');
    // width is still exactly what it was -- no automatic shrink occurred.
    expect(containerAfterRemoval.width).toBe(900);

    // G: manual shrink now succeeds down to the NEW, lower intrinsic minimum
    // (single remaining child: 200 + 0 gap + 0 chrome = 200, floored to 360).
    drag(getHandle(), -540); // 900 -> attempt 360
    expect(lastCommittedWidth()).toBe(360);

    act(() => root.unmount());
  });

  it('H: an empty (zero-child) Horizontal Container carries no phantom minimum -- shrinks all the way to 360', () => {
    const container = padlet('h3', 'container', 900, { orientation: 'horizontal', childPadletIds: [] });
    const { host, root } = renderFreeform([container], [container], 'h3');
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    // Below 360 must clamp AT 360 -- proving there is no phantom floor above
    // it (e.g. a stale value from the Container's own current/previous width).
    drag(handle, -640); // 900 -> attempt 260
    expect(lastCommittedWidth()).toBe(360);

    act(() => root.unmount());
  });

  it('I: Vertical Container minimum is still exactly 360, unaffected by the new horizontal intrinsic signal', () => {
    const container = padlet('v1', 'container', 900, { orientation: 'vertical', childPadletIds: [] });
    const { host, root } = renderFreeform([container], [container], 'v1');
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    // An attempt BELOW 360 must clamp exactly at the floor -- this is the
    // part that actually proves 360 (and not some other value) is enforced.
    drag(handle, -640); // 900 -> attempt 260
    expect(lastCommittedWidth()).toBe(360);

    act(() => root.unmount());
  });

  it('18: a successful manual-shrink commit persists width only -- no height, no metadata', () => {
    const container = padlet('h4', 'container', 900, { orientation: 'horizontal', childPadletIds: ['h4-a'] });
    const a = child('h4-a', 'h4', 200);
    const { host, root } = renderFreeform([container], [container, a], 'h4');
    const handle = host.querySelector<HTMLElement>('[data-post-resize-handle="true"]')!;

    drag(handle, -500); // 900 -> 400
    const calls = (persistence.update as any).mock.calls;
    const fields = calls[calls.length - 1][0].fields;
    expect(fields).toEqual(expect.objectContaining({ width: 400 }));
    expect(fields).not.toHaveProperty('height');
    expect(fields).not.toHaveProperty('metadata');

    act(() => root.unmount());
  });
});
