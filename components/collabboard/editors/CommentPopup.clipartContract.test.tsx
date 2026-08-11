// @vitest-environment jsdom
// PATCH 8D -- Canonical Clipart comment contract, mounted via REAL DOM
// events (createRoot + jsdom + dispatchEvent), not the mocked-useState /
// renderToStaticMarkup harness ClipartCardDraftModal.test.tsx uses. That
// harness calls handler props directly and never dispatches real DOM
// events, so it is structurally blind to propagation-based bugs (a missing
// stopPropagation, a click landing on the wrong element, etc.) -- exactly
// the class of regression PATCH 8D was asked to rule out. These two tests
// close that gap for the two flows PATCH 8D flagged as unverified by any
// existing suite: submit-keeps-the-panel-open, and a rendered link actually
// opening via the safe-link mechanism when clicked for real.
//
// Live reproduction (PATCH 8D audit, against commit 1ac73ac on the running
// dev server) found both flows -- plus the color-immediate-update flow
// already covered by CommentPopup.colorAndLink.test.tsx -- already correct.
// No production code changed for this patch.
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import CommentPopup from './CommentPopup';

// CommentPopup.tsx doesn't export its CommentData interface -- derive it the
// same way ClipartCardDraftModal.tsx does.
type CommentData = NonNullable<React.ComponentProps<typeof CommentPopup>['comments']>[number];

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
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
function btn(root: ParentNode, title: string) {
  return root.querySelector(`button[title="${title}"]`) as HTMLButtonElement | null;
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

function clickSend(root: ParentNode) {
  const send = root.querySelector('button[aria-label="Send"]') as HTMLButtonElement | null;
  expect(send).not.toBeNull();
  click(send!);
}

const baseComment: CommentData = {
  id: 'c1',
  text: 'Hello <a href="https://example.com">world</a>',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};

// Mirrors exactly how ClipartCardDraftModal.tsx wires CommentPopup: isOpen/
// comments are controlled state, onSubmit appends, onOpenChange updates the
// panel-open boolean. If submitting a comment ever caused CommentPopup to
// call onOpenChange(false) as a side effect, this harness's isOpen would
// flip and the mounted panel would unmount -- observable via real DOM.
function ClipartHarness({ onOpenChangeSpy }: { onOpenChangeSpy?: (open: boolean) => void }) {
  const [isOpen, setIsOpen] = useState(true);
  const [comments, setComments] = useState<CommentData[]>([baseComment]);
  return (
    <CommentPopup
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChangeSpy?.(open);
      }}
      onSubmit={(text) => {
        setComments((prev) => [
          ...prev,
          { id: `c${prev.length + 1}`, text, userId: 'user1', userName: 'Alice', timestamp: Date.now() },
        ]);
      }}
      onEditComment={(commentId, text) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, text } : c)));
      }}
      onRemoveComment={(commentId) => {
        setComments((prev) => prev.filter((c) => c.id !== commentId));
      }}
      onToggleCommentStrikethrough={(commentId) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, isStrikethrough: !c.isStrikethrough } : c)));
      }}
      onCommentColor={(commentId, textColor, backgroundColor) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, textColor, backgroundColor } : c)));
      }}
      comments={comments}
      currentUserId="user1"
      currentUserName="Alice"
    />
  );
}

function TitleHarness() {
  const [isOpen, setIsOpen] = useState(true);
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [titleStyle, setTitleStyle] = useState<{ color?: string; backgroundColor?: string }>({});
  return (
    <div onMouseDown={() => { throw new Error('title interaction leaked to parent'); }}>
      <button type="button" onClick={() => setIsOpen(true)}>Reopen</button>
      {isOpen && (
        <CommentPopup
          isOpen={isOpen}
          onOpenChange={setIsOpen}
          onSubmit={() => {}}
          comments={[]}
          commentTitle={title}
          commentTitleStyle={titleStyle}
          onCommentTitleChange={(next) => setTitle(next === 'Comments' ? undefined : next)}
          onCommentTitleStyleChange={setTitleStyle}
          hideComposer
          enableCanonicalSelectionStyling
        />
      )}
    </div>
  );
}

