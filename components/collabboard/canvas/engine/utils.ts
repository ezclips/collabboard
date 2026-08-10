/**
 * Pure utility helpers for the canvas.
 * No React, no state, no Supabase, no DOM.
 */

import type { Padlet } from '@/types/collabboard';

export const isStripVisible = (color?: string): boolean => {
  return !!color && color !== 'transparent';
};

export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function sanitizeLibraryMetadata(meta?: Record<string, any>) {
  if (!meta) return {};
  const next = { ...meta };
  delete next.parentId;
  delete next.childPadletIds;
  delete next.sectionId;
  delete next.sectionPosition;
  delete next.position_in_timeline;
  delete next.wallPosition;
  return next;
}

export function isContainerPadlet(p: Padlet): boolean {
  const meta = p.metadata as any;
  return p.type === 'container' || meta?.kind === 'container' || meta?.isContainer === true;
}

export interface CanvasRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Which root container (if any) overlaps a given canvas-space rectangle,
 * using each container's real width/height. Shared by the live drag-over
 * indicator and the actual drop handler in useCanvasInteractions so they
 * always agree on the same target -- a hover highlight that doesn't match
 * where the drop actually lands would be worse than no highlight at all.
 *
 * Keyed off the dragged post's own rectangle touching the container, not
 * the mouse cursor position: the cursor can sit anywhere within (or even
 * outside, mid-fling) the card being dragged, so a large card's edge can
 * already be over the container while the point the user grabbed it by
 * still isn't.
 */
export function findContainerOverlappingRect(
  padlets: Padlet[],
  rect: CanvasRect,
  excludePadletId: string,
): Padlet | null {
  const containers = padlets.filter(
    (p) => isContainerPadlet(p) && p.id !== excludePadletId && !(p.metadata as any)?.parentId
  );

  for (const container of containers) {
    const left = container.position_x || 0;
    const top = container.position_y || 0;
    const width = container.width || 280;
    const height = container.height || 200;

    const overlaps =
      rect.x < left + width &&
      rect.x + rect.width > left &&
      rect.y < top + height &&
      rect.y + rect.height > top;

    if (overlaps) {
      return container;
    }
  }

  return null;
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

export function htmlToText(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}
