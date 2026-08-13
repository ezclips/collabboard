// @vitest-environment jsdom
//
// PATCH 8AD -- EmbeddedCommentList / CommentRow READ / MANAGE permission
// wiring, proven directly at the leaf component (the "layer 1" self-contained
// gate, independent of whatever a caller does at its own JSX boundary --
// mirrors how CommentPopup already gates its own UI internally).
//
// Follows this repo's established mount convention (react-dom/client + act,
// no @testing-library/react) -- see EmbeddedCommentList.colorAndLink.test.tsx
// for the sibling suite this file sits alongside.
import React from 'react';
import { act } from 'react';
import fs from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import EmbeddedCommentList from './EmbeddedCommentList';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!(Range.prototype as any).getClientRects) (Range.prototype as any).getClientRects = () => [];
if (!(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} });
}

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
  // Same real (non-fake-timer) drain as EmbeddedCommentList.colorAndLink.test.tsx
  // for CommentRow's TipTap edit-focus setTimeout.
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
function dblclick(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
}
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}

const OWN_COMMENT = {
  id: 'c1',
  text: 'my own comment',
  userId: 'me',
  userName: 'Me',
  timestamp: Date.now(),
};
const OTHER_COMMENT = {
  id: 'c2',
  text: 'someone else comment',
  userId: 'someone-else',
  userName: 'Someone',
  timestamp: Date.now(),
};

