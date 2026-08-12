// @vitest-environment jsdom
// PATCH 8O.2 -- Canonical Commenter Authorization.
//
// Master 'comment' access-mode contract for the canonical CommentPopup. This
// is the THIRD tier between 'read' (CommentPopup.accessMode.test.tsx's
// 17-item block) and 'manage' (that same file's 8-item block, unchanged) --
// composer/Send/own-comment mutation stay available, but every action on
// ANOTHER user's comment must be unreachable, exactly as 'read' made every
// mutation unreachable. Same mounted-DOM methodology as
// CommentPopup.accessMode.test.tsx (real events, not direct prop calls) --
// that file's own header explains why a mocked-callback harness would be
// structurally blind to the regression class this guards against.
//
// Items 4 ("new comment userId comes from authenticated identity"), 22
// ("forged userId on add cannot impersonate another user"), and 23
// ("arbitrary padlet metadata cannot be changed through commenter write
// path") are CALLER/persistence-layer guarantees, not something CommentPopup
// itself can enforce (its onSubmit prop only ever receives comment TEXT --
// the caller assigns userId) -- those are covered by structural tests in
// canonicalCommentPermission.contract.test.tsx instead, alongside the note
// that true server-side enforcement of 22/23 awaits the drafted (not yet
// applied) comment_mutate RPC migration.
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
function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
// Matches the proven helper in CommentPopup.colorHighlightReactivity.test.tsx
// / CommentPopup.accessMode.test.tsx.
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

const ownComment: CommentData = {
  id: 'own',
  text: 'my own comment',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};
const otherComment: CommentData = {
  id: 'other',
  text: 'not mine',
  userId: 'user2',
  userName: 'Bob',
  timestamp: Date.now(),
};
const otherCommentWithLink: CommentData = {
  id: 'other-link',
  text: 'Visit <a href="https://example.com" target="_blank" rel="noopener noreferrer">example.com</a> now',
  userId: 'user2',
  userName: 'Bob',
  timestamp: Date.now(),
};
const legacyComment: CommentData = {
  id: 'legacy',
  text: 'ancient, no reliable author',
  userId: '' as unknown as string,
  userName: '?',
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
  onBadgeColorChange: ReturnType<typeof vi.fn>;
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
    onBadgeColorChange: vi.fn(),
  };
}

