/**
 * PATCH 9V.2C -- the single responsive placement contract for menus that open
 * off the left vertical toolbar.
 *
 * The problem this exists to prevent: Radix measures `sideOffset` from the
 * TRIGGER, but the More trigger sits INSIDE the toolbar. With the default
 * offset the panel's left edge landed at trigger.right + 4 = 50px while the
 * toolbar's own right edge is at 56px, so the panel covered the application's
 * main toolbar by 6px at every narrow width (a measured 2250-2664px^2
 * intersection). The toolbar is an exclusion zone, so the offset has to span
 * from the trigger to the toolbar's right edge, then add the visual gap.
 *
 * Everything here is derived from LIVE rects passed in by the caller -- never
 * from a cached viewport width, a breakpoint flag, or a duplicated magic
 * toolbar width. That is what makes narrow->wide and wide->narrow resolve
 * correctly without a remount (no F5).
 */

/** Visual breathing room between the toolbar's right edge and the panel. */
export const TOOLBAR_MENU_GAP_PX = 8;

/** Keeps a tall panel clear of the viewport edges when Radix shifts it. */
export const TOOLBAR_MENU_COLLISION_PADDING_PX = 8;

/**
 * Offset, in px, to hand Radix as `sideOffset` for a right-opening panel whose
 * trigger lives inside the toolbar.
 *
 * Returns at least the gap, so a caller that cannot measure the toolbar (or
 * measures it as narrower than the trigger) still gets sane spacing rather
 * than a negative offset that would pull the panel leftwards.
 */
export function computeToolbarMenuSideOffset(
  toolbarRight: number,
  triggerRight: number,
  gap: number = TOOLBAR_MENU_GAP_PX,
): number {
  if (!Number.isFinite(toolbarRight) || !Number.isFinite(triggerRight)) return gap;
  return Math.max(gap, toolbarRight - triggerRight + gap);
}

/**
 * The invariant every automated and browser check asserts: a right-opening
 * panel begins at or after the toolbar's right edge, so their intersection
 * area is exactly zero.
 */
export function resolveToolbarMenuLeft(triggerRight: number, sideOffset: number): number {
  return triggerRight + sideOffset;
}
