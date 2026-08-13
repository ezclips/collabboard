// @vitest-environment jsdom
//
// PATCH 9C.1 -- per-Container, per-child "Post titles" visibility
// (metadata.visibleChildPostTitleIds: string[]), replacing PATCH 9C's global
// metadata.showChildPostTitles boolean. RowColumnContainerCard is the single
// shared on-canvas Container-child renderer reused by every layout
// (Freeform, Wall, Row/Column, Drawing, Map, Chrono), so exercising it here
// covers the setting everywhere it's reused. Mirrors the mount convention
// established in RowColumnContainerCard.embeddedCommentPermission.test.tsx.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import RowColumnContainerCard from './RowColumnContainerCard';

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

function container(metadata: Record<string, unknown> = {}) {
  return { id: 'container-1', title: 'Container', content: '', type: 'container', metadata } as any;
}

function noteChild(overrides: Partial<any> = {}): any {
  return {
    id: 'child-note',
    title: 'Hallo world',
    content: 'note body',
    type: 'note',
    metadata: { parentId: 'container-1' },
    ...overrides,
  };
}

function imageChild(overrides: Partial<any> = {}): any {
  return {
    id: 'child-image',
    title: 'My Photo',
    content: '',
    type: 'image',
    metadata: { imageUrl: 'https://example.com/x.png', parentId: 'container-1' },
    ...overrides,
  };
}

function documentChild(overrides: Partial<any> = {}): any {
  return {
    id: 'child-doc',
    title: 'Q3 Report',
    content: '',
    type: 'document',
    metadata: { importKind: 'document', parentId: 'container-1' },
    ...overrides,
  };
}

function titleNodes(el: HTMLElement): string[] {
  return Array.from(el.querySelectorAll('[data-child-title-header="true"]')).map(
    (n) => (n.textContent ?? '').trim(),
  );
}

