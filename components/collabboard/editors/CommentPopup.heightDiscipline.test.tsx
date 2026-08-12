// @vitest-environment jsdom
// PATCH 8L-A -- height discipline for the canonical Clipart comment panel.
//
// Goal: the panel must be able to FIT a bounded available height without
// becoming the near-full-height panel that e782852 produced and that was
// rejected and reverted (c7113b0). The preferred appearance is unchanged --
// the comment list keeps max-h-[400px]; the only addition is a ceiling for
// when the viewport cannot accommodate that preferred size.
//
// The distinction these tests protect is shrink-only vs grow: the reverted
// patch gave the list `flex-1` (flex: 1 1 0%), which GROWS to fill its
// container. That single class is what made the panel giant. Here the list
// stays shrink-only, so it can never exceed 400px no matter how much room
// exists.
//
// jsdom has no layout engine, so these assert the CSS contract that produces
// the geometry rather than measured pixels. Live measurement at 1600x1000 on
// the running dev server accompanied this patch:
//   4 comments  -> panel 280x402, list 268 (unbounded by the cap)
//   14 comments -> panel 280x534, list 400 (capped, scrolling)
// i.e. the panel tops out at ~534px, not at viewport height.
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import CommentPopup from './CommentPopup';

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
  return { container };
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

const makeComments = (n: number): CommentData[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `c${i + 1}`,
    text: `Comment number ${i + 1}`,
    userId: 'user1',
    userName: 'Alice',
    timestamp: 1700000000000 + i,
  }));

function Harness({ count, canonical = true }: { count: number; canonical?: boolean }) {
  const [comments, setComments] = useState<CommentData[]>(makeComments(count));
  return (
    <CommentPopup
      isOpen
      onOpenChange={() => {}}
      onSubmit={(text) =>
        setComments((prev) => [
          ...prev,
          { id: `n${prev.length}`, text, userId: 'user1', userName: 'Alice', timestamp: Date.now() },
        ])
      }
      onEditComment={(id, text) => setComments((p) => p.map((c) => (c.id === id ? { ...c, text } : c)))}
      onRemoveComment={(id) => setComments((p) => p.filter((c) => c.id !== id))}
      onToggleCommentStrikethrough={() => {}}
      onCommentColor={(id, textColor, backgroundColor) =>
        setComments((p) => p.map((c) => (c.id === id ? { ...c, textColor, backgroundColor } : c)))
      }
      comments={comments}
      currentUserId="user1"
      currentUserName="Alice"
      {...(canonical ? { enableCanonicalSelectionStyling: true } : {})}
    />
  );
}

const panelOf = (c: HTMLElement) => c.querySelector('[data-comment-panel="true"]') as HTMLElement;
const listOf = (c: HTMLElement) => c.querySelector('.overflow-y-auto') as HTMLElement | null;
const headerOf = (c: HTMLElement) => c.querySelector('h4');
// The header/composer ROWS (the flex children of the panel), not the inner
// wrappers -- these are what must not shrink.
const headerRowOf = (c: HTMLElement) => headerOf(c)!.closest('div.border-b') as HTMLElement;
const composerOf = (c: HTMLElement) =>
  panelOf(c).querySelector('input[type="text"]') as HTMLInputElement | null;
const composerRowOf = (c: HTMLElement) => composerOf(c)!.closest('div.border-t') as HTMLElement;
const sendOf = (c: HTMLElement) => panelOf(c).querySelector('button[aria-label="Send"]');

describe('PATCH 8L-A -- preferred size is unchanged', () => {
  it('1 comment: list keeps its max-h-[400px] preferred bound', () => {
    const { container } = mount(<Harness count={1} />);
    const list = listOf(container)!;
    expect(list.className).toContain('max-h-[400px]');
    // No forced height -- the panel is still content-sized at this size.
    expect(panelOf(container).style.height).toBe('');
  });

  it('3 comments: identical bound, still content-sized', () => {
    const { container } = mount(<Harness count={3} />);
    expect(listOf(container)!.className).toContain('max-h-[400px]');
    expect(panelOf(container).style.height).toBe('');
    expect(panelOf(container).style.minHeight).toBe('');
  });

  it('12 comments: list still capped at 400px and scrolls internally', () => {
    const { container } = mount(<Harness count={12} />);
    const list = listOf(container)!;
    expect(list.className).toContain('max-h-[400px]');
    expect(list.className).toContain('overflow-y-auto');
    // All rows are rendered inside the scroller -- nothing is truncated away.
    expect(list.querySelectorAll('[data-comment-readonly-editor]').length).toBeGreaterThanOrEqual(12);
  });
});

