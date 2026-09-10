import { describe, expect, it } from 'vitest';
import {
  NO_PAN,
  isFullyVisible,
  resolveRevealAnchorPost,
  resolveRevealPanDelta,
  type BoardObjectRevealRequest,
} from './boardObjectReveal';
import { getFallbackMinimapItem } from '@/components/collabboard/canvas/minimap/useFreeformMinimapGeometry';
import type { Padlet } from '@/types/collabboard';

/**
 * "Show on board" -- the arithmetic, exercised directly.
 *
 * The camera itself (`panByWorldDelta`) is the minimap's, already proven. What
 * is new is the answer handed to it: how far to travel, and when the honest
 * answer is "not at all" or "I cannot say".
 */
const viewport = { x: 0, y: 0, width: 1000, height: 800 };

describe('how far the camera must travel to reveal a Note', () => {
  it('centres a target that is off screen', () => {
    // Target centre (2100, 1600); viewport centre (500, 400).
    const target = { x: 2000, y: 1500, width: 200, height: 200 };
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: 1600, dy: 1200 });
  });

  it('centres a target that is off screen in the negative direction too', () => {
    const target = { x: -1200, y: -900, width: 200, height: 100 };
    // Centre (-1100, -850) minus viewport centre (500, 400).
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: -1600, dy: -1250 });
  });

  it('does not move at all for a Note already wholly on screen', () => {
    // The reader can already see it. Lurching the board across the screen to
    // "reveal" something visible would be worse than doing nothing.
    const target = { x: 100, y: 100, width: 200, height: 200 };
    expect(isFullyVisible(target, viewport)).toBe(true);
    expect(resolveRevealPanDelta(target, viewport)).toEqual(NO_PAN);
  });

  it('DOES move for a Note only partly on screen', () => {
    // Straddling the right edge: partly visible is not visible.
    const target = { x: 900, y: 100, width: 400, height: 200 };
    expect(isFullyVisible(target, viewport)).toBe(false);
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: 600, dy: -200 });
  });

  it('treats exact edge containment as visible', () => {
    const target = { x: 0, y: 0, width: 1000, height: 800 };
    expect(resolveRevealPanDelta(target, viewport)).toEqual(NO_PAN);
  });

  it('a bigger-than-viewport target is centred, not refused', () => {
    const target = { x: -500, y: -500, width: 4000, height: 4000 };
    expect(resolveRevealPanDelta(target, viewport)).toEqual({ dx: 1000, dy: 1100 });
  });
});

describe('nothing unmeasurable ever moves the camera', () => {
  it('an unplaced Note yields no pan', () => {
    // `getFallbackMinimapItem` returns null for a post with no usable
    // position; null must mean stay put, never "pan to the origin".
    expect(resolveRevealPanDelta(null, viewport)).toBeNull();
    expect(resolveRevealPanDelta(undefined, viewport)).toBeNull();
  });

  it('an unmeasured viewport yields no pan', () => {
    const target = { x: 10, y: 10, width: 10, height: 10 };
    expect(resolveRevealPanDelta(target, null)).toBeNull();
    expect(resolveRevealPanDelta(target, undefined)).toBeNull();
  });

  it('a torn rect yields no pan rather than NaN coordinates', () => {
    const target = { x: 10, y: 10, width: 100, height: 100 };
    for (const broken of [
      { x: NaN, y: 0, width: 100, height: 100 },
      { x: 0, y: Infinity, width: 100, height: 100 },
      { x: 0, y: 0, width: 0, height: 100 },
      { x: 0, y: 0, width: 100, height: -5 },
    ]) {
      expect(resolveRevealPanDelta(broken, viewport), JSON.stringify(broken)).toBeNull();
      expect(resolveRevealPanDelta(target, broken), JSON.stringify(broken)).toBeNull();
    }
  });

  it('every refusal is null, never a zero pan that looks like success', () => {
    // NO_PAN means "already visible"; null means "cannot answer". A caller
    // that conflated them would report a successful reveal of a Note it never
    // located.
    expect(resolveRevealPanDelta(null, viewport)).not.toEqual(NO_PAN);
  });
});

describe('a reveal is an event, not a state', () => {
  it('the same Note asked for twice carries two different ids', () => {
    // What stops the second ask being ignored as "no change".
    const first: BoardObjectRevealRequest = { requestId: 1, targetPadletId: 'note-a' };
    const second: BoardObjectRevealRequest = { requestId: 2, targetPadletId: 'note-a' };
    expect(second.targetPadletId).toBe(first.targetPadletId);
    expect(second.requestId).not.toBe(first.requestId);
  });
});

// ============================================================================
// Where the Note actually IS -- container children keep stale coordinates
// ============================================================================

/**
 * `attachPostToContainer` moves a Note into a container by writing metadata; it
 * does NOT rewrite the Note's `position_x/position_y`. A grouped Note therefore
 * still carries the coordinates it had while it was loose, and those
 * coordinates describe somewhere it is no longer drawn.
 *
 * The stale values below are deliberately far from the container, so an
 * implementation that reads the child's own position cannot pass by accident.
 */
