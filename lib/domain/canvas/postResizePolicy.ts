import type { Padlet } from '@/types/collabboard';
import { isDocumentPost } from '@/lib/domain/canvas/documentPost';

// PATCH POST-RESIZE-B1: the ONE canonical resize capability for CollabBoard
// posts. Capability is derived from the post type alone (no metadata flag, no
// per-instance setting), so every renderer -- Freeform, Drawing, presentation
// -- can ask the same question and get the same answer.
//
// PATCH POST-RESIZE-B2: the capability matrix extends to Note/Todo (box),
// Link/Table (horizontal-only) and Document/Clipart (box, both 'card' rows).
// Everything not listed stays 'none' until its batch lands.

export type PostResizeMode = 'none' | 'horizontal-only' | 'box';

/**
 * B1/B2 capability matrix.
 *
 * box:
 * - image, ai-component (B1)
 * - text/note, todo, card (Document AND Clipart) (B2)
 *
 * horizontal-only:
 * - link, table (B2) -- width is manual, height stays content-derived.
 * - section_heading -> horizontal-only SPECIAL: owned by the existing
 *   left/right handle implementation, never the shared bottom-right grip.
 *
 * none: container (B3), file, comment, drawing-in-freeform (B4), and every
 * other type.
 */
export function getPostResizeCapability(post: Pick<Padlet, 'type'>): PostResizeMode {
  switch (post.type) {
    case 'image':
    case 'ai-component':
    case 'text':
    case 'note':
    case 'todo':
    case 'card':
      return 'box';
    case 'link':
    case 'table':
      return 'horizontal-only';
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
 * Per-type minimum geometry (POST-RESIZE-B2 Phase 16). Derived from the
 * existing renderer, existing default geometry, and safe content layout --
 * deliberately NOT a universal minimum.
 *
 * - image: 100x100 (B1: content area already enforces min-h-[100px]).
 * - ai-component: 200x150 (B1: byte-for-byte the pre-existing AI minimum).
 * - text/note: 120x80 -- the narrowest usable text column; 80px matches the
 *   generic card shell's existing minHeight.
 * - todo: 160x100 -- checkbox rows need a readable text column, and the
 *   progress/count footer needs room at the smallest size.
 * - link: minWidth 240, height content-derived (horizontal-only: minHeight is
 *   unused and stays 0).
 * - table: minWidth 200, height content-derived (horizontal-only).
 * - card: Document vs Clipart differ because their content natures differ --
 *   a Document's paragraphs do not reflow usefully below the historical
 *   default 180x220, while a Clipart SVG scales freely (min 100x100, like
 *   Image).
 */
export const POST_RESIZE_CONSTRAINTS: Record<string, PostResizeConstraints> = {
  image: { minWidth: 100, minHeight: 100 },
  'ai-component': { minWidth: 200, minHeight: 150 },
  text: { minWidth: 120, minHeight: 80 },
  note: { minWidth: 120, minHeight: 80 },
  todo: { minWidth: 160, minHeight: 100 },
  link: { minWidth: 240, minHeight: 0 },
  table: { minWidth: 200, minHeight: 0 },
  document: { minWidth: 180, minHeight: 220 },
  clipart: { minWidth: 100, minHeight: 100 },
};

export function getPostResizeConstraints(post: Pick<Padlet, 'type' | 'metadata'>): PostResizeConstraints | null {
  if (post.type === 'card') {
    return isDocumentPost(post) ? POST_RESIZE_CONSTRAINTS.document : POST_RESIZE_CONSTRAINTS.clipart;
  }
  return POST_RESIZE_CONSTRAINTS[post.type] ?? null;
}

/**
 * True when BOTH canonical dimensions are finite positive numbers.
 *
 * This is a PURE GEOMETRY-VALIDITY CHECK ONLY -- it says nothing about
 * whether a post's stored width/height were ever intentionally set by a
 * resize gesture. Historically posts were created with generic stored
 * geometry (e.g. 300x200, 280x350, 300x400 template defaults) that the
 * legacy fixed/natural renderers never consumed, so finite-positive alone
 * CANNOT be treated as proof of intentional sizing. Use
 * `isManuallySizedPost` for the actual compatibility condition.
 */
export function hasValidPostResizeGeometry(width: unknown, height: unknown): boolean {
  return Number.isFinite(Number(width)) && Number(width) > 0
    && Number.isFinite(Number(height)) && Number(height) > 0;
}

/**
 * PATCH POST-RESIZE-B1.1/B2: the ONE shared marker-gated compatibility
 * condition. True only when the post carries `metadata.manualSize === true`
 * AND its stored width/height are valid geometry. `manualSize` alone (without
 * valid geometry) or valid geometry alone (without `manualSize`) both mean
 * "render the legacy presentation."
 *
 * Used by the Freeform renderer and the minimap fallback for every type whose
 * pre-resize renderer ignored canonical geometry (image, text/note, todo,
 * link, table) -- never re-derive the condition separately, so the two can
 * never disagree about which posts have been explicitly resized.
 */
export function isManuallySizedPost(post: Pick<Padlet, 'width' | 'height' | 'metadata'>): boolean {
  return (post.metadata as { manualSize?: boolean } | undefined)?.manualSize === true
    && hasValidPostResizeGeometry(post.width, post.height);
}

/** Image keeps its dedicated name (PATCH POST-RESIZE-B1.1); same condition. */
export function isImageManuallySized(post: Pick<Padlet, 'width' | 'height' | 'metadata'>): boolean {
  return isManuallySizedPost(post);
}

/**
 * PATCH POST-RESIZE-B2: the shared "effective manual geometry" for
 * marker-gated types. Returns canonical width/height clamped to the type's
 * policy minimum when the post was explicitly resized, else null (legacy
 * presentation). The renderer and minimap fallback both call this, so a
 * manual post renders and maps at the same size.
 */
export function getManualResizeDimensions(
  post: Pick<Padlet, 'type' | 'width' | 'height' | 'metadata'>
): { width: number; height: number } | null {
  if (!isManuallySizedPost(post)) return null;
  const constraints = getPostResizeConstraints(post);
  return {
    width: Math.max(Number(post.width), constraints?.minWidth ?? 0),
    height: Math.max(Number(post.height), constraints?.minHeight ?? 0),
  };
}