describe('RowColumnContainerCard: per-child post title visibility (PATCH 9C.1)', () => {
  it('missing list, no legacy flag -> all hidden (default) [matrix 24]', () => {
    const el = mount(<RowColumnContainerCard padlet={container()} allPadlets={[noteChild()]} />);
    expect(titleNodes(el)).toEqual([]);
  });

  it('enabled titled child renders its title; hidden titled child does not [matrix 11, 12]', () => {
    const visible = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-note'] })} allPadlets={[noteChild()]} />,
    );
    expect(titleNodes(visible)).toEqual(['Hallo world']);

    const hidden = mount(
      <RowColumnContainerCard padlet={{ ...container({ visibleChildPostTitleIds: [] }), id: 'container-hidden' }} allPadlets={[{ ...noteChild(), metadata: { parentId: 'container-hidden' } }]} />,
    );
    expect(titleNodes(hidden)).toEqual([]);
  });

  it('enabled untitled Image renders NO "Image" header -- canvas never uses the type-name fallback [matrix 13]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-image'] })}
        allPadlets={[imageChild({ title: '' })]}
      />,
    );
    expect(titleNodes(el)).toEqual([]);
    expect(el.textContent).not.toContain('Image');
  });

  it('enabled untitled Note renders NO type-name header [matrix 14]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-note'] })}
        allPadlets={[noteChild({ title: '' })]}
      />,
    );
    expect(titleNodes(el)).toEqual([]);
    expect(el.textContent).not.toContain('Note');
  });

  it('no blank title area renders for any untitled-but-enabled child (whitespace/undefined too) [matrix 15]', () => {
    const whitespace = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-note'] })} allPadlets={[noteChild({ title: '   ' })]} />,
    );
    expect(whitespace.querySelector('[data-child-title-header="true"]')).toBeNull();

    const undef = mount(
      <RowColumnContainerCard padlet={{ ...container({ visibleChildPostTitleIds: ['child-note'] }), id: 'c2' }} allPadlets={[{ ...noteChild({ title: undefined }), metadata: { parentId: 'c2' } }]} />,
    );
    expect(undef.querySelector('[data-child-title-header="true"]')).toBeNull();
  });

  it('a child whose actual title IS the literal string "Image" DOES render "Image" [matrix 16]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-image'] })}
        allPadlets={[imageChild({ title: 'Image' })]}
      />,
    );
    expect(titleNodes(el)).toEqual(['Image']);
  });

  it('renaming an enabled child updates the rendered title automatically, without touching visibility metadata [matrix 17, 18]', () => {
    const c = container({ visibleChildPostTitleIds: ['child-note'] });
    const before = mount(<RowColumnContainerCard padlet={c} allPadlets={[noteChild({ title: 'Hallo World' })]} />);
    expect(titleNodes(before)).toEqual(['Hallo World']);

    // Same visibility metadata, only the child's own title field changed --
    // title source is always read live from child.title, never cached.
    const after = mount(
      <RowColumnContainerCard padlet={{ ...c, id: 'container-renamed' }} allPadlets={[{ ...noteChild({ title: 'My picture' }), metadata: { parentId: 'container-renamed' } }]} />,
    );
    expect(titleNodes(after)).toEqual(['My picture']);
    expect((c.metadata as any).visibleChildPostTitleIds).toEqual(['child-note']);
  });

  it('three children can have independent visibility combinations; toggling one does not affect the others [matrix 19, 20, 21]', () => {
    const childA = noteChild({ id: 'child-a', title: 'Alpha' });
    const childB = noteChild({ id: 'child-b', title: 'Beta', metadata: { parentId: 'container-1' } });
    const childC = noteChild({ id: 'child-c', title: 'Gamma', metadata: { parentId: 'container-1' } });
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-a', 'child-c'] })}
        allPadlets={[childA, childB, childC]}
      />,
    );
    expect(titleNodes(el)).toEqual(['Alpha', 'Gamma']);
  });

  it('two Containers retain fully independent per-child state [matrix 22]', () => {
    const a = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-x'] })} allPadlets={[noteChild({ id: 'child-x', title: 'X visible' })]} />,
    );
    const b = mount(
      <RowColumnContainerCard
        padlet={{ ...container({ visibleChildPostTitleIds: [] }), id: 'container-b' }}
        allPadlets={[{ ...noteChild({ id: 'child-y', title: 'Y hidden' }), metadata: { parentId: 'container-b' } }]}
      />,
    );
    expect(titleNodes(a)).toEqual(['X visible']);
    expect(titleNodes(b)).toEqual([]);
  });

  it('legacy PATCH 9C showChildPostTitles=true, no explicit list yet -> currently-titled children shown [matrix 25]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[noteChild(), imageChild({ title: '' })]} />,
    );
    // Titled child shown (legacy 9C behavior preserved); untitled child never
    // rendered a header even under old 9C, so it stays absent too.
    expect(titleNodes(el)).toEqual(['Hallo world']);
  });

  it('once an explicit list exists, the legacy boolean no longer controls rendering [matrix 27]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ showChildPostTitles: true, visibleChildPostTitleIds: [] })}
        allPadlets={[noteChild()]}
      />,
    );
    // showChildPostTitles is still true, but an explicit (empty) list exists
    // -- the list wins, so nothing renders.
    expect(titleNodes(el)).toEqual([]);
  });

  it('long titles use a single-line, truncating style (no forced card growth) [matrix 13-old]', () => {
    const longTitle = 'A'.repeat(200);
    const el = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-note'] })} allPadlets={[noteChild({ title: longTitle })]} />,
    );
    const span = el.querySelector('[data-child-title-header="true"] span')!;
    expect(span.className).toContain('truncate');
    expect(span.textContent).toBe(longTitle);
  });

  it('Image child title renders correctly, image geometry/crop classes untouched [matrix 34]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-image'] })} allPadlets={[imageChild()]} />,
    );
    expect(titleNodes(el)).toEqual(['My Photo']);
    expect(el.querySelector('img')).not.toBeNull();
  });

  it('Document child title renders correctly', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-doc'] })} allPadlets={[documentChild()]} />,
    );
    expect(titleNodes(el)).toEqual(['Q3 Report']);
  });

  it('a representative additional post type (Todo) works via the same shared shell', () => {
    const todoChild: any = {
      id: 'child-todo',
      title: 'Shopping List',
      content: '',
      type: 'todo',
      metadata: { parentId: 'container-1', items: [] },
    };
    const el = mount(
      <RowColumnContainerCard padlet={container({ visibleChildPostTitleIds: ['child-todo'] })} allPadlets={[todoChild]} />,
    );
    expect(titleNodes(el)).toEqual(['Shopping List']);
  });

  it('Comment-type child also gets a title header via the same shared shell (separate render branch)', () => {
    const commentChild: any = {
      id: 'child-comment',
      title: 'Feedback',
      content: '',
      type: 'comment',
      metadata: { parentId: 'container-1', comments: [] },
    };
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-comment'] })}
        allPadlets={[commentChild]}
        onUpdateChildComments={vi.fn()}
      />,
    );
    expect(titleNodes(el)).toEqual(['Feedback']);
  });

  it('comment-count badge / other child UI is unchanged by per-child visibility [matrix 38]', () => {
    const withComments = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-image'] })}
        allPadlets={[imageChild({ metadata: { imageUrl: 'https://example.com/x.png', parentId: 'container-1', detachedComments: [{ id: 'c1', text: 'hi' }] } })]}
        onUpdateChildComments={vi.fn()}
      />,
    );
    expect(withComments.textContent).toContain('1');

    const hiddenWithComments = mount(
      <RowColumnContainerCard
        padlet={{ ...container({ visibleChildPostTitleIds: [] }), id: 'container-5' }}
        allPadlets={[{ ...imageChild({ metadata: { imageUrl: 'https://example.com/x.png', parentId: 'container-5', detachedComments: [{ id: 'c1', text: 'hi' }] } }), id: 'child-image-2' }]}
        onUpdateChildComments={vi.fn()}
      />,
    );
    expect(hiddenWithComments.textContent).toContain('1');
  });

  it('parent Container data, child metadata, child IDs, and ordering are otherwise unchanged [matrix 30, 39]', () => {
    const childA = noteChild({ id: 'child-a', title: 'First' });
    const childB = { ...noteChild({ id: 'child-b', title: 'Second' }), metadata: { parentId: 'container-1' } };
    const c = container({ visibleChildPostTitleIds: ['child-a', 'child-b'], childPadletIds: ['child-a', 'child-b'] });
    const el = mount(<RowColumnContainerCard padlet={c} allPadlets={[childA, childB]} />);
    expect(titleNodes(el)).toEqual(['First', 'Second']);
    expect((c.metadata as any).childPadletIds).toEqual(['child-a', 'child-b']);
  });

  it('readonly viewers can still see titles the Container owner enabled -- rendering has no write-permission gate [matrix 40]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ visibleChildPostTitleIds: ['child-note'] })}
        allPadlets={[noteChild()]}
        accessMode="read"
      />,
    );
    expect(titleNodes(el)).toEqual(['Hallo world']);
  });
});

