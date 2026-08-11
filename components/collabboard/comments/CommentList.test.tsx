// @vitest-environment jsdom
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentList, { SITE_A_PROFILE } from './CommentList';
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
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
}
function titlesInOrder(root: ParentNode): string[] {
  return Array.from(root.querySelectorAll('button[title]')).map((b) => b.getAttribute('title')!);
}

function makeComments(): Comment[] {
  return [
    { id: 'a', text: 'first', userId: 'u1', userName: 'Alice', timestamp: 1 },
    { id: 'b', text: 'second', userId: 'u2', userName: 'Bob', timestamp: 2 },
  ];
}

describe('CommentList -- Site A action rail (order, count, icon identity)', () => {
  it('renders exactly Color|Edit, Strikethrough, Delete titles in that order once a comment is active', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    click(container.querySelector('.cursor-pointer')!);
    expect(titlesInOrder(container)).toEqual(['Edit', 'Strikethrough', 'Delete']);
  });

  it('shows Color (not Edit) once the active comment enters edit mode', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    expect(titlesInOrder(container)).toEqual(['Color', 'Strikethrough', 'Delete']);
  });

  it('renders the PenTool icon for Edit under the default Site A profile (not Edit2)', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    click(container.querySelector('.cursor-pointer')!);
    const editBtn = btn(container, 'Edit')!;
    expect(editBtn.innerHTML).toContain('lucide-pen-tool');
    expect(editBtn.innerHTML).not.toContain('lucide-edit-2');
  });

  it('all three action buttons are disabled until a comment becomes active (no silent no-op clicks)', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    expect(btn(container, 'Edit')!.disabled).toBe(true);
    expect(btn(container, 'Strikethrough')!.disabled).toBe(true);
    expect(btn(container, 'Delete')!.disabled).toBe(true);
  });
});

describe('CommentList -- Site A capability boundary', () => {
  it('does not expose a Link-authoring control, matching Site A\'s frozen "no link authoring" contract', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    expect(btn(container, 'Link')).toBeNull();
    expect(container.innerHTML).not.toContain('title="Link"');
  });
});

describe('CommentList -- operations target the correct comment', () => {
  it('Strikethrough toggles only the active comment', () => {
    const onCommentsChange = vi.fn();
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={onCommentsChange} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[1]); // select "b"
    click(btn(container, 'Strikethrough')!);
    const result = onCommentsChange.mock.calls[0][0] as Comment[];
    expect(result.find((c) => c.id === 'b')?.isStrikethrough).toBe(true);
    expect(result.find((c) => c.id === 'a')?.isStrikethrough).toBeUndefined();
  });

  it('Delete removes only the active comment (not simply the first comment) and re-activates the new last comment', () => {
    const onCommentsChange = vi.fn();
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={onCommentsChange} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[1]); // select "b" -- deliberately NOT the first row, so a
    // Delete that's wired to comments[0] instead of the active comment
    // would delete "a" and this assertion would fail.
    click(btn(container, 'Delete')!);
    const result = onCommentsChange.mock.calls[0][0] as Comment[];
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('Edit commits changed text only for the edited comment, preserving the other', () => {
    const onCommentsChange = vi.fn();
    const { container, root } = mount(<CommentList comments={makeComments()} onCommentsChange={onCommentsChange} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[0]);
    click(btn(container, 'Edit')!);
    const textarea = container.querySelector('textarea')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'edited first');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    const result = onCommentsChange.mock.calls[0][0] as Comment[];
    expect(result.find((c) => c.id === 'a')?.text).toBe('edited first');
    expect(result.find((c) => c.id === 'b')?.text).toBe('second');
  });

  it('color-write policy: default Site A profile mirrors textColor into legacy color; a profile with mirrorLegacyColor:false does not', () => {
    const onCommentsChangeMirrored = vi.fn();
    const { container: mirroredContainer } = mount(
      <CommentList comments={makeComments()} onCommentsChange={onCommentsChangeMirrored} profile={SITE_A_PROFILE} />
    );
    click(mirroredContainer.querySelector('.cursor-pointer')!);
    click(btn(mirroredContainer, 'Edit')!);
    click(btn(mirroredContainer, 'Color')!);
    const swatch = document.body.querySelector('button[title="#4c6ef5"]') as HTMLButtonElement;
    click(swatch);
    const mirroredResult = onCommentsChangeMirrored.mock.calls[0][0] as Comment[];
    expect(mirroredResult.find((c) => c.id === 'a')?.textColor).toBe('#4c6ef5');
    expect(mirroredResult.find((c) => c.id === 'a')?.color).toBe('#4c6ef5');

    const onCommentsChangeUnmirrored = vi.fn();
    const { container: plainContainer } = mount(
      <CommentList
        comments={makeComments()}
        onCommentsChange={onCommentsChangeUnmirrored}
        profile={{ editIcon: 'PenTool', mirrorLegacyColor: false }}
      />
    );
    click(plainContainer.querySelector('.cursor-pointer')!);
    click(btn(plainContainer, 'Edit')!);
    click(btn(plainContainer, 'Color')!);
    const swatch2 = document.body.querySelectorAll('button[title="#4c6ef5"]')[1] as HTMLButtonElement;
    click(swatch2);
    const plainResult = onCommentsChangeUnmirrored.mock.calls[0][0] as Comment[];
    expect(plainResult.find((c) => c.id === 'a')?.textColor).toBe('#4c6ef5');
    expect(plainResult.find((c) => c.id === 'a')?.color).toBeUndefined();
  });
});

