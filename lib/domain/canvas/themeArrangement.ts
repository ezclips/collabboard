/**
 * PATCH-354. Pure geometry for "Group by theme": one labelled column per theme.
 *
 * No React, no DOM. Sizes are the notes' RENDERED sizes (a plain note ignores
 * its stored width/height unless `metadata.manualSize`), so the caller measures
 * the DOM and hands the numbers in.
 */

import type { WorldRect } from '@/lib/domain/canvas/freeformFreeSpot';

/** A column is never narrower than this, however narrow its notes are. */
export const THEME_COLUMN_MIN_WIDTH = 220;
/**
 * PATCH-354 Addendum 1. A theme title must fit its heading, so the column also
 * allows for the title at heading level 3: roughly 11px per character plus the
 * heading's padding, capped so one long title cannot make an enormous column.
 */
export const THEME_TITLE_CHAR_WIDTH = 11;
export const THEME_TITLE_PADDING = 32;
export const THEME_COLUMN_MAX_WIDTH = 420;
/** Horizontal gap between columns. */
export const THEME_COLUMN_GAP = 48;
/** Vertical gap between stacked notes (and below the heading). */
export const THEME_NOTE_GAP = 16;
/** Horizontal gap kept when sliding clear of an obstacle. */
export const THEME_SLIDE_GAP = 48;
export const THEME_SLIDE_MAX_STEPS = 50;

export interface ThemeArrangementInput {
  readonly themes: readonly { readonly title: string; readonly noteIds: readonly string[] }[];
  readonly sizes: ReadonlyMap<string, { readonly width: number; readonly height: number }>;
  readonly origin: { readonly x: number; readonly y: number };
  readonly headingHeight: number;
}

export interface ThemeHeadingPlacement {
  readonly themeIndex: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
}

export interface ThemeNotePlacement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export interface ThemeArrangement {
  readonly headings: readonly ThemeHeadingPlacement[];
  readonly notes: readonly ThemeNotePlacement[];
  readonly bounds: WorldRect;
}

/**
 * Lay the themes out left to right: one column per theme, a heading at the
 * column top, and the theme's notes stacked below it in the order given.
 */
export function arrangeThemes(input: ThemeArrangementInput): ThemeArrangement {
  const headings: ThemeHeadingPlacement[] = [];
  const notes: ThemeNotePlacement[] = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const track = (x: number, y: number, width: number, height: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  };

  let columnX = input.origin.x;
  input.themes.forEach((theme, themeIndex) => {
    const widest = theme.noteIds.reduce(
      (widestSoFar, id) => Math.max(widestSoFar, input.sizes.get(id)?.width ?? 0),
      0,
    );
    // PATCH-354 Addendum 1: also fit the title, so it is not cut off.
    const titleWidth = theme.title.length * THEME_TITLE_CHAR_WIDTH + THEME_TITLE_PADDING;
    const width = Math.min(
      THEME_COLUMN_MAX_WIDTH,
      Math.max(THEME_COLUMN_MIN_WIDTH, widest, titleWidth),
    );
    headings.push({ themeIndex, x: columnX, y: input.origin.y, width });
    track(columnX, input.origin.y, width, input.headingHeight);

    let noteY = input.origin.y + input.headingHeight + THEME_NOTE_GAP;
    for (const id of theme.noteIds) {
      const size = input.sizes.get(id) ?? { width: THEME_COLUMN_MIN_WIDTH, height: 0 };
      notes.push({ id, x: columnX, y: noteY });
      track(columnX, noteY, size.width, size.height);
      noteY += size.height + THEME_NOTE_GAP;
    }
    columnX += width + THEME_COLUMN_GAP;
  });

  const bounds: WorldRect = Number.isFinite(minX)
    ? { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
    : { x: input.origin.x, y: input.origin.y, width: 0, height: 0 };

  return { headings, notes, bounds };
}

/** Do two axis-aligned rects overlap? Touching edges do not count. */
export function rectsOverlap(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

/**
 * How far right the whole arrangement must slide to clear every obstacle.
 *
 * Repeated: whichever obstacle the arrangement still overlaps, it moves to that
 * obstacle's right edge + `gap`, up to `maxSteps` times. Always moves RIGHT --
 * an obstacle already passed is never re-entered. Pure.
 */
export function slideClear(
  bounds: WorldRect,
  obstacles: readonly WorldRect[],
  gap: number = THEME_SLIDE_GAP,
  maxSteps: number = THEME_SLIDE_MAX_STEPS,
): number {
  let dx = 0;
  for (let step = 0; step < maxSteps; step += 1) {
    const moved: WorldRect = { ...bounds, x: bounds.x + dx };
    const hit = obstacles.find((obstacle) => rectsOverlap(moved, obstacle));
    if (!hit) return dx;
    dx = Math.max(dx, hit.x + hit.width + gap - bounds.x);
  }
  return dx;
}
