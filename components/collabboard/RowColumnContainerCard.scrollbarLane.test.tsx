// @vitest-environment jsdom
//
// PATCH 9E / 9E.1 -- the Container's child-content lane must keep the SAME
// width whether or not its vertical scrollbar is actually painting. Root
// cause: the child-list div was BOTH the overflow-y:auto scroll viewport AND
// the element children measure their own width against -- so the moment a
// browser reserves space for a vertical scrollbar, every child card's
// rendered width shrank by that amount. `scrollbar-gutter: stable` makes the
// reservation constant regardless of whether a scrollbar is actually shown
// (fixing the "same overflow-y-auto state, but sometimes-short-sometimes-tall
// content" jitter within a single render branch); `width: calc(100% + Npx)` /
// `margin-right: -Npx` then pushes that reservation into an outside lane
// instead of taking it out of the child cards' own width.
//
// PATCH 9E used a guessed N=6 constant. Real Chrome measurement (PATCH 9E.1)
// proved that did not match the browser's actual reservation, so N is now
// measured live via useScrollbarLane (offsetWidth - clientWidth on the
// viewport itself) instead of assumed. jsdom performs no real layout, so
// offsetWidth/clientWidth are 0/0 by default here -- most tests below exploit
// that (proving no HARDCODED constant remains, since a hardcoded 6 would
// still show up regardless of real geometry), and the geometry-stubbing
// tests prove a genuinely measured non-zero value flows through end-to-end,
// the same stubbing technique this whole patch series uses for JSDOM's lack
// of real layout (see useScrollbarLane.test.tsx, DocumentCardContent.test.tsx).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RowColumnContainerCard from './RowColumnContainerCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };

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

function stubGeometry(offsetWidth: number, clientWidth: number) {
  const offsetDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth');
  const clientDesc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => offsetWidth });
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => clientWidth });
  return () => {
    if (offsetDesc) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', offsetDesc);
    if (clientDesc) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientDesc);
  };
}

function container(metadata: Record<string, unknown> = {}): any {
  return { id: 'container-1', title: 'Container', content: '', type: 'container', metadata };
}

function child(id: string, overrides: Partial<any> = {}): any {
  return { id, title: `Child ${id}`, content: '', type: 'note', metadata: { parentId: 'container-1' }, ...overrides };
}

// The scroll viewport is the element bearing the ref-only marker classes
// (max-h-[300px] when scrolling is enabled, or the plain space-y-2 wrapper
// when it is not) -- selected here via the scrollbar-ultrathin class, which
// only the scroll viewport ever carries.
const scrollViewport = (el: HTMLElement) => el.querySelector('.scrollbar-ultrathin') as HTMLElement | null;
const childCards = (el: HTMLElement) => Array.from(el.querySelectorAll('.relative.border.border-gray-200.overflow-hidden.shadow-sm')) as HTMLElement[];

