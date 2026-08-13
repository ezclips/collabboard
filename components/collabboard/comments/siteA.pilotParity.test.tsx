// @vitest-environment jsdom
// PATCH 8C -- SITE A PILOT: PRE/POST CONSOLIDATION CONTRACT PARITY.
//
// This is the single place a future reviewer can see the BEFORE contract
// (what Site A did, inline, per .fable5/architecture/COMMENT_UI_CONTRACT_V1.md
// and the PATCH 8A characterization suite) next to the AFTER proof (the SAME
// behavior, now produced by the shared CommentList/FreeformCommentRow
// foundation with SITE_A_PROFILE). Mounted behavior is used wherever
// practical, per the 8C spec's explicit instruction not to rely solely on
// source-string matching -- source-string checks for the parts that are
// genuinely still source (the migration wiring itself, and the untouched
// shell/composer/color-popup chrome) live in
// freeformCommentUIContract.characterization.test.tsx instead.
//
// BEFORE contract (Site A, frozen by PATCH 8A):
//   - action cluster: (Color | Edit) -> Strikethrough -> Delete, PenTool icon
//   - all three actions disabled until a comment is active
//   - editing via plain <textarea>, autoFocus, Enter saves, Escape cancels,
//     blur commits UNLESS the color popup is open for that comment
//   - Delete/Strikethrough/Edit always target the ACTIVE comment, never
//     "the first comment" or any other row
//   - color writes mirror textColor into the legacy `color` field
//   - saved HTML renders sanitized, links open via the shared safe-link
//     handler (new tab), no Link-authoring control exists
//   - comment-row/action interactions stop propagation -- they must never
//     bubble out to whatever click handler would open/drag the parent card
//   - shell (close/header/Badge Color/composer/color popup) is untouched
//
// AFTER (this patch): the same contract, produced by CommentList +
// FreeformCommentRow with SITE_A_PROFILE, mounted and driven exactly like
// FreeformPadletCards.tsx now drives it (controlled active/editing/
// color-popup state, one onCommentsChange callback).
import fs from 'node:fs';
import React, { useState } from 'react';
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
function mousedown(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
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
    { id: 'a', text: 'Hello <a href="https://example.com">link</a>', userId: 'u1', userName: 'Alice', timestamp: 1 },
    { id: 'b', text: 'second', userId: 'u2', userName: 'Bob', timestamp: 2 },
  ];
}

// Exactly the controlled-state wiring FreeformPadletCards.tsx now uses for
// Site A -- see the CommentList JSX block anchored at "Image Comments Popup
// - Right side". A `onCardOpen` spy stands in for "whatever click handler
// would open/select/drag the parent card" so propagation-boundary parity
// can be proven by mounting, not just by grepping for stopPropagation calls.
function SiteAHarness({
  initialComments,
  onCommentsChangeSpy,
  onCardOpenSpy,
}: {
  initialComments: Comment[];
  onCommentsChangeSpy?: (next: Comment[]) => void;
  onCardOpenSpy?: () => void;
}) {
  const [comments, setComments] = useState(initialComments);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [colorPopupCommentId, setColorPopupCommentId] = useState<string | null>(null);
  return (
    <div onClick={onCardOpenSpy} onMouseDown={onCardOpenSpy}>
      <CommentList
        comments={comments}
        onCommentsChange={(next) => {
          setComments(next);
          onCommentsChangeSpy?.(next);
        }}
        profile={SITE_A_PROFILE}
        activeCommentId={activeCommentId}
        onActiveCommentIdChange={setActiveCommentId}
        editingCommentId={editingCommentId}
        editingText={editingText}
        onEditingCommentIdChange={setEditingCommentId}
        onEditingTextChange={setEditingText}
        colorPopupCommentId={colorPopupCommentId}
        onColorPopupCommentIdChange={setColorPopupCommentId}
      />
    </div>
  );
}