describe('CommentPopup -- Clipart contract: ADD COMMENT keeps the panel open', () => {
  it('submitting via Enter never calls onOpenChange(false), and the panel stays mounted with the new comment visible', () => {
    const onOpenChangeSpy = vi.fn();
    const { container } = mount(<ClipartHarness onOpenChangeSpy={onOpenChangeSpy} />);

    const composer = container.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    expect(composer).not.toBeNull();
    typeInto(composer, 'a real new comment');
    pressEnter(composer);

    expect(onOpenChangeSpy).not.toHaveBeenCalledWith(false);
    // The panel must still be in the DOM (not unmounted) and show the new comment.
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
    expect(container.textContent).toContain('a real new comment');
  });

  it('provides an accessible Send button beside the composer and uses the same submit behavior as Enter', () => {
    const onOpenChangeSpy = vi.fn();
    const { container } = mount(<ClipartHarness onOpenChangeSpy={onOpenChangeSpy} />);
    const composer = container.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    const send = container.querySelector('button[aria-label="Send"]') as HTMLButtonElement;

    expect(send).not.toBeNull();
    expect(send.type).toBe('button');
    expect(send.title).toBe('Send');
    expect(send.parentElement?.className).toContain('flex');
    expect(send.parentElement?.className).toContain('gap-2');
    expect(composer.className).toContain('flex-1');
    expect(composer.className).toContain('min-w-0');

    typeInto(composer, 'sent by button');
    clickSend(container);
    expect(container.textContent).toContain('sent by button');
    expect(composer.value).toBe('');
    expect(onOpenChangeSpy).not.toHaveBeenCalledWith(false);

    typeInto(composer, 'sent by enter');
    pressEnter(composer);
    expect(container.textContent).toContain('sent by enter');
    expect(composer.value).toBe('');
    expect(onOpenChangeSpy).not.toHaveBeenCalledWith(false);
  });

  it('does not submit whitespace through either Send or Enter', () => {
    const { container } = mount(<ClipartHarness />);
    const composer = container.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;

    typeInto(composer, '   ');
    clickSend(container);
    expect(container.textContent).not.toContain('   ');
    expect(composer.value).toBe('   ');

    pressEnter(composer);
    expect(composer.value).toBe('   ');
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });
});

