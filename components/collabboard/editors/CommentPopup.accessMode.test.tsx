// @vitest-environment jsdom
// PATCH 8O.1 -- COMMENT UI CONTRACT UNLOCK — PERMISSIONS ONLY.
//
// Master read/manage mode contract for the canonical CommentPopup. Mounted
// via real DOM events (createRoot + jsdom + dispatchEvent), matching the
// established convention in CommentPopup.clipartContract.test.tsx -- a
// mocked-useState harness that calls handler props directly would be
// structurally blind to exactly the class of regression this patch is
// guarding against (a mutation control that LOOKS hidden via CSS but is
// still reachable, a callback that still fires despite the UI gate).
//
// READ mode: 17 items (panel/comments/link/copy remain; every mutation
// affordance and callback path is gone). MANAGE mode: 8 items (the existing
// frozen canonical behavior is unchanged -- see CommentPopup.clipartContract
// .test.tsx / CommentPopup.colorAndLink.test.tsx / CommentPopup
// .colorHighlightReactivity.test.tsx for the full depth of that coverage;
// this file's manage-mode block is a focused smoke pass proving the new
// accessMode plumbing didn't regress any of it).
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentPopup from './CommentPopup';
import type { CommentAccessMode } from '@/lib/domain/canvas/comments';

type CommentData = NonNullable<React.ComponentProps<typeof CommentPopup>['comments']>[number];

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

if (!(Range.prototype as any).getClientRects) (Range.prototype as any).getClientRects = () => [];
if (!(Range.prototype as any).getBoundingClientRect) {
  (Range.prototype as any).getBoundingClientRect = () => ({
    top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {},
  });
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
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
  for (const m of mounted) {
    act(() => m.root.unmount());
    m.container.remove();
  }
  mounted = [];
});

function click(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
function doubleClick(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  });
}
function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function pressEnter(el: Element) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
}
// Matches the proven helper in CommentPopup.colorHighlightReactivity.test.tsx:
// ProseMirror's selection-sync needs the editable element focused and a Range
// anchored to an actual text node with character offsets (not
// selectNodeContents' element-level containers) to correctly map into its
// document position space and fire onSelectionUpdate.
function selectTextIn(commentEditorHost: Element, text: string) {
  const pm = commentEditorHost.querySelector('.ProseMirror') as HTMLElement;
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

const commentA: CommentData = {
  id: 'c1',
  text: 'Hello world',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};
const commentWithLink: CommentData = {
  id: 'c2',
  text: 'Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">example.com</a> now',
  userId: 'user2',
  userName: 'Bob',
  timestamp: Date.now(),
};

interface Spies {
  onSubmit: ReturnType<typeof vi.fn>;
  onEditComment: ReturnType<typeof vi.fn>;
  onRemoveComment: ReturnType<typeof vi.fn>;
  onToggleCommentStrikethrough: ReturnType<typeof vi.fn>;
  onCommentColor: ReturnType<typeof vi.fn>;
  onCommentTitleChange: ReturnType<typeof vi.fn>;
  onCommentTitleStyleChange: ReturnType<typeof vi.fn>;
}
function makeSpies(): Spies {
  return {
    onSubmit: vi.fn(),
    onEditComment: vi.fn(),
    onRemoveComment: vi.fn(),
    onToggleCommentStrikethrough: vi.fn(),
    onCommentColor: vi.fn(),
    onCommentTitleChange: vi.fn(),
    onCommentTitleStyleChange: vi.fn(),
  };
}

// Mirrors the canonical caller wiring pattern established across
// ClipartCardDraftModal.tsx / FreeformPadletCards.tsx: controlled comments
// array in local state, each callback both records a spy call AND performs
// the same optimistic local-state update the real callers do -- so this
// harness can assert BOTH "the callback prop was never invoked" (spy) AND
// "no optimistic mutation occurred" (comments array unchanged) with the same
// structural shape production code has, not a simplified stand-in.
function Harness({ accessMode, spies, comments: initial }: { accessMode: CommentAccessMode; spies: Spies; comments: CommentData[] }) {
  const [comments, setComments] = useState<CommentData[]>(initial);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [titleStyle, setTitleStyle] = useState<{ color?: string; backgroundColor?: string }>({});
  return (
    <div data-testid="parent-guard" onMouseDown={() => { throw new Error('interaction leaked past the panel to the parent/canvas'); }}>
      <CommentPopup
        isOpen
        onOpenChange={() => {}}
        accessMode={accessMode}
        enableCanonicalSelectionStyling
        commentTitle={title}
        commentTitleStyle={titleStyle}
        onCommentTitleChange={(next) => { spies.onCommentTitleChange(next); setTitle(next === 'Comments' ? undefined : next); }}
        onCommentTitleStyleChange={(next) => { spies.onCommentTitleStyleChange(next); setTitleStyle(next); }}
        onSubmit={(text) => {
          spies.onSubmit(text);
          setComments((prev) => [...prev, { id: `new-${prev.length}`, text, userId: 'user1', userName: 'Alice', timestamp: Date.now() }]);
        }}
        onEditComment={(commentId, text) => {
          spies.onEditComment(commentId, text);
          setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, text } : c)));
        }}
        onRemoveComment={(commentId) => {
          spies.onRemoveComment(commentId);
          setComments((prev) => prev.filter((c) => c.id !== commentId));
        }}
        onToggleCommentStrikethrough={(commentId) => {
          spies.onToggleCommentStrikethrough(commentId);
          setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c)));
        }}
        onCommentColor={(commentId, textColor, backgroundColor) => {
          spies.onCommentColor(commentId, textColor, backgroundColor);
          setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, textColor, backgroundColor } : c)));
        }}
        comments={comments}
        currentUserId="user1"
        currentUserName="Alice"
      />
    </div>
  );
}

const readOnlyEditorOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-comment-readonly-editor="${id}"]`) as HTMLElement;
const rowOf = (container: HTMLElement, id: string) =>
  readOnlyEditorOf(container, id).closest('.group\\/row') as HTMLElement;

describe('CommentPopup accessMode=read -- 17-item contract', () => {
  it('1. panel renders', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('[data-comment-panel="true"]')).not.toBeNull();
  });

  it('2. existing comments render (avatar/name/time/content)', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Hello world');
  });

  it('3. safe link remains clickable (not stripped, not disabled, and actually opens on click)', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentWithLink]} />);
    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    expect(anchor.target).toBe('_blank');
    expect(anchor.rel).toContain('noopener');
    // Static attributes alone don't prove the click actually opens the link --
    // the safe-link handler could be silently gated by isReadOnly (breaking
    // navigation while leaving the anchor's attributes untouched). Simulate
    // the real click and assert the safe-open mechanism actually ran.
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('4. composer absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
  });

  it('5. Send absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[aria-label="Send"]')).toBeNull();
  });

  it('6. Edit absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[title="Edit"]')).toBeNull();
  });

  it('7. Color absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[title="Color"]')).toBeNull();
    expect(container.querySelector('button[title="Color / Text Style"]')).toBeNull();
  });

  it('8. Highlight styling inaccessible -- selecting read-only text never surfaces the style action', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    selectTextIn(readOnlyEditorOf(container, 'c1'), 'Hello');
    expect(container.querySelector('button[title="Color / Text Style"]')).toBeNull();
    expect(document.querySelector('[data-comment-title-style-popover="true"]')).toBeNull();
  });

  it('9. Link authoring absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[title="Link"]')).toBeNull();
    expect(document.querySelector('input[type="url"]')).toBeNull();
  });

  it('10. Strikethrough absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[title="Strikethrough"]')).toBeNull();
  });

  it('11. Delete absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[title="Delete"]')).toBeNull();
  });

  it('12. title editing absent -- clicking the title never enters edit mode', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    const title = container.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(title.tagName).toBe('H4');
    click(title);
    expect(container.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
    expect(container.querySelector('[data-comment-panel-title="true"]')?.tagName).toBe('H4');
  });

  it('13. title styling absent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('button[aria-label="Style comment title"]')).toBeNull();
  });

  it('14. mutation callbacks never fire even when the underlying interaction path is invoked directly', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="read" spies={spies} comments={[commentA]} />);
    // Double-click would enter edit mode in manage mode -- try it anyway.
    doubleClick(rowOf(container, 'c1'));
    // Enter in a (non-existent) composer, and a raw dispatch on the row, to
    // exercise every reachable event path even without a visible control.
    const row = rowOf(container, 'c1');
    act(() => { row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(spies.onSubmit).not.toHaveBeenCalled();
    expect(spies.onEditComment).not.toHaveBeenCalled();
    expect(spies.onRemoveComment).not.toHaveBeenCalled();
    expect(spies.onToggleCommentStrikethrough).not.toHaveBeenCalled();
    expect(spies.onCommentColor).not.toHaveBeenCalled();
    expect(spies.onCommentTitleChange).not.toHaveBeenCalled();
    expect(spies.onCommentTitleStyleChange).not.toHaveBeenCalled();
  });

  it('15. Enter cannot submit -- there is no composer for Enter to target', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="read" spies={spies} comments={[commentA]} />);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).toBeNull();
    const panel = container.querySelector('[data-comment-panel="true"]') as HTMLElement;
    act(() => { panel.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    expect(spies.onSubmit).not.toHaveBeenCalled();
  });

  it('16. no optimistic local mutation occurs -- comment content is byte-identical after every attempted interaction', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="read" spies={spies} comments={[commentA]} />);
    const rowCountBefore = container.querySelectorAll('[data-comment-readonly-editor]').length;
    click(rowOf(container, 'c1'));
    doubleClick(rowOf(container, 'c1'));
    selectTextIn(readOnlyEditorOf(container, 'c1'), 'Hello');
    expect(container.textContent).toContain('Hello world');
    expect(readOnlyEditorOf(container, 'c1').innerHTML).toContain('Hello world');
    // Same row structure as before -- nothing was added, edited away, or removed.
    expect(container.querySelectorAll('[data-comment-readonly-editor]').length).toBe(rowCountBefore);
  });

  it('17. card/canvas interaction isolation remains intact -- panel mousedown still does not reach the parent', () => {
    const { container } = mount(<Harness accessMode="read" spies={makeSpies()} comments={[commentA]} />);
    const panel = container.querySelector('[data-comment-panel="true"]') as HTMLElement;
    expect(() => {
      act(() => {
        panel.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      });
    }).not.toThrow();
  });
});

describe('CommentPopup accessMode=manage -- 8-item smoke contract (unchanged behavior)', () => {
  it('18. existing canonical controls remain present', () => {
    const { container } = mount(<Harness accessMode="manage" spies={makeSpies()} comments={[commentA]} />);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Send"]')).not.toBeNull();
    click(rowOf(container, 'c1'));
    expect(container.querySelector('button[title="Edit"]')).not.toBeNull();
    expect(container.querySelector('button[title="Strikethrough"]')).not.toBeNull();
    expect(container.querySelector('button[title="Delete"]')).not.toBeNull();
  });

  it('19. Add/Send still work', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="manage" spies={spies} comments={[commentA]} />);
    const composer = container.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    typeInto(composer, 'a fresh comment');
    click(container.querySelector('button[aria-label="Send"]')!);
    expect(spies.onSubmit).toHaveBeenCalledWith('a fresh comment');
    expect(container.textContent).toContain('a fresh comment');
  });

  it('20. Edit works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="manage" spies={spies} comments={[commentA]} />);
    click(rowOf(container, 'c1'));
    click(container.querySelector('button[title="Edit"]')!);
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
  });

  it('21. Color/Highlight works -- selecting text surfaces the style action', () => {
    const { container } = mount(<Harness accessMode="manage" spies={makeSpies()} comments={[commentA]} />);
    selectTextIn(readOnlyEditorOf(container, 'c1'), 'Hello');
    expect(container.querySelector('button[title="Color / Text Style"]')).not.toBeNull();
  });

  it('22. Link works -- selecting text surfaces the Link action', () => {
    const { container } = mount(<Harness accessMode="manage" spies={makeSpies()} comments={[commentA]} />);
    selectTextIn(readOnlyEditorOf(container, 'c1'), 'Hello');
    expect(container.querySelector('button[title="Link"]')).not.toBeNull();
  });

  it('23. Strikethrough works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="manage" spies={spies} comments={[commentA]} />);
    click(rowOf(container, 'c1'));
    click(container.querySelector('button[title="Strikethrough"]')!);
    expect(spies.onToggleCommentStrikethrough).toHaveBeenCalledWith('c1');
  });

  it('24. Delete works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="manage" spies={spies} comments={[commentA]} />);
    click(rowOf(container, 'c1'));
    click(container.querySelector('button[title="Delete"]')!);
    expect(spies.onRemoveComment).toHaveBeenCalledWith('c1');
  });

  it('25. title editing/styling works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="manage" spies={spies} comments={[commentA]} />);
    const title = container.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    click(title);
    const input = container.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    typeInto(input, 'Feedback');
    pressEnter(input);
    expect(spies.onCommentTitleChange).toHaveBeenCalledWith('Feedback');
    expect(container.querySelector('[data-comment-panel-title="true"]')?.textContent).toBe('Feedback');
  });
});

describe('CommentPopup accessMode -- defaults', () => {
  it('defaults to manage when accessMode is not passed, so existing consumers are unaffected', () => {
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={() => {}}
        onSubmit={() => {}}
        comments={[commentA]}
      />
    );
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });
});
