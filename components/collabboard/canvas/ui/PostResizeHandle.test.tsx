// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import PostResizeHandle, {
  POST_RESIZE_HANDLE_GRIP_SCREEN_PX,
  POST_RESIZE_HANDLE_HIT_SCREEN_PX,
} from '@/components/collabboard/canvas/ui/PostResizeHandle';
import type { PostResizeConstraints } from '@/lib/domain/canvas/postResizePolicy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Synthetic host converter modeling a camera at `scale` (like the section
 * heading tests): world = client / scale. The component under test never sees
 * the scale -- it only calls the function -- so the same gesture must produce
 * identical WORLD deltas at every zoom.
 */
function hostAtScale(scale: number) {
  return (clientX: number, clientY: number) => ({ x: clientX / scale, y: clientY / scale });
}

let roots: Root[] = [];
let hosts: HTMLElement[] = [];
afterEach(() => {
  for (const r of roots) act(() => r.unmount());
  for (const h of hosts) h.remove();
  roots = [];
  hosts = [];
});

function render(element: React.ReactElement) {
  const host = document.createElement('div');
  document.body.append(host);
  hosts.push(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(element));
  return host;
}

function pointer(target: Element, type: string, clientX: number, extra: Record<string, unknown> = {}) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX, clientY: 10 });
  Object.assign(event, { pointerId: 1, pointerType: 'mouse', isPrimary: true, ...extra });
  act(() => { target.dispatchEvent(event); });
}

interface MountResult {
  host: HTMLElement;
  onResizePreview: ReturnType<typeof vi.fn>;
  onResizeCommit: ReturnType<typeof vi.fn>;
  handle: HTMLElement;
}

function mount(
  overrides: Partial<React.ComponentProps<typeof PostResizeHandle>> & { scale?: number } = {},
): MountResult {
  const { scale, ...props } = overrides;
  const onResizePreview = vi.fn();
  const onResizeCommit = vi.fn();
  const host = render(
    <PostResizeHandle
      clientToWorld={props.clientToWorld ?? hostAtScale(scale ?? 1)}
      startWidth={props.startWidth ?? 360}
      startHeight={props.startHeight ?? 220}
      constraints={props.constraints ?? null}
      onResizePreview={onResizePreview}
      onResizeCommit={onResizeCommit}
      {...props}
    />,
  );
  const handle = host.querySelector('[data-post-resize-handle="true"]')! as HTMLElement;
  return { host, onResizePreview, onResizeCommit, handle };
}

const AI_MIN: PostResizeConstraints = { minWidth: 200, minHeight: 150 };

