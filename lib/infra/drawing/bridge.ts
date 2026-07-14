import {
  extractPadletIdFromEmbeddableLink,
  isDrawingContainerPadlet,
} from "./importScene";

export type BridgePadletLike = {
  id: string;
  type?: string | null;
  position_x?: number | null;
  position_y?: number | null;
  metadata?: Record<string, unknown> | null;
};

export type BridgeSceneElementLike = {
  id: string;
  type?: string | null;
  link?: string | null;
  frameId?: string | null;
  isDeleted?: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
};

export type BridgeSlideFrameLike = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ContainerMembership = {
  orderedChildIds: string[];
  staleChildIds: string[];
  unlinkedChildIds: string[];
  linkedOnlyChildIds: string[];
  hasMirrorMismatch: boolean;
};

export type BridgeViolationCode =
  | "duplicate-embeddable-link"
  | "embeddable-links-missing-padlet"
  | "child-padlet-has-embeddable"
  | "root-padlet-missing-embeddable"
  | "membership-mirror-mismatch"
  | "embeddable-frame-dangling";

export type BridgeViolation = {
  code: BridgeViolationCode;
  padletId?: string;
  elementIds: string[];
  detail: string;
};

export type BridgeSummaryRow = {
  padletId: string;
  parentId: string | null;
  childPadletIds: string[];
  embeddableIds: string[];
  embeddableId: string | null;
  embeddableLink: string | null;
  frameId: string | null;
  sceneIndex: number | null;
  elementType: string | null;
  hasDuplicateLink: boolean;
  hasMembershipMismatch: boolean;
  slideInclusion: "included" | "excluded" | "unknown";
};

export type DrawingBridgeSummary = {
  rows: BridgeSummaryRow[];
  orphanEmbeddables: Array<{ elementId: string; link: string; sceneIndex: number }>;
};

const getParentId = (padlet: BridgePadletLike) => {
  const parentId = padlet.metadata?.parentId;
  return typeof parentId === "string" ? parentId : null;
};

const getChildPadletIds = (padlet: BridgePadletLike) => {
  const childPadletIds = padlet.metadata?.childPadletIds;
  return Array.isArray(childPadletIds)
    ? childPadletIds.filter((id): id is string => typeof id === "string")
    : [];
};

const isActive = (element: BridgeSceneElementLike) => !element.isDeleted;

const getLinkedPadletId = (element: BridgeSceneElementLike) =>
  extractPadletIdFromEmbeddableLink(element.link);

const isActiveAppEmbeddable = (element: BridgeSceneElementLike) =>
  isActive(element) && element.type === "embeddable" && getLinkedPadletId(element) !== null;

export const resolveContainerMembership = (
  container: BridgePadletLike,
  allPadlets: readonly BridgePadletLike[],
): ContainerMembership => {
  const padletsById = new Map(allPadlets.map((padlet) => [padlet.id, padlet] as const));
  const orderedChildIds: string[] = [];
  const staleChildIds: string[] = [];
  const unlinkedChildIds: string[] = [];
  const seen = new Set<string>();

  for (const childId of getChildPadletIds(container)) {
    const child = padletsById.get(childId);
    if (!child) {
      staleChildIds.push(childId);
      continue;
    }
    if (!seen.has(childId)) {
      orderedChildIds.push(childId);
      seen.add(childId);
    }
    if (getParentId(child) !== container.id) {
      unlinkedChildIds.push(childId);
    }
  }

  const linkedOnlyChildIds: string[] = [];
  for (const padlet of allPadlets) {
    if (getParentId(padlet) !== container.id || seen.has(padlet.id)) continue;
    orderedChildIds.push(padlet.id);
    linkedOnlyChildIds.push(padlet.id);
    seen.add(padlet.id);
  }

  return {
    orderedChildIds,
    staleChildIds,
    unlinkedChildIds,
    linkedOnlyChildIds,
    hasMirrorMismatch: staleChildIds.length > 0 || unlinkedChildIds.length > 0 || linkedOnlyChildIds.length > 0,
  };
};

export const findAppEmbeddablesForPadlet = (
  elements: readonly BridgeSceneElementLike[],
  padletId: string,
) => elements.filter((element) =>
  isActive(element) && element.type === "embeddable" && getLinkedPadletId(element) === padletId
);

export const findAppEmbeddableForPadlet = (
  elements: readonly BridgeSceneElementLike[],
  padletId: string,
) => findAppEmbeddablesForPadlet(elements, padletId)[0] ?? null;

export const collectDuplicateEmbeddableLinks = (elements: readonly BridgeSceneElementLike[]) => {
  const byPadletId = new Map<string, string[]>();
  for (const element of elements) {
    if (!isActive(element) || element.type !== "embeddable") continue;
    const padletId = getLinkedPadletId(element);
    if (!padletId) continue;
    byPadletId.set(padletId, [...(byPadletId.get(padletId) ?? []), element.id]);
  }

  return [...byPadletId.entries()]
    .filter(([, elementIds]) => elementIds.length > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([padletId, elementIds]) => ({ padletId, elementIds }));
};

export const characterizeFrameOrdering = (elements: readonly BridgeSceneElementLike[]) =>
  elements
    .map((element, sceneIndex) => ({ element, sceneIndex }))
    .filter(({ element }) => isActive(element) && element.type === "frame")
    .map(({ element, sceneIndex }) => ({
      frameId: element.id,
      sceneIndex,
      memberIdsInSceneOrder: elements
        .filter((candidate) => isActive(candidate) && candidate.frameId === element.id)
        .map((candidate) => candidate.id),
    }));

