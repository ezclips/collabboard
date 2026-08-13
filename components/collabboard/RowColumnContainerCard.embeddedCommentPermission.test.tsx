// @vitest-environment jsdom
//
// PATCH 8AD -- RowColumnContainerCard's two embedded EmbeddedCommentList
// surfaces (comment-type children storing metadata.comments, and any other
// child's detached-comment toggle storing metadata.detachedComments) are
// permission-wired here. This is the "layer 2" caller-side proof: every
// mutation callback passed into EmbeddedCommentList is wrapped with
// guardCommentMutation(accessMode, ...) at the JSX boundary, independent of
// EmbeddedCommentList's own internal UI-hiding (proven separately in
// EmbeddedCommentList.permission.test.tsx). Mirrors the mount convention and
// child-ownership/sibling-isolation methodology established in PATCH 8AC's
// ContainerEditor.childCommentPermission.test.tsx.
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

const CONTAINER = { id: 'container-1', title: 'Container', content: '', type: 'container', metadata: { childPadletIds: ['child-a', 'child-b'] } };
// userId matches the mounting currentUserId ('real-user-123') so the Edit
// button's own ownership check (unrelated to the accessMode gate under test)
// doesn't block these MANAGE-mode edit tests.
const CHILD_A_COMMENTS = [{ id: 'ca1', text: 'child A comment', userId: 'real-user-123', userName: 'Alice', timestamp: 1000 }];
const CHILD_B_COMMENTS = [{ id: 'cb1', text: 'child B comment', userId: 'real-user-123', userName: 'Bob', timestamp: 2000 }];

function twoCommentTypeChildren() {
  return [
    { id: 'child-a', title: 'A', content: '', type: 'comment', metadata: { comments: CHILD_A_COMMENTS, parentId: 'container-1' } },
    { id: 'child-b', title: 'B', content: '', type: 'comment', metadata: { comments: CHILD_B_COMMENTS, parentId: 'container-1' } },
  ];
}

function detachedCommentChild() {
  return [
    {
      id: 'child-image',
      title: 'Image child',
      content: '',
      type: 'image',
      metadata: {
        imageUrl: 'https://example.com/x.png',
        parentId: 'container-1',
        detachedComments: [{ id: 'dc1', text: 'detached one', userId: 'u1', userName: 'Alice', timestamp: 1000 }],
      },
    },
  ];
}

function mountCard(overrides: Partial<React.ComponentProps<typeof RowColumnContainerCard>> = {}) {
  const allPadlets = (overrides.allPadlets as any[] | undefined) ?? twoCommentTypeChildren();
  return mount(
    <RowColumnContainerCard
      padlet={CONTAINER as any}
      allPadlets={allPadlets as any}
      currentUserId="real-user-123"
      currentUserName="Real Name"
      onUpdateChildComments={vi.fn()}
      {...overrides}
    />,
  );
}