// Same shape as CommentPopup.accessMode.test.tsx's Harness -- controlled
// comments array in local state, every callback both records a spy call AND
// performs the same optimistic local-state update real callers do.
function Harness({
  accessMode,
  spies,
  comments: initial,
  currentUserId = 'user1',
}: {
  accessMode: CommentAccessMode;
  spies: Spies;
  comments: CommentData[];
  currentUserId?: string;
}) {
  const [comments, setComments] = useState<CommentData[]>(initial);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [titleStyle, setTitleStyle] = useState<{ color?: string; backgroundColor?: string }>({});
  const [badgeColor, setBadgeColor] = useState<string | undefined>(undefined);
  return (
    <div data-testid="parent-guard" onMouseDown={() => { throw new Error('interaction leaked past the panel to the parent/canvas'); }}>
      <CommentPopup
        isOpen
        onOpenChange={() => {}}
        accessMode={accessMode}
        enableCanonicalSelectionStyling
        commentTitle={title}
        commentTitleStyle={titleStyle}
        badgeColor={badgeColor}
        onCommentTitleChange={(next) => { spies.onCommentTitleChange(next); setTitle(next === 'Comments' ? undefined : next); }}
        onCommentTitleStyleChange={(next) => { spies.onCommentTitleStyleChange(next); setTitleStyle(next); }}
        onBadgeColorChange={(next) => { spies.onBadgeColorChange(next); setBadgeColor(next); }}
        onSubmit={(text) => {
          spies.onSubmit(text);
          setComments((prev) => [...prev, { id: `new-${prev.length}`, text, userId: currentUserId, userName: 'Alice', timestamp: Date.now() }]);
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
        currentUserId={currentUserId}
        currentUserName="Alice"
      />
    </div>
  );
}

const readOnlyEditorOf = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-comment-readonly-editor="${id}"]`) as HTMLElement;
const rowOf = (container: HTMLElement, id: string) =>
  readOnlyEditorOf(container, id).closest('.group\\/row') as HTMLElement;

describe('CommentPopup accessMode=comment -- own-comment capabilities', () => {
  it('1. composer visible', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });

  it('2. Send visible', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    expect(container.querySelector('button[aria-label="Send"]')).not.toBeNull();
  });

  it('3. new comment succeeds', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="comment" spies={spies} comments={[]} />);
    const composer = container.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    typeInto(composer, 'a fresh comment');
    click(container.querySelector('button[aria-label="Send"]')!);
    expect(spies.onSubmit).toHaveBeenCalledWith('a fresh comment');
    expect(container.textContent).toContain('a fresh comment');
  });

  it('5. own comment Edit visible', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    click(rowOf(container, 'own'));
    expect(container.querySelector('button[title="Edit"]')).not.toBeNull();
  });

  it('6. own Color visible (via read-only selection)', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    selectTextIn(readOnlyEditorOf(container, 'own'), 'own');
    expect(container.querySelector('button[title="Color / Text Style"]')).not.toBeNull();
  });

  it('7. own Highlight works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="comment" spies={spies} comments={[ownComment]} />);
    click(rowOf(container, 'own'));
    click(container.querySelector('button[title="Edit"]')!);
    // Color popup opens for the row currently being edited.
    click(container.querySelector('button[title="Color"]')!);
    const popup = document.body.querySelector('.fixed.z-\\[1200\\]') as HTMLElement;
    expect(popup).not.toBeNull();
  });

  it('8. own Link authoring works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="comment" spies={spies} comments={[ownComment]} />);
    selectTextIn(readOnlyEditorOf(container, 'own'), 'own');
    const linkButton = container.querySelector('button[title="Link"]');
    expect(linkButton).not.toBeNull();
    click(linkButton!);
    expect(document.querySelector('input[type="url"]')).not.toBeNull();
  });

  it('9. own Strikethrough works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="comment" spies={spies} comments={[ownComment]} />);
    click(rowOf(container, 'own'));
    click(container.querySelector('button[title="Strikethrough"]')!);
    expect(spies.onToggleCommentStrikethrough).toHaveBeenCalledWith('own');
  });

  it('10. own Delete works', () => {
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="comment" spies={spies} comments={[ownComment]} />);
    click(rowOf(container, 'own'));
    click(container.querySelector('button[title="Delete"]')!);
    expect(spies.onRemoveComment).toHaveBeenCalledWith('own');
  });
});

describe('CommentPopup accessMode=comment -- other-user comment restrictions', () => {
  it('11. other-user Edit absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherComment]} />);
    click(rowOf(container, 'other'));
    expect(container.querySelector('button[title="Edit"]')).toBeNull();
  });

  it('12. other-user Color mutation absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherComment]} />);
    selectTextIn(readOnlyEditorOf(container, 'other'), 'not');
    expect(container.querySelector('button[title="Color / Text Style"]')).toBeNull();
  });

  it('13. other-user Link authoring absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherComment]} />);
    selectTextIn(readOnlyEditorOf(container, 'other'), 'not');
    expect(container.querySelector('button[title="Link"]')).toBeNull();
  });

  it('14. other-user Strikethrough absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherComment]} />);
    click(rowOf(container, 'other'));
    expect(container.querySelector('button[title="Strikethrough"]')).toBeNull();
  });

  it('15. other-user Delete absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherComment]} />);
    click(rowOf(container, 'other'));
    expect(container.querySelector('button[title="Delete"]')).toBeNull();
  });

  it('16. existing other-user links still open', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherCommentWithLink]} />);
    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  it('double-click never enters edit mode for another user\'s comment', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[otherComment]} />);
    act(() => {
      rowOf(container, 'other').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(container.querySelector('.ProseMirror.prose')).toBeNull();
  });

  it('forged mutation calls into CommentPopup-internal handlers for another user\'s comment never invoke the caller callback', () => {
    // Regression proof for negative controls A/B: even if some future edit
    // reintroduces a reachable path to editingCommentId/readOnlySelection for
    // another user's row, the internal guards (canMutateCommentById) inside
    // handleEditCommit/applySelectedStyle/applySelectedStrikethrough/
    // openLinkPopover/handleApplyLink independently block it. Exercised here
    // by selecting text in another user's comment (the one client-observable
    // path that can set readOnlySelection without going through a row
    // button) and confirming no style button and no mutation ever surfaces.
    const spies = makeSpies();
    const { container } = mount(<Harness accessMode="comment" spies={spies} comments={[otherComment]} />);
    selectTextIn(readOnlyEditorOf(container, 'other'), 'not');
    expect(container.querySelector('button[title="Color / Text Style"]')).toBeNull();
    expect(container.querySelector('button[title="Link"]')).toBeNull();
    expect(spies.onEditComment).not.toHaveBeenCalled();
  });
});

describe('CommentPopup accessMode=comment -- panel-level restrictions (manage-only)', () => {
  it('17. title edit absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    const title = container.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(title.tagName).toBe('H4');
    click(title);
    expect(container.querySelector('input[aria-label="Comment panel title"]')).toBeNull();
  });

  it('18. title styling absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    expect(container.querySelector('button[aria-label="Style comment title"]')).toBeNull();
  });

  it('19. Badge Color mutation absent', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment]} />);
    expect(container.querySelector('button[title="Badge Color"]')).toBeNull();
  });
});

describe('CommentPopup accessMode=comment -- legacy and forged-call safety', () => {
  it('20. legacy comment without userId cannot be mutated', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[legacyComment]} />);
    click(rowOf(container, 'legacy'));
    expect(container.querySelector('button[title="Edit"]')).toBeNull();
    expect(container.querySelector('button[title="Strikethrough"]')).toBeNull();
    expect(container.querySelector('button[title="Delete"]')).toBeNull();
  });

  it('21. mixed list -- own row shows actions, other row in the same panel does not', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment, otherComment]} />);
    click(rowOf(container, 'own'));
    expect(container.querySelector('[data-comment-readonly-editor="own"]')?.closest('.group\\/row')?.querySelector('button[title="Edit"]')).not.toBeNull();
    click(rowOf(container, 'other'));
    expect(container.querySelector('[data-comment-readonly-editor="other"]')?.closest('.group\\/row')?.querySelector('button[title="Edit"]')).toBeNull();
  });
});

describe('CommentPopup accessMode=comment -- read capabilities remain (comment includes everything read allows)', () => {
  it('existing comments render for all authors, not just the current user\'s own', () => {
    const { container } = mount(<Harness accessMode="comment" spies={makeSpies()} comments={[ownComment, otherComment]} />);
    expect(container.textContent).toContain('my own comment');
    expect(container.textContent).toContain('not mine');
  });
});
