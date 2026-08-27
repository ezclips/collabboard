import { describe, expect, it } from 'vitest';
import {
  MINIMUM_REGION_CSS_PIXELS,
  isContentBoxUsable,
  meetsMinimumRegionExtent,
  normalizedPointInContentBox,
} from './knowledgePageRegionPointer';
import type { PageImageContentBox } from './knowledgePageRegionPointer';

/**
 * P6J-F9-B2. These numbers are the reader's real shape: a 500x700 image drawn
 * at viewport (100, 200) with the 1px border the page image carries. The
 * BORDER BOX is therefore 502x702 at (100, 200) and the CONTENT box is 500x700
 * at (101, 201) -- the whole point of this module.
 */
const BOX: PageImageContentBox = { left: 101, top: 201, width: 500, height: 700 };
/** What a raw getBoundingClientRect() would have handed a careless caller. */
const BORDER_BOX: PageImageContentBox = { left: 100, top: 200, width: 502, height: 702 };

describe('P6J-F9-B2 content-box normalisation', () => {
  it('maps the content box corners to exactly 0 and 1', () => {
    expect(normalizedPointInContentBox(101, 201, BOX)).toEqual({ x: 0, y: 0 });
    expect(normalizedPointInContentBox(601, 901, BOX)).toEqual({ x: 1, y: 1 });
  });

  it('S5/S6: the border correction moves the answer, so it cannot be dropped', () => {
    // Probed OFF-centre on purpose. The two boxes share a centre, so the error
    // is exactly zero there and grows toward the edges: a test that checked
    // the middle would pass against the wrong box.
    const content = normalizedPointInContentBox(151, 271, BOX)!;
    const border = normalizedPointInContentBox(151, 271, BORDER_BOX)!;
    expect(content).toEqual({ x: 0.1, y: 0.1 });
    expect(border.x).not.toBeCloseTo(content.x, 6);
    expect(border.y).not.toBeCloseTo(content.y, 6);

    // At the far edge the content box says the last visible pixel is the page
    // edge; the border box still claims page beyond it.
    expect(normalizedPointInContentBox(601, 901, BOX)).toEqual({ x: 1, y: 1 });
    const atEdge = normalizedPointInContentBox(601, 901, BORDER_BOX)!;
    expect(atEdge.x).toBeLessThan(1);
    expect(atEdge.y).toBeLessThan(1);
  });

  it('the two boxes agree only at the shared centre', () => {
    expect(normalizedPointInContentBox(351, 551, BOX)).toEqual({ x: 0.5, y: 0.5 });
    expect(normalizedPointInContentBox(351, 551, BORDER_BOX)).toEqual({ x: 0.5, y: 0.5 });
  });

  it.each([
    ['S9 past the left edge', 40, 551, { x: 0, y: 0.5 }],
    ['S10 past the right edge', 4000, 551, { x: 1, y: 0.5 }],
    ['S11 past the top edge', 351, 10, { x: 0.5, y: 0 }],
    ['S12 past the bottom edge', 351, 4000, { x: 0.5, y: 1 }],
  ])('%s clamps onto the page', (_label, clientX, clientY, expected) => {
    // A captured drag keeps reporting outside the image; the part beyond the
    // edge selects the edge rather than an out-of-bounds rectangle.
    expect(normalizedPointInContentBox(clientX, clientY, BOX)).toEqual(expected);
  });

  it.each([
    ['zero width', { ...BOX, width: 0 }],
    ['zero height', { ...BOX, height: 0 }],
    ['negative width', { ...BOX, width: -500 }],
    ['NaN width', { ...BOX, width: Number.NaN }],
    ['infinite left', { ...BOX, left: Number.POSITIVE_INFINITY }],
  ])('refuses an unusable box (%s) rather than dividing by it', (_label, box) => {
    expect(isContentBoxUsable(box)).toBe(false);
    expect(normalizedPointInContentBox(351, 551, box)).toBeNull();
    expect(meetsMinimumRegionExtent({ x: 0, y: 0 }, { x: 1, y: 1 }, box)).toBe(false);
  });

  it('refuses a non-finite pointer', () => {
    expect(normalizedPointInContentBox(Number.NaN, 551, BOX)).toBeNull();
    expect(normalizedPointInContentBox(351, Number.POSITIVE_INFINITY, BOX)).toBeNull();
  });
});

describe('P6J-F9-B2 minimum drag extent', () => {
  const at = (x: number, y: number) => ({ x, y });
  /** Exactly 8 CSS px on this box, in each axis. */
  const eightWide = MINIMUM_REGION_CSS_PIXELS / BOX.width;
  const eightTall = MINIMUM_REGION_CSS_PIXELS / BOX.height;

  it('is 8 CSS pixels, and the constant is what the UI actually uses', () => {
    expect(MINIMUM_REGION_CSS_PIXELS).toBe(8);
  });

  it('accepts a drag exactly on the threshold in both axes', () => {
    expect(meetsMinimumRegionExtent(at(0.2, 0.3), at(0.2 + eightWide, 0.3 + eightTall), BOX)).toBe(true);
  });

  it('S13/S14: rejects a drag under the threshold in either axis alone', () => {
    const narrow = meetsMinimumRegionExtent(
      at(0.2, 0.3), at(0.2 + eightWide * 0.99, 0.3 + eightTall), BOX);
    const short = meetsMinimumRegionExtent(
      at(0.2, 0.3), at(0.2 + eightWide, 0.3 + eightTall * 0.99), BOX);
    expect([narrow, short]).toEqual([false, false]);
  });

  it('measures in CSS pixels, not normalised units', () => {
    // The same normalised extent is a real drag on a wide image and a stray
    // click on a narrow one, which is why the box has to be consulted.
    const extent = { start: at(0.5, 0.5), end: at(0.52, 0.52) };
    expect(meetsMinimumRegionExtent(extent.start, extent.end, BOX)).toBe(true);
    expect(meetsMinimumRegionExtent(extent.start, extent.end, { ...BOX, width: 100, height: 100 }))
      .toBe(false);
  });

  it('judges a reverse drag by the same absolute extent', () => {
    const forward = meetsMinimumRegionExtent(at(0.2, 0.3), at(0.6, 0.7), BOX);
    const reverse = meetsMinimumRegionExtent(at(0.6, 0.7), at(0.2, 0.3), BOX);
    expect([forward, reverse]).toEqual([true, true]);
  });

  it('rejects a click that never moved', () => {
    expect(meetsMinimumRegionExtent(at(0.4, 0.4), at(0.4, 0.4), BOX)).toBe(false);
  });
});
