// @vitest-environment jsdom
//
// PATCH 9E -- the Container's child-content lane must keep the SAME width
// whether or not its vertical scrollbar is actually painting. Root cause:
// the child-list div was BOTH the overflow-y:auto scroll viewport AND the
// element children measure their own width against -- so the moment a
// browser reserves space for a vertical scrollbar, every child card's
// rendered width shrank by that amount. `scrollbar-gutter: stable` makes the
// reservation constant regardless of whether a scrollbar is actually shown
// (fixing the "same overflow-y-auto state, but sometimes-short-sometimes-tall
// content" jitter within a single render branch), and the accompanying
// `width: calc(100% + 6px)` / `margin-right: -6px` pushes that constant
// reservation into the Container's own existing 6px right-edge padding
// budget (verified safe across every live host during PATCH 9E's audit)
// instead of taking it out of the child cards' own width. jsdom performs no
// real layout, so these are structural/style-property assertions, not
// literal getBoundingClientRect() pixel comparisons -- the established
// convention this whole patch series uses (see documentChildChrome tests).
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

describe('RowColumnContainerCard: scrollbar lane geometry (PATCH 9E)', () => {
  it('scrolling-enabled state: scroll viewport reserves a constant gutter and overshoots width to compensate [matrix 1-7]', () => {
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} />);
    const viewport = scrollViewport(el)!;
    expect(viewport).not.toBeNull();
    expect(viewport.style.scrollbarGutter).toBe('stable');
    expect(viewport.style.width).toBe('calc(100% + 6px)');
    expect(viewport.style.marginRight).toBe('-6px');
    // overflow-x must stay hidden -- the width overshoot must never produce
    // a horizontal scrollbar [matrix 7]
    expect(viewport.className).toContain('overflow-x-hidden');
    expect(viewport.className).toContain('overflow-y-auto');
    // padding-right is untouched (pr-0.5, unchanged from before PATCH 9E) --
    // only width/margin compensate, so the baseline formula is preserved
    expect(viewport.className).toContain('pr-0.5');
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

  it('child cards receive no additional width-reducing style or class of their own -- the compensation lives entirely on the scroll viewport [matrix 2, 3, 4]', () => {
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[child('a'), child('b')]} />);
    for (const card of childCards(el)) {
      expect(card.style.width).toBe('');
      expect(card.style.paddingRight).toBe('');
      expect(card.style.marginRight).toBe('');
      expect(card.className).toBe('relative border border-gray-200 overflow-hidden shadow-sm ');
    }
  });

  it('titles OFF vs ON: enabling per-child titles (PATCH 9C.1) changes vertical content, not the scroll-viewport compensation values [matrix 8, 9, 16]', () => {
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
  });

  it('multiple child types (Document/Image/Note) share the same scroll viewport -- no type-specific width override [matrix 11, 12, 13]', () => {
    const doc = child('doc', { type: 'card', title: 'Doc', metadata: { parentId: 'container-1' } });
    const image = child('img', { type: 'image', title: 'Img', metadata: { parentId: 'container-1' }, file_url: 'https://example.com/a.png' });
    const note = child('note', { type: 'note', title: 'Note', metadata: { parentId: 'container-1' } });
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[doc, image, note]} />);
    const viewport = scrollViewport(el)!;
    expect(viewport.style.width).toBe('calc(100% + 6px)');
    // exactly one shared viewport hosts all three child types (no per-type
    // wrapper reimplementing overflow/width handling)
    expect(el.querySelectorAll('.scrollbar-ultrathin').length).toBe(1);
    expect(childCards(el)).toHaveLength(3);
  });
});