export const isEmbeddableInSlideFrame = (
  element: BridgeSceneElementLike,
  frame: BridgeSlideFrameLike,
) => {
  if (element.frameId) return element.frameId === frame.id;
  const elementX = element.x ?? 0;
  const elementY = element.y ?? 0;
  const elementRight = elementX + (element.width ?? 0);
  const elementBottom = elementY + (element.height ?? 0);
  return (
    elementX < frame.x + frame.width &&
    elementRight > frame.x &&
    elementY < frame.y + frame.height &&
    elementBottom > frame.y
  );
};

const sortViolations = (violations: BridgeViolation[]) =>
  [...violations].sort((left, right) =>
    left.code.localeCompare(right.code) ||
    (left.padletId ?? "").localeCompare(right.padletId ?? "") ||
    (left.elementIds[0] ?? "").localeCompare(right.elementIds[0] ?? "")
  );

export const validateDrawingBridgeSnapshot = (input: {
  elements: readonly BridgeSceneElementLike[];
  padlets: readonly BridgePadletLike[];
}) => {
  const { elements, padlets } = input;
  const padletsById = new Map(padlets.map((padlet) => [padlet.id, padlet] as const));
  const activeFrameIds = new Set(
    elements.filter((element) => isActive(element) && element.type === "frame").map((element) => element.id),
  );
  const violations: BridgeViolation[] = [];

  for (const duplicate of collectDuplicateEmbeddableLinks(elements)) {
    violations.push({
      code: "duplicate-embeddable-link",
      padletId: duplicate.padletId,
      elementIds: duplicate.elementIds,
      detail: `Multiple active embeddables link to padlet ${duplicate.padletId}.`,
    });
  }

  for (const element of elements) {
    if (!isActiveAppEmbeddable(element)) continue;
    const padletId = getLinkedPadletId(element)!;
    if (!padletsById.has(padletId)) {
      violations.push({
        code: "embeddable-links-missing-padlet",
        padletId,
        elementIds: [element.id],
        detail: `Embeddable ${element.id} links to a missing padlet.`,
      });
    }
    if (element.frameId && !activeFrameIds.has(element.frameId)) {
      violations.push({
        code: "embeddable-frame-dangling",
        padletId,
        elementIds: [element.id],
        detail: `Embeddable ${element.id} references missing frame ${element.frameId}.`,
      });
    }
  }

  for (const padlet of padlets) {
    const embeddables = findAppEmbeddablesForPadlet(elements, padlet.id);
    if (getParentId(padlet) && embeddables.length > 0) {
      violations.push({
        code: "child-padlet-has-embeddable",
        padletId: padlet.id,
        elementIds: embeddables.map((element) => element.id),
        detail: `Child padlet ${padlet.id} still has active embeddables.`,
      });
    }
    if (padlet.type !== "drawing" && !getParentId(padlet) && embeddables.length === 0) {
      violations.push({
        code: "root-padlet-missing-embeddable",
        padletId: padlet.id,
        elementIds: [],
        detail: `Root padlet ${padlet.id} has no active embeddable.`,
      });
    }
    if (isDrawingContainerPadlet(padlet) && resolveContainerMembership(padlet, padlets).hasMirrorMismatch) {
      violations.push({
        code: "membership-mirror-mismatch",
        padletId: padlet.id,
        elementIds: embeddables.map((element) => element.id),
        detail: `Container padlet ${padlet.id} has divergent childPadletIds and parentId membership.`,
      });
    }
  }

  const sorted = sortViolations(violations);
  return { ok: sorted.length === 0, violations: sorted };
};

export const summarizeDrawingBridgeSnapshot = (input: {
  elements: readonly BridgeSceneElementLike[];
  padlets: readonly BridgePadletLike[];
  slideFrame?: BridgeSlideFrameLike;
}): DrawingBridgeSummary => {
  const { elements, padlets, slideFrame } = input;
  const duplicates = new Set(collectDuplicateEmbeddableLinks(elements).map((entry) => entry.padletId));
  const padletsById = new Set(padlets.map((padlet) => padlet.id));

  const rows = [...padlets]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map<BridgeSummaryRow>((padlet) => {
      const embeddables = findAppEmbeddablesForPadlet(elements, padlet.id);
      const embeddable = embeddables[0] ?? null;
      const sceneIndex = embeddable ? elements.indexOf(embeddable) : null;
      const membership = resolveContainerMembership(padlet, padlets);
      return {
        padletId: padlet.id,
        parentId: getParentId(padlet),
        childPadletIds: getChildPadletIds(padlet),
        embeddableIds: embeddables.map((element) => element.id),
        embeddableId: embeddable?.id ?? null,
        embeddableLink: typeof embeddable?.link === "string" ? embeddable.link : null,
        frameId: embeddable?.frameId ?? null,
        sceneIndex,
        elementType: embeddable?.type ?? null,
        hasDuplicateLink: duplicates.has(padlet.id),
        hasMembershipMismatch: membership.hasMirrorMismatch,
        slideInclusion: !slideFrame || !embeddable
          ? "unknown"
          : isEmbeddableInSlideFrame(embeddable, slideFrame) ? "included" : "excluded",
      };
    });

  const orphanEmbeddables = elements
    .map((element, sceneIndex) => ({ element, sceneIndex }))
    .filter(({ element }) => isActiveAppEmbeddable(element) && !padletsById.has(getLinkedPadletId(element)!))
    .map(({ element, sceneIndex }) => ({
      elementId: element.id,
      link: element.link!,
      sceneIndex,
    }));

  return { rows, orphanEmbeddables };
};
