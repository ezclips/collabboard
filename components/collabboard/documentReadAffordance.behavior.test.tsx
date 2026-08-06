// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Padlet } from '@/types/collabboard';
import PostCardContent from './PostCardContent';
import RowColumnContainerCard from './RowColumnContainerCard';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
// jsdom lacks IntersectionObserver (PostCardContent AI branch) and ResizeObserver (RowColumnContainerCard).
(globalThis as any).IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
(globalThis as any).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

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
});

// jsdom performs no real layout (scrollHeight/clientHeight are always 0/0),
// so DocumentCardContent's real overflow measurement (PATCH-152 targeted
// correction) never observes overflow by default. Tests that need a
// genuinely-overflowing preview stub the two layout properties on
// HTMLElement.prototype for the duration of the mount call.
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

// PATCH-149C §38/§39/§40: mounts the real PostCardContent/RowColumnContainerCard composition every layout owner shares.
const post = (over: Partial<Omit<Padlet, 'metadata'>> & { metadata?: any } = {}): Padlet => ({
  id: 'p', board_id: 'b', type: 'card', title: 'New Container', content: '<p>line one</p>',
  position_x: 0, position_y: 0, width: 180, height: 220,
  created_at: '', updated_at: '', metadata: {}, ...over,
} as Padlet);

const readBtns = (c: HTMLElement) => c.querySelectorAll('button[aria-label="Read document"]');
const click = (el: Element) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

describe('PATCH-149C §38/§39/§40: Read affordance for container-nested Documents (overflow-gated per PATCH-152)', () => {
  it('1: top-level Document with callback renders Read when overflowing (non-regression)', () => {
    const c = withOverflow(() => mount(<PostCardContent padlet={post({ id: 'd1' })} onOpenDocument={() => {}} />));
    expect(readBtns(c)).toHaveLength(1);
  });
  it('PATCH-152: top-level Document with callback renders no Read when the content fits (never shown merely for having text)', () => {
    const c = mount(<PostCardContent padlet={post({ id: 'd1' })} onOpenDocument={() => {}} />);
    expect(readBtns(c)).toHaveLength(0);
  });
  it('2: top-level Document without callback renders no Read (presence-gating preserved), even when overflowing', () => {
    const c = withOverflow(() => mount(<PostCardContent padlet={post({ id: 'd1' })} />));
    expect(readBtns(c)).toHaveLength(0);
  });
  it('3-5: nested Document renders Read when overflowing; click fires the callback exactly once with the child, not the container', () => {
    const calls: Padlet[] = [];
    const child = post({ id: 'child-doc', metadata: { parentId: 'parent' } });
    const note = post({ id: 'child-note', type: 'note', metadata: { parentId: 'parent' } });
    const clip = post({ id: 'child-clip', metadata: { parentId: 'parent', svgUrl: 'x.svg' } });
    const parent = post({ id: 'parent', type: 'container' });
    const onOpenDocument = (p: Padlet) => calls.push(p);
    const c = withOverflow(() => mount(<RowColumnContainerCard padlet={parent} allPadlets={[parent, child, note, clip]} onOpenDocument={onOpenDocument} />));
    const btns = readBtns(c);
    expect(btns).toHaveLength(1); // only the Document child qualifies (6, 7)
    click(btns[0]);
    expect(calls).toHaveLength(1);
    expect(calls[0].id).toBe('child-doc');
    expect(calls[0].id).not.toBe(parent.id);
    expect(calls[0].title).toBe('New Container');
    expect(readBtns(withOverflow(() => mount(<RowColumnContainerCard padlet={parent} allPadlets={[parent, child, note, clip]} />)))).toHaveLength(0); // no callback -> no Read
  });
  it("PostCardContent's own container recursion (:859) also forwards onOpenDocument to a nested Document child, and gates Read on overflow", () => {
    const child = post({ id: 'd1' });
    const parent = post({ id: 'p', type: 'container', metadata: { childPadletIds: ['d1'] } });
    const c = withOverflow(() => mount(<PostCardContent padlet={parent} allPadlets={[parent, child]} onOpenDocument={() => {}} />));
    expect(readBtns(c)).toHaveLength(1);
    expect(readBtns(mount(<PostCardContent padlet={parent} allPadlets={[parent, child]} onOpenDocument={() => {}} />))).toHaveLength(0);
  });
  it('6-7: nested non-Document and nested clipart children each alone render no Read, even when overflowing', () => {
    const n = post({ id: 'n1', type: 'note', metadata: { parentId: 'p' } });
    const cl = post({ id: 'c1', metadata: { parentId: 'p', svgUrl: 'x.svg' } });
    const parent = post({ id: 'p', type: 'container' });
    expect(readBtns(withOverflow(() => mount(<RowColumnContainerCard padlet={parent} allPadlets={[parent, n]} onOpenDocument={() => {}} />)))).toHaveLength(0);
    expect(readBtns(withOverflow(() => mount(<RowColumnContainerCard padlet={parent} allPadlets={[parent, cl]} onOpenDocument={() => {}} />)))).toHaveLength(0);
  });
  it('8: Read renders for both an editor-bound and a viewer-bound owner callback when overflowing (visibility is capability-blind)', () => {
    for (const destination of ['document-editor', 'document-viewer'] as const) {
      const child = post({ id: `d-${destination}`, metadata: { parentId: 'p' } });
      const parent = post({ id: 'p', type: 'container' });
      const onOpenDocument = (_p: Padlet) => { void destination; };
      const c = withOverflow(() => mount(<RowColumnContainerCard padlet={parent} allPadlets={[parent, child]} onOpenDocument={onOpenDocument} />));
      expect(readBtns(c)).toHaveLength(1);
    }
  });
});
