import { describe, expect, it } from 'vitest';
import {
  clampGroupDragDeltaToFreeformBounds,
  clampRectPositionToFreeformBounds,
  FREEFORM_SIGNED_WORLD_HEIGHT,
  FREEFORM_SIGNED_WORLD_WIDTH,
  FREEFORM_SNAP_GRID_SIZE,
  FREEFORM_WORLD_HEIGHT_PX,
  FREEFORM_WORLD_MAX_X,
  FREEFORM_WORLD_MAX_Y,
  FREEFORM_WORLD_MIN_X,
  FREEFORM_WORLD_MIN_Y,
  FREEFORM_WORLD_ORIGIN_OFFSET_X,
  FREEFORM_WORLD_ORIGIN_OFFSET_Y,
  FREEFORM_WORLD_WIDTH_PX,
  FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX,
  FREEFORM_SPACING_GUIDE_MAX_DISTANCE_SCREEN_PX,
  detectHorizontalAlignmentGuide,
  detectHorizontalAlignmentMatch,
  detectHorizontalSpacingGap,
  detectVerticalAlignmentGuide,
  detectVerticalAlignmentMatch,
  detectVerticalSpacingGap,
  snapWorldValueToGrid,
} from './freeformStageGeometry';

// PATCH 9J -- single source of truth for the Freeform world-stage size,
// shared by the post stage (FreeformPadletCards.tsx) and the Line
// interaction layers (CanvasClient.tsx). See freeformLineWorldStage
// .architecture.test.tsx for the proof that both files actually import
// and use these exact constants.
describe('freeformStageGeometry', () => {
  it('exposes positive, finite world-stage dimensions', () => {
    expect(FREEFORM_WORLD_WIDTH_PX).toBe(10000);
    expect(FREEFORM_WORLD_HEIGHT_PX).toBe(10000);
    expect(Number.isFinite(FREEFORM_WORLD_WIDTH_PX)).toBe(true);
    expect(Number.isFinite(FREEFORM_WORLD_HEIGHT_PX)).toBe(true);
  });

  it('defines the finite signed world independently from the original logical region', () => {
    expect([FREEFORM_WORLD_MIN_X, FREEFORM_WORLD_MIN_Y]).toEqual([-5000, -5000]);
    expect([FREEFORM_WORLD_MAX_X, FREEFORM_WORLD_MAX_Y]).toEqual([15000, 15000]);
    expect([FREEFORM_SIGNED_WORLD_WIDTH, FREEFORM_SIGNED_WORLD_HEIGHT]).toEqual([20000, 20000]);
    expect([FREEFORM_WORLD_ORIGIN_OFFSET_X, FREEFORM_WORLD_ORIGIN_OFFSET_Y]).toEqual([5000, 5000]);
  });

  it.each([
    [-5000, -5000, true],
    [-4500, -4500, true],
    [-1000, -500, true],
    [-100, -100, true],
    [14900, 14900, true],
    [15000, 15000, true],
    [-5001, -5001, false],
    [15001, 15001, false],
  ])('characterizes signed-stage point (%s,%s)', (x, y, inside) => {
    const isInside = x >= FREEFORM_WORLD_MIN_X && x <= FREEFORM_WORLD_MAX_X
      && y >= FREEFORM_WORLD_MIN_Y && y <= FREEFORM_WORLD_MAX_Y;
    expect(isInside).toBe(inside);
  });
});

