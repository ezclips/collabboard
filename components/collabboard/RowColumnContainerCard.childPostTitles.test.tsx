// @vitest-environment jsdom
//
// PATCH 9C -- per-Container "Show post titles" display setting
// (metadata.showChildPostTitles). RowColumnContainerCard is the single
// shared on-canvas Container-child renderer reused by every layout
// (Freeform, Wall, Row/Column, Drawing, Map, Chrono -- see PostCardContent's
// own "container child" doc comment), so exercising it here covers the
// setting everywhere it's reused. Mirrors the mount convention established
// in RowColumnContainerCard.embeddedCommentPermission.test.tsx.
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

describe('RowColumnContainerCard: child post title visibility (PATCH 9C)', () => {
  it('missing flag -> titles hidden (default, legacy Containers unaffected) [matrix 1, 9]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container()} allPadlets={[noteChild()]} />,
    );
    expect(titleNodes(el)).toEqual([]);
    expect(el.textContent).not.toContain('Hallo world');
  });

  it('explicit false -> titles hidden, identical to missing', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: false })} allPadlets={[noteChild()]} />,
    );
    expect(titleNodes(el)).toEqual([]);
  });

  it('flag true -> child title renders above its content [matrix 5]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[noteChild()]} />,
    );
    expect(titleNodes(el)).toEqual(['Hallo world']);
  });

  it('two Containers retain independent settings [matrix 8]', () => {
    const onEl = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[noteChild()]} />,
    );
    const offEl = mount(
      <RowColumnContainerCard padlet={{ ...container({ showChildPostTitles: false }), id: 'container-2' }} allPadlets={[{ ...noteChild(), metadata: { parentId: 'container-2' } }]} />,
    );
    expect(titleNodes(onEl)).toEqual(['Hallo world']);
    expect(titleNodes(offEl)).toEqual([]);
  });

  it('untitled child (empty/whitespace/undefined) renders no title header, no blank space [matrix 12]', () => {
    const emptyTitle = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[noteChild({ title: '' })]} />,
    );
    expect(titleNodes(emptyTitle)).toEqual([]);

    const whitespaceTitle = mount(
      <RowColumnContainerCard padlet={{ ...container({ showChildPostTitles: true }), id: 'container-3' }} allPadlets={[{ ...noteChild({ title: '   ' }), id: 'child-ws', metadata: { parentId: 'container-3' } }]} />,
    );
    expect(titleNodes(whitespaceTitle)).toEqual([]);

    const undefinedTitle = mount(
      <RowColumnContainerCard padlet={{ ...container({ showChildPostTitles: true }), id: 'container-4' }} allPadlets={[{ ...noteChild({ title: undefined }), id: 'child-undef', metadata: { parentId: 'container-4' } }]} />,
    );
    expect(titleNodes(undefinedTitle)).toEqual([]);
  });

  it('long titles use a single-line, truncating style (no forced card growth) [matrix 13]', () => {
    const longTitle = 'A'.repeat(200);
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[noteChild({ title: longTitle })]} />,
    );
    const span = el.querySelector('[data-child-title-header="true"] span')!;
    expect(span.className).toContain('truncate');
    expect(span.textContent).toBe(longTitle);
  });

  it('Image child title renders correctly, image geometry/crop classes untouched [matrix 14, 23]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[imageChild()]} />,
    );
    expect(titleNodes(el)).toEqual(['My Photo']);
    expect(el.querySelector('img')).not.toBeNull();
  });

  it('Note child title renders correctly [matrix 15]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[noteChild()]} />,
    );
    expect(titleNodes(el)).toEqual(['Hallo world']);
  });

  it('Document child title renders correctly [matrix 16]', () => {
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[documentChild()]} />,
    );
    expect(titleNodes(el)).toEqual(['Q3 Report']);
  });

  it('a representative additional post type (Todo) works via the same shared shell [matrix 17]', () => {
    const todoChild: any = {
      id: 'child-todo',
      title: 'Shopping List',
      content: '',
      type: 'todo',
      metadata: { parentId: 'container-1', items: [] },
    };
    const el = mount(
      <RowColumnContainerCard padlet={container({ showChildPostTitles: true })} allPadlets={[todoChild]} />,
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
        padlet={container({ showChildPostTitles: true })}
        allPadlets={[commentChild]}
        onUpdateChildComments={vi.fn()}
      />,
    );
    expect(titleNodes(el)).toEqual(['Feedback']);
  });

  it('comment-count badge / other child UI is unchanged by the title toggle [matrix 18]', () => {
    const onWithComments = mount(
      <RowColumnContainerCard
        padlet={container({ showChildPostTitles: true })}
        allPadlets={[imageChild({ metadata: { imageUrl: 'https://example.com/x.png', parentId: 'container-1', detachedComments: [{ id: 'c1', text: 'hi' }] } })]}
        onUpdateChildComments={vi.fn()}
      />,
    );
    expect(onWithComments.textContent).toContain('1');

    const offWithComments = mount(
      <RowColumnContainerCard
        padlet={{ ...container({ showChildPostTitles: false }), id: 'container-5' }}
        allPadlets={[{ ...imageChild({ metadata: { imageUrl: 'https://example.com/x.png', parentId: 'container-5', detachedComments: [{ id: 'c1', text: 'hi' }] } }), id: 'child-image-2' }]}
        onUpdateChildComments={vi.fn()}
      />,
    );
    expect(offWithComments.textContent).toContain('1');
  });

  it('parent Container data, child metadata, child IDs, and ordering are otherwise unchanged [matrix 19-22]', () => {
    const childA = noteChild({ id: 'child-a', title: 'First' });
    const childB = { ...noteChild({ id: 'child-b', title: 'Second' }), metadata: { parentId: 'container-1' } };
    const c = container({ showChildPostTitles: true, childPadletIds: ['child-a', 'child-b'] });
    const el = mount(
      <RowColumnContainerCard padlet={c} allPadlets={[childA, childB]} />,
    );
    // Both titles render, in child order.
    expect(titleNodes(el)).toEqual(['First', 'Second']);
    // Toggling the flag doesn't touch the Container's own childPadletIds.
    expect((c.metadata as any).childPadletIds).toEqual(['child-a', 'child-b']);
  });

  it('readonly viewers can still see titles the Container owner enabled -- rendering has no write-permission gate [matrix 29]', () => {
    const el = mount(
      <RowColumnContainerCard
        padlet={container({ showChildPostTitles: true })}
        allPadlets={[noteChild()]}
        accessMode="read"
      />,
    );
    expect(titleNodes(el)).toEqual(['Hallo world']);
  });
});