describe('CommentPopup -- canonical panel title', () => {
  it('defaults to Comments, edits inline, commits with Enter, and keeps the title single-line', () => {
    const { container } = mount(<TitleHarness />);
    const title = container.querySelector('[data-comment-panel-title="true"]') as HTMLElement;
    expect(title.textContent).toBe('Comments');

    click(title);
    const input = container.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('text');
    typeInto(input, 'Feedback');
    pressEnter(input);
    expect(container.querySelector('[data-comment-panel-title="true"]')?.textContent).toBe('Feedback');
  });

  it('commits on blur and cancels with Escape', () => {
    const { container } = mount(<TitleHarness />);
    click(container.querySelector('[data-comment-panel-title="true"]')!);
    let input = container.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    typeInto(input, 'Discussion');
    act(() => {
      input.focus();
      input.blur();
    });
    expect(container.querySelector('[data-comment-panel-title="true"]')?.textContent).toBe('Discussion');

    click(container.querySelector('[data-comment-panel-title="true"]')!);
    input = container.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    typeInto(input, 'Discarded');
    act(() => input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(container.querySelector('[data-comment-panel-title="true"]')?.textContent).toBe('Discussion');
  });

  it('falls back to Comments for an empty title and preserves title data after close/reopen', () => {
    const { container } = mount(<TitleHarness />);
    click(container.querySelector('[data-comment-panel-title="true"]')!);
    const input = container.querySelector('input[aria-label="Comment panel title"]') as HTMLInputElement;
    typeInto(input, '   ');
    pressEnter(input);
    expect(container.querySelector('[data-comment-panel-title="true"]')?.textContent).toBe('Comments');

    click(container.querySelector('button[title="Close"]')!);
    expect(container.querySelector('[data-comment-panel-title="true"]')).toBeNull();
    click(container.querySelector('button')!);
    expect(container.querySelector('[data-comment-panel-title="true"]')?.textContent).toBe('Comments');
  });

  it('reuses TextStylePopup for whole-title text and highlight styling, immediately', () => {
    const { container } = mount(<TitleHarness />);
    click(container.querySelector('[data-comment-panel-title="true"]')!);
    expect(container.querySelector('input[aria-label="Comment panel title"]')).not.toBeNull();
    click(container.querySelector('button[aria-label="Style comment title"]')!);
    const popup = document.querySelector('[data-comment-title-style-popover="true"]') as HTMLElement;
    expect(popup).not.toBeNull();
    expect(popup.querySelector('button[title="Text Color"]')).not.toBeNull();
    expect(popup.querySelector('button[title="Highlight Color"]')).not.toBeNull();

    click(popup.querySelector('button[title="#4c6ef5"]')!);
    expect(container.querySelector('[data-comment-panel-title="true"]')?.getAttribute('style')).toContain('color: rgb(76, 110, 245)');
    click(popup.querySelector('button[title="Highlight Color"]')!);
    click(popup.querySelector('button[title="#fab005"]')!);
    expect(container.querySelector('[data-comment-panel-title="true"]')?.getAttribute('style')).toContain('background-color: rgb(250, 176, 5)');
    expect(container.querySelector('[data-comment-panel-title="true"]')?.querySelector('mark')).toBeNull();
  });
});

describe('CommentPopup -- Clipart contract: LINK opens through the safe-link mechanism', () => {
  it('clicking a rendered saved link calls window.open with target=_blank and noopener,noreferrer, and does not navigate the page', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = mount(<ClipartHarness />);

    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();

    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      anchor.dispatchEvent(event);
    });

    expect(openSpy).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener,noreferrer');
    // The click must be fully handled (preventDefault), not left to the
    // browser's default same-tab anchor navigation.
    expect(event.defaultPrevented).toBe(true);
    openSpy.mockRestore();
  });

  it('clicking a rendered link does not bubble to a parent card handler (would otherwise drag/open/select the card)', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onCardClickSpy = vi.fn();
    const { container } = mount(
      <div onClick={onCardClickSpy} onMouseDown={onCardClickSpy}>
        <ClipartHarness />
      </div>
    );

    const anchor = container.querySelector('a[href="https://example.com"]') as HTMLAnchorElement;
    act(() => {
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(onCardClickSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe('CommentPopup -- Clipart contract: full add -> edit -> color -> link -> strikethrough -> delete sequence stays on one comment, panel never closes', () => {
  it('runs the whole canonical sequence and the panel is still open and correct at the end', () => {
    const onOpenChangeSpy = vi.fn();
    const { container } = mount(<ClipartHarness onOpenChangeSpy={onOpenChangeSpy} />);

    // ADD
    const composer = container.querySelector('input[placeholder="Add a comment..."]') as HTMLInputElement;
    typeInto(composer, 'sequence test comment');
    pressEnter(composer);
    expect(container.textContent).toContain('sequence test comment');

    // Select the new row, then EDIT + STRIKETHROUGH + DELETE all target it,
    // never the pre-existing baseComment row.
    const rows = Array.from(container.querySelectorAll('.group\\/row'));
    const newRow = rows.find((r) => r.textContent?.includes('sequence test comment'))!;
    click(newRow);

    click(btn(newRow as HTMLElement, 'Strikethrough')!);
    expect(container.textContent).toContain('Hello'); // original untouched row still present
    expect(container.textContent).toContain('sequence test comment');

    click(btn(newRow as HTMLElement, 'Delete')!);
    expect(container.textContent).not.toContain('sequence test comment');
    expect(container.textContent).toContain('Hello'); // original row survives, delete was isolated

    // The panel must never have closed at any point in this sequence.
    expect(onOpenChangeSpy).not.toHaveBeenCalledWith(false);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });
});