// PATCH 9V.2B -- the placement contract itself. Everything that may write a
// root post's world position (drag, create, drop, detach, paste, duplicate,
// synced copy, new column) resolves through these two functions, so their
// behaviour IS the product rule "objects live in the signed world, never in
// the outer camera gutter".
describe('PATCH 9V.2B: clampRectPositionToFreeformBounds [matrix 1-10]', () => {
  const NOTE = { width: 180, height: 220 };

  it('leaves a point that is already inside the signed world untouched [1]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 1200, y: 640, ...NOTE })).toEqual({ x: 1200, y: 640 });
  });

  it('accepts a negative x [2]', () => {
    expect(clampRectPositionToFreeformBounds({ x: -300, y: 640, ...NOTE })).toEqual({ x: -300, y: 640 });
  });

  it('accepts a negative y [3]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 1200, y: -300, ...NOTE })).toEqual({ x: 1200, y: -300 });
  });

  it('accepts both coordinates negative [4]', () => {
    expect(clampRectPositionToFreeformBounds({ x: -4500, y: -4500, ...NOTE })).toEqual({ x: -4500, y: -4500 });
  });

  it('clamps a left underflow to the world minimum [5]', () => {
    expect(clampRectPositionToFreeformBounds({ x: -6000, y: 0, ...NOTE }).x).toBe(FREEFORM_WORLD_MIN_X);
  });

  it('clamps a top underflow to the world minimum [6]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 0, y: -6000, ...NOTE }).y).toBe(FREEFORM_WORLD_MIN_Y);
  });

  it('bounds the RIGHT edge, not the left corner, at the max side [7]', () => {
    // A 180-wide post's top-left may only reach 15000 - 180 = 14820.
    expect(clampRectPositionToFreeformBounds({ x: 14950, y: 0, ...NOTE }).x).toBe(14820);
    expect(clampRectPositionToFreeformBounds({ x: 14820, y: 0, ...NOTE }).x).toBe(14820);
    expect(clampRectPositionToFreeformBounds({ x: 14819, y: 0, ...NOTE }).x).toBe(14819);
  });

  it('bounds the BOTTOM edge, not the top corner, at the max side [8]', () => {
    expect(clampRectPositionToFreeformBounds({ x: 0, y: 14950, ...NOTE }).y).toBe(15000 - 220);
  });

  it('anchors an over-wide object at the world minimum instead of inverting the range [9]', () => {
    const oversized = clampRectPositionToFreeformBounds({
      x: 0,
      y: 0,
      width: FREEFORM_SIGNED_WORLD_WIDTH + 5000,
      height: 220,
    });
    expect(oversized.x).toBe(FREEFORM_WORLD_MIN_X);
    expect(oversized.y).toBe(0);
  });

  it('anchors an over-tall object at the world minimum instead of inverting the range [10]', () => {
    const oversized = clampRectPositionToFreeformBounds({
      x: 0,
      y: 0,
      width: 180,
      height: FREEFORM_SIGNED_WORLD_HEIGHT + 5000,
    });
    expect(oversized.y).toBe(FREEFORM_WORLD_MIN_Y);
    expect(oversized.x).toBe(0);
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['NaN', Number.NaN],
    ['negative', -50],
    ['zero', 0],
  ])('treats a %s dimension as a zero span rather than poisoning the clamp', (_label, size) => {
    expect(clampRectPositionToFreeformBounds({ x: 14950, y: -6000, width: size, height: size }))
      .toEqual({ x: 14950, y: FREEFORM_WORLD_MIN_Y });
  });

  it('falls back to 0 for a non-finite coordinate instead of emitting NaN', () => {
    expect(clampRectPositionToFreeformBounds({ x: Number.NaN, y: Number.NaN, ...NOTE }))
      .toEqual({ x: 0, y: 0 });
  });
});

describe('PATCH 9V.2B: clampGroupDragDeltaToFreeformBounds [matrix 26-30, 38]', () => {
  // Two posts 500 apart; the group spans x 200..1080 (rightmost is 180 wide).
  const GROUP = { minX: 200, minY: 200, maxX: 1080, maxY: 920 };

  it('passes an unobstructed delta through unchanged [26]', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: -1500, dy: -900 }))
      .toEqual({ dx: -1500, dy: -900 });
  });

  it('clamps the delta ONCE at the left edge, by the group minimum [27]', () => {
    // minX 200 may travel to -5000, i.e. dx >= -5200.
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: -9000, dy: 0 }).dx).toBe(-5200);
  });

  it('clamps the delta at the right edge, by the group MAXIMUM [28]', () => {
    // maxX 1080 may travel to 15000, i.e. dx <= 13920.
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: 99999, dy: 0 }).dx).toBe(13920);
  });

  it('clamps the delta at the top edge [29]', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: 0, dy: -9000 }).dy).toBe(-5200);
  });

  it('clamps the delta at the bottom edge [30]', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: 0, dy: 99999 }).dy).toBe(15000 - 920);
  });

  it('reproduces the specification worked example (group minX -4900, dx -500 -> -100)', () => {
    const bounds = { minX: -4900, minY: 0, maxX: -4720, maxY: 220 };
    expect(clampGroupDragDeltaToFreeformBounds(bounds, { dx: -500, dy: 0 }).dx).toBe(-100);
  });

  it('anchors an oversized group at the world minimum rather than inverting the range', () => {
    const huge = { minX: -4000, minY: -4000, maxX: 25000, maxY: 25000 };
    // Lower bound (-1000) exceeds the upper bound (-10000): min-side wins.
    expect(clampGroupDragDeltaToFreeformBounds(huge, { dx: 0, dy: 0 }))
      .toEqual({ dx: -1000, dy: -1000 });
  });

  it('substitutes 0 for a non-finite requested delta', () => {
    expect(clampGroupDragDeltaToFreeformBounds(GROUP, { dx: Number.NaN, dy: Number.NaN }))
      .toEqual({ dx: 0, dy: 0 });
  });
});