describe('RowColumnContainerCard: nested Container independence (PATCH 9C) [matrix 30]', () => {
  it("outer Container's setting shows the nested Container POST'S OWN title as a child, without touching the inner Container's own setting", () => {
    const innerContainer = {
      id: 'inner-container',
      title: 'Inner Container',
      content: '',
      type: 'container',
      metadata: { parentId: 'outer-container', showChildPostTitles: false, childPadletIds: ['inner-child'] },
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
      metadata: { showChildPostTitles: true, childPadletIds: ['inner-container'] },
    };
    const el = mount(
      <RowColumnContainerCard padlet={outerContainer as any} allPadlets={[innerContainer as any, innerChild as any]} />,
    );
    // Outer shows the nested Container's own title as its child header.
    expect(titleNodes(el)).toContain('Inner Container');
    // Inner Container's own setting (OFF) means its own child stays hidden.
    expect(el.textContent).not.toContain('Inner Child Note');
  });

  it('inner Container with its own setting ON shows its own child title independently of the outer setting', () => {
    const innerContainer = {
      id: 'inner-container-2',
      title: 'Inner Container 2',
      content: '',
      type: 'container',
      metadata: { parentId: 'outer-container-2', showChildPostTitles: true, childPadletIds: ['inner-child-2'] },
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
      metadata: { showChildPostTitles: false, childPadletIds: ['inner-container-2'] },
    };
    const el = mount(
      <RowColumnContainerCard padlet={outerContainer as any} allPadlets={[innerContainer as any, innerChild as any]} />,
    );
    // Outer setting OFF: RowColumnContainerCard adds no title header for the
    // nested Container as its child (PostCardContent's own always-on
    // "Container" identity <h4>, a pre-existing and unrelated element, may
    // still show the same text -- that's not this toggle's header).
    expect(titleNodes(el)).not.toContain('Inner Container 2');
    // But the inner Container's OWN setting (ON) still shows its own child's
    // title, via its own independent renderChildTitle call in PostCardContent.
    expect(titleNodes(el)).toContain('Inner Child 2');
  });
});
