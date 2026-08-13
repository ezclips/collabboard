// @vitest-environment jsdom
//
// PATCH 9D -- a Document post rendered as a Container child was losing its
// meaningful Document-specific presentation (background/top-stripe color)
// and its "Read" action (full document modal). Root cause: RowColumnContainerCard's
// generic per-child wrapper read metadata.cardColor/topStrip (the fields
// every OTHER post type uses), never Document's own metadata.backgroundColor/
// topStripColor (set by ClipartCardDraftModal's color pickers) -- and the
// Container call site in FreeformPadletCards.tsx never passed an
// onOpenDocument callback down at all, so PostCardContent's already-built
// Document/Read branch was simply unreachable. Both are pure rendering-level
// gaps: attachPostToContainer.ts (Group into Column) already fully preserves
// metadata via `{ ...post.metadata, parentId: containerId }` -- nothing is
// lost at the move boundary.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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

// jsdom performs no real layout (scrollHeight/clientHeight are always 0/0),
// so DocumentCardContent's real-overflow gate never sees overflow by
// default. Mirrors the established technique in DocumentCardContent.test.tsx.
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

const readBtn = (c: HTMLElement) => c.querySelector('button[aria-label="Read document"]') as HTMLButtonElement | null;

function container(metadata: Record<string, unknown> = {}): any {
  return { id: 'container-1', title: 'Container', content: '', type: 'container', metadata };
}

function documentChild(overrides: Partial<any> = {}): any {
  return {
    id: 'doc-1',
    title: 'My Report',
    content: '<p>a lot of document body text</p>',
    type: 'card',
    metadata: { parentId: 'container-1' },
    ...overrides,
  };
}

describe('RowColumnContainerCard: Document child color/chrome preservation (PATCH 9D)', () => {
  it("a Document child's own backgroundColor/topStripColor render, not generic defaults [matrix 5, 6]", () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container()}
        allPadlets={[documentChild({ metadata: { parentId: 'container-1', backgroundColor: '#fee2e2', topStripColor: '#ef4444' } })]}
      />,
    );
    const wrapper = el.querySelector('.relative.border.border-gray-200.overflow-hidden.shadow-sm') as HTMLElement;
    expect(wrapper.style.backgroundColor).toBe('rgb(254, 226, 226)');
    const stripe = wrapper.querySelector('.h-1\\.5') as HTMLElement;
    expect(stripe).not.toBeNull();
    expect(stripe.style.backgroundColor).toBe('rgb(239, 68, 68)');
  });

  it('two differently-colored Document children remain independent [matrix 7, 19]', () => {
    const red = documentChild({ id: 'doc-red', title: 'Red Doc', metadata: { parentId: 'container-1', topStripColor: '#ef4444' } });
    const purple = documentChild({ id: 'doc-purple', title: 'Purple Doc', metadata: { parentId: 'container-1', topStripColor: '#a855f7' } });
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[red, purple]} />);
    const wrappers = Array.from(el.querySelectorAll('.relative.border.border-gray-200.overflow-hidden.shadow-sm')) as HTMLElement[];
    const stripes = wrappers.map((w) => (w.querySelector('.h-1\\.5') as HTMLElement).style.backgroundColor);
    expect(stripes).toEqual(['rgb(239, 68, 68)', 'rgb(168, 85, 247)']);
  });

  it('Container color/metadata never leaks into a Document child\'s chrome [matrix 8, 9]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ cardColor: '#000000', backgroundColor: '#000000' })}
        allPadlets={[documentChild({ metadata: { parentId: 'container-1', backgroundColor: '#fee2e2', topStripColor: '#ef4444' } })]}
      />,
    );
    const wrapper = el.querySelector('.relative.border.border-gray-200.overflow-hidden.shadow-sm') as HTMLElement;
    expect(wrapper.style.backgroundColor).toBe('rgb(254, 226, 226)');
  });
});

