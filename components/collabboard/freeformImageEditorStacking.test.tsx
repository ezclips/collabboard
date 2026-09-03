// @vitest-environment jsdom
//
// R6C -- the freeform image editor's three acceptance defects.
//
// The premise R6C started from was wrong in a way worth recording: opening an
// EXISTING image post never goes near ImageEditor.tsx. openFreeformImageEditModal
// explicitly calls setIsImageEditorOpen(false) and raises imageToolbarPadletId,
// which drives a self-contained overlay rendered inside FreeformPadletCards --
// i.e. inside CanvasViewport's `isolation: isolate` boundary (PATCH 9M). That
// is why a z-[60000] overlay still painted UNDER a z-[1200] reader, and why the
// reader never yielded: nothing told it an editor was open.
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useBackdropDismiss } from '@/components/collabboard/editors/PostEditorShell';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8');
const freeform = read('components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const canvasClient = read('app/dashboard/canvas/[id]/CanvasClient.tsx');
const readerDrawer = read('components/collabboard/KnowledgeSourceReaderDrawer.tsx');
const shell = read('components/collabboard/editors/PostEditorShell.tsx');

/** Everything between an anchor and the next `count` characters of source. */
function after(source: string, anchor: string, count = 1400): string {
  const index = source.indexOf(anchor);
  expect(index, `anchor not found: ${anchor}`).toBeGreaterThan(-1);
  return source.slice(index, index + count);
}

const PORTAL_ANCHOR = '{imageToolbarPadletId && createPortal(';

/** The overlay's opening tags -- backdrop through the grid track declarations. */
const overlay = () => after(freeform, PORTAL_ANCHOR, 3200);

/** The WHOLE portalled subtree, anchor through its `document.body,` argument. */
function portalledSubtree(): string {
  const start = freeform.indexOf(PORTAL_ANCHOR);
  expect(start, 'portal anchor not found').toBeGreaterThan(-1);
  const end = freeform.indexOf('document.body,', start);
  expect(end, 'portal target not found after the anchor').toBeGreaterThan(start);
  return freeform.slice(start, end);
}

describe('T1-T6: the image editor is a blocking editor, above the reader', () => {
  it('T1: the overlay escapes the isolated canvas subtree by portalling to <body>', () => {
    // The z-index is NOT the fix and must not be treated as one: inside
    // `isolation: isolate` the whole canvas subtree paints as one atomic layer
    // at z-index:auto, so 60000 loses to any root-level sibling with a
    // positive z-index. Only leaving that subtree can win.
    expect(freeform).toContain(PORTAL_ANCHOR);
    expect(overlay()).toContain('className="fixed inset-0 z-[60000]');
    // The portal target is <body> -- the root stacking context.
    expect(portalledSubtree().length).toBeGreaterThan(0);
    expect(freeform).toContain("import { createPortal } from 'react-dom';");
  });

  it('T2: PATCH 9M\'s isolation boundary itself is untouched', () => {
    // A modal is not a canvas object. Portalling one out does not weaken the
    // guarantee that canvas objects stay contained -- and that guarantee must
    // still be expressed exactly where PATCH 9M put it.
    expect(canvasClient).toContain("isolation: 'isolate',");
    const viewportOpen = after(canvasClient, '<CanvasViewport', 2000);
    expect(viewportOpen).toContain("isolation: 'isolate',");
  });

  it('T3: opening an image post registers as a blocking editor', () => {
    const memo = after(canvasClient, 'const isBlockingEditorModalOpen = useMemo(', 1600);
    expect(memo).toContain('imageToolbarPadletId !== null');
    // And it is a real dependency, so the memo actually recomputes.
    expect(memo).toContain('isClipartDraftModalOpen, imageToolbarPadletId,');
  });

  it('T4: the reader yields to that flag through the SAME shared authority', () => {
    // No second ladder, no isImageEditorOpen special case inside the reader.
    // R6D widened what the drawer is handed -- isBlockingOverlayOpen is
    // isBlockingEditorModalOpen plus the image subtool modals -- but it is
    // still ONE flag, computed in one place, for every docked surface.
    expect(canvasClient).toContain('blockingEditorOpen={isBlockingOverlayOpen}');
    expect(canvasClient).toContain(
      'const isBlockingOverlayOpen = isBlockingEditorModalOpen || isImageSubtoolModalOpen;',
    );
    expect(readerDrawer).toContain('const sidePanelBelowEditor = !isWorkspace && blockingEditorOpen;');
    expect(readerDrawer).toContain('style={sidePanelBelowEditor ? { zIndex: 900 } : undefined}');
    for (const forbidden of ['imageToolbarPadletId', 'isImageEditorOpen']) {
      expect(readerDrawer, forbidden).not.toContain(forbidden);
    }
  });

  it('T5: closing the editor restores the reader, because the flag is derived', () => {
    // imageToolbarPadletId returns to null on close, so nothing is "restored"
    // by hand -- the yield is a pure function of the open state.
    expect(freeform).toContain('setImageToolbarPadletId(null)');
    expect(readerDrawer).toContain("data-knowledge-reader-below-editor={sidePanelBelowEditor ? 'true' : 'false'}");
  });

  it('T6: the workspace reader keeps its own unchanged yield behaviour', () => {
    expect(readerDrawer).toContain('const yieldsToEditor = isWorkspace && blockingEditorOpen;');
  });
});

/**
 * R6E-C1. The comment panel's placement is asserted as GEOMETRY, not as class
 * names.
 *
 * R6E reported "comment adjacent: PASS" while the user's browser showed the
 * panel pinned to the right of the screen -- because the old T7/T8 asserted
 * only that the right grid TRACK was declared `justify-start`. That was true,
 * and irrelevant: the panel opted out of the track entirely with
 * `absolute left-full`, whose containing block is the `relative grid` row --
 * a `calc(100vw - 80px)` box. `left: 100%` of that is the viewport's right
 * edge. A structural test can never catch that, because every structure it
 * inspected was correct.
 *
 * So the layout is resolved instead: parse what the source actually declares,
 * then compute where a browser would put the panel under the same
 * containing-block rules. A viewport-anchored declaration yields a
 * viewport-anchored number, and fails.
 */

/** The declared inputs of the overlay's layout, read from the real source. */
const LAYOUT = {
  /** `width: calc(100vw - 80px)` on the grid row -- 40px each side. */
  inset: 80,
  /** `gap-6`. */
  gap: 24,
  /** The image card's fixed width. */
  cardWidth: 360,
  /** The comment wrapper's declared width. */
  panelWidth: 300,
} as const;

/** The comment panel's wrapper: its opening tag, straight from the source. */
function commentWrapperTag(): string {
  const subtree = portalledSubtree();
  const popup = subtree.indexOf('<CommentPopup');
  expect(popup, 'the overlay renders no CommentPopup').toBeGreaterThan(-1);
  // Walk back to the wrapper element that opens immediately before it.
  const open = subtree.lastIndexOf('<div', popup);
  expect(open, 'no wrapper element before the CommentPopup').toBeGreaterThan(-1);
  // Comments are prose, not declarations -- and this wrapper's own comment
  // names the very classes the contract below forbids.
  return subtree.slice(open, popup).replace(/\/\*[\s\S]*?\*\//g, '');
}

type Placement =
  /** `position: absolute` resolved against an ancestor's box. */
  | { mode: 'anchored-to-containing-block'; marginLeft: number }
  /** A normal in-flow child of its grid track. */
  | { mode: 'in-flow' };

/** How the source declares the panel to be placed. */
function declaredPlacement(tag: string): Placement {
  const className = /className="([^"]*)"/.exec(tag)?.[1] ?? '';
  const classes = className.split(/\s+/);
  const isAbsolute = classes.includes('absolute') || classes.includes('fixed');
  if (!isAbsolute) return { mode: 'in-flow' };
  // Tailwind's inset utilities are what pick the containing block's edge.
  const ml = /(?:^|\s)ml-(\d+)(?:\s|$)/.exec(className);
  return { mode: 'anchored-to-containing-block', marginLeft: ml ? Number(ml[1]) * 4 : 0 };
}

