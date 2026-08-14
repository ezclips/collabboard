// @vitest-environment jsdom
//
// PATCH 9E.1 -- replaces PATCH 9E's guessed 6px scrollbar-lane constant
// (real-Chrome measurement proved it didn't match the browser's actual
// reservation) with a value read from the element's own real layout:
// offsetWidth - clientWidth. jsdom performs no real layout (both are always
// 0 by default), so these tests stub the two properties directly on the
// mounted DOM node -- the same technique DocumentCardContent.test.tsx and
// RowColumnContainerCard.documentChildChrome.test.tsx use for scrollHeight/
// clientHeight.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { computeScrollbarLane, useScrollbarLane } from './useScrollbarLane';

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

describe('computeScrollbarLane (pure)', () => {
  it('returns offsetWidth - clientWidth when positive', () => {
    expect(computeScrollbarLane(217, 200)).toBe(17);
  });

  it('returns 0 when there is no gutter (e.g. macOS overlay scrollbars)', () => {
    expect(computeScrollbarLane(200, 200)).toBe(0);
  });

  it('never returns a negative value', () => {
    expect(computeScrollbarLane(200, 205)).toBe(0);
  });

  it('matches this app\'s custom thin scrollbar footprint just as well as a native one -- it is not tied to any specific browser constant', () => {
    expect(computeScrollbarLane(202, 200)).toBe(2);
  });
});

// A minimal host component so the hook can be exercised through a real
// mount/unmount lifecycle (ResizeObserver setup/teardown, ref attachment).
function Host({ enabled, onLane }: { enabled: boolean; onLane: (lane: number) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const lane = useScrollbarLane(ref, enabled);
  onLane(lane);
  return <div ref={ref} data-testid="viewport" />;
}

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
});

function stubGeometry(offsetWidth: number, clientWidth: number) {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => offsetWidth });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
}

describe('useScrollbarLane (mounted)', () => {
  it('measures the real reservation from the mounted element, not a guessed constant', () => {
    stubGeometry(217, 200);
    let lastLane = -1;
    mount(<Host enabled onLane={(lane) => { lastLane = lane; }} />);
    expect(lastLane).toBe(17);
  });

  it('returns 0 (no compensation) when disabled, regardless of measured geometry', () => {
    stubGeometry(217, 200);
    let lastLane = -1;
    mount(<Host enabled={false} onLane={(lane) => { lastLane = lane; }} />);
    expect(lastLane).toBe(0);
  });

  it('returns 0 when the element has no gutter at all (zero-width-jump platforms)', () => {
    stubGeometry(200, 200);
    let lastLane = -1;
    mount(<Host enabled onLane={(lane) => { lastLane = lane; }} />);
    expect(lastLane).toBe(0);
  });

  it('recalculates when ResizeObserver reports a geometry change (Container resize / expand-collapse / zoom)', () => {
    let capturedCallback: (() => void) | null = null;
    const originalRO = (globalThis as any).ResizeObserver;
    (globalThis as any).ResizeObserver = class {
      constructor(cb: () => void) { capturedCallback = cb; }
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    try {
      stubGeometry(217, 200);
      let lastLane = -1;
      mount(<Host enabled onLane={(lane) => { lastLane = lane; }} />);
      expect(lastLane).toBe(17);

      // Simulate the viewport's native scrollbar footprint changing (e.g.
      // browser zoom) between one ResizeObserver notification and the next.
      stubGeometry(211, 200);
      act(() => { capturedCallback?.(); });
      expect(lastLane).toBe(11);
    } finally {
      (globalThis as any).ResizeObserver = originalRO;
    }
  });
});
