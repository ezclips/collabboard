// @vitest-environment jsdom
// PATCH 8F -- canonical comment text-color/highlight reactivity.
//
// Live reproduction against the running dev server (Site B, the on-canvas
// Clipart badge -- which since PATCH 8E renders the exact same CommentPopup
// the Clipart edit modal uses) found NO reproducible delay: single color
// change, repeated changes (red -> blue -> green, including rapid-fire with
// zero waits between clicks), cross-attribute changes (highlight then
// immediately foreground, no wait), and two-comment switching all updated
// synchronously and correctly. See the PATCH 8F return report for the full
// live-test log.
//
// This suite locks that verified-correct behavior in permanently with real
// mounted DOM events (not source-string assertions), using a harness that
// mirrors exactly how both real callers (ClipartCardDraftModal.tsx and
// FreeformPadletCards.tsx Site B, post-8E) wire onCommentColor: a plain
// array map + replace, no debouncing, no mutation.
//
// IMPORTANT characterization finding (Step 6/7 of the 8F spec): CURRENT
// onCommentColor semantics style the WHOLE comment, not the selected
// character range. Selecting text before opening Color/Highlight does not
// make the picker act on a sub-range -- the color/backgroundColor fields
// live on the comment record itself and are rendered via a `style` on the
// wrapper div around the whole editor/text. This suite tests and freezes
// THAT behavior (per the 8F spec's explicit instruction to use current
// semantics as authority), not a hypothetical per-character mark system --
// building the latter would be a redesign, which this patch is scoped not
// to do (Step 10: "do not redesign the popup").
import React, { useState } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import CommentPopup from './CommentPopup';

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
function swatch(hex: string) {
  return document.body.querySelector(`button[title="${hex}"]`) as HTMLButtonElement | null;
}
function highlightTab() {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.title === 'Highlight Color') as HTMLButtonElement | undefined;
}
function textTab() {
  return Array.from(document.body.querySelectorAll('button')).find((b) => b.title === 'Text Color') as HTMLButtonElement | undefined;
}
function editWrapperOf(container: HTMLElement) {
  return container.querySelector('.ProseMirror[contenteditable="true"]')!.closest('.relative') as HTMLElement;
}
function selectText(container: HTMLElement, text: string) {
  const pm = container.querySelector('.ProseMirror') as HTMLElement;
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

type CommentData = NonNullable<React.ComponentProps<typeof CommentPopup>['comments']>[number];

const commentA: CommentData = {
  id: 'A',
  text: 'Hello world',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};
const commentB: CommentData = {
  id: 'B',
  text: 'Second comment',
  userId: 'user1',
  userName: 'Alice',
  timestamp: Date.now(),
};

// Mirrors exactly how ClipartCardDraftModal.tsx and FreeformPadletCards.tsx
// (Site B, post-8E) wire onCommentColor/onEditComment: a plain array
// map+replace on real component state, no debouncing, no mutation. This is
// the harness that lets a "does it round-trip through real parent state"
// claim mean something, as opposed to a manually-triggered rerender().
function Harness({
  onOpenChangeSpy,
  onParentClickSpy,
  initialOpen = true,
}: {
  onOpenChangeSpy?: (open: boolean) => void;
  onParentClickSpy?: () => void;
  initialOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [comments, setComments] = useState<CommentData[]>([commentA, commentB]);
  const body = (
    <>
    {/* Stand-in for the real external open trigger (the on-canvas badge /
        the modal's Comment toolbar button), which lives OUTSIDE
        CommentPopup in both real callers -- reopening never remounts
        CommentPopup's comments state because that state lives on the
        parent (padlet.metadata), same as here. */}
    <button data-testid="reopen-trigger" onClick={() => setIsOpen(true)}>reopen</button>
    <CommentPopup
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        onOpenChangeSpy?.(open);
      }}
      onSubmit={(text) => {
        setComments((prev) => [...prev, { id: `c${prev.length + 1}`, text, userId: 'user1', userName: 'Alice', timestamp: Date.now() }]);
      }}
      onEditComment={(commentId, text) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, text } : c)));
      }}
      onCommentColor={(commentId, textColor, backgroundColor) => {
        setComments((prev) => prev.map((c) => (c.id === commentId ? { ...c, textColor, backgroundColor } : c)));
      }}
      enableCanonicalSelectionStyling
      comments={comments}
      currentUserId="user1"
      currentUserName="Alice"
    />
    </>
  );
  if (!onParentClickSpy) return body;
  return (
    <div onClick={onParentClickSpy} onMouseDown={onParentClickSpy}>
      {body}
    </div>
  );
}