/**
 * Where the panel's left edge lands, for a given viewport, under the layout
 * the source declares. This mirrors the browser: the grid row is the nearest
 * positioned ancestor (it is `relative`), so an absolutely positioned child
 * measures from the ROW's box -- which spans the viewport -- while an in-flow
 * child starts at its `justify-start` track's leading edge, one gap after the
 * card.
 */
function resolveLayout(viewportWidth: number) {
  const rowLeft = LAYOUT.inset / 2;
  const rowWidth = viewportWidth - LAYOUT.inset;
  // 1fr | auto | 1fr: the flanking tracks split what the card and gaps leave.
  const flankingTrack = (rowWidth - LAYOUT.cardWidth - 2 * LAYOUT.gap) / 2;
  const cardLeft = rowLeft + flankingTrack + LAYOUT.gap;
  const cardRight = cardLeft + LAYOUT.cardWidth;
  const rightTrackLeft = cardRight + LAYOUT.gap;

  const placement = declaredPlacement(commentWrapperTag());
  const commentLeft =
    placement.mode === 'in-flow' ? rightTrackLeft : rowLeft + rowWidth + placement.marginLeft;

  return {
    placement,
    cardLeft,
    cardRight,
    commentLeft,
    commentRight: commentLeft + LAYOUT.panelWidth,
    viewportRight: viewportWidth,
  };
}

