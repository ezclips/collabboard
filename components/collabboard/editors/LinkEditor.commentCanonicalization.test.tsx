// @vitest-environment jsdom
//
// PATCH 8U -- Link normal/detached comment canonicalization.
//
// LinkEditor.tsx's own left-toolbar Comments button/badge/panel is one of two
// live normal/detached comment entry points for Link posts (the other is
// FreeformPadletCards.tsx's on-canvas badge popup, covered structurally in
// canonicalCommentPermission.contract.test.tsx). Both were previously a fully
// local, hand-rolled comment implementation -- unlike Drawing/AI Component
// (wiring-only), Link required a genuine UI migration off local JSX, the same
// shape as Todo (PATCH 8S).
//
// Follows this repo's own established convention for editors with no heavy
// canvas dependency (react-dom/client + act, no @testing-library/react --
// see NoteEditor.characterization.test.tsx).
//
// LinkEditor's own CommentPopup call is NOT portaled -- it renders inline
// inside the mounted container (same as TodoEditor), so comment-panel
// content is queried from the mounted container `c`, not document.body.
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LinkEditor from './LinkEditor';

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
const POST_URL = 'https://example.com/product';

describe('LinkEditor -- canonical Comment UI wiring (PATCH 8U)', () => {
  describe('MANAGE mode (default)', () => {
    it('renders existing comments and a newly added comment uses real identity', () => {
      const onSave = vi.fn();
      const c = mount(
        <LinkEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialData={{ linkUrl: POST_URL, detachedComments: [{ id: 'c1', text: 'existing', userId: 'u-old', userName: 'Old User', timestamp: 1 }] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comments')!);
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
        <LinkEditor isOpen onClose={noop} onSave={onSave} initialData={{ linkUrl: POST_URL }} currentUserId="u1" currentUserName="U1" />,
      );
      click(btn(c, 'Comments')!);
      const titleEl = c.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      expect(titleEl).not.toBeNull();
      click(titleEl);
      const titleInput = c.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
      setInputValue(titleInput, 'Feedback');
      act(() => { titleInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.commentTitle).toBe('Feedback');
    });

    it('Delete targets only the clicked comment (row isolation)', () => {
      const c = mount(
        <LinkEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialData={{ linkUrl: POST_URL, detachedComments: [
            { id: 'a', text: 'first comment', userId: 'u1', userName: 'U1', timestamp: 1 },
            { id: 'b', text: 'second comment', userId: 'u1', userName: 'U1', timestamp: 2 },
          ] }}
        />,
      );
      click(btn(c, 'Comments')!);
      const rows = Array.from(c.querySelectorAll('button[title="Delete"]'));
      const target = rows.find((b) => b.closest('[class*="group/row"]')?.textContent?.includes('first comment'));
      expect(target).toBeTruthy();
      click(target!);
      expect(c.textContent).not.toContain('first comment');
      expect(c.textContent).toContain('second comment');
    });

    it('comment interaction does not navigate the Link post or change its URL/title/preview metadata', () => {
      const onSave = vi.fn();
      const c = mount(
        <LinkEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialData={{
            linkUrl: POST_URL,
            linkTitle: 'Original Title',
            linkImage: 'https://example.com/hero.png',
            linkFavicon: 'https://example.com/favicon.ico',
            linkDomain: 'example.com',
            detachedComments: [{ id: 'c1', text: 'existing', userId: 'u1', userName: 'U1', timestamp: 1 }],
          }}
        />,
      );
      click(btn(c, 'Comments')!);
      const composer = c.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
      setInputValue(composer, 'does not touch the post URL');
      act(() => { composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      expect(c.textContent).toContain('does not touch the post URL');

      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.linkUrl).toBe(POST_URL);
      expect(saved.linkTitle).toBe('Original Title');
      expect(saved.linkImage).toBe('https://example.com/hero.png');
      expect(saved.linkFavicon).toBe('https://example.com/favicon.ico');
      expect(saved.linkDomain).toBe('example.com');
    });

    it('clicking a comment-authored link opens the comment link safely and does NOT open the Link post\'s own destination', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const c = mount(
        <LinkEditor
          isOpen
          onClose={noop}
          onSave={noop}
          initialData={{
            linkUrl: POST_URL,
            detachedComments: [{ id: 'c1', text: '<p>See <a href="https://docs.example.com">documentation</a> here</p>', userId: 'u1', userName: 'U1', timestamp: 1 }],
          }}
        />,
      );
      click(btn(c, 'Comments')!);
      const commentLink = c.querySelector('a[href="https://docs.example.com/"], a[href="https://docs.example.com"]') as HTMLAnchorElement;
      expect(commentLink).not.toBeNull();
      click(commentLink);
      expect(openSpy).toHaveBeenCalledTimes(1);
      const [openedUrl] = openSpy.mock.calls[0];
      expect(openedUrl).toContain('docs.example.com');
      expect(openedUrl).not.toContain('example.com/product');
      openSpy.mockRestore();
    });
  });

  describe('READ mode', () => {
    it('existing comments (including saved links) are visible but composer/Send/Edit/Strikethrough/Delete/title-editing are all absent', () => {
      const c = mount(
        <LinkEditor
          isOpen
          accessMode="read"
          onClose={noop}
          onSave={noop}
          initialData={{ linkUrl: POST_URL, detachedComments: [{ id: 'c1', text: 'existing link comment', userId: 'u1', userName: 'A', timestamp: 1 }] }}
        />,
      );
      click(btn(c, 'Comments')!);
      expect(c.textContent).toContain('existing link comment');
      expect(c.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
      expect(c.querySelector('button[title="Delete"]')).toBeNull();
      expect(c.querySelector('button[title="Edit"]')).toBeNull();
      expect(c.querySelector('button[title="Strikethrough"]')).toBeNull();
      const titleEl = c.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
      click(titleEl);
      expect(c.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    });

    it('manage mode (explicit or default/omitted) keeps the composer available, unchanged', () => {
      const explicit = mount(<LinkEditor isOpen accessMode="manage" onClose={noop} onSave={noop} initialData={{ linkUrl: POST_URL }} />);
      click(btn(explicit, 'Comments')!);
      expect(explicit.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();

      const omitted = mount(<LinkEditor isOpen onClose={noop} onSave={noop} initialData={{ linkUrl: POST_URL }} />);
      click(btn(omitted, 'Comments')!);
      expect(omitted.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    });
  });

  describe('historical identity', () => {
    it('a pre-existing placeholder-identity comment is left untouched by opening/closing without editing', () => {
      const onSave = vi.fn();
      const historical = { id: 'legacy-1', text: 'an old comment', userId: 'current-user', userName: 'You', timestamp: 1 };
      const c = mount(
        <LinkEditor
          isOpen
          onClose={noop}
          onSave={onSave}
          initialData={{ linkUrl: POST_URL, detachedComments: [historical] }}
          currentUserId="real-user-123"
          currentUserName="Real Name"
        />,
      );
      click(btn(c, 'Comments')!);
      act(() => { c.firstElementChild!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      const saved = onSave.mock.calls[0][0];
      expect(saved.detachedComments).toEqual([{ ...historical, textColor: undefined, backgroundColor: undefined, isStrikethrough: undefined }]);
    });
  });
});