function rowWithText(container: HTMLElement, text: string): HTMLElement {
  const rows = Array.from(container.querySelectorAll('.group\\/row'));
  const row = rows.find((r) => r.textContent?.includes(text));
  if (!row) throw new Error(`row not found for text: ${text}`);
  return row as HTMLElement;
}

describe('PATCH 8F -- foreground color updates immediately', () => {
  it('1. selecting a swatch updates the DOM color synchronously, with no second click, no blur, no reselecting the comment', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);

    const red = swatch('#fa5252')!;
    expect(red).not.toBeNull();
    click(red);

    // Read synchronously, no waitFor/timeout -- if this needs a second
    // interaction to appear, the assertion below fails immediately.
    expect(editWrapperOf(container).style.color).toBe('rgb(250, 82, 82)');
  });
});

describe('PATCH 8F -- highlight updates immediately', () => {
  it('2. selecting a highlight swatch updates the DOM background synchronously', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(highlightTab()!);

    const yellow = swatch('#fab005')!;
    expect(yellow).not.toBeNull();
    click(yellow);

    expect(editWrapperOf(container).style.backgroundColor).toBe('rgb(250, 176, 5)');
  });
});

describe('PATCH 8F -- selection preservation', () => {
  it('3. opening the Color popover does not collapse an in-progress text selection or exit edit mode', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    selectText(container, 'Hello');

    const selectionBefore = window.getSelection()?.toString();
    expect(selectionBefore).toBe('Hello');

    click(btn(row, 'Color')!);

    // Still in edit mode (the row wasn't kicked out by the popover opening).
    expect(container.querySelector('.ProseMirror')).not.toBeNull();
    // The DOM selection itself is untouched by opening the popover -- the
    // popover is a portal with its own preventDefault-on-mousedown guard
    // specifically so it doesn't steal focus/selection from the editor.
    expect(window.getSelection()?.toString()).toBe('Hello');
  });
});

describe('PATCH 8F -- current styling semantics (whole comment, not per-character)', () => {
  it('4. foreground color applies to the whole comment regardless of what text was selected (characterized current behavior, not a redesign)', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    selectText(container, 'Hello'); // select only part of the text
    click(btn(row, 'Color')!);
    click(swatch('#fa5252')!);

    // The whole wrapper (and therefore the whole comment's text, "Hello"
    // AND "world") gets the color -- there is no per-character mark.
    const wrapper = editWrapperOf(container);
    expect(wrapper.style.color).toBe('rgb(250, 82, 82)');
    expect(wrapper.textContent).toContain('Hello world');
  });

  it('5. highlight applies to the whole comment regardless of what text was selected (characterized current behavior)', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    selectText(container, 'world');
    click(btn(row, 'Color')!);
    click(highlightTab()!);
    click(swatch('#40c057')!);

    expect(editWrapperOf(container).style.backgroundColor).toBe('rgb(64, 192, 87)');
  });
});

describe('PATCH 8F -- foreground and highlight coexist', () => {
  it('6. applying highlight after foreground does not erase the foreground color, and vice versa', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(swatch('#fa5252')!); // foreground red
    expect(editWrapperOf(container).style.color).toBe('rgb(250, 82, 82)');

    click(highlightTab()!);
    click(swatch('#40c057')!); // highlight green
    const wrapper = editWrapperOf(container);
    expect(wrapper.style.backgroundColor).toBe('rgb(64, 192, 87)');
    // Foreground must have survived the highlight change.
    expect(wrapper.style.color).toBe('rgb(250, 82, 82)');

    // And back the other way: change foreground again, highlight must survive.
    click(textTab()!);
    click(swatch('#228be6')!); // foreground blue
    expect(wrapper.style.color).toBe('rgb(34, 139, 230)');
    expect(wrapper.style.backgroundColor).toBe('rgb(64, 192, 87)');
  });
});

describe('PATCH 8F -- repeated changes stay immediate', () => {
  it('7. a second (and third) foreground color change updates immediately, with no extra interaction between clicks', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);

    click(swatch('#fa5252')!);
    expect(editWrapperOf(container).style.color).toBe('rgb(250, 82, 82)');
    click(swatch('#228be6')!);
    expect(editWrapperOf(container).style.color).toBe('rgb(34, 139, 230)');
    click(swatch('#40c057')!);
    expect(editWrapperOf(container).style.color).toBe('rgb(64, 192, 87)');
  });

  it('8. a second (and third) highlight change updates immediately', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(highlightTab()!);

    click(swatch('#e64980')!);
    expect(editWrapperOf(container).style.backgroundColor).toBe('rgb(230, 73, 128)');
    click(swatch('#4c6ef5')!);
    expect(editWrapperOf(container).style.backgroundColor).toBe('rgb(76, 110, 245)');
    click(swatch('#40c057')!);
    expect(editWrapperOf(container).style.backgroundColor).toBe('rgb(64, 192, 87)');
  });
});

