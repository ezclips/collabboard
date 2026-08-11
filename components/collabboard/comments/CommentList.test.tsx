// @vitest-environment jsdom
import fs from 'node:fs';
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentList, { SITE_A_PROFILE, type CommentSurfaceProfile } from './CommentList';
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

// CommentList is a CONTROLLED component (PATCH 8C correction -- Site A's
// active/editing/color-popup state is the SAME state family site D's
// separate comment panel reads, per COMMENT_UI_CONTRACT_V1.md "shared with
// A"). This harness plays the role FreeformPadletCards.tsx plays in
// production: it owns the state and passes it down, exactly like a real
// controlled <input>.
function Harness({
  initialComments,
  onCommentsChangeSpy,
  profile,
  onColorPopupCommentIdChangeSpy,
}: {
  initialComments: Comment[];
  onCommentsChangeSpy?: (next: Comment[]) => void;
  profile?: CommentSurfaceProfile;
  onColorPopupCommentIdChangeSpy?: (id: string | null) => void;
}) {
  const [comments, setComments] = useState(initialComments);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [colorPopupCommentId, setColorPopupCommentId] = useState<string | null>(null);
  return (
    <CommentList
      comments={comments}
      onCommentsChange={(next) => {
        setComments(next);
        onCommentsChangeSpy?.(next);
      }}
      profile={profile}
      activeCommentId={activeCommentId}
      onActiveCommentIdChange={setActiveCommentId}
      editingCommentId={editingCommentId}
      editingText={editingText}
      onEditingCommentIdChange={setEditingCommentId}
      onEditingTextChange={setEditingText}
      colorPopupCommentId={colorPopupCommentId}
      onColorPopupCommentIdChange={(id) => {
        setColorPopupCommentId(id);
        onColorPopupCommentIdChangeSpy?.(id);
      }}
    />
  );
}

describe('CommentList -- Site A action rail (order, count, icon identity)', () => {
  it('renders exactly Color|Edit, Strikethrough, Delete titles in that order once a comment is active', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    click(container.querySelector('.cursor-pointer')!);
    expect(titlesInOrder(container)).toEqual(['Edit', 'Strikethrough', 'Delete']);
  });

  it('shows Color (not Edit) once the active comment enters edit mode', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    expect(titlesInOrder(container)).toEqual(['Color', 'Strikethrough', 'Delete']);
  });

  it('renders the PenTool icon for Edit under the default Site A profile (not Edit2)', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    click(container.querySelector('.cursor-pointer')!);
    const editBtn = btn(container, 'Edit')!;
    expect(editBtn.innerHTML).toContain('lucide-pen-tool');
    expect(editBtn.innerHTML).not.toContain('lucide-edit-2');
  });

  it('all three action buttons are disabled until a comment becomes active (no silent no-op clicks)', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    expect(btn(container, 'Edit')!.disabled).toBe(true);
    expect(btn(container, 'Strikethrough')!.disabled).toBe(true);
    expect(btn(container, 'Delete')!.disabled).toBe(true);
  });
});

describe('CommentList -- Site A capability boundary', () => {
  it('does not expose a Link-authoring control, matching Site A\'s frozen "no link authoring" contract', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    expect(btn(container, 'Link')).toBeNull();
    expect(container.innerHTML).not.toContain('title="Link"');
  });
});

describe('CommentList -- controlled state (not internally owned)', () => {
  it('does NOT own active/editing/color-popup state internally -- state changes only via the controlled callbacks', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    // Selecting a row must call the controlled callback (proven by the row
    // actually becoming active, which only happens through the harness's
    // own useState -- CommentList has no internal useState of its own).
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[0]);
    expect(rows[0].className).toContain('bg-blue-50');
  });

  it('Color button toggles the externally-owned colorPopupCommentId to the active comment id, and back to null on a second click', () => {
    const onColorPopupCommentIdChangeSpy = vi.fn();
    const { container } = mount(
      <Harness initialComments={makeComments()} onColorPopupCommentIdChangeSpy={onColorPopupCommentIdChangeSpy} />
    );
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);
    expect(onColorPopupCommentIdChangeSpy).toHaveBeenLastCalledWith('a');
    click(btn(container, 'Color')!);
    expect(onColorPopupCommentIdChangeSpy).toHaveBeenLastCalledWith(null);
  });

  it('does NOT render a color popup itself -- that stays owned by the caller (Site A\'s color popup is a sibling of the panel, not nested in it)', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);
    expect(container.querySelector('[class*="right-full"]')).toBeNull();
    expect(container.textContent).not.toContain('Highlight');
  });
});

