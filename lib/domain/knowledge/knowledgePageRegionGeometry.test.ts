import { describe, expect, it } from 'vitest';
import {
  NORMALIZED_REGION_EPSILON,
  displayRegionToSourceRegion,
  isCanonicalPageRotation,
  isValidNormalizedRegion,
  normalizeDragRectangle,
  normalizeStorableRegion,
  sourceRegionToDisplayRegion,
} from './knowledgePageRegionGeometry';
import type { KnowledgePageRotation, NormalizedPageRegion } from './knowledgePageRegionGeometry';

/**
 * P6J-F9-B1. Every expectation below is HAND-COMPUTED from the locked
 * transforms, never produced by calling the other direction -- otherwise a
 * matched pair of wrong formulas would agree with itself and pass.
 *
 * A1 bakes the page rotation into the derivative (pdfjs `rotation: 90` renders
 * CLOCKWISE), so the display and the source page disagree exactly here.
 */
const r = (x: number, y: number, width: number, height: number): NormalizedPageRegion =>
  ({ x, y, width, height });

/** Floats: 1 - 0.4 - 0.2 is 0.39999999999999997, not 0.4. */
const TOLERANCE = 1e-9;

function expectRegion(actual: NormalizedPageRegion | null, expected: NormalizedPageRegion) {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(expected.x, 9);
  expect(actual!.y).toBeCloseTo(expected.y, 9);
  expect(actual!.width).toBeCloseTo(expected.width, 9);
  expect(actual!.height).toBeCloseTo(expected.height, 9);
}

const ROTATIONS: readonly KnowledgePageRotation[] = [0, 90, 180, 270];

interface Case {
  readonly name: string;
  readonly display: NormalizedPageRegion;
  readonly source: Readonly<Record<KnowledgePageRotation, NormalizedPageRegion>>;
}

const CASES: readonly Case[] = [
  {
    name: 'the whole page',
    display: r(0, 0, 1, 1),
    source: { 0: r(0, 0, 1, 1), 90: r(0, 0, 1, 1), 180: r(0, 0, 1, 1), 270: r(0, 0, 1, 1) },
  },
  {
    name: 'the top-left quadrant',
    display: r(0, 0, 0.5, 0.5),
    source: {
      0: r(0, 0, 0.5, 0.5),
      90: r(0, 0.5, 0.5, 0.5),
      180: r(0.5, 0.5, 0.5, 0.5),
      270: r(0.5, 0, 0.5, 0.5),
    },
  },
  {
    name: 'the top-right quadrant',
    display: r(0.5, 0, 0.5, 0.5),
    source: {
      0: r(0.5, 0, 0.5, 0.5),
      90: r(0, 0, 0.5, 0.5),
      180: r(0, 0.5, 0.5, 0.5),
      270: r(0.5, 0.5, 0.5, 0.5),
    },
  },
  {
    name: 'the bottom-left quadrant',
    display: r(0, 0.5, 0.5, 0.5),
    source: {
      0: r(0, 0.5, 0.5, 0.5),
      90: r(0.5, 0.5, 0.5, 0.5),
      180: r(0.5, 0, 0.5, 0.5),
      270: r(0, 0, 0.5, 0.5),
    },
  },
  {
    name: 'the bottom-right quadrant',
    display: r(0.5, 0.5, 0.5, 0.5),
    source: {
      0: r(0.5, 0.5, 0.5, 0.5),
      90: r(0.5, 0, 0.5, 0.5),
      180: r(0, 0, 0.5, 0.5),
      270: r(0, 0.5, 0.5, 0.5),
    },
  },
  {
    name: 'a thin vertical strip',
    display: r(0.4, 0, 0.2, 1),
    source: {
      0: r(0.4, 0, 0.2, 1),
      90: r(0, 0.4, 1, 0.2),
      180: r(0.4, 0, 0.2, 1),
      270: r(0, 0.4, 1, 0.2),
    },
  },
  {
    name: 'a thin horizontal strip',
    display: r(0, 0.4, 1, 0.2),
    source: {
      0: r(0, 0.4, 1, 0.2),
      90: r(0.4, 0, 0.2, 1),
      180: r(0, 0.4, 1, 0.2),
      270: r(0.4, 0, 0.2, 1),
    },
  },
  {
    name: 'a region touching the left edge',
    display: r(0, 0.25, 0.3, 0.5),
    source: {
      0: r(0, 0.25, 0.3, 0.5),
      90: r(0.25, 0.7, 0.5, 0.3),
      180: r(0.7, 0.25, 0.3, 0.5),
      270: r(0.25, 0, 0.5, 0.3),
    },
  },
  {
    name: 'a region touching the right edge',
    display: r(0.7, 0.25, 0.3, 0.5),
    source: {
      0: r(0.7, 0.25, 0.3, 0.5),
      90: r(0.25, 0, 0.5, 0.3),
      180: r(0, 0.25, 0.3, 0.5),
      270: r(0.25, 0.7, 0.5, 0.3),
    },
  },
  {
    name: 'a region touching the top edge',
    display: r(0.25, 0, 0.5, 0.3),
    source: {
      0: r(0.25, 0, 0.5, 0.3),
      90: r(0, 0.25, 0.3, 0.5),
      180: r(0.25, 0.7, 0.5, 0.3),
      270: r(0.7, 0.25, 0.3, 0.5),
    },
  },
  {
    name: 'a region touching the bottom edge',
    display: r(0.25, 0.7, 0.5, 0.3),
    source: {
      0: r(0.25, 0.7, 0.5, 0.3),
      90: r(0.7, 0.25, 0.3, 0.5),
      180: r(0.25, 0, 0.5, 0.3),
      270: r(0, 0.25, 0.3, 0.5),
    },
  },
];