// PATCH SNAP-GRID-B -- the drag-movement snap primitive. WORLD-space only,
// never scaled by canvasZoom (that scaling belongs solely to the dot grid's
// own rendering, PATCH SNAP-GRID-A).
describe('PATCH SNAP-GRID-B: snapWorldValueToGrid', () => {
  it('grid spacing is 20 world units', () => {
    expect(FREEFORM_SNAP_GRID_SIZE).toBe(20);
  });

  it.each([
    [0, 0],
    [10, 20],
    [9, 0],
    [20, 20],
    [21, 20],
    [29, 20],
    [30, 40],
    [1234, 1240],
  ])('snaps %s to %s', (value, expected) => {
    expect(snapWorldValueToGrid(value)).toBe(expected);
  });

  it.each([
    [-13, -20],
    [-27, -20],
    [-10, -0],
    [-9, -0],
    [-11, -20],
    [-30, -20],
    [-31, -40],
  ])('snaps negative %s to %s (Math.round semantics, no positive-only assumption)', (value, expected) => {
    expect(snapWorldValueToGrid(value)).toBe(expected);
  });

  it('produces the same WORLD-coordinate snap regardless of any zoom factor (the function takes no zoom parameter at all)', () => {
    // snapWorldValueToGrid has a single (value: number) signature -- there is
    // no way to pass canvasZoom into it, which is the structural guarantee
    // that callers cannot accidentally scale the grid by zoom.
    expect(snapWorldValueToGrid.length).toBe(1);
    expect(snapWorldValueToGrid(437)).toBe(440);
  });
});

// PATCH ALIGN-B -- pure unit coverage of the detection function in
// isolation (no drag/DOM involved at all). The mounted-drag proof of the
// same behavior lives in freeformAlignmentGuideDetection.test.tsx.
describe('detectVerticalAlignmentGuide', () => {
  const dragged = { x: 500, width: 100 }; // left=500, center=550, right=600

  it('matches a left edge within tolerance and returns the OTHER rect\'s edge value', () => {
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 503, width: 180 }], 6);
    expect(result).toBe(503);
  });

  it('matches a center within tolerance', () => {
    // other center = 460 + 180/2 = 550, exact match against dragged center 550
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 460, width: 180 }], 6);
    expect(result).toBe(550);
  });

  it('matches a right edge within tolerance', () => {
    // other: x=420, width=180 -> right=600, exact match against dragged right 600
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 420, width: 180 }], 6);
    expect(result).toBe(600);
  });

  it('returns null when nothing is within tolerance', () => {
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 900, width: 50 }], 6);
    expect(result).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(detectVerticalAlignmentGuide(dragged, [], 6)).toBeNull();
  });

  it('picks the strictly nearest match across multiple candidates and multiple edge types', () => {
    const result = detectVerticalAlignmentGuide(dragged, [
      { x: 505, width: 180 }, // left distance 5
      { x: 498, width: 180 }, // left distance 2 -- nearest
      { x: 900, width: 50 },  // far away, irrelevant
    ], 6);
    expect(result).toBe(498);
  });

  it('a value exactly AT the tolerance boundary counts as a match (<=, not <)', () => {
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 506, width: 180 }], 6); // distance exactly 6
    expect(result).toBe(506);
  });

  it('does not cross-match different edge types (dragged left is never compared to another center/right)', () => {
    // other rect positioned so its CENTER lands exactly on dragged's LEFT --
    // must NOT count as a match, since only same-type pairs are compared.
    const other = { x: 500 - 90, width: 180 }; // center = 500
    expect(detectVerticalAlignmentGuide(dragged, [other], 6)).toBeNull();
  });

  // PATCH ALIGN-E: horizontal adjacency -- posts butted up side by side.
  it('right -> left adjacency: dragged right edge close to another rect\'s left edge matches', () => {
    // other.x = 603 -> left = 603, 3 units from dragged.right = 600
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 603, width: 180 }], 6);
    expect(result).toBe(603);
  });

  it('left -> right adjacency: dragged left edge close to another rect\'s right edge matches', () => {
    // other: x=298, width=200 -> right=498, 2 units from dragged.left = 500
    const result = detectVerticalAlignmentGuide(dragged, [{ x: 298, width: 200 }], 6);
    expect(result).toBe(498);
  });

  it('adjacency and same-edge candidates compete on the same nearest-wins search', () => {
    const result = detectVerticalAlignmentGuide(dragged, [
      { x: 505, width: 180 },  // left-left distance 5
      { x: 602, width: 180 },  // right-left (adjacency) distance 2 -- nearest
    ], 6);
    expect(result).toBe(602);
  });

  it('FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX is a small positive screen-pixel constant, not pre-divided by any zoom', () => {
    expect(FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX).toBeGreaterThan(0);
    expect(FREEFORM_ALIGNMENT_GUIDE_TOLERANCE_SCREEN_PX).toBeLessThan(20);
  });
});

