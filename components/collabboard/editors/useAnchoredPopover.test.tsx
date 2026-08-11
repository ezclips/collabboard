import { describe, expect, it } from 'vitest';
import { computePopoverPlacement, panelSpanAnchorRect } from './useAnchoredPopover';

const viewport = { width: 1000, height: 800 };

describe('computePopoverPlacement', () => {
  it('opens to the right when there is room', () => {
    const result = computePopoverPlacement(
      { top: 100, left: 100, width: 20, height: 20 },
      { width: 240, height: 300 },
      viewport
    );
    expect(result.placement).toBe('right');
    expect(result.left).toBe(100 + 20 + 8);
  });

  it('flips to the left near the right edge of the viewport', () => {
    const result = computePopoverPlacement(
      { top: 100, left: 900, width: 20, height: 20 },
      { width: 240, height: 300 },
      viewport
    );
    expect(result.placement).toBe('left');
    expect(result.left).toBe(900 - 8 - 240);
  });

  it('clamps left inside the viewport when neither side has full room', () => {
    const result = computePopoverPlacement(
      { top: 100, left: 5, width: 20, height: 20 },
      { width: 900, height: 300 },
      viewport
    );
    expect(result.left).toBeGreaterThanOrEqual(8);
    expect(result.left + 900).toBeLessThanOrEqual(viewport.width + 1);
  });

  it('clamps top so a tall popover never renders below the viewport', () => {
    const result = computePopoverPlacement(
      { top: 780, left: 100, width: 20, height: 20 },
      { width: 240, height: 500 },
      viewport
    );
    expect(result.top).toBeLessThanOrEqual(viewport.height - 500 - 8 + 1);
    expect(result.top).toBeGreaterThanOrEqual(8);
  });

  it('clamps top so it never renders above the viewport', () => {
    const result = computePopoverPlacement(
      { top: -50, left: 100, width: 20, height: 20 },
      { width: 240, height: 100 },
      viewport
    );
    expect(result.top).toBe(8);
  });

  it('prefers the side with more room when neither fits fully', () => {
    // Trigger near center with a popover wider than either side alone.
    const result = computePopoverPlacement(
      { top: 100, left: 600, width: 20, height: 20 },
      { width: 500, height: 100 },
      viewport
    );
    // spaceRight = 1000 - 620 - 8 = 372; spaceLeft = 600 - 8 = 592 -> left wins
    expect(result.placement).toBe('left');
  });
});

// The comment panel's Color and Link popovers must clear the WHOLE panel, not
// merely the small action button that opened them. Regression cover for the
// panel-edge anchoring bug: a sliver anchor at panel.right looked correct
// while the popover opened rightwards, but flipped straight back on top of the
// panel as soon as the panel sat near the viewport's right edge.
describe('panelSpanAnchorRect', () => {
  const action = { top: 300, left: 940, width: 20, height: 20 };
  const popover = { width: 240, height: 200 };

  it('keeps the action button vertical alignment', () => {
    const panel = { top: 100, left: 700, width: 280, height: 500 };
    expect(panelSpanAnchorRect(panel, action).top).toBe(action.top);
    expect(panelSpanAnchorRect(panel, action).height).toBe(action.height);
  });

  it('spans the panel horizontally rather than the action button', () => {
    const panel = { top: 100, left: 700, width: 280, height: 500 };
    const anchor = panelSpanAnchorRect(panel, action);
    expect(anchor.left).toBe(panel.left);
    expect(anchor.width).toBe(panel.width);
  });

  it('opens clear of the panel RIGHT edge when there is room', () => {
    const panel = { top: 100, left: 100, width: 280, height: 500 };
    const anchor = panelSpanAnchorRect(panel, { ...action, left: 340 });
    const placed = computePopoverPlacement(anchor, popover, viewport);
    expect(placed.placement).toBe('right');
    expect(placed.left).toBeGreaterThanOrEqual(panel.left + panel.width);
  });

  it('opens clear of the panel LEFT edge when it flips', () => {
    // Panel hard against the right edge -- the configuration that exposed the
    // bug. The popover must land entirely left of the panel, never inside it.
    const panel = { top: 100, left: 700, width: 280, height: 500 };
    const anchor = panelSpanAnchorRect(panel, action);
    const placed = computePopoverPlacement(anchor, popover, viewport);
    expect(placed.placement).toBe('left');
    expect(placed.left + popover.width).toBeLessThanOrEqual(panel.left);
  });

  it('never overlaps the panel for any panel position across the viewport', () => {
    for (let left = 0; left + 280 <= viewport.width; left += 20) {
      const panel = { top: 100, left, width: 280, height: 500 };
      const anchor = panelSpanAnchorRect(panel, { ...action, left: left + 260 });
      const placed = computePopoverPlacement(anchor, popover, viewport);
      const clearsRight = placed.left >= panel.left + panel.width;
      const clearsLeft = placed.left + popover.width <= panel.left;
      expect(clearsRight || clearsLeft, `panel.left=${left} placed.left=${placed.left}`).toBe(true);
    }
  });
});
