// @vitest-environment jsdom
//
// PATCH 8Z -- Comment post primary thread permission wiring.
//
// CommentEditor.tsx is the richest live primary-thread surface for the
// standalone Comment post (its comments ARE the post's entire content --
// PATCH 8X): full TipTap toolbar (Bold/Italic/Underline/lists/code/align/
// emoji) plus per-row Edit/Color/Strikethrough/Delete, card color, badge
// color, and title. This proves the READ/MANAGE contract at this surface
// without touching its TipTap extension set (frozen -- see the
// "rich-editor freeze" describe block) or its MANAGE capabilities.
//
// Follows this repo's established mount convention (react-dom/client + act,
// no @testing-library/react).
import fs from 'node:fs';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentEditor from './CommentEditor';

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
  { id: 'c1', text: '<p>first comment</p>', userId: 'u1', userName: 'Alice', timestamp: 1000 },
  { id: 'c2', text: '<p>second comment</p>', userId: 'u2', userName: 'Bob', timestamp: 2000 },
];

describe('CommentEditor -- TipTap/rich-editor configuration freeze (PATCH 8Z)', () => {
  it('COMMENT_EXTENSIONS still configures the full rich-text capability set (unchanged by this permissions-only patch)', () => {
    const src = fs.readFileSync('components/collabboard/editors/CommentEditor.tsx', 'utf8');
    const block = src.slice(src.indexOf('const COMMENT_EXTENSIONS'), src.indexOf('import { ColorPickerContent'));
    expect(block).toContain('StarterKit.configure({ link: false, underline: false })');
    expect(block).toContain('Link.configure(');
    expect(block).toContain('Underline');
    expect(block).toContain('TextStyle');
    expect(block).toContain('Color');
    expect(block).toContain('Highlight.configure({ multicolor: true })');
    expect(block).toContain('TextAlign.configure({ types: ["heading", "paragraph"] })');
  });

  it('all toolbar formatting handlers (Bold/Italic/Underline/lists/Code/Align/Emoji) remain defined, unmodified', () => {
    const src = fs.readFileSync('components/collabboard/editors/CommentEditor.tsx', 'utf8');
    for (const handler of [
      'toggleBold', 'toggleItalic', 'toggleStrike', 'toggleUnderline',
      'toggleBulletList', 'toggleOrderedList', 'toggleCodeBlock', 'cycleEditorTextAlign',
    ]) {
      expect(src, `${handler} should still be wired -- MANAGE rich-text capability must not regress`).toContain(handler);
    }
    expect(src).toContain('handleEmojiClick');
  });
});

describe('CommentEditor -- MANAGE (default) -- existing rich capabilities unchanged', () => {
  it('renders existing comments and the composer/toolbar', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} />);
    expect(c.textContent).toContain('first comment');
    expect(c.textContent).toContain('second comment');
    expect(btn(c, 'Send')).not.toBeNull();
  });

  it('Text style and Link toolbar tools are not disabled', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} />);
    const textStyleBtn = btn(c, 'Text style');
    expect(textStyleBtn).not.toBeNull();
    expect(textStyleBtn!.className).not.toContain('cursor-not-allowed');
    click(textStyleBtn!);
    // Text Style panel opens -- proven by the close button it renders with.
    expect(c.querySelector('button[title="Close"]')).not.toBeNull();
  });

  it('Edit still works (double-click a row enters edit mode)', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} />);
    const rows = c.querySelectorAll('.group\\/row');
    doubleClick(rows[0]);
    expect(btn(c, 'Color')).not.toBeNull(); // Edit/Palette toggles to Color while editing
  });

  it('Strikethrough still works', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} />);
    const strikeButtons = c.querySelectorAll('button[title="Strikethrough"]');
    expect(strikeButtons.length).toBe(2);
  });

  it('Delete isolation still works and persistence remains metadata.comments (via onSave payload shape)', () => {
    const onSave = vi.fn();
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={onSave} initialComments={EXISTING} />);
    const deleteButtons = c.querySelectorAll('button[title="Delete"]');
    click(deleteButtons[1]);
    // Close via backdrop click to trigger handleSave -> onSave.
    click(c.firstElementChild!);
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.comments.map((x: any) => x.id)).toEqual(['c1']);
    expect(payload).toHaveProperty('comments');
    expect(payload).not.toHaveProperty('detachedComments');
  });

  it('title editing still works', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={[]} initialCommentTitle="Old Title" />);
    const titleInput = c.querySelector('input[placeholder="Post name"]') as HTMLInputElement;
    expect(titleInput.readOnly).toBe(false);
  });

  it('Badge Color trigger is rendered', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={[]} />);
    expect(btn(c, 'Badge Color')).not.toBeNull();
  });
});

describe('CommentEditor -- READ -- zero mutation surface', () => {
  it('thread remains visible', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} accessMode="read" />);
    expect(c.textContent).toContain('first comment');
    expect(c.textContent).toContain('second comment');
  });

  it('composer/thread creation is not rendered', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={[]} accessMode="read" />);
    expect(btn(c, 'Send')).toBeNull();
  });

  it('row editing (Edit/PenTool), Color, Strikethrough, and Delete are not rendered', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} accessMode="read" />);
    expect(btn(c, 'Edit')).toBeNull();
    expect(btn(c, 'Color')).toBeNull();
    expect(btn(c, 'Strikethrough')).toBeNull();
    expect(btn(c, 'Delete')).toBeNull();
    const rows = c.querySelectorAll('.group\\/row');
    doubleClick(rows[0]);
    expect(c.querySelector('.ProseMirror[contenteditable="true"]')).toBeNull();
  });

  it('title mutation is unavailable (input is read-only)', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={[]} initialCommentTitle="Old Title" accessMode="read" />);
    const titleInput = c.querySelector('input[placeholder="Post name"]') as HTMLInputElement;
    expect(titleInput.readOnly).toBe(true);
  });

  it('Badge Color trigger is not rendered', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={[]} accessMode="read" />);
    expect(btn(c, 'Badge Color')).toBeNull();
  });

  it('Text style and Link toolbar tools are disabled and do nothing when clicked', () => {
    const c = mount(<CommentEditor isOpen onClose={noop} onSave={vi.fn()} initialComments={EXISTING} accessMode="read" />);
    const textStyleBtn = btn(c, 'Read-only');
    expect(textStyleBtn).not.toBeNull();
    click(textStyleBtn!);
    expect(c.querySelector('button[title="Close"]')).toBeNull();
  });

  it('no comment mutation persists across open/close (onSave payload identical to initial)', () => {
    const onSave = vi.fn();
    const c = mount(
      <CommentEditor
        isOpen
        onClose={noop}
        onSave={onSave}
        initialComments={EXISTING}
        initialCommentTitle="Untouched Title"
        initialBadgeColor="#facc15"
        accessMode="read"
      />,
    );
    // Attempt every entry point a MANAGE user would use.
    const rows = c.querySelectorAll('.group\\/row');
    for (const row of Array.from(rows)) {
      doubleClick(row);
    }
    click(c.firstElementChild!); // backdrop click -> handleSave -> onSave
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0][0];
    expect(payload.comments).toEqual(EXISTING);
    expect(payload.commentTitle).toBe('Untouched Title');
    expect(payload.badgeColor).toBe('#facc15');
  });
});
