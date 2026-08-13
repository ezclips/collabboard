// @vitest-environment jsdom
//
// PATCH 8AD -- PostCardContent's three EmbeddedCommentList call sites:
//
// 1. COMMENT TYPE (padlet.type === 'comment' && onUpdateChildComments) --
//    unreachable in the live app today: every layout that could reach a
//    top-level comment-type post either routes it to the canonical
//    CommentPost.tsx (FreeformPadletCards.tsx) or never passes
//    onUpdateChildComments to a top-level PostCardContent call (Columns/Grid
//    layouts). RowColumnContainerCard also always intercepts comment-type
//    CHILDREN itself before ever delegating to PostCardContent. Covered here
//    anyway (uniformly wired, not skipped) since the gate costs nothing and
//    the branch is one guardCommentMutation call away from being live if that
//    routing ever changes.
// 2. IMAGE TYPE / drawing-container image-binding (canvasContext === 'drawing'
//    && isInContainer && onUpdateChildComments) -- LIVE, reached via
//    DrawingLayout's AutoHeightContainer -> RowColumnContainerCard ->
//    PostCardContent chain for an image child of a Drawing-layout container.
// 3. CONTAINER TYPE's own children.map -- reachable only if a container child
//    is itself a container (no live creation flow builds this today, but the
//    render path exists and forwards onUpdateChildComments unconditionally),
//    covered directly by mounting PostCardContent with a container padlet.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PostCardContent from './PostCardContent';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: Array<{ root: Root; container: HTMLElement }> = [];
function mount(ui: React.ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  mounted.push({ root, container });
  return container;
}
afterEach(async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  for (const m of mounted) {
    act(() => {
      m.root.unmount();
    });
    m.container.remove();
  }
  mounted = [];
});

function click(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('PostCardContent EmbeddedCommentList call sites -- permission wiring (PATCH 8AD)', () => {
  describe('IMAGE TYPE / drawing-container image-binding (LIVE, call site reached via RowColumnContainerCard in DrawingLayout)', () => {
    const imagePadlet = {
      id: 'img-1',
      title: 'Image',
      content: '',
      type: 'image',
      metadata: {
        imageUrl: 'https://example.com/x.png',
        parentId: 'container-1',
        detachedComments: [{ id: 'dc1', text: 'existing detached comment', userId: 'u1', userName: 'Alice', timestamp: 1000 }],
      },
    } as any;

    it('MANAGE: comment visible, composer present, Delete works and targets detachedComments', () => {
      const onUpdateChildComments = vi.fn();
      const c = mount(
        <PostCardContent padlet={imagePadlet} canvasContext="drawing" onUpdateChildComments={onUpdateChildComments} />
      );
      expect(c.textContent).toContain('existing detached comment');
      expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
      click(c.querySelector('button[title="Delete"]')!);
      expect(onUpdateChildComments).toHaveBeenCalledWith('img-1', [], { field: 'detachedComments' });
    });

    it('READ: comment visible, composer and Delete absent, no callback fires on row interaction', () => {
      const onUpdateChildComments = vi.fn();
      const c = mount(
        <PostCardContent padlet={imagePadlet} canvasContext="drawing" onUpdateChildComments={onUpdateChildComments} accessMode="read" />
      );
      expect(c.textContent).toContain('existing detached comment');
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(c.querySelector('button[title="Delete"]')).toBeNull();
      const rows = Array.from(c.getElementsByClassName('group/row'));
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
    });

    it('is inert outside canvasContext="drawing" even with onUpdateChildComments present (no EmbeddedCommentList rendered)', () => {
      const c = mount(
        <PostCardContent padlet={imagePadlet} onUpdateChildComments={vi.fn()} />
      );
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(c.textContent).not.toContain('existing detached comment');
    });
  });

  describe('CONTAINER TYPE nested child rendering (structurally reachable, not live-triggerable today)', () => {
    const nestedContainerPadlet = {
      id: 'outer-container',
      title: 'Outer',
      content: '',
      type: 'container',
      metadata: {
        childPadletIds: ['inner-comment-child'],
      },
    } as any;
    const allPadlets = [
      nestedContainerPadlet,
      {
        id: 'inner-comment-child',
        title: 'Inner comment',
        content: '',
        type: 'comment',
        metadata: { comments: [{ id: 'ic1', text: 'nested child comment', userId: 'u1', userName: 'Alice', timestamp: 1000 }] },
      },
    ];

    it('MANAGE: nested comment-type child comment visible and mutable, targeting the child id', () => {
      const onUpdateChildComments = vi.fn();
      const c = mount(
        <PostCardContent padlet={nestedContainerPadlet} allPadlets={allPadlets as any} onUpdateChildComments={onUpdateChildComments} />
      );
      expect(c.textContent).toContain('nested child comment');
      click(c.querySelector('button[title="Delete"]')!);
      expect(onUpdateChildComments).toHaveBeenCalledWith('inner-comment-child', []);
    });

    it('READ: nested comment-type child comment visible but not mutable', () => {
      const onUpdateChildComments = vi.fn();
      const c = mount(
        <PostCardContent padlet={nestedContainerPadlet} allPadlets={allPadlets as any} onUpdateChildComments={onUpdateChildComments} accessMode="read" />
      );
      expect(c.textContent).toContain('nested child comment');
      expect(c.querySelector('button[title="Delete"]')).toBeNull();
      const rows = Array.from(c.getElementsByClassName('group/row'));
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
    });
  });

  describe('architecture', () => {
    it('all three EmbeddedCommentList call sites accept accessMode and guard every mutation callback', () => {
      const src = require('node:fs').readFileSync('components/collabboard/PostCardContent.tsx', 'utf8');
      expect(src).toContain('import { guardCommentMutation, type CommentAccessMode } from "@/lib/domain/canvas/comments";');
      expect(src).toContain('accessMode?: CommentAccessMode;');
      expect(src).toContain("accessMode = 'manage',");
      const guardedCount = (src.match(/guardCommentMutation\(accessMode,/g) ?? []).length;
      // 5 guarded props x 3 EmbeddedCommentList call sites = 15.
      expect(guardedCount).toBe(15);
      const accessModePropOnEmbedded = (src.match(/showComposer=\{true\}\s*\n\s*accessMode=\{accessMode\}/g) ?? []).length;
      expect(accessModePropOnEmbedded).toBe(3);
    });

    it('the recursive PostCardContent call (non-comment container children) forwards accessMode', () => {
      const src = require('node:fs').readFileSync('components/collabboard/PostCardContent.tsx', 'utf8');
      const start = src.lastIndexOf('<PostCardContent');
      const end = src.indexOf('/>', start);
      expect(src.slice(start, end)).toContain('accessMode={accessMode}');
    });
  });
});
