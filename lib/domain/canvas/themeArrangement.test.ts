import { describe, expect, it } from 'vitest';

import {
  THEME_COLUMN_GAP,
  THEME_COLUMN_MIN_WIDTH,
  THEME_NOTE_GAP,
  arrangeThemes,
  rectsOverlap,
  slideClear,
} from './themeArrangement';

const size = (width: number, height: number) => ({ width, height });

describe('PATCH-354 arrangeThemes', () => {
  it('lays one column per theme, left to right, at the minimum width', () => {
    const arrangement = arrangeThemes({
      themes: [
        { title: 'A', noteIds: ['a1'] },
        { title: 'B', noteIds: ['b1'] },
      ],
      sizes: new Map([['a1', size(100, 80)], ['b1', size(120, 60)]]),
      origin: { x: 1000, y: 500 },
      headingHeight: 48,
    });
    expect(arrangement.headings).toEqual([
      { themeIndex: 0, x: 1000, y: 500, width: THEME_COLUMN_MIN_WIDTH },
      {
        themeIndex: 1,
        x: 1000 + THEME_COLUMN_MIN_WIDTH + THEME_COLUMN_GAP,
        y: 500,
        width: THEME_COLUMN_MIN_WIDTH,
      },
    ]);
  });

  it('a column is as wide as its widest note, never below the minimum', () => {
    const arrangement = arrangeThemes({
      themes: [
        { title: 'A', noteIds: ['a1', 'a2'] },
        { title: 'B', noteIds: ['b1'] },
      ],
      sizes: new Map([['a1', size(300, 80)], ['a2', size(180, 80)], ['b1', size(100, 60)]]),
      origin: { x: 0, y: 0 },
      headingHeight: 48,
    });
    expect(arrangement.headings[0].width).toBe(300);
    expect(arrangement.headings[1].width).toBe(THEME_COLUMN_MIN_WIDTH);
  });

  it('stacks the notes below the heading, in order, with the gap', () => {
    const arrangement = arrangeThemes({
      themes: [{ title: 'A', noteIds: ['a1', 'a2'] }],
      sizes: new Map([['a1', size(200, 80)], ['a2', size(200, 120)]]),
      origin: { x: 0, y: 0 },
      headingHeight: 48,
    });
    expect(arrangement.notes).toEqual([
      { id: 'a1', x: 0, y: 48 + THEME_NOTE_GAP },
      { id: 'a2', x: 0, y: 48 + THEME_NOTE_GAP + 80 + THEME_NOTE_GAP },
    ]);
  });

  it('bounds cover the whole arrangement', () => {
    const arrangement = arrangeThemes({
      themes: [{ title: 'A', noteIds: ['a1'] }],
      sizes: new Map([['a1', size(200, 80)]]),
      origin: { x: 10, y: 20 },
      headingHeight: 48,
    });
    expect(arrangement.bounds).toEqual({ x: 10, y: 20, width: 220, height: 48 + THEME_NOTE_GAP + 80 });
  });

  it('an empty input is a zero-size box at the origin', () => {
    expect(arrangeThemes({ themes: [], sizes: new Map(), origin: { x: 5, y: 6 }, headingHeight: 48 }).bounds)
      .toEqual({ x: 5, y: 6, width: 0, height: 0 });
  });

  // PATCH-354 Addendum 1: the title must fit its heading, not be cut off.
  it('widens a column for a long theme title', () => {
    const arrangement = arrangeThemes({
      themes: [{ title: 'Entertainment & Music', noteIds: ['a1'] }],
      sizes: new Map([['a1', size(200, 80)]]),
      origin: { x: 0, y: 0 },
      headingHeight: 48,
    });
    // 21 characters * 11 + 32 = 263.
    expect(arrangement.headings[0].width).toBe(263);
  });

  it('caps the title-driven width at 420', () => {
    const arrangement = arrangeThemes({
      themes: [{ title: 'x'.repeat(60), noteIds: ['a1'] }],
      sizes: new Map([['a1', size(200, 80)]]),
      origin: { x: 0, y: 0 },
      headingHeight: 48,
    });
    expect(arrangement.headings[0].width).toBe(420);
  });
});

describe('PATCH-354 slideClear', () => {
  const bounds = { x: 100, y: 100, width: 200, height: 300 };

  it('no obstacle → dx 0', () => {
    expect(slideClear(bounds, [])).toBe(0);
    expect(slideClear(bounds, [{ x: 1000, y: 100, width: 50, height: 50 }])).toBe(0);
  });

  it('one obstacle → its right edge + gap', () => {
    expect(slideClear(bounds, [{ x: 150, y: 100, width: 100, height: 50 }])).toBe(150 + 100 + 48 - 100);
  });

  it('chained obstacles → past the furthest', () => {
    const obstacles = [
      { x: 150, y: 100, width: 100, height: 50 },
      { x: 260, y: 120, width: 200, height: 50 },
    ];
    const dx = slideClear(bounds, obstacles);
    const moved = { ...bounds, x: bounds.x + dx };
    expect(obstacles.every((obstacle) => !rectsOverlap(moved, obstacle))).toBe(true);
    expect(moved.x).toBeGreaterThanOrEqual(260 + 200 + 48);
  });

  it('ignores an obstacle that only touches the edge', () => {
    expect(slideClear(bounds, [{ x: 300, y: 100, width: 50, height: 50 }])).toBe(0);
  });
});
