// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentPopup from './CommentPopup';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom implements no layout: Range lacks getClientRects/getBoundingClientRect,
// which ProseMirror's structural commands need (same stub NoteEditor's
// characterization suite uses).
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
  return { container, root };
}
function rerender(root: Root, ui: React.ReactElement) {
  act(() => {
    root.render(ui);
  });
}
afterEach(async () => {
  // CommentPopup schedules a real (non-fake-timer) 50ms setTimeout to focus
  // the edit editor whenever editingCommentId changes. Unmounting sooner
  // than that leaves it to fire against an already-destroyed editor view,
  // producing an unhandled TipTap error after the test finishes. Draining
  // it first, while the component is still mounted, avoids that.
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
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function findByText(root: ParentNode, tag: string, text: string) {
  return Array.from(root.querySelectorAll(tag)).find((el) => el.textContent?.trim() === text) as HTMLElement | undefined;
}
// React tracks the input's value on the DOM node, so setting `.value`
// directly is ignored -- go through the prototype setter it doesn't shadow.
function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
// Real DOM selection over a known substring -- same technique
// NoteEditor.characterization.test.tsx uses, so a subsequent
// editEditor.state.selection read (openLinkPopover) sees a genuine
// non-empty range instead of a collapsed cursor.
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
// The color/highlight-preview wrapper is the div with className="relative"
// wrapping EditorContent -- distinct from EditorContent's own generated
// wrapper div, which sits one level further down from .ProseMirror.
function editWrapperOf(container: HTMLElement) {
  return container.querySelector('.ProseMirror')!.closest('.relative') as HTMLElement;
}

const baseComment = {
  id: 'c1',
  text: 'Hello world',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};

describe('CommentPopup per-comment color and link', () => {
  it('shows a Color button and Link button once a comment enters edit mode', () => {
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        onCommentColor={vi.fn()}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    expect(btn(container, 'Color')).toBeNull();
    expect(btn(container, 'Link')).toBeNull();

    click(btn(container, 'Edit')!);

    expect(btn(container, 'Color')).not.toBeNull();
    expect(btn(container, 'Link')).not.toBeNull();
  });

  it('does not show the Color button when onCommentColor is not provided', () => {
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );
    click(btn(container, 'Edit')!);
    expect(btn(container, 'Color')).toBeNull();
    expect(btn(container, 'Link')).not.toBeNull();
  });

  it('persists a picked text color through onCommentColor without leaving edit mode, and reflects it immediately once the parent updates the comment', () => {
    const onCommentColor = vi.fn();
    const { container, root } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        onCommentColor={onCommentColor}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);

    // The color popup is portaled to document.body, not inside `container`.
    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    expect(swatch).not.toBeNull();
    click(swatch);

    expect(onCommentColor).toHaveBeenCalledWith('c1', '#4c6ef5', undefined);
    // Picking a color must not kick the row out of edit mode.
    expect(container.querySelector('.ProseMirror')).not.toBeNull();

    // Simulate the parent persisting the color and re-rendering with it --
    // the edit-mode wrapper should reflect it immediately, still mid-edit.
    rerender(
      root,
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        onCommentColor={onCommentColor}
        comments={[{ ...baseComment, textColor: '#4c6ef5' }]}
        currentUserId="user1"
      />
    );
    expect(editWrapperOf(container).style.color).toBe('rgb(76, 110, 245)');
  });

  it('reflects a picked highlight color on the edit-mode wrapper background immediately', () => {
    const onCommentColor = vi.fn();
    const { container, root } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        onCommentColor={onCommentColor}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);
    // Switch to the "H" (highlight) tab.
    const highlightTab = Array.from(document.body.querySelectorAll('button')).find((b) => b.title === 'Highlight Color');
    click(highlightTab!);

    const swatch = document.body.querySelector('button[title="#fa5252"]') as HTMLButtonElement;
    expect(swatch).not.toBeNull();
    click(swatch);

    expect(onCommentColor).toHaveBeenCalledWith('c1', undefined, '#fa5252');

    rerender(
      root,
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        onCommentColor={onCommentColor}
        comments={[{ ...baseComment, backgroundColor: '#fa5252' }]}
        currentUserId="user1"
      />
    );
    expect(editWrapperOf(container).style.backgroundColor).toBe('rgb(250, 82, 82)');
  });

  it('persists a link on Add immediately, without waiting for a later blur, and stays in edit mode', () => {
    const onEditComment = vi.fn();
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={onEditComment}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    click(btn(container, 'Edit')!);
    selectText(container, 'Hello world');
    click(btn(container, 'Link')!);

    const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
    expect(urlInput).not.toBeNull();
    typeInto(urlInput, 'google.com');

    const addButton = findByText(document.body, 'button', 'Add');
    expect(addButton).toBeTruthy();
    click(addButton!);

    expect(onEditComment).toHaveBeenCalledTimes(1);
    expect(onEditComment).toHaveBeenCalledWith('c1', expect.any(String));
    // google.com must be normalized to https://google.com, and the anchor
    // must wrap the text that was actually selected.
    const savedHtml = onEditComment.mock.calls[0][1] as string;
    expect(savedHtml).toContain('href="https://google.com"');
    expect(savedHtml).toMatch(/<a[^>]*>Hello world<\/a>/);

    // Still editing -- Add must not have exited edit mode.
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('sets a link on the comment text even when no text was selected first (inserts the URL as linked text)', () => {
    const onEditComment = vi.fn();
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={onEditComment}
        comments={[{ ...baseComment, text: 'kkkkkk' }]}
        currentUserId="user1"
      />
    );

    // Enter edit mode and open Link WITHOUT selecting any text -- the exact
    // path that previously produced no anchor at all.
    click(btn(container, 'Edit')!);
    click(btn(container, 'Link')!);

    const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
    typeInto(urlInput, 'google.com');
    click(findByText(document.body, 'button', 'Add')!);

    expect(onEditComment).toHaveBeenCalledTimes(1);
    const savedHtml = onEditComment.mock.calls[0][1] as string;
    expect(savedHtml).toContain('href="https://google.com"');
    expect(savedHtml).toContain('kkkkkk');
  });

  it('leaves the URL field focusable and typable (the popover shell must not swallow mousedown on its own inputs)', () => {
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={vi.fn()}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    click(btn(container, 'Edit')!);
    click(btn(container, 'Link')!);

    const urlInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
    const shell = urlInput.closest('div[style]') as HTMLElement;
    // Never rendered with visibility:hidden -- that makes autoFocus a no-op.
    expect(shell.style.visibility).not.toBe('hidden');

    // A mousedown on the input must NOT be defaultPrevented, or the browser
    // will refuse to move focus into it and the field can never be typed in.
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => { urlInput.dispatchEvent(mouseDown); });
    expect(mouseDown.defaultPrevented).toBe(false);

    // And a mousedown on the shell's own chrome still IS prevented, so
    // clicking the popover background doesn't blur the editor behind it.
    const shellMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    act(() => { shell.dispatchEvent(shellMouseDown); });
    expect(shellMouseDown.defaultPrevented).toBe(true);

    typeInto(urlInput, 'example.com');
    expect(urlInput.value).toBe('example.com');
  });

  it('does not commit/exit edit mode when the color popup blurs the editor wrapper (guard against the popover-open blur race)', () => {
    const onEditComment = vi.fn();
    const onEdit = vi.fn();
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={onEditComment}
        onEdit={onEdit}
        onCommentColor={vi.fn()}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);

    const wrapper = editWrapperOf(container);
    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    // React's onBlur is implemented via the bubbling 'focusout' event, not
    // the native non-bubbling 'blur'.
    act(() => {
      wrapper.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: swatch }));
    });

    expect(onEditComment).not.toHaveBeenCalled();
    expect(onEdit).not.toHaveBeenCalled();
    // Still in edit mode.
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('closing the color popover without picking a color refocuses the editor so a later real click-away still commits', () => {
    const onEditComment = vi.fn();
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={onEditComment}
        onCommentColor={vi.fn()}
        comments={[baseComment]}
        currentUserId="user1"
      />
    );

    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);
    // Toggle the Color button off again (closes without picking).
    click(btn(container, 'Color')!);

    const wrapper = editWrapperOf(container);
    act(() => {
      wrapper.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    });

    expect(onEditComment).toHaveBeenCalledTimes(1);
    expect(onEditComment).toHaveBeenCalledWith('c1', expect.stringContaining('Hello world'));
  });
});
