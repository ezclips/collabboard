export const MAX_DRAWING_IMPORT_BYTES = 25 * 1024 * 1024;

export type ImportedDrawingScene = {
  type: "excalidraw";
  version?: number;
  source?: string;
  elements: unknown[];
  appState: Record<string, unknown>;
  files: Record<string, unknown>;
};

type DrawingOverlayPadletLike = {
  id: string;
  type?: string | null;
  metadata?: Record<string, unknown> | null;
};

type DrawingSceneElementLike = {
  id?: string;
  type?: string | null;
  link?: string | null;
  isDeleted?: boolean;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const DRAWING_CAPTURE_UPDATE = {
  IMMEDIATELY: "IMMEDIATELY",
  EVENTUALLY: "EVENTUALLY",
} as const;

export const getDrawingCaptureUpdate = (commitToHistory = true) =>
  commitToHistory
    ? DRAWING_CAPTURE_UPDATE.IMMEDIATELY
    : DRAWING_CAPTURE_UPDATE.EVENTUALLY;

export const buildDrawingSceneUpdate = ({
  elements,
  appState,
  commitToHistory = true,
}: {
  elements: unknown[];
  appState?: unknown;
  commitToHistory?: boolean;
}) => ({
  elements,
  ...(appState !== undefined ? { appState } : {}),
  captureUpdate: getDrawingCaptureUpdate(commitToHistory),
});

export const isDrawingContainerPadlet = (padlet: DrawingOverlayPadletLike) => {
  const metadata = padlet.metadata ?? {};
  const childPadletIds = metadata.childPadletIds;
  return (
    padlet.type === "container" ||
    metadata.kind === "container" ||
    metadata.isContainer === true ||
    (Array.isArray(childPadletIds) && childPadletIds.length > 0)
  );
};

export const extractPadletIdFromEmbeddableLink = (link: unknown) => {
  if (typeof link !== "string" || !link.startsWith("padlet://")) {
    return null;
  }
  const padletId = link.slice("padlet://".length).trim();
  return padletId.length > 0 ? padletId : null;
};

const cloneValue = <T>(value: T): T => {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const getSceneBounds = (elements: any[]) => {
  const active = elements.filter((element) => !element?.isDeleted);
  if (active.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const element of active) {
    const x = typeof element?.x === "number" ? element.x : 0;
    const y = typeof element?.y === "number" ? element.y : 0;
    const width = typeof element?.width === "number" ? element.width : 0;
    const height = typeof element?.height === "number" ? element.height : 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  return { minX, minY, maxX, maxY };
};

export const collectDrawingOverlayDeletionIds = (
  padlets: DrawingOverlayPadletLike[],
  rootIds: string[],
) => {
  const rootIdSet = new Set(rootIds.map(String));
  const queue = [...rootIdSet];
  const affected = new Set<string>();

  while (queue.length > 0) {
    const nextId = queue.shift()!;
    if (affected.has(nextId)) continue;
    affected.add(nextId);

    for (const padlet of padlets) {
      const parentId = padlet.metadata?.parentId;
      if (typeof parentId === "string" && parentId === nextId) {
        queue.push(String(padlet.id));
      }
    }
  }

  return [...affected];
};

export const collectDrawingLinkedContainerDeletionPlan = ({
  elements,
  padlets,
}: {
  elements: DrawingSceneElementLike[];
  padlets: DrawingOverlayPadletLike[];
}) => {
  const linkedPadletIds = new Set(
    elements
      .filter((element) => element.type === "embeddable" && !element.isDeleted)
      .map((element) => extractPadletIdFromEmbeddableLink(element.link))
      .filter((padletId): padletId is string => Boolean(padletId)),
  );

  const rootIds = padlets
    .filter((padlet) => {
      const padletId = String(padlet.id);
      return (
        linkedPadletIds.has(padletId) &&
        !padlet.metadata?.parentId &&
        isDrawingContainerPadlet(padlet)
      );
    })
    .map((padlet) => String(padlet.id));

  return {
    rootIds,
    affectedIds: collectDrawingOverlayDeletionIds(padlets, rootIds),
  };
};

export const shouldAutoCreateDrawingContainer = ({
  isApplyingImportedScene,
  embeddableId,
  createdEmbeddableIds,
}: {
  isApplyingImportedScene: boolean;
  embeddableId: string;
  createdEmbeddableIds: ReadonlySet<string>;
}) => !isApplyingImportedScene && !createdEmbeddableIds.has(embeddableId);

export const prepareImportedSceneForAdd = ({
  elements,
  files,
  viewportCenter,
  placementOffset = { x: 0, y: 0 },
}: {
  elements: any[];
  files: Record<string, any>;
  viewportCenter: { x: number; y: number };
  placementOffset?: { x: number; y: number };
}) => {
  const nextElements = cloneValue(elements);
  const nextFiles = cloneValue(files);
  const elementIdMap = new Map<string, string>();
  const fileIdMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();
  const now = Date.now();

  for (const element of nextElements) {
    if (typeof element?.id === "string") {
      elementIdMap.set(element.id, crypto.randomUUID());
    }
    if (Array.isArray(element?.groupIds)) {
      for (const groupId of element.groupIds) {
        if (typeof groupId === "string" && !groupIdMap.has(groupId)) {
          groupIdMap.set(groupId, crypto.randomUUID());
        }
      }
    }
  }

  for (const fileId of Object.keys(nextFiles)) {
    fileIdMap.set(fileId, crypto.randomUUID());
  }

  const bounds = getSceneBounds(nextElements);
  const importedCenterX = (bounds.minX + bounds.maxX) / 2;
  const importedCenterY = (bounds.minY + bounds.maxY) / 2;
  const offsetX = viewportCenter.x - importedCenterX + placementOffset.x;
  const offsetY = viewportCenter.y - importedCenterY + placementOffset.y;

  for (const element of nextElements) {
    const originalId = element?.id;
    if (typeof originalId === "string") {
      element.id = elementIdMap.get(originalId) ?? originalId;
    }

    if (typeof element?.x === "number") {
      element.x += offsetX;
    }
    if (typeof element?.y === "number") {
      element.y += offsetY;
    }

    if (Array.isArray(element?.groupIds)) {
      element.groupIds = element.groupIds.map((groupId: string) => groupIdMap.get(groupId) ?? groupId);
    }

    if (typeof element?.frameId === "string") {
      element.frameId = elementIdMap.get(element.frameId) ?? null;
    }

    if (typeof element?.containerId === "string") {
      element.containerId = elementIdMap.get(element.containerId) ?? null;
    }

    if (Array.isArray(element?.boundElements)) {
      element.boundElements = element.boundElements.map((binding: any) => ({
        ...binding,
        id: typeof binding?.id === "string" ? elementIdMap.get(binding.id) ?? binding.id : binding?.id,
      }));
    }

    if (element?.startBinding && typeof element.startBinding === "object" && typeof element.startBinding.elementId === "string") {
      element.startBinding = {
        ...element.startBinding,
        elementId: elementIdMap.get(element.startBinding.elementId) ?? element.startBinding.elementId,
      };
    }

    if (element?.endBinding && typeof element.endBinding === "object" && typeof element.endBinding.elementId === "string") {
      element.endBinding = {
        ...element.endBinding,
        elementId: elementIdMap.get(element.endBinding.elementId) ?? element.endBinding.elementId,
      };
    }

    if (typeof element?.fileId === "string") {
      element.fileId = fileIdMap.get(element.fileId) ?? element.fileId;
    }

    element.updated = now;
    element.version = typeof element?.version === "number" ? element.version + 1 : 1;
    element.versionNonce = Math.floor(Math.random() * 1e9);
  }

  const remappedFiles: Record<string, any> = {};
  for (const [fileId, file] of Object.entries(nextFiles)) {
    const nextFileId = fileIdMap.get(fileId) ?? fileId;
    remappedFiles[nextFileId] = {
      ...file,
      id: nextFileId,
    };
  }

  return {
    elements: nextElements,
    files: remappedFiles,
  };
};

export const parseImportedDrawingText = (text: string): ImportedDrawingScene => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The selected file is not valid JSON.");
  }

  if (!isRecord(parsed)) {
    throw new Error("The selected file must contain a top-level JSON object.");
  }

  if (!Array.isArray(parsed.elements)) {
    throw new Error("The selected file must contain an elements array.");
  }

  if (parsed.appState !== undefined && !isRecord(parsed.appState)) {
    throw new Error("The selected file has an invalid appState value.");
  }

  if (parsed.files !== undefined && !isRecord(parsed.files)) {
    throw new Error("The selected file has an invalid files value.");
  }

  if (parsed.type !== undefined && parsed.type !== "excalidraw") {
    throw new Error("The selected file is not an Excalidraw scene export.");
  }

  return {
    type: "excalidraw",
    version: typeof parsed.version === "number" ? parsed.version : 2,
    source: typeof parsed.source === "string" ? parsed.source : undefined,
    elements: parsed.elements,
    appState: isRecord(parsed.appState) ? parsed.appState : {},
    files: isRecord(parsed.files) ? parsed.files : {},
  };
};

export const assertImportFileSize = (sizeInBytes: number) => {
  if (sizeInBytes > MAX_DRAWING_IMPORT_BYTES) {
    throw new Error(`The selected file is too large. Maximum size is ${Math.floor(MAX_DRAWING_IMPORT_BYTES / (1024 * 1024))} MB.`);
  }
};