describe('PATCH POST-RESIZE-B1 PostResizeHandle gesture', () => {
  it('22. carries data-no-drag isolation', () => {
    const { handle } = mount();
    expect(handle.getAttribute('data-no-drag')).toBe('true');
  });

  it('13/16. bottom-right resize: world dx adds exactly to width, x/y untouched', () => {
    const { handle, onResizePreview, onResizeCommit } = mount();
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 210);
    expect(onResizePreview).toHaveBeenLastCalledWith(560, 220);
    pointer(handle, 'pointerup', 210);
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
    expect(onResizeCommit).toHaveBeenCalledWith(560, 220, 360, 220);
  });

  it('17. world dy adds exactly to height', () => {
    const { handle, onResizePreview } = mount({ startWidth: 500, startHeight: 400 });
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 10, { clientY: 210 });
    expect(onResizePreview).toHaveBeenLastCalledWith(500, 600);
  });

  it('26. identical WORLD deltas across the zoom matrix (10%..200%)', () => {
    for (const scale of [0.1, 0.25, 0.5, 1, 1.5, 2]) {
      const { handle, onResizePreview, onResizeCommit } = mount({ scale });
      // A +200 world-unit gesture: the client distance must be 200 * scale.
      const clientSpan = 200 * scale;
      pointer(handle, 'pointerdown', 10);
      pointer(handle, 'pointermove', 10 + clientSpan);
      pointer(handle, 'pointerup', 10 + clientSpan);
      expect(onResizePreview, `scale ${scale}`).toHaveBeenLastCalledWith(560, 220);
      expect(onResizeCommit, `scale ${scale}`).toHaveBeenCalledWith(560, 220, 360, 220);
    }
  });

  it('18. min constraints clamp (AI 200x150)', () => {
    const { handle, onResizePreview } = mount({ startWidth: 500, startHeight: 400, constraints: AI_MIN });
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', -10000);
    expect(onResizePreview).toHaveBeenLastCalledWith(200, 150);
  });

  it('23. no-op gesture: previews allowed but ZERO commits', () => {
    const { handle, onResizePreview, onResizeCommit } = mount();
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 10);
    pointer(handle, 'pointermove', 10.4);
    pointer(handle, 'pointerup', 10);
    expect(onResizePreview).toHaveBeenCalledTimes(2);
    expect(onResizePreview).toHaveBeenLastCalledWith(360, 220);
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('24/25. pointermove never commits; release commits exactly once', () => {
    const { handle, onResizeCommit } = mount();
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 110);
    pointer(handle, 'pointermove', 160);
    expect(onResizeCommit).not.toHaveBeenCalled();
    pointer(handle, 'pointerup', 160);
    expect(onResizeCommit).toHaveBeenCalledTimes(1);
  });

  it('21. right-button pointerdown never starts a gesture', () => {
    const { handle, onResizePreview, onResizeCommit } = mount();
    pointer(handle, 'pointerdown', 10, { button: 2 });
    pointer(handle, 'pointermove', 300);
    pointer(handle, 'pointerup', 300);
    expect(onResizePreview).not.toHaveBeenCalled();
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('19. a non-finite converter result aborts the gesture safely', () => {
    const onResizePreview = vi.fn();
    const onResizeCommit = vi.fn();
    const host = render(
      <PostResizeHandle
        clientToWorld={() => ({ x: Number.NaN, y: Number.NaN })}
        startWidth={360}
        startHeight={220}
        onResizePreview={onResizePreview}
        onResizeCommit={onResizeCommit}
      />,
    );
    const handle = host.querySelector('[data-post-resize-handle="true"]')!;
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 300);
    pointer(handle, 'pointerup', 300);
    expect(onResizePreview).not.toHaveBeenCalled();
    expect(onResizeCommit).not.toHaveBeenCalled();
  });

  it('getStartSize: the actual rendered rectangle becomes the gesture origin', () => {
    const { handle, onResizeCommit } = mount({
      startWidth: 360,
      startHeight: 100,
      getStartSize: () => ({ width: 360, height: 322 }),
    });
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 110);
    pointer(handle, 'pointerup', 110);
    expect(onResizeCommit).toHaveBeenCalledWith(460, 322, 360, 322);
  });

  it('Shift locks the starting aspect ratio', () => {
    const { handle, onResizePreview } = mount({ startWidth: 400, startHeight: 200 });
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 210, { shiftKey: true });
    const [w, h] = onResizePreview.mock.calls.at(-1)!;
    expect(w / h).toBeCloseTo(2, 5);
  });

  it('maxWidth/maxHeight clamp the world extent', () => {
    const { handle, onResizePreview } = mount({ startWidth: 360, startHeight: 220, maxWidth: 1000, maxHeight: 800 });
    pointer(handle, 'pointerdown', 10);
    pointer(handle, 'pointermove', 100000);
    expect(onResizePreview).toHaveBeenLastCalledWith(1000, 800);
  });

  it('27. the grip stays a constant SCREEN size across the zoom matrix', () => {
    // Handle dimensions are world units; screen size = world * scale. The
    // world-per-client-pixel technique must cancel the zoom.
    for (const scale of [0.1, 0.25, 0.5, 1, 1.5, 2]) {
      const { handle } = mount({ scale });
      const hitWorld = parseFloat(handle.style.width);
      const grip = handle.querySelector('div') as HTMLElement;
      const gripWorld = parseFloat(grip.style.width);
      expect(hitWorld * scale).toBeCloseTo(POST_RESIZE_HANDLE_HIT_SCREEN_PX, 5);
      expect(gripWorld * scale).toBeCloseTo(POST_RESIZE_HANDLE_GRIP_SCREEN_PX, 5);
    }
  });

  it('carries a Resize aria-label/title', () => {
    const { handle } = mount();
    expect(handle.getAttribute('aria-label')).toBe('Resize');
    expect(handle.getAttribute('title')).toBe('Resize');
  });
});
