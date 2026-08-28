import type { SourceReferenceId } from '../core/ids';
import type { SourceReference } from './knowledgePersistence';
import { normalizeStorableRegion } from './knowledgePageRegionGeometry';

/**
 * P6J-F9-C2 -- presentational eligibility only, mirroring the PAGE_REGION
 * shape the C1 route independently re-validates server-side. This is NOT a
 * security authority: it exists only so a card does not request a crop that
 * cannot possibly succeed. C1 repeats every one of these checks itself.
 */

export interface KnowledgeSourceCardRegionCrop {
  readonly referenceId: SourceReferenceId;
}

export function getKnowledgeSourceCardRegionCrop(
  references: readonly SourceReference[],
): KnowledgeSourceCardRegionCrop | null {
  if (references.length !== 1) return null;
  const [reference] = references;
  if (reference.quoteText !== null) return null;
  if (reference.charStart !== null || reference.charEnd !== null) return null;
  if (!Number.isInteger(reference.pageStart) || reference.pageStart < 1) return null;
  if (reference.pageStart !== reference.pageEnd) return null;
  if (normalizeStorableRegion(reference.region) === null) return null;
  return { referenceId: reference.id };
}
