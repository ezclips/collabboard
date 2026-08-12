// @vitest-environment jsdom
//
// PATCH 8R -- Drawing normal/detached comment canonicalization.
//
// DrawingEditor.tsx's own left-toolbar Comment button/badge/panel is the
// ONLY live normal/detached comment entry point for Drawing (Phase 1
// inventory: no on-canvas badge/toolbar CommentPopup for Drawing exists in
// FreeformPadletCards.tsx or CanvasClient.tsx, unlike Note/Clipart/Image).
// Drawing has no anchored/highlighted (Category B) comment system either --
// ExcalidrawWrapper.tsx contains zero comment-related code.
//
// Follows this repo's own DrawingEditor-adjacent test convention
// (react-dom/client + act, no @testing-library/react -- see
// NoteEditor.characterization.test.tsx) rather than introducing a library
// unused elsewhere in the app test suite. ExcalidrawWrapper (heavy,
// canvas-dependent, dynamically imported with ssr:false) and the
// localStorage/Supabase-backed excalidraw library cache are mocked out --
// irrelevant to comment behavior, and this is the first test file to ever
// mount DrawingEditor, so there is no established in-repo precedent for
// exercising the real canvas in jsdom.
//
// DrawingEditor's own CommentPopup call is portaled to document.body (a
// `createPortal(..., document.body)` wrapper, unlike NoteEditor's inline
// sharedPanel), so comment-panel content is queried from document.body,
// not the mounted container -- the toolbar buttons that trigger it
// (Comment/Text style/Color/Reaction/Caption) remain inline in the
// mounted container.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DrawingEditor from './DrawingEditor';

vi.mock('./ExcalidrawWrapper', () => ({ default: () => React.createElement('div', { 'data-testid': 'excalidraw-stub' }) }));
vi.mock('@/lib/collabboard/excalidrawLibrary', () => ({ getExcalidrawLibrary: () => [] }));

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

describe('DrawingEditor -- canonical Comment UI wiring (PATCH 8R)', () => {
  describe('MANAGE mode (default)', () => {
    it('renders existing comments and a newly added comment uses real identity', () => {
      const onSave = vi.fn();
      const c = mount(
        <DrawingEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 }] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      expect(document.body.textContent).toContain('existing');

      const composer = document.body.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'a fresh comment');
      click(document.body.querySelector('button[aria-label="Send"]')!);
      expect(document.body.textContent).toContain('a fresh comment');

      const overlay = c.firstElementChild as HTMLElement;
      act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

      const saved = onSave.mock.calls[0][0];
      const newComment = saved.metadata.detachedComments.find((cm: any) => cm.text === 'a fresh comment');
      expect(newComment.userId).toBe('real-user-123');
      expect(newComment.userName).toBe('Real Name');
      expect(saved.metadata.detachedComments.find((cm: any) => cm.id === 'c1')).toEqual({ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 });
    });

    it('title editing and styling persist through Save Changes', () => {
      const onSave = vi.fn();
      const c = mount(
        <DrawingEditor isOpen onClose={noop} onSave={onSave} initialMetadata={{}} currentUserId="u1" currentUserName="U1" />,
      );
      click(btn(c, 'Comment')!);
      const titleEl = document.body.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      const titleInput = document.body.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
      setInputValue(titleInput, 'Feedback');
      act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      const styleTrigger = document.body.querySelector('button[aria-label="Style comment title"]');
      expect(styleTrigger).toBeNull(); // title editing already committed -> back to display state

      const overlay = c.firstElementChild as HTMLElement;
      act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.metadata.commentTitle).toBe('Feedback');
    });

    it('Delete targets only the clicked comment (row isolation)', () => {
      const c = mount(
        <DrawingEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [
            { id: 'a', text: 'first comment', userId: 'u1', userName: 'U1', timestamp: 1 },
            { id: 'b', text: 'second comment', userId: 'u1', userName: 'U1', timestamp: 2 },
          ] }}
        />,
      );
      click(btn(c, 'Comment')!);
      const rows = Array.from(document.body.querySelectorAll('button[title="Delete"]'));
      // The row wrapper's own class contains the literal substring
      // "group/row" (Tailwind group-naming); the action rail immediately
      // inside it is "invisible group-hover/row:visible", which does NOT
      // contain that exact substring, so this selector reaches the outer
      // row (with the comment text) rather than stopping one level too
      // shallow at the action rail itself.
      const target = rows.find((b) => b.closest('[class*="group/row"]')?.textContent?.includes('first comment'));
      expect(target).toBeTruthy();
      click(target!);
      expect(document.body.textContent).not.toContain('first comment');
      expect(document.body.textContent).toContain('second comment');
    });
  });

  describe('READ mode', () => {
    it('the Comment button/badge are reachable and comments are visible even though the modal itself is readOnly', () => {
      const c = mount(
        <DrawingEditor
          isOpen
          readOnly
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'a reader can see this', userId: 'u1', userName: 'U1', timestamp: 1 }] }}
          accessMode="read"
        />,
      );
      const commentButton = btn(c, 'Comment');
      expect(commentButton).not.toBeNull();
      click(commentButton!);
      expect(document.body.textContent).toContain('a reader can see this');
    });

    it('composer, Send, and title editing are absent', () => {
      const c = mount(
        <DrawingEditor
          isOpen
          readOnly
          onClose={noop}
          onSave={noop}
          initialMetadata={{ detachedComments: [{ id: 'c1', text: 'existing', userId: 'u1', userName: 'U1', timestamp: 1 }] }}
          accessMode="read"
        />,
      );
      click(btn(c, 'Comment')!);
      expect(document.body.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(document.body.querySelector('button[aria-label="Send"]')).toBeNull();
      expect(document.body.querySelector('button[title="Delete"]')).toBeNull();
      const titleEl = document.body.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      expect(document.body.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    });

    it('Text style/Color/Reaction/Caption toolbar buttons stay hidden (unaffected by this patch)', () => {
      const c = mount(
        <DrawingEditor isOpen readOnly onClose={noop} onSave={noop} initialMetadata={{}} accessMode="read" />,
      );
      expect(btn(c, 'Text style')).toBeNull();
      expect(btn(c, 'Color')).toBeNull();
      expect(btn(c, 'Reaction')).toBeNull();
      expect(btn(c, 'Caption (shown below the drawing)')).toBeNull();
      expect(btn(c, 'Comment')).not.toBeNull();
    });
  });

  describe('historical identity', () => {
    it('a pre-existing placeholder-identity comment is left untouched by opening/closing without editing', () => {
      const onSave = vi.fn();
      const historical = { id: 'legacy', text: 'legacy comment', userId: 'anon', userName: 'You', timestamp: 5 };
      const c = mount(
        <DrawingEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialMetadata={{ detachedComments: [historical] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comment')!);
      const overlay = c.firstElementChild as HTMLElement;
      act(() => { overlay.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.metadata.detachedComments).toEqual([historical]);
    });
  });
});
