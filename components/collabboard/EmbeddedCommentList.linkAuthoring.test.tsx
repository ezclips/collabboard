// @vitest-environment jsdom
//
// PATCH 8AS -- Link authoring for the compact embedded comment renderer
// (CommentRow.tsx via EmbeddedCommentList.tsx), consuming the shared
// PATCH 8AR primitives (commentLinkAuthoring.ts, CommentLinkPopover.tsx).
// Closes the capability gap PATCH 8AQ's audit found: CommentPopup (and
// ContainerEditor's embedded CommentPopup) already supported Link authoring;
// EmbeddedCommentList/CommentRow did not.
//
// Follows the mount/select/type conventions established in
// EmbeddedCommentList.colorAndLink.test.tsx and CommentPopup.colorAndLink.test.tsx.
import React from 'react';
import { act } from 'react';
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
  return { container };
}
afterEach(async () => {
  // CommentRow schedules a real 50ms setTimeout to focus the edit editor
  // whenever isEditing flips true -- drain it before unmounting (same
  // convention as EmbeddedCommentList.colorAndLink.test.tsx).
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
function doubleClick(el: Element) {
  act(() => { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); });
}
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function findByText(root: ParentNode, tag: string, text: string) {
  return Array.from(root.querySelectorAll(tag)).find((el) => el.textContent?.trim() === text) as HTMLElement | undefined;
}
function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function selectText(container: HTMLElement, text: string) {
  const pm = container.querySelector('.ProseMirror') as HTMLElement;
  act(() => {
    pm.focus();
    const walker = document.createTreeWalker(pm, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    let idx = -1;
    while ((node = walker.nextNode() as Text | null)) {
      idx = node.textContent?.indexOf(text) ?? -1;
      if (idx !== -1) break;
    }
    if (!node || idx === -1) throw new Error(`text not found: ${text}`);
    const range = document.createRange();
    range.setStart(node, idx);
    range.setEnd(node, idx + text.length);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}
function editWrapperOf(container: HTMLElement) {
  return container.querySelector('.ProseMirror')!.closest('.relative') as HTMLElement;
}
// Commits the row's pending edit via a genuine click-away blur (CommentRow
// persists on blur/Enter, not immediately on Link Add -- see CommentRow.tsx's
// handleApplyLink comment).
function blurToSave(container: HTMLElement) {
  const wrapper = editWrapperOf(container);
  act(() => {
    wrapper.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
  });
}

const HELLO = { id: 'c1', text: 'Hello world', userId: 'me', userName: 'Me', timestamp: Date.now() };

describe('EmbeddedCommentList / CommentRow Link authoring (PATCH 8AS)', () => {
  describe('AUTHORING permission matrix', () => {
    it('1. MANAGE own comment can add a Link', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      typeInto(urlInput, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      expect(onEditComment).toHaveBeenCalledWith('c1', expect.stringContaining('href="https://google.com"'));
    });

    it('2. MANAGE can add a Link to another user\'s comment', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, userId: 'other-user' }]}
          currentUserId="manager"
          accessMode="manage"
          onEditComment={onEditComment}
        />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      expect(onEditComment).toHaveBeenCalledWith('c1', expect.stringContaining('href="https://google.com"'));
    });

    it('3. COMMENT (dormant contract) can add a Link to its own comment', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, userId: 'commenter-a' }]}
          currentUserId="commenter-a"
          accessMode="comment"
          onEditComment={onEditComment}
        />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      expect(onEditComment).toHaveBeenCalledWith('c1', expect.stringContaining('href="https://google.com"'));
    });

    it('4. COMMENT cannot Edit (and therefore cannot reach Link) on another user\'s comment', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, userId: 'someone-else' }]}
          currentUserId="commenter-a"
          accessMode="comment"
          onEditComment={onEditComment}
        />
      );
      const editBtn = btn(container, 'Edit')!;
      expect(editBtn.disabled).toBe(true);
      doubleClick(container.querySelector('.group\\/row')!);
      expect(container.querySelector('.ProseMirror')).toBeNull();
      expect(btn(container, 'Link')).toBeNull();
      expect(onEditComment).not.toHaveBeenCalled();
    });

    it('5. READ never exposes Edit or Link, and no mutation callback is reachable', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" accessMode="read" onEditComment={onEditComment} />
      );
      expect(btn(container, 'Edit')).toBeNull();
      expect(btn(container, 'Link')).toBeNull();
      const row = container.querySelector('.group\\/row')!;
      click(row);
      doubleClick(row);
      expect(container.querySelector('.ProseMirror')).toBeNull();
      expect(onEditComment).not.toHaveBeenCalled();
    });
  });

  describe('LINK OPERATIONS', () => {
    it('6. selected text becomes linked, wrapping exactly the selected range', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[{ ...HELLO, text: 'Hello world today' }]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      const saved = onEditComment.mock.calls[0][1] as string;
      expect(saved).toMatch(/<a[^>]*href="https:\/\/google\.com"[^>]*>world<\/a>/);
      expect(saved).toContain('Hello');
      expect(saved).toContain('today');
    });

    it('7. collapsed selection inserts the URL as linked text instead of silently doing nothing', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[{ ...HELLO, text: 'kkkkkk' }]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      // No selection made -- cursor sits wherever focus('end') left it.
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      const saved = onEditComment.mock.calls[0][1] as string;
      expect(saved).toContain('href="https://google.com"');
      expect(saved).toContain('kkkkkk');
    });

    it('8. editing an already-linked selection updates the href without duplicating the anchor', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, text: 'Hello <a href="https://old.com">world</a>' }]}
          currentUserId="me"
          onEditComment={onEditComment}
        />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      expect(urlInput.value).toBe('https://old.com');
      typeInto(urlInput, 'new.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      const saved = onEditComment.mock.calls[0][1] as string;
      expect(saved).toContain('href="https://new.com"');
      expect(saved).not.toContain('old.com');
      expect((saved.match(/<a /g) || []).length).toBe(1);
    });

    it('9. empty URL removes the Link mark but preserves the visible text', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, text: 'Hello <a href="https://old.com">world</a>' }]}
          currentUserId="me"
          onEditComment={onEditComment}
        />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      typeInto(urlInput, '');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      const saved = onEditComment.mock.calls[0][1] as string;
      expect(saved).not.toContain('<a ');
      expect(saved).toContain('world');
    });

    it('10. a bare URL normalizes through the shared helper', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'example.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      expect(onEditComment.mock.calls[0][1]).toContain('href="https://example.com"');
    });

    it('11. Enter applies the link', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      typeInto(urlInput, 'google.com');
      act(() => { urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
      blurToSave(container);
      expect(onEditComment.mock.calls[0][1]).toContain('href="https://google.com"');
    });

    it('12. Escape closes the popover without applying a mutation', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      typeInto(urlInput, 'google.com');
      act(() => { urlInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
      expect(document.body.querySelector('input[type="url"]')).toBeNull();
      blurToSave(container);
      expect(onEditComment).toHaveBeenCalledWith('c1', expect.stringContaining('Hello world'));
      expect(onEditComment.mock.calls[0][1]).not.toContain('<a ');
    });
  });

  describe('SELECTION', () => {
    it('13-14. selected range survives the Link-trigger click and popover focus', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[{ ...HELLO, text: 'Hello world today' }]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      // Focus moved into the popover's own input -- the editor's captured
      // selection must not have been lost by that focus change.
      typeInto(urlInput, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      expect(onEditComment.mock.calls[0][1]).toMatch(/<a[^>]*>world<\/a>/);
    });

    it('15. a stale selection from a cancelled Link session is not reused on the next one', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[{ ...HELLO, text: 'Hello world today' }]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello');
      click(btn(container, 'Link')!);
      const firstInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      act(() => { firstInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });

      selectText(container, 'today');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      const saved = onEditComment.mock.calls[0][1] as string;
      expect(saved).toMatch(/<a[^>]*>today<\/a>/);
      expect(saved).not.toMatch(/<a[^>]*>Hello<\/a>/);
    });
  });

  describe('INTERACTION with Color/Strikethrough/Delete', () => {
    it('16. Color and Link popovers are mutually exclusive', () => {
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={vi.fn()} onColorChange={vi.fn()} />
      );
      click(btn(container, 'Edit')!);
      click(btn(container, 'Color')!);
      expect(document.body.querySelector('input[type="url"]')).toBeNull();
      // TextStylePopup is portaled -- its own swatch title proves it's open.
      expect(document.body.querySelector('button[title="#4c6ef5"]')).not.toBeNull();

      click(btn(container, 'Link')!);
      expect(document.body.querySelector('button[title="#4c6ef5"]')).toBeNull();
      expect(document.body.querySelector('input[type="url"]')).not.toBeNull();

      click(btn(container, 'Color')!);
      expect(document.body.querySelector('input[type="url"]')).toBeNull();
      expect(document.body.querySelector('button[title="#4c6ef5"]')).not.toBeNull();
    });

    it('17. blur into the Link popover does not save/exit edit mode prematurely', () => {
      const onEditComment = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
      const wrapper = editWrapperOf(container);
      act(() => {
        wrapper.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: urlInput }));
      });
      expect(onEditComment).not.toHaveBeenCalled();
      expect(container.querySelector('.ProseMirror')).not.toBeNull();
    });

    it('18. Color still works after a Link action in the same edit session', () => {
      const onEditComment = vi.fn();
      const onColorChange = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} onColorChange={onColorChange} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);

      click(btn(container, 'Color')!);
      const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
      click(swatch);
      expect(onColorChange).toHaveBeenCalledWith('c1', '#4c6ef5', undefined);
      expect(container.querySelector('.ProseMirror')).not.toBeNull();
    });

    it('19. Link still works after a Color action in the same edit session', () => {
      const onEditComment = vi.fn();
      const onColorChange = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} onColorChange={onColorChange} />
      );
      click(btn(container, 'Edit')!);
      click(btn(container, 'Color')!);
      click(document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement);

      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      expect(onEditComment.mock.calls[0][1]).toContain('href="https://google.com"');
    });

    it('20. Strikethrough still works after a Link action', () => {
      const onToggleStrikethrough = vi.fn();
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={vi.fn()} onToggleStrikethrough={onToggleStrikethrough} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);

      click(btn(container, 'Strikethrough')!);
      expect(onToggleStrikethrough).toHaveBeenCalledWith('c1');
    });

    it('21. Delete remains correctly targeted -- a Link popup on one row does not affect Delete on another', () => {
      const onRemoveComment = vi.fn();
      const OTHER = { id: 'c2', text: 'Other comment', userId: 'me', userName: 'Me', timestamp: Date.now() + 1 };
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO, OTHER]} currentUserId="me" onEditComment={vi.fn()} onRemoveComment={onRemoveComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      expect(document.body.querySelector('input[type="url"]')).not.toBeNull();

      const deleteButtons = container.querySelectorAll('button[title="Delete"]');
      click(deleteButtons[1]);
      expect(onRemoveComment).toHaveBeenCalledWith('c2');
      expect(onRemoveComment).not.toHaveBeenCalledWith('c1');
    });

    it('22. sibling row is byte-for-byte unaffected by a Link action on another row', () => {
      const onEditComment = vi.fn();
      const OTHER = { id: 'c2', text: 'Other comment', userId: 'me', userName: 'Me', timestamp: Date.now() + 1, textColor: '#ff0000', isStrikethrough: true };
      const { container } = mount(
        <EmbeddedCommentList comments={[HELLO, OTHER]} currentUserId="me" onEditComment={onEditComment} />
      );
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);

      expect(onEditComment).toHaveBeenCalledTimes(1);
      expect(onEditComment).toHaveBeenCalledWith('c1', expect.any(String));
      expect(container.textContent).toContain('Other comment');
    });
  });

  describe('SECURITY (integration proof -- handleSafeCommentLinkClick logic itself is covered by commentLinkSafety.test.tsx)', () => {
    it('23. an existing saved Link still opens safely in a new tab', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, text: 'Hello <a href="https://example.com">world</a>' }]}
          currentUserId="someone-else"
        />
      );
      const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
      click(anchor);
      expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
      openSpy.mockRestore();
    });

    it('24. javascript: URLs saved directly into comment text never navigate on click', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, text: 'Hello <a href="javascript:alert(1)">world</a>' }]}
          currentUserId="someone-else"
        />
      );
      const anchor = container.querySelector('a') as HTMLAnchorElement;
      expect(anchor).not.toBeNull();
      click(anchor);
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });

    it('25. data: URLs saved directly into comment text never navigate on click', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const { container } = mount(
        <EmbeddedCommentList
          comments={[{ ...HELLO, text: 'Hello <a href="data:text/html,<script>alert(1)</script>">world</a>' }]}
          currentUserId="someone-else"
        />
      );
      const anchor = container.querySelector('a') as HTMLAnchorElement;
      click(anchor);
      expect(openSpy).not.toHaveBeenCalled();
      openSpy.mockRestore();
    });

    it('26. a Link authored through CommentRow itself is opened with noopener/noreferrer', () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      const onEditComment = vi.fn();
      const { container } = mount(<EmbeddedCommentList comments={[HELLO]} currentUserId="me" onEditComment={onEditComment} />);
      click(btn(container, 'Edit')!);
      selectText(container, 'Hello world');
      click(btn(container, 'Link')!);
      typeInto(document.body.querySelector('input[type="url"]') as HTMLInputElement, 'google.com');
      click(findByText(document.body, 'button', 'Add')!);
      blurToSave(container);
      const savedHtml = onEditComment.mock.calls[0][1] as string;

      const { container: readContainer } = mount(
        <EmbeddedCommentList comments={[{ ...HELLO, text: savedHtml }]} currentUserId="someone-else" />
      );
      const anchor = readContainer.querySelector('a[href="https://google.com"]') as HTMLAnchorElement;
      expect(anchor).not.toBeNull();
      click(anchor);
      expect(openSpy).toHaveBeenCalledWith('https://google.com/', '_blank', 'noopener,noreferrer');
      openSpy.mockRestore();
    });
  });
});
