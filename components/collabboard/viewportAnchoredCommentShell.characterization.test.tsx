// PATCH 8L-B -- the on-canvas Clipart comment panel is positioned in VIEWPORT
// space, not canvas space.
//
// These are source-level characterization assertions. FreeformPadletCards.tsx
// is ~6.8k lines and cannot be mounted directly, and the property that matters
// here (a fixed-position element portaled OUT of a `transform: scale()`
// ancestor) has no observable behaviour in jsdom, which has no layout engine
// and no notion of containing blocks. The live evidence recorded alongside this
// patch is what actually proves the behaviour, at 1600x1000:
//
//   zoom  50%: card r=781  -> panel x[785..1065]  width 280, inside viewport
//   zoom 100%: card l=1317 -> panel x[1029..1309] width 280, flipped left
//   zoom 200%: card l=300  -> panel x[668..948]   width 280, inside viewport
//
// The width staying 280 at every zoom is the load-bearing observation: while
// the panel lived inside the scaled stage it rendered 140 at 50% zoom. Under
// negative control A (portal removed, position:absolute restored) it measured
// exactly that 140 again.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const FREEFORM = path.join(process.cwd(), 'components/collabboard/canvas/ui/FreeformPadletCards.tsx');
const src = fs.readFileSync(FREEFORM, 'utf8');

function shellBlock() {
  const start = src.indexOf('function ViewportAnchoredCommentShell');
  expect(start, 'ViewportAnchoredCommentShell must exist').toBeGreaterThan(-1);
  const end = src.indexOf('\nfunction FreeformPadletCards', start);
  return src.slice(start, end === -1 ? start + 4000 : end);
}

describe('PATCH 8L-B -- viewport-space comment shell', () => {
  it('the on-canvas Clipart comment panel renders through the viewport-anchored shell', () => {
    expect(src).toContain('<ViewportAnchoredCommentShell>');

    // Scoped to the Clipart (Site B) block only. The same canvas-space wrapper
    // class is still used by other post types' comment popups (Todo, Table,
    // Link, ...), which 8L deliberately does not migrate -- so this must not
    // assert on the whole file.
    const start = src.indexOf('{/* Card Comments Popup - Right side.');
    expect(start, 'Clipart Site B block must exist').toBeGreaterThan(-1);
    const block = src.slice(start, src.indexOf('</ViewportAnchoredCommentShell>', start));
    expect(block).toContain('<ViewportAnchoredCommentShell>');
    expect(block).not.toContain('absolute left-full top-0 ml-3');
  });

  it('portals out of the scaled padlet stage', () => {
    // position:fixed alone is not enough -- the stage carries
    // transform: scale(canvasZoom), which would become the containing block.
    expect(shellBlock()).toContain('createPortal(');
    expect(shellBlock()).toContain('document.body');
  });

  it('positions with position: fixed, not absolute or a transform', () => {
    const block = shellBlock();
    expect(block).toMatch(/className="fixed z-\[1100\]/);
    expect(block).not.toMatch(/className="absolute z-\[1100\]/);
    // A translate inside the scaled stage is exactly what sank e782852.
    expect(block).not.toContain('translateY(');
    expect(block).not.toContain('translate(');
  });

  it('reuses the tested placement math rather than a second clamp algorithm', () => {
    const block = shellBlock();
    expect(block).toContain('useAnchoredPopover(');
    expect(block).not.toContain('innerHeight');
    expect(block).not.toContain('Math.min(Math.max(');
  });

  it('anchors to the card box via an inert overlay sentinel', () => {
    const block = shellBlock();
    expect(block).toContain('absolute inset-0 pointer-events-none');
    expect(block).toContain('rectFromElement(anchorRef.current)');
  });

  it('never writes card coordinates or the canvas transform', () => {
    const block = shellBlock();
    for (const forbidden of ['padlet.x', 'padlet.y', 'setPadlets', 'updatePadletPosition', 'canvasZoom', '.style.transform']) {
      expect(block, `shell must not touch ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('keeps the panel an interaction island', () => {
    const block = shellBlock();
    // React portals still propagate through the React tree, so the card's own
    // handlers (which call closeAllToolbars) remain reachable without these.
    expect(block).toContain('onClick={(e) => e.stopPropagation()}');
    expect(block).toContain('onMouseDown={(e) => e.stopPropagation()}');
  });

  it('stays a panel, not a modal -- no backdrop or centering', () => {
    const block = shellBlock();
    for (const modalism of ['bg-black/', 'inset-0 z-[', 'items-center justify-center', 'aria-modal']) {
      expect(block, `shell must not adopt ${modalism}`).not.toContain(modalism);
    }
  });
});
