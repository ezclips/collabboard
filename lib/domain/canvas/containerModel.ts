import type { ContainerOrientation } from '@/types/collabboard';

export type { ContainerOrientation } from '@/types/collabboard';

type ContainerMetadataLike = {
  childPadletIds?: unknown;
  parentId?: unknown;
  orientation?: unknown;
  [key: string]: unknown;
};

export type ContainerPadletLike = {
  id: string;
  metadata?: ContainerMetadataLike | null;
};

/**
 * Resolves the in-memory orientation only. Missing and malformed legacy data
 * deliberately remains absent from metadata and therefore cannot cause a
 * background persistence write.
 */
export function resolveContainerOrientation(
  metadata: ContainerMetadataLike | null | undefined,
): ContainerOrientation {
  return metadata?.orientation === 'horizontal' ? 'horizontal' : 'vertical';
}

/**
 * childPadletIds is the ordered membership list. A child's parentId is the
 * reconciliation backlink and supplies linked-only legacy children after the
 * canonical ordered list. This function is read-only and never repairs data.
 */
export function resolveContainerChildren<T extends ContainerPadletLike>(
  container: ContainerPadletLike,
  allPadlets: readonly T[],
): T[] {
  const byId = new Map(allPadlets.map((padlet) => [padlet.id, padlet] as const));
  const childIds = Array.isArray(container.metadata?.childPadletIds)
    ? container.metadata.childPadletIds.filter((id): id is string => typeof id === 'string')
    : [];
  const seen = new Set<string>();
  const children: T[] = [];

  for (const childId of childIds) {
    const child = byId.get(childId);
    if (!child || seen.has(child.id)) continue;
    seen.add(child.id);
    children.push(child);
  }

  for (const padlet of allPadlets) {
    if (padlet.metadata?.parentId !== container.id || seen.has(padlet.id)) continue;
    seen.add(padlet.id);
    children.push(padlet);
  }

  return children;
}

export type ContainerAxis = 'x' | 'y';

export type ContainerRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export function getContainerPrimaryAxis(orientation: ContainerOrientation): ContainerAxis {
  return orientation === 'horizontal' ? 'x' : 'y';
}

export function getContainerCrossAxis(orientation: ContainerOrientation): ContainerAxis {
  return orientation === 'horizontal' ? 'y' : 'x';
}

export function getContainerPrimaryCoordinate(
  rect: ContainerRect,
  orientation: ContainerOrientation,
): number {
  return orientation === 'horizontal' ? rect.x : rect.y;
}

export function getContainerPrimarySize(
  rect: ContainerRect,
  orientation: ContainerOrientation,
): number {
  return orientation === 'horizontal' ? rect.width : rect.height;
}

export function getContainerCrossCoordinate(
  rect: ContainerRect,
  orientation: ContainerOrientation,
): number {
  return orientation === 'horizontal' ? rect.y : rect.x;
}

export function getContainerCrossSize(
  rect: ContainerRect,
  orientation: ContainerOrientation,
): number {
  return orientation === 'horizontal' ? rect.height : rect.width;
}
