/**
 * PATCH-226 -- keeps the Graph edge context menu inside the viewport.
 *
 * The menu is now rendered at page level (a portal to `document.body`), so its
 * `fixed` position is relative to the viewport again; this clamp then pulls it
 * back in from any edge. Pure: no DOM, no globals, unit-tested directly.
 */
export function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 8,
): { left: number; top: number } {
  // When the viewport is smaller than the menu, `max` can fall below `margin`;
  // keeping the floor at `margin` is the best that can be done without
  // shrinking the menu -- the helper never returns a position off-screen.
  const maxLeft = Math.max(margin, viewportWidth - menuWidth - margin);
  const maxTop = Math.max(margin, viewportHeight - menuHeight - margin);
  return {
    left: Math.min(Math.max(x, margin), maxLeft),
    top: Math.min(Math.max(y, margin), maxTop),
  };
}
