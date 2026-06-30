"use client";

import type { Padlet } from "@/types/collabboard";

export function resolveRuntimeContainerChildren(container: Padlet, allPadlets: Padlet[]): Padlet[] {
  const childPadletIds: string[] = Array.isArray(container.metadata?.childPadletIds)
    ? container.metadata.childPadletIds
    : [];

  const padletsById = new Map(allPadlets.map((padlet) => [padlet.id, padlet] as const));
  const listedSet = new Set<string>();
  const listed: Padlet[] = [];

  for (const childId of childPadletIds) {
    if (listedSet.has(childId)) continue;
    const found = padletsById.get(childId);
    if (!found) continue;
    listed.push(found);
    listedSet.add(childId);
  }

  const extras = allPadlets
    .filter((candidate) => candidate.metadata?.parentId === container.id && !listedSet.has(candidate.id))
    .sort((a, b) => {
      const ai = Number(a.metadata?.containerIndex ?? Infinity);
      const bi = Number(b.metadata?.containerIndex ?? Infinity);
      if (ai !== bi) return ai - bi;
      const ad = a.created_at ?? "";
      const bd = b.created_at ?? "";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.id ?? "") < (b.id ?? "") ? -1 : 1;
    });

  return [...listed, ...extras];
}