// PATCH ALIGN-E2: detectVerticalAlignmentMatch is the richer sibling behind
// detectVerticalAlignmentGuide -- same nearest-wins search, but the winner
// also reports whether an adjacency pair (not a same-edge/center pair)
// produced it. detectVerticalAlignmentGuide's own tests above already prove
// the VALUE math is unchanged (byte-identical wrapper); these tests only
// pin the NEW isAdjacency classification.
describe('detectVerticalAlignmentMatch', () => {
  const dragged = { x: 500, width: 100 }; // left=500, center=550, right=600

  it('a same-edge match reports isAdjacency: false', () => {
    const result = detectVerticalAlignmentMatch(dragged, [{ x: 503, width: 180 }], 6);
    expect(result).toEqual({ value: 503, isAdjacency: false });
  });

  it('a center match reports isAdjacency: false', () => {
    const result = detectVerticalAlignmentMatch(dragged, [{ x: 460, width: 180 }], 6);
    expect(result).toEqual({ value: 550, isAdjacency: false });
  });

  it('a right->left adjacency match reports isAdjacency: true', () => {
    const result = detectVerticalAlignmentMatch(dragged, [{ x: 603, width: 180 }], 6);
    expect(result).toEqual({ value: 603, isAdjacency: true });
  });

  it('a left->right adjacency match reports isAdjacency: true', () => {
    const result = detectVerticalAlignmentMatch(dragged, [{ x: 298, width: 200 }], 6);
    expect(result).toEqual({ value: 498, isAdjacency: true });
  });

  it('returns null (not a match object) when nothing qualifies', () => {
    expect(detectVerticalAlignmentMatch(dragged, [{ x: 900, width: 50 }], 6)).toBeNull();
  });

  it('when an adjacency match is nearer than a same-edge match, the winner is correctly flagged isAdjacency: true', () => {
    const result = detectVerticalAlignmentMatch(dragged, [
      { x: 505, width: 180 },  // left-left (same-edge) distance 5
      { x: 602, width: 180 },  // right-left (adjacency) distance 2 -- nearest
    ], 6);
    expect(result).toEqual({ value: 602, isAdjacency: true });
  });

  it('when a same-edge match is nearer than an adjacency match, the winner is correctly flagged isAdjacency: false', () => {
    const result = detectVerticalAlignmentMatch(dragged, [
      { x: 498, width: 180 },  // left-left (same-edge) distance 2 -- nearest
      { x: 605, width: 180 },  // right-left (adjacency) distance 5
    ], 6);
    expect(result).toEqual({ value: 498, isAdjacency: false });
  });

  it('the ambiguous-value case: same-edge-left and adjacency-right-left can target the SAME otherLeft -- the actually-nearer draggedValue decides the flag, not the value alone', () => {
    // other.x = 500 -> otherLeft = 500. dragged.left (500) matches it at
    // distance 0 (same-edge); dragged.right (600) is 100 away (would-be
    // adjacency, but only same-edge is ever close enough here). The value
    // 500 is reachable via EITHER pair type, so this proves classification
    // reads the winning pair's own type, not just the resulting number.
    const result = detectVerticalAlignmentMatch(dragged, [{ x: 500, width: 50 }], 6);
    expect(result).toEqual({ value: 500, isAdjacency: false });
  });

  it('detectVerticalAlignmentGuide (the plain-number API) stays byte-identical to detectVerticalAlignmentMatch(...)?.value', () => {
    const others = [{ x: 603, width: 180 }, { x: 505, width: 180 }];
    expect(detectVerticalAlignmentGuide(dragged, others, 6)).toBe(detectVerticalAlignmentMatch(dragged, others, 6)?.value);
  });
});

