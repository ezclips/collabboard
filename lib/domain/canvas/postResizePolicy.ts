import type { Padlet } from '@/types/collabboard';

// PATCH POST-RESIZE-B1: the ONE canonical resize capability for CollabBoard
// posts. Capability is derived from the post type alone (no metadata flag, no
// per-instance setting), so every renderer -- Freeform, Drawing, presentation
// -- can ask the same question and get the same answer.
//
// B1 exposes exactly two box-resizable types (image, ai-component). The rest
// of the matrix fills in later batches (B2/B3) behind the same API.

export type PostResizeMode = 'none' | 'horizontal-only' | 'box';

/**
 * B1 capability matrix.
 *
 * - image         -> box   (new in B1)
 * - ai-component  -> box   (existing AI resize moved onto the shared system)
 * - section_heading -> horizontal-only (SPECIAL: owned by the existing
 *   left/right handle implementation, never a bottom-right box handle)
 * - everything else -> none until its batch lands.
 */
export function getPostResizeCapability(post: Pick<Padlet, 'type'>): PostResizeMode {
  switch (post.type) {
    case 'image':
    case 'ai-component':
      return 'box';
    case 'section_heading':
      return 'horizontal-only';
    default:
      return 'none';
  }
}

export interface PostResizeConstraints {
  minWidth: number;
  minHeight: number;
}

/**
 * Per-type minimum geometry.
 *
 * - ai-component: 200x150 -- byte-for-byte the minimum the AI resize has
 *   enforced since its inception; preserving it is a B1 requirement.
 * - image: 100x100 -- there is no existing canonical minimum for Image posts;
 *   the content area already enforces `min-h-[100px]` in the Freeform renderer
 *   (FreeformPadletCards), so 100px is the smallest height the existing post
 *   shell renders without collapsing its image/caption chrome. 100px width is
 *   the smallest ergonomic card that keeps the grip usable. No maximum beyond
 *   the signed Freeform world extent, which the host passes in separately.
 */
export const POST_RESIZE_CONSTRAINTS: Record<string, PostResizeConstraints> = {
  image: { minWidth: 100, minHeight: 100 },
  'ai-component': { minWidth: 200, minHeight: 150 },
};

export function getPostResizeConstraints(post: Pick<Padlet, 'type'>): PostResizeConstraints | null {
  return POST_RESIZE_CONSTRAINTS[post.type] ?? null;
}

/**
 * True when BOTH canonical dimensions are finite positive numbers.
 *
 * This is a PURE GEOMETRY-VALIDITY CHECK ONLY -- it says nothing about
 * whether a post's stored width/height were ever intentionally set by a
 * resize gesture. Historically Image posts were created with generic stored
 * geometry (e.g. 300x200, 280x350, 300x400 template defaults) that the
 * pre-B1 renderer never actually consumed (it always rendered Images at a
 * fixed 360px presentation), so finite-positive alone CANNOT be treated as
 * proof of intentional sizing. Do not use this alone to gate Image
 * legacy-vs-explicit rendering -- see `isImageManuallySized` below, which is
 * the actual compatibility condition.
 */
export function hasValidPostResizeGeometry(width: unknown, height: unknown): boolean {
  return Number.isFinite(Number(width)) && Number(width) > 0
    && Number.isFinite(Number(height)) && Number(height) > 0;
}

/**
 * PATCH POST-RESIZE-B1.1: the ONE shared compatibility condition for Image
 * legacy-vs-explicit presentation. Both the Freeform renderer and the
 * minimap fallback geometry call this -- never re-derive the condition
 * separately -- so they can never disagree about which Image posts have
 * been explicitly resized.
 *
 * True only when the post carries `metadata.manualSize === true` AND its
 * stored width/height are valid geometry. `manualSize` alone (without valid
 * geometry) or valid geometry alone (without `manualSize`) both mean
 * "render the legacy presentation."
 */
export function isImageManuallySized(post: Pick<Padlet, 'width' | 'height' | 'metadata'>): boolean {
  return (post.metadata as { manualSize?: boolean } | undefined)?.manualSize === true
    && hasValidPostResizeGeometry(post.width, post.height);
}