describe('display -> source, hand-computed per rotation', () => {
  for (const rotation of ROTATIONS) {
    for (const testCase of CASES) {
      it(`rotation ${rotation}: ${testCase.name}`, () => {
        expectRegion(displayRegionToSourceRegion(testCase.display, rotation), testCase.source[rotation]);
      });
    }
  }

  it('swaps width and height for quarter turns only', () => {
    const wide = r(0.1, 0.2, 0.6, 0.3);
    for (const rotation of [0, 180] as const) {
      const out = displayRegionToSourceRegion(wide, rotation)!;
      expect([out.width, out.height]).toEqual([0.6, 0.3]);
    }
    for (const rotation of [90, 270] as const) {
      const out = displayRegionToSourceRegion(wide, rotation)!;
      expect([out.width, out.height]).toEqual([0.3, 0.6]);
    }
  });
});

describe('source -> display, hand-computed per rotation', () => {
  for (const rotation of ROTATIONS) {
    for (const testCase of CASES) {
      it(`rotation ${rotation}: ${testCase.name}`, () => {
        expectRegion(sourceRegionToDisplayRegion(testCase.source[rotation], rotation), testCase.display);
      });
    }
  }
});

describe('round trip', () => {
  it('returns to the same rectangle in both directions', () => {
    for (const rotation of ROTATIONS) {
      for (const testCase of CASES) {
        const back = sourceRegionToDisplayRegion(
          displayRegionToSourceRegion(testCase.display, rotation), rotation);
        expectRegion(back, testCase.display);

        const forth = displayRegionToSourceRegion(
          sourceRegionToDisplayRegion(testCase.source[rotation], rotation), rotation);
        expectRegion(forth, testCase.source[rotation]);
      }
    }
  });

  it('holds for arbitrary rectangles, not only the tabulated ones', () => {
    let seed = 20260827;
    const next = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    for (let i = 0; i < 400; i += 1) {
      const x = next() * 0.9;
      const y = next() * 0.9;
      const region = r(x, y, Math.max(1e-4, next() * (1 - x)), Math.max(1e-4, next() * (1 - y)));
      const rotation = ROTATIONS[i % 4];
      expectRegion(
        sourceRegionToDisplayRegion(displayRegionToSourceRegion(region, rotation), rotation),
        region,
      );
    }
  });
});

describe('rotation input', () => {
  it('accepts only the four canonical rotations', () => {
    expect(ROTATIONS.every(isCanonicalPageRotation)).toBe(true);
    for (const bad of [45, -90, 360, 89.9, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '90']) {
      expect(isCanonicalPageRotation(bad)).toBe(false);
    }
  });

  it('refuses a non-canonical rotation instead of reinterpreting it', () => {
    // -90 is 270 by arithmetic, but a caller that sends it did not use the
    // convention this file locks, so guessing would silently move the region.
    for (const bad of [45, -90, 360, Number.NaN, Number.POSITIVE_INFINITY, null, undefined, '90']) {
      expect(displayRegionToSourceRegion(r(0, 0, 0.5, 0.5), bad)).toBeNull();
      expect(sourceRegionToDisplayRegion(r(0, 0, 0.5, 0.5), bad)).toBeNull();
    }
  });
});