// PATCH ALIGN-C: exact Y-axis counterpart of detectVerticalAlignmentGuide
// above -- same tolerance semantics, same nearest-wins tie-break, same
// same-type-only matching, mirrored test-for-test.
describe('detectHorizontalAlignmentGuide', () => {
  const dragged = { y: 500, height: 100 }; // top=500, center=550, bottom=600

  it('matches a top edge within tolerance and returns the OTHER rect\'s edge value', () => {
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 503, height: 180 }], 6);
    expect(result).toBe(503);
  });

  it('matches a center within tolerance', () => {
    // other center = 460 + 180/2 = 550, exact match against dragged center 550
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 460, height: 180 }], 6);
    expect(result).toBe(550);
  });

  it('matches a bottom edge within tolerance', () => {
    // other: y=420, height=180 -> bottom=600, exact match against dragged bottom 600
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 420, height: 180 }], 6);
    expect(result).toBe(600);
  });

  it('returns null when nothing is within tolerance', () => {
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 900, height: 50 }], 6);
    expect(result).toBeNull();
  });

  it('returns null for an empty candidate list', () => {
    expect(detectHorizontalAlignmentGuide(dragged, [], 6)).toBeNull();
  });

  it('picks the strictly nearest match across multiple candidates and multiple edge types', () => {
    const result = detectHorizontalAlignmentGuide(dragged, [
      { y: 505, height: 180 }, // top distance 5
      { y: 498, height: 180 }, // top distance 2 -- nearest
      { y: 900, height: 50 },  // far away, irrelevant
    ], 6);
    expect(result).toBe(498);
  });

  it('a value exactly AT the tolerance boundary counts as a match (<=, not <)', () => {
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 506, height: 180 }], 6); // distance exactly 6
    expect(result).toBe(506);
  });

  it('does not cross-match different edge types (dragged top is never compared to another center/bottom)', () => {
    // other rect positioned so its CENTER lands exactly on dragged's TOP --
    // must NOT count as a match, since only same-type pairs are compared.
    const other = { y: 500 - 90, height: 180 }; // center = 500
    expect(detectHorizontalAlignmentGuide(dragged, [other], 6)).toBeNull();
  });

  // PATCH ALIGN-E: vertical adjacency -- posts stacked with no gap.
  it('bottom -> top adjacency: dragged bottom edge close to another rect\'s top edge matches', () => {
    // other.y = 603 -> top = 603, 3 units from dragged.bottom = 600
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 603, height: 180 }], 6);
    expect(result).toBe(603);
  });

  it('top -> bottom adjacency: dragged top edge close to another rect\'s bottom edge matches', () => {
    // other: y=298, height=200 -> bottom=498, 2 units from dragged.top = 500
    const result = detectHorizontalAlignmentGuide(dragged, [{ y: 298, height: 200 }], 6);
    expect(result).toBe(498);
  });

  it('adjacency and same-edge candidates compete on the same nearest-wins search', () => {
    const result = detectHorizontalAlignmentGuide(dragged, [
      { y: 505, height: 180 },  // top-top distance 5
      { y: 602, height: 180 },  // bottom-top (adjacency) distance 2 -- nearest
    ], 6);
    expect(result).toBe(602);
  });
});