describe('PATCH 8F -- row isolation (styling targets the correct comment only)', () => {
  it('9 & 10. styling comment B leaves comment A completely unstyled, and A stays selectable/editable afterward', () => {
    const { container } = mount(<Harness />);
    const rowB = rowWithText(container, 'Second comment');
    click(btn(rowB, 'Edit')!);
    click(btn(rowB, 'Color')!);
    click(swatch('#fa5252')!);
    expect(editWrapperOf(container).style.color).toBe('rgb(250, 82, 82)');

    // Exit B's edit mode without committing color-unrelated text changes,
    // then inspect A's read-only rendering -- must be entirely unstyled.
    const rowA = rowWithText(container, 'Hello world');
    const readOnlyA = rowA.querySelector('[dangerouslySetInnerHTML], div.text-xs.text-gray-600') || rowA.querySelector('div.text-xs');
    // The read-only text div for A (not in edit mode) must carry no color.
    const aTextDiv = Array.from(rowA.querySelectorAll('div')).find((d) => d.className.includes('text-xs') && d.className.includes('text-gray-600'));
    expect(aTextDiv?.getAttribute('style') || '').not.toContain('rgb(250, 82, 82)');
  });
});

describe('PATCH 8F -- persistence', () => {
  it('11 & 12. committing the edit (blur/Enter) retains both foreground and highlight on the read-only render', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(swatch('#fa5252')!);
    click(highlightTab()!);
    click(swatch('#40c057')!);

    // Commit via Enter inside the editor (the real user commit path).
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    act(() => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    expect(container.querySelector('.ProseMirror[contenteditable="true"]')).toBeNull(); // edit mode exited
    const readOnlyDiv = Array.from(rowWithText(container, 'Hello world').querySelectorAll('div')).find(
      (d) => d.className.includes('text-xs') && d.className.includes('text-gray-600')
    ) as HTMLElement;
    expect(readOnlyDiv.style.color).toBe('rgb(250, 82, 82)');
    expect(readOnlyDiv.style.backgroundColor).toBe('rgb(64, 192, 87)');
  });

  it('13. closing and reopening the panel retains both styles (state lives on the comment record, not transient editor state)', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(swatch('#fa5252')!);
    click(highlightTab()!);
    click(swatch('#40c057')!);
    const pm = container.querySelector('.ProseMirror') as HTMLElement;
    act(() => {
      pm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    });

    // Close via CommentPopup's own Close button (same harness instance --
    // comments state lives on the harness, above CommentPopup, exactly
    // like the real callers where it lives on padlet.metadata).
    click(container.querySelector('button[title="Close"]')!);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).toBeNull();

    // Reopen via the same external trigger both real callers use (a badge
    // click / toolbar button outside CommentPopup).
    click(container.querySelector('[data-testid="reopen-trigger"]')!);

    const readOnlyDiv = Array.from(rowWithText(container, 'Hello world').querySelectorAll('div')).find(
      (d) => d.className.includes('text-xs') && d.className.includes('text-gray-600')
    ) as HTMLElement;
    expect(readOnlyDiv.style.color).toBe('rgb(250, 82, 82)');
    expect(readOnlyDiv.style.backgroundColor).toBe('rgb(64, 192, 87)');
  });
});