describe('CommentList -- list-level concerns only (no shell/chrome)', () => {
  it('renders comments in input order', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    const names = Array.from(container.querySelectorAll('.text-xs.font-medium.text-gray-700.truncate')).map(
      (el) => el.textContent
    );
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('shows the empty-state message and no action buttons when there are no comments', () => {
    const { container } = mount(<CommentList comments={[]} onCommentsChange={vi.fn()} />);
    expect(container.textContent).toContain('No comments yet');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('one row entering edit mode does not put another row into edit mode', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[0]);
    click(btn(container, 'Edit')!);
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('does not render modal/panel chrome (no close button, no header, no floating positioning wrapper)', () => {
    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    expect(btn(container, 'Close')).toBeNull();
    expect(container.textContent).not.toContain('Comments');
    expect(container.querySelector('[class*="absolute left-full"]')).toBeNull();
  });
});

describe('CommentList -- Site A old/new contract parity', () => {
  const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
  const src = fs.readFileSync(FREEFORM_PATH, 'utf8');

  it('the frozen Site A source still uses PenTool for Edit and mirrors color -- matches SITE_A_PROFILE', () => {
    const anchor = 'Image Comments Popup - Right side';
    const start = src.indexOf(anchor);
    const editBlockStart = src.indexOf('title="Edit"', start);
    const editBlockEnd = src.indexOf('</button>', editBlockStart);
    const editBlock = src.slice(editBlockStart, editBlockEnd);
    expect(editBlock).toContain('<PenTool');
    expect(SITE_A_PROFILE.editIcon).toBe('PenTool');

    const colorWriteWindow = src.slice(Math.max(0, start - 3000), start);
    expect(colorWriteWindow).toMatch(/textColor: color, color \}/);
    expect(SITE_A_PROFILE.mirrorLegacyColor).toBe(true);
  });

  it('the frozen Site A action order (Color|Edit, Strikethrough, Delete) matches the new CommentList order', () => {
    const anchor = 'Image Comments Popup - Right side';
    const start = src.indexOf(anchor);
    const deleteIdx = src.indexOf('title="Delete"', start);
    const blockEnd = src.indexOf('</button>', deleteIdx);
    const block = src.slice(start, blockEnd);
    const titles = Array.from(block.matchAll(/title="([^"]+)"/g))
      .map((m) => m[1])
      .filter((t) => ['Color', 'Edit', 'Strikethrough', 'Delete'].includes(t));
    expect(titles).toEqual(['Color', 'Edit', 'Strikethrough', 'Delete']);

    const { container } = mount(<CommentList comments={makeComments()} onCommentsChange={vi.fn()} />);
    click(container.querySelector('.cursor-pointer')!);
    expect(titlesInOrder(container)).toEqual(['Edit', 'Strikethrough', 'Delete']);
    click(btn(container, 'Edit')!);
    expect(titlesInOrder(container)).toEqual(['Color', 'Strikethrough', 'Delete']);
  });
});
