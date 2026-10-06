import type { WorldRect } from '@/lib/domain/canvas/freeformFreeSpot';

/**
 * PATCH-304 addendum. Reads the freeform board's DOM for the two inputs the
 * pure placement policy needs: the visible area (cut short where an open Board
 * AI panel begins) and the rects already occupied by posts. DOM only, no React.
 */

type ToWorld = (clientX: number, clientY: number) => { x: number; y: number };

const RIGHT_PANEL_SELECTOR =
  '[data-board-ai-chat], [data-knowledge-reader-presentation="side-panel"]';

export function readFreeformVisibleArea(container: HTMLElement, toWorld: ToWorld): WorldRect {
  const containerRect = container.getBoundingClientRect();
  let right = containerRect.right;

  container.ownerDocument.querySelectorAll<HTMLElement>(RIGHT_PANEL_SELECTOR).forEach((panel) => {
    const panelRect = panel.getBoundingClientRect();
    if (
      panelRect.width > 0 &&
      panelRect.left > containerRect.left &&
      panelRect.left < containerRect.right
    ) {
      right = Math.min(right, panelRect.left);
    }
  });

  const topLeft = toWorld(containerRect.left, containerRect.top);
  const bottomRight = toWorld(right, containerRect.bottom);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  };
}

export function readFreeformOccupiedRects(container: HTMLElement, toWorld: ToWorld): WorldRect[] {
  const containerRect = container.getBoundingClientRect();
  const rects: WorldRect[] = [];

  container.querySelectorAll<HTMLElement>('[data-padlet-id]').forEach((node) => {
    const rect = node.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (
      rect.right <= containerRect.left ||
      rect.left >= containerRect.right ||
      rect.bottom <= containerRect.top ||
      rect.top >= containerRect.bottom
    ) {
      return;
    }
    const topLeft = toWorld(rect.left, rect.top);
    const bottomRight = toWorld(rect.right, rect.bottom);
    rects.push({
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    });
  });

  return rects;
}