describe('normalized region validity', () => {
  it('accepts an in-bounds rectangle', () => {
    expect(isValidNormalizedRegion(r(0, 0, 1, 1))).toBe(true);
    expect(isValidNormalizedRegion(r(0.25, 0.25, 0.5, 0.5))).toBe(true);
  });

  it.each([
    ['zero width', r(0.1, 0.1, 0, 0.5)],
    ['zero height', r(0.1, 0.1, 0.5, 0)],
    ['negative width', r(0.1, 0.1, -0.5, 0.5)],
    ['negative height', r(0.1, 0.1, 0.5, -0.5)],
    ['negative x', r(-0.1, 0.1, 0.5, 0.5)],
    ['negative y', r(0.1, -0.1, 0.5, 0.5)],
    ['NaN x', r(Number.NaN, 0.1, 0.5, 0.5)],
    ['NaN width', r(0.1, 0.1, Number.NaN, 0.5)],
    ['infinite width', r(0.1, 0.1, Number.POSITIVE_INFINITY, 0.5)],
    ['infinite x', r(Number.POSITIVE_INFINITY, 0.1, 0.5, 0.5)],
    ['x + width beyond the page', r(0.6, 0.1, 0.5, 0.5)],
    ['y + height beyond the page', r(0.1, 0.6, 0.5, 0.5)],
  ])('rejects %s', (_label, region) => {
    expect(isValidNormalizedRegion(region)).toBe(false);
    expect(normalizeStorableRegion(region)).toBeNull();
    expect(displayRegionToSourceRegion(region, 90)).toBeNull();
  });

  it.each([
    ['null', null],
    ['a string', '0.5'],
    ['an array', [0, 0, 1, 1]],
    ['a partial rectangle', { x: 0.1, y: 0.1, width: 0.2 }],
    ['string members', { x: '0.1', y: '0.1', width: '0.2', height: '0.2' }],
  ])('rejects %s rather than coercing it', (_label, value) => {
    expect(normalizeStorableRegion(value)).toBeNull();
  });

  it('trims only the epsilon overhang, and never a legitimate value', () => {
    const overhang = normalizeStorableRegion(r(0.5, 0.5, 0.5 + 1e-12, 0.5 + 1e-12))!;
    expect(overhang.x + overhang.width).toBeLessThanOrEqual(1);
    expect(overhang.y + overhang.height).toBeLessThanOrEqual(1);
    expect(overhang.width).toBeCloseTo(0.5, 9);
    // An ordinary rectangle passes through untouched, bit for bit.
    expect(normalizeStorableRegion(r(0.25, 0.125, 0.5, 0.25))).toEqual(r(0.25, 0.125, 0.5, 0.25));
  });

  it('rejects an excess larger than the tolerance', () => {
    expect(normalizeStorableRegion(r(0.5, 0.5, 0.5 + 1e-6, 0.5))).toBeNull();
    expect(NORMALIZED_REGION_EPSILON).toBe(1e-9);
  });

  it('never throws, whatever it is handed', () => {
    for (const value of [undefined, null, 0, '', [], {}, { x: {} }, new Date()]) {
      expect(() => normalizeStorableRegion(value)).not.toThrow();
      expect(() => displayRegionToSourceRegion(value, 0)).not.toThrow();
      expect(() => sourceRegionToDisplayRegion(value, 270)).not.toThrow();
    }
  });
});

describe('drag normalization', () => {
  it.each([
    ['top-left to bottom-right', 0.2, 0.3, 0.6, 0.8],
    ['bottom-right to top-left', 0.6, 0.8, 0.2, 0.3],
    ['top-right to bottom-left', 0.6, 0.3, 0.2, 0.8],
    ['bottom-left to top-right', 0.2, 0.8, 0.6, 0.3],
  ])('yields the same positive rectangle dragging %s', (_label, ax, ay, bx, by) => {
    expectRegion(normalizeDragRectangle(ax, ay, bx, by), r(0.2, 0.3, 0.4, 0.5));
  });

  it('clamps a drag that leaves the page on every side', () => {
    expectRegion(normalizeDragRectangle(-0.5, -0.5, 1.5, 1.5), r(0, 0, 1, 1));
    expectRegion(normalizeDragRectangle(0.5, 0.5, 4, 4), r(0.5, 0.5, 0.5, 0.5));
  });

  it('rejects a zero-area or non-finite drag', () => {
    expect(normalizeDragRectangle(0.4, 0.4, 0.4, 0.4)).toBeNull();
    expect(normalizeDragRectangle(0.4, 0.2, 0.4, 0.9)).toBeNull();
    expect(normalizeDragRectangle(0.2, 0.4, 0.9, 0.4)).toBeNull();
    expect(normalizeDragRectangle(Number.NaN, 0, 1, 1)).toBeNull();
    expect(normalizeDragRectangle(0, 0, Number.POSITIVE_INFINITY, 1)).toBeNull();
  });

  it('carries no CSS-pixel threshold: that belongs to the reader, not to storage', () => {
    const tiny = normalizeDragRectangle(0.5, 0.5, 0.5001, 0.5001);
    expect(tiny).not.toBeNull();
    expect(tiny!.width).toBeGreaterThan(0);
    expect(TOLERANCE).toBe(1e-9);
  });
});
