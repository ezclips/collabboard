/**
 * PATCH-227 -- which on-screen box a graph line should attach to.
 *
 * Holds the existing comment/child-rect fallbacks and adds two rules:
 *   1. a `[data-graph-anchor="visual"]` descendant (e.g. a frameless drawing's
 *      image) wins, so the line meets the drawing rather than the invisible
 *      card box around it;
 *   2. otherwise a visible `[data-graph-anchor-exclude="true"]` descendant
 *      whose top sits inside the rect (e.g. the selection-only Reactions Row)
 *      cuts the rect's bottom there, so selecting a post never moves its lines.
 *
 * Pure with respect to the DOM: returns screen-pixel geometry + whether the
 * visual anchor was used (the caller chooses its per-end gap from that).
 */
import type { Padlet } from '@/types/collabboard';

export interface AnchorRect {
  left: number;
  top: number;
  width: number;
  height: number;
  usedVisualAnchor: boolean;
}

export function measureAnchorRect(el: HTMLElement, post: Padlet): AnchorRect {
  const rect = el.getBoundingClientRect();

  const commentRoot = el.querySelector('[data-comment-post-root="true"]') as HTMLElement | null;
  const commentRect = commentRoot?.getBoundingClientRect() ?? null;
  // Fallback: if the data-padlet-id wrapper collapsed (e.g. card posts with
  // absolute-positioned children), measure the first child element instead so
  // the arrow targets the visible card.
  const childRect = (el.firstElementChild as HTMLElement | null)?.getBoundingClientRect() ?? null;

  const base =
    (post.type === 'comment' || (post.type as string) === 'Comment') && commentRect
      ? commentRect
      : childRect && childRect.width > rect.width + 8 && childRect.height > rect.height + 8
        ? childRect
        : rect.width < 1 || rect.height < 1
          ? (childRect ?? rect)
          : rect;

  const visualEl = el.querySelector('[data-graph-anchor="visual"]') as HTMLElement | null;
  const visualRect = visualEl?.getBoundingClientRect() ?? null;
  if (visualRect && (visualRect.width > 0 || visualRect.height > 0)) {
    return {
      left: visualRect.left,
      top: visualRect.top,
      width: visualRect.width,
      height: visualRect.height,
      usedVisualAnchor: true,
    };
  }

  const excludeEl = el.querySelector('[data-graph-anchor-exclude="true"]') as HTMLElement | null;
  const excludeRect = excludeEl?.getBoundingClientRect() ?? null;
  if (
    excludeRect &&
    excludeRect.height > 0 &&
    excludeRect.top > base.top &&
    excludeRect.top < base.top + base.height
  ) {
    return {
      left: base.left,
      top: base.top,
      width: base.width,
      height: excludeRect.top - base.top,
      usedVisualAnchor: false,
    };
  }

  return {
    left: base.left,
    top: base.top,
    width: base.width,
    height: base.height,
    usedVisualAnchor: false,
  };
}