describe('T7-T13: the comment panel sits beside the editor, not at the viewport edge', () => {
  it('the layout inputs this contract computes from are the ones the source declares', () => {
    // If any of these drift, the numbers below stop describing the real
    // overlay -- so they are asserted rather than assumed.
    const grid = overlay();
    expect(grid).toContain("gridTemplateColumns: '1fr auto 1fr'");
    expect(grid).toContain('gap-6');
    expect(grid).toContain("width: 'calc(100vw - 80px)'");
    expect(freeform).toContain("style={{ width: '360px', backgroundColor:");
    // The right track start-aligns its content, which is what makes an
    // in-flow panel land at the card's edge rather than the track's middle.
    expect(freeform).toContain('<div className="flex items-start justify-start" style={{ pointerEvents: \'none\' }}>');
    expect(commentWrapperTag()).toContain("width: '300px'");
  });

  it('T7: the panel is placed by the grid, not resolved against a viewport-sized box', () => {
    // THE regression guard. `absolute left-full` reads like "beside my box"
    // but resolves against the viewport-wide `relative grid` row.
    const tag = commentWrapperTag();
    expect(declaredPlacement(tag).mode).toBe('in-flow');
    for (const anchor of ['absolute', 'fixed', 'left-full', 'right-0', 'right-full']) {
      expect(tag, `comment wrapper must not use ${anchor}`).not.toContain(anchor);
    }
    expect(tag).not.toContain('100vw');
  });

  it('T8: expected gap -- the panel begins exactly one gap-6 after the card', () => {
    // The prompt's mocked bounds: card left 300, width 360, right 660, so the
    // panel's left edge must be 684.
    const MOCK_VIEWPORT = 960; // chosen so the card lands at exactly 300
    const l = resolveLayout(MOCK_VIEWPORT);
    expect(l.cardLeft).toBe(300);
    expect(l.cardRight).toBe(660);
    expect(l.commentLeft).toBe(684);
    expect(l.commentLeft - l.cardRight).toBe(LAYOUT.gap);
  });

  it('T8b: the gap holds at every viewport width, because it is not viewport-derived', () => {
    // An anchored panel's left edge is a function of the viewport; an in-flow
    // one is a function of the card. Only the latter is invariant.
    for (const viewportWidth of [960, 1280, 1440, 1920, 2560]) {
      const l = resolveLayout(viewportWidth);
      expect(l.commentLeft - l.cardRight, `at ${viewportWidth}px`).toBe(LAYOUT.gap);
    }
  });

  it('T10: the panel is not anchored to the viewport right edge', () => {
    const VIEWPORT = 1440;
    const l = resolveLayout(VIEWPORT);
    // Neither of the two shapes "far right" takes: flush to the edge, or
    // hanging off it.
    expect(l.commentLeft).not.toBe(l.viewportRight - LAYOUT.panelWidth);
    expect(l.commentLeft).not.toBe(l.viewportRight);
    expect(l.commentLeft).toBeLessThan(l.viewportRight - LAYOUT.panelWidth);
    // ...and it is wholly on screen.
    expect(l.commentRight).toBeLessThanOrEqual(l.viewportRight);
    expect(l.commentLeft).toBe(924); // card right 900 + 24
  });

  it('T9,T11: the panel cannot overlap the card, and the card cannot overlap it', () => {
    for (const viewportWidth of [1280, 1440, 1920]) {
      const l = resolveLayout(viewportWidth);
      expect(l.commentLeft, `at ${viewportWidth}px`).toBeGreaterThanOrEqual(l.cardRight);
    }
  });

  it('the card keeps R6C no-shift behaviour -- opening the panel does not move it', () => {
    // The equal 1fr flanking tracks are why. This is R6C's fix and it stays:
    // the card's position is a function of the viewport alone, never of what
    // is open beside it.
    const withPanel = resolveLayout(1440);
    expect(withPanel.cardLeft).toBe(540);
    expect(withPanel.cardRight).toBe(900);
  });

  it('T12: the whole comment system rides above the reader with the editor', () => {
    // It is inside the portalled overlay, so it inherits the escape rather
    // than needing a z-index of its own.
    expect(portalledSubtree()).toContain('<CommentPopup');
  });

  it('T13: closing the comment panel does not close the editor', () => {
    // This overlay's OWN CommentPopup -- identified by the padlet it reads --
    // clears only the comment popup id. The editor is separate state.
    const subtree = portalledSubtree();
    const popup = subtree.slice(subtree.indexOf('<CommentPopup'));
    const close = popup.slice(popup.indexOf('onOpenChange={(open) => {'), popup.indexOf('commentTitle='));
    expect(close).toContain('setCardCommentPopupPadletId(null)');
    expect(close).not.toContain('setImageToolbarPadletId(null)');
  });
});