describe('SITE A -- PRE/POST CONSOLIDATION CONTRACT PARITY', () => {
  it('action inventory/order/icon: (Color|Edit=PenTool) -> Strikethrough -> Delete, all disabled until active', () => {
    const { container } = mount(<SiteAHarness initialComments={makeComments()} />);
    expect(btn(container, 'Edit')!.disabled).toBe(true);
    expect(btn(container, 'Strikethrough')!.disabled).toBe(true);
    expect(btn(container, 'Delete')!.disabled).toBe(true);

    click(container.querySelector('.cursor-pointer')!);
    expect(titlesInOrder(container)).toEqual(['Edit', 'Strikethrough', 'Delete']);
    expect(btn(container, 'Edit')!.innerHTML).toContain('lucide-pen-tool');

    click(btn(container, 'Edit')!);
    expect(titlesInOrder(container)).toEqual(['Color', 'Strikethrough', 'Delete']);
  });

  it('editing parity: textarea, autoFocus, Enter saves, Escape cancels, blur commits unless the color popup is open', () => {
    const onCommentsChangeSpy = vi.fn();
    const { container } = mount(<SiteAHarness initialComments={makeComments()} onCommentsChangeSpy={onCommentsChangeSpy} />);
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);

    const textarea = container.querySelector('textarea')!;
    // React's autoFocus is an imperative .focus() call on mount, not a
    // reflected DOM attribute -- activeElement is the correct observable.
    expect(document.activeElement).toBe(textarea);

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(textarea, 'edited');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(onCommentsChangeSpy.mock.calls[0][0].find((c: Comment) => c.id === 'a').text).toBe('edited');

    // Re-enter edit, open Color, confirm blur is suppressed while it's open.
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    click(btn(container, 'Color')!);
    const textarea2 = container.querySelector('textarea')!;
    act(() => {
      textarea2.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    });
    expect(onCommentsChangeSpy).toHaveBeenCalledTimes(1); // no second commit from the blur

    // Escape cancels without committing.
    const textarea3 = container.querySelector('textarea')!;
    act(() => {
      textarea3.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(container.querySelector('textarea')).toBeNull();
    expect(onCommentsChangeSpy).toHaveBeenCalledTimes(1);
  });

  it('target isolation: Delete/Strikethrough/Edit always act on the ACTIVE comment, never the first comment or any other row', () => {
    const onCommentsChangeSpy = vi.fn();
    const { container } = mount(<SiteAHarness initialComments={makeComments()} onCommentsChangeSpy={onCommentsChangeSpy} />);
    const rows = container.querySelectorAll('.cursor-pointer');
    click(rows[1]); // select "b" -- deliberately not the first row
    click(btn(container, 'Strikethrough')!);
    const afterStrike = onCommentsChangeSpy.mock.calls[0][0] as Comment[];
    expect(afterStrike.find((c) => c.id === 'b')?.isStrikethrough).toBe(true);
    expect(afterStrike.find((c) => c.id === 'a')?.isStrikethrough).toBeUndefined();

    click(btn(container, 'Delete')!);
    const afterDelete = onCommentsChangeSpy.mock.calls[1][0] as Comment[];
    expect(afterDelete.map((c) => c.id)).toEqual(['a']);
  });

  it('color-mirroring policy: SITE_A_PROFILE.mirrorLegacyColor is true, matching Site A\'s frozen textColor+legacy-color write shape (the shell owns the actual write -- see the color popup block in FreeformPadletCards.tsx, untouched by this patch)', () => {
    expect(SITE_A_PROFILE.mirrorLegacyColor).toBe(true);
    expect(SITE_A_PROFILE.editIcon).toBe('PenTool');
  });

  it('safe-render/link parity: saved HTML renders sanitized, links open via the shared safe-link handler (new tab), and no Link-authoring control exists', () => {
    const { container } = mount(<SiteAHarness initialComments={makeComments()} />);
    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    click(anchor);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();

    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    expect(btn(container, 'Link')).toBeNull();
  });

  it('interaction/propagation parity: mousedown on comment text and the Color button never bubbles out to the card\'s own handler (a plain row click was never guarded in production either -- Site A\'s outer shell has no stopPropagation on click, only these two)', () => {
    const onCardOpenSpy = vi.fn();
    const { container } = mount(<SiteAHarness initialComments={makeComments()} onCardOpenSpy={onCardOpenSpy} />);

    const textNode = container.querySelector('a[href="https://example.com"]')!.parentElement!;
    mousedown(textNode);
    expect(onCardOpenSpy).not.toHaveBeenCalled();

    // Selecting the row itself DOES bubble in production (no stopPropagation
    // on a plain row click) -- reset the spy before the guarded checks below.
    click(container.querySelector('.cursor-pointer')!);
    click(btn(container, 'Edit')!);
    onCardOpenSpy.mockClear();
    mousedown(btn(container, 'Color')!);
    click(btn(container, 'Color')!);
    expect(onCardOpenSpy).not.toHaveBeenCalled();
  });

  it('shell/chrome ownership parity: CommentList renders none of Site A\'s panel chrome (close, header, Badge Color, composer, color popup)', () => {
    const { container } = mount(<SiteAHarness initialComments={makeComments()} />);
    expect(btn(container, 'Close')).toBeNull();
    expect(btn(container, 'Badge Color')).toBeNull();
    expect(container.textContent).not.toContain('Comments');
    expect(container.querySelector('input[placeholder^="Add a comment"]')).toBeNull();
    expect(container.querySelector('[class*="right-full"]')).toBeNull();
  });
});

describe('SITE A -- migration scope guard (Image moved to CommentPopup)', () => {
  it('FreeformPadletCards.tsx no longer owns the migrated Image CommentList foundation', () => {
    const src = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    const usageCount = (src.match(/<CommentList\b/g) || []).length;
    expect(usageCount).toBe(0);
    const importCount = (src.match(/from '@\/components\/collabboard\/comments\/CommentList'/g) || []).length;
    expect(importCount).toBe(0);
  });

  it('no other production file imports the shared comment foundation', () => {
    // Mirrors the 8B import-count proof, re-run here because 8C is the
    // patch that could have accidentally widened it. `git grep` (not a
    // manual recursive fs walk) so this stays fast and automatically
    // respects .gitignore -- this repo vendors a large excalidraw fork
    // under components/ that a hand-rolled walk would otherwise crawl.
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process');
    let output = '';
    try {
      output = execFileSync(
        'git',
        ['grep', '-l', "from '@/components/collabboard/comments/CommentList'", '--', '*.ts', '*.tsx'],
        { encoding: 'utf8' }
      );
    } catch (err: any) {
      // git grep exits 1 when there are zero matches -- not an error here.
      if (err.status === 1) {
        output = '';
      } else {
        throw err;
      }
    }
    const importers = output.split('\n').filter(Boolean);
    const allowed = new Set([
      'components/collabboard/canvas/ui/FreeformPadletCards.tsx',
      'components/collabboard/freeformCommentUIContract.characterization.test.tsx',
      'components/collabboard/comments/siteA.pilotParity.test.tsx',
    ]);
    // commentPermissionClosure.contract.test.tsx's OWN source contains this
    // same search pattern as a string literal (for its own equivalent
    // check), which is a false-positive git-grep match on itself, not an
    // import -- excluded explicitly (pre-existing cross-file false positive,
    // found and fixed incidentally during PATCH 8AF, unrelated to that
    // patch's own comment-dead-code changes).
    const offenders = importers.filter((f) => !allowed.has(f) && f !== 'components/collabboard/commentPermissionClosure.contract.test.tsx');
    expect(offenders).toEqual([]);
  });
});
