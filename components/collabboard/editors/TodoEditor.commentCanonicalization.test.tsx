// @vitest-environment jsdom
//
// PATCH 8S -- Todo normal/detached comment canonicalization.
//
// TodoEditor.tsx's own left-toolbar Comment button/badge/panel is one of two
// live normal/detached comment entry points for Todo (the other is
// FreeformPadletCards.tsx's on-canvas badge popup, covered structurally in
// canonicalCommentPermission.contract.test.tsx). Both were previously a
// fully local, hand-rolled comment implementation -- unlike Drawing (PATCH
// 8R), which already delegated to canonical CommentPopup and only needed
// wiring, Todo required a genuine UI migration off local JSX.
//
// Follows this repo's own established convention for editors with no heavy
// canvas dependency (react-dom/client + act, no @testing-library/react --
// see NoteEditor.characterization.test.tsx).
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TodoEditor from './TodoEditor';

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
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const noop = () => {};

describe('TodoEditor -- canonical Comment UI wiring (PATCH 8S)', () => {
  describe('MANAGE mode (default)', () => {
    it('renders existing comments and a newly added comment uses real identity', () => {
      const onSave = vi.fn();
      const c = mount(
        <TodoEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialData={{ tasks: [], detachedComments: [{ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 }] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      expect(c.textContent).toContain('existing');

      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      expect(composer).not.toBeNull();
      setInputValue(composer, 'a fresh comment');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(c.textContent).toContain('a fresh comment');

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      const newComment = saved.detachedComments.find((cm: any) => cm.text === 'a fresh comment');
      expect(newComment.userId).toBe('real-user-123');
      expect(newComment.userName).toBe('Real Name');
      expect(saved.detachedComments.find((cm: any) => cm.id === 'c1')).toEqual({ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1, textColor: undefined, backgroundColor: undefined, isStrikethrough: undefined });
    });

    it('title editing persists through Save', () => {
      const onSave = vi.fn();
      const c = mount(
        <TodoEditor isOpen onClose={noop} onSave={onSave} initialData={{ tasks: [] }} currentUserId="u1" currentUserName="U1" />,
      );
      click(btn(c, 'Comment')!);
      const titleEl = document.body.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      expect(titleEl).not.toBeNull();
      click(titleEl);
      const titleInput = document.body.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
      setInputValue(titleInput, 'Feedback');
      act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.commentTitle).toBe('Feedback');
    });

    it('Delete targets only the clicked comment (row isolation)', () => {
      const c = mount(
        <TodoEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialData={{ tasks: [], detachedComments: [
            { id: 'a', text: 'first comment', userId: 'u1', userName: 'U1', timestamp: 1 },
            { id: 'b', text: 'second comment', userId: 'u1', userName: 'U1', timestamp: 2 },
          ] }}
        />,
      );
      click(btn(c, 'Comment')!);
      const rows = Array.from(c.querySelectorAll('button[title="Delete"]'));
      const target = rows.find((b) => b.closest('[class*="group/row"]')?.textContent?.includes('first comment'));
      expect(target).toBeTruthy();
      click(target!);
      expect(c.textContent).not.toContain('first comment');
      expect(c.textContent).toContain('second comment');
    });

    it('the Todo checkbox/item state is unaffected by comment interaction', () => {
      const c = mount(
        <TodoEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialData={{ tasks: [{ id: 't1', text: 'a task', completed: false }], detachedComments: [{ id: 'c1', text: 'existing', userId: 'u1', userName: 'U1', timestamp: 1 }] }}
        />,
      );
      const checkbox = c.querySelector('input[type="checkbox"]') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
      click(btn(c, 'Comment')!);
      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'does not touch the task');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect((c.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false);
      expect(c.textContent).toContain('a task');
    });
  });

  describe('READ mode', () => {
    it('existing comments are visible but composer/Send/Edit/Strikethrough/Delete/title-editing are all absent', () => {
      const c = mount(
        <TodoEditor
          isOpen
          accessMode="read"
          onClose={noop}
          onSave={noop}
          initialData={{ tasks: [], detachedComments: [{ id: 'c1', text: 'existing note comment', userId: 'u1', userName: 'A', timestamp: 1 }] }}
        />,
      );
      click(btn(c, 'Comment')!);
      expect(c.textContent).toContain('existing note comment');
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(c.querySelector('button[title="Delete"]')).toBeNull();
      expect(c.querySelector('button[title="Edit"]')).toBeNull();
      expect(c.querySelector('button[title="Strikethrough"]')).toBeNull();
      const titleEl = document.body.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      expect(document.body.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    });

    it('manage mode (explicit or default/omitted) keeps the composer available, unchanged', () => {
      const explicit = mount(<TodoEditor isOpen accessMode="manage" onClose={noop} onSave={noop} initialData={{ tasks: [] }} />);
      click(btn(explicit, 'Comment')!);
      expect(explicit.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();

      const omitted = mount(<TodoEditor isOpen onClose={noop} onSave={noop} initialData={{ tasks: [] }} />);
      click(btn(omitted, 'Comment')!);
      expect(omitted.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    });
  });

  describe('historical identity', () => {
    it('a pre-existing placeholder-identity comment is left untouched by opening/closing without editing', () => {
      const onSave = vi.fn();
      const historical = { id: 'legacy-1', text: 'an old comment', userId: 'user1', userName: 'R', timestamp: 1 };
      const c = mount(
        <TodoEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialData={{ tasks: [], detachedComments: [historical] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.detachedComments).toEqual([{ ...historical, textColor: undefined, backgroundColor: undefined, isStrikethrough: undefined }]);
    });
  });
});
