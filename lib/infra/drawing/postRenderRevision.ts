import type { Padlet } from "@/types/collabboard";
import { buildPadletRenderState } from "@/components/presentation/slide-renderer/getSlideRenderSignature";

// Matches the bounded child-recursion depth getSlideRenderSignature already uses
// when calling buildPadletRenderState for its embeddableOverlaySignature.
const RENDER_STATE_MAX_DEPTH = 2;

function stableDigest(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/**
 * A deterministic revision over the current padlets' canonical render state
 * (PATCH-128). Reuses buildPadletRenderState -- the same field list
 * getSlideRenderSignature already consumes -- rather than duplicating it.
 *
 * Deterministic: independent of array/object identity, and of top-level
 * ordering (padlets are sorted by stable ID before hashing). Changes only
 * when a padlet's visible render-relevant state changes.
 */
export function computePostRenderRevision(padlets: readonly Padlet[]): string {
  const padletsById = new Map(padlets.map((padlet) => [String(padlet.id), padlet] as const));
  const sortedPadlets = [...padlets].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const renderStates = sortedPadlets.map((padlet) =>
    buildPadletRenderState(padlet, padletsById, RENDER_STATE_MAX_DEPTH, new Set<string>()),
  );
  return stableDigest(JSON.stringify(renderStates));
}
