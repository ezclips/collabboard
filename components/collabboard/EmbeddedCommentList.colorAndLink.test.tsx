// @vitest-environment jsdom
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
  return { container, root };
}
afterEach(async () => {
  // Same real (non-fake-timer) 50ms editor-focus setTimeout as CommentRow's
  // TipTap edit effect -- drain it before unmounting.
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

const baseComment = {
  id: 'c1',
  text: 'Hello <a href="https://example.com">link</a>',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};

describe('EmbeddedCommentList / CommentRow per-comment color', () => {
  it('shows the Color button only when onColorChange is provided, and only while editing', () => {
    const { container } = mount(
      <EmbeddedCommentList comments={[baseComment]} currentUserId="user1" onEditComment={vi.fn()} />
    );
    expect(btn(container, 'Edit')).not.toBeNull();
    expect(btn(container, 'Color')).toBeNull();

    click(btn(container, 'Edit')!);
    // No onColorChange passed -- still no Color button even mid-edit.
    expect(btn(container, 'Color')).toBeNull();
  });

  it('persists a picked color via onColorChange with the comment id, without clearing it (unlike the old stub)', () => {
    const onColorChange = vi.fn();
    const { container } = mount(
      <EmbeddedCommentList comments={[baseComment]} currentUserId="user1" onEditComment={vi.fn()} onColorChange={onColorChange} />
    );

    click(btn(container, 'Edit')!);
    expect(btn(container, 'Color')).not.toBeNull();
    click(btn(container, 'Color')!);

    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    expect(swatch).not.toBeNull();
    click(swatch);

    expect(onColorChange).toHaveBeenCalledWith('c1', '#4c6ef5', undefined);
    expect(onColorChange).not.toHaveBeenCalledWith('c1', undefined, undefined);
  });

  it('does not commit/exit edit mode when the color popup blurs the row (guard against the popover-open blur race)', () => {
    const onEditComment = vi.fn();
    const { container } = mount(
      <EmbeddedCommentList comments={[baseComment]} currentUserId="user1" onEditComment={onEditComment} onColorChange={vi.fn()} />
    );

    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);

    const wrapper = container.querySelector('.ProseMirror')!.parentElement as HTMLElement;
    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    act(() => {
      wrapper.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: swatch }));
    });

    expect(onEditComment).not.toHaveBeenCalled();
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('opens saved links safely in a new tab instead of navigating same-tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = mount(
      <EmbeddedCommentList comments={[baseComment]} currentUserId="user2" />
    );

    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    click(anchor);

    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });
});