describe('RowColumnContainerCard: scrollbar lane geometry (PATCH 9E.1, measured)', () => {
  it('scrolling-enabled state: scroll viewport reserves a constant gutter and overshoots width by the MEASURED value, not a guessed one [matrix 1-7]', () => {
    const restore = stubGeometry(217, 200);
    try {
      const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} />);
      const viewport = scrollViewport(el)!;
      expect(viewport).not.toBeNull();
      expect(viewport.style.scrollbarGutter).toBe('stable');
      // 217 - 200 = 17, the measured reservation -- not the old guessed 6.
      expect(viewport.style.width).toBe('calc(100% + 17px)');
      expect(viewport.style.marginRight).toBe('-17px');
      // overflow-x must stay hidden -- the width overshoot must never produce
      // a horizontal scrollbar [matrix 7]
      expect(viewport.className).toContain('overflow-x-hidden');
      expect(viewport.className).toContain('overflow-y-auto');
      // padding-right is untouched (pr-0.5, unchanged from before PATCH 9E) --
      // only width/margin compensate, so the baseline formula is preserved
      expect(viewport.className).toContain('pr-0.5');
    } finally {
      restore();
    }
  });

  it('zero measured gutter (e.g. macOS overlay scrollbars) applies zero overshoot -- no compensation is invented when none is needed [matrix 4]', () => {
    const restore = stubGeometry(200, 200);
    try {
      const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} />);
      const viewport = scrollViewport(el)!;
      expect(viewport.style.width).toBe('calc(100% + 0px)');
      // jsdom's CSSOM normalizes "-0px" to "0px" on assignment.
      expect(viewport.style.marginRight).toBe('0px');
    } finally {
      restore();
    }
  });

  it('no-scroll state (isExpanded): the width/margin/gutter overshoot is absent -- this remains the frozen baseline [matrix 1]', () => {
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} isExpanded />);
    const viewport = scrollViewport(el);
    // When expanded, the scroll className branch (and scrollbar-ultrathin)
    // does not apply at all -- there is no scrollbar to compensate for.
    expect(viewport).toBeNull();
    const plain = el.querySelector('.space-y-2.pr-0\\.5') as HTMLElement;
    expect(plain).not.toBeNull();
    expect(plain.style.width).toBe('');
    expect(plain.style.marginRight).toBe('');
  });

  it('no-scroll state (disableInternalScroll): same frozen baseline, no overshoot applied', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} disableInternalScroll />,
    );
    const viewport = el.querySelector('.scrollbar-ultrathin');
    expect(viewport).toBeNull();
  });

  it('child cards receive no additional width-reducing style or class of their own -- the compensation lives entirely on the scroll viewport [matrix 2, 3, 6]', () => {
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} />);
    for (const card of childCards(el)) {
      expect(card.style.width).toBe('');
      expect(card.style.paddingRight).toBe('');
      expect(card.style.marginRight).toBe('');
      expect(card.className).toBe('relative border border-gray-200 overflow-hidden shadow-sm ');
    }
  });

  it('titles OFF vs ON: enabling per-child titles (PATCH 9C.1) changes vertical content, not the scroll-viewport compensation values [matrix 9]', () => {
    const restore = stubGeometry(217, 200);
    try {
      const withoutTitles = mount(
        <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: [] })} allPadlets={[child('a'), child('b')]} />,
      );
      const withTitles = mount(
        <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['a', 'b'] })} allPadlets={[child('a'), child('b')]} />,
      );
      const v1 = scrollViewport(withoutTitles)!;
      const v2 = scrollViewport(withTitles)!;
      expect(v1.style.width).toBe(v2.style.width);
      expect(v1.style.marginRight).toBe(v2.style.marginRight);
      expect(v1.style.scrollbarGutter).toBe(v2.style.scrollbarGutter);
      // titles genuinely rendered in the ON case (sanity: the two mounts
      // actually differ in content, not just in an inert prop)
      expect(withoutTitles.querySelector('[data-child-title-header="true"]')).toBeNull();
      expect(withTitles.querySelectorAll('[data-child-title-header="true"]').length).toBe(2);
    } finally {
      restore();
    }
  });

  it('multiple child types (Document/Image/Note) share the same scroll viewport -- no type-specific width override [matrix 11]', () => {
    const restore = stubGeometry(217, 200);
    try {
      const doc = child('doc', { type: 'card', title: 'Doc', metadata: { parentId: 'container-1' } });
      const image = child('img', { type: 'image', title: 'Img', metadata: { parentId: 'container-1' }, file_url: 'https://example.com/a.png' });
      const note = child('note', { type: 'note', title: 'Note', metadata: { parentId: 'container-1' } });
      const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[doc, image, note]} />);
      const viewport = scrollViewport(el)!;
      expect(viewport.style.width).toBe('calc(100% + 17px)');
      // exactly one shared viewport hosts all three child types (no per-type
      // wrapper reimplementing overflow/width handling)
      expect(el.querySelectorAll('.scrollbar-ultrathin').length).toBe(1);
      expect(childCards(el)).toHaveLength(3);
    } finally {
      restore();
    }
  });
});