// --- T14-T20: the first title interaction must not dismiss the editor -------

let host: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  act(() => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
});

/** The overlay's real shape: a backdrop with an inner panel that reflows. */
function Harness({ onDismiss }: { onDismiss: () => void }) {
  const dismiss = useBackdropDismiss(onDismiss);
  const [wide, setWide] = React.useState(false);
  return (
    <div data-testid="backdrop" {...dismiss} style={{ position: 'fixed', inset: 0 }}>
      <div data-testid="panel" onClick={(e) => e.stopPropagation()}>
        <input
          data-testid="title"
          // Exactly what the real Title does: focusing it re-targets the style
          // panel, which reflows the centred grid under the pointer.
          onFocus={() => setWide(true)}
          style={{ width: wide ? 400 : 200 }}
        />
      </div>
      {/* The comment panel's real wrapper: a track sibling of the card that
          stops both click and mousedown, exactly as the overlay declares. */}
      <div
        data-testid="comment"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <textarea data-testid="comment-input" />
      </div>
    </div>
  );
}

function mountHarness() {
  const onDismiss = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root!.render(<Harness onDismiss={onDismiss} />); });
  const q = (id: string) => host!.querySelector(`[data-testid="${id}"]`) as HTMLElement;
  return {
    onDismiss,
    backdrop: q('backdrop'),
    panel: q('panel'),
    title: q('title'),
    comment: q('comment'),
    commentInput: q('comment-input') as HTMLTextAreaElement,
  };
}