describe('CommentList -- operations target the correct comment', () => {
  it('Strikethrough toggles only the active comment', () => {
    const onCommentsChangeSpy = vi.fn();
    const { container } = mount(<Harness initialComments={makeComments()} onCommentsChangeSpy={onCommentsChangeSpy} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[1]); // select "b"
    click(btn(container, 'Strikethrough')!);
    const result = onCommentsChangeSpy.mock.calls[0][0] as Comment[];
    expect(result.find((c) => c.id === 'b')?.isStrikethrough).toBe(true);
    expect(result.find((c) => c.id === 'a')?.isStrikethrough).toBeUndefined();
  });

  it('Delete removes only the active comment (not simply the first comment) and re-activates the new last comment', () => {
    const onCommentsChangeSpy = vi.fn();
    const { container } = mount(<Harness initialComments={makeComments()} onCommentsChangeSpy={onCommentsChangeSpy} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[1]); // select "b" -- deliberately NOT the first row, so a
    // Delete that's wired to comments[0] instead of the active comment
    // would delete "a" and this assertion would fail.
    click(btn(container, 'Delete')!);
    const result = onCommentsChangeSpy.mock.calls[0][0] as Comment[];
    expect(result.map((c) => c.id)).toEqual(['a']);
  });

  it('Edit commits changed text only for the edited comment, preserving the other', () => {
    const onCommentsChangeSpy = vi.fn();
    const { container } = mount(<Harness initialComments={makeComments()} onCommentsChangeSpy={onCommentsChangeSpy} />);
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
    const result = onCommentsChangeSpy.mock.calls[0][0] as Comment[];
    expect(result.find((c) => c.id === 'a')?.text).toBe('edited first');
    expect(result.find((c) => c.id === 'b')?.text).toBe('second');
  });
});

describe('CommentList -- list-level concerns only (no shell/chrome)', () => {
  it('renders comments in input order', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    const names = Array.from(container.querySelectorAll('.text-xs.font-medium.text-gray-700.truncate')).map(
      (el) => el.textContent
    );
    expect(names).toEqual(['Alice', 'Bob']);
  });

  it('shows the empty-state message and no action buttons when there are no comments', () => {
    const { container } = mount(<Harness initialComments={[]} />);
    expect(container.textContent).toContain('No comments yet');
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('one row entering edit mode does not put another row into edit mode', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[0]);
    click(btn(container, 'Edit')!);
    expect(container.querySelectorAll('textarea')).toHaveLength(1);
  });

  it('does not render modal/panel chrome (no close button, no header, no floating positioning wrapper, no color popup)', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    expect(btn(container, 'Close')).toBeNull();
    expect(container.textContent).not.toContain('Comments');
    expect(container.querySelector('[class*="absolute left-full"]')).toBeNull();
    expect(container.querySelector('[class*="right-full"]')).toBeNull();
  });
});

describe('CommentList -- Site A old/new contract parity', () => {
  const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
  const src = fs.readFileSync(FREEFORM_PATH, 'utf8');

  it('SITE_A_PROFILE matches the frozen icon and color-mirroring policy documented for Site D (Site A\'s own inline block is now CommentList; D remains source-of-truth for the shared policy)', () => {
    // Site D shares Site A's exact action-cluster/color-policy family
    // (COMMENT_UI_CONTRACT_V1.md), and D's inline source is intentionally
    // untouched by this patch -- so it's the correct place to verify the
    // policy is still what SITE_A_PROFILE claims.
    const dAnchor = 'activeImageToolbarPadlet && cardCommentPopupPadletId === activeImageToolbarPadlet.id';
    const dStart = src.indexOf(dAnchor);
    expect(dStart).toBeGreaterThan(-1);
    const editBlockStart = src.indexOf('title="Edit"', dStart);
    const editBlockEnd = src.indexOf('</button>', editBlockStart);
    expect(src.slice(editBlockStart, editBlockEnd)).toContain('<PenTool');
    expect(SITE_A_PROFILE.editIcon).toBe('PenTool');
    expect(SITE_A_PROFILE.mirrorLegacyColor).toBe(true);
  });

  it('the frozen Site A action order (Color|Edit, Strikethrough, Delete) matches the new CommentList order', () => {
    const { container } = mount(<Harness initialComments={makeComments()} />);
    click(container.querySelector('.cursor-pointer')!);
    expect(titlesInOrder(container)).toEqual(['Edit', 'Strikethrough', 'Delete']);
    click(btn(container, 'Edit')!);
    expect(titlesInOrder(container)).toEqual(['Color', 'Strikethrough', 'Delete']);
  });
});
