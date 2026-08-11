// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import FreeformCommentRow from './FreeformCommentRow';
import type { Comment } from '@/lib/domain/canvas/comments';

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
  return { container, root };
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
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const baseComment: Comment = {
  id: 'c1',
  text: 'Hello <a href="https://example.com">link</a>',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};

function renderRow(overrides: Partial<React.ComponentProps<typeof FreeformCommentRow>> = {}) {
  const props: React.ComponentProps<typeof FreeformCommentRow> = {
    comment: baseComment,
    isActive: false,
    isEditing: false,
    editingText: '',
    onEditingTextChange: vi.fn(),
    onSelect: vi.fn(),
    onStartEdit: vi.fn(),
    onCommitEdit: vi.fn(),
    onCancelEdit: vi.fn(),
    suppressBlurCommit: false,
    ...overrides,
  };
  return { props, ...mount(<FreeformCommentRow {...props} />) };
}

describe('FreeformCommentRow -- Site A row rendering', () => {
  it('renders read-only sanitized HTML with a clickable link when not editing', () => {
    const { container } = renderRow();
    const anchor = container.querySelector('a[href="https://example.com"]');
    expect(anchor).not.toBeNull();
  });

  it('opens links safely in a new tab instead of navigating same-tab', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = renderRow();
    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    click(anchor);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('renders a plain <textarea> (not TipTap) when editing, matching Site A\'s frozen editing engine', () => {
    const { container } = renderRow({ isEditing: true, editingText: 'hello' });
    const textarea = container.querySelector('textarea');
    expect(textarea).not.toBeNull();
    expect(textarea?.value).toBe('hello');
    expect(container.querySelector('.ProseMirror')).toBeNull();
  });

  it('calls onSelect when the row is clicked', () => {
    const onSelect = vi.fn();
    const { container } = renderRow({ onSelect });
    click(container.firstElementChild!);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('calls onStartEdit on double-click of the read-only text, and stops propagation', () => {
    const onStartEdit = vi.fn();
    const onSelect = vi.fn();
    const { container } = renderRow({ onStartEdit, onSelect });
    const anchor = container.querySelector('a[href="https://example.com"]')!;
    const textNode = anchor.parentElement as HTMLElement;
    act(() => {
      textNode.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(onStartEdit).toHaveBeenCalledTimes(1);
    // onSelect (row click) must NOT also fire -- dblclick stops propagation.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('applies textColor/backgroundColor/isStrikethrough styling to the read-only text', () => {
    const { container } = renderRow({
      comment: { ...baseComment, text: 'plain', textColor: '#ff0000', backgroundColor: '#eeeeee', isStrikethrough: true },
    });
    const divs = container.querySelectorAll('div');
    const textNode = divs[divs.length - 1] as HTMLElement;
    expect(textNode.className).toContain('line-through');
    expect(textNode.style.color).toBe('rgb(255, 0, 0)');
    expect(textNode.style.backgroundColor).toBe('rgb(238, 238, 238)');
  });

  it('commits on Enter (without shift) and cancels on Escape while editing', () => {
    const onCommitEdit = vi.fn();
    const onCancelEdit = vi.fn();
    const { container } = renderRow({ isEditing: true, editingText: 'x', onCommitEdit, onCancelEdit });
    const textarea = container.querySelector('textarea')!;
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onCommitEdit).toHaveBeenCalledTimes(1);

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });

  it('commits on blur, unless suppressBlurCommit is set (color-popup-open guard)', () => {
    const onCommitEdit = vi.fn();
    const { container } = renderRow({ isEditing: true, editingText: 'x', onCommitEdit, suppressBlurCommit: true });
    const textarea = container.querySelector('textarea')!;
    act(() => {
      textarea.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    expect(onCommitEdit).not.toHaveBeenCalled();
  });
});
