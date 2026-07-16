export function sanitizeClonedPostMetadata<T extends Record<string, unknown>>(
  metadata: T
): Omit<T, "parentId" | "childPadletIds" | "sectionId" | "sectionPosition" | "position_in_timeline" | "wallPosition">;
export function sanitizeClonedPostMetadata<T extends Record<string, unknown>>(
  metadata: T | undefined
): Omit<T, "parentId" | "childPadletIds" | "sectionId" | "sectionPosition" | "position_in_timeline" | "wallPosition"> | undefined;
export function sanitizeClonedPostMetadata<T extends Record<string, unknown>>(
  metadata: T | null
): Omit<T, "parentId" | "childPadletIds" | "sectionId" | "sectionPosition" | "position_in_timeline" | "wallPosition"> | null;
export function sanitizeClonedPostMetadata<T extends Record<string, unknown>>(metadata: T | null | undefined) {
  if (metadata == null) return metadata;

  const {
    parentId,
    childPadletIds,
    sectionId,
    sectionPosition,
    position_in_timeline,
    wallPosition,
    ...sanitizedMetadata
  } = metadata;

  void parentId;
  void childPadletIds;
  void sectionId;
  void sectionPosition;
  void position_in_timeline;
  void wallPosition;

  return sanitizedMetadata;
}