describe('RowColumnContainerCard: Document child Read action (PATCH 9D)', () => {
  it('an embedded Document renders a Read action when its content overflows [matrix 10]', () => {
    const el = withOverflow(() =>
      mount(
        <RowColumnContainerCard
          padlet={container()}
          allPadlets={[documentChild()]}
          onOpenDocument={vi.fn()}
        />,
      ),
    );
    expect(readBtn(el)).not.toBeNull();
  });

  it('Read targets the correct child and opens the canonical modal callback [matrix 11, 12, 13]', () => {
    const onOpenDocument = vi.fn();
    const el = withOverflow(() =>
      mount(
        <RowColumnContainerCard padlet={container()} allPadlets={[documentChild()]} onOpenDocument={onOpenDocument} />,
      ),
    );
    act(() => { readBtn(el)!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
    expect(onOpenDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }));
  });

  it('two Document children each open their OWN respective document, never the wrong one [matrix 15]', () => {
    const onOpenDocument = vi.fn();
    const docA = documentChild({ id: 'doc-a', title: 'Doc A', content: '<p>content a</p>' });
    const docB = documentChild({ id: 'doc-b', title: 'Doc B', content: '<p>content b</p>', metadata: { parentId: 'container-1' } });
    const el = withOverflow(() =>
      mount(<RowColumnContainerCard padlet={container()} allPadlets={[docA, docB]} onOpenDocument={onOpenDocument} />),
    );
    const buttons = Array.from(el.querySelectorAll('button[aria-label="Read document"]'));
    expect(buttons).toHaveLength(2);
    act(() => { buttons[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
    expect(onOpenDocument).toHaveBeenCalledTimes(1);
    expect(onOpenDocument).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-b' }));
  });

  it('no Read button renders when the caller provides no onOpenDocument (matches root\'s own opt-in gate)', () => {
    const el = withOverflow(() => mount(<RowColumnContainerCard padlet={container()} allPadlets={[documentChild()]} />));
    expect(readBtn(el)).toBeNull();
  });
});

describe('RowColumnContainerCard: Document child + PATCH 9C.1 title interaction', () => {
  it('title OFF: stripe and Read still render [matrix 17]', () => {
    const el = withOverflow(() =>
      mount(
        <RowColumnContainerCard
          padlet={container({ visibleChildPostTitleIds: [] })}
          allPadlets={[documentChild({ metadata: { parentId: 'container-1', topStripColor: '#ef4444' } })]}
          onOpenDocument={vi.fn()}
        />,
      ),
    );
    expect(el.querySelector('[data-child-title-header="true"]')).toBeNull();
    expect(el.querySelector('.h-1\\.5')).not.toBeNull();
    expect(readBtn(el)).not.toBeNull();
  });

  it('title ON: real title renders once (no duplicate), plus stripe and Read [matrix 18, 21]', () => {
    const el = withOverflow(() =>
      mount(
        <RowColumnContainerCard
          padlet={container({ visibleChildPostTitleIds: ['doc-1'] })}
          allPadlets={[documentChild({ metadata: { parentId: 'container-1', topStripColor: '#ef4444' } })]}
          onOpenDocument={vi.fn()}
        />,
      ),
    );
    const titleHeaders = el.querySelectorAll('[data-child-title-header="true"]');
    expect(titleHeaders).toHaveLength(1);
    expect(titleHeaders[0].textContent).toBe('My Report');
    // The title text must appear exactly once in the whole card -- the
    // Document preview itself must never introduce a second copy alongside
    // the one owned by PATCH 9C.1's title header.
    const occurrences = (el.textContent ?? '').split('My Report').length - 1;
    expect(occurrences).toBe(1);
    expect(el.querySelector('.h-1\\.5')).not.toBeNull();
    expect(readBtn(el)).not.toBeNull();
  });

  it('untitled Document + title visibility ON: no fake "Document" title, stripe and Read still render [matrix 16, 19, 20]', () => {
    const el = withOverflow(() =>
      mount(
        <RowColumnContainerCard
          padlet={container({ visibleChildPostTitleIds: ['doc-1'] })}
          allPadlets={[documentChild({ title: '', metadata: { parentId: 'container-1', topStripColor: '#ef4444' } })]}
          onOpenDocument={vi.fn()}
        />,
      ),
    );
    expect(el.querySelector('[data-child-title-header="true"]')).toBeNull();
    expect(el.textContent).not.toContain('Document');
    expect(el.querySelector('.h-1\\.5')).not.toBeNull();
    expect(readBtn(el)).not.toBeNull();
  });
});

describe('RowColumnContainerCard: readonly Read semantics (PATCH 9D)', () => {
  it('a readonly-scoped accessMode still allows Read -- Read is a view operation, not gated by comment-mutation permission [matrix 16-readonly]', () => {
    const el = withOverflow(() =>
      mount(
        <RowColumnContainerCard
          padlet={container()}
          allPadlets={[documentChild()]}
          onOpenDocument={vi.fn()}
          accessMode="read"
        />,
      ),
    );
    expect(readBtn(el)).not.toBeNull();
  });
});