describe('EmbeddedCommentList / CommentRow -- READ/MANAGE permission wiring (PATCH 8AD)', () => {
  describe('MANAGE (default, and explicit) -- existing behavior unchanged', () => {
    it('composer and per-row Edit/Strikethrough/Delete are all present when accessMode is omitted', () => {
      const c = mount(
        <EmbeddedCommentList comments={[OWN_COMMENT]} currentUserId="me" onSubmit={vi.fn()} onEditComment={vi.fn()} onRemoveComment={vi.fn()} onToggleStrikethrough={vi.fn()} />
      );
      expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
      expect(btn(c, 'Edit')).not.toBeNull();
      expect(btn(c, 'Strikethrough')).not.toBeNull();
      expect(btn(c, 'Delete')).not.toBeNull();
    });

    it('composer and per-row actions are present with an explicit accessMode="manage"', () => {
      const c = mount(
        <EmbeddedCommentList comments={[OWN_COMMENT]} currentUserId="me" accessMode="manage" onSubmit={vi.fn()} onEditComment={vi.fn()} onRemoveComment={vi.fn()} onToggleStrikethrough={vi.fn()} />
      );
      expect(c.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
      expect(btn(c, 'Delete')).not.toBeNull();
    });

    it('Send calls onSubmit with the composed text', () => {
      const onSubmit = vi.fn();
      const c = mount(
        <EmbeddedCommentList comments={[]} currentUserId="me" onSubmit={onSubmit} />
      );
      const input = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      act(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
        setter.call(input, 'hello');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      click(btn(c, 'Send')!);
      expect(onSubmit).toHaveBeenCalledWith('hello');
    });

    it('Delete calls onRemoveComment with the comment id', () => {
      const onRemoveComment = vi.fn();
      const c = mount(
        <EmbeddedCommentList comments={[OWN_COMMENT]} currentUserId="me" onRemoveComment={onRemoveComment} />
      );
      click(btn(c, 'Delete')!);
      expect(onRemoveComment).toHaveBeenCalledWith('c1');
    });

    it('Strikethrough calls onToggleStrikethrough with the comment id (PATCH 8AO regression proof)', () => {
      const onToggleStrikethrough = vi.fn();
      const c = mount(
        <EmbeddedCommentList comments={[OWN_COMMENT]} currentUserId="me" onToggleStrikethrough={onToggleStrikethrough} />
      );
      click(btn(c, 'Strikethrough')!);
      expect(onToggleStrikethrough).toHaveBeenCalledWith('c1');
    });
  });

  describe('READ -- render gate, not disable', () => {
    it('comments remain visible and readable', () => {
      const c = mount(
        <EmbeddedCommentList comments={[OWN_COMMENT, OTHER_COMMENT]} currentUserId="me" accessMode="read" onSubmit={vi.fn()} onEditComment={vi.fn()} onRemoveComment={vi.fn()} />
      );
      expect(c.textContent).toContain('my own comment');
      expect(c.textContent).toContain('someone else comment');
    });

    it('composer is entirely absent even though onSubmit is provided', () => {
      const c = mount(
        <EmbeddedCommentList comments={[]} currentUserId="me" accessMode="read" onSubmit={vi.fn()} />
      );
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(btn(c, 'Send')).toBeNull();
    });

    it('the entire per-row actions column (Edit/Color/Strikethrough/Delete) is absent, even for a comment the current user owns', () => {
      const c = mount(
        <EmbeddedCommentList
          comments={[OWN_COMMENT]}
          currentUserId="me"
          accessMode="read"
          onEditComment={vi.fn()}
          onRemoveComment={vi.fn()}
          onToggleStrikethrough={vi.fn()}
          onColorChange={vi.fn()}
        />
      );
      expect(btn(c, 'Edit')).toBeNull();
      expect(btn(c, 'Color')).toBeNull();
      expect(btn(c, 'Strikethrough')).toBeNull();
      expect(btn(c, 'Delete')).toBeNull();
    });

    it('double-clicking an owned comment row does not enter edit mode (the double-click-to-edit bypass this patch closes)', () => {
      const onEditComment = vi.fn();
      const c = mount(
        <EmbeddedCommentList comments={[OWN_COMMENT]} currentUserId="me" accessMode="read" onEditComment={onEditComment} />
      );
      const row = c.getElementsByClassName('group/row')[0];
      expect(row).toBeTruthy();
      dblclick(row);
      // If edit mode had opened, a ProseMirror editable region would exist.
      expect(c.querySelector('.ProseMirror')).toBeNull();
      expect(onEditComment).not.toHaveBeenCalled();
    });

    it('callback-defense: dispatching clicks directly on the row does not fire any mutation callback', () => {
      const onSubmit = vi.fn();
      const onEditComment = vi.fn();
      const onRemoveComment = vi.fn();
      const onToggleStrikethrough = vi.fn();
      const onColorChange = vi.fn();
      const c = mount(
        <EmbeddedCommentList
          comments={[OWN_COMMENT]}
          currentUserId="me"
          accessMode="read"
          onSubmit={onSubmit}
          onEditComment={onEditComment}
          onRemoveComment={onRemoveComment}
          onToggleStrikethrough={onToggleStrikethrough}
          onColorChange={onColorChange}
        />
      );
      const rows = Array.from(c.getElementsByClassName('group/row'));
      rows.forEach((row) => {
        click(row);
        dblclick(row);
      });
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onEditComment).not.toHaveBeenCalled();
      expect(onRemoveComment).not.toHaveBeenCalled();
      expect(onToggleStrikethrough).not.toHaveBeenCalled();
      expect(onColorChange).not.toHaveBeenCalled();
    });
  });
});

// PATCH 8AO -- CommentRow previously derived Edit's ownership from an ad hoc
// `canManage && comment.userId === currentUserId` rule, which was STRICTER
// than canonical MANAGE semantics (a MANAGE user could not edit another
// user's comment through this renderer, unlike every other canonical
// comment surface). Fixed by routing through the same domain authority every
// other surface already uses: canMutateComment(accessMode, comment,
// currentUserId). This block proves the fix directly; COMMENT-mode cases are
// exercised here only as the shelved domain contract (lib/domain/canvas/
// comments.ts) -- never made reachable through CanvasClient/
// resolveCommentAccessMode.
describe('EmbeddedCommentList / CommentRow -- PATCH 8AO: canMutateComment-aligned ownership', () => {
  describe('MANAGE -- regression: can mutate ANY comment, not just the current user\'s own', () => {
    it('Edit is available (enabled) for another user\'s comment, and clicking it enters editing state', () => {
      const c = mount(
        <EmbeddedCommentList
          comments={[{ id: 'c-mgr', text: 'not mine', userId: 'other-user', userName: 'Other', timestamp: Date.now() }]}
          currentUserId="manager-user"
          accessMode="manage"
          onEditComment={vi.fn()}
        />
      );
      const editBtn = btn(c, 'Edit');
      expect(editBtn).not.toBeNull();
      expect(editBtn!.disabled).toBe(false);
      click(editBtn!);
      expect(c.querySelector('.ProseMirror')).not.toBeNull();
    });
  });

  describe('COMMENT (dormant live) -- own-comment-only mutation, exercised directly per the shelved domain contract', () => {
    it('Edit is available for the current user\'s OWN comment', () => {
      const c = mount(
        <EmbeddedCommentList
          comments={[{ id: 'c-own', text: 'mine', userId: 'commenter-a', userName: 'A', timestamp: Date.now() }]}
          currentUserId="commenter-a"
          accessMode="comment"
          onEditComment={vi.fn()}
        />
      );
      const editBtn = btn(c, 'Edit');
      expect(editBtn).not.toBeNull();
      expect(editBtn!.disabled).toBe(false);
      click(editBtn!);
      expect(c.querySelector('.ProseMirror')).not.toBeNull();
    });

    it('Edit is UNAVAILABLE for another user\'s comment -- disabled, and the callback guard also blocks a direct click', () => {
      const c = mount(
        <EmbeddedCommentList
          comments={[{ id: 'c-other', text: 'not mine', userId: 'commenter-b', userName: 'B', timestamp: Date.now() }]}
          currentUserId="commenter-a"
          accessMode="comment"
          onEditComment={vi.fn()}
        />
      );
      const editBtn = btn(c, 'Edit');
      expect(editBtn).not.toBeNull();
      expect(editBtn!.disabled).toBe(true);
      click(editBtn!);
      expect(c.querySelector('.ProseMirror')).toBeNull();
    });

    it('the double-click-to-edit path independently re-checks ownership (direct interaction bypass, no disabled-button semantics to rely on)', () => {
      // The Edit BUTTON's own `disabled` attribute would already suppress a
      // browser/jsdom click before it reaches React's handler, so a test
      // that only clicks that button can never prove the handler's OWN
      // `canMutateThisComment` check is independently load-bearing (React
      // itself already blocks the dispatch once `disabled` is true,
      // regardless of what the handler body does). The row's own
      // onDoubleClick, in contrast, is a plain, un-disabled <div> -- nothing
      // but the handler's internal `if (canMutateThisComment)` check can
      // stop it. Double-clicking the row for a comment this user does NOT
      // own, in COMMENT mode, is therefore the genuine "direct interaction"
      // bypass target -- mirrors the existing READ-mode dblclick test below.
      const onEditComment = vi.fn();
      const c = mount(
        <EmbeddedCommentList
          comments={[{ id: 'c-other2', text: 'not mine', userId: 'commenter-b', userName: 'B', timestamp: Date.now() }]}
          currentUserId="commenter-a"
          accessMode="comment"
          onEditComment={onEditComment}
        />
      );
      const row = c.getElementsByClassName('group/row')[0];
      expect(row).toBeTruthy();
      dblclick(row);
      expect(c.querySelector('.ProseMirror')).toBeNull();
      expect(onEditComment).not.toHaveBeenCalled();
    });
  });

  describe('READ -- Edit unavailable regardless of ownership', () => {
    it('Edit is unavailable for both an owned and a non-owned comment', () => {
      const c = mount(
        <EmbeddedCommentList
          comments={[OWN_COMMENT, OTHER_COMMENT]}
          currentUserId="me"
          accessMode="read"
          onEditComment={vi.fn()}
        />
      );
      expect(btn(c, 'Edit')).toBeNull();
    });
  });

  describe('architecture characterization -- ownership must be derived from canMutateComment', () => {
    it('CommentRow.tsx imports and calls the canonical canMutateComment authority, and no longer contains the old ad hoc predicate', () => {
      const source = fs.readFileSync('components/collabboard/CommentRow.tsx', 'utf8');
      expect(source).toMatch(/canMutateComment\(/);
      expect(source).toMatch(/from ['"]@\/lib\/domain\/canvas\/comments['"]/);
      // The old, stricter-than-canonical predicate must not be reintroduced.
      expect(source).not.toMatch(/canManage\s*&&\s*comment\.userId\s*===\s*currentUserId/);
    });
  });
});