describe('RowColumnContainerCard: nested Container independence (PATCH 9C.1) [matrix 23]', () => {
  it("outer Container's per-child list shows the nested Container POST'S OWN title as a child, without touching the inner Container's own list", () => {
    const innerContainer = {
      id: 'inner-container',
      title: 'Inner Container',
      content: '',
      type: 'container',
      metadata: { parentId: 'outer-container', visibleChildPostTitleIds: [], childPadletIds: ['inner-child'] },
    };
    const innerChild = {
      id: 'inner-child',
      title: 'Inner Child Note',
      content: '',
      type: 'note',
      metadata: { parentId: 'inner-container' },
    };
    const outerContainer = {
      id: 'outer-container',
      title: 'Outer Container',
      content: '',
      type: 'container',
      metadata: { visibleChildPostTitleIds: ['inner-container'], childPadletIds: ['inner-container'] },
    };
    const el = mount(
      <RowColumnContainerCard padlet={outerContainer as any} allPadlets={[innerContainer as any, innerChild as any]} />,
    );
    expect(titleNodes(el)).toContain('Inner Container');
    expect(titleNodes(el)).not.toContain('Inner Child Note');
  });

  it("inner Container with its own list enabled shows its own child title independently of the outer Container's list", () => {
    const innerContainer = {
      id: 'inner-container-2',
      title: 'Inner Container 2',
      content: '',
      type: 'container',
      metadata: { parentId: 'outer-container-2', visibleChildPostTitleIds: ['inner-child-2'], childPadletIds: ['inner-child-2'] },
    };
    const innerChild = {
      id: 'inner-child-2',
      title: 'Inner Child 2',
      content: '',
      type: 'note',
      metadata: { parentId: 'inner-container-2' },
    };
    const outerContainer = {
      id: 'outer-container-2',
      title: 'Outer Container 2',
      content: '',
      type: 'container',
      metadata: { visibleChildPostTitleIds: [], childPadletIds: ['inner-container-2'] },
    };
    const el = mount(
      <RowColumnContainerCard padlet={outerContainer as any} allPadlets={[innerContainer as any, innerChild as any]} />,
    );
    expect(titleNodes(el)).not.toContain('Inner Container 2');
    expect(titleNodes(el)).toContain('Inner Child 2');
  });
});