const CONTAINER = { id: 'container-1', type: 'container', position_x: 2000, position_y: 1500, width: 400, height: 300 };
const STALE_CHILD = {
  id: 'note-child',
  type: 'text',
  position_x: 9000,
  position_y: 9000,
  width: 280,
  height: 280,
  metadata: { parentId: 'container-1' },
};
const LOOSE_NOTE = { id: 'note-loose', type: 'text', position_x: 500, position_y: 400, width: 280, height: 280 };

describe('reveal anchors on the post that is actually rendered', () => {
  it('1. a standalone Note anchors on itself', () => {
    const posts = [LOOSE_NOTE, CONTAINER, STALE_CHILD];
    expect(resolveRevealAnchorPost(LOOSE_NOTE, posts)).toBe(LOOSE_NOTE);
  });

  it('2. a container child anchors on its container, NOT its stale position', () => {
    const posts = [LOOSE_NOTE, CONTAINER, STALE_CHILD];
    const anchor = resolveRevealAnchorPost(STALE_CHILD, posts);
    expect(anchor).toBe(CONTAINER);
    expect(anchor?.id).not.toBe(STALE_CHILD.id);
  });

  it('2b. the resulting pan points at the container, and nowhere near (9000, 9000)', () => {
    // The whole defect, end to end through the real geometry helper.
    const posts = [LOOSE_NOTE, CONTAINER, STALE_CHILD];
    const viewportRect = { x: 0, y: 0, width: 1000, height: 800 };

    const anchor = resolveRevealAnchorPost(STALE_CHILD, posts);
    const corrected = resolveRevealPanDelta(getFallbackMinimapItem(anchor as unknown as Padlet), viewportRect);
    // Container centre (2200, 1650) minus viewport centre (500, 400).
    expect(corrected).toEqual({ dx: 1700, dy: 1250 });

    // What the defect used to do: read the child's own coordinates. The exact
    // figure depends on the fallback's per-type sizing and is not the point --
    // that it lands thousands of world units away is.
    const stale = resolveRevealPanDelta(getFallbackMinimapItem(STALE_CHILD as unknown as Padlet), viewportRect);
    expect(stale).not.toBeNull();
    expect(stale!.dx).toBeGreaterThan(8000);
    expect(stale!.dy).toBeGreaterThan(8000);
    // The two answers are nothing alike -- this is not an off-by-a-little bug.
    expect(corrected).not.toEqual(stale);
  });

  it('3. a parentId whose parent is absent reveals nothing at all', () => {
    // Metadata says the Note lives inside something that is not on this board.
    // We do not know where it is drawn, so we do not move -- and above all we
    // do not fall back to the stale child coordinates.
    const orphan = { ...STALE_CHILD, metadata: { parentId: 'container-gone' } };
    expect(resolveRevealAnchorPost(orphan, [orphan, LOOSE_NOTE])).toBeNull();
    expect(resolveRevealPanDelta(null, { x: 0, y: 0, width: 1000, height: 800 })).toBeNull();
  });

  it('4. a parentId pointing at something that is not a container reveals nothing', () => {
    // `type === 'container'` is the real distinction the renderer makes.
    const notAContainer = { id: 'container-1', type: 'text', position_x: 100, position_y: 100 };
    expect(resolveRevealAnchorPost(STALE_CHILD, [STALE_CHILD, notAContainer])).toBeNull();
  });

  it('nested containers anchor on the outermost rendered one', () => {
    const outer = { id: 'outer', type: 'container', position_x: 10, position_y: 10 };
    const inner = { id: 'inner', type: 'container', position_x: 7000, position_y: 7000, metadata: { parentId: 'outer' } };
    const child = { id: 'deep-note', type: 'text', position_x: 9000, position_y: 9000, metadata: { parentId: 'inner' } };
    expect(resolveRevealAnchorPost(child, [outer, inner, child])).toBe(outer);
  });

  it('a parentId cycle refuses rather than looping forever', () => {
    const a = { id: 'a', type: 'container', metadata: { parentId: 'b' } };
    const b = { id: 'b', type: 'container', metadata: { parentId: 'a' } };
    expect(resolveRevealAnchorPost(a, [a, b])).toBeNull();
  });

  it('a self-referencing parentId refuses', () => {
    const selfish = { id: 'self', type: 'text', metadata: { parentId: 'self' } };
    expect(resolveRevealAnchorPost(selfish, [selfish])).toBeNull();
  });

  it('an absent target refuses, and a blank parentId is treated as loose', () => {
    expect(resolveRevealAnchorPost(null, [])).toBeNull();
    expect(resolveRevealAnchorPost(undefined, [])).toBeNull();
    const blank = { id: 'blank', type: 'text', metadata: { parentId: '' } };
    expect(resolveRevealAnchorPost(blank, [blank])).toBe(blank);
    const bogus = { id: 'bogus', type: 'text', metadata: { parentId: 42 } };
    expect(resolveRevealAnchorPost(bogus, [bogus])).toBe(bogus);
  });
});
