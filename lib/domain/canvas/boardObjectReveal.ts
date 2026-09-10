import type { WorldRect } from '@/components/collabboard/canvas/minimap/freeformMinimapGeometry';

/**
 * "Show me that thing on the board" -- as a request, not as a camera move.
 *
 * A backlink in the PDF reader names a Note by id and nothing more. It knows
 * nothing about layouts, cameras or world coordinates, and it should not: the
 * surface that owns the board decides HOW to reveal, and today only Freeform
 * knows how. So the reader asks, and the board answers -- the same shape the
 * existing cross-surface requests already use (a monotonic id plus the target).
 *
 * The id is what makes it an EVENT rather than a state. Revealing the same
 * Note twice must move the camera twice, and a consumer that compared target
 * ids alone would ignore the second ask. Consumers therefore key off
 * `requestId`, which is fresh every time.
 *
 * Nothing here reads the DOM, mutates a post, or moves anything. This module
 * answers one question -- how far would the camera have to travel -- and the
 * caller decides what to do with the answer.
 */

/** One ask. `requestId` is the identity; the target alone never is. */
export interface BoardObjectRevealRequest {
  readonly requestId: number;
  readonly targetPadletId: string;
}

/** A world-space camera move, in the units `panByWorldDelta` expects. */
export interface WorldPanDelta {
  readonly dx: number;
  readonly dy: number;
}

/** No move at all -- the honest answer when the target is already on screen. */
export const NO_PAN: WorldPanDelta = { dx: 0, dy: 0 };

function isUsableRect(rect: WorldRect | null | undefined): rect is WorldRect {
  return !!rect
    && Number.isFinite(rect.x)
    && Number.isFinite(rect.y)
    && Number.isFinite(rect.width)
    && Number.isFinite(rect.height)
    && rect.width > 0
    && rect.height > 0;
}

/**
 * Is the target already wholly inside the viewport?
 *
 * Used to decide whether to move at all. A Note the reader can already see
 * should not lurch across the screen just because someone asked where it is.
 */
export function isFullyVisible(target: WorldRect, viewport: WorldRect): boolean {
  return target.x >= viewport.x
    && target.y >= viewport.y
    && target.x + target.width <= viewport.x + viewport.width
    && target.y + target.height <= viewport.y + viewport.height;
}

/**
 * How far the Freeform camera must travel to bring `target` into view.
 *
 * Centres the target, which is the same centring the minimap's click-to-
 * navigate already performs -- one reveal semantic on this board, not two.
 *
 * Returns `null` when the question cannot be answered: an unplaced Note, a
 * viewport that has not been measured, a torn rect. Null means "do not move",
 * never "move to the origin" -- panning to arbitrary coordinates because a
 * number was missing is the one outcome worse than doing nothing.
 */
export function resolveRevealPanDelta(
  target: WorldRect | null | undefined,
  viewport: WorldRect | null | undefined,
): WorldPanDelta | null {
  if (!isUsableRect(target) || !isUsableRect(viewport)) return null;
  if (isFullyVisible(target, viewport)) return NO_PAN;

  const targetCentre = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
  const viewportCentre = { x: viewport.x + viewport.width / 2, y: viewport.y + viewport.height / 2 };

  return {
    dx: targetCentre.x - viewportCentre.x,
    dy: targetCentre.y - viewportCentre.y,
  };
}

/** The minimum of a post this resolver reads: identity, type, parent link. */
export interface RevealCandidatePost {
  readonly id: string;
  readonly type?: string | null;
  readonly metadata?: { readonly parentId?: unknown } | null;
}

/** How deep a container nest may be before we stop walking and refuse. */
const MAX_CONTAINER_DEPTH = 16;

/**
 * What this post's `parentId` says about who owns it.
 *
 * Three answers, not two, because the Freeform renderer only asks one question:
 * `padlets.filter(p => !p.metadata?.parentId)`. ANY truthy value takes a post
 * out of the root render, including one that is not a usable id at all.
 *
 * So a truthy non-string is not "no parent" -- it is a post the board is
 * drawing somewhere inside something, described by metadata we cannot read.
 * Collapsing that to "no parent" would send the camera to the child's own
 * coordinates, which are exactly the stale ones it stopped being drawn at.
 */
type ParentLink =
  | { readonly kind: 'none' }
  | { readonly kind: 'id'; readonly parentId: string }
  | { readonly kind: 'malformed' };

function parentLinkOf(post: RevealCandidatePost): ParentLink {
  const parentId = post.metadata?.parentId;
  // Falsy is precisely what the root filter treats as unparented -- including
  // the empty string, which is why this is a truthiness test and not a null
  // check.
  if (!parentId) return { kind: 'none' };
  if (typeof parentId === 'string') return { kind: 'id', parentId };
  // Truthy, but nothing we can look up. We do not guess, and we do not repair.
  return { kind: 'malformed' };
}

/**
 * WHICH post's geometry describes where this Note is actually on screen.
 *
 * A Note grouped into a container is dropped from `rootPadlets` and drawn
 * inside its parent, but `attachPostToContainer` only writes metadata -- the
 * child keeps whatever `position_x/position_y` it had when it was loose. Those
 * coordinates are therefore a record of where the Note USED to be, and reading
 * them sends the camera somewhere the Note demonstrably is not.
 *
 * So the anchor is the outermost ancestor that is actually rendered: walk the
 * `parentId` chain to the container nobody else contains, and use that. V1
 * deliberately stops there rather than centring the exact card inside the
 * container -- the container is where the Note visibly is, and that is a true
 * answer. Inventing nested child world coordinates to do better would be a
 * persistence change, not a navigation one.
 *
 * Returns null whenever the chain cannot be trusted: a malformed `parentId`
 * that is truthy but not a usable id, a parent that is not on the board, a
 * `parentId` pointing at something that is not a container, a cycle, or a nest
 * deeper than anything real. Null means do not move. Falling back to the
 * child's stale coordinates would be the one wrong answer -- it looks like
 * success and lands the camera in the wrong place.
 */
export function resolveRevealAnchorPost<T extends RevealCandidatePost>(
  target: T | null | undefined,
  allPosts: readonly T[],
): T | null {
  if (!target) return null;

  let current: T = target;
  const seen = new Set<string>([target.id]);

  for (let depth = 0; depth < MAX_CONTAINER_DEPTH; depth += 1) {
    const link = parentLinkOf(current);
    // Nobody contains this one: it is drawn at its own coordinates.
    if (link.kind === 'none') return current;
    // Owned by something we cannot name. The renderer has already taken this
    // post out of the root layer, so its own coordinates describe where it no
    // longer is -- refuse rather than pan to them.
    if (link.kind === 'malformed') return null;

    const parent = allPosts.find((post) => post.id === link.parentId);
    // Metadata says "I live inside something" and that something is not here.
    // We do not know where this Note is drawn, so we do not guess.
    if (!parent) return null;
    if (parent.type !== 'container') return null;
    if (seen.has(parent.id)) return null;

    seen.add(parent.id);
    current = parent;
  }

  return null;
}
