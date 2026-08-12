// PATCH 8M -- fixed card-relative anchor for the saved-Clipart (Site B)
// comment panel.
//
// Context: PATCH 8L-B moved this panel to viewport-space positioning
// (portaled to document.body, `position: fixed`, placement computed via
// computePopoverPlacement/useAnchoredPopover). The user rejected that
// experiment -- reported symptom: the panel visibly traveled/faded in from
// the upper-left before landing beside the card, caused by the async
// measure-then-position sequence (mount at {left:-9999,top:-9999,opacity:0}
// -> layout effect measures the card -> re-render at the resolved
// coordinates). PATCH 8M reverts Site B to the simple, purely-CSS
// `absolute left-full top-0 ml-3` anchor it used before 8L-B and that
// PATCH 8L-A (bdebed5, comment-list height discipline) was built against.
// That anchor requires no measurement and no JS positioning step at all, so
// there is no intermediate frame to travel from -- the panel is born at its
// final position in the same paint the card is.
//
// Diff-verified against bdebed5 (the last commit before 8L-B): this file's
// only production change from that baseline is a trailing-whitespace fix on
// an unrelated comment line. FreeformPadletCards.tsx is a 6.8k-line file
// that cannot be mounted directly in this suite (established convention,
// see freeformCommentUIContract.characterization.test.tsx) -- these are
// source-level characterization assertions, the same technique used
// throughout that file.
import fs from 'fs';
import { describe, expect, it } from 'vitest';

const FREEFORM_PATH = 'components/collabboard/canvas/ui/FreeformPadletCards.tsx';
const COMMENT_POPUP_PATH = 'components/collabboard/editors/CommentPopup.tsx';

function readFreeform(): string {
  return fs.readFileSync(FREEFORM_PATH, 'utf8');
}

function siteBBlock(src: string): string {
  const start = src.indexOf('{cardCommentPopupPadletId === padlet.id && !cardToolbarPadletId && (');
  expect(start, 'Site B block must exist').toBeGreaterThan(-1);
  const commentPopupStart = src.indexOf('<CommentPopup', start);
  expect(commentPopupStart, 'Site B block must contain <CommentPopup').toBeGreaterThan(start);
  // Through the CommentPopup element's own closing `/>`, not a fixed char count.
  const end = src.indexOf('/>', commentPopupStart);
  expect(end, 'CommentPopup element must close').toBeGreaterThan(commentPopupStart);
  return src.slice(start, end + 2);
}