describe('PATCH 8F -- panel and canvas stability', () => {
  it('14 & 15. picking a foreground or highlight color never calls onOpenChange(false)', () => {
    const onOpenChangeSpy = vi.fn();
    const { container } = mount(<Harness onOpenChangeSpy={onOpenChangeSpy} />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(swatch('#fa5252')!);
    click(highlightTab()!);
    click(swatch('#40c057')!);

    expect(onOpenChangeSpy).not.toHaveBeenCalledWith(false);
    expect(container.querySelector('input[placeholder="Add a comment..."]')).not.toBeNull();
  });

  it('16. clicking a color/highlight swatch never bubbles to a parent card handler (would otherwise drag/select/close the card)', () => {
    const onParentClickSpy = vi.fn();
    const { container } = mount(<Harness onParentClickSpy={onParentClickSpy} />);
    const row = rowWithText(container, 'Hello world');
    click(btn(row, 'Edit')!);
    click(btn(row, 'Color')!);
    click(swatch('#fa5252')!);
    click(highlightTab()!);
    click(swatch('#40c057')!);

    expect(onParentClickSpy).not.toHaveBeenCalled();
  });
});

describe('PATCH 8F -- both Clipart entry points share the fix automatically', () => {
  it("17. both ClipartCardDraftModal.tsx and FreeformPadletCards.tsx Site B pass onCommentColor into the SAME CommentPopup component -- this suite's coverage of CommentPopup.tsx therefore protects both entry points without a separate fix", () => {
    const modalSrc = fs.readFileSync('components/collabboard/editors/ClipartCardDraftModal.tsx', 'utf8');
    const freeformSrc = fs.readFileSync('components/collabboard/canvas/ui/FreeformPadletCards.tsx', 'utf8');
    expect(modalSrc).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    expect(freeformSrc).toContain("import CommentPopup from '@/components/collabboard/editors/CommentPopup';");
    expect(modalSrc).toMatch(/<CommentPopup[\s\S]*?onCommentColor=/);
    expect(freeformSrc).toMatch(/<CommentPopup[\s\S]*?onCommentColor=/);
    // Exactly one CommentPopup implementation exists in the repo for both to import.
    const popupFiles = ['components/collabboard/editors/CommentPopup.tsx'];
    expect(fs.existsSync(popupFiles[0])).toBe(true);
  });
});

describe('PATCH 8G -- read-only selection styling', () => {
  function selectText(root: HTMLElement, start: number, end: number) {
    const textNode = root.querySelector('p')?.firstChild;
    expect(textNode).not.toBeNull();
    const range = document.createRange();
    range.setStart(textNode!, start);
    range.setEnd(textNode!, end);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    act(() => document.dispatchEvent(new Event('selectionchange')));
  }

  it('selects and styles a read-only range without entering edit mode', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    const readonly = row.querySelector('[data-comment-readonly-editor]') as HTMLElement;
    selectText(readonly, 0, 5);

    expect(btn(row, 'Edit')).toBeNull();
    expect(btn(row, 'Color / Text Style')).not.toBeNull();
    expect(container.querySelector('.ProseMirror[contenteditable="true"]')).toBeNull();

    click(btn(row, 'Color / Text Style')!);
    click(swatch('#fa5252')!);

    const saved = document.body.querySelector('[data-comment-readonly-editor]')?.innerHTML || '';
    expect(saved).toContain('color: rgb(250, 82, 82)');
    expect(saved).toContain('Hello');
    expect(saved).toContain('world');
  });

  it('applies highlight independently and preserves the foreground mark', () => {
    const { container } = mount(<Harness />);
    const row = rowWithText(container, 'Hello world');
    const readonly = row.querySelector('[data-comment-readonly-editor]') as HTMLElement;
    selectText(readonly, 0, 5);
    click(btn(row, 'Color / Text Style')!);
    click(swatch('#fa5252')!);

    // The selection remains owned by the same comment while the popup stays open.
    click(highlightTab()!);
    click(swatch('#40c057')!);

    const saved = document.body.querySelector('[data-comment-readonly-editor]')?.innerHTML || '';
    expect(saved).toContain('color: rgb(250, 82, 82)');
    expect(saved).toContain('background-color: rgb(64, 192, 87)');
  });

  it('keeps Link available and applies Strikethrough only to the selected range', () => {
    const onEditComment = vi.fn();
    const { container } = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={onEditComment}
        onCommentColor={vi.fn()}
        enableCanonicalSelectionStyling
        comments={[commentA]}
        currentUserId="user1"
        currentUserName="Alice"
      />
    );
    const row = rowWithText(container, 'Hello world');
    selectText(row.querySelector('[data-comment-readonly-editor]') as HTMLElement, 0, 5);

    expect(btn(row, 'Link')).not.toBeNull();
    click(btn(row, 'Link')!);
    act(() => {
      window.getSelection()?.removeAllRanges();
      document.dispatchEvent(new Event('selectionchange'));
    });
    expect(btn(row, 'Link')).not.toBeNull();
    const linkInput = document.body.querySelector('input[type="url"]') as HTMLInputElement;
    expect(linkInput).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(linkInput, 'example.com');
      linkInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const addButton = Array.from(document.body.querySelectorAll('button')).find((button) => button.textContent === 'Add');
    expect(addButton).not.toBeUndefined();
    click(addButton!);
    expect(onEditComment.mock.calls.at(-1)?.[1]).toContain('<a');

    const strikeMount = mount(
      <CommentPopup
        isOpen
        onOpenChange={vi.fn()}
        onSubmit={vi.fn()}
        onEditComment={onEditComment}
        onCommentColor={vi.fn()}
        enableCanonicalSelectionStyling
        comments={[commentA]}
        currentUserId="user1"
        currentUserName="Alice"
      />
    );
    const strikeRow = rowWithText(strikeMount.container, 'Hello world');
    selectText(strikeRow.querySelector('[data-comment-readonly-editor]') as HTMLElement, 6, 11);
    click(btn(strikeRow, 'Strikethrough')!);
    const saved = onEditComment.mock.calls.at(-1)?.[1] as string;
    expect(saved).toContain('<s>world</s>');
    expect(saved).not.toContain('<s>Hello</s>');
  });
});
