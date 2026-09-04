import { describe, expect, it } from 'vitest';
import { pickMostVisiblePage } from './useKnowledgeReaderActivePage';

/**
 * PDF-R6J-C2 -- the rule behind "which page is the reader on".
 *
 * The observer wiring is asserted structurally elsewhere; what is worth testing
 * on its own is the DECISION, because getting it wrong means a note made from,
 * or a Board AI context added from, a page the user was not looking at.
 */

describe('pickMostVisiblePage', () => {
  it('picks the page filling most of the viewport', () => {
    expect(pickMostVisiblePage([
      { pageNumber: 1, ratio: 0.2 },
      { pageNumber: 2, ratio: 0.9 },
      { pageNumber: 3, ratio: 0.1 },
    ], 1)).toBe(2);
  });

  it('scrolling from page 1 to page 6 makes page 6 the answer', () => {
    const atTop = [{ pageNumber: 1, ratio: 1 }, { pageNumber: 2, ratio: 0 }];
    const atBottom = [{ pageNumber: 5, ratio: 0.1 }, { pageNumber: 6, ratio: 1 }];
    expect(pickMostVisiblePage(atTop, 1)).toBe(1);
    expect(pickMostVisiblePage(atBottom, 1)).toBe(6);
  });

  it('breaks a tie toward the lower page -- reading order, not arrival order', () => {
    expect(pickMostVisiblePage([
      { pageNumber: 3, ratio: 0.5 },
      { pageNumber: 2, ratio: 0.5 },
    ], 1)).toBe(2);
  });

  it('keeps the previous answer when nothing is visible', () => {
    // A fast scroll can leave the observer momentarily reporting nothing;
    // snapping back to page 1 there would be a wrong answer, not a safe one.
    expect(pickMostVisiblePage([], 4)).toBe(4);
    expect(pickMostVisiblePage([{ pageNumber: 1, ratio: 0 }], 4)).toBe(4);
  });

  it('ignores nonsense ratios rather than letting them win', () => {
    expect(pickMostVisiblePage([
      { pageNumber: 1, ratio: Number.NaN },
      { pageNumber: 2, ratio: 0.3 },
    ], 1)).toBe(2);
    expect(pickMostVisiblePage([{ pageNumber: 1, ratio: Number.NaN }], 7)).toBe(7);
  });
});