describe('RowColumnContainerCard embedded child EmbeddedCommentList -- permission wiring (PATCH 8AD)', () => {
  describe('comment-type children (metadata.comments) -- MANAGE', () => {
    it('renders both children\'s existing comments', () => {
      const c = mountCard();
      expect(c.textContent).toContain('child A comment');
      expect(c.textContent).toContain('child B comment');
    });

    it('Add via Send targets only the owning child and the comments field', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountCard({ onUpdateChildComments });
      const inputs = c.querySelectorAll('input[placeholder="Add a comment..."]');
      expect(inputs.length).toBe(2);
      const childAInput = inputs[0] as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(childAInput, 'new reply');
        childAInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(c.querySelectorAll('button[title="Send"]')[0]);
      expect(onUpdateChildComments).toHaveBeenCalledTimes(1);
      const [childId, comments, options] = onUpdateChildComments.mock.calls[0];
      expect(childId).toBe('child-a');
      expect(childId).not.toBe('child-b');
      expect(comments.some((cm: any) => cm.text === 'new reply')).toBe(true);
      expect(options).toEqual({ field: 'comments' });
    });

    it('Edit targets only the owning child (sibling isolation)', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountCard({ onUpdateChildComments });
      const editButtons = c.querySelectorAll('button[title="Edit"]');
      expect(editButtons.length).toBe(2);
      click(editButtons[0]);
      const input = c.querySelector('.ProseMirror') as HTMLElement;
      expect(input).not.toBeNull();
      act(() => {
        input.focus();
        input.textContent = 'edited text';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      });
      expect(onUpdateChildComments).toHaveBeenCalled();
      const [childId] = onUpdateChildComments.mock.calls[onUpdateChildComments.mock.calls.length - 1];
      expect(childId).toBe('child-a');
      expect(childId).not.toBe('child-b');
    });

    it('PATCH 8AS: Link authoring targets only the owning child and never touches Container-level callbacks', () => {
      const onUpdateChildComments = vi.fn();
      const onEditContainer = vi.fn();
      const onDropExistingPadlet = vi.fn();
      const onScanChild = vi.fn();
      const c = mountCard({ onUpdateChildComments, onEditContainer, onDropExistingPadlet, onScanChild });
      const editButtons = c.querySelectorAll('button[title="Edit"]');
      click(editButtons[0]);
      const pm = c.querySelector('.ProseMirror') as HTMLElement;
      act(() => {
        pm.focus();
        const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
        const node = walker.nextNode() as Text;
        const idx = node.textContent!.indexOf('child A comment');
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + 'child A comment'.length);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      click(c.querySelector('button[title="Link"]')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      expect(urlInput, 'Link popup did not open inside RowColumnContainerCard host').not.toBeNull();
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(urlInput, 'google.com');
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
      });
      const addButton = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Add');
      click(addButton!);
      // Blur to commit (CommentRow persists on blur, not immediately on Add).
      act(() => {
        pm.closest('.relative')!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
      });
      expect(onUpdateChildComments).toHaveBeenCalled();
      const [childId, comments] = onUpdateChildComments.mock.calls[onUpdateChildComments.mock.calls.length - 1];
      expect(childId).toBe('child-a');
      expect(childId).not.toBe('child-b');
      expect(comments.some((cm: any) => (cm.text as string).includes('href="https://google.com"'))).toBe(true);
      expect(onEditContainer).not.toHaveBeenCalled();
      expect(onDropExistingPadlet).not.toHaveBeenCalled();
      expect(onScanChild).not.toHaveBeenCalled();
      // Card-level drag/reorder never fires from a Link interaction -- no
      // such callback was invoked with anything other than the owning child's
      // comment mutation.
      expect(c.textContent).toContain('child B comment');
    });

    it('a child comment mutation never touches Container-level callbacks (onEditContainer, onDropExistingPadlet, onScanChild)', () => {
      const onUpdateChildComments = vi.fn();
      const onEditContainer = vi.fn();
      const onDropExistingPadlet = vi.fn();
      const onScanChild = vi.fn();
      const c = mountCard({ onUpdateChildComments, onEditContainer, onDropExistingPadlet, onScanChild });
      click(c.querySelectorAll('button[title="Delete"]')[0]);
      expect(onUpdateChildComments).toHaveBeenCalledTimes(1);
      expect(onEditContainer).not.toHaveBeenCalled();
      expect(onDropExistingPadlet).not.toHaveBeenCalled();
      expect(onScanChild).not.toHaveBeenCalled();
    });
  });

  describe('comment-type children (metadata.comments) -- READ', () => {
    it('comments remain visible; composer and Delete are absent for both children', () => {
      const c = mountCard({ accessMode: 'read' });
      expect(c.textContent).toContain('child A comment');
      expect(c.textContent).toContain('child B comment');
      expect(c.querySelectorAll('input[placeholder="Add a comment..."]').length).toBe(0);
      expect(c.querySelectorAll('button[title="Delete"]').length).toBe(0);
    });

    it('callback-defense: no interaction fires onUpdateChildComments', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountCard({ accessMode: 'read', onUpdateChildComments });
      const rows = Array.from(c.getElementsByClassName('group/row'));
      expect(rows.length).toBeGreaterThan(0);
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
    });
  });

  describe('detached-comment child (metadata.detachedComments) -- MANAGE', () => {
    it('the detached toggle opens the panel and Delete targets the owning child with field:"detachedComments"', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountCard({ allPadlets: detachedCommentChild() as any, onUpdateChildComments });
      // Open the toggle (title includes the comment count or "Add a comment").
      const toggle = Array.from(c.querySelectorAll('button')).find((b) => (b.title || '').includes('comment'));
      expect(toggle, 'detached-comment toggle button not found').toBeTruthy();
      click(toggle!);
      const deleteBtn = c.querySelector('button[title="Delete"]');
      expect(deleteBtn).not.toBeNull();
      click(deleteBtn!);
      expect(onUpdateChildComments).toHaveBeenCalledWith('child-image', [], { field: 'detachedComments' });
    });
  });

  describe('detached-comment child (metadata.detachedComments) -- READ', () => {
    it('Delete is absent after opening the toggle, and no callback fires on row interaction', () => {
      const onUpdateChildComments = vi.fn();
      const c = mountCard({ allPadlets: detachedCommentChild() as any, accessMode: 'read', onUpdateChildComments });
      const toggle = Array.from(c.querySelectorAll('button')).find((b) => (b.title || '').includes('comment'));
      click(toggle!);
      expect(c.querySelector('button[title="Delete"]')).toBeNull();
      const rows = Array.from(c.getElementsByClassName('group/row'));
      rows.forEach((row) => click(row));
      expect(onUpdateChildComments).not.toHaveBeenCalled();
    });
  });

  describe('architecture', () => {
    it('accessMode threads into both embedded EmbeddedCommentList call sites and every mutation callback is guarded', () => {
      const src = require('node:fs').readFileSync('components/collabboard/RowColumnContainerCard.tsx', 'utf8');
      expect(src).toContain('import { guardCommentMutation, type CommentAccessMode } from "@/lib/domain/canvas/comments";');
      expect(src).toContain('accessMode?: CommentAccessMode;');
      expect(src).toContain("accessMode = 'manage',");
      const guardedCount = (src.match(/guardCommentMutation\(accessMode,/g) ?? []).length;
      // 5 guarded props (onSubmit/onEditComment/onRemoveComment/onToggleStrikethrough/onColorChange)
      // x 2 EmbeddedCommentList call sites = 10.
      expect(guardedCount).toBe(10);
      const accessModePropCount = (src.match(/accessMode=\{accessMode\}/g) ?? []).length;
      // 2 EmbeddedCommentList call sites + the PostCardContent forward = 3.
      expect(accessModePropCount).toBe(3);
    });

    it('RowColumnContainerCard forwards accessMode to its own PostCardContent child-rendering call', () => {
      const src = require('node:fs').readFileSync('components/collabboard/RowColumnContainerCard.tsx', 'utf8');
      const start = src.indexOf('<PostCardContent');
      const end = src.indexOf('/>', start);
      expect(src.slice(start, end)).toContain('accessMode={accessMode}');
    });
  });
});
