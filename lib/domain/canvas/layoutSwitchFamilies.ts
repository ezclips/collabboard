/**
 * PATCH-376. Which layout switches are SAFE.
 *
 * Switching a board's layout only ever rewrites `boards.layout` -- but WHERE its
 * posts live is not the same across layouts. A Columns/Grid post belongs to a
 * `board_sections` row (`metadata.sectionId`); a Wall/Timeline post is a child of
 * a root container (`metadata.childPadletIds`). The comment this replaces said
 * "switching into any of these layouts only ever touches boards.layout -- safe",
 * and a live probe proved it wrong: Columns/Grid -> Wall/Timeline showed NO posts
 * and no sections, and Wall -> Columns showed no cards, with the data intact
 * underneath and visible again on switching back.
 *
 * So the four switchable layouts are grouped into two families, and a switch is
 * offered only within one. Until PATCH-377 converts the posts between them,
 * cross-family tiles are shown disabled rather than hidden -- a missing tile
 * reads as a bug, a disabled one with a reason reads as a plan.
 */

export type LayoutFamily = 'sections' | 'containers';

/** The two families and their layouts. The ONE place this grouping is written. */
export const LAYOUT_FAMILIES: Readonly<Record<LayoutFamily, readonly string[]>> = {
  sections: ['columns', 'grid'],
  containers: ['wall', 'timeline'],
};

/** The family a layout's posts are organised by, or null for a layout with none. */
export function layoutFamily(layout: string | null | undefined): LayoutFamily | null {
  if (!layout) return null;
  if (LAYOUT_FAMILIES.sections.includes(layout)) return 'sections';
  if (LAYOUT_FAMILIES.containers.includes(layout)) return 'containers';
  return null;
}

/**
 * True when `to` is a layout this board may switch to from `from`. Same family
 * only, and an unknown layout on either side is never a switch.
 */
export function canSwitchLayout(
  from: string | null | undefined,
  to: string | null | undefined,
): boolean {
  const fromFamily = layoutFamily(from);
  return fromFamily !== null && fromFamily === layoutFamily(to);
}

/** The one line under the layout row when a family is disabled. */
export const CROSS_FAMILY_NOTE =
  "Switching between Wall/Timeline and Columns/Grid isn't available yet — your posts are organised differently.";
