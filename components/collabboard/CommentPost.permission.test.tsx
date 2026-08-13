// @vitest-environment jsdom
//
// PATCH 8Z -- Comment post primary thread permission wiring.
//
// CommentPost.tsx is the expanded on-canvas primary-thread surface for the
// standalone Comment post (its comments ARE the post's entire content --
// PATCH 8X). This proves the READ/MANAGE contract at this specific live
// surface: composer, per-row actions, and title editing are not rendered at
// all in READ (not merely hidden), and the mutation callbacks passed in by
// the caller cannot fire even if a READ-mode interaction is attempted.
//
// Follows this repo's established mount convention (react-dom/client + act,
// no @testing-library/react -- see DrawingEditor.commentCanonicalization.test.tsx).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentPost from './CommentPost';

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
afterEach(() => {
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
function doubleClick(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
}
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}

const noop = () => {};
const EXISTING = [
  { id: 'c1', text: 'first comment', userId: 'u1', userName: 'Alice', timestamp: 1000 },
  { id: 'c2', text: 'second comment', userId: 'u2', userName: 'Bob', timestamp: 2000 },
];

describe('CommentPost -- primary-thread permission wiring (PATCH 8Z)', () => {
  describe('MANAGE (default) -- existing behavior unchanged', () => {
    it('renders existing comments', () => {
      const c = mount(<CommentPost comments={EXISTING} cardColor="#fff" />);
      expect(c.textContent).toContain('first comment');
      expect(c.textContent).toContain('second comment');
    });

    it('Add via Send works', () => {
      const onAddComment = vi.fn();
      const c = mount(<CommentPost comments={[]} cardColor="#fff" onAddComment={onAddComment} />);
      const input = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      expect(input).not.toBeNull();
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'a new comment');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(btn(c, 'Add comment')!);
      expect(onAddComment).toHaveBeenCalledWith('a new comment');
    });

    it('Edit still works (row click enters edit mode)', () => {
      const onEditComment = vi.fn();
      const c = mount(<CommentPost comments={EXISTING} cardColor="#fff" onEditComment={onEditComment} />);
      const row = c.querySelectorAll('.group\\/row')[0];
      click(row.querySelector('div[class*="text-xs text-gray-600 break-words"]')!);
      const textarea = c.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
    });

    it('Strikethrough still works', () => {
      const onToggleCommentStrikethrough = vi.fn();
      const c = mount(<CommentPost comments={EXISTING} cardColor="#fff" onToggleCommentStrikethrough={onToggleCommentStrikethrough} />);
      click(btn(c, 'Strikethrough')!);
      expect(onToggleCommentStrikethrough).toHaveBeenCalledWith('c1');
    });

    it('Delete isolation still works (targets only the clicked comment)', () => {
      const onDeleteComment = vi.fn();
      const c = mount(<CommentPost comments={EXISTING} cardColor="#fff" onDeleteComment={onDeleteComment} />);
      const deleteButtons = c.querySelectorAll('button[title="Delete"]');
      click(deleteButtons[1]);
      expect(onDeleteComment).toHaveBeenCalledWith('c2');
      expect(onDeleteComment).not.toHaveBeenCalledWith('c1');
    });

    it('title double-click still enters edit mode', () => {
      const c = mount(<CommentPost comments={[]} cardColor="#fff" commentTitle="My Thread" />);
      const title = Array.from(c.querySelectorAll('span')).find((s) => s.textContent === 'My Thread')!;
      doubleClick(title);
      expect(c.querySelector('input[placeholder="Title"]')).not.toBeNull();
    });
  });

  describe('READ -- zero mutation surface', () => {
    it('thread and existing comments remain visible', () => {
      const c = mount(<CommentPost comments={EXISTING} cardColor="#fff" accessMode="read" />);
      expect(c.textContent).toContain('first comment');
      expect(c.textContent).toContain('second comment');
    });

    it('composer is not rendered', () => {
      const c = mount(<CommentPost comments={[]} cardColor="#fff" accessMode="read" onAddComment={vi.fn()} />);
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(btn(c, 'Add comment')).toBeNull();
    });

    it('Edit/Color/Strikethrough/Delete row actions are not rendered', () => {
      const c = mount(
        <CommentPost
          comments={EXISTING}
          cardColor="#fff"
          accessMode="read"
          onEditComment={vi.fn()}
          onToggleCommentStrikethrough={vi.fn()}
          onDeleteComment={vi.fn()}
          onUpdateCommentColor={vi.fn()}
        />,
      );
      expect(btn(c, 'Edit')).toBeNull();
      expect(btn(c, 'Strikethrough')).toBeNull();
      expect(btn(c, 'Delete')).toBeNull();
      expect(btn(c, 'Color')).toBeNull();
    });

    it('clicking comment text does not enter edit mode and does not invoke onEditComment', () => {
      const onEditComment = vi.fn();
      const c = mount(<CommentPost comments={EXISTING} cardColor="#fff" accessMode="read" onEditComment={onEditComment} />);
      const textDiv = c.querySelectorAll('div[class*="text-xs text-gray-600 break-words"]')[0];
      click(textDiv);
      expect(c.querySelector('textarea')).toBeNull();
      expect(onEditComment).not.toHaveBeenCalled();
    });

    it('double-clicking the title does not enter edit mode and does not invoke onTitleChange', () => {
      const onTitleChange = vi.fn();
      const c = mount(<CommentPost comments={[]} cardColor="#fff" accessMode="read" commentTitle="My Thread" onTitleChange={onTitleChange} />);
      const title = Array.from(c.querySelectorAll('span')).find((s) => s.textContent === 'My Thread')!;
      doubleClick(title);
      expect(c.querySelector('input[placeholder="Title"]')).toBeNull();
      expect(onTitleChange).not.toHaveBeenCalled();
    });

    it('no comment mutation callback fires from any read-mode interaction attempt', () => {
      const onAddComment = vi.fn();
      const onEditComment = vi.fn();
      const onToggleCommentStrikethrough = vi.fn();
      const onDeleteComment = vi.fn();
      const onUpdateCommentColor = vi.fn();
      const c = mount(
        <CommentPost
          comments={EXISTING}
          cardColor="#fff"
          accessMode="read"
          onAddComment={onAddComment}
          onEditComment={onEditComment}
          onToggleCommentStrikethrough={onToggleCommentStrikethrough}
          onDeleteComment={onDeleteComment}
          onUpdateCommentColor={onUpdateCommentColor}
        />,
      );
      // Attempt every entry point a MANAGE user would use.
      for (const row of Array.from(c.querySelectorAll('.group\\/row'))) {
        click(row);
      }
      expect(onAddComment).not.toHaveBeenCalled();
      expect(onEditComment).not.toHaveBeenCalled();
      expect(onToggleCommentStrikethrough).not.toHaveBeenCalled();
      expect(onDeleteComment).not.toHaveBeenCalled();
      expect(onUpdateCommentColor).not.toHaveBeenCalled();
    });
  });
});