// PATCH ALIGN-E2: exact Y-axis counterpart of detectVerticalAlignmentMatch
// above -- same isAdjacency classification, mirrored test-for-test.
describe('detectHorizontalAlignmentMatch', () => {
  const dragged = { y: 500, height: 100 }; // top=500, center=550, bottom=600

  it('a same-edge match reports isAdjacency: false', () => {
    const result = detectHorizontalAlignmentMatch(dragged, [{ y: 503, height: 180 }], 6);
    expect(result).toEqual({ value: 503, isAdjacency: false });
  });

  it('a center match reports isAdjacency: false', () => {
    const result = detectHorizontalAlignmentMatch(dragged, [{ y: 460, height: 180 }], 6);
    expect(result).toEqual({ value: 550, isAdjacency: false });
  });

  it('a bottom->top adjacency match reports isAdjacency: true', () => {
    const result = detectHorizontalAlignmentMatch(dragged, [{ y: 603, height: 180 }], 6);
    expect(result).toEqual({ value: 603, isAdjacency: true });
  });

  it('a top->bottom adjacency match reports isAdjacency: true', () => {
    const result = detectHorizontalAlignmentMatch(dragged, [{ y: 298, height: 200 }], 6);
    expect(result).toEqual({ value: 498, isAdjacency: true });
  });

  it('returns null (not a match object) when nothing qualifies', () => {
    expect(detectHorizontalAlignmentMatch(dragged, [{ y: 900, height: 50 }], 6)).toBeNull();
  });

  it('when an adjacency match is nearer than a same-edge match, the winner is correctly flagged isAdjacency: true', () => {
    const result = detectHorizontalAlignmentMatch(dragged, [
      { y: 505, height: 180 },  // top-top (same-edge) distance 5
      { y: 602, height: 180 },  // bottom-top (adjacency) distance 2 -- nearest
    ], 6);
    expect(result).toEqual({ value: 602, isAdjacency: true });
  });

  it('when a same-edge match is nearer than an adjacency match, the winner is correctly flagged isAdjacency: false', () => {
    const result = detectHorizontalAlignmentMatch(dragged, [
      { y: 498, height: 180 },  // top-top (same-edge) distance 2 -- nearest
      { y: 605, height: 180 },  // bottom-top (adjacency) distance 5
    ], 6);
    expect(result).toEqual({ value: 498, isAdjacency: false });
  });

  it('detectHorizontalAlignmentGuide (the plain-number API) stays byte-identical to detectHorizontalAlignmentMatch(...)?.value', () => {
    const others = [{ y: 603, height: 180 }, { y: 505, height: 180 }];
    expect(detectHorizontalAlignmentGuide(dragged, others, 6)).toBe(detectHorizontalAlignmentMatch(dragged, others, 6)?.value);
  });
});

describe('PATCH SPACE-P1: FREEFORM_SPACING_GUIDE_MAX_DISTANCE_SCREEN_PX', () => {
  it('is 160', () => {
    expect(FREEFORM_SPACING_GUIDE_MAX_DISTANCE_SCREEN_PX).toBe(160);
  });
});