/** A press that begins on `from` and is released over `over`. The browser
 *  retargets the resulting click to the nearest common ancestor. */
function press(from: HTMLElement, clickTarget: HTMLElement) {
  act(() => {
    from.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    clickTarget.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('T14-T20: fresh first title interaction never closes the editor', () => {
  it('T14: clicking into the title leaves the editor open', () => {
    const h = mountHarness();
    press(h.title, h.title);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T15: the reflow that focus causes cannot retarget the click into a dismissal', () => {
    // THE reported defect: focus widens the panel, the centred layout moves out
    // from under the pointer, mouseup lands on the backdrop, and the browser
    // dispatches the click on the common ancestor -- the backdrop itself.
    const h = mountHarness();
    act(() => { h.title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); });
    act(() => { h.title.focus(); });
    act(() => { h.backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T16: drag-selecting the title text and releasing outside does not close it', () => {
    const h = mountHarness();
    press(h.title, h.backdrop);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T17: a press beginning anywhere inside the panel is never a dismissal', () => {
    const h = mountHarness();
    press(h.panel, h.backdrop);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('T18: it stays reliable across repeated interactions -- no stale origin', () => {
    const h = mountHarness();
    // A genuine backdrop press first, then an inside press: the second must not
    // inherit the first's authorisation, and vice versa.
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    press(h.title, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(2);
  });

  it('T19: a genuine backdrop click still closes it -- the fix is not a disabled dismissal', () => {
    const h = mountHarness();
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });

  it('T20: a click released over the panel is not a dismissal either', () => {
    const h = mountHarness();
    press(h.backdrop, h.panel);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('the overlay uses this shared authority rather than its own onClick', () => {
    // The old naive backdrop is what produced the defect; it must be gone.
    expect(overlay()).toContain('{...imageOverlayBackdropDismiss}');
    expect(overlay()).not.toContain('onClick={() => setImageToolbarPadletId(null)}');
    expect(freeform).toContain('useBackdropDismiss(');
    // One implementation, shared with every PostEditorShell editor.
    expect(shell).toContain('export function useBackdropDismiss(');
    expect((freeform.match(/pressBeganOnBackdrop/g) ?? [])).toHaveLength(0);
  });
});

// --- R6E-C1: using the comment panel must not tear the editor down ---------

describe('R6E-C1: comment interaction leaves the image editor open', () => {
  it('focusing the comment input does not dismiss the editor', () => {
    const h = mountHarness();
    act(() => { h.commentInput.focus(); });
    expect(h.commentInput.ownerDocument.activeElement).toBe(h.commentInput);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('typing a comment does not dismiss the editor', () => {
    const h = mountHarness();
    act(() => { h.commentInput.focus(); });
    for (const key of ['h', 'i', 'Enter', ' ']) {
      act(() => {
        h.commentInput.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
        h.commentInput.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
      });
    }
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('a press that begins in the comment panel is never a dismissal', () => {
    // Drag-selecting comment text and releasing over the backdrop is the same
    // retargeting hazard the title had -- the panel must be covered too.
    const h = mountHarness();
    press(h.commentInput, h.backdrop);
    expect(h.onDismiss).not.toHaveBeenCalled();
    press(h.comment, h.backdrop);
    expect(h.onDismiss).not.toHaveBeenCalled();
  });

  it('the backdrop still dismisses after the comment panel has been used', () => {
    // The fix must not be "dismissal disabled once a panel is open".
    const h = mountHarness();
    press(h.commentInput, h.commentInput);
    expect(h.onDismiss).not.toHaveBeenCalled();
    press(h.backdrop, h.backdrop);
    expect(h.onDismiss).toHaveBeenCalledTimes(1);
  });
});
