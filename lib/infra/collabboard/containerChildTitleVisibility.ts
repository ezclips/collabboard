// PATCH 9C.1 -- Container child-post title visibility is a per-child
// preference on the RELATIONSHIP (this Container -> this child), not a
// global on/off switch and not a property of the child itself (the same
// post moved to a different Container must not carry another Container's
// presentation choice with it -- see RowColumnContainerCard/PostCardContent,
// which never read/write this off `child.metadata`).
//
// PATCH 9C shipped a global `metadata.showChildPostTitles: boolean` on the
// Container. Once an explicit `visibleChildPostTitleIds` list exists for a
// Container, that list is the sole source of truth and the legacy boolean is
// inert for it. Before any explicit list exists, the legacy boolean is
// honored live (exactly as PATCH 9C behaved: every child that currently has
// a real title is shown) so a Container already showing titles under 9C
// doesn't visually reset the moment 9C.1 ships.

export interface ChildTitleVisibilityPadlet {
  id: string;
  title?: unknown;
}

export interface ContainerTitleVisibilityMetadata {
  visibleChildPostTitleIds?: unknown;
  showChildPostTitles?: unknown;
}

function hasRealTitle(child: ChildTitleVisibilityPadlet): boolean {
  return typeof child.title === "string" && child.title.trim().length > 0;
}

/**
 * The effective set of child IDs whose titles should render for this
 * Container, right now. Pure and live -- never itself persisted.
 */
export function getEffectiveVisibleChildTitleIds(
  containerMetadata: ContainerTitleVisibilityMetadata | null | undefined,
  children: ChildTitleVisibilityPadlet[],
): Set<string> {
  const explicitList = containerMetadata?.visibleChildPostTitleIds;
  if (Array.isArray(explicitList)) {
    return new Set(explicitList.filter((id): id is string => typeof id === "string"));
  }
  if (containerMetadata?.showChildPostTitles === true) {
    return new Set(children.filter(hasRealTitle).map((child) => child.id));
  }
  return new Set();
}

/**
 * The on-canvas title to render for this child in this Container, or null
 * if nothing should render -- true only when BOTH the child is enabled for
 * this Container AND it has an actual (non-blank) title. Never falls back to
 * a type-name label; that fallback exists only for menu identification (see
 * lib/infra/collabboard/containerEditTargetLabel.ts), never for on-canvas
 * rendering.
 */
export function resolveVisibleChildTitle(
  visibleIds: Set<string>,
  child: ChildTitleVisibilityPadlet,
): string | null {
  if (!visibleIds.has(child.id)) return null;
  const title = typeof child.title === "string" ? child.title.trim() : "";
  return title || null;
}

/**
 * Materializes the effective state into an explicit list with `childId`'s
 * membership flipped. This is the "first per-child toggle" moment: from here
 * on, `getEffectiveVisibleChildTitleIds` reads the explicit list and the
 * legacy boolean is retired for this Container (callers should also persist
 * `showChildPostTitles: false` alongside this list so no inert `true` value
 * lingers in metadata).
 */
export function toggleChildPostTitleVisibility(
  containerMetadata: ContainerTitleVisibilityMetadata | null | undefined,
  children: ChildTitleVisibilityPadlet[],
  childId: string,
): string[] {
  const next = new Set(getEffectiveVisibleChildTitleIds(containerMetadata, children));
  if (next.has(childId)) {
    next.delete(childId);
  } else {
    next.add(childId);
  }
  return Array.from(next);
}