describe('PATCH SPACE-P1: detectHorizontalSpacingGap (X-axis, side-by-side)', () => {
  const dragged = { x: 0, y: 0, width: 100, height: 100 }; // right=100, top=0, bottom=100

  it('a neighbour to the RIGHT with sufficient Y overlap resolves the gap between the facing edges', () => {
    const result = detectHorizontalSpacingGap(dragged, [{ x: 150, y: 20, width: 80, height: 60 }], 1000);
    // overlapTop=max(0,20)=20, overlapBottom=min(100,80)=80 -> crossCenter 50
    expect(result).toEqual({ gapStart: 100, gapEnd: 150, crossCenter: 50, distance: 50 });
  });

  it('a neighbour to the LEFT resolves the same way, mirrored', () => {
    const draggedRight = { x: 200, y: 0, width: 100, height: 100 }; // left=200
    const result = detectHorizontalSpacingGap(draggedRight, [{ x: 50, y: 0, width: 100, height: 100 }], 1000);
    expect(result).toEqual({ gapStart: 150, gapEnd: 200, crossCenter: 50, distance: 50 });
  });

  it('overlapping on X (not side-by-side) never qualifies, regardless of Y', () => {
    expect(detectHorizontalSpacingGap(dragged, [{ x: 50, y: 0, width: 100, height: 100 }], 1000)).toBeNull();
  });

  it('touching (gap exactly 0) does not qualify -- this is a positive-gap measurement only', () => {
    expect(detectHorizontalSpacingGap(dragged, [{ x: 100, y: 0, width: 100, height: 100 }], 1000)).toBeNull();
  });

  it('a gap beyond maxDistanceWorld is excluded', () => {
    expect(detectHorizontalSpacingGap(dragged, [{ x: 250, y: 0, width: 100, height: 100 }], 100)).toBeNull();
    expect(detectHorizontalSpacingGap(dragged, [{ x: 200, y: 0, width: 100, height: 100 }], 100)).not.toBeNull();
  });

  it('a corner-only sliver overlap on the perpendicular (Y) axis is excluded', () => {
    // overlap = 5, shorter rect height = 100 -> ratio 0.05, below the 0.25 floor
    expect(detectHorizontalSpacingGap(dragged, [{ x: 150, y: 95, width: 80, height: 100 }], 1000)).toBeNull();
  });

  it('no Y overlap at all is excluded', () => {
    expect(detectHorizontalSpacingGap(dragged, [{ x: 150, y: 200, width: 80, height: 60 }], 1000)).toBeNull();
  });

  it('the nearest qualifying neighbour wins among several candidates', () => {
    const result = detectHorizontalSpacingGap(dragged, [
      { x: 300, y: 0, width: 50, height: 100 }, // gap 200
      { x: 130, y: 0, width: 50, height: 100 }, // gap 30 -- nearest
      { x: 180, y: 0, width: 50, height: 100 }, // gap 80
    ], 1000);
    expect(result).toEqual({ gapStart: 100, gapEnd: 130, crossCenter: 50, distance: 30 });
  });

  it('returns null when no candidates are given', () => {
    expect(detectHorizontalSpacingGap(dragged, [], 1000)).toBeNull();
  });
});

describe('PATCH SPACE-P1: detectVerticalSpacingGap (Y-axis, stacked)', () => {
  const dragged = { x: 0, y: 0, width: 100, height: 100 }; // bottom=100, left=0, right=100

  it('a neighbour BELOW with sufficient X overlap resolves the gap between the facing edges', () => {
    const result = detectVerticalSpacingGap(dragged, [{ x: 20, y: 150, width: 60, height: 80 }], 1000);
    // overlapLeft=max(0,20)=20, overlapRight=min(100,80)=80 -> crossCenter 50
    expect(result).toEqual({ gapStart: 100, gapEnd: 150, crossCenter: 50, distance: 50 });
  });

  it('a neighbour ABOVE resolves the same way, mirrored', () => {
    const draggedBelow = { x: 0, y: 200, width: 100, height: 100 }; // top=200
    const result = detectVerticalSpacingGap(draggedBelow, [{ x: 0, y: 50, width: 100, height: 100 }], 1000);
    expect(result).toEqual({ gapStart: 150, gapEnd: 200, crossCenter: 50, distance: 50 });
  });

  it('overlapping on Y (not stacked) never qualifies, regardless of X', () => {
    expect(detectVerticalSpacingGap(dragged, [{ x: 0, y: 50, width: 100, height: 100 }], 1000)).toBeNull();
  });

  it('touching (gap exactly 0) does not qualify', () => {
    expect(detectVerticalSpacingGap(dragged, [{ x: 0, y: 100, width: 100, height: 100 }], 1000)).toBeNull();
  });

  it('a gap beyond maxDistanceWorld is excluded', () => {
    expect(detectVerticalSpacingGap(dragged, [{ x: 0, y: 250, width: 100, height: 100 }], 100)).toBeNull();
    expect(detectVerticalSpacingGap(dragged, [{ x: 0, y: 200, width: 100, height: 100 }], 100)).not.toBeNull();
  });

  it('a corner-only sliver overlap on the perpendicular (X) axis is excluded', () => {
    expect(detectVerticalSpacingGap(dragged, [{ x: 95, y: 150, width: 100, height: 80 }], 1000)).toBeNull();
  });

  it('the nearest qualifying neighbour wins among several candidates', () => {
    const result = detectVerticalSpacingGap(dragged, [
      { x: 0, y: 300, width: 100, height: 50 }, // gap 200
      { x: 0, y: 130, width: 100, height: 50 }, // gap 30 -- nearest
      { x: 0, y: 180, width: 100, height: 50 }, // gap 80
    ], 1000);
    expect(result).toEqual({ gapStart: 100, gapEnd: 130, crossCenter: 50, distance: 30 });
  });
});