describe('PATCH 8M -- Site B is a simple card-relative anchor, not viewport-positioned', () => {
  it('wraps CommentPopup in a plain absolute div, not a portal or measurement shell', () => {
    const block = siteBBlock(readFreeform());
    expect(block).toMatch(/className="absolute left-full top-0 ml-3/);
    // The specific mechanisms PATCH 8L-B introduced and 8M removes.
    expect(block).not.toContain('createPortal');
    expect(block).not.toContain('ViewportAnchoredCommentShell');
    expect(block).not.toContain('position: fixed');
    expect(block).not.toContain("className=\"fixed");
  });

  it('top of Comments aligns with top of the card (top-0)', () => {
    expect(siteBBlock(readFreeform())).toMatch(/absolute left-full top-0/);
  });

  it('the gap is the established ml-3 (12px) convention, within the 8-12px target', () => {
    const block = siteBBlock(readFreeform());
    expect(block).toMatch(/left-full top-0 ml-3/);
    // ml-3 in this Tailwind config is 0.75rem = 12px -- the same convention
    // already used for the Color/Text-Style and Link nested popovers, and for
    // every other post type's on-canvas comment/detail popup in this file.
  });

  it('is not born at {top:0,left:0} or any placeholder coordinate -- no coordinate state at all', () => {
    const block = siteBBlock(readFreeform());
    expect(block).not.toContain('triggerRect');
    expect(block).not.toContain('useState<AnchorRect');
    expect(block).not.toContain('-9999');
    expect(block).not.toMatch(/left:\s*position/);
    // The whole point: position comes from Tailwind classes alone. No inline
    // style at all on the wrapper -- not even a correct-looking one -- because
    // any inline left/top implies a JS-computed coordinate that has to be
    // computed BEFORE first paint (impossible without a measurement step),
    // which is exactly the mechanism that produced the top-left travel.
    const wrapperOpenTag = block.slice(0, block.indexOf('>') + 1);
    expect(wrapperOpenTag).not.toContain('style=');
  });

  it('has no measurement-then-reposition step -- no useLayoutEffect/useEffect driving its position', () => {
    const block = siteBBlock(readFreeform());
    expect(block).not.toContain('useLayoutEffect');
    expect(block).not.toContain('getBoundingClientRect');
  });

  it('does not call viewport-centering or vertical-clamping logic for the main panel', () => {
    const src = readFreeform();
    // These utilities remain imported/used elsewhere for the nested Color and
    // Link popovers (inside CommentPopup.tsx, untouched by this patch) -- the
    // assertion is that FreeformPadletCards.tsx itself no longer references
    // them for the outer Site B shell.
    expect(src).not.toContain('useAnchoredPopover');
    expect(src).not.toContain('computePopoverPlacement');
    expect(src).not.toContain('rectFromElement');
  });

  it('only a single fade/slide entrance animation exists, not a position transition', () => {
    const block = siteBBlock(readFreeform());
    // slide-in-from-left-2 is a small (0.5rem) fixed keyframe offset near the
    // final resting position, not a top/left CSS transition driven by
    // measured coordinates -- there is no intermediate visual state to travel
    // through.
    expect(block).toMatch(/animate-in fade-in slide-in-from-left-2 duration-200/);
    expect(block).not.toContain('transition-all');
    expect(block).not.toMatch(/style=\{\{[^}]*top:/);
  });

  it('the anchor is a static className, not conditional on comment count', () => {
    const block = siteBBlock(readFreeform());
    // Same wrapper className regardless of how many comments exist --
    // 1 comment and 10+ comments use the identical anchor mechanism, since
    // nothing here reads `comments.length` or `cardCommentList.length`.
    const classLine = block.match(/className="absolute left-full top-0[^"]*"/)?.[0];
    expect(classLine).toBeTruthy();
    expect(block.slice(0, block.indexOf(classLine!))).not.toContain('cardCommentList.length');
  });

  it('never writes card/padlet coordinates or the canvas transform', () => {
    const block = siteBBlock(readFreeform());
    for (const forbidden of ['padlet.x', 'padlet.y', 'setPadlets', 'updatePadletPosition', 'canvasZoom', '.style.transform']) {
      expect(block, `Site B block must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('remains an interaction island -- click/mousedown stop propagation before reaching the card', () => {
    const block = siteBBlock(readFreeform());
    expect(block).toMatch(/onClick=\{\(e\) => e\.stopPropagation\(\)\}/);
    expect(block).toMatch(/onMouseDown=\{\(e\) => e\.stopPropagation\(\)\}/);
  });

  it('production diff against bdebed5 (pre-8L-B) is limited to a harmless whitespace fix', () => {
    // This is the strongest guarantee available at this layer: the file is
    // byte-for-byte the pre-viewport-experiment implementation, aside from a
    // trailing-space cleanup on one comment line.
    const src = readFreeform();
    expect(src).not.toContain('ViewportAnchoredCommentShell');
    expect(src).not.toContain("import { createPortal } from 'react-dom'");
  });
});

describe('PATCH 8M -- opening Comments does not pan the canvas', () => {
  it('the composer autofocus on open uses preventScroll, so a card near a viewport edge does not trigger a browser scroll-into-view', () => {
    // Live-verified during this patch: without preventScroll, opening
    // Comments on a card near the viewport edge (where the panel legitimately
    // extends past the visible area -- expected under "no auto-fit, user
    // scrolls") made the browser auto-scroll the canvas's own scroll
    // container to reveal the newly-focused composer input, measured as
    // scrollLeft jumping 0 -> 132 within ~200ms of open. That is a canvas pan
    // the user never asked for, triggered merely by opening Comments -- this
    // patch's explicit "canvas pan must not change" requirement. With
    // preventScroll, scrollLeft stayed at 0 through open, 10 added comments,
    // and 3 open/close cycles.
    const popup = fs.readFileSync(COMMENT_POPUP_PATH, 'utf8');
    const openEffectStart = popup.indexOf('if (isOpen) {');
    expect(openEffectStart, 'the open-effect must exist').toBeGreaterThan(-1);
    const openEffectBlock = popup.slice(openEffectStart, popup.indexOf('} else {', openEffectStart));
    expect(openEffectBlock).toContain('inputRef.current?.focus({ preventScroll: true })');
  });
});

describe('PATCH 8M -- both Clipart entry points remain wired to the same canonical CommentPopup', () => {
  it('Site B still renders through CommentPopup, unchanged capability set', () => {
    const block = siteBBlock(readFreeform());
    expect(block).toContain('<CommentPopup');
    expect(block).toContain('enableCanonicalSelectionStyling');
  });

  it('CommentPopup.tsx itself is untouched by this positioning-only patch', () => {
    // 8L-A's height-discipline gate (enableCanonicalSelectionStyling &&
    // !embedded) is preserved -- this patch changes ONLY where the panel sits
    // on screen, not how big it is or how the nested Color/Link popovers
    // anchor to it.
    const popup = fs.readFileSync(COMMENT_POPUP_PATH, 'utf8');
    expect(popup).toContain('boundedHeight');
    expect(popup).toContain('panelSpanAnchorRect');
  });
});