describe('PATCH 8L-A -- chrome stays put', () => {
  it('header remains present with many comments', () => {
    const { container } = mount(<Harness count={12} />);
    expect(headerOf(container)).not.toBeNull();
    expect(headerOf(container)!.textContent).toContain('Comments');
  });

  it('header does not shrink when the panel is height-constrained', () => {
    const { container } = mount(<Harness count={12} />);
    expect(headerRowOf(container).className).toContain('flex-shrink-0');
  });

  it('composer remains present with many comments', () => {
    const { container } = mount(<Harness count={12} />);
    expect(composerOf(container)).not.toBeNull();
  });

  it('composer does not shrink when the panel is height-constrained', () => {
    const { container } = mount(<Harness count={12} />);
    expect(composerRowOf(container).className).toContain('flex-shrink-0');
  });

  it('Send remains present with many comments', () => {
    const { container } = mount(<Harness count={12} />);
    expect(sendOf(container)).not.toBeNull();
  });
});

describe('PATCH 8L-A -- bounded, never expanded to fill the viewport', () => {
  it('the panel caps its height rather than setting one', () => {
    const { container } = mount(<Harness count={12} />);
    const panel = panelOf(container);
    // A ceiling, not a height: the panel is still free to be smaller.
    expect(panel.style.maxHeight).toBe('calc(100vh - 16px)');
    expect(panel.style.height).toBe('');
  });

  it('the list is shrink-only -- never flex-1 (the rejected giant-panel cause)', () => {
    const { container } = mount(<Harness count={12} />);
    const list = listOf(container)!;
    expect(list.className).toContain('min-h-0');
    // These are the classes that would let it GROW into available space.
    expect(list.className).not.toContain('flex-1');
    expect(list.className).not.toContain('flex-grow');
    expect(list.className).not.toContain('max-h-none');
    expect(list.className).not.toContain('h-full');
  });

  it('the panel never requests viewport height for itself', () => {
    const { container } = mount(<Harness count={12} />);
    const panel = panelOf(container);
    expect(panel.className).not.toContain('h-screen');
    expect(panel.className).not.toContain('h-full');
    expect(panel.style.height).not.toContain('vh');
    expect(panel.style.minHeight).not.toContain('vh');
  });

  it('a large comment count does not change the ceiling', () => {
    const few = mount(<Harness count={2} />).container;
    const many = mount(<Harness count={40} />).container;
    expect(panelOf(many).style.maxHeight).toBe(panelOf(few).style.maxHeight);
    expect(listOf(many)!.className).toBe(listOf(few)!.className);
  });
});

describe('PATCH 8L-A -- existing behavior is untouched', () => {
  it('per-comment colour control is still reachable and opens its picker', () => {
    const { container } = mount(<Harness count={2} />);
    click(container.querySelectorAll('.group\\/row')[0]);
    // Colour lives in the editing action rail, alongside Link.
    click(panelOf(container).querySelector('button[title="Edit"]')!);
    const palette = panelOf(container).querySelector('button[title="Color"]');
    expect(palette).not.toBeNull();
    click(palette!);
    // The style popup portals to document.body -- it must still mount with
    // the panel under a height ceiling.
    expect(document.body.textContent).toMatch(/TEXT COLOR|HIGHLIGHT/i);
  });

  it('Link action is still reachable while editing a comment', () => {
    const { container } = mount(<Harness count={2} />);
    click(container.querySelectorAll('.group\\/row')[0]);
    const edit = panelOf(container).querySelector('button[title="Edit"]');
    expect(edit).not.toBeNull();
    click(edit!);
    expect(panelOf(container).querySelector('button[title="Link"]')).not.toBeNull();
  });

  it('submitting a comment still works with the constrained layout', () => {
    const { container } = mount(<Harness count={1} />);
    const input = composerOf(container)!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'brand new comment');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });
    expect(panelOf(container).textContent).toContain('brand new comment');
  });
});

describe('PATCH 8L-A -- non-canonical consumers are unaffected', () => {
  it('adds no height-discipline classes or styles without the canonical flag', () => {
    const { container } = mount(<Harness count={12} canonical={false} />);
    const panel = panelOf(container);
    expect(panel.style.maxHeight).toBe('');
    expect(panel.className).not.toContain('flex flex-col');
    expect(listOf(container)!.className).not.toContain('min-h-0');
    expect(headerRowOf(container).className).not.toContain('flex-shrink-0');
  });
});
